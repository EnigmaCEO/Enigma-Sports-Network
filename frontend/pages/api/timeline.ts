import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gameId } = req.query;

  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' });
  }

  try {
    // Replace with your actual Lambda endpoint
    const lambdaUrl = process.env.LAMBDA_TIMELINE || 'https://62tj2k6elgjrcuxyesxfpl5dam0vdpwf.lambda-url.us-east-1.on.aws/';
    const response = await fetch(`${lambdaUrl}?gameId=${gameId}`);
    
    if (!response.ok) {
      throw new Error(`Lambda responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ 
      error: 'Failed to fetch timeline',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}