import { GameStatus, EventType, Team } from '../types/events';

// Time formatting utilities
export const timeFormatters = {
  // Format timestamp to game time (e.g., "14:32")
  toGameTime: (timestamp: string | Date, fallback: string = '--:--'): string => {
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return fallback;
    }
  },

  // Format timestamp to readable time (e.g., "2:32 PM")
  toDisplayTime: (timestamp: string | Date): string => {
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return 'Invalid time';
    }
  },

  // Format timestamp to full date and time
  toFullDateTime: (timestamp: string | Date): string => {
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return 'Invalid date';
    }
  },

  // Format game clock time (e.g., "12:34" in Q2)
  toGameClock: (time: string | undefined, quarter?: number): string => {
    if (!time) return '--:--';
    const quarterText = quarter ? ` Q${quarter}` : '';
    return `${time}${quarterText}`;
  },

  // Format relative time (e.g., "2 minutes ago")
  toRelativeTime: (timestamp: string | Date): string => {
    try {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } catch {
      return 'Unknown';
    }
  }
};

// Score formatting utilities
export const scoreFormatters = {
  // Format team score display (e.g., "Lions 21")
  teamScore: (teamName: string, score: number | undefined): string => {
    return `${teamName} ${score ?? 0}`;
  },

  // Format game score (e.g., "Lions 21 - Cowboys 14")
  gameScore: (
    teamA: string, 
    scoreA: number | undefined, 
    teamB: string, 
    scoreB: number | undefined
  ): string => {
    return `${teamA} ${scoreA ?? 0} - ${teamB} ${scoreB ?? 0}`;
  },

  // Format score differential (e.g., "+7", "-3", "Tied")
  scoreDiff: (scoreA: number | undefined, scoreB: number | undefined): string => {
    const a = scoreA ?? 0;
    const b = scoreB ?? 0;
    const diff = a - b;
    
    if (diff === 0) return 'Tied';
    return diff > 0 ? `+${diff}` : `${diff}`;
  },

  // Format point breakdown for an event (e.g., "Touchdown (6 pts)")
  pointsBreakdown: (eventType: EventType, points?: number): string => {
    const defaultPoints = {
      touchdown: 6,
      field_goal: 3,
      safety: 2,
      extra_point: 1,
      two_point_conversion: 2
    };

    const eventPoints = points ?? defaultPoints[eventType as keyof typeof defaultPoints] ?? 0;
    const eventName = labelFormatters.eventType(eventType);
    
    return eventPoints > 0 ? `${eventName} (${eventPoints} pts)` : eventName;
  }
};

// Label formatting utilities
export const labelFormatters = {
  // Format event type for display
  eventType: (type: EventType | string): string => {
    const typeMap: Record<string, string> = {
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
      two_minute_warning: 'Two Minute Warning'
    };

    return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  },

  // Format game status for display
  gameStatus: (status: GameStatus): string => {
    const statusMap: Record<GameStatus, string> = {
      scheduled: 'Scheduled',
      active: 'Live',
      halftime: 'Halftime',
      completed: 'Final',
      suspended: 'Suspended',
      cancelled: 'Cancelled'
    };

    return statusMap[status] || status;
  },

  // Format team name (handle teamA/teamB vs actual names)
  teamName: (team: Team | string, teamAName?: string, teamBName?: string): string => {
    if (team === 'teamA' && teamAName) return teamAName;
    if (team === 'teamB' && teamBName) return teamBName;
    return team;
  },

  // Format down and distance (e.g., "1st & 10", "4th & Goal")
  downAndDistance: (down?: number, distance?: number, yardLine?: number): string => {
    if (!down) return '';
    
    const downSuffix = ['st', 'nd', 'rd', 'th'];
    const suffix = downSuffix[down - 1] || 'th';
    
    if (!distance) return `${down}${suffix} down`;
    
    // Check for goal line situation
    if (yardLine && yardLine <= 10 && distance >= yardLine) {
      return `${down}${suffix} & Goal`;
    }
    
    return `${down}${suffix} & ${distance}`;
  },

  // Format field position (e.g., "Own 25", "Opp 35", "Red Zone")
  fieldPosition: (yardLine?: number, possession?: string): string => {
    if (!yardLine) return '';
    
    if (yardLine <= 20) return 'Red Zone';
    if (yardLine <= 50) return `${possession} ${yardLine}`;
    return `Opp ${100 - yardLine}`;
  }
};

// Text formatting utilities
export const textFormatters = {
  // Truncate text with ellipsis
  truncate: (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  },

  // Capitalize first letter of each word
  titleCase: (text: string): string => {
    return text.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  },

  // Format player name (handle various formats)
  playerName: (name: string): string => {
    // Handle formats like "QB #12 John Smith" or "#12 John Smith" or "John Smith"
    const parts = name.trim().split(/\s+/);
    
    // If it starts with position, remove it
    if (parts[0] && /^(QB|RB|WR|TE|K|DEF)$/i.test(parts[0])) {
      parts.shift();
    }
    
    // If it has a number, format it nicely
    if (parts[0] && parts[0].startsWith('#')) {
      const number = parts.shift();
      return `${parts.join(' ')} ${number}`;
    }
    
    return parts.join(' ');
  },

  // Generate event summary text
  eventSummary: (
    type: EventType, 
    payload: Record<string, unknown>, 
    maxLength: number = 80
  ): string => {
    let summary = '';
    
    switch (type) {
      case 'touchdown':
        summary = `Touchdown by ${payload.team}${payload.player ? ` (${textFormatters.playerName(String(payload.player))})` : ''}`;
        if (payload.yards) summary += ` from ${payload.yards} yards`;
        break;
      
      case 'field_goal':
        summary = `${payload.distance}-yard field goal by ${payload.team}`;
        break;
      
      case 'timeout':
        summary = `Timeout called by ${payload.team}`;
        if (payload.reason) summary += ` (${payload.reason})`;
        break;
      
      case 'play':
        summary = String(payload.text || payload.description || 'Play');
        break;
      
      default:
        summary = String(payload.text || '') || labelFormatters.eventType(type);
    }
    
    return textFormatters.truncate(summary, maxLength);
  }
};

// Number formatting utilities
export const numberFormatters = {
  // Format large numbers with commas
  withCommas: (num: number): string => {
    return num.toLocaleString('en-US');
  },

  // Format percentage
  percentage: (value: number, total: number, decimals: number = 1): string => {
    if (total === 0) return '0%';
    const percent = (value / total) * 100;
    return `${percent.toFixed(decimals)}%`;
  },

  // Format yards (e.g., "+5", "-2", "0")
  yards: (yards: number): string => {
    if (yards > 0) return `+${yards}`;
    return yards.toString();
  },

  // Ordinal numbers (1st, 2nd, 3rd, 4th)
  ordinal: (num: number): string => {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    return num + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }
};

// CSS class utilities for styling
export const styleFormatters = {
  // Get CSS classes for event types
  eventTypeClass: (type: EventType): string => {
    const baseClass = 'event-type';
    const typeClass = type.toLowerCase().replace(/_/g, '-');
    return `${baseClass} ${baseClass}--${typeClass}`;
  },

  // Get CSS classes for game status
  gameStatusClass: (status: GameStatus): string => {
    const baseClass = 'game-status';
    return `${baseClass} ${baseClass}--${status}`;
  },

  // Get CSS classes for team colors (you'd customize these)
  teamClass: (team: string): string => {
    const baseClass = 'team';
    const teamSlug = team.toLowerCase().replace(/\s+/g, '-');
    return `${baseClass} ${baseClass}--${teamSlug}`;
  }
};

// Validation utilities
export const validators = {
  // Check if a game time is valid
  isValidGameTime: (time: string): boolean => {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  },

  // Check if a score is valid
  isValidScore: (score: unknown): score is number => {
    return typeof score === 'number' && score >= 0 && Number.isInteger(score);
  }
};

// Export all formatters
const formatters = {
  time: timeFormatters,
  score: scoreFormatters,
  label: labelFormatters,
  text: textFormatters,
  number: numberFormatters,
  style: styleFormatters,
  validate: validators
};

export default formatters;