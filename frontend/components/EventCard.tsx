import React from "react";
import type { GameEvent } from "../types/events";
import { getEventLabel } from "../types/events";

type Props = {
	event: GameEvent;
};

type Payload = {
	title?: string;
	text?: string;
	time?: string;
	[key: string]: unknown;
};

export default function EventCard({ event }: Props) {
	// Prefer an explicit title in the payload, then payload.text, then a label derived from type.
	const payload = ((event as GameEvent & { payload?: Payload }).payload) ?? {};
	const titleFromPayload = payload.title ?? payload.text;
	const title = titleFromPayload ?? getEventLabel(event.type ?? "");
	// Try to show a short time if available in payload, else format timestamp
	const timeString =
		payload.time ??
		(event.timestamp
			? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
			: "");

	return (
		<article className="p-3 border rounded mb-2">
			<div className="flex items-center justify-between">
				<strong>{title}</strong>
				{timeString ? (
					<time dateTime={event.timestamp} className="text-xs text-gray-500">
						{timeString}
					</time>
				) : null}
			</div>

			{payload.text && payload.text !== titleFromPayload ? (
				<p className="text-sm text-gray-700 mt-1">{payload.text}</p>
			) : null}

			{/* Optionally show type badge for clarity */}
			<div className="text-xs text-gray-400 mt-1">{getEventLabel(event.type)}</div>
		</article>
	);
}
