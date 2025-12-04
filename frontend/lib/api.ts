// frontend/lib/api.ts
import type { GameEvent } from "../types/events";

const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "";

function getBaseUrl(): string {
  // Prefer explicit public API base, then Vercel-provided host, then localhost fallback.
  if (RAW_BASE) return RAW_BASE.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  if (process.env.NEXT_PUBLIC_HOST) return process.env.NEXT_PUBLIC_HOST.replace(/\/$/, '');
  // Local dev fallback - adjust if your backend runs on a different port
  return "http://localhost:3000";
}

function buildUrl(path: string): string {
  // Ensure path begins with a slash
  const p = path.startsWith("/") ? path : `/${path}`;
  return new URL(p, getBaseUrl()).toString();
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function getTimeline(gameId: string): Promise<unknown[]> {
  try {
    // Use an absolute URL on the server (Node) and a relative URL in the browser.
    const path = `/api/timeline?gameId=${encodeURIComponent(gameId)}`;
    const url = typeof window === "undefined" ? buildUrl(path) : path;
    const res = await fetch(url, { cache: "no-store" });
    const contentType = res.headers.get("content-type") ?? "";

    // If deployment protection returned HTML (401) or other non-JSON, return empty array
    if (!res.ok || contentType.includes("text/html")) {
      console.warn("[getTimeline] non-JSON or error response", { url, status: res.status, contentType });
      return [];
    }

    if (!contentType.includes("application/json")) {
      console.warn("[getTimeline] unexpected content-type (not JSON)", { url, contentType });
      return [];
    }

    const json = await res.json();
    return Array.isArray(json?.timeline) ? json.timeline : [];
  } catch (err) {
    console.error("[getTimeline] fetch error:", err);
    return [];
  }
}

export async function ingestEvent(event: unknown) {
  // Sends a single ESN event to the ingest endpoint as JSON.
  // Adjust the URL if your ingest Lambda is mounted elsewhere.
  try {
    const path = "/api/ingest";
    const url = typeof window === "undefined" ? buildUrl(path) : path;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    // You can inspect res.ok / res.status if needed
    return res;
  } catch (err) {
    console.error("ingestEvent error", err);
    throw err;
  }
}

// Minimal compatibility wrapper kept for older imports.
// It will create a tiny event to indicate ingestion was requested.
// Existing callers that relied on ingestMockEvents won't break.
export async function ingestMockEvents(gameId: string) {
  const placeholderEvent = {
    eventId: `${gameId}-placeholder-${Date.now()}`,
    gameId,
    appId: "efl-online",
    sport: "american_football",
    type: "ingest_requested",
    timestamp: new Date().toISOString(),
    payload: { note: "placeholder event from ingestMockEvents" },
  };
  return ingestEvent(placeholderEvent);
}

export async function startMockGame(): Promise<{ gameId: string }> {
  const url = buildUrl("/mock-game");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  return parseJsonSafe<{ gameId: string }>(res);
}
