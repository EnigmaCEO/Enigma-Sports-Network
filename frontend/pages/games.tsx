import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TimelineEvent {
  time: string;
  type: string;
  text: string;
}

export default function GamePage() {
  const router = useRouter();
  const { gameId } = router.query;
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;

    const fetchTimeline = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/timeline?gameId=${gameId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setTimeline(data.timeline || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch timeline');
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [gameId]);

  if (loading) return <div className="p-4">Loading game timeline...</div>;
  
  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-600 mb-4">Error: {error}</div>
        <Link href="/dev/mock-game" className="text-blue-600 underline">
          Go to Mock Game Generator
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Game {gameId}</h1>
        <Link href="/dev/mock-game" className="text-blue-600 underline">
          Generate Mock Events
        </Link>
      </div>

      {timeline.length === 0 ? (
        <div className="text-gray-600">
          No events found for this game.
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold mb-4">Timeline</h2>
          {timeline.map((event, index) => (
            <div key={index} className="border-l-4 border-blue-500 pl-4 py-2 bg-gray-50">
              <div className="flex items-center gap-4 mb-1">
                <span className="font-mono text-sm text-gray-600">{event.time}</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs uppercase font-medium">
                  {event.type}
                </span>
              </div>
              <div className="text-gray-800">{event.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}