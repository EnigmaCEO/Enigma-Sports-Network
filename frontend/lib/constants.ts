import { EventType, GameStatus, Team } from '../types/events';

// API Configuration
export const API_ENDPOINTS = {
  // Timeline endpoints
  TIMELINE: '/timeline',
  TIMELINE_EVENTS: '/timeline/events',
  
  // Event management
  INGEST_EVENT: '/ingest-event',
  BULK_INGEST: '/ingest-event/bulk',
  
  // Commentary
  GENERATE_COMMENTARY: '/generate-commentary',
  
  // Game sessions
  GAME_SESSION: '/game-session',
  CREATE_SESSION: '/game-session/create',
  UPDATE_SESSION: '/game-session/update',
  
  // Utility endpoints
  HEALTH_CHECK: '/health',
  MOCK_EVENTS: '/dev/mock-events'
} as const;

// Lambda Function URLs (if calling directly)
export const LAMBDA_ENDPOINTS = {
  INGEST_EVENT: process.env.NEXT_PUBLIC_LAMBDA_INGEST_EVENT_URL,
  GET_TIMELINE: process.env.NEXT_PUBLIC_LAMBDA_GET_TIMELINE_URL,
  GENERATE_COMMENTARY: process.env.NEXT_PUBLIC_LAMBDA_GENERATE_COMMENTARY_URL
} as const;

// Event Type Configurations
export const EVENT_TYPES: Record<EventType, {
  label: string;
  color: string;
  icon?: string;
  defaultPoints?: number;
  category: 'scoring' | 'play' | 'administrative' | 'commentary';
}> = {
  // Scoring events
  touchdown: {
    label: 'Touchdown',
    color: '#16a34a', // green-600
    icon: '🏈',
    defaultPoints: 6,
    category: 'scoring'
  },
  field_goal: {
    label: 'Field Goal',
    color: '#2563eb', // blue-600
    icon: '🥅',
    defaultPoints: 3,
    category: 'scoring'
  },
  safety: {
    label: 'Safety',
    color: '#dc2626', // red-600
    icon: '⚠️',
    defaultPoints: 2,
    category: 'scoring'
  },
  score: {
    label: 'Score',
    color: '#059669', // emerald-600
    icon: '📊',
    category: 'scoring'
  },
  
  // Play events
  play: {
    label: 'Play',
    color: '#6b7280', // gray-500
    icon: '▶️',
    category: 'play'
  },
  first_down: {
    label: 'First Down',
    color: '#f59e0b', // amber-500
    icon: '1️⃣',
    category: 'play'
  },
  kickoff: {
    label: 'Kickoff',
    color: '#8b5cf6', // violet-500
    icon: '🦵',
    category: 'play'
  },
  punt: {
    label: 'Punt',
    color: '#6366f1', // indigo-500
    icon: '🦵',
    category: 'play'
  },
  penalty: {
    label: 'Penalty',
    color: '#eab308', // yellow-500
    icon: '🚩',
    category: 'play'
  },
  interception: {
    label: 'Interception',
    color: '#ef4444', // red-500
    icon: '🤲',
    category: 'play'
  },
  fumble: {
    label: 'Fumble',
    color: '#f97316', // orange-500
    icon: '🏈',
    category: 'play'
  },
  
  // Administrative events
  timeout: {
    label: 'Timeout',
    color: '#64748b', // slate-500
    icon: '⏸️',
    category: 'administrative'
  },
  game_start: {
    label: 'Game Start',
    color: '#10b981', // emerald-500
    icon: '🏁',
    category: 'administrative'
  },
  game_end: {
    label: 'Game End',
    color: '#374151', // gray-700
    icon: '🏁',
    category: 'administrative'
  },
  quarter_change: {
    label: 'Quarter Change',
    color: '#0ea5e9', // sky-500
    icon: '🔄',
    category: 'administrative'
  },
  period_change: {
    label: 'Period Change',
    color: '#0ea5e9', // sky-500
    icon: '🔄',
    category: 'administrative'
  },
  halftime: {
    label: 'Halftime',
    color: '#8b5cf6', // violet-500
    icon: '⏱️',
    category: 'administrative'
  },
  
  // Commentary events
  commentary: {
    label: 'Commentary',
    color: '#6366f1', // indigo-500
    icon: '💬',
    category: 'commentary'
  },
  AI_Commentary: {
    label: 'AI Commentary',
    color: '#8b5cf6', // violet-500
    icon: '🤖',
    category: 'commentary'
  }
};

// Game Status Configurations
export const GAME_STATUSES: Record<GameStatus, {
  label: string;
  color: string;
  icon?: string;
  description: string;
}> = {
  scheduled: {
    label: 'Scheduled',
    color: '#6b7280', // gray-500
    icon: '📅',
    description: 'Game has been scheduled but not started'
  },
  active: {
    label: 'Live',
    color: '#16a34a', // green-600
    icon: '🔴',
    description: 'Game is currently in progress'
  },
  halftime: {
    label: 'Halftime',
    color: '#f59e0b', // amber-500
    icon: '⏸️',
    description: 'Game is at halftime break'
  },
  completed: {
    label: 'Final',
    color: '#374151', // gray-700
    icon: '✅',
    description: 'Game has been completed'
  },
  suspended: {
    label: 'Suspended',
    color: '#dc2626', // red-600
    icon: '⏸️',
    description: 'Game has been temporarily suspended'
  },
  cancelled: {
    label: 'Cancelled',
    color: '#991b1b', // red-800
    icon: '❌',
    description: 'Game has been cancelled'
  }
};

// Team Configurations
export const TEAM_CONFIG: Record<Team, {
  label: string;
  color: string;
}> = {
  teamA: {
    label: 'Team A',
    color: '#2563eb' // blue-600
  },
  teamB: {
    label: 'Team B',
    color: '#dc2626' // red-600
  }
};

// Application Configuration
export const APP_CONFIG = {
  // Application info
  APP_NAME: 'Enigma Sports Network',
  APP_SHORT_NAME: 'ESN',
  VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  
  // API configuration
  API_TIMEOUT: 30000, // 30 seconds
  API_RETRY_ATTEMPTS: 3,
  API_RETRY_DELAY: 1000, // 1 second
  
  // Polling intervals (ms)
  TIMELINE_POLL_INTERVAL: 5000, // 5 seconds
  LIVE_GAME_POLL_INTERVAL: 3000, // 3 seconds
  IDLE_POLL_INTERVAL: 30000, // 30 seconds
  
  // UI Configuration
  MAX_EVENTS_DISPLAY: 100,
  EVENT_SUMMARY_MAX_LENGTH: 80,
  TIMELINE_PAGE_SIZE: 25,
  
  // Feature flags
  FEATURES: {
    LIVE_COMMENTARY: true,
    AI_COMMENTARY: true,
    LIVE_UPDATES: true,
    MOCK_EVENTS: process.env.NODE_ENV === 'development',
    ADMIN_PANEL: process.env.NODE_ENV === 'development'
  }
} as const;

// UI Constants
export const UI_CONSTANTS = {
  // Breakpoints (Tailwind CSS)
  BREAKPOINTS: {
    SM: 640,
    MD: 768,
    LG: 1024,
    XL: 1280,
    '2XL': 1536
  },
  
  // Animation durations (ms)
  ANIMATIONS: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500
  },
  
  // Z-index layers
  Z_INDEX: {
    DROPDOWN: 1000,
    MODAL: 1050,
    TOAST: 1100,
    TOOLTIP: 1200
  }
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  // Network errors
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  
  // Validation errors
  REQUIRED_FIELD: 'This field is required.',
  INVALID_GAME_ID: 'Invalid game ID format.',
  INVALID_TIME_FORMAT: 'Invalid time format. Use HH:MM.',
  INVALID_SCORE: 'Score must be a positive number.',
  
  // Game errors
  GAME_NOT_FOUND: 'Game not found.',
  GAME_NOT_ACTIVE: 'Game is not currently active.',
  NO_EVENTS_FOUND: 'No events found for this game.',
  
  // API errors
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  FORBIDDEN: 'This action is forbidden.',
  RATE_LIMITED: 'Too many requests. Please wait before trying again.'
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  EVENT_CREATED: 'Event created successfully!',
  EVENT_UPDATED: 'Event updated successfully!',
  COMMENTARY_GENERATED: 'Commentary generated successfully!',
  GAME_CREATED: 'Game session created successfully!',
  MOCK_EVENTS_SENT: 'Mock events sent successfully!'
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  GAME_PREFERENCES: 'esn_game_preferences',
  USER_SETTINGS: 'esn_user_settings',
  RECENT_GAMES: 'esn_recent_games',
  THEME: 'esn_theme'
} as const;

// Route Paths
export const ROUTES = {
  HOME: '/',
  GAME: '/games/[gameId]',
  GAMES_LIST: '/games',
  DEV_TOOLS: '/dev',
  MOCK_GAME: '/dev/mock-game',
  ADMIN: '/admin',
  SETTINGS: '/settings'
} as const;

// Regular Expressions
export const REGEX = {
  GAME_ID: /^[a-zA-Z0-9_-]+$/,
  TIME_FORMAT: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s-()]+$/
} as const;

// Default Values
export const DEFAULTS = {
  GAME_SESSION: {
    teamAScore: 0,
    teamBScore: 0,
    currentQuarter: 1,
    teamATimeouts: 3,
    teamBTimeouts: 3,
    gameStatus: 'scheduled' as GameStatus
  },
  
  PAGINATION: {
    page: 1,
    limit: 25
  },
  
  MOCK_EVENTS: [
    {
      type: 'kickoff' as EventType,
      time: '15:00',
      text: 'Kickoff to start the game'
    },
    {
      type: 'play' as EventType,
      time: '14:32',
      text: 'First down at the 25-yard line'
    },
    {
      type: 'touchdown' as EventType,
      time: '12:15',
      text: 'Touchdown from the 10-yard line'
    },
    {
      type: 'timeout' as EventType,
      time: '8:45',
      text: 'Timeout called'
    }
  ]
} as const;

// Export grouped constants
export const CONSTANTS = {
  API: API_ENDPOINTS,
  LAMBDA: LAMBDA_ENDPOINTS,
  EVENTS: EVENT_TYPES,
  GAME_STATUS: GAME_STATUSES,
  TEAMS: TEAM_CONFIG,
  APP: APP_CONFIG,
  UI: UI_CONSTANTS,
  ERRORS: ERROR_MESSAGES,
  SUCCESS: SUCCESS_MESSAGES,
  STORAGE: STORAGE_KEYS,
  ROUTES: ROUTES,
  REGEX: REGEX,
  DEFAULTS: DEFAULTS
} as const;

export default CONSTANTS;