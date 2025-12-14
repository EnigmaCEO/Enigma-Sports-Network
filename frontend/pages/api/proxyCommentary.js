export default async function handler(req, res) {
  // only POST expected
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lambdaUrl = process.env.LAMBDA_RECAP;
  if (!lambdaUrl) {
    console.error('LAMBDA_RECAP not set on server');
    return res.status(500).json({ error: 'Server misconfigured: LAMBDA_RECAP not set' });
  }

  const payload = req.body;
  console.log('Proxying request to commentary lambda', { lambdaUrl, payload });

  try {
    const response = await fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      // server-side fetch avoids browser CORS restrictions
    });

    const text = await response.text().catch(() => null);
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

    console.log('Lambda proxied response status:', response.status);
    // forward status and body
    res.status(response.status).json({ status: response.status, body: data });
  } catch (err) {
    console.error('Proxy request failed:', err);
    res.status(502).json({ error: 'Proxy failed to call Lambda', details: String(err?.message || err) });
  }
}
