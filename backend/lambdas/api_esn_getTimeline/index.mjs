import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const GAME_EVENTS_TABLE = process.env.GAME_EVENTS_TABLE || 'ESN_GameEvents';

export const handler = async (event) => {
  try {
    // Extract gameId from query parameters
    const gameId = event.queryStringParameters?.gameId;
    
    if (!gameId) {
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

    // Query all events for the gameId, sorted by timestamp (SK)
    const queryParams = {
      TableName: GAME_EVENTS_TABLE,
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': gameId
      },
      ScanIndexForward: true // Sort by sort key in ascending order (oldest first)
    };

    const result = await docClient.send(new QueryCommand(queryParams));
    
    // Transform the data to match the expected format
    const timeline = result.Items?.map(item => {
      // Extract time from payload or use timestamp
      const time = item.payload?.time || 
                   item.timestamp?.split('T')[1]?.substring(0, 5) || 
                   new Date(item.timestamp).toLocaleTimeString('en-US', { 
                     hour12: false, 
                     hour: '2-digit', 
                     minute: '2-digit' 
                   });

      return {
        type: item.type,
        payload: item.payload || {},
        timestamp: item.timestamp,
        time: time,
        text: item.payload?.text || generateEventText(item.type, item.payload),
        eventId: item.eventId
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
  switch (type.toLowerCase()) {
    case 'kickoff':
      return `Kickoff${payload.team ? ` by ${payload.team}` : ''}`;
    
    case 'touchdown':
      return `Touchdown${payload.team ? ` for ${payload.team}` : ''}${payload.player ? ` by ${payload.player}` : ''}${payload.points ? ` (${payload.points} points)` : ''}`;
    
    case 'field_goal':
      return `Field goal${payload.team ? ` by ${payload.team}` : ''}${payload.distance ? ` from ${payload.distance} yards` : ''}`;
    
    case 'timeout':
      return `Timeout${payload.team ? ` called by ${payload.team}` : ''}`;
    
    case 'first_down':
    case 'play':
      if (payload.description) return payload.description;
      return `${type.replace('_', ' ')} play`;
    
    case 'score':
      return `Score update${payload.team ? ` for ${payload.team}` : ''}${payload.points ? ` (+${payload.points})` : ''}`;
    
    case 'quarter_change':
    case 'period_change':
      return `${payload.quarter || payload.period ? `Quarter ${payload.quarter || payload.period}` : 'Quarter change'}`;
    
    case 'game_start':
      return 'Game started';
    
    case 'game_end':
    case 'final':
      return 'Game ended';
    
    case 'commentary':
      return payload.message || payload.comment || 'Commentary';
    
    default:
      return `${type} event`;
  }
}
