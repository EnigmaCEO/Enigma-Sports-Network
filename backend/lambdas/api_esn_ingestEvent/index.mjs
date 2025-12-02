import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

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

    // Validate required fields
    const { gameId, type, payload } = body;
    if (!gameId || !type) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['gameId', 'type'],
          received: { gameId, type, payload }
        }),
      };
    }

    const timestamp = new Date().toISOString();
    const eventId = `${gameId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create the game event item
    const gameEvent = {
      eventId,
      gameId,
      type,
      payload: payload || {},
      timestamp,
      createdAt: timestamp
    };

    // Write to GameEvents table
    await docClient.send(new PutCommand({
      TableName: GAME_EVENTS_TABLE,
      Item: gameEvent
    }));

    // Update GameSession based on event type
    await updateGameSession(gameId, type, payload, timestamp);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        message: 'Event ingested successfully',
        eventId,
        gameId,
        type,
        timestamp
      }),
    };

  } catch (error) {
    console.error('Error ingesting event:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Failed to ingest event',
        details: error.message
      }),
    };
  }
};

async function updateGameSession(gameId, eventType, payload, timestamp) {
  try {
    // First, get the current game session to check if it exists
    let gameSession;
    try {
      const getResult = await docClient.send(new GetCommand({
        TableName: GAME_SESSIONS_TABLE,
        Key: { gameId }
      }));
      gameSession = getResult.Item;
    } catch (getError) {
      console.log('Game session not found, will create new one');
    }

    // Prepare update expression parts
    let updateExpression = 'SET lastEventTime = :timestamp';
    let expressionAttributeValues = {
      ':timestamp': timestamp
    };

    // If game session doesn't exist, create it
    if (!gameSession) {
      updateExpression += ', gameStatus = :status, createdAt = :createdAt';
      expressionAttributeValues[':status'] = 'active';
      expressionAttributeValues[':createdAt'] = timestamp;
    }

    // Handle different event types for session updates
    switch (eventType.toLowerCase()) {
      case 'score':
      case 'touchdown':
      case 'field_goal':
      case 'safety':
        // Update score-related information
        if (payload.team && payload.points) {
          updateExpression += `, ${payload.team}Score = if_not_exists(${payload.team}Score, :zero) + :points`;
          expressionAttributeValues[':points'] = parseInt(payload.points) || 0;
          expressionAttributeValues[':zero'] = 0;
        }
        break;

      case 'game_start':
      case 'kickoff':
        updateExpression += ', gameStatus = :activeStatus';
        expressionAttributeValues[':activeStatus'] = 'active';
        break;

      case 'game_end':
      case 'final':
        updateExpression += ', gameStatus = :finalStatus';
        expressionAttributeValues[':finalStatus'] = 'completed';
        break;

      case 'timeout':
        if (payload.team) {
          const timeoutField = `${payload.team}Timeouts`;
          updateExpression += `, ${timeoutField} = if_not_exists(${timeoutField}, :zero) + :one`;
          expressionAttributeValues[':one'] = 1;
          expressionAttributeValues[':zero'] = 0;
        }
        break;

      case 'quarter_change':
      case 'period_change':
        if (payload.quarter || payload.period) {
          updateExpression += ', currentQuarter = :quarter';
          expressionAttributeValues[':quarter'] = payload.quarter || payload.period;
        }
        break;
    }

    // Perform the update
    await docClient.send(new UpdateCommand({
      TableName: GAME_SESSIONS_TABLE,
      Key: { gameId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));

    console.log(`Game session updated for gameId: ${gameId}, eventType: ${eventType}`);
  
  } catch (error) {
    console.error('Error updating game session:', error);
    // Don't throw here - we still want the event to be recorded even if session update fails
  }
}
