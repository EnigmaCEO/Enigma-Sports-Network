import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.GAME_EVENTS_TABLE_NAME || 'ESN_GameEvents';

// v3 DynamoDB DocumentClient setup (required for ddb.send(...))
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

// Turn the long instructions into a systemInstruction template.
// We'll inject recapInput where {{recapInput}} is used.
const PODCAST_SYSTEM_TEMPLATE = `
You receive one JSON object called recapInput describing a completed sports game.

Task: Return ONLY a JSON object with this exact shape:

{
  "podcast": {
    "title": string,
    "durationMinutes": number,
    "segments": [
      {
        "id": string,
        "speaker": "HOST" | "ANALYST" | "COLOR",
        "tone": "neutral" | "excited" | "serious",
        "script": string,
        "relatedHighlights": [string]
      }
    ],
    "highlights": [string]
  }
}

Core Rules:
- Output MUST be valid JSON.
- No extra text or markdown.
- Top-level must contain ONLY the "podcast" key.
- The podcast show name is "Final Verdict".

Podcast Length & Depth:
- durationMinutes must be between 2.5 and 3.5.
- This is an insight-driven recap, not a simple scoring summary.
- Go beyond listing scores by explaining WHY the game unfolded the way it did.

Broadcast Team (fixed identities):
- HOST: Marcus Hale
- ANALYST: Jake Rivers
- COLOR: Tim Gray
Speakers may address each other by name naturally.

Segments:
- segments must contain 8-10 items, ids like "seg_1", "seg_2", ...
- The structure should roughly follow:
  1) Opening context and framing (HOST)
     - Introduce Final Verdict, the matchup, and the broadcast team.
     - Prompt (ANALYST) for first key moment.
  2) First-half or early-game summary (ANALYST)
  3) Response to (ANALYST) first-half summary. Send it back to the (ANALYST) for second half comments (HOST)
  4) Secondary turning point or momentum shift (ANALYST)
  5) ONE tactical or strategic insight (ANALYST)
  6) Response to (ANALYST) insight. Send it to the (COLOR) for performance highlight (HOST)
  7) Star or standout performance highlight (COLOR)
  8) Response to (COLOR) standout performance. Send it to the (COLOR) for final observations (HOST)
  9) Brief player spotlight or fun observation (COLOR)
  10) Final score recap and a proper Final Verdict sign-off (HOST)

Speaker Responsibilities:
- HOST (Marcus Hale):
  - Confident TV anchor, Confident, upbeat, engaging.
  - Drives the conversation.
  - Prompts other speakers by name.
  - Reacts to their points (agreement, disagreement, light humor).
  - Does NOT deliver deep tactical breakdowns.
  - Always delivers the final segment, including the final score and a clear sign-off.
- ANALYST (Jake Rivers):
  - Bold former athlete. Passionate, energetic, confident.
  - Focuses on game flow, always mentions player names, personnel matchups, and key plays. 
  - Provides breakdowns, turning points, and tactical or momentum insight.
  - Explains WHY moments mattered.
- COLOR (Tim Gray):
  - Fiery personality. Intelligent, condescending, snarky. Color commentary with a passion for sports.
  - Adds personality, emotion, and memorable reactions.
  - Keeps contributions short and punchy.
  - Does not introduce new facts or deep analysis.
  - Offers brief player spotlights or fun observations.

Conversational & Interaction Rules:
- The podcast must feel like real people talking together, not isolated monologues.
- Most segment transitions should be initiated by the HOST.
- At least 5 segments must include one of the following:
  - Addressing another speaker by name.
  - Responding directly to a previous comment.
  - A natural conversational ramp such as "well", "look", "I'll say this", or "you're right".
- Avoid back-to-back standalone statements with no acknowledgment of other speakers.

Tone Usage:
- neutral: context, framing, explanation.
- excited: big plays, turning points, standout performances.
- serious: analysis, implications, momentum shifts.

Script Guidelines:
- Write short, natural spoken lines suitable for audio.
- Limit each segment to 1-3 sentences.
- No filler, no rambling.
- No bracketed directions like [excited], [pause], or (laughs).
- No emojis, no markup.
- Do NOT repeat the final score more than once.
- Reference ONLY real teams, players, scores, and events present in recapInput.
- Do NOT invent players, stats, records, or events.

Highlights:
- highlights must contain 4-6 short phrases, each 4-14 words.
- Each highlight should represent a meaningful turning point or decisive moment,
  not just every score.

Source of Truth:
- Use recapInput.homeTeam, recapInput.awayTeam, recapInput.finalScore,
  recapInput.quarters / scoringByQuarter, and recapInput.scoringPlays / highlights.
- If tactical or pattern-level detail is not explicitly present, speak generally
  (e.g., "late surge", "missed adjustments", "control after halftime")
  rather than fabricating specifics.

recapInput:
{{recapInput}}
`;


// --- helper: event timestamp extraction ---
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

// --- helper: map score type -> points ---
function mapScoreTypeToPoints(type) {
  if (!type) return 0;
  switch (String(type).toUpperCase()) {
    case 'TD': return 6;
    case 'FG': return 3;
    case 'SAFETY': return 2;
    default: return 0;
  }
}

// --- helper: scoring plays extraction ---
function extractScoringPlays(items) {
  const plays = [];
  for (const it of items || []) {
    const baseType = it?.type || '';
    const p = it?.payload ?? {};

    // Prefer explicit numeric points in the payload
    const rawPoints = typeof p.points === 'number' ? p.points : Number(p.points);
    const hasNumericPoints = Number.isFinite(rawPoints);

    // Treat as scoring if:
    // - event type is 'score' (legacy), OR
    // - payload has a numeric points field (> 0)
    if (!(baseType === 'score' || hasNumericPoints)) continue;

    const quarter = Number(p.quarter);
    const team = p.team ?? '';
    if (!Number.isInteger(quarter) || !team) continue;

    const clock = p.gameClock ?? '';
    // --- changed: derive subtype from scoreType when available ---
    const subtype = (p.scoreType || p.type || baseType || '').toString().toUpperCase();
    const description = p.description ?? '';

    // Use payload.points when present; otherwise fallback to type-based default
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
      // keep full payload so groupPointsByQuarter can read homeScore/awayScore
      payload: p,
    });
  }
  plays.sort((a, b) => a.ts - b.ts);
  return plays;
}

// --- helper: turnovers extraction ---
function extractTurnovers(items) {
  const outs = [];
  for (const it of items || []) {
    const baseType = it?.type;
    const p = it?.payload ?? {};

    const isTurnoverEvent = baseType === 'turnover';

    // --- new: also treat drive_end with turnover-ish result as turnover summary ---
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

// --- helper: map an event.team string to "home" | "away" | null ---
function resolveSide(teamValue, homeTeam, awayTeam) {
  if (!teamValue) return null;
  const t = String(teamValue).trim().toLowerCase();
  const homeNorm = String(homeTeam || '').trim().toLowerCase();
  const awayNorm = String(awayTeam || '').trim().toLowerCase();

  // direct "home"/"away" flags
  if (t === 'home') return 'home';
  if (t === 'away') return 'away';

  // match by team name (case-insensitive)
  if (homeNorm && t === homeNorm) return 'home';
  if (awayNorm && t === awayNorm) return 'away';

  return null;
}

// --- helper: group points by quarter ---
// Now: sum points per quarter for each team based on scoringPlays.
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
      // scoreboard at end of quarter
      homePoints: cumulativeHome,
      awayPoints: cumulativeAway,
    });
  }

  return quarters;
}

// Helper: strip leading/trailing ``` or ```json fences from model output
function stripCodeFences(s) {
  if (typeof s !== 'string') return s;
  let out = s.trim();
  // leading ``` or ```json
  if (out.startsWith('```')) {
    const firstNl = out.indexOf('\n');
    if (firstNl !== -1) {
      out = out.slice(firstNl + 1).trim();
    } else {
      out = out.slice(3).trim();
    }
  }
  // trailing ```
  if (out.endsWith('```')) {
    out = out.slice(0, out.lastIndexOf('```')).trim();
  }
  return out;
}

// --- new helper: call Gemini / Generative Language API ---
async function callGemini(
  recapInput,
  {
    model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  } = {}
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is required to call Gemini LLM');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  // Build systemInstruction from template (inject recapInput for reference),
  // and send the recapInput again as the user content (plain JSON).
  const systemInstruction = {
    parts: [
      {
        text: PODCAST_SYSTEM_TEMPLATE.replace('{{recapInput}}', JSON.stringify(recapInput)),
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
    // generationConfig omitted – let Gemini use defaults
  };

  console.log('callGemini: endpoint', endpoint);
  console.log('callGemini: model', model);
  console.log('callGemini: recapInput length', JSON.stringify(recapInput).length);

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
    console.error('callGemini: network error', netErr);
    throw netErr;
  }

  const rawText = await res.text();
  console.log('callGemini: status', res.status);
  console.log('callGemini: rawText length', rawText.length);
  console.log('callGemini: rawText preview', rawText.slice(0, 800));

  let json;
  try {
    json = JSON.parse(rawText);
    console.log(
      'callGemini: parsed JSON keys',
      typeof json === 'object' && json !== null ? Object.keys(json) : []
    );
  } catch (e) {
    console.warn('callGemini: response not JSON', e);
    json = null;
  }

  if (!res.ok) {
    console.error('callGemini: non-OK response body', json ?? rawText);
    throw new Error(`LLM call failed ${res.status}: ${rawText}`);
  }

  let text = null;
  let hasText = false;
  let finishReason = undefined;

  if (json && Array.isArray(json.candidates) && json.candidates[0]) {
    const cand = json.candidates[0];
    finishReason = cand.finishReason;
    console.log('callGemini: first candidate meta', {
      finishReason,
      hasContent: !!cand.content,
    });

    if (cand.content && Array.isArray(cand.content.parts) && cand.content.parts.length > 0) {
      text = cand.content.parts.map((p) => p.text || '').join('');
      hasText = text.trim().length > 0;
    } else if (Array.isArray(cand.parts) && cand.parts.length > 0) {
      text = cand.parts.map((p) => p.text || '').join('');
      hasText = text.trim().length > 0;
    }
  }

  if (!hasText) {
    console.warn('callGemini: no text parts found in candidates; returning raw JSON only', {
      finishReason,
    });
    return { raw: json ?? rawText, text: null, hasText: false, finishReason };
  }

  console.log('callGemini: extracted text length', text.length);
  console.log('callGemini: extracted text preview', text.slice(0, 500));

  return { raw: json ?? rawText, text, hasText: true, finishReason };
}

// --- helper: group events into drives and summarize them ---
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
    const plays =
      typeof endPayload.plays === 'number'
        ? endPayload.plays
        : d.events.filter((e) => e.type === 'play').length;
    const yards =
      typeof endPayload.totalYards === 'number'
        ? endPayload.totalYards
        : d.events.reduce((acc, ev) => {
            const py = ev?.payload?.yards;
            const n = typeof py === 'number' ? py : typeof py === 'string' ? Number(py) : 0;
            return acc + (Number.isFinite(n) ? n : 0);
          }, 0);
    const result = (endPayload.result || '').toString();

    return {
      quarter: Number.isFinite(quarter) ? quarter : undefined,
      team,
      driveNumber,
      plays,
      yards,
      result,
    };
  });
}

export const handler = async (event) => {
  console.log('handler: incoming event', JSON.stringify(event).slice(0, 2000));
  console.log('handler: using TABLE_NAME', TABLE_NAME);
  try {
    // --- body parsing debug ---
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {});
    } catch (parseErr) {
      console.error('handler: failed to parse event.body', parseErr, 'raw body:', event.body);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseErr?.message ?? parseErr) }),
      };
    }

    console.log('handler: parsed body', body);

    const gameId = body?.gameId;
    if (!gameId || typeof gameId !== 'string') {
      console.warn('handler: missing or invalid gameId', gameId);
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid gameId in request body' }) };
    }

    // First try: query by primary key GameID (matches ingestEvent)
    const queryParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'GameID = :g',
      ExpressionAttributeValues: { ':g': gameId },
    };

    console.log('handler: querying DynamoDB with params', queryParams);

    let data;
    try {
      data = await ddb.send(new QueryCommand(queryParams));
    } catch (ddbErr) {
      console.error('handler: DynamoDB QueryCommand failed', ddbErr);
      const code = ddbErr?.name || ddbErr?.__type || 'UnknownDynamoError';

      // If the key schema doesn't match (e.g., GameID is not a key here),
      // fall back to a filtered Scan on gameId.
      if (code === 'ValidationException') {
        console.warn('handler: falling back to ScanCommand on gameId due to ValidationException');

        const scanParams = {
          TableName: TABLE_NAME,
          FilterExpression: 'gameId = :g',
          ExpressionAttributeValues: { ':g': gameId },
        };

        console.log('handler: scanning DynamoDB with params', scanParams);
        try {
          data = await ddb.send(new ScanCommand(scanParams));
        } catch (scanErr) {
          console.error('handler: DynamoDB ScanCommand failed', scanErr);
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

    console.log('handler: DynamoDB read succeeded, item count', data?.Items?.length ?? 0);

    const items = data.Items ?? [];
    if (!items.length) {
      console.warn('handler: no events for gameId', gameId);
      return { statusCode: 404, body: JSON.stringify({ error: 'No events found for gameId' }) };
    }

    items.sort((a, b) => getTs(a) - getTs(b));

    const gameStart = items.find(i => i.type === 'game_start');
    console.log('handler: game_start event', gameStart);
    if (!gameStart || !gameStart.payload) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Game metadata (game_start) missing; recap cannot be built yet' }) };
    }
    const homeTeam = String(gameStart.payload.homeTeam ?? '');
    const awayTeam = String(gameStart.payload.awayTeam ?? '');
    console.log('handler: homeTeam, awayTeam', homeTeam, awayTeam);
    if (!homeTeam || !awayTeam) {
      return { statusCode: 404, body: JSON.stringify({ error: 'game_start missing homeTeam or awayTeam; recap cannot be built yet' }) };
    }

    const scoringPlaysRaw = extractScoringPlays(items);
    const turnoversRaw = extractTurnovers(items);
    console.log(
      'handler: scoringPlays count',
      scoringPlaysRaw.length,
      'turnovers count',
      turnoversRaw.length,
      'sample scoring play',
      scoringPlaysRaw[0] || null
    );

    const gameEnd = items.find(i => i.type === 'game_end');
    console.log('handler: game_end event', gameEnd);

    let finalHome = NaN, finalAway = NaN;

    if (gameEnd?.payload) {
      const p = gameEnd.payload;

      // 1) New: try flexible finalScore object like { Wraiths: 27, Titans: 30 }
      if (p.finalScore && typeof p.finalScore === 'object') {
        const fs = p.finalScore;
        const homeKey = Object.keys(fs).find(k => k === homeTeam) ?? Object.keys(fs).find(k => k.toLowerCase() === homeTeam.toLowerCase());
        const awayKey = Object.keys(fs).find(k => k === awayTeam) ?? Object.keys(fs).find(k => k.toLowerCase() === awayTeam.toLowerCase());

        if (homeKey) finalHome = Number(fs[homeKey]);
        if (awayKey) finalAway = Number(fs[awayKey]);

        console.log('handler: finalScore from game_end.finalScore map', {
          rawFinalScore: fs,
          homeKey,
          awayKey,
          finalHome,
          finalAway,
        });
      }

      // 2) Legacy: explicit numeric fields, only if not already set
      if (!Number.isInteger(finalHome)) {
        finalHome = Number(p.finalScoreHome ?? p.homeScore ?? NaN);
      }
      if (!Number.isInteger(finalAway)) {
        finalAway = Number(p.finalScoreAway ?? p.awayScore ?? NaN);
      }

      if (!Number.isInteger(finalHome) || !Number.isInteger(finalAway)) {
        console.warn('handler: invalid or incomplete final score in game_end payload', {
          finalHome,
          finalAway,
          payload: p,
        });
        finalHome = NaN;
        finalAway = NaN;
      }
    }

    // 3) Fallback: compute from scoringPlays if game_end did not give us a usable score
    if (!Number.isInteger(finalHome) || !Number.isInteger(finalAway)) {
      finalHome = 0;
      finalAway = 0;
      for (const sp of scoringPlaysRaw) {
        const side = resolveSide(sp.team, homeTeam, awayTeam);
        const pts = sp.points || 0;
        if (side === 'home') finalHome += pts;
        if (side === 'away') finalAway += pts;
      }
      console.log('handler: computed final score from scoringPlays', finalHome, finalAway);
    }

    const quarters = groupPointsByQuarter(scoringPlaysRaw, homeTeam, awayTeam);
    console.log('handler: quarters breakdown', quarters);

    if (!scoringPlaysRaw.length && !turnoversRaw.length && !gameEnd) {
      console.warn('handler: insufficient game data for recap');
      return { statusCode: 404, body: JSON.stringify({ error: 'Game lacks scoring/ending data; recap cannot be built yet' }) };
    }

    // --- new: build drive summaries from the full event list ---
    const drivesSummary = summarizeDrives(items);

    const recap = {
      gameId,
      homeTeam,
      awayTeam,
      finalScore: { home: finalHome, away: finalAway },
      quarters,
      scoringPlays: scoringPlaysRaw.map(sp => ({
        quarter: sp.quarter,
        clock: sp.clock,
        team: sp.team,
        type: sp.type,
        description: sp.description,
        points: sp.points,
        eventId: sp.eventId || undefined,
      })),
      turnovers: turnoversRaw.map(t => ({
        quarter: t.quarter,
        clock: t.clock,
        team: t.team,
        type: t.type,
        description: t.description,
      })),
      // expose drives on the recap object as well
      drives: drivesSummary,
    };

    console.log('handler: recap before LLM (truncated)', JSON.stringify(recap).slice(0, 2000));

    const recapInput = {
      gameId,
      homeTeam,
      awayTeam,
      finalScore: recap.finalScore,
      quarters: recap.quarters,
      scoringPlays: recap.scoringPlays,
      turnovers: recap.turnovers,
      // --- new: include summarized drives for the LLM ---
      drives: recap.drives,
      eventsCount: items.length,
    };

    console.log('handler: recapInput for LLM (truncated)', JSON.stringify(recapInput).slice(0, 2000));

    try {
      console.log('handler: calling Gemini');
      // No need to pass temperature/maxOutputTokens anymore
      const llmResp = await callGemini(recapInput);

      recap.llm_raw = llmResp.raw;
      if (llmResp.finishReason) {
        recap.llm_finishReason = llmResp.finishReason;
      }

      if (!llmResp.hasText || !llmResp.text) {
        console.warn('handler: LLM returned no usable text; skipping podcast JSON parse');
        recap.llm_warning =
          'LLM returned no text candidates. Check llm_finishReason and llm_raw for details.';
      } else {
        const cleaned = stripCodeFences(llmResp.text);
        console.log('handler: cleaned llmResp.text (truncated)', cleaned.slice(0, 500));
        let podcastJson = null;
        try {
          podcastJson = JSON.parse(cleaned);
          console.log('handler: parsed podcastJson keys', Object.keys(podcastJson || {}));
          if (podcastJson && podcastJson.podcast) {
            recap.podcast = podcastJson.podcast;
          } else {
            recap.podcast = podcastJson;
          }
        } catch (e) {
          console.warn('handler: failed to parse LLM JSON even after stripping fences, storing raw', e);
          recap.podcast_raw = llmResp.text;
        }
      }
    } catch (llmErr) {
      console.error('handler: LLM error', llmErr);
      recap.llm_error = String(llmErr?.message ?? llmErr);
    }

    const responseBody = JSON.stringify(recap);
    console.log('handler: success, response size', responseBody.length);

    return { statusCode: 200, body: responseBody };
  } catch (err) {
    console.error('handler: unexpected error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: String(err?.message ?? err),
        stack: err?.stack,
      }),
    };
  }
};
