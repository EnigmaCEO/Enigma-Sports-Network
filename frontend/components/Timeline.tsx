import React from 'react';
import type { GameEvent } from '../types/events';

type Props = {
	events?: GameEvent[];
	className?: string;
};

function ordinalQuarter(n?: number) {
	if (!n) return '';
	const map: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
	return `${map[n] ?? String(n) + 'th'} Quarter`;
}

function driveResultLabel(result?: string) {
	if (!result) return 'Drive';
	const r = String(result).toLowerCase();
	if (r.includes('field_goal') || r.includes('fg') || r.includes('field goal')) return 'Field Goal';
	if (r.includes('touchdown') || r.includes('td')) return 'Touchdown';
	if (r.includes('punt')) return 'Punt';
	if (r.includes('turnover') || r.includes('interception') || r.includes('fumble')) return 'Turnover';
	return result;
}

function isObject(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === 'object';
}
function getString(obj: unknown, key: string): string | undefined {
	if (!isObject(obj)) return undefined;
	const val = obj[key];
	return typeof val === 'string' ? val : undefined;
}
function getNumber(obj: unknown, key: string): number | undefined {
	if (!isObject(obj)) return undefined;
	const val = obj[key];
	if (typeof val === 'number') return val;
	if (typeof val === 'string') {
		const n = Number(val);
		return Number.isNaN(n) ? undefined : n;
	}
	return undefined;
}
function hasKey(obj: unknown, key: string): boolean {
	return isObject(obj) && key in obj;
}

function formatPlayText(ev: GameEvent) {
	const payload = ev.payload;

	// --- new: prefer backend/ingest-provided description field when present ---
	if (payload && typeof payload === 'object') {
		const desc = getString(payload, 'description');
		if (desc && desc.trim().length > 0) return desc;
	}

	const playType = getString(payload, 'playType');

	if (playType === 'run' || (hasKey(payload, 'runner') && getString(payload, 'runner'))) {
		const runner = getString(payload, 'runner') ?? 'Unknown';
		const yards = getNumber(payload, 'yards') ?? 0;
		if (yards > 0) return `Run by ${runner} for ${yards} yards`;
		if (yards === 0) return `Run by ${runner} for no gain`;
		return `Run by ${runner} for ${Math.abs(yards)}-yard loss`;
	}
	if (playType === 'pass' || (hasKey(payload, 'passer') && getString(payload, 'passer'))) {
		const passer = getString(payload, 'passer') ?? 'Unknown';
		const target = getString(payload, 'target') ?? 'unknown';
		const result = getString(payload, 'result') ?? '';
		const yards = getNumber(payload, 'yards') ?? 0;
		if (result === 'complete') return `Pass from ${passer} to ${target} for ${yards} yards`;
		if (result === 'incomplete') return `Incomplete pass from ${passer} to ${target}`;
		if (result === 'sack') return `Sack on ${passer} for ${Math.abs(yards)}-yard loss`;
		return `Pass from ${passer} to ${target}`;
	}
	if (ev.type === 'score') {
		const scoreType = (getString(payload, 'scoreType') ?? '').toUpperCase();
		const team = getString(payload, 'team') ?? '';
		const yards = getNumber(payload, 'yards');
		const yardsStr = yards !== undefined ? String(yards) : '';
		if (scoreType === 'FG') return `Field goal ${String(getString(payload, 'result') ?? '').toUpperCase()} from ${yardsStr} yards – ${team}`;
		if (scoreType === 'TD') return `Touchdown ${team} – ${yardsStr}-yard play`;
		return `${scoreType} by ${team}`;
	}
	return String(getString(ev.payload, 'text') ?? ev.type);
}

function playSecondaryLine(ev: GameEvent) {
	const p = ev.payload;
	if (hasKey(p, 'down')) {
		const down = getNumber(p, 'down') ?? getString(p, 'down') ?? '';
		const distance = getNumber(p, 'distance') ?? getString(p, 'distance') ?? '';
		const yardLineVal = hasKey(p, 'yardLine') ? (getString(p, 'yardLine') ?? String(getNumber(p, 'yardLine') ?? '')) : '';
		const teamAt = yardLineVal ? ` at ${yardLineVal}` : '';
		return `Down ${down} & ${distance}${teamAt}`;
	}
	return undefined;
}

function formatYardLine(payload: unknown): string {
	if (!isObject(payload)) return '';
	const ylStr = getString(payload, 'yardLine');
	if (ylStr) return ylStr;
	const ylNum = getNumber(payload, 'yardLine');
	if (ylNum !== undefined) return String(ylNum);
	const team = getString(payload, 'team');
	const line = getString(payload, 'line') ?? getString(payload, 'yard') ?? undefined;
	if (team && line) return `${team[0].toUpperCase()}${String(line)}`;
	return '';
}

function formatScoreSnapshot(snapshot: unknown): string {
	if (!isObject(snapshot)) return '';
	if ('home' in (snapshot as Record<string, unknown>) || 'away' in (snapshot as Record<string, unknown>)) {
		const s = snapshot as Record<string, unknown>;
		const home = s['home'] ?? '';
		const away = s['away'] ?? '';
		return `${String(home)}, ${String(away)}`;
	}
	if (isObject(snapshot)) {
		const entries = Object.entries(snapshot as Record<string, unknown>);
		if (entries.length > 0) return entries.map(([k, v]) => `${k} ${v}`).join(', ');
	}
	return '';
}

export default function Timeline({ events = [], className }: Props) {
	if (!events || events.length === 0) {
		return <div>No events yet.</div>;
	}

	const gameStartEvents = events.filter((e) => e.type === 'game_start');
	const gameStartEvent = gameStartEvents.length > 0 ? gameStartEvents[0] : undefined;
	const gameEndEvents = events.filter((e) => e.type === 'game_end');
	const gameEndEvent = gameEndEvents.length > 0 ? gameEndEvents[0] : undefined;
	const eventsForGrouping = events.filter((e) => e.type !== 'game_start' && e.type !== 'game_end');

	type QuarterGroup = {
		quarter?: number;
		startEvent?: GameEvent;
		endEvent?: GameEvent;
		events: GameEvent[];
	};
	const quarters: QuarterGroup[] = [];

	let currentQuarter: QuarterGroup | null = null;
	for (const ev of eventsForGrouping) {
		if (ev.type === 'quarter_start') {
			if (currentQuarter && currentQuarter.events.length > 0) quarters.push(currentQuarter);
			currentQuarter = { quarter: (isObject(ev.payload) ? getNumber(ev.payload, 'quarter') : undefined) ?? undefined, startEvent: ev, events: [] };
			continue;
		}
		if (ev.type === 'quarter_end') {
			if (!currentQuarter) {
				currentQuarter = { quarter: isObject(ev.payload) ? getNumber(ev.payload, 'quarter') : undefined, events: [] };
			}
			currentQuarter.endEvent = ev;
			quarters.push(currentQuarter);
			currentQuarter = null;
			continue;
		}
		if (!currentQuarter) {
			const q = isObject(ev.payload) ? getNumber(ev.payload, 'quarter') : undefined;
			currentQuarter = { quarter: typeof q === 'number' ? q : undefined, events: [] };
		}
		currentQuarter.events.push(ev);
	}
	if (currentQuarter && currentQuarter.events.length > 0) quarters.push(currentQuarter);

	type DriveGroup = {
		startEvent?: GameEvent;
		endEvent?: GameEvent;
		events: GameEvent[];
	};
	const groupDrives = (evs: GameEvent[]): DriveGroup[] => {
		const drives: DriveGroup[] = [];
		let current: DriveGroup | null = null;
		for (const ev of evs) {
			if (ev.type === 'drive_start') {
				if (current && current.events.length > 0) drives.push(current);
				current = { startEvent: ev, events: [] };
				continue;
			}
			if (!current) current = { events: [] };
			current.events.push(ev);
			if (ev.type === 'drive_end') {
				current.endEvent = ev;
				drives.push(current);
				current = null;
			}
		}
		if (current && current.events.length > 0) drives.push(current);
		return drives;
	};

	return (
		<section aria-labelledby="game-timeline" className={className}>
			<h3 id="game-timeline" style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
				Game timeline
			</h3>

			{gameStartEvent ? (
				<div className="mb-4 p-3 bg-gray-50 rounded border">
					<div className="text-sm font-semibold text-gray-900"></div>
					<div className="text-xs text-gray-600">
						{isObject(gameStartEvent.payload) && getString(gameStartEvent.payload, 'text')
							? getString(gameStartEvent.payload, 'text')
							: String(gameStartEvent.text ?? '')}
						{isObject(gameStartEvent.payload) && getString(gameStartEvent.payload, 'gameClock') ? ` • ${getString(gameStartEvent.payload, 'gameClock')}` : null}
					</div>
				</div>
			) : null}

			{quarters.map((qg, qi) => {
				const qnum = qg.quarter ?? qi + 1;
				const drives = groupDrives(qg.events);
				const startClock = (isObject(qg.startEvent?.payload) ? getString(qg.startEvent!.payload, 'gameClock') : undefined) ?? (isObject(qg.events[0]?.payload) ? getString(qg.events[0]!.payload, 'gameClock') : '') ?? '';

				return (
					<section key={`quarter-${qnum}`} className="mb-4">
						<div className="mb-2">
							<div className="text-base font-semibold leading-tight">{ordinalQuarter(qnum)}</div>
							{startClock ? <div className="text-xs text-gray-500 -mt-1">Start clock: {startClock}</div> : null}
						</div>

						<div className="space-y-4">
							{drives.map((d, di) => {
								const team = getString(d.startEvent?.payload, 'team') ?? getString(d.events[0]?.payload, 'team') ?? 'Unknown';
								const driveNumber = getNumber(d.startEvent?.payload, 'driveNumber') ?? getNumber(d.endEvent?.payload, 'driveNumber');
								const firstPlay = d.events.find((e) => e.type === 'play');
								const startClockPlay = (isObject(firstPlay?.payload) ? getString(firstPlay!.payload, 'gameClock') : undefined) ?? getString(firstPlay, 'time') ?? '';
								const yardLine = formatYardLine(firstPlay?.payload);
								const playsSummary = getNumber(d.endEvent?.payload, 'plays') ?? d.events.filter((e) => e.type === 'play').length;
								const yardsSummary =
									getNumber(d.endEvent?.payload, 'totalYards') ??
									d.events.reduce((acc, ev) => {
										const py = getNumber(ev.payload, 'yards') ?? 0;
										return acc + (Number.isFinite(py) ? py : 0);
									}, 0);
								const resultLabel = driveResultLabel(isObject(d.endEvent?.payload) ? (getString(d.endEvent!.payload, 'result') ?? undefined) : undefined);

								return (
									<article key={`q${qnum}-drive-${di}`} className="border rounded-md p-3 bg-white">
										<header className="flex items-start justify-between mb-3 gap-4">
											<div className="min-w-0">
												<div className="text-sm font-semibold text-gray-900">{team}</div>
												<div className="text-xs text-gray-500 truncate">
													{driveNumber ? `Drive ${driveNumber} — ` : 'Drive — '}
													{startClockPlay ? `Start ${startClockPlay}` : ''}
													{yardLine ? ` at ${yardLine}` : ''}
												</div>
											</div>

											<div className="text-right text-xs text-gray-600 whitespace-nowrap">
												<span className="font-medium">Plays: {playsSummary ?? 0}</span>
												<span className="mx-2">|</span>
												<span>Yards: {yardsSummary ?? 0}</span>
												{resultLabel ? (
													<>
														<span className="mx-2">|</span>
														<span className="text-gray-500">{resultLabel}</span>
													</>
												) : null}
											</div>
										</header>

										<ul className="space-y-2 pl-0">
											{d.events.map((ev, ei) => {
												const clock = (isObject(ev.payload) ? getString(ev.payload, 'gameClock') : undefined) ?? getString(ev, 'time') ?? '';
												const main = formatPlayText(ev);
												const secondary = playSecondaryLine(ev);
												const isTD =
													(ev.type === 'score' && ((getString(ev.payload, 'scoreType') ?? '').toUpperCase() === 'TD')) ||
													main.toLowerCase().includes('touchdown');
												const icon = ev.type === 'play' ? '🏈' : ev.type === 'score' ? '🎯' : ev.type === 'drive_end' ? '🔚' : '•';

												return (
													<li key={`q${qnum}-d${di}-e${ei}-${ev.type}`} className="flex items-start space-x-3">
														<div className="w-20 text-sm text-gray-500 tabular-nums">{clock}</div>
														<div className="mt-0.5 text-lg" aria-hidden>
															{isTD ? '🏆' : icon}
														</div>
														<div className="flex-1">
															<div className={isTD ? 'text-sm font-semibold text-gray-900' : 'text-sm text-gray-900'}>{main}</div>
															{secondary ? (
																<div className="text-xs text-gray-500 mt-0.5">{secondary}</div>
															) : null}
														</div>
														{isTD && isObject(ev.payload) && hasKey(ev.payload, 'score') ? (
															<div className="ml-3 text-xs font-medium text-gray-700">{String((ev.payload as Record<string, unknown>)['score'])}</div>
														) : null}
													</li>
												);
											})}
										</ul>
									</article>
								);
							})}
						</div>

						{qg.endEvent ? (
							<div className="mt-4">
								<hr className="border-t-2 border-gray-200" />
								<div className="py-3 text-sm font-semibold text-gray-800 bg-gray-50 border-t border-b border-gray-100">
									{isObject(qg.endEvent.payload) && hasKey(qg.endEvent.payload, 'scoreSnapshot') ? (
										<span>
											End of {ordinalQuarter(qnum)} — {formatScoreSnapshot((qg.endEvent.payload as Record<string, unknown>)['scoreSnapshot'])}
										</span>
									) : (
										<span>End of {ordinalQuarter(qnum)}</span>
									)}
								</div>
							</div>
						) : null}
					</section>
				);
			})}

			{gameEndEvent ? (
				<div className="mt-6 p-3 bg-gray-50 rounded border">
					<div className="text-sm font-semibold text-gray-900"></div>
					<div className="text-xs text-gray-600">
						{isObject(gameEndEvent.payload) && getString(gameEndEvent.payload, 'text')
							? getString(gameEndEvent.payload, 'text')
							: String(gameEndEvent.text ?? '')}
						{isObject(gameEndEvent.payload) && getString(gameEndEvent.payload, 'gameClock') ? ` • ${getString(gameEndEvent.payload, 'gameClock')}` : null}
					</div>
				</div>
			) : null}
		</section>
	);
}
