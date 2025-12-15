"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePodcastContext } from "./PodcastContext";

interface PodcastPlayerProps {
  id: string;          // unique id per podcast instance
  src: string;
  title?: string;
}

export default function PodcastPlayer({ id, src, title }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const { currentId, setCurrentId } = usePodcastContext();

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      // mark this as the active podcast and start playing
      setCurrentId(id);
      audio.play().catch(() => {});
    } else {
      audio.pause();
      setCurrentId(null);
    }
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec)) return "0:00";
    const minutes = Math.floor(sec / 60);
    const seconds = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number(e.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  // Attach audio element listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
      setCurrentId(null);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [setCurrentId, id]);

  // When another podcast becomes active, pause this one
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentId !== id && !audio.paused) {
      audio.pause();
    }
  }, [currentId, id]);

  return (
    <div
      className="flex items-center gap-2 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-50 shadow-sm border-zinc-700 bg-[#101010]"
      style={{ padding: "8px" }}
    >
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-6 w-6 items-center justify-center golden hover:bg-emerald-400 text-[24px] font-semibold"
        style={{
          backgroundColor: "transparent",
          border: "0px",
          paddingRight: "10px",
          outline: "none",
          boxShadow: "none",
          fontWeight: isPlaying ? "900" : "semibold",
          cursor: "pointer",
        }}
      >
        {isPlaying ? "||" : "▶"}
      </button>

      <div className="flex-1 flex flex-col min-w-0">
        {title && (
          <div
            className="truncate text-zinc-300 mb-0.5 font-medium"
            style={{ textAlign: "center", fontSize: "medium" }}
          >
            {title}
          </div>
        )}
        <div className="flex items-center gap-1">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.5}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 golden"
            style={{ cursor: "pointer", boxShadow: "none", border: "0px" }}
          />
          <span className="whitespace-nowrap text-[10px] text-zinc-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* hidden native audio element */}
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}
