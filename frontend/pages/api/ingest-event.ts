import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const eventData = req.body;
    
    // Replace with your actual Lambda endpoint
    const lambdaUrl = process.env.LAMBDA_EVENTS || 'https://ypxg25bn43u325wgzxrkdluxvy0rhnav.lambda-url.us-east-1.on.aws/';
    const response = await fetch(`${lambdaUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    });
    
    if (!response.ok) {
      throw new Error(`Lambda responded with status: ${response.status}`);
    }
    
    const result = await response.json();
    res.status(200).json(result);
    
  } catch (error) {
    console.error('Error ingesting event:', error);
    res.status(500).json({ 
      error: 'Failed to ingest event',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}