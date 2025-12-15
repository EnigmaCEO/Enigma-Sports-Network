import { NextResponse } from "next/server";
import { getArticle } from "../../../lib/articles";

const HIGHLIGHT_GAME_ID = "game-efl-demo-1765614117580";

export async function GET() {
  try {
    const articleResp = await getArticle(HIGHLIGHT_GAME_ID);
    if (!articleResp || !articleResp.article) {
      return NextResponse.json(
        { error: "No article for highlight", article: null },
        { status: 404 }
      );
    }
    return NextResponse.json({ article: articleResp.article });
  } catch (err) {
    console.error("[api/highlight-article] getArticle error:", err);
    return NextResponse.json(
      { error: "Failed to load highlight article" },
      { status: 500 }
    );
  }
}
