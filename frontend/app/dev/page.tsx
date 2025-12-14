"use client";

import { useState } from 'react';

// ...existing code...

export default function DevPage() {
  // ...existing state...
  const [recapGameId, setRecapGameId] = useState('');
  const [recapResult, setRecapResult] = useState<unknown | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  // ...existing hooks / helpers...

  async function handleGenerateRecap() {
    setRecapLoading(true);
    setRecapError(null);
    setRecapResult(null);
    try {
      const endpoint = process.env.NEXT_PUBLIC_LAMBDA_RECAP || process.env.LAMBDA_RECAP;
      if (!endpoint) {
        throw new Error('LAMBDA_RECAP/NEXT_PUBLIC_LAMBDA_RECAP is not configured');
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: recapGameId }),
      });

      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        if (typeof json === 'object' && json !== null && 'error' in (json as Record<string, unknown>)) {
          const errVal = (json as Record<string, unknown>)['error'];
          errMsg = String(errVal);
        }
        throw new Error(errMsg);
      }

      setRecapResult(json);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setRecapError(err.message);
      } else {
        setRecapError(String(err));
      }
    } finally {
      setRecapLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* ...existing dev sections... */}

      <section className="border rounded p-3">
        <h2 className="font-semibold mb-2">Generate Recap (LLM podcast JSON)</h2>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            className="border px-2 py-1 flex-1"
            placeholder="gameId"
            value={recapGameId}
            onChange={(e) => setRecapGameId(e.target.value)}
          />
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            onClick={handleGenerateRecap}
            disabled={!recapGameId || recapLoading}
          >
            {recapLoading ? 'Loading…' : 'Call LAMBDA_RECAP'}
          </button>
        </div>
        {recapError && (
          <div className="text-red-600 text-sm mb-2">
            Error: {recapError}
          </div>
        )}
        {recapResult != null && (
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-96">
            {JSON.stringify(recapResult as unknown, null, 2)}
          </pre>
        )}
      </section>

      {/* ...existing code... */}
    </div>
  );
}
