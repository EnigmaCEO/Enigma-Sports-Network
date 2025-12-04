'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MockGamePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [gameId, setGameId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  const generateGameId = () => {
    return `game-${Date.now()}`;
  };

  const sendMockEvents = async () => {
    const currentGameId = gameId || generateGameId();
    setIsLoading(true);
    setStatus('Sending mock events...');

    const mockEvents = [
      {
        gameId: currentGameId,
        type: 'play',
        time: '15:00',
        text: 'Kickoff by Team A to start the game'
      },
      {
        gameId: currentGameId,
        type: 'play',
        time: '14:32',
        text: 'First down for Team B at the 25-yard line'
      },
      {
        gameId: currentGameId,
        type: 'score',
        time: '12:15',
        text: 'Touchdown! Team B scores from 10 yards out'
      },
      {
        gameId: currentGameId,
        type: 'commentary',
        time: '12:14',
        text: 'What an incredible drive by Team B, marching 75 yards in just 8 plays'
      }
    ];

    try {
      // Send events sequentially
      for (let i = 0; i < mockEvents.length; i++) {
        setStatus(`Sending event ${i + 1} of ${mockEvents.length}...`);
        await fetch('/api/ingest-event', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockEvents[i]),
        });
        
        // Small delay between events
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setStatus('Events sent successfully! Redirecting...');
      setIsLoading(false);
      
      // Redirect to game page
      setTimeout(() => {
        router.push(`/games/${currentGameId}`);
      }, 1000);
      
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Mock Game Generator</h1>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="gameId" className="block text-sm font-medium text-gray-700 mb-1">
            Game ID (leave empty to auto-generate)
          </label>
          <input
            type="text"
            id="gameId"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="e.g., game-123 or leave empty"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        <button
          onClick={sendMockEvents}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Sending Events...' : 'Send Sample Events'}
        </button>

        {status && (
          <div className="p-3 bg-gray-100 border rounded-md">
            <p className="text-sm text-gray-700">{status}</p>
          </div>
        )}

        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="font-medium text-yellow-800 mb-2">Sample Events Preview:</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• Kickoff event</li>
            <li>• First down play</li>
            <li>• Touchdown score</li>
            <li>• Commentary on the drive</li>
            <li>• Timeout call</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
