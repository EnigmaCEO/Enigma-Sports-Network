import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { lambdaUrl, payload } = await req.json();

    const targetUrl = lambdaUrl || process.env.LAMBDA_PODCAST_URL;
    if (!targetUrl) {
      return NextResponse.json(
        { error: 'No generatePodcast lambda URL configured' },
        { status: 500 }
      );
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // payload should match the backend expected schema: { gameId, podcast: {...} }
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return NextResponse.json(
      { status: res.status, body: data },
      { status: res.status }
    );
  } catch (err) {
    console.error('proxyGeneratePodcast error:', err);
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
