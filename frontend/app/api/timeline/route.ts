import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get("gameId");
  if (!gameId) {
    return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  }

  const lambdaUrl =
    process.env.LAMBDA_TIMELINE ||
    "https://62tj2k6elgjrcuxyesxfpl5dam0vdpwf.lambda-url.us-east-1.on.aws/";

  try {
    // Forward both forms so the Lambda receives the DynamoDB key name it expects
    const forwardUrl = `${lambdaUrl}?gameId=${encodeURIComponent(gameId)}&GameID=${encodeURIComponent(gameId)}`;
    console.log("[/api/timeline] proxy ->", forwardUrl);
    const resp = await fetch(forwardUrl);
    const bodyText = await resp.text().catch(() => "");
    const contentType = resp.headers.get("content-type") || "application/json";

    if (!resp.ok) {
      console.error("[/api/timeline] lambda error", resp.status, bodyText.slice(0, 200));
      return new Response(bodyText || `Lambda error ${resp.status}`, {
        status: 502,
        headers: { "content-type": contentType },
      });
    }

    return new Response(bodyText, {
      status: 200,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    console.error("[/api/timeline] unexpected error", err);
    return NextResponse.json(
      { error: "Failed to fetch timeline", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
