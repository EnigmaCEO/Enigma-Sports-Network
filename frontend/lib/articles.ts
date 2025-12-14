export type EsnArticle = {
  type: 'ESN_RECAP';
  title: string;
  dek: string;
  byline: string;
  publishedAt: string;
  body: string[];
  keyMoments: string[];
  tags: string[];
};

export type EsnArticleResponse = {
  article: EsnArticle;
};

const BASE_URL = 'https://d2zq9pbfla02w4.cloudfront.net';

export async function getArticle(gameId: string): Promise<EsnArticleResponse | null> {
  if (!gameId) return null;

  const url = `${BASE_URL}/${encodeURIComponent(gameId)}.json`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn(`getArticle: non-OK status ${res.status} for gameId=${gameId}`);
      return null;
    }

    const json = (await res.json()) as EsnArticleResponse;
    if (!json || !json.article) {
      console.warn(`getArticle: missing article field for gameId=${gameId}`);
      return null;
    }
    return json;
  } catch (err) {
    console.warn(`getArticle: failed for gameId=${gameId}`, err);
    return null;
  }
}
