export default async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const res = await fetch(url, init);
  const contentType = res.headers.get("content-type") ?? "";

  // If deployment protection returned HTML (401 page) or non-JSON, don't attempt res.json()
  if (!res.ok || contentType.includes("text/html")) {
    console.warn("[fetchJson] non-JSON or error response", { url, status: res.status, contentType });
    return null;
  }

  if (!contentType.includes("application/json")) {
    // Not JSON — treat as missing/unsupported for our callers
    console.warn("[fetchJson] unexpected content-type, expected JSON", { url, contentType });
    return null;
  }

  return res.json();
}
