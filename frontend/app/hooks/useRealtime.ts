"use client";

import { useEffect, useRef, useState } from "react";

type Stats = {
  activeMatches: number;
  onlinePlayers: number;
  activeChannels: number;
  revenue: number;
};

type Activity = {
  id: string;
  title: string;
  subtitle?: string;
  timeAgo?: string;
};

type Status = "connecting" | "connected" | "disconnected";

export default function useRealtime(pollInterval = 5000, apiBase = "/api") {
  const mounted = useRef(true);
  const failureCount = useRef(0);
  const timerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>("connecting");
  const [stats, setStats] = useState<Stats>({
    activeMatches: 0,
    onlinePlayers: 0,
    activeChannels: 0,
    revenue: 0,
  });
  const [activities, setActivities] = useState<Activity[]>([]);

  async function fetchOnce() {
    try {
      // fetch stats
      const statsRes = await fetch(`${apiBase}/stats`);
      if (!statsRes.ok) throw new Error("stats fetch failed");
      const statsJson = (await statsRes.json()) as Partial<Stats>;
      if (!mounted.current) return;
      setStats((prev) => ({
        activeMatches:
          typeof statsJson.activeMatches === "number" ? statsJson.activeMatches : prev.activeMatches,
        onlinePlayers:
          typeof statsJson.onlinePlayers === "number" ? statsJson.onlinePlayers : prev.onlinePlayers,
        activeChannels:
          typeof statsJson.activeChannels === "number" ? statsJson.activeChannels : prev.activeChannels,
        revenue: typeof statsJson.revenue === "number" ? statsJson.revenue : prev.revenue,
      }));

      // fetch activities
      const actRes = await fetch(`${apiBase}/activities`);
      if (!actRes.ok) throw new Error("activities fetch failed");
      const actJson = (await actRes.json()) as Activity[] | Activity;
      if (!mounted.current) return;
      const incoming = Array.isArray(actJson) ? actJson : [actJson];
      setActivities((current) => {
        const merged = [...incoming, ...current];
        return merged.slice(0, 10);
      });

      // success
      failureCount.current = 0;
      setStatus("connected");
    } catch (e) {
      // mark as disconnected but keep polling
      failureCount.current++;
      setStatus("disconnected");
    }
  }

  useEffect(() => {
    mounted.current = true;
    // initial fetch
    setStatus("connecting");
    fetchOnce();

    // schedule polling
    //timerRef.current = window.setInterval(fetchOnce, pollInterval);

    return () => {
      mounted.current = false;
      //if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollInterval, apiBase]);

  // expose manual refresh if caller wants to trigger immediate fetch
  const refresh = async () => {
    setStatus("connecting");
    await fetchOnce();
  };

  return { stats, activities, status, refresh };
}
