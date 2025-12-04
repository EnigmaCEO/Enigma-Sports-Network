import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const GAME_EVENTS_TABLE = process.env.GAME_EVENTS_TABLE || 'ESN_GameEvents';
const MAX_ALL_EVENTS = 200; // cap when returning all events (gameId === "0")
const LAST_GAMES_LIMIT = 5; // new: limit to last 5 games when fetching gameId === '0'

export const handler = async (event) => {
  try {
    // Extract gameId from query parameters; accept either "gameId" or "GameID"
    const qs = event.queryStringParameters || {};
    const gameId = qs.gameId || qs.GameID;
    // new: accept several common variants for appId and sport
    const appId = qs.appId || qs.appID || qs.AppID || null;
    const sport = qs.sport || qs.sportId || qs.sportID || qs.Sport || null;

    if (!gameId && gameId !== '0') {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Missing required parameter: gameId'
        }),
      };
    }

    let result;
    if (String(gameId) === '0') {
      // NEW: Fetch only game_start and the latest event for the most recent LAST_GAMES_LIMIT games.
      // Step 1: Scan to discover GameIDs and their latest timestamp (apply optional filters)
      const scanParams = {
        TableName: GAME_EVENTS_TABLE,
        ProjectionExpression: 'GameID, #ts',
        ExpressionAttributeNames: { '#ts': 'timestamp' }
      };

      const scanFilters = [];
      const scanExprValues = {};
      if (appId) {
        scanFilters.push('appId = :appId');
        scanExprValues[':appId'] = appId;
      }
      if (sport) {
        scanFilters.push('sport = :sport');
        scanExprValues[':sport'] = sport;
      }
      if (scanFilters.length) {
        scanParams.FilterExpression = scanFilters.join(' AND ');
        scanParams.ExpressionAttributeValues = scanExprValues;
      }

      const scanAll = await docClient.send(new ScanCommand(scanParams));
      const scanItems = scanAll.Items || [];

      // Build a map of latest timestamp per GameID
      const latestByGame = {};
      scanItems.forEach(it => {
        const gid = it.GameID || it.gameId || it.GameId;
        if (!gid) return;
        const ts = it.timestamp ? Date.parse(it.timestamp) : 0;
        if (!latestByGame[gid] || ts > latestByGame[gid]) {
          latestByGame[gid] = ts;
        }
      });

      // Sort game IDs by latest timestamp desc and take top LAST_GAMES_LIMIT
      const recentGameIds = Object.keys(latestByGame)
        .sort((a, b) => (latestByGame[b] || 0) - (latestByGame[a] || 0))
        .slice(0, LAST_GAMES_LIMIT);

      // For each recent gameId fetch only the latest event and the game_start event.
      const perGamePromises = recentGameIds.map(async (gid) => {
        const baseExpr = { ':gameId': gid };
        if (appId) baseExpr[':appId'] = appId;
        if (sport) baseExpr[':sport'] = sport;

        // Latest event: ScanIndexForward: false, Limit 1 (keep server-side filter for latest)
        const latestParams = {
          TableName: GAME_EVENTS_TABLE,
          KeyConditionExpression: 'GameID = :gameId',
          ExpressionAttributeValues: { ...baseExpr },
          ScanIndexForward: false,
          Limit: 1
        };
        const latestFilters = [];
        if (appId) latestFilters.push('appId = :appId');
        if (sport) latestFilters.push('sport = :sport');
        if (latestFilters.length) latestParams.FilterExpression = latestFilters.join(' AND ');

        // Helper: check item matches optional filters (appId / sport) using common variants
        const matchesFilters = (it) => {
          if (appId) {
            const val = it.appId || it.AppID || it.AppId || it.app || null;
            if (!val || String(val) !== String(appId)) return false;
          }
          if (sport) {
            const sval = it.sport || it.Sport || null;
            if (!sval || String(sval) !== String(sport)) return false;
          }
          return true;
        };

        // Find earliest game_start by paging forward and checking items client-side.
        const findGameStart = async () => {
          let exclusiveStartKey = undefined;
          const pageLimit = 50; // small pages to avoid reading whole history
          while (true) {
            const q = {
              TableName: GAME_EVENTS_TABLE,
              KeyConditionExpression: 'GameID = :gameId',
              ExpressionAttributeValues: { ':gameId': gid },
              ScanIndexForward: true,
              Limit: pageLimit,
            };
            if (exclusiveStartKey) q.ExclusiveStartKey = exclusiveStartKey;
            const res = await docClient.send(new QueryCommand(q));
            const items = res.Items || [];
            for (const it of items) {
              if (String(it.type) === 'game_start' && matchesFilters(it)) {
                return it;
              }
            }
            if (!res.LastEvaluatedKey) break;
            exclusiveStartKey = res.LastEvaluatedKey;
          }
          return null;
        };

        const [latestRes, startItem] = await Promise.all([
          docClient.send(new QueryCommand(latestParams)).catch(() => ({ Items: [] })),
          findGameStart().catch(() => null)
        ]);

        const latestItems = latestRes?.Items || [];
        const startItems = startItem ? [startItem] : [];

        // Return unique items for this game (start first, latest after)
        return [...startItems, ...latestItems];
      });

      const perGameResults = await Promise.all(perGamePromises);
      // Flatten and dedupe by eventId / fallback key
      const flat = perGameResults.flat();
      const seen = new Map();
      const deduped = [];
      for (const it of flat) {
        const key = it.eventId || `${it.type || ''}-${it.timestamp || ''}-${it.GameID || it.gameId || ''}`;
        if (!seen.has(key)) {
          seen.set(key, true);
          deduped.push(it);
        }
      }

      result = { Items: deduped };
    } else {
      // Query all events for the gameId, sorted by timestamp (SK)
      const queryParams = {
        TableName: GAME_EVENTS_TABLE,
        // Table's partition key is "GameID" so query must use that exact name
        KeyConditionExpression: 'GameID = :gameId',
        ExpressionAttributeValues: {
          ':gameId': gameId
        },
        ScanIndexForward: true // Sort by sort key in ascending order (oldest first)
      };

      // add optional filters for appId/sport on query (filter applied after key condition)
      const queryFilters = [];
      if (appId) {
        queryFilters.push('appId = :appId');
        queryParams.ExpressionAttributeValues[':appId'] = appId;
      }
      if (sport) {
        queryFilters.push('sport = :sport');
        queryParams.ExpressionAttributeValues[':sport'] = sport;
      }
      if (queryFilters.length) {
        queryParams.FilterExpression = queryFilters.join(' AND ');
      }

      result = await docClient.send(new QueryCommand(queryParams));
    }

    // Normalize items array
    let items = result.Items || [];

    // If returning all events, sort by timestamp descending (most recent first) and cap
    if (String(gameId) === '0') {
      items = items.sort((a, b) => {
        const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
        const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
        return tb - ta;
      }).slice(0, MAX_ALL_EVENTS);
    }

    // Transform the data to match the expected format
    const timeline = items.map(item => {
      // Extract time from payload or use timestamp
      const time = item.payload?.time ||
                   (item.timestamp ? (item.timestamp.split?.('T')?.[1]?.substring(0, 5)) : undefined) ||
                   (item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '');

      return {
        type: item.type,
        payload: item.payload || {},
        timestamp: item.timestamp,
        time: time,
        text: item.payload?.text || generateEventText(item.type, item.payload),
        eventId: item.eventId,
        gameId: item.GameID || item.gameId || item.GameId || null,
        // new: include appId and sport (try common attribute variants)
        appId: item.appId || item.AppID || item.AppId || null,
        sport: item.sport || item.Sport || null
      };
    }) || [];

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        gameId,
        appId: appId || null,
        sport: sport || null,
        timeline,
        eventCount: timeline.length
      }),
    };

  } catch (error) {
    console.error('Error fetching timeline:', error);

    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Failed to fetch timeline',
        details: error.message
      }),
    };
  }
};

// Helper function to generate readable text for events that don't have explicit text
function generateEventText(type, payload) {
  switch (String(type).toLowerCase()) {
    case 'kickoff':
      return `Kickoff${payload?.team ? ` by ${payload.team}` : ''}`;

    case 'touchdown':
      return `Touchdown${payload?.team ? ` for ${payload.team}` : ''}${payload?.player ? ` by ${payload.player}` : ''}${payload?.points ? ` (${payload.points} points)` : ''}`;

    case 'field_goal':
      return `Field goal${payload?.team ? ` by ${payload.team}` : ''}${payload?.distance ? ` from ${payload.distance} yards` : ''}`;

    case 'timeout':
      return `Timeout${payload?.team ? ` called by ${payload.team}` : ''}`;

    case 'first_down':
    case 'play':
      if (payload?.description) return payload.description;
      return `${String(type).replace('_', ' ')} play`;

    case 'score':
      return `Score update${payload?.team ? ` for ${payload.team}` : ''}${payload?.points ? ` (+${payload.points})` : ''}`;

    case 'quarter_change':
    case 'period_change':
      return `${payload?.quarter || payload?.period ? `Quarter ${payload?.quarter || payload?.period}` : 'Quarter change'}`;

    case 'game_start':
      return 'Game started';

    case 'game_end':
    case 'final':
      return 'Game ended';

    case 'commentary':
      return payload?.message || payload?.comment || 'Commentary';

    default:
      return `${type} event`;
  }
}
