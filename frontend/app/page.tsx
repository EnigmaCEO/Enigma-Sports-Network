"use client";

import useRealtime from "./hooks/useRealtime";
import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import fetchJson from "../lib/fetchJson";
import { useScoreboardSlot } from "./layout"; // relative to app root
import { useRouter } from "next/navigation";
import PodcastPlayer from "../components/PodcastPlayer";
import { PodcastProvider } from "../components/PodcastContext";
import { fetchHighlightArticle } from "../lib/clientArticles"; // <-- updated import
import { pickRandomKeyMomentIndex } from "../lib/randomKeyMoment"; // <-- new import

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
  const { activities } = useRealtime();
  const [recentActivities, setRecentActivities] = useState<TimelineItem[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | "all">("all");
  const { setScoreboard } = useScoreboardSlot();
  const router = useRouter();

  // Canonical game ids for each card
  const HIGHLIGHT_GAME_ID = "game-efl-demo-1765532496496";
  const FEATURED_GAME_ID = "game-efl-demo-1765525727122";
  const RECAP_GAME_ID = "game-efl-demo-1765614117580";

  // article state for highlights card (single article test)
  const [highlightArticle, setHighlightArticle] = useState<{
    title: string;
    dek?: string;
    gameId?: string;
    keyMoments?: string[];
  } | null>(null);

  // article state for featured game (separate from highlight)
  const [featuredArticle, setFeaturedArticle] = useState<{
    title: string;
    dek?: string;
    keyMoments?: string[];
  } | null>(null);

  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);

  // static SPOTLIGHT record (fictional, client-only)
  const spotlightArticle = {
    type: "SPOTLIGHT",
    title:
      "Rising Star RB Jalen Cross Shatters EFL Single-Game Rushing Record",
    dek: "Jalen Cross powered the Wraiths’ ground attack with 324 rushing yards and 4 touchdowns, rewriting the EFL record books in a dominant, wire-to-wire performance.",
  };

  // new: static TOURNAMENT celebration card (fictional, client-only)
  const tournamentArticle = {
    type: "TOURNAMENT",
    title: "Cyclones Capture Bitcoin Invitational Title and $5,000 Prize",
    dek: "The Cyclones rode a relentless fourth-quarter surge to win the Bitcoin Invitational, clinching the 1st place and a $5,000 worth of BTC prize.",
  };

  const mountedRef = useRef(true);

  const [randomKeyMomentIndex, setRandomKeyMomentIndex] = useState(0);

  const derivedRandomKeyMomentIndex = useMemo(() => {
    return pickRandomKeyMomentIndex(highlightArticle?.keyMoments);
  }, [highlightArticle]);

  useEffect(() => {
    setRandomKeyMomentIndex(derivedRandomKeyMomentIndex);
  }, [derivedRandomKeyMomentIndex]);

  // Highlight image (for highlight game id)
  const highlightImageUrl = useMemo(() => {
    return `https://d2zq9pbfla02w4.cloudfront.net/${encodeURIComponent(
      HIGHLIGHT_GAME_ID
    )}_highlight.png`;
  }, [HIGHLIGHT_GAME_ID]);

  // Recap image (for recap game id)
  const recapImageUrl = useMemo(() => {
    return `https://d2zq9pbfla02w4.cloudfront.net/${encodeURIComponent(
      RECAP_GAME_ID
    )}_highlight.png`;
  }, [RECAP_GAME_ID]);

  // Featured image (for featured game id)
  const featuredImageUrl = useMemo(() => {
    return `https://d2zq9pbfla02w4.cloudfront.net/${encodeURIComponent(
      FEATURED_GAME_ID
    )}_video.mp4`;
  }, [FEATURED_GAME_ID]);

  // Featured recap audio (for featured game id)
  const featuredRecapUrl = useMemo(() => {
    return `https://d2nuzfnuy59hla.cloudfront.net/${encodeURIComponent(
      FEATURED_GAME_ID
    )}.mp3`;
  }, [FEATURED_GAME_ID]);

  // simple mock data for EFL Online dev updates/news
  const mockEflEvents = [
    {
      id: "efl-dev-1",
      label: "Dev Update",
      title: "New Live Draft Room UI",
      subtitle: "Real-time pick board, team needs overlay and mobile optimizations rolling out to beta next week.",
      time: "5m ago",
    },
    {
      id: "efl-dev-2",
      label: "Tournament",
      title: "Bitcoin Invitational II Announced",
      subtitle: "32‑team single‑elimination bracket with dynamic seeding and expanded stat tracking.",
      time: "28m ago",
    },
    {
      id: "efl-dev-3",
      label: "Feature Preview",
      title: "Custom Playbooks for League Commissioners",
      subtitle: "Upload, share and auto‑tag schemes that sync into live play‑by‑play and film rooms.",
      time: "1h ago",
    },
    {
      id: "efl-dev-4",
      label: "Upcoming Event",
      title: "EFL Online Dev AMA on Discord",
      subtitle: "Roadmap deep dive: tournaments, franchise mode and creator tools — this Friday 7PM ET.",
      time: "3h ago",
    },
    {
      id: "efl-dev-5",
      label: "Roadmap",
      title: "Franchise Mode Early Access",
      subtitle: "Persistent leagues, off‑season logic and scouting hub targeted for Q2 private alpha.",
      time: "Yesterday",
    },
  ];

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
          console.debug(err);
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

        //const appDisplay = String(appId);
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

  // derive scoreboard items (last 5 game summaries) from filtered activities
  const scoreboardItems = useMemo(() => {
    return (filteredActivities as TimelineItem[])
      .filter((act) => act.type === "game_summary")
      .slice(0, 5);
  }, [filteredActivities]);

  // Highlight game id (legacy callers now point to constant)
  const highlightGameId = useMemo(() => HIGHLIGHT_GAME_ID, [HIGHLIGHT_GAME_ID]);

  // derive final score for featured game from scoreboardItems
  const featuredScore = useMemo(() => {
    const summary = scoreboardItems.find(
      (item) => item.gameId === FEATURED_GAME_ID
    );
    if (!summary || !summary.payload) return null;

    const home = summary.payload.homeTeam ?? "Home";
    const away = summary.payload.awayTeam ?? "Away";
    const homeScore =
      summary.payload.homeScore != null ? String(summary.payload.homeScore) : "";
    const awayScore =
      summary.payload.awayScore != null ? String(summary.payload.awayScore) : "";

    if (homeScore === "" && awayScore === "") return null;

    return { home, away, homeScore, awayScore };
  }, [scoreboardItems, FEATURED_GAME_ID]);

  // Load article for highlight card (explicitly for HIGHLIGHT_GAME_ID)
  useEffect(() => {
    console.log("[highlight] using highlightGameId:", highlightGameId);

    if (!highlightGameId) {
      setHighlightArticle(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setArticleLoading(true);
      setArticleError(null);

      // assume fetchHighlightArticle supports a gameId parameter
      const article = await fetchHighlightArticle(highlightGameId);

      if (cancelled) return;

      if (!article) {
        setArticleError(
          "API returned no article data for highlight. Check /api/highlight-article route."
        );
        setHighlightArticle(null);
        setArticleLoading(false);
        return;
      }

      setHighlightArticle({
        title: article.title,
        dek: article.dek,
        gameId: highlightGameId,
        keyMoments: article.keyMoments,
      });
      setArticleError(null);
      setArticleLoading(false);
    })().catch((err) => {
      console.error("[highlight] unexpected error:", err);
      if (!cancelled) {
        setArticleError(
          "Could not load highlight article (see console for details)."
        );
        setHighlightArticle(null);
        setArticleLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [highlightGameId]);

  // Helper to fetch article for FEATURED_GAME_ID
  async function fetchFeaturedArticleForGame() {
    try {
      const res = await fetch(
        `/api/articles/${encodeURIComponent(FEATURED_GAME_ID)}`
      );
      if (!res.ok) return null;
      return (await res.json()) as {
        title: string;
        dek?: string;
        keyMoments?: string[];
      };
    } catch {
      return null;
    }
  }

  // Load article for featured game card (explicitly for FEATURED_GAME_ID)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const article =
        (await fetchFeaturedArticleForGame()) ||
        (await fetchHighlightArticle(FEATURED_GAME_ID));

      if (cancelled) return;

      if (!article) {
        setFeaturedArticle(null);
        return;
      }

      setFeaturedArticle({
        title: article.title,
        dek: article.dek,
        keyMoments: article.keyMoments,
      });
    })().catch((err) => {
      console.error("[featured] unexpected error:", err);
      if (!cancelled) setFeaturedArticle(null);
    });

    return () => {
      cancelled = true;
    };
  }, [FEATURED_GAME_ID]);

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

        {/* Last 5 games mini-scoreboard, scrolling ticker */}
        <div className="relative flex-1 overflow-hidden">
          {scoreboardItems.length > 0 ? (
            <div className="scoreboard-ticker">
              {/* Animated track that moves left */}
              <div className="scoreboard-ticker-track">
                {[0, 1].map((loopIndex) => (
                  <div
                    key={loopIndex}
                    className="scoreboard-ticker-strip"
                    aria-hidden={loopIndex === 1 ? true : undefined}
                  >
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
                          key={`${loopIndex}-${item.id}`}
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
                                style={{
                                  fontSize: '11px',
                                  fontWeight: homeWinning ? '900' : 'normal',
                                }}
                              >
                                {homeScore !== "" ? homeScore : "\u00A0"}
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: awayWinning ? '900' : 'normal',
                                }}
                              >
                                {awayScore !== "" ? awayScore : "\u00A0"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
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
    <PodcastProvider>
      <div className="flex min-h-screen items-start justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="w-full space-y-8 py-12 px-6">
         
          {/* Coverage + Highlights row (CSS-driven responsiveness) */}
          <div className="coverage-row">
            {/* EFL Online News – becomes left 15% at >=1280px */}
            <section
              className="coverage-col coverage-col--news rounded-lg bg-white shadow-sm dark:bg-[#2A2E35]"
              style={{ padding: "12px" }}
            >
              <h2 className="text-lg font-medium text-black dark:text-zinc-50 text-center mb-4">
                EFL Online News
              </h2>
              <div className="space-y-4 text-xs">
                {mockEflEvents.map((evt, idx) => (
                  <div key={evt.id}>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {evt.label} · {evt.time}
                      </span>
                      <span className="mt-1 text-[11px] font-semibold golden">
                        {evt.title}
                      </span>
                      {evt.subtitle && (
                        <span className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                          {evt.subtitle}
                        </span>
                      )}
                    </div>
                    {idx < mockEflEvents.length - 1 && (
                      <hr
                        className="my-4 border-zinc-800/60"
                        style={{ margin: "20px", opacity: "0.5" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Middle: Featured Game + Recent Coverage – middle 65% at >=1280px */}
            <section
              className="coverage-col coverage-col--main rounded-lg bg-white p-6 shadow-sm dark:bg-[#0b0b0b]"
              style={{ padding: "5px" }}
            >
              {/* Featured Game card */}
              {featuredArticle && (
                <div
                  className="mb-6 rounded-lg border golden-border bg-[#101010]"
                  style={{ padding: "12px", boxShadow: "none" }}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase golden">
                        Game of the Day
                      </div>
                      <h2 className="mt-1 text-base font-semibold golden">
                        {featuredArticle.title}
                      </h2>
                      {featuredArticle.dek && (
                        <p className="mt-1 text-xs text-zinc-400">
                          {featuredArticle.dek}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Featured game body: layout driven by CSS (see globals.css) */}
                  <div className="featured-body featured-body--stack featured-body--side">
                    {/* Featured game video (replaces image) */}
                    {featuredImageUrl && (
                      <div className="featured-body__image">
                        <video
                          src={featuredImageUrl.replace(/\.png$/i, ".mp4")}
                          autoPlay
                          muted
                          loop
                          playsInline
                          controls
                          className="block"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      </div>
                    )}

                    {/* Final score + key moments + podcast recap */}
                    <div className="featured-body__content">
                      {/* Final score line (large font) */}
                      {featuredScore && (
                        <div className="flex flex-col mb-1">
                          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 text-center golden">
                            Final Score
                          </div>
                          <div
                            className="text-xl font-extrabold text-zinc-50 text-center"
                            style={{
                              fontSize: "24px",
                              fontWeight: "bold",
                              paddingBottom: "40px",
                            }}
                          >
                            {featuredScore.home}{" "}
                            <span className="golden">
                              {featuredScore.homeScore}
                            </span>{" "}
                            <span className="text-zinc-400">–</span>{" "}
                            <span className="golden">
                              {featuredScore.awayScore}
                            </span>{" "}
                            {featuredScore.away}
                          </div>
                        </div>
                      )}

                      {/* Key moments list */}
                      {Array.isArray(featuredArticle.keyMoments) &&
                        featuredArticle.keyMoments.length > 0 && (
                          <div>
                            <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase mb-1 golden">
                              Key Moments
                            </div>
                            <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1">
                              {featuredArticle.keyMoments.map((km, i) => (
                                <li key={i}>{km}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Podcast recap */}
                      {featuredRecapUrl && (
                        <div className="mt-1 align-self-center w-1/2">
                          <PodcastPlayer
                            id={FEATURED_GAME_ID}
                            src={featuredRecapUrl}
                            title={"Final Verdict Podcast"}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Coverage */}
              <h2 className="text-lg font-medium text-black dark:text-zinc-50  text-center">
                Daily Game Coverage
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

                    // new: target paths for article and play-by-play
                    const articlePath = gameId
                      ? `/articles/${encodeURIComponent(String(gameId))}`
                      : null;
                    const playByPlayPath = gameId
                      ? `/games/${encodeURIComponent(String(gameId))}`
                      : null;

                    return (
                      <li
                        key={act.id}
                        className="flex flex-col gap-1"
                      >
                        {/* Row 1: title / game id / time */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-1 items-start gap-3">
                            {iconSrc ? (
                              <Image
                                src={iconSrc}
                                alt="efl-online"
                                width={64}
                                height={64}
                                className="rounded-sm"
                                style={{ marginRight: "10px"}}
                              />
                            ) : null}
                            <div style={{ alignSelf: "center" }}>
                              <div className="text-sm font-medium golden"
                                style={{ fontSize: "larger", fontWeight: "bold" }}>
                              {act.title}
                              </div>
                              <div
                                className="text-xs text-zinc-500 dark:text-zinc-400"
                                style={{ fontSize: "x-small" }}
                              >
                                {gameId ? `Game ID: ${gameId}` : null}
                              </div>
                            </div>
                          </div>

                          <div className="w-24 text-right text-xs text-zinc-500 golden x1:pr-50"
                            style={{ alignSelf: "center", fontSize: "larger" }}>
                            {/*{act.timeAgo ?? "now"}*/}
                          </div>
                        </div>

                        {/* Row 2: audio + article + play-by-play buttons */}
                        <div
                          className="flex items-center justify-between gap-4 xl:pl-[67px]"
                          style={{ paddingBottom: "15px" }}
                        >
                          {/* custom podcast player */}
                          <div className="flex-1 flex items-center justify-center gap-1"
                          style={{ justifyContent: "space-evenly", height: "60px", gap: "20px" }}>
                            {recapUrl ? (
                              <>
                                <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                  
                                </span>
                                <PodcastPlayer
                                  id={gameId ? String(gameId) : String(act.id ?? "")}
                                  src={recapUrl}
                                  title={"Final Verdict Podcast"}
                                />
                              </>
                            ) : null}
                          
                            {articlePath && (
                              <button
                                type="button"
                                onClick={() => router.push(articlePath)}
                                className="bg-[#101010] flex items-center justify-center gap-2 px-4 py-2 golden"
                                style={{ border: "0px", boxShadow: "none", 
                                  height: "100%", fontSize: "12px",width: "36%", textTransform: "uppercase", cursor: "pointer" }}
                              >
                                {/* Document icon */}
                                <svg
                                  aria-hidden="true"
                                  width="24"
                                  height="24"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M7 3H13L18 8V21H7V3Z"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M13 3V8H18"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M9.5 12H15.5"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M9.5 15H13.5"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span style={{ padding: '10px' }}>ESN Recap</span>
                              </button>
                            )}
                            {playByPlayPath && (
                              <button
                                type="button"
                                onClick={() => router.push(playByPlayPath)}
                                className="bg-[#101010] flex items-center justify-center gap-2 px-4 py-2 golden"
                                style={{ border: "0px", boxShadow: "none", height: "100%", 
                                  fontSize: "12px", width: "36%", textTransform: "uppercase", cursor: "pointer" }}
                              >
                                {/* List / timeline icon */}
                                <svg
                                  aria-hidden="true"
                                  width="24"
                                  height="24"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <circle
                                    cx="6"
                                    cy="6"
                                    r="1.5"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                  />
                                  <circle
                                    cx="6"
                                    cy="12"
                                    r="1.5"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                  />
                                  <circle
                                    cx="6"
                                    cy="18"
                                    r="1.5"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                  />
                                  <path
                                    d="M10 6H18"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M10 12H18"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                  <path
                                    d="M10 18H18"
                                    stroke="#C9A24D"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <span style={{ padding: '10px' }}>Play by Play</span>
                              </button>
                            )}
                          </div>
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

            {/* Highlights – right 20% at >=1280px */}
            <section
              className="coverage-col coverage-col--highlights rounded-lg bg-white p-6 shadow-sm dark:bg-[#2A2E35]"
              style={{ padding: "5px" }}
            >
              <h2 className="text-lg font-medium text-black dark:text-zinc-50 text-center">
                News & Highlights
              </h2>

              {/* single-article test cards */}
              <div className="mt-4 space-y-3 text-sm">
                {articleLoading && (
                  <p className="text-xs text-zinc-500">
                    Loading article for {HIGHLIGHT_GAME_ID}…
                  </p>
                )}
                {!articleLoading && articleError && (
                  <p className="text-xs text-red-500">
                    {articleError}
                  </p>
                )}
                {!articleLoading && !articleError && highlightArticle && (
                  <>
                    <div className="w-full rounded-lg border golden-border"
                    style={{ marginBottom: "20px", boxShadow: "none" }}>
                      <button
                        type="button"
                        onClick={() =>
                          // ESN Recap should now always go to game-efl-demo-1765614117580
                          router.push(
                            `/articles/${encodeURIComponent(
                              RECAP_GAME_ID
                            )}`
                          )
                        }
                        className="w-full text-left bg-[#101010]"
                        style={{ cursor: "pointer" }}
                      >
                        <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase mb-1 golden">
                          ESN Daily Recap
                        </div>

                        {/* ESN Recap image (different game) */}
                        {recapImageUrl && (
                          <div className="mb-2 rounded-sm overflow-hidden">
                            <Image
                              src={recapImageUrl}
                              alt="ESN Recap for game game-efl-demo-1765614117580"
                              width={600}
                              height={320}
                              className="block"
                              style={{
                                width: "100%",
                                height: "auto",
                                display: "block",
                                paddingTop: "10px",
                              }}
                            />
                          </div>
                        )}

                        <h3 className="text-sm font-semibold mb-1 golden">
                          {highlightArticle.title}
                        </h3>
                        {highlightArticle.dek && (
                          <p className="text-xs text-zinc-600 line-clamp-3">
                            {highlightArticle.dek}
                          </p>
                        )}
                      </button>

                    </div>

                    {/* Card 2: HIGHLIGHT (key moment) */}
                    {Array.isArray(highlightArticle.keyMoments) &&
                      highlightArticle.keyMoments.length > 0 && (
                        <div className="w-full rounded-lg border golden-border"
                        style={{ marginBottom: "20px", boxShadow: "none" }}>
                          <button
                            type="button"
                            onClick={() =>
                              highlightArticle.gameId &&
                              router.push(
                                `/articles/${encodeURIComponent(
                                  highlightArticle.gameId
                                )}`
                              )
                            }
                            className="w-full text-left bg-[#101010]"
                            style={{ cursor: "pointer" }}
                          >
                            {(() => {
                              const kms =
                                highlightArticle.keyMoments as string[];
                              const idx =
                                kms.length > 1 ? randomKeyMomentIndex : 0;
                              const moment = kms[idx];

                              return (
                                <>
                                  <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase mb-1 golden">
                                    Highlight of the hour
                                  </div>

                                  {/* article highlight image */}
                                  {highlightImageUrl && (
                                    <div className="mb-2 rounded-sm overflow-hidden">
                                      <Image
                                        src={highlightImageUrl}
                                        alt={`Highlight for game ${HIGHLIGHT_GAME_ID}`}
                                        width={600}
                                        height={320}
                                        className="block"
                                        style={{
                                          width: "100%",
                                          height: "auto",
                                          display: "block",
                                          paddingTop: "10px",
                                        }}
                                      />
                                    </div>
                                  )}
                                  
                                  <h3 className="text-sm font-semibold mb-1 golden">
                                    {moment}
                                  </h3>
                                  <p className="text-[11px] text-zinc-500">
                                    Key moment from{" "}
                                    <span className="italic">
                                      {highlightArticle.title}
                                    </span>
                                  </p>
                                </>
                              );
                            })()}
                          </button>
                        </div>
                      )}
                  </>
                )}
                {!articleLoading &&
                  !articleError &&
                  !highlightArticle && (
                    <p className="text-xs text-zinc-500">
                      No highlight article available yet for {HIGHLIGHT_GAME_ID}.
                    </p>
                  )}

                {/* SPOTLIGHT card (client-only, broken record) */}
                <div className="w-full rounded-lg border golden-border"
                    style={{ marginBottom: "20px", boxShadow: "none" }}>
                <button
                                type="button"
                                className="w-full text-left bg-[#101010]"
                                style={{ cursor: "pointer" }}
                              >
                  <div className="w-full text-left">
                    <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase mb-1 golden">
                      Player Spotlight
                    </div>

                    {/* full-width image under header */}
                    <div className="mb-2 rounded-sm overflow-hidden">
                      <Image
                        src="/spotlight.png"
                        alt="Spotlight player"
                        width={600}          // arbitrary, overridden by style
                        height={320}
                        className="block"
                        style={{ width: "100%", height: "auto", display: "block", paddingTop: "10px" }}
                      />
                    </div>

                    {/* title + dek below image */}
                    <h3 className="text-sm font-semibold mb-1 golden">
                      {spotlightArticle.title}
                    </h3>
                    {spotlightArticle.dek && (
                      <p className="text-xs text-zinc-600 line-clamp-3">
                        {spotlightArticle.dek}
                      </p>
                    )}
                  </div>
                  </button>
                </div>

                {/* TOURNAMENT card (fictional, client-only) */}
                <div className="w-full rounded-lg border golden-border"
                    style={{ marginBottom: "20px", boxShadow: "none" }}>
                  <button
                    type="button"
                    className="w-full text-left bg-[#101010]"
                    style={{ cursor: "pointer" }}
                  >
                    <div className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase mb-1 golden">
                      Season 1: Tournament Results
                    </div>

                    {/* full-width image under header */}
                    <div className="mb-2 rounded-sm overflow-hidden">
                      <Image
                        src="/tournament.png"
                        alt="Tournament Winners"
                        width={600}          // arbitrary, overridden by style
                        height={320}
                        className="block"
                        style={{ width: "100%", height: "auto", display: "block", paddingTop: "10px" }}
                      />
                    </div>

                    <h3 className="text-sm font-semibold mb-1, golden">
                      {tournamentArticle.title}
                    </h3>
                    {tournamentArticle.dek && (
                      <p className="text-xs text-zinc-600 line-clamp-3">
                        {tournamentArticle.dek}
                      </p>
                    )}
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* ...rest of existing content... */}
        </main>
      </div>
    </PodcastProvider>
  );
}
