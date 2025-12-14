import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const TABLE_NAME = process.env.GAME_EVENTS_TABLE_NAME || 'ESN_GameEvents';
const OUTPUT_BUCKET = process.env.PODCAST_OUTPUT_BUCKET;

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const s3 = new S3Client({});

// --- ESN article system prompt template ---
const ESN_RECAP_SYSTEM_TEMPLATE = `
You receive one JSON object called recapInput describing a completed sports game.

Task: Return ONLY a JSON object with this exact shape:

{
  "article": {
    "type": "ESN_RECAP",
    "title": string,
    "dek": string,
    "byline": "Enigma Sports Network",
    "publishedAt": string,
    "body": [string],
    "keyMoments": [string],
    "tags": [string]
  }
}

Core Output Rules (STRICT):
- Output MUST be valid JSON. No extra text, no markdown, no code fences.
- Top-level must contain ONLY the "article" key. Do NOT include "recapInput", "gameId", "status", "body", or any other keys.
- Do NOT echo or reprint recapInput in any form.
- publishedAt must be an ISO-8601 timestamp string. If not provided in recapInput, use "1970-01-01T00:00:00Z".

Length & Structure:
- Total article length must be between 240 and 340 words.
- body must contain 5 to 7 paragraphs.
- Each paragraph should be 1 to 3 sentences.
- Write in a professional, journalistic sports-network tone.
- This is an authoritative recap (what happened and why), not opinion, not predictions.

Title & Dek Rules:
- title: 8 to 12 words (hard cap 12) and must include at least one team name.
- Avoid misleading terms like "late", "early", or "dagger" unless explicitly supported by recapInput.scoringPlays[].quarter and recapInput.scoringPlays[].clock.
- dek: 20 to 32 words summarizing the outcome and the main inflection point, grounded in recapInput (no standings language).

Narrative Rules:
- The first sentence MUST begin with: "In this ESN Recap,"
- The first sentence must include BOTH team names and the final score.
- Use recapInput.quarters as the authoritative scoring timeline (score by quarter / flow of the game).
- Use recapInput.scoringPlays for attribution details: player names, kick distances, descriptions, quarter, and clock.
- If scoringPlays and quarters appear to conflict, trust quarters for scoring flow and trust scoringPlays for attribution details.

Quarter-Lock Rule (Prevents mislabeling plays):
- When referencing any scoring play, the quarter and clock MUST match recapInput.scoringPlays exactly.
- Never claim a scoring play happened in a different quarter than recapInput.scoringPlays[].quarter.

Player Name Usage (REQUIRED):
- If a scoring play description includes a named player, that player MUST be mentioned in the article body at least once.
- First mention: use the player's full name.
- Subsequent mentions: last name only.
- Do not use generic phrases like "another field goal" when a named kicker is available.

Turnover Language Rules (Prevents overclaiming):
- Only say a team "capitalized" on turnovers if recapInput clearly supports a scoring swing immediately following (or you explicitly tie the sentence to a scoring play that followed).
- Otherwise describe turnovers as "disrupting rhythm", "stalling drives", or "short-circuiting chances".

No-Standings / No-Context Rule:
- Do NOT mention standings, rankings, playoffs, season implications, or "moving into a favorable position" unless recapInput explicitly contains season context fields.
- The closing should summarize what the game showed about each team using only recapInput.

Content Requirements:
- Clearly describe:
  1) How the game started
  2) How and when momentum shifted (grounded in quarters/scoring plays)
  3) Why the game remained low-scoring or broke open (grounded in turnovers, stalled drives, punts, or field goals)
  4) How the outcome was sealed (grounded in the final scoring play and late turnover/downs events if present)
  5) What the result represents for both teams (no predictions)

Restrictions:
- Do NOT invent players, stats, injuries, penalties, records, or events.
- Do NOT mention real-world leagues or brands (NFL, NCAA, ESPN, etc.).
- Do NOT speculate beyond what recapInput supports.
- If specific tactical details are missing, speak generally.

Key Moments:
- keyMoments: 4 to 6 items.
- Each item must be 6 to 14 words.
- Each item must correspond to a real scoring play OR a real turnover/downs event from recapInput.turnovers.

Tags:
- tags must include:
  - "EFL"
  - Both team names
  - 1 to 3 topical tags such as "Field Goals", "Defense", "Turnovers", "Low Scoring"
- Only include tags supported by recapInput.

Source of Truth:
- Use recapInput.homeTeam
- recapInput.awayTeam
- recapInput.finalScore
- recapInput.quarters
- recapInput.scoringPlays
- recapInput.turnovers
- recapInput.drives

recapInput:
{{recapInput}}
`;

// --- helpers copied from api_esn_generateRecap (now with safe implementations) ---

// Event timestamp extraction (same as recap)
function getTs(ev) {
  if (!ev) return 0;
  const v = ev.timestamp ?? ev.createdAt;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function mapScoreTypeToPoints(type) {
  if (!type) return 0;
  switch (String(type).toUpperCase()) {
    case 'TD': return 6;
    case 'FG': return 3;
    case 'SAFETY': return 2;
    default: return 0;
  }
}

// Minimal scoring plays extraction – mirrors recap version structurally
function extractScoringPlays(items) {
  const plays = [];
  for (const it of items || []) {
    const baseType = it?.type || '';
    const p = it?.payload ?? {};

    const rawPoints = typeof p.points === 'number' ? p.points : Number(p.points);
    const hasNumericPoints = Number.isFinite(rawPoints);

    if (!(baseType === 'score' || hasNumericPoints)) continue;

    const quarter = Number(p.quarter);
    const team = p.team ?? '';
    if (!Number.isInteger(quarter) || !team) continue;

    const clock = p.gameClock ?? '';
    const subtype = (p.scoreType || p.type || baseType || '').toString().toUpperCase();
    const description = p.description ?? '';
    const points = hasNumericPoints ? rawPoints : mapScoreTypeToPoints(subtype);

    plays.push({
      quarter,
      clock,
      team,
      type: subtype,
      description,
      points,
      ts: getTs(it),
      eventId: it.eventId || it.EventID || null,
      payload: p,
    });
  }
  plays.sort((a, b) => a.ts - b.ts);
  return plays;
}

// Minimal turnovers extraction – mirrors recap logic
function extractTurnovers(items) {
  const outs = [];
  for (const it of items || []) {
    const baseType = it?.type;
    const p = it?.payload ?? {};

    const isTurnoverEvent = baseType === 'turnover';
    const resultStr = typeof p.result === 'string' ? p.result.toLowerCase() : '';
    const isDriveEndTurnover =
      baseType === 'drive_end' &&
      (resultStr.includes('turnover') ||
        resultStr.includes('interception') ||
        resultStr.includes('fumble') ||
        resultStr.includes('downs'));

    if (!isTurnoverEvent && !isDriveEndTurnover) continue;

    const quarter = Number(p.quarter);
    const team = p.team ?? '';
    if (!Number.isInteger(quarter) || !team) continue;

    const kind =
      typeof p.type === 'string' && p.type
        ? p.type
        : isDriveEndTurnover
        ? (resultStr || 'turnover')
        : '';

    outs.push({
      quarter,
      clock: p.gameClock ?? '',
      team,
      type: kind,
      description: p.description ?? '',
      ts: getTs(it),
    });
  }
  outs.sort((a, b) => a.ts - b.ts);
  return outs;
}

function resolveSide(teamValue, homeTeam, awayTeam) {
  if (!teamValue) return null;
  const t = String(teamValue).trim().toLowerCase();
  const homeNorm = String(homeTeam || '').trim().toLowerCase();
  const awayNorm = String(awayTeam || '').trim().toLowerCase();

  if (t === 'home') return 'home';
  if (t === 'away') return 'away';

  if (homeNorm && t === homeNorm) return 'home';
  if (awayNorm && t === awayNorm) return 'away';

  return null;
}

// Sum points by quarter, like recap
function groupPointsByQuarter(scoringPlays, homeTeam, awayTeam) {
  const byQuarter = new Map();
  let maxQ = 4;

  for (const sp of scoringPlays || []) {
    const q = sp.quarter;
    if (!Number.isInteger(q)) continue;
    if (q > maxQ) maxQ = q;

    const side = resolveSide(sp.team, homeTeam, awayTeam);
    if (!side) continue;

    if (!byQuarter.has(q)) {
      byQuarter.set(q, { home: 0, away: 0 });
    }
    const bucket = byQuarter.get(q);
    const pts = Number(sp.points) || 0;
    if (side === 'home') bucket.home += pts;
    if (side === 'away') bucket.away += pts;
  }

  const quarters = [];
  let cumulativeHome = 0;
  let cumulativeAway = 0;

  for (let q = 1; q <= maxQ; q++) {
    const bucket = byQuarter.get(q) || { home: 0, away: 0 };
    cumulativeHome += bucket.home;
    cumulativeAway += bucket.away;

    quarters.push({
      quarter: q,
      homePoints: cumulativeHome,
      awayPoints: cumulativeAway,
    });
  }

  return quarters;
}

// Strip markdown code fences
function stripCodeFences(s) {
  if (typeof s !== 'string') return s;
  let out = s.trim();
  if (out.startsWith('```')) {
    const firstNl = out.indexOf('\n');
    out = firstNl !== -1 ? out.slice(firstNl + 1).trim() : out.slice(3).trim();
  }
  if (out.endsWith('```')) {
    out = out.slice(0, out.lastIndexOf('```')).trim();
  }
  return out;
}

// Simple drive summarizer – defensive, minimal info
function summarizeDrives(items) {
  const drives = [];
  let current = null;

  for (const ev of items || []) {
    if (ev.type === 'drive_start') {
      if (current && current.events.length > 0) drives.push(current);
      current = { startEvent: ev, endEvent: null, events: [] };
      continue;
    }
    if (!current) continue;
    current.events.push(ev);
    if (ev.type === 'drive_end') {
      current.endEvent = ev;
      drives.push(current);
      current = null;
    }
  }
  if (current && current.events.length > 0) drives.push(current);

  return drives.map((d, idx) => {
    const startPayload = d.startEvent?.payload || {};
    const endPayload = d.endEvent?.payload || {};
    const team = startPayload.team || d.events[0]?.payload?.team || 'Unknown';
    const quarter = Number(startPayload.quarter || d.events[0]?.payload?.quarter || NaN);
    const driveNumber = startPayload.driveNumber || endPayload.driveNumber || idx + 1;
    const result = (endPayload.result || '').toString();

    return {
      quarter: Number.isFinite(quarter) ? quarter : undefined,
      team,
      driveNumber,
      result,
    };
  });
}

async function callGeminiForArticle(
  recapInput,
  { model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite' } = {}
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required to call Gemini LLM');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const systemInstruction = {
    parts: [
      {
        text: ESN_RECAP_SYSTEM_TEMPLATE.replace('{{recapInput}}', JSON.stringify(recapInput)),
      },
    ],
  };

  const payload = {
    systemInstruction,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: JSON.stringify(recapInput),
          },
        ],
      },
    ],
  };

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    console.error('callGeminiForArticle: network error', netErr);
    throw netErr;
  }

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = null;
  }

  if (!res.ok) {
    throw new Error(`LLM call failed ${res.status}: ${rawText}`);
  }

  let text = null;
  let hasText = false;
  let finishReason;

  if (json && Array.isArray(json.candidates) && json.candidates[0]) {
    const cand = json.candidates[0];
    finishReason = cand.finishReason;
    if (cand.content && Array.isArray(cand.content.parts) && cand.content.parts.length > 0) {
      text = cand.content.parts.map((p) => p.text || '').join('');
      hasText = text.trim().length > 0;
    } else if (Array.isArray(cand.parts) && cand.parts.length > 0) {
      text = cand.parts.map((p) => p.text || '').join('');
      hasText = text.trim().length > 0;
    }
  }

  return { raw: json ?? rawText, text, hasText, finishReason };
}

// --- main handler ---
export const handler = async (event) => {
  console.log('article handler: incoming event', JSON.stringify(event).slice(0, 2000));
  console.log('article handler: using TABLE_NAME', TABLE_NAME, 'OUTPUT_BUCKET', OUTPUT_BUCKET);

  if (!OUTPUT_BUCKET) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'PODCAST_OUTPUT_BUCKET env var not set' }),
    };
  }

  try {
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {});
    } catch (parseErr) {
      console.error('article handler: failed to parse event.body', parseErr);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseErr?.message ?? parseErr) }),
      };
    }

    const gameId = body?.gameId;
    if (!gameId || typeof gameId !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid gameId in request body' }),
      };
    }

    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'GameID = :g',
      ExpressionAttributeValues: { ':g': gameId },
    };

    let data;
    try {
      data = await ddb.send(new QueryCommand(queryParams));
    } catch (ddbErr) {
      const code = ddbErr?.name || ddbErr?.__type || 'UnknownDynamoError';
      if (code === 'ValidationException') {
        const scanParams = {
          TableName: TABLE_NAME,
          FilterExpression: 'gameId = :g',
          ExpressionAttributeValues: { ':g': gameId },
        };
        try {
          data = await ddb.send(new ScanCommand(scanParams));
        } catch (scanErr) {
          console.error('article handler: ScanCommand failed', scanErr);
          return {
            statusCode: 500,
            body: JSON.stringify({
              error: 'DynamoDB scan failed',
              code: scanErr?.name || scanErr?.__type || 'UnknownDynamoError',
              details: String(scanErr?.message ?? scanErr),
            }),
          };
        }
      } else if (code === 'ResourceNotFoundException') {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'DynamoDB table not found',
            details: `Table "${TABLE_NAME}" does not exist or is not accessible in this environment.`,
          }),
        };
      } else {
        console.error('article handler: QueryCommand failed', ddbErr);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'DynamoDB query failed',
            code,
            details: String(ddbErr?.message ?? ddbErr),
          }),
        };
      }
    }

    const items = Array.isArray(data?.Items) ? data.Items : [];
    console.log('article handler: DynamoDB read item count', items.length);

    if (!items.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No events found for gameId' }) };
    }

    items.sort((a, b) => getTs(a) - getTs(b));

    const gameStart = items.find((i) => i.type === 'game_start');
    if (!gameStart || !gameStart.payload) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Game metadata (game_start) missing; recap cannot be built yet' }),
      };
    }

    const homeTeam = String(gameStart.payload.homeTeam ?? '');
    const awayTeam = String(gameStart.payload.awayTeam ?? '');
    if (!homeTeam || !awayTeam) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'game_start missing homeTeam or awayTeam; recap cannot be built yet' }),
      };
    }

    const scoringPlaysRaw = extractScoringPlays(items) || [];
    const turnoversRaw = extractTurnovers(items) || [];
    const gameEnd = items.find((i) => i.type === 'game_end');

    console.log(
      'article handler: scoringPlays count',
      scoringPlaysRaw.length,
      'turnovers count',
      turnoversRaw.length
    );

    let finalHome = NaN;
    let finalAway = NaN;

    if (gameEnd?.payload) {
      const p = gameEnd.payload;

      if (p.finalScore && typeof p.finalScore === 'object') {
        const fs = p.finalScore;
        const homeKey =
          Object.keys(fs).find((k) => k === homeTeam) ??
          Object.keys(fs).find((k) => k.toLowerCase() === homeTeam.toLowerCase());
        const awayKey =
          Object.keys(fs).find((k) => k === awayTeam) ??
          Object.keys(fs).find((k) => k.toLowerCase() === awayTeam.toLowerCase());

        if (homeKey) finalHome = Number(fs[homeKey]);
        if (awayKey) finalAway = Number(fs[awayKey]);
      }

      if (!Number.isInteger(finalHome)) {
        finalHome = Number(p.finalScoreHome ?? p.homeScore ?? NaN);
      }
      if (!Number.isInteger(finalAway)) {
        finalAway = Number(p.finalScoreAway ?? p.awayScore ?? NaN);
      }

      if (!Number.isInteger(finalHome) || !Number.isInteger(finalAway)) {
        finalHome = NaN;
        finalAway = NaN;
      }
    }

    if (!Number.isInteger(finalHome) || !Number.isInteger(finalAway)) {
      finalHome = 0;
      finalAway = 0;
      for (const sp of scoringPlaysRaw) {
        const side = resolveSide(sp.team, homeTeam, awayTeam);
        const pts = sp.points || 0;
        if (side === 'home') finalHome += pts;
        if (side === 'away') finalAway += pts;
      }
    }

    const quarters = groupPointsByQuarter(scoringPlaysRaw, homeTeam, awayTeam);

    const hasScoring = Array.isArray(scoringPlaysRaw) && scoringPlaysRaw.length > 0;
    const hasTurnovers = Array.isArray(turnoversRaw) && turnoversRaw.length > 0;

    if (!hasScoring && !hasTurnovers && !gameEnd) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Game lacks scoring/ending data; recap cannot be built yet' }),
      };
    }

    const drivesSummary = summarizeDrives(items);

    const recap = {
      gameId,
      homeTeam,
      awayTeam,
      finalScore: { home: finalHome, away: finalAway },
      quarters,
      scoringPlays: scoringPlaysRaw.map((sp) => ({
        quarter: sp.quarter,
        clock: sp.clock,
        team: sp.team,
        type: sp.type,
        description: sp.description,
        points: sp.points,
        eventId: sp.eventId || undefined,
      })),
      turnovers: turnoversRaw.map((t) => ({
        quarter: t.quarter,
        clock: t.clock,
        team: t.team,
        type: t.type,
        description: t.description,
      })),
      drives: drivesSummary,
    };

    const recapInput = {
      gameId,
      homeTeam,
      awayTeam,
      finalScore: recap.finalScore,
      quarters: recap.quarters,
      scoringPlays: recap.scoringPlays,
      turnovers: recap.turnovers,
      drives: recap.drives,
      eventsCount: items.length,
    };

    let article = null;
    let llmMeta = {};

    try {
      const llmResp = await callGeminiForArticle(recapInput);
      llmMeta = { raw: llmResp.raw, finishReason: llmResp.finishReason };

      if (!llmResp.hasText || !llmResp.text) {
        return {
          statusCode: 502,
          body: JSON.stringify({
            error: 'LLM returned no text for article generation',
            llmMeta,
          }),
        };
      }

      const cleaned = stripCodeFences(llmResp.text);
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error('article handler: failed to parse LLM JSON', e);
        return {
          statusCode: 502,
          body: JSON.stringify({
            error: 'Failed to parse LLM article JSON',
            llmMeta,
            llmText: llmResp.text.slice(0, 1000),
          }),
        };
      }

      article = parsed?.article ?? parsed;
      if (!article || typeof article !== 'object') {
        return {
          statusCode: 502,
          body: JSON.stringify({
            error: 'LLM response missing article field',
            llmMeta,
          }),
        };
      }
    } catch (llmErr) {
      console.error('article handler: LLM error', llmErr);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'LLM error during article generation', details: String(llmErr?.message ?? llmErr) }),
      };
    }

    const key = `${encodeURIComponent(gameId)}.json`;
    const putParams = {
      Bucket: OUTPUT_BUCKET,
      Key: key,
      Body: JSON.stringify({ article }, null, 2),
      ContentType: 'application/json',
    };

    try {
      await s3.send(new PutObjectCommand(putParams));
    } catch (s3Err) {
      console.error('article handler: failed to save article to S3', s3Err);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to save article to S3',
          details: String(s3Err?.message ?? s3Err),
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        gameId,
        s3Bucket: OUTPUT_BUCKET,
        s3Key: key,
        article,
      }),
    };
  } catch (err) {
    console.error('article handler: unexpected error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: String(err?.message ?? err),
      }),
    };
  }
};
