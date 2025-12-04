import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const eventData = await req.json();
+    // quick server-side log to confirm the route is hit in dev
+    console.log("[/ingest] received event", eventData?.eventId ?? "<no-id>");

    const lambdaUrl =
      process.env.LAMBDA_EVENTS ||
      "https://ypxg25bn43u325wgzxrkdluxvy0rhnav.lambda-url.us-east-1.on.aws/";

    const response = await fetch(lambdaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData),
    });

    const text = await response.text().catch(() => "");
    const status = response.status;
    const contentType = response.headers.get("content-type") || "text/plain";

    return new Response(text, { status, headers: { "content-type": contentType } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to ingest event", details: msg }, { status: 500 });
  }
}
