import { NextResponse } from 'next/server';

const DEV_ENABLED =
  process.env.NODE_ENV === 'development' ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_PAGES === 'true';

export async function POST(req: Request) {
  if (!DEV_ENABLED) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  try {
    const body = await req.json();

    if (!body || !body.gameId || !body.type) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Simple dev-side handling: log the incoming mock event.
    // Replace this with forwarding logic to your ingestion service if required.
    console.log('[dev] ingest-event:', JSON.stringify(body));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}
