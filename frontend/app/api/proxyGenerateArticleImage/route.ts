import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { lambdaUrl, payload } = await req.json();

    if (!lambdaUrl || typeof lambdaUrl !== 'string') {
      return NextResponse.json(
        { error: 'lambdaUrl is required' },
        { status: 400 }
      );
    }

    const res = await fetch(lambdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // ...any auth headers if needed...
      body: JSON.stringify(payload ?? {}),
    });

    const text = await res.text().catch(() => null);
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return NextResponse.json(
      { status: res.status, body },
      { status: res.ok ? 200 : res.status }
    );
  } catch (err: unknown) {
    console.error('proxyGenerateArticleImage error', err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
