// Base event interface
export interface BaseGameEvent {
  eventId: string;
  gameId: string;
  appId: string;
  sport: string;
  type: string;
  timestamp: string;
  createdAt: string;
  payload: Record<string, unknown>;
  text: string;
}

// Specific event types with typed payloads
export interface PlayEvent extends BaseGameEvent {
  type: 'play';
  payload: {
    time?: string;
    text?: string;
    description?: string;
    yardLine?: number;
    down?: number;
    distance?: number;
    possession?: string;
  };
}

export interface ScoreEvent extends BaseGameEvent {
  type: 'score' | 'touchdown' | 'field_goal' | 'safety';
  payload: {
    team: string;
    points: number;
    player?: string;
    time?: string;
    text?: string;
    distance?: number; // for field goals
    yards?: number; // for touchdowns
  };
}

export interface TimeoutEvent extends BaseGameEvent {
  type: 'timeout';
  payload: {
    team: string;
    time?: string;
    text?: string;
    reason?: 'injury' | 'strategic' | 'tv' | 'official';
  };
}

export interface KickoffEvent extends BaseGameEvent {
  type: 'kickoff';
  payload: {
    team: string;
    time?: string;
    text?: string;
    returner?: string;
    returnYards?: number;
  };
}

export interface CommentaryEvent extends BaseGameEvent {
  type: 'commentary' | 'AI_Commentary';
  payload: {
    text: string;
    time?: string;
    originalEvent?: BaseGameEvent;
    generatedAt?: string;
    commentator?: string;
  };
}

export interface GameControlEvent extends BaseGameEvent {
  type: 'game_start' | 'game_end' | 'quarter_change' | 'period_change' | 'halftime';
  payload: {
    time?: string;
    text?: string;
    quarter?: number;
    period?: number;
    gameStatus?: GameStatus;
  };
}

// Union type for all possible game events
export type GameEvent = PlayEvent | ScoreEvent | TimeoutEvent | KickoffEvent | CommentaryEvent | GameControlEvent | {
  // Unique event id
  id: string;
  // Type of the event, includes AI_Commentary
  type: 'AI_Commentary' | 'PLAY' | 'SUBSTITUTION' | string;
  // ISO timestamp
  timestamp: string;
  // Arbitrary payload depending on event type
  payload?: Record<string, unknown>;
  text: string;
  eventId: string;
  time: string;
};

// Timeline event (for display purposes)
export interface TimelineEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
  time: string;
  text: string;
  eventId: string;
}

// Game Session types
export type GameStatus = 'scheduled' | 'active' | 'halftime' | 'completed' | 'suspended' | 'cancelled';

export interface GameSession {
  id: string;
  createdAt: string;
  // other session metadata if needed
}

// API Response types
export interface TimelineResponse {
  gameId: string;
  timeline: TimelineEvent[];
  eventCount: number;
}

export interface IngestEventResponse {
  message: string;
  eventId: string;
  gameId: string;
  type: string;
  timestamp: string;
}

export interface CommentaryResponse {
  message: string;
  eventId: string;
  commentary: string;
  gameId: string;
}

// Request types
export interface IngestEventRequest {
  gameId: string;
  type: string;
  payload?: Record<string, unknown>;
  time?: string;
  text?: string;
}

export interface GenerateCommentaryRequest {
  gameId: string;
  event: {
    type: string;
    payload?: Record<string, unknown>;
  };
}

// Frontend-specific types
export interface GamePageProps {
  gameId: string;
}

export interface MockEventConfig {
  type: string;
  time: string;
  text: string;
  payload?: Record<string, unknown>;
}

// Utility types
export type EventType = 
  | 'play' 
  | 'score' 
  | 'touchdown' 
  | 'field_goal' 
  | 'safety'
  | 'timeout' 
  | 'kickoff' 
  | 'commentary' 
  | 'AI_Commentary'
  | 'game_start' 
  | 'game_end' 
  | 'quarter_change' 
  | 'period_change' 
  | 'halftime'
  | 'first_down'
  | 'penalty'
  | 'interception'
  | 'fumble'
  | 'punt';

// Add a typed union for common event types and a helper to get a human label.
// This keeps titles consistent and avoids "Unknown" when the event type is known.
// NOTE: The duplicate EventType declaration below was removed; use the single
// EventType declared earlier in this file (the comprehensive union of known keys).

export function getEventLabel(type?: string): string {
	// friendly labels for known types; fallback to a readable version of the raw type
	const map: Record<string, string> = {
		play: "Play",
		AI_Commentary: "AI commentary",
		score: "Score",
		penalty: "Penalty",
		timeout: "Timeout",
		possession: "Change of possession",
		substitution: "Substitution",
		injury: "Injury",
		kickoff: "Kickoff",
		start: "Start",
		end: "End",
	};

	if (!type) return "Event";
	if (map[type]) return map[type];
	// fallback: convert snake/underscore or camel-case to spaced words and capitalize first letter
	const spaced = type.replace(/([A-Z])/g, " $1").replace(/[_\-]+/g, " ").trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// If your existing GameEvent type is declared here, prefer using EventType for the `type` field.
// Example modification (only if GameEvent is declared in this file):
/*
export type GameEvent = {
	// ...existing properties...
	type: EventType;
	// ...existing properties...
};
*/

export type Team = 'teamA' | 'teamB';

// Error types
export interface APIError {
  error: string;
  details?: string;
  required?: string[];
  received?: Record<string, unknown>;
}

// Form types for creating events
export interface CreateEventForm {
  gameId: string;
  type: EventType;
  team?: Team | string;
  player?: string;
  points?: number;
  time?: string;
  text?: string;
  customPayload?: string; // JSON string
}

// Hook return types
export interface UseGameTimelineReturn {
  timeline: TimelineEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseGameSessionReturn {
  session: GameSession | null;
  loading: boolean;
  error: string | null;
  updateSession: (updates: Partial<GameSession>) => Promise<void>;
}

// Constants
export const EVENT_TYPES: Record<EventType, string> = {
  play: 'Play',
  score: 'Score',
  touchdown: 'Touchdown',
  field_goal: 'Field Goal',
  safety: 'Safety',
  timeout: 'Timeout',
  kickoff: 'Kickoff',
  commentary: 'Commentary',
  AI_Commentary: 'AI Commentary',
  game_start: 'Game Start',
  game_end: 'Game End',
  quarter_change: 'Quarter Change',
  period_change: 'Period Change',
  halftime: 'Halftime',
  first_down: 'First Down',
  penalty: 'Penalty',
  interception: 'Interception',
  fumble: 'Fumble',
  punt: 'Punt',
};

export const GAME_STATUSES: Record<GameStatus, string> = {
  scheduled: 'Scheduled',
  active: 'Active',
  halftime: 'Halftime',
  completed: 'Completed',
  suspended: 'Suspended',
  cancelled: 'Cancelled'
};

// Type guards
export function isScoreEvent(event: GameEvent): event is ScoreEvent {
  return ['score', 'touchdown', 'field_goal', 'safety'].includes(event.type);
}

export function isCommentaryEvent(event: GameEvent): event is CommentaryEvent {
  return ['commentary', 'AI_Commentary'].includes(event.type);
}

export function isGameControlEvent(event: GameEvent): event is GameControlEvent {
  return ['game_start', 'game_end', 'quarter_change', 'period_change', 'halftime'].includes(event.type);
}

// Validation helpers
export function isValidEventType(type: string): type is EventType {
  return Object.keys(EVENT_TYPES).includes(type as EventType);
}

export function isValidGameStatus(status: string): status is GameStatus {
  return Object.keys(GAME_STATUSES).includes(status as GameStatus);
}