"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import React, { ReactNode, createContext, useContext, useState } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// NOTE: metadata moved to ./metadata.ts because this layout is now a client component
// and client components cannot export `metadata`.

// simple context to let pages provide scoreboard header content
type ScoreboardContextValue = {
  scoreboard: ReactNode;
  setScoreboard: (node: ReactNode) => void;
};

const ScoreboardContext = createContext<ScoreboardContextValue | null>(null);

export function useScoreboardSlot() {
  const ctx = useContext(ScoreboardContext);
  if (!ctx) {
    throw new Error("useScoreboardSlot must be used within RootLayout");
  }
  return ctx;
}

function ScoreboardShell({ children }: { children: ReactNode }) {
  const [scoreboard, setScoreboard] = useState<ReactNode>(null);

  return (
    <ScoreboardContext.Provider value={{ scoreboard, setScoreboard }}>
      {/* Top scoreboard bar, before nav */}
      {scoreboard ? (
        <div className="w-full border-b bg-white/70 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4 py-2">{scoreboard}</div>
        </div>
      ) : null}
      {children}
    </ScoreboardContext.Provider>
  );
}

function SiteHeader() {
  return (
    <header className="border-b bg-white/60 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
                Enigma Sports Network
      </h1>
              
        <nav aria-label="Main navigation">
          <ul
            className="flex text-sm items-center"
            style={{ width: 500, justifyContent: "space-around" }}
          >
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/">Investors</Link>
            </li>
            <li>
              <Link href="/">Pitch Deck</Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t bg-white/60 backdrop-blur-sm mt-8">
      <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-neutral-600">
        <div>© {new Date().getFullYear()} Enigma Sports Network. All rights reserved.</div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <ScoreboardShell>
          {/* Skip link for keyboard users */}
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:bg-neutral-900 focus:text-white px-3 py-1 rounded"
          >
            Skip to content
          </a>

          <SiteHeader />

          {/* widen main container at xl so child grids can span 3 columns comfortably */}
          <main
            id="content"
            className="mx-auto w-full max-w-6xl xl:max-w-[1200px] 2xl:max-w-[1400px] px-4 py-8 flex-1"
          >
            {children}
          </main>

          <SiteFooter />
        </ScoreboardShell>
      </body>
    </html>
  );
}
