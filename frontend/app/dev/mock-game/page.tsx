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
    console.log(`${fullEvent.type} @ ${gc}`, { event: { eventId: fullEvent.eventId, gameId: fullEvent.gameId, appId: fullEvent.appId, sport: fullEvent.sport, type: fullEvent.type, timestamp: fullEvent.timestamp }, payload: fullEvent.payload });
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
            const blockSide = pick(["left", "right", "middle"]);
            const blockers = [randInt(50, 79), randInt(50, 79)].map((n) => `#${n}`);
            const keyBlocker = blockers[0];
            const blockOutcome = pick(["edge_sealed", "neutral", "missed"]);
            const runner = `#${randInt(20, 35)}`;

            const payload = {
              ...playBase,
              runner,
              yards,
              blockSide,
              blockers,
              keyBlocker,
              blockOutcome,
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
            const passer = `#${randInt(1, 12)}`;
            const target = `#${randInt(13, 29)}`;
            const route = pick(["slant", "go", "out", "in", "post", "corner"]);
            const blockers = [randInt(50, 79), randInt(50, 79)].map((n) => `#${n}`);
            const keyProtector = blockers[0];
            // pressureAllowedBy is null for clean pocket; if sack or incompletion with pressure, set an OL
            const pressureAllowedBy = Math.random() < 0.15 ? `#${randInt(50, 79)}` : null;

            const payload = {
              ...playBase,
              passer,
              target,
              yards,
              route,
              result,
              blockers,
              keyProtector,
              pressureAllowedBy,
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
          score[offense] += 6;
          driveResult = "touchdown";
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
          };
          await postEventAndLog(makeEvent("score", payload));
        } else if (scoreRoll < 0.22) {
          // field goal
          const fgYards = randInt(20, 55);
          score[offense] += 3;
          driveResult = "field_goal";
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
          };
          await postEventAndLog(makeEvent("score", payload));
        } else {
          // no score: punt/turnover/predetermined
          driveResult = pick(["punt", "turnover"]);
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
