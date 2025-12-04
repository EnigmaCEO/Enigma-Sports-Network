import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import React from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Enigma Sports Network",
  description: "Scores, events and community for Enigma Sports Network",
};

function SiteHeader() {
  return (
    <header className="border-b bg-white/60 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          Enigma Sports
        </Link>
        <nav aria-label="Main navigation">
          <ul
            className="flex text-sm items-center"
            style={{ width: 500, justifyContent: "space-around" }}
          >
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/events">Events</Link>
            </li>
            <li>
              <Link href="/teams">Teams</Link>
            </li>
            <li>
              <Link href="/about">About</Link>
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
        {/* Skip link for keyboard users */}
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:bg-neutral-900 focus:text-white px-3 py-1 rounded"
        >
          Skip to content
        </a>

        <SiteHeader />

        <main id="content" className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
