"use client";

import useRealtime from "./hooks/useRealtime";
import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import fetchJson from "../lib/fetchJson";
import { useScoreboardSlot } from "./layout"; // relative to app root

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
    appName?: string;      
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
    appName?: string;
  };
}

export default function Home() {
  const { activities, status } = useRealtime();
  const [recentActivities, setRecentActivities] = useState<TimelineItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | "all">("all");
  const { setScoreboard } = useScoreboardSlot();

  const mountedRef = useRef(true);

  async function loadTimeline() {
    try {
      const json = (await fetchJson("/api/timeline?gameId=0")) as { timeline?: ApiTimelineItem[] } | null;
      if (!json || !Array.isArray(json.timeline)) {
        console.warn("[timeline] timeline fetch returned no JSON, falling back to realtime hook");
        return;
      }
      const items = json.timeline as ApiTimelineItem[];

      console.log("[timeline] raw json:", json);
      console.log("[timeline] items count:", items.length);

      const ts = (it?: ApiTimelineItem) =>
        it && (it.timestamp || it.time) ? new Date(it.timestamp || it.time as string).getTime() : 0;

      const extractScoresFrom = (obj?: Record<string, unknown>) => {
        if (!obj) return { home: undefined as number | undefined, away: undefined as number | undefined };

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

        const trySnapshot = () => {
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

        const patterns: Array<() => { home?: number; away?: number }> = [
          () => ({ home: numeric((obj as Record<string, unknown>)["homeScore"]), away: numeric((obj as Record<string, unknown>)["awayScore"]) }),
          () => ({ home: numeric((obj as Record<string, unknown>)["home_score"]), away: numeric((obj as Record<string, unknown>)["away_score"]) }),
          () => ({ home: numeric((obj as Record<string, unknown>)["home"]), away: numeric((obj as Record<string, unknown>)["away"]) }),
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

        const snap = trySnapshot();
        if (snap.home != null || snap.away != null) return snap;

        for (const p of patterns) {
          const out = p();
          if (out.home != null || out.away != null) return { home: out.home, away: out.away };
        }
        return { home: undefined, away: undefined };
      };

      const findLatestScores = (
        events: ApiTimelineItem[],
        homeTeamName?: string,
        awayTeamName?: string
      ): { home?: number; away?: number; event?: ApiTimelineItem } => {
        const evs = events.slice().sort((a, b) => ts(b) - ts(a));
        for (const e of evs) {
          const payloadObj = (e.payload as Record<string, unknown>) ?? undefined;
          if (payloadObj) {
            const snapKeys = ["scoreSnapshot", "score_snapshot", "score_snapshot_v1", "score_snapshot_v2", "finalScore", "final_score", "score"];
            for (const k of snapKeys) {
              const s = payloadObj[k];
              if (s && typeof s === "object") {
                const sObj = s as Record<string, unknown>;
                const { home, away } = extractScoresFrom(sObj);
                if (home != null || away != null) return { home, away, event: e };

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

                  const numericEntries = Object.entries(sObj).filter(([, v]) => typeof v === "number" || (typeof v === "string" && String(v).trim() !== "" && !Number.isNaN(Number(String(v).trim()))));
                  if (numericEntries.length === 2) {
                    const values = numericEntries.map(([, v]) => Number(String(v)));
                    return { home: values[0], away: values[1], event: e };
                  }
                }
              }
            }
            const fromPayload = extractScoresFrom(payloadObj);
            if (fromPayload.home != null || fromPayload.away != null) return { home: fromPayload.home, away: fromPayload.away, event: e };
          }

          const fromTop = extractScoresFrom(e as unknown as Record<string, unknown>);
          if (fromTop.home != null || fromTop.away != null) return { home: fromTop.home, away: fromTop.away, event: e };
        }
        return { home: undefined as number | undefined, away: undefined as number | undefined, event: undefined };
      };

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
      for (const [gameId, evs] of byGame.entries()) {
        const gameStart = evs.find((e) => e.type === "game_start") ?? null;
        if (!gameStart) {
          console.log(`[timeline] gameId=${gameId} - no game_start found`);
          continue;
        }

        try {
          console.debug(`[timeline] gameId=${gameId} gameStart keys:`, Object.keys(gameStart));
          if (gameStart.payload) console.debug(`[timeline] gameId=${gameId} gameStart.payload keys:`, Object.keys(gameStart.payload));
        } catch (err) {
          console.debug(`[timeline] gameId=${gameId} gameStart (raw):`, gameStart);
        }

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
          continue;
        }

        const latest = evs.slice().sort((a, b) => ts(b) - ts(a))[0];
        console.log(`[timeline] gameId=${gameId} latest event type:`, latest?.type, "timestamp:", latest?.timestamp);
        if (latest?.payload) console.debug(`[timeline] gameId=${gameId} latest.payload keys:`, Object.keys(latest.payload));

        const appDisplay = String(appId);
        const home = gameStart?.payload?.homeTeam ?? gameStart?.payload?.team ?? "Home";
        const away = gameStart?.payload?.awayTeam ?? "Away";

        const scoreResult = findLatestScores(evs, home as string | undefined, away as string | undefined);
        const latestHomeScore = scoreResult.home ?? undefined;
        const latestAwayScore = scoreResult.away ?? undefined;
        const snapshotEvent = scoreResult.event ?? latest;

        const quarter = snapshotEvent?.payload?.quarter ?? latest?.payload?.quarter ?? undefined;
        const homeScoreLabel = latestHomeScore != null ? ` (${latestHomeScore})` : "";
        const awayScoreLabel = latestAwayScore != null ? ` (${latestAwayScore})` : "";
        let timeAgo = snapshotEvent?.time ?? snapshotEvent?.timestamp ?? latest?.time ?? latest?.timestamp ?? "now";
        if (snapshotEvent?.type === "game_end" || latest?.type === "game_end") {
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
          },
        });
      }

      const mappedNonGame = nonGame.map((it: ApiTimelineItem) => ({
        id: it.eventId || `${it.type}-${it.timestamp}`,
        eventId: it.eventId,
        type: it.type,
        timestamp: it.timestamp,
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
      console.debug("[timeline] summaries count:", summaries.length, "combined length:", combined.length);
      if (mountedRef.current) setRecentActivities(combined);
    } catch {
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    Promise.resolve().then(() => {
      if (mountedRef.current) loadTimeline();
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const displayActivities = recentActivities.length > 0 ? recentActivities : activities;

  // helper: human-friendly label for appId
  const formatAppIdLabel = (id: string) => {
    if (id === "efl-online") return "EFL Online";
    return id;
  };

  // unique appIds for dropdown
  const appIdOptions = useMemo(() => {
    const set = new Set<string>();
    for (const act of displayActivities as TimelineItem[]) {
      const appId = (act as TimelineItem).appId;
      if (appId) set.add(appId);
    }
    return Array.from(set).sort();
  }, [displayActivities]);

  // apply app filter
  const filteredActivities = useMemo(() => {
    if (selectedAppId === "all") return displayActivities;
    return (displayActivities as TimelineItem[]).filter(
      (act) => act.appId === selectedAppId
    );
  }, [displayActivities, selectedAppId]);

  // last 5 game summaries (with scores) for scoreboard bar
  const scoreboardItems = useMemo(() => {
    const games = (filteredActivities as TimelineItem[]).filter((a) => a.gameId);
    const sorted = games
      .slice()
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    return sorted.slice(0, 5);
  }, [filteredActivities]);

  // push scoreboard UI into layout slot
  useEffect(() => {
    setScoreboard(
      <section className="flex items-center justify-between gap-4 overflow-x-auto">
        {/* App filter dropdown */}
        <div className="flex items-center gap-2 flex-shrink-0" style={{ width: '25%' }}>
          <label className="text-xs text-zinc-600 dark:text-zinc-400" style={{width: '50%'}} ></label>
          <select
            className="rounded-full border px-3 py-1 text-xs bg-white dark:bg-black dark:border-zinc-700"
            value={selectedAppId}
            onChange={(e) =>
              setSelectedAppId(e.target.value === "all" ? "all" : e.target.value)
            }
          >
            <option value="all">All</option>
            {appIdOptions.map((id) => (
              <option key={id} value={id}>
                {formatAppIdLabel(id)}
              </option>
            ))}
          </select>
        </div>

        {/* Last 5 games mini-scoreboard */}
        <div className="flex items-stretch gap-2 text-xs flex-1 overflow-x-auto">
          {scoreboardItems.map((item) => {
            const home = item.payload?.homeTeam ?? "Home";
            const away = item.payload?.awayTeam ?? "Away";
            const homeScoreNum =
              item.payload?.homeScore != null ? Number(item.payload.homeScore) : undefined;
            const awayScoreNum =
              item.payload?.awayScore != null ? Number(item.payload.awayScore) : undefined;
            const homeScore =
              homeScoreNum != null && !Number.isNaN(homeScoreNum)
                ? String(homeScoreNum)
                : "";
            const awayScore =
              awayScoreNum != null && !Number.isNaN(awayScoreNum)
                ? String(awayScoreNum)
                : "";
            const isFinal =
              typeof item.timeAgo === "string" &&
              item.timeAgo.toLowerCase().includes("final");

            const homeWinning =
              homeScoreNum != null &&
              awayScoreNum != null &&
              homeScoreNum > awayScoreNum;
            const awayWinning =
              homeScoreNum != null &&
              awayScoreNum != null &&
              awayScoreNum > homeScoreNum;

            return (
              <div
                key={item.id}
                className="flex flex-col justify-between border-l first:border-l-0 pl-2 first:pl-0 min-w-[140px]"
                style={{ width: '150px', paddingLeft: '15px', paddingRight: '15px' }}
              >
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                  {isFinal ? "Final" : item.timeAgo || "Live"}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] truncate">{home}</span>
                    <span className="text-[11px] truncate">{away}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      style={{fontSize: '11px', fontWeight: `${
                        homeWinning ? '900' : "normal"
                      }`}}
                    >
                      {homeScore !== "" ? homeScore : "\u00A0"}
                    </span>
                    <span
                      style={{fontSize: '11px', fontWeight: `${
                        awayWinning ? '900' : "normal"
                      }`}}
                    >
                      {awayScore !== "" ? awayScore : "\u00A0"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {scoreboardItems.length === 0 && (
            <div className="text-[11px] text-zinc-500">
              No games yet for this filter.
            </div>
          )}
        </div>
      </section>
    );

    // optional cleanup: clear scoreboard when leaving page
    return () => setScoreboard(null);
  }, [setScoreboard, selectedAppId, appIdOptions, scoreboardItems]);

  return (
    <div className="flex min-h-screen items-start justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-5xl space-y-8 py-12 px-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Activity Dashboard
              </p>
            </div>
          </div>
        </header>

        {/* Recent Games (uses same filter) */}
        <section className="rounded-lg bg-white p-6 shadow-sm dark:bg-[#0b0b0b]">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50">
            Recent Coverage
          </h2>
          <ul className="mt-4 space-y-3">
            {filteredActivities.length > 0 ? (
              filteredActivities.map((act) => {
                const gameId =
                  "gameId" in act ? (act as TimelineItem).gameId : undefined;
                const appId =
                  "appId" in act ? (act as TimelineItem).appId : undefined;
                const iconSrc =
                  appId === "efl-online" ? "/efl-online.png" : undefined;

                const recapUrl = gameId
                  ? `https://d2nuzfnuy59hla.cloudfront.net/${encodeURIComponent(
                      String(gameId)
                    )}.mp3`
                  : null;

                return (
                  <li
                    key={act.id}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="flex flex-1 items-start gap-3">
                      {iconSrc ? (
                        <Image
                          src={iconSrc}
                          alt="efl-online"
                          width={64}
                          height={64}
                          className="rounded-sm"
                        />
                      ) : null}
                      <div style={{ alignSelf: "center" }}>
                        <div className="text-sm font-medium">
                          {gameId ? (
                            <Link
                              href={`/games/${encodeURIComponent(
                                String(gameId)
                              )}`}
                              className="hover:underline"
                            >
                              {act.title}
                            </Link>
                          ) : (
                            act.title
                          )}
                        </div>
                        <div
                          className="text-xs text-zinc-500 dark:text-zinc-400"
                          style={{ fontSize: "x-small" }}
                        >
                          {gameId ? `Game ID: ${gameId}` : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col items-center justify-center gap-1">
                      {recapUrl ? (
                        <>
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            Recap Podcast
                          </span>
                          <audio
                            controls
                            preload="none"
                            className="w-40 h-6 text-[10px] opacity-70 scale-90 hover:opacity-100 hover:scale-100 transition-transform transition-opacity"
                            style={{
                              minWidth: 0,
                              width: "160px",
                              height: "40px",
                            }}
                          >
                            <source src={recapUrl} type="audio/mpeg" />
                            Your browser does not support the audio element.
                          </audio>
                        </>
                      ) : null}
                    </div>

                    <div className="w-24 text-right text-xs text-zinc-500">
                      {act.timeAgo ?? "now"}
                    </div>
                  </li>
                );
              })
            ) : (
              <>
                <li className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      Loading game data...
                    </div>
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
