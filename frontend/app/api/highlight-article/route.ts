import { NextRequest, NextResponse } from "next/server";
import { getArticle } from "../../../lib/articles";

// default/global highlight game when no explicit gameId is requested
const DEFAULT_HIGHLIGHT_GAME_ID = "game-efl-demo-1765525727122";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gameIdParam = searchParams.get("gameId");

    // If a specific gameId is requested, return that game's article
    const targetGameId = gameIdParam || DEFAULT_HIGHLIGHT_GAME_ID;

    const articleResp = await getArticle(targetGameId);
    if (!articleResp || !articleResp.article) {
      return NextResponse.json(
        {
          error: `No article for highlight gameId=${targetGameId}`,
          article: null,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ article: articleResp.article });
  } catch (err) {
    console.error("[api/highlight-article] getArticle error:", err);
    return NextResponse.json(
      { error: "Failed to load highlight article", article: null },
      { status: 500 }
    );
  }
}
