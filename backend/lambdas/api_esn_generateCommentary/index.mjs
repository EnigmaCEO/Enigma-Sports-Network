import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
// Ensure undefined values are stripped when marshalling to DynamoDB
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true }
});

const GAME_EVENTS_TABLE = process.env.GAME_EVENTS_TABLE || 'ESN_GameEvents';

// Handler: single-event real-time commentary
export const handler = async (event) => {
  try {
    // Parse the request body safely
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseError?.message || parseError) })
      };
    }

    const gameId = body?.gameId;
    const gameEvent = body?.event || body?.play || null;

    if (!gameId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Missing required field: gameId' })
      };
    }
    if (!gameEvent) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Missing required field: event (play)' })
      };
    }

    // Generate commentary for this single play (no full-game recap logic)
    const commentary = await generateCommentaryText(gameEvent);

    // Create AI_Commentary event and write it to DynamoDB
    const timestamp = new Date().toISOString();
    const eventId = `${gameId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    const commentaryEvent = {
      eventId,
      gameId,
      type: 'AI_Commentary',
      payload: {
        text: commentary,
        originalEvent: gameEvent,
        generatedAt: timestamp
      },
      timestamp,
      createdAt: timestamp
    };

    // sanitize item to remove undefined and put
    const sanitizedItem = JSON.parse(JSON.stringify(commentaryEvent));
    await docClient.send(new PutCommand({ TableName: GAME_EVENTS_TABLE, Item: sanitizedItem }));

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ message: 'Commentary generated successfully', eventId, commentary, gameId })
    };

  } catch (err) {
    console.error('Error in generateCommentary handler:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to generate commentary', details: String(err?.message || err) })
    };
  }
};

// Simple CORS headers used for both preflight and responses
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-goog-api-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

// Build prompt from the single event and call Gemini HTTP if configured, otherwise fallback.
async function generateCommentaryText(playEvent) {
  try {
    const eventType = (playEvent?.type || 'play').toString();
    const payload = playEvent?.payload || playEvent || {};

    // Short human-readable summary of the play
    const descriptionParts = [];
    if (payload.playType) descriptionParts.push(payload.playType);
    if (payload.playerName) descriptionParts.push(payload.playerName);
    if (payload.runnerName) descriptionParts.push(payload.runnerName);
    if (payload.passerName) descriptionParts.push(payload.passerName);
    if (payload.targetName) descriptionParts.push(`to ${payload.targetName}`);
    if (typeof payload.yards !== 'undefined') descriptionParts.push(`${payload.yards} yards`);
    if (payload.description) descriptionParts.push(payload.description);
    if (payload.text) descriptionParts.push(payload.text);
    const shortDesc = descriptionParts.length ? descriptionParts.join(' - ') : (payload.summary || eventType);

    const prompt = `You are an enthusiastic sports commentator. Generate 1 short (1-2 sentence) live play-by-play commentary for this play. Do not invent new players or teams; rely only on the information given.

Play type: ${eventType}
Details: ${JSON.stringify(payload, null, 2)}

Short description: ${shortDesc}

Commentary:`;

    // If GEMINI config present, call Gemini HTTP API (simple path)
    const apiKey = process.env.GEMINI_API_KEY;
    const url = process.env.GEMINI_URL; // optional custom endpoint
    if (apiKey && url) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ prompt, temperature: 0.7, maxOutputTokens: 150 })
        });
        if (resp.ok) {
          const j = await resp.json().catch(()=>null);
          const text = j?.candidates?.[0]?.content || j?.output?.[0]?.content || j?.text || (typeof j === 'string' ? j : null);
          if (text && typeof text === 'string') return text.trim();
        } else {
          console.warn('Gemini HTTP returned non-ok', resp.status, await resp.text().catch(()=>null));
        }
      } catch (gErr) {
        console.warn('Gemini HTTP call failed, falling back to template:', String(gErr?.message || gErr));
      }
    }

    // Fallback to local templates
    return generateFallbackCommentary(eventType, payload);

  } catch (err) {
    console.error('Error generating commentary text:', err);
    return generateFallbackCommentary(null, null);
  }
}

// Very small template-based fallback for immediate commentary
function generateFallbackCommentary(eventType, payload) {
  const t = (eventType || '').toString().toLowerCase();

  const templates = {
    touchdown: [
      "TOUCHDOWN! What an incredible finish to that drive!",
      "They punch it into the end zone! Six points on the board!"
    ],
    field_goal: [
      "The kicker splits the uprights! Three points!",
      "Field goal is good — a nice swing on the scoreboard!"
    ],
    turnover: [
      "Turnover! What a crucial mistake at a pivotal moment!",
      "Ball's out — turnover changes possession!"
    ],
    default: [
      `What a play! ${payload?.playerName ? payload.playerName + ' makes a play.' : ''}`,
      "An exciting sequence — great effort by the players involved."
    ]
  };

  if (t.includes('touchdown')) return randomFrom(templates.touchdown);
  if (t.includes('field_goal') || t.includes('fieldgoal')) return randomFrom(templates.field_goal);
  if (t.includes('turnover') || t.includes('interception') || t.includes('fumble')) return randomFrom(templates.turnover);
  return randomFrom(templates.default);
}

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
