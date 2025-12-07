import AWS from 'aws-sdk';

const ddb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'GameEvents';

function getTs(ev) {
  const v = ev?.timestamp ?? ev?.createdAt;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function mapScoreTypeToPoints(type) {
  if (!type) return 0;
  switch (type.toUpperCase()) {
    case 'TD': return 6;
    case 'FG': return 3;
    case 'SAFETY': return 2;
    default: return 0;
  }
}

function extractScoringPlays(items) {
  const plays = [];
  for (const it of items) {
    if (it?.type !== 'score') continue;
    const p = it.payload ?? {};
    const quarter = Number(p.quarter);
    const team = p.team ?? '';
    if (!Number.isInteger(quarter) || !team) continue;
    const clock = p.gameClock ?? '';
    const type = p.type ?? '';
    const description = p.description ?? '';
    const points = (typeof p.points === 'number') ? p.points : mapScoreTypeToPoints(type);
    plays.push({ quarter, clock, team, type, description, points, ts: getTs(it) });
  }
  plays.sort((a, b) => a.ts - b.ts);
  return plays;
}

function extractTurnovers(items) {
  const outs = [];
  for (const it of items) {
    if (it?.type !== 'turnover') continue;
    const p = it.payload ?? {};
    const quarter = Number(p.quarter);
    const team = p.team ?? '';
    if (!Number.isInteger(quarter) || !team) continue;
    outs.push({
      quarter,
      clock: p.gameClock ?? '',
      team,
      type: p.type ?? '',
      description: p.description ?? '',
      ts: getTs(it),
    });
  }
  outs.sort((a, b) => a.ts - b.ts);
  return outs;
}

function groupPointsByQuarter(scoringPlays, homeTeam, awayTeam) {
  const map = new Map();
  let maxQ = 4;
  for (const sp of scoringPlays) {
    const q = sp.quarter;
    if (q > maxQ) maxQ = q;
    if (!map.has(q)) map.set(q, { homePoints: 0, awayPoints: 0 });
    const bucket = map.get(q);
    if (sp.team === homeTeam) bucket.homePoints += sp.points;
    else if (sp.team === awayTeam) bucket.awayPoints += sp.points;
    // unknown team -> skip
  }
  const quarters = [];
  for (let q = 1; q <= maxQ; q++) {
    const v = map.get(q) ?? { homePoints: 0, awayPoints: 0 };
    quarters.push({ quarter: q, homePoints: v.homePoints, awayPoints: v.awayPoints });
  }
  return quarters;
}

export const handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {});
    const gameId = body?.gameId;
    if (!gameId || typeof gameId !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid gameId in request body' }) };
    }

    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'gameId = :g',
      ExpressionAttributeValues: { ':g': gameId },
    };

    const data = await ddb.query(params).promise();
    const items = (data.Items ?? []);
    if (!items.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No events found for gameId' }) };
    }

    items.sort((a, b) => getTs(a) - getTs(b));

    const gameStart = items.find(i => i.type === 'game_start');
    if (!gameStart || !gameStart.payload) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Game metadata (game_start) missing; recap cannot be built yet' }) };
    }
    const homeTeam = String(gameStart.payload.homeTeam ?? '');
    const awayTeam = String(gameStart.payload.awayTeam ?? '');
    if (!homeTeam || !awayTeam) {
      return { statusCode: 404, body: JSON.stringify({ error: 'game_start missing homeTeam or awayTeam; recap cannot be built yet' }) };
    }

    const scoringPlaysRaw = extractScoringPlays(items);
    const turnoversRaw = extractTurnovers(items);

    // prefer game_end payload for final score
    const gameEnd = items.find(i => i.type === 'game_end');
    let finalHome = NaN, finalAway = NaN;
    if (gameEnd?.payload) {
      const p = gameEnd.payload;
      finalHome = Number(p.finalScoreHome ?? p.homeScore ?? NaN);
      finalAway = Number(p.finalScoreAway ?? p.awayScore ?? NaN);
      if (!Number.isInteger(finalHome) || !Number.isInteger(finalAway)) {
        finalHome = NaN; finalAway = NaN;
      }
    }

    if (!Number.isInteger(finalHome) || !Number.isInteger(finalAway)) {
      finalHome = 0; finalAway = 0;
      for (const sp of scoringPlaysRaw) {
        if (sp.team === homeTeam) finalHome += sp.points;
        else if (sp.team === awayTeam) finalAway += sp.points;
      }
    }

    const quarters = groupPointsByQuarter(scoringPlaysRaw, homeTeam, awayTeam);

    if (!scoringPlaysRaw.length && !turnoversRaw.length && !gameEnd) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Game lacks scoring/ending data; recap cannot be built yet' }) };
    }

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
      })),
      turnovers: turnoversRaw.map(t => ({
        quarter: t.quarter,
        clock: t.clock,
        team: t.team,
        type: t.type,
        description: t.description,
      })),
    };

    return { statusCode: 200, body: JSON.stringify(recap) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', details: String(err?.message ?? err) }) };
  }
};
