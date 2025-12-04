"use client";

import useRealtime from "./hooks/useRealtime";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import fetchJson from "../lib/fetchJson";

interface TimelineItem {
  id?: string;
  eventId?: string;
  gameId?: string; 
  appId?: string; 
  sport?: string; 
  type: string;
  timestamp: string;
  title?: string;
  subtitle?: string;
  timeAgo?: string;
  text?: string;
  time?: string;
  payload?: {
    team?: string;
    player?: string;
    description?: string;
    // possible extra fields for game events
    // NOTE: removed appId from payload — always read from top-level
    appName?: string;      // keep optional in case backend sends it
    homeTeam?: string;
    awayTeam?: string;
    homeScore?: number;
    awayScore?: number;
    quarter?: number;
  };
}

interface ApiTimelineItem {
  eventId: string;
  gameId: string; 
  appId: string;  
  sport: string;  
  type: string;
  timestamp: string;
  text?: string;
  time?: string;
  payload?: {
    team?: string;
    player?: string;
    description?: string;
    homeTeam?: string;
    awayTeam?: string;
    homeScore?: number;
    awayScore?: number;
    quarter?: number;
    // NOTE: removed appId from payload — always read from top-level
    appName?: string;
  };
}

export default function Home() {
  const { activities, status } = useRealtime();
  // new: prefer timeline from backend (gameId=0) for "Recent Activity"
  const [recentActivities, setRecentActivities] = useState<TimelineItem[]>([]);

  // use a mounted ref so multiple effects can safely call loadTimeline
  const mountedRef = useRef(true);

  // single reusable loader
  async function loadTimeline() {
    try {
      // narrow the fetched JSON to a shape that may include timeline so TypeScript can validate property access
      const json = (await fetchJson("/api/timeline?gameId=0")) as { timeline?: ApiTimelineItem[] } | null;
      if (!json || !Array.isArray(json.timeline)) {
        // fallback to realtime hook if protected or empty
        console.warn("[timeline] timeline fetch returned no JSON, falling back to realtime hook");
        return;
      }
      const items = json.timeline as ApiTimelineItem[];

      // DEBUG: inspect raw response minimally
      console.log("[timeline] raw json:", json);
      console.log("[timeline] items count:", items.length);

      // helper: safe timestamp value for sorting
      const ts = (it?: ApiTimelineItem) =>
        it && (it.timestamp || it.time) ? new Date(it.timestamp || it.time as string).getTime() : 0;

      // helper: try to extract numeric scores from an event payload or event object
      const extractScoresFrom = (obj?: Record<string, unknown>) => {
        if (!obj) return { home: undefined as number | undefined, away: undefined as number | undefined };

        // direct numeric fields
        const numeric = (v: unknown): number | undefined => {
          if (typeof v === "number") return v;
          if (typeof v === "string") {
            const s = v.trim();
            if (s === "") return undefined;
            const n = Number(s);
            return Number.isNaN(n) ? undefined : n;
          }
          return undefined;
        };

        // try obvious structured snapshots first (prefer these)
        const trySnapshot = () => {
          // include finalScore / final_score variants so game_end payloads are recognized
          const candidates = ["scoreSnapshot", "score_snapshot", "score_snapshot_v1", "score_snapshot_v2", "finalScore", "final_score", "score"];
          for (const key of candidates) {
            const s = (obj as Record<string, unknown>)[key];
            if (s && typeof s === "object") {
              const sObj = s as Record<string, unknown>;
              const home = numeric(sObj["home"] ?? sObj["homeScore"] ?? sObj["home_score"]);
              const away = numeric(sObj["away"] ?? sObj["awayScore"] ?? sObj["away_score"]);
              if (home != null || away != null) return { home, away };
            }
          }
          return { home: undefined as number | undefined, away: undefined as number | undefined };
        };

        // check common patterns after snapshots
        const patterns: Array<() => { home?: number; away?: number }> = [
          () => ({ home: numeric((obj as Record<string, unknown>)["homeScore"]), away: numeric((obj as Record<string, unknown>)["awayScore"]) }),
          () => ({ home: numeric((obj as Record<string, unknown>)["home_score"]), away: numeric((obj as Record<string, unknown>)["away_score"]) }),
          () => ({ home: numeric((obj as Record<string, unknown>)["home"]), away: numeric((obj as Record<string, unknown>)["away"]) }), // sometimes numbers are stored as 'home'/'away'
          () => ({ home: numeric((obj as Record<string, unknown>)["homeTeamScore"]), away: numeric((obj as Record<string, unknown>)["awayTeamScore"]) }),
          () => ({ home: numeric((obj as Record<string, unknown>)["home_team_score"]), away: numeric((obj as Record<string, unknown>)["away_team_score"]) }),
          () => {
            const s = (obj as Record<string, unknown>)["score"];
            if (s && typeof s === "object") {
              const sObj = s as Record<string, unknown>;
              return { home: numeric(sObj["home"]), away: numeric(sObj["away"]) };
            }
            return {};
          },
          () => ({ home: numeric((obj as Record<string, unknown>)["scoreHome"]), away: numeric((obj as Record<string, unknown>)["scoreAway"]) }),
        ];

        // try snapshots first
        const snap = trySnapshot();
        if (snap.home != null || snap.away != null) return snap;

        // then patterns
        for (const p of patterns) {
          const out = p();
          if (out.home != null || out.away != null) return { home: out.home, away: out.away };
        }
        return { home: undefined, away: undefined };
      };

      // search events for the latest numeric score values (newest first)
      // now accepts optional team names so snapshots keyed by team name can be mapped
      const findLatestScores = (
        events: ApiTimelineItem[],
        homeTeamName?: string,
        awayTeamName?: string
      ): { home?: number; away?: number; event?: ApiTimelineItem } => {
        const evs = events.slice().sort((a, b) => ts(b) - ts(a));
        // prefer events that include a payload scoreSnapshot (or variants)
        for (const e of evs) {
          const payloadObj = (e.payload as Record<string, unknown>) ?? undefined;
          if (payloadObj) {
            // if payload contains a dedicated snapshot-like structure, use it and return that event
            const snapKeys = ["scoreSnapshot", "score_snapshot", "score_snapshot_v1", "score_snapshot_v2", "finalScore", "final_score", "score"];
            for (const k of snapKeys) {
              const s = payloadObj[k];
              if (s && typeof s === "object") {
                const sObj = s as Record<string, unknown>;
                // first attempt standard extraction
                const { home, away } = extractScoresFrom(sObj);
                if (home != null || away != null) return { home, away, event: e };

                // if no standard home/away keys, but team names are provided, map by team name keys
                if (homeTeamName || awayTeamName) {
                  const numeric = (v: unknown): number | undefined => {
                    if (typeof v === "number") return v;
                    if (typeof v === "string") {
                      const s = v.trim();
                      if (s === "") return undefined;
                      const n = Number(s);
                      return Number.isNaN(n) ? undefined : n;
                    }
                    return undefined;
                  };
                  const byHomeName = homeTeamName ? numeric(sObj[homeTeamName!]) : undefined;
                  const byAwayName = awayTeamName ? numeric(sObj[awayTeamName!]) : undefined;
                  if (byHomeName != null || byAwayName != null) {
                    return { home: byHomeName, away: byAwayName, event: e };
                  }

                  // fallback: if snapshot contains exactly two numeric values, try to infer ordering
                  const numericEntries = Object.entries(sObj).filter(([, v]) => typeof v === "number" || (typeof v === "string" && String(v).trim() !== "" && !Number.isNaN(Number(String(v).trim()))));
                  if (numericEntries.length === 2) {
                    const values = numericEntries.map(([, v]) => Number(String(v)));
                    return { home: values[0], away: values[1], event: e };
                  }
                }
              }
            }
            // otherwise try to extract from entire payload
            const fromPayload = extractScoresFrom(payloadObj);
            if (fromPayload.home != null || fromPayload.away != null) return { home: fromPayload.home, away: fromPayload.away, event: e };
          }

          // fallback: try top-level event fields
          const fromTop = extractScoresFrom(e as unknown as Record<string, unknown>);
          if (fromTop.home != null || fromTop.away != null) return { home: fromTop.home, away: fromTop.away, event: e };
        }
        return { home: undefined as number | undefined, away: undefined as number | undefined, event: undefined };
      };

      // group items by gameId
      const byGame = new Map<string, ApiTimelineItem[]>();
      const nonGame: ApiTimelineItem[] = [];

      for (const it of items) {
        if (it.gameId) {
          const arr = byGame.get(it.gameId) ?? [];
          arr.push(it);
          byGame.set(it.gameId, arr);
        } else {
          nonGame.push(it);
        }
      }

      const summaries: TimelineItem[] = [];
      console.log("[timeline] games found:", byGame.size);
      // build one summary per gameId
      for (const [gameId, evs] of byGame.entries()) {
        const gameStart = evs.find((e) => e.type === "game_start") ?? null;
        if (!gameStart) {
          console.log(`[timeline] gameId=${gameId} - no game_start found`);
          continue;
        }

        // DEBUG: show keys and payload to understand where appId might be
        try {
          console.debug(`[timeline] gameId=${gameId} gameStart keys:`, Object.keys(gameStart));
          if (gameStart.payload) console.debug(`[timeline] gameId=${gameId} gameStart.payload keys:`, Object.keys(gameStart.payload));
        } catch (err) {
          console.debug(`[timeline] gameId=${gameId} gameStart (raw):`, gameStart);
        }

        // Pull appId from the top-level of the event (appId, app_id, or app)
        const top = gameStart as unknown as Record<string, unknown>;
        const appIdTop =
          (typeof gameStart?.appId === "string" || typeof gameStart?.appId === "number"
            ? String(gameStart.appId)
            : undefined) ??
          (typeof top["app_id"] === "string" || typeof top["app_id"] === "number"
            ? String(top["app_id"])
            : undefined) ??
          (typeof top["app"] === "string" || typeof top["app"] === "number" ? String(top["app"]) : undefined);

        const appId = appIdTop ?? undefined;

        console.debug(`[timeline] gameId=${gameId} resolved appId:`, appId);
        if (!appId) {
          console.warn(`[timeline] gameId=${gameId} - skipping: no top-level appId found on game_start`);
          continue; // skip games without appId per requirement
        }

        const latest = evs.slice().sort((a, b) => ts(b) - ts(a))[0];
        // DEBUG: show latest event summary to confirm where scores/live info live
        console.log(`[timeline] gameId=${gameId} latest event type:`, latest?.type, "timestamp:", latest?.timestamp);
        if (latest?.payload) console.debug(`[timeline] gameId=${gameId} latest.payload keys:`, Object.keys(latest.payload));

        const appDisplay = String(appId);
        const home = gameStart?.payload?.homeTeam ?? gameStart?.payload?.team ?? "Home";
        const away = gameStart?.payload?.awayTeam ?? "Away";

        // get the most recent numeric scores across all events for this game,
        // preferring events that include a scoreSnapshot and returning the event that provided them
        const scoreResult = findLatestScores(evs, home as string | undefined, away as string | undefined);
        const latestHomeScore = scoreResult.home ?? undefined;
        const latestAwayScore = scoreResult.away ?? undefined;
        const snapshotEvent = scoreResult.event ?? latest;

        // Prefer quarter/time information from the snapshot event if available
        const quarter = snapshotEvent?.payload?.quarter ?? latest?.payload?.quarter ?? undefined;
        const homeScoreLabel = latestHomeScore != null ? ` (${latestHomeScore})` : "";
        const awayScoreLabel = latestAwayScore != null ? ` (${latestAwayScore})` : "";
        let timeAgo = snapshotEvent?.time ?? snapshotEvent?.timestamp ?? latest?.time ?? latest?.timestamp ?? "now";
        if (snapshotEvent?.type === "game_end" || latest?.type === "game_end") {
          // Prefer showing actual final scores when we have them.
          const scorePart =
            latestHomeScore != null && latestAwayScore != null
              ? `${latestHomeScore}-${latestAwayScore}`
              : latestHomeScore != null
              ? String(latestHomeScore)
              : latestAwayScore != null
              ? String(latestAwayScore)
              : "";
          timeAgo = scorePart ? `Final • ${scorePart}` : "Final Scores";
        } else {
          const scorePart =
            latestHomeScore != null && latestAwayScore != null
              ? `${latestHomeScore}-${latestAwayScore}`
              : latestHomeScore != null
              ? String(latestHomeScore)
              : latestAwayScore != null
              ? String(latestAwayScore)
              : "";
          const quarterPart = quarter ? ` · Q${quarter}` : "";
          timeAgo = scorePart ? `${scorePart}${quarterPart}` : timeAgo;
        }

        summaries.push({
          id: `game-${gameId}`,
          eventId: latest?.eventId,
          gameId,
          appId: String(appId),
          sport: gameStart?.sport ?? undefined,
          type: "game_summary",
          timestamp: latest?.timestamp ?? gameStart?.timestamp ?? "",
          title: `${home}${homeScoreLabel} vs ${away}${awayScoreLabel}`,
          subtitle:
            (gameStart?.payload && (gameStart.payload.description || `${home} vs ${away}`)) || "",
          timeAgo,
          payload: {
            homeTeam: home,
            awayTeam: away,
            homeScore: latestHomeScore,
            awayScore: latestAwayScore,
            quarter,
            // intentionally no appId in payload
          },
        });
      }

      const mappedNonGame = nonGame.map((it: ApiTimelineItem) => ({
        id: it.eventId || `${it.type}-${it.timestamp}`,
        eventId: it.eventId,
        type: it.type,
        timestamp: it.timestamp,
        // only take top-level appId; do not fall back to payload.appId
        appId: it.appId ?? undefined,
        sport: it.sport ?? undefined,
        title: it.text || String(it.type),
        subtitle:
          (it.payload && (it.payload.team || it.payload.player || it.payload.description)) || "",
        gameId: it.gameId || undefined,
        timeAgo: it.time || it.timestamp || "",
        payload: it.payload,
      }));

      const combined = [...summaries.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")), ...mappedNonGame];
      // DEBUG: final summaries for UI
      console.debug("[timeline] summaries count:", summaries.length, "combined length:", combined.length);
      if (mountedRef.current) setRecentActivities(combined);
    } catch {
      // ignore fetch errors; UI will fall back to hook activities
    }
  }

  // initial load once on mount
  useEffect(() => {
    mountedRef.current = true;
    // schedule loading on the next microtask to avoid calling setState synchronously in the effect
    Promise.resolve().then(() => {
      if (mountedRef.current) loadTimeline();
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // load again when connection becomes 'connected'
  /*useEffect(() => {
    if (status === "connected") {
      loadTimeline();
    }
  }, [status]);*/

  const displayActivities = recentActivities.length > 0 ? recentActivities : activities;

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-5xl space-y-8 py-12 px-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            
            <div>
              <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
                Enigma Sports Network
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Activity Dashboard
              </p>
            </div>
          </div>

        </header>

        {/* Stats */}
        {/*<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#0b0b0b]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Active Matches</div>
                <div className="mt-1 text-2xl font-semibold">
                  {stats.activeMatches}
                </div>
              </div>
              <div className="flex items-center">
                <LoadingSpinner size={status === "connected" ? "sm" : "md"} />
              </div>
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              {status === "connected" ? "+ realtime" : status === "connecting" ? "connecting…" : "offline"}
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#0b0b0b]">
            <div class="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Online Players</div>
                <div className="mt-1 text-2xl font-semibold">
                  {stats.onlinePlayers.toLocaleString()}
                </div>
              </div>
              <div className="flex items-center">
                <LoadingSpinner size={status === "connected" ? "sm" : "md"} />
              </div>
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Peak: 2,002</div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#0b0b0b]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Active Channels</div>
                <div className="mt-1 text-2xl font-semibold">
                  {stats.activeChannels}
                </div>
              </div>
              <div className="flex items-center">
                <LoadingSpinner size={status === "connected" ? "sm" : "md"} />
              </div>
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Realtime voice & chat</div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-[#0b0b0b]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Revenue (30d)</div>
                <div className="mt-1 text-2xl font-semibold">
                  ${stats.revenue.toLocaleString()}
                </div>
              </div>
              <div className="flex items-center">
                <LoadingSpinner size={status === "connected" ? "sm" : "md"} />
              </div>
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">+8% vs previous period</div>
          </div>
        </section>*/}

        {/* Recent Activity */}
        <section className="rounded-lg bg-white p-6 shadow-sm dark:bg-[#0b0b0b]">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50">Recent Games</h2>
          <ul className="mt-4 space-y-3">
            {displayActivities.length > 0 ? (
              displayActivities.map((act) => {
                const gameId = "gameId" in act ? (act as TimelineItem).gameId : undefined;
                const appId = "appId" in act ? (act as TimelineItem).appId : undefined;
                const iconSrc = appId === "efl-online" ? "/efl-online.png" : undefined;
                return (
                  <li key={act.id} className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* show efl-online icon on the left when available */}
                      {iconSrc ? (
                        <Image src={iconSrc} alt="efl-online" width={64} height={64} className="rounded-sm" />
                      ) : null}
                      <div style={{ alignSelf: "center" }}>
                        <div className="text-sm font-medium">
                          {gameId ? (
                            <Link
                              href={`/games/${encodeURIComponent(String(gameId))}`}
                              className="hover:underline"
                            >
                              {act.title}
                            </Link>
                          ) : (
                            act.title
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {/* show subtitle and game id */}
                          
                          {gameId ? `Game ID: ${gameId}` : null}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">{act.timeAgo ?? "now"}</div>
                  </li>
                );
              })
            ) : (
              <>
                <li className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium">Loading game data...</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400"></div>
                  </div>
                  <div className="text-xs text-zinc-500"></div>
                </li>
              </>
            )}
          </ul>
        </section>

        
      </main>
    </div>
  );
}
