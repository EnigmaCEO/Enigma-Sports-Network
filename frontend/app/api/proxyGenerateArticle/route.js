import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { lambdaUrl, payload } = await request.json();

    if (!lambdaUrl) {
      return NextResponse.json(
        { error: 'lambdaUrl is required' },
        { status: 400 }
      );
    }

    const res = await fetch(lambdaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });

    const text = await res.text().catch(() => null);
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    return NextResponse.json(
      { status: res.status, body: data },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
