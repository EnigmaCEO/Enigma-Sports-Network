"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ingestEvent } from "../../../lib/api";

export default function MockGamePage() {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  const GAME_ID = "game-efl-demo-" + new Date().getTime();
  const APP_ID = "efl-online";
  const SPORT = "american_football";

  // persist counter across re-renders
  const eventCounterRef = React.useRef(1);

  // --- very small name generator reused within this mock game ---
  const rosterRef = React.useRef<Map<string, string> | null>(null);
  function ensureRoster() {
    if (!rosterRef.current) rosterRef.current = new Map();
    return rosterRef.current;
  }

  // broadened, more diverse name pool
  const FIRST_NAMES = [
    "Alex",
    "Jordan",
    "Chris",
    "Taylor",
    "Morgan",
    "Riley",
    "Sam",
    "Cameron",
    "Devin",
    "Jamie",
    // added
    "Malik",
    "Darius",
    "Jamal",
    "Trevon",
    "Jalen",
    "Marcus",
    "LeBron",
    "Kendall",
    "Xavier",
    "Keenan",
    "Miles",
    "Tyrone",
    "Eric",
    "Latrell",
    "DeShawn",
  ];
  const LAST_NAMES = [
    "Coleman",
    "Rivera",
    "Hughes",
    "Parker",
    "Nguyen",
    "Moore",
    "Lopez",
    "Bennett",
    "Scott",
    "Harris",
    "Jackson",
    "Johnson",
    "Brown",
    "Davis",
    "Robinson",
    "Thompson",
    "Mitchell",
    "Walker",
    "Young",
    "Lewis",
    "Martin",
    "Allen",
    "Wright",
  ];

  function nameForJersey(jersey: string) {
    const roster = ensureRoster();
    if (roster.has(jersey)) return roster.get(jersey)!;
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const full = `${first} ${last}`;
    roster.set(jersey, full);
    return full;
  }

  function makeEvent(type: string, payload: unknown) {
    const id = eventCounterRef.current++;
    return {
      eventId: `${GAME_ID}-evt-${id}`,
      gameId: GAME_ID,
      appId: APP_ID,
      sport: SPORT,
      type,
      timestamp: new Date().toISOString(),
      payload,
    };
  }

  function formatClock(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return `${m}:${ss}`;
  }

  // Simple RNG helpers
  function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function pick<T>(arr: T[]) {
    return arr[randInt(0, arr.length - 1)];
  }

  // Strongly-typed event shape used by the mock generator and ingestion
  interface GameEvent<Payload = unknown> {
    eventId: string;
    gameId: string;
    appId: string;
    sport: string;
    type: string;
    timestamp: string;
    payload: Payload;
  }

  async function postEventAndLog<Payload = unknown>(ev: GameEvent<Payload>) {
    try {
      // Ensure top-level appId/sport are present for any event sent
      const fullEvent = { ...ev };
      if (!fullEvent.appId) fullEvent.appId = APP_ID;
      if (!fullEvent.sport) fullEvent.sport = SPORT;
      await ingestEvent(fullEvent);
      const hasGameClock =
        typeof ev.payload === "object" &&
        ev.payload !== null &&
        "gameClock" in ev.payload &&
        typeof (ev.payload as { gameClock: unknown }).gameClock === "string";

      const gc = hasGameClock ? (ev.payload as { gameClock: string }).gameClock : "";
      // log each event type and its clock — include the full event so top-level fields (gameId/appId/sport) are visible
      console.log(`${fullEvent.type} @ ${gc}`, {
        event: {
          eventId: fullEvent.eventId,
          gameId: fullEvent.gameId,
          appId: fullEvent.appId,
          sport: fullEvent.sport,
          type: fullEvent.type,
          timestamp: fullEvent.timestamp,
        },
        payload: fullEvent.payload,
      });
    } catch (err) {
      console.error("Failed to send event", ev.type, err);
    }
  }

  async function simulateGame() {
    setRunning(true);
    // Teams and state
    const home = "Titans";
    const away = "Wraiths";
    const score: Record<string, number> = { [home]: 0, [away]: 0 };

    // Emit game_start
    const gameStartPayload = {
      homeTeam: home,
      awayTeam: away,
      phase: "regulation",
      periodType: "quarter",
      periodIndex: 1,
      quarter: 1,
    };
    await postEventAndLog(makeEvent("game_start", gameStartPayload));

    // Quarter loop
    for (let quarter = 1; quarter <= 4; quarter++) {
      // quarter_start at 5:00
      let secondsLeft = 5 * 60; // 300 seconds
      await postEventAndLog(
        makeEvent("quarter_start", {
          quarter,
          phase: "regulation",
          periodType: "quarter",
          periodIndex: quarter,
          gameClock: formatClock(secondsLeft),
        })
      );

      let driveNumber = 1;
      // alternate offensive team: home starts quarter 1; alternate across drives
      let offenseIsHome = quarter % 2 === 1; // simple alternation seed

      while (secondsLeft > 0) {
        const offense = offenseIsHome ? home : away;

        // drive_start
        await postEventAndLog(
          makeEvent("drive_start", {
            team: offense,
            driveNumber,
            quarter,
            phase: "regulation",
            gameClock: formatClock(secondsLeft),
          })
        );

        // Drive local state
        const plays = randInt(2, 6);
        let totalYards = 0;
        let driveResult: string = "punt";
        // rudimentary field position starting near midfield
        let yardLine = randInt(20, 50); // distance to goal (smaller => closer)
        let down = 1;
        let distance = 10;

        for (let p = 0; p < plays && secondsLeft > 0; p++) {
          // event happens at current secondsLeft (pre-play)
          const gameClock = formatClock(secondsLeft);

          // decide play type
          const playType = Math.random() < 0.5 ? "run" : "pass";

          // time consumed for the play
          const playSeconds = randInt(8, 20);
          // construct common payload bits
          const playBase: Record<string, unknown> = {
            quarter,
            phase: "regulation",
            periodType: "quarter",
            periodIndex: quarter,
            gameClock,
            down,
            distance,
            yardLine,
            team: offense,
            playType,
          };

          if (playType === "run") {
            const yards = randInt(-2, 12);
            totalYards += yards;
            yardLine = Math.max(0, yardLine - yards);

            const runnerJersey = `#${randInt(20, 35)}`;
            const runnerName = nameForJersey(runnerJersey);
            const blockSide = pick(["left", "right", "middle"]);
            const blockers = [randInt(50, 79), randInt(50, 79)].map((n) => `#${n}`);
            const keyBlocker = blockers[0];
            const keyBlockerName = nameForJersey(keyBlocker);
            const blockOutcome = pick(["edge sealed", "good push", "stuffed at the line"]);

            let runPhrase: string;
            if (yards > 0) runPhrase = `${yards}-yard gain`;
            else if (yards === 0) runPhrase = "no gain";
            else runPhrase = `${Math.abs(yards)}-yard loss`;

            const description = `${runnerName} (${runnerJersey}) runs ${blockSide} behind ${keyBlockerName} (${keyBlocker}) for a ${runPhrase}.`;

            const payload = {
              ...playBase,
              runner: runnerJersey,
              runnerName,
              yards,
              blockSide,
              blockers,
              keyBlocker,
              keyBlockerName,
              blockOutcome,
              description,
            };

            await postEventAndLog(makeEvent("play", payload));
          } else {
            // pass
            const result = pick(["complete", "incomplete", "sack"]);
            let yards = 0;
            if (result === "complete") yards = randInt(0, 30);
            else if (result === "sack") yards = -randInt(0, 10);

            totalYards += yards;
            yardLine = Math.max(0, yardLine - yards);

            const passerJersey = `#${randInt(1, 12)}`;
            const targetJersey = `#${randInt(13, 29)}`;
            const passerName = nameForJersey(passerJersey);
            const targetName = nameForJersey(targetJersey);

            const route = pick(["slant", "go route", "out route", "deep in", "post", "corner"]);
            const blockers = [randInt(50, 79), randInt(50, 79)].map((n) => `#${n}`);
            const keyProtector = blockers[0];
            const keyProtectorName = nameForJersey(keyProtector);
            const pressureAllowedBy = Math.random() < 0.15 ? `#${randInt(50, 79)}` : null;

            let description: string;
            if (result === "complete") {
              description = `${passerName} (${passerJersey}) hits ${targetName} (${targetJersey}) on a ${route} for ${yards} yards.`;
            } else if (result === "incomplete") {
              description = `${passerName} (${passerJersey}) looks for ${targetName} (${targetJersey}) on a ${route}, but it's incomplete.`;
            } else {
              description = `${passerName} (${passerJersey}) is sacked for a ${Math.abs(yards)}-yard loss despite ${keyProtectorName} (${keyProtector}) in protection.`;
            }

            const payload = {
              ...playBase,
              passer: passerJersey,
              passerName,
              target: targetJersey,
              targetName,
              yards,
              route,
              result,
              blockers,
              keyProtector,
              keyProtectorName,
              pressureAllowedBy,
              description,
            };

            await postEventAndLog(makeEvent("play", payload));
          }

          // consume time
          secondsLeft = Math.max(0, secondsLeft - playSeconds);
          // rough down/distance update
          down = down === 4 ? 1 : down + 1;
          distance = Math.max(1, randInt(1, 10));
        }

        // Possibility of a score at the end of the drive
        const scoreRoll = Math.random();
        if (scoreRoll < 0.12) {
          // touchdown
          const scoreYards = randInt(1, 80);
          score[offense] += 7;
          driveResult = "touchdown";

          const scorerJersey = `#${randInt(10, 39)}`;
          const scorerName = nameForJersey(scorerJersey);
          const description = `${scorerName} (${scorerJersey}) breaks free for a ${scoreYards}-yard touchdown run for the ${offense}.`;

          const payload = {
            quarter,
            phase: "regulation",
            periodType: "quarter",
            periodIndex: quarter,
            gameClock: formatClock(secondsLeft),
            team: offense,
            scoreType: "TD",
            yards: scoreYards,
            result: "good",
            // --- new: explicit points field for recap logic ---
            points: 7,
            description,
          };
          await postEventAndLog(makeEvent("score", payload));
        } else if (scoreRoll < 0.22) {
          // field goal
          const fgYards = randInt(20, 55);
          score[offense] += 3;
          driveResult = "field_goal";

          const kickerJersey = `#${randInt(2, 19)}`;
          const kickerName = nameForJersey(kickerJersey);
          const description = `${kickerName} (${kickerJersey}) nails a ${fgYards}-yard field goal for the ${offense}.`;

          const payload = {
            quarter,
            phase: "regulation",
            periodType: "quarter",
            periodIndex: quarter,
            gameClock: formatClock(secondsLeft),
            team: offense,
            scoreType: "FG",
            yards: fgYards,
            result: "good",
            // --- new: explicit points field for recap logic ---
            points: 3,
            description,
          };
          await postEventAndLog(makeEvent("score", payload));
        } else {
          // no score: punt/turnover/predetermined
          driveResult = pick(["punt", "turnover"]);

          // --- new: if turnover, emit an explicit turnover event ---
          if (driveResult === "turnover") {
            const gameClock = formatClock(secondsLeft);
            const cause = pick(["interception", "fumble", "downs"]);
            const description =
              cause === "interception"
                ? `${offense} turns it over on an interception.`
                : cause === "fumble"
                ? `${offense} coughs it up on a fumble.`
                : `${offense} fails to convert and turns it over on downs.`;

            await postEventAndLog(
              makeEvent("turnover", {
                quarter,
                phase: "regulation",
                periodType: "quarter",
                periodIndex: quarter,
                gameClock,
                team: offense,
                type: cause,
                description,
              })
            );
          }
        }

        // drive_end
        await postEventAndLog(
          makeEvent("drive_end", {
            quarter,
            phase: "regulation",
            gameClock: formatClock(secondsLeft),
            team: offense,
            driveNumber,
            result: driveResult,
            plays,
            totalYards,
          })
        );

        // prepare next drive
        driveNumber += 1;
        offenseIsHome = !offenseIsHome;
      } // end drives loop

      // quarter_end - always include 0:00
      await postEventAndLog(
        makeEvent("quarter_end", {
          quarter,
          phase: "regulation",
          periodType: "quarter",
          periodIndex: quarter,
          gameClock: "0:00",
          scoreSnapshot: { [home]: score[home], [away]: score[away] },
        })
      );
    } // end quarters

    // game_end
    await postEventAndLog(
      makeEvent("game_end", {
        finalScore: { [home]: score[home], [away]: score[away] },
        quarters: 4,
        status: "final",
      })
    );

    setRunning(false);
    // navigate to game page after simulation to let UI inspect PBP
    router.push(`/games/${encodeURIComponent(GAME_ID)}`);
  }

  async function handleClick() {
    // Keep a guard to prevent double-run
    if (running) return;
    await simulateGame();
  }

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Mock Game</h1>
      <button
        onClick={handleClick}
        disabled={running}
        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {running ? "Simulating..." : "Start Mock Game"}
      </button>
    </main>
  );
}
