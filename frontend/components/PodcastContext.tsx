"use client";

import React, { createContext, useContext, useState } from "react";

interface PodcastContextValue {
  currentId: string | null;
  setCurrentId: (id: string | null) => void;
}

const PodcastContext = createContext<PodcastContextValue | undefined>(undefined);

export function PodcastProvider({ children }: { children: React.ReactNode }) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  return (
    <PodcastContext.Provider value={{ currentId, setCurrentId }}>
      {children}
    </PodcastContext.Provider>
  );
}

export function usePodcastContext(): PodcastContextValue {
  const ctx = useContext(PodcastContext);
  if (!ctx) {
    throw new Error("usePodcastContext must be used within a PodcastProvider");
  }
  return ctx;
}
