import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

const GAME_EVENTS_TABLE = process.env.GAME_EVENTS_TABLE || 'ESN_GameEvents';
const GAME_SESSIONS_TABLE = process.env.GAME_SESSIONS_TABLE || 'ESN_GameSession';

export const handler = async (event) => {
  try {
    // Parse the request body
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          details: parseError.message
        }),
      };
    }

    const { gameId, event: gameEvent } = body;

    if (!gameId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Missing required field: gameId'
        }),
      };
    }

    // Get recent game context for better commentary
    const gameContext = await getGameContext(gameId);
    
    // Generate commentary using Bedrock
    const commentary = await generateCommentaryText(gameEvent, gameContext);

    // Create commentary event
    const timestamp = new Date().toISOString();
    const eventId = `${gameId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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

    // Write commentary event to DynamoDB
    await docClient.send(new PutCommand({
      TableName: GAME_EVENTS_TABLE,
      Item: commentaryEvent
    }));

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        message: 'Commentary generated successfully',
        eventId,
        commentary,
        gameId
      }),
    };

  } catch (error) {
    console.error('Error generating commentary:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Failed to generate commentary',
        details: error.message
      }),
    };
  }
};

async function getGameContext(gameId) {
  try {
    // Get recent events for context (last 10 events)
    const queryParams = {
      TableName: GAME_EVENTS_TABLE,
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': gameId
      },
      ScanIndexForward: false, // Get most recent first
      Limit: 10
    };

    const result = await docClient.send(new QueryCommand(queryParams));
    const recentEvents = result.Items || [];

    // Try to get game session info
    let gameSession = null;
    try {
      const sessionResult = await docClient.send(new GetCommand({
        TableName: GAME_SESSIONS_TABLE,
        Key: { gameId }
      }));
      gameSession = sessionResult.Item;
    } catch (err) {
      console.log('No game session found, continuing without it');
    }

    return {
      recentEvents: recentEvents.reverse(), // Put back in chronological order
      gameSession
    };
  } catch (error) {
    console.error('Error getting game context:', error);
    return { recentEvents: [], gameSession: null };
  }
}

async function generateCommentaryText(gameEvent, gameContext) {
  try {
    // Build context for the LLM
    const eventType = gameEvent?.type || 'unknown';
    const eventPayload = gameEvent?.payload || {};
    
    // Create a summary of recent events for context
    const recentEventsText = gameContext.recentEvents
      .slice(-5) // Last 5 events
      .map(e => `${e.type}: ${e.payload?.text || generateEventDescription(e)}`)
      .join('\n');

    // Build the prompt
    const prompt = `You are an enthusiastic sports commentator providing live commentary for a football game.

Recent game events:
${recentEventsText}

Current event: ${eventType}
Event details: ${JSON.stringify(eventPayload, null, 2)}

Generate exciting, professional sports commentary (1-2 sentences) for this event. Make it engaging and appropriate for the game situation. Focus on the action and impact of the play.

Commentary:`;

    // Use Claude via Bedrock
    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    const requestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 150,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      body: JSON.stringify(requestBody)
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    const commentary = responseBody.content?.[0]?.text?.trim() || 
                      generateFallbackCommentary(eventType, eventPayload);

    return commentary;

  } catch (error) {
    console.error('Error calling Bedrock:', error);
    // Fallback to template-based commentary
    return generateFallbackCommentary(gameEvent?.type, gameEvent?.payload);
  }
}

function generateEventDescription(event) {
  const type = event.type;
  const payload = event.payload || {};
  
  switch (type.toLowerCase()) {
    case 'touchdown':
      return `Touchdown by ${payload.team || 'team'}`;
    case 'field_goal':
      return `Field goal by ${payload.team || 'team'}`;
    case 'timeout':
      return `Timeout called by ${payload.team || 'team'}`;
    case 'kickoff':
      return `Kickoff by ${payload.team || 'team'}`;
    default:
      return payload.text || `${type} play`;
  }
}

function generateFallbackCommentary(eventType, eventPayload) {
  const templates = {
    touchdown: [
      "TOUCHDOWN! What an incredible finish to that drive!",
      "They punch it into the end zone! Six points on the board!",
      "A magnificent touchdown! The crowd is on their feet!"
    ],
    field_goal: [
      "It's good! Three points through the uprights!",
      "The kicker splits the uprights perfectly!",
      "A clutch field goal when they needed it most!"
    ],
    timeout: [
      "Timeout called at a crucial moment in this game!",
      "The coach calls for a timeout to regroup the team!",
      "Strategic timeout to stop the momentum!"
    ],
    kickoff: [
      "Here we go! The kickoff sends the ball sailing down the field!",
      "The game is underway with this kickoff!",
      "A booming kickoff to get things started!"
    ],
    play: [
      "What a play! The execution was flawless!",
      "An impressive display of skill on that play!",
      "The players are really showing their talent out there!"
    ]
  };

  const eventTemplates = templates[eventType?.toLowerCase()] || templates.play;
  const randomTemplate = eventTemplates[Math.floor(Math.random() * eventTemplates.length)];
  
  return randomTemplate;
}
