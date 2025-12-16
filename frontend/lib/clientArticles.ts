"use client";

export interface ClientArticle {
  title: string;
  dek?: string;
  body?: string[];
  keyMoments?: string[];
  tags?: string[];
  publishedAt?: string;
  byline?: string;
}

export interface ClientArticleResponse {
  article: ClientArticle | null;
  error?: string;
}

// fetch the single highlight article via API
// optional gameId lets us fetch a specific game's highlight article
export async function fetchHighlightArticle(
  gameId?: string
): Promise<ClientArticle | null> {
  try {
    const url = gameId
      ? `/api/highlight-article?gameId=${encodeURIComponent(gameId)}`
      : "/api/highlight-article";

    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        "[clientArticles] fetchHighlightArticle failed with status",
        res.status,
        "for gameId",
        gameId
      );
      return null;
    }

    const json = (await res.json()) as ClientArticleResponse;
    if (!json || !json.article) {
      console.warn(
        "[clientArticles] fetchHighlightArticle returned no article for gameId",
        gameId
      );
      return null;
    }
    return json.article;
  } catch (err) {
    console.error(
      "[clientArticles] fetchHighlightArticle error for gameId",
      gameId,
      err
    );
    return null;
  }
}
