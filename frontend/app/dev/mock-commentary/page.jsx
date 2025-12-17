'use client';
import { useState } from 'react';

export default function DevCommentaryPage() {
  const [gameId, setGameId] = useState('');
  const [result, setResult] = useState(null);
  const [proxyResult, setProxyResult] = useState(null);

  // New: raw commentary JSON as returned by commentary lambda
  const [commentary, setCommentary] = useState(null);

  // New: response from generatePodcast lambda
  const [podcastResult, setPodcastResult] = useState(null);
  // New: response from generateArticle lambda
  const [articleResult, setArticleResult] = useState(null);
  // New: response from article image lambda
  const [articleImageResult, setArticleImageResult] = useState(null);
  // new: response from article video lambda
  const [articleVideoResult, setArticleVideoResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState('');
  const [error, setError] = useState(null);

  const lambdaUrl = process.env.NEXT_PUBLIC_LAMBDA_RECAP || '';
  const podcastLambdaUrl = process.env.NEXT_PUBLIC_LAMBDA_PODCAST || '';
  // New: article lambda public URL
  const articleLambdaUrl = process.env.NEXT_PUBLIC_LAMBDA_ARTICLE || '';
  // New: article image lambda URL
  const articleImageLambdaUrl = process.env.NEXT_PUBLIC_LAMBDA_ARTICLE_IMAGE || '';
  // new: article video lambda URL
  const articleVideoLambdaUrl = process.env.NEXT_PUBLIC_LAMBDA_ARTICLE_VIDEO || '';

  async function callDirect(e) {
    e && e.preventDefault();
    setError(null);
    setResult(null);
    setProxyResult(null);
    setDebug('');
    if (!lambdaUrl) { setError('NEXT_PUBLIC_LAMBDA_RECAP not set'); return; }
    if (!gameId) { setError('enter gameId'); return; }
    setLoading(true);

    // show basic client info
    setDebug((d)=> d + `navigator.onLine=${navigator.onLine}\n`);
    setDebug((d)=> d + `calling ${lambdaUrl}\n`);

    try {
      const res = await fetch(lambdaUrl, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId })
      });

      setDebug((d)=> d + `POST status ${res.status}\n`);
      // show response headers for debugging CORS
      res.headers.forEach((v,k)=> setDebug((s)=> s + `${k}: ${v}\n`));

      const text = await res.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
      if (!res.ok) {
        setError(`HTTP ${res.status} ${res.statusText} - ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      } else {
        setResult({ status: res.status, body: data });
      }
    } catch (err) {
      console.error('Direct fetch failed:', err);
      setError(String(err?.message || err));
      setDebug((d)=> d + `Direct fetch exception: ${String(err?.message || err)}\n`);
    } finally {
      setLoading(false);
    }
  }

  async function callProxy(e) {
    e && e.preventDefault();
    setProxyResult(null);
    setPodcastResult(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/proxyCommentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId })
      });
      const data = await res.json();

      setProxyResult({ status: res.status, body: data });

      if (!res.ok) {
        setError(`Proxy returned ${res.status}`);
        setCommentary(null);
      } else {
        // data is { status, body }, but body holds the actual game + podcast
        // Unwrap once so commentary is just { gameId, podcast, ... }
        const inner = data && data.body ? data.body : data;
        setCommentary(inner);
      }
    } catch (err) {
      console.error('Proxy call failed:', err);
      setError(String(err?.message || err));
      setCommentary(null);
    } finally {
      setLoading(false);
    }
  }

  
  // Helper: check if commentary has what the podcast lambda expects
  function hasValidCommentary(c) {
    if (!c) return false;

    // After unwrap, shape is:
    // { gameId, podcast: { segments: [...] , ... }, ... }
    const baseGameId = c.gameId || gameId;
    const podcast = c.podcast || {};
    const segments = Array.isArray(podcast.segments) ? podcast.segments : [];

    return Boolean(baseGameId && segments.length > 0);
  }

  /**
   * Build payload for generatePodcast lambda from commentary response.
   * Expected by backend:
   * {
   *   gameId: "123",
   *   podcast: {
   *     title: "...",
   *     durationMinutes: 3.2,
   *     segments: [{ id, speaker, tone, script }, ...],
   *     highlights: [...]
   *   }
   * }
   */
  function buildPodcastPayloadFromCommentary(commentaryJson) {
    if (!hasValidCommentary(commentaryJson)) return null;

    const baseGameId = commentaryJson.gameId || gameId;
    const podcastSource = commentaryJson.podcast || {};

    const podcast = {
      title: podcastSource.title || 'Auto-generated recap',
      durationMinutes: podcastSource.durationMinutes || undefined,
      segments: podcastSource.segments || [],
      highlights: podcastSource.highlights || [],
    };

    return { gameId: baseGameId, podcast };
  }

  async function callGeneratePodcast(e) {
    e && e.preventDefault();
    setError(null);
    setPodcastResult(null);
    setLoading(true);

    try {
      const payload = buildPodcastPayloadFromCommentary(commentary);
      if (!payload) {
        setError('Commentary not loaded or invalid; run "Fetch Commentary" first and ensure it has segments.');
        return;
      }

      if (!podcastLambdaUrl) {
        setError('NEXT_PUBLIC_LAMBDA_PODCAST not set; cannot call generatePodcast lambda.');
        return;
      }

      // Use proxy route, provide target lambda URL explicitly
      const res = await fetch('/api/proxyGeneratePodcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lambdaUrl: podcastLambdaUrl,
          payload,
        }),
      });

      const data = await res.json().catch(() => null);
      setPodcastResult({ status: res.status, body: data });

      if (!res.ok) {
        setError(`GeneratePodcast returned ${res.status}`);
      }
    } catch (err) {
      console.error('GeneratePodcast call failed:', err);
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // New: call generateArticle lambda for the current gameId
  async function callGenerateArticle(e) {
    e && e.preventDefault();
    setError(null);
    setArticleResult(null);
    setLoading(true);

    try {
      if (!gameId) {
        setError('enter gameId');
        return;
      }
      if (!articleLambdaUrl) {
        setError('NEXT_PUBLIC_LAMBDA_ARTICLE not set; cannot call generateArticle lambda.');
        return;
      }

      // Use a proxy route similar to generatePodcast
      const res = await fetch('/api/proxyGenerateArticle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lambdaUrl: articleLambdaUrl,
          payload: { gameId },
        }),
      });

      const data = await res.json().catch(() => null);
      setArticleResult({ status: res.status, body: data });

      if (!res.ok) {
        setError(`GenerateArticle returned ${res.status}`);
      }
    } catch (err) {
      console.error('GenerateArticle call failed:', err);
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // New: call generateArticleHighlight (article image) lambda via proxy
  async function callGenerateArticleImage(e) {
    e && e.preventDefault();
    setError(null);
    setArticleImageResult(null);
    setLoading(true);

    try {
      if (!gameId) {
        setError('enter gameId');
        return;
      }
      if (!articleImageLambdaUrl) {
        setError('NEXT_PUBLIC_LAMBDA_ARTICLE_IMAGE not set; cannot call article image lambda.');
        return;
      }

      const res = await fetch('/api/proxyGenerateArticleImage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lambdaUrl: articleImageLambdaUrl,
          payload: { gameId },
        }),
      });

      const data = await res.json().catch(() => null);
      setArticleImageResult({ status: res.status, body: data });

      if (!res.ok) {
        setError(`GenerateArticleImage returned ${res.status}`);
      }
    } catch (err) {
      console.error('GenerateArticleImage call failed:', err);
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // New: call generateArticleVideo lambda via proxy
  async function callGenerateArticleVideo(e) {
    e && e.preventDefault();
    setError(null);
    setArticleVideoResult(null);
    setLoading(true);

    try {
      if (!gameId) {
        setError('enter gameId');
        return;
      }
      if (!articleVideoLambdaUrl) {
        setError('NEXT_PUBLIC_LAMBDA_ARTICLE_VIDEO not set; cannot call article video lambda.');
        return;
      }

      const res = await fetch('/api/proxyGenerateArticleVideo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lambdaUrl: articleVideoLambdaUrl,
          payload: { gameId },
        }),
      });

      const data = await res.json().catch(() => null);
      setArticleVideoResult({ status: res.status, body: data });

      if (!res.ok) {
        setError(`GenerateArticleVideo returned ${res.status}`);
      }
    } catch (err) {
      console.error('GenerateArticleVideo call failed:', err);
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  const canGeneratePodcast = hasValidCommentary(commentary);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, Arial' }}>
      <h1>Dev: Call Commentary Lambda (debug)</h1>

      <form onSubmit={callDirect} style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          Game ID: 
          <input
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="enter gameId"
            style={{ marginLeft: 8, padding: 6, minWidth: 320 }}
          />
        </label>

        <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={callProxy}
            disabled={loading || !gameId}
            style={{ padding: '8px 12px' }}
          >
            Fetch Commentary
          </button>

          <button
            type="button"
            onClick={callGeneratePodcast}
            disabled={loading || !canGeneratePodcast}
            style={{ padding: '8px 12px' }}
          >
            Generate Podcast from Commentary
          </button>

          {/* New: Generate Article from gameId */}
          <button
            type="button"
            onClick={callGenerateArticle}
            disabled={loading || !gameId}
            style={{ padding: '8px 12px' }}
          >
            Generate Article
          </button>

          {/* New: Generate Article Image from article JSON in S3 */}
          <button
            type="button"
            onClick={callGenerateArticleImage}
            disabled={loading || !gameId}
            style={{ padding: '8px 12px' }}
          >
            Generate Article Image
          </button>

          {/* New: Generate Article Video from article JSON in S3 */}
          <button
            type="button"
            onClick={callGenerateArticleVideo}
            disabled={loading || !gameId}
            style={{ padding: '8px 12px' }}
          >
            Generate Article Video
          </button>
        </div>
      </form>

      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>Error: {error}</div>}

      {result && (
        <div>
          <h2>Direct Response (status {result.status})</h2>
          <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 6, maxHeight: 360, overflow: 'auto', color: 'black' }}>
            {typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}

      {proxyResult && (
        <div>
          <h2>Commentary Proxy Response (status {proxyResult.status})</h2>
          <pre style={{ background: '#eef8ff', padding: 12, borderRadius: 6, maxHeight: 360, overflow: 'auto', color: 'black' }}>
            {typeof proxyResult.body === 'string' ? proxyResult.body : JSON.stringify(proxyResult.body, null, 2)}
          </pre>
        </div>
      )}

      {podcastResult && (
        <div>
          <h2>GeneratePodcast Response (status {podcastResult.status})</h2>
          <pre style={{ background: '#e6fff4', padding: 12, borderRadius: 6, maxHeight: 360, overflow: 'auto', color: 'black' }}>
            {typeof podcastResult.body === 'string' ? podcastResult.body : JSON.stringify(podcastResult.body, null, 2)}
          </pre>
        </div>
      )}

      {/* New: show generateArticle response */}
      {articleResult && (
        <div>
          <h2>GenerateArticle Response (status {articleResult.status})</h2>
          <pre
            style={{
              background: '#f0f0ff',
              padding: 12,
              borderRadius: 6,
              maxHeight: 360,
              overflow: 'auto',
              color: 'black',
            }}
          >
            {typeof articleResult.body === 'string'
              ? articleResult.body
              : JSON.stringify(articleResult.body, null, 2)}
          </pre>
        </div>
      )}

      {/* New: show article image lambda response */}
      {articleImageResult && (
        <div>
          <h2>GenerateArticleImage Response (status {articleImageResult.status})</h2>
          <pre
            style={{
              background: '#eaf7ff',
              padding: 12,
              borderRadius: 6,
              maxHeight: 360,
              overflow: 'auto',
              color: 'black',
            }}
          >
            {typeof articleImageResult.body === 'string'
              ? articleImageResult.body
              : JSON.stringify(articleImageResult.body, null, 2)}
          </pre>
        </div>
      )}

      {/* New: show article video lambda response */}
      {articleVideoResult && (
        <div>
          <h2>GenerateArticleVideo Response (status {articleVideoResult.status})</h2>
          <pre
            style={{
              background: '#e8fff0',
              padding: 12,
              borderRadius: 6,
              maxHeight: 360,
              overflow: 'auto',
              color: 'black',
            }}
          >
            {typeof articleVideoResult.body === 'string'
              ? articleVideoResult.body
              : JSON.stringify(articleVideoResult.body, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <h3>Debug log</h3>
        <pre style={{ background: '#fff8e6', padding: 12, borderRadius: 6, maxHeight: 300, overflow: 'auto', color: 'black' }}>
          {debug || 'No debug output yet'}
        </pre>
      </div>
    </div>
  );
}
