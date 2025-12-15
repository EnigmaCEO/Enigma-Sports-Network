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
export async function fetchHighlightArticle(): Promise<ClientArticle | null> {
  try {
    const res = await fetch("/api/highlight-article", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        "[clientArticles] fetchHighlightArticle failed with status",
        res.status
      );
      return null;
    }

    const json = (await res.json()) as ClientArticleResponse;
    if (!json || !json.article) {
      console.warn("[clientArticles] fetchHighlightArticle returned no article");
      return null;
    }
    return json.article;
  } catch (err) {
    console.error("[clientArticles] fetchHighlightArticle error:", err);
    return null;
  }
}
