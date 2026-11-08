/**
 * Match modes — Arena-inspired.
 * - solo-ai: lokálně vs demo AI
 * - online: přesně 2 hráči, server drží GameState
 */

export type MatchMode = 'solo-ai' | 'online';

export type SeatRole = 'human' | 'ai' | 'remote';

export interface MatchSeat {
  playerId: 'p1' | 'p2';
  displayName: string;
  role: SeatRole;
}

export interface MatchConfig {
  mode: MatchMode;
  seats: MatchSeat[];
  roomId?: string;
}

export function defaultSoloAiMatch(): MatchConfig {
  return {
    mode: 'solo-ai',
    seats: [
      { playerId: 'p1', displayName: 'Honza', role: 'human' },
      { playerId: 'p2', displayName: 'Opponent (AI)', role: 'ai' },
    ],
  };
}

/** Online vždy přesně 2 sedadla. */
export function defaultOnlineMatch(roomId: string): MatchConfig {
  return {
    mode: 'online',
    roomId,
    seats: [
      { playerId: 'p1', displayName: 'Player 1', role: 'remote' },
      { playerId: 'p2', displayName: 'Player 2', role: 'remote' },
    ],
  };
}
