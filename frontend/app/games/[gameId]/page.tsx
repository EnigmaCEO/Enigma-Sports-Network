import React from 'react';
import Timeline from '../../../components/Timeline';
import { getTimeline } from '../../../lib/api';
import type { GameEvent } from '../../../types/events';

type Props = {
	// params is a Promise in this Next version
	params: Promise<{ gameId?: string }>;
};

export default async function GamePage({ params }: Props) {
	// await the params promise per Next's error message
	const resolved = await params;
	const gameId = resolved?.gameId;

	if (!gameId) {
		return (
			<main className="mx-auto max-w-3xl p-6 space-y-4">
				<h1 className="text-xl font-semibold">Missing gameId</h1>
				<p>Could not determine the game id from the route. Ensure the URL is /games/[gameId].</p>
			</main>
		);
	}

	let events: GameEvent[] = [];
	try {
		const resp = await getTimeline(gameId);
		events = Array.isArray(resp) ? (resp as GameEvent[]) : [];
	} catch (err) {
		console.warn(`[GamePage] getTimeline failed for ${gameId}`, err);
		events = [];
	}
	console.log(`Rendering GamePage for gameId=${gameId} with ${events.length} events`);

	return (
		<main className="mx-auto max-w-3xl p-6 space-y-4">
			<h1 className="text-xl font-semibold">Game: {gameId}</h1>
			<Timeline events={events} />
		</main>
	);
}
