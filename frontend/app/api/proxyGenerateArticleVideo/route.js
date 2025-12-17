// Proxy for the "generate article video" lambda.
// Mirrors the patterns used by other proxy routes (e.g. proxyGenerateArticle / proxyGeneratePodcast).

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { lambdaUrl, payload } = body || {};

    if (!lambdaUrl) {
      return new Response(
        JSON.stringify({ error: 'lambdaUrl is required in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const res = await fetch(lambdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });

    const text = await res.text().catch(() => null);

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    // Wrap to keep consistent shape: { status, body }
    const wrapped = { status: res.status, body: data };

    return new Response(JSON.stringify(wrapped), {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error('proxyGenerateArticleVideo: unexpected error', err);
    return new Response(
      JSON.stringify({
        error: 'proxyGenerateArticleVideo internal error',
        details: String(err?.message ?? err),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
