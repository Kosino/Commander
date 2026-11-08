import { GameState, StackObject } from './types';
import { checkStateBasedActions } from './sba';
import { flushWaitingTriggers } from './triggers';
import { advanceStep } from './turn';
import { clonePlayers } from './zones';

function nextAlivePriorityIndex(state: GameState, from: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!state.players[idx].hasLost) return idx;
  }
  return from;
}

/**
 * CR 117.5 — before a player gets priority: SBA until stable, then grant priority.
 */
export function givePriority(state: GameState, playerIndex: number): GameState {
  let next = checkStateBasedActions(state);
  next = flushWaitingTriggers(next);
  if (next.pendingChoices.length > 0) {
    return { ...next, stateBasedActionsPending: true };
  }
  if (next.winnerId) return next;

  let idx = playerIndex;
  if (next.players[idx]?.hasLost) {
    idx = nextAlivePriorityIndex(next, idx);
  }
  return {
    ...next,
    priorityPlayerIndex: idx,
  };
}

/** Player takes a game action — they keep priority (117.3c). */
export function afterPlayerAction(state: GameState): GameState {
  return givePriority({ ...state, consecutivePasses: 0 }, state.priorityPlayerIndex);
}

/** Injected by cast.ts to avoid circular init issues at call time. */
let resolveStackFn: (state: GameState) => GameState = (state) => {
  if (state.stack.length === 0) return state;
  const next = clonePlayers(state);
  next.stack = next.stack.slice(0, -1);
  next.consecutivePasses = 0;
  return givePriority(next, next.activePlayerIndex);
};

export function registerStackResolver(fn: (state: GameState) => GameState): void {
  resolveStackFn = fn;
}

/**
 * CR 117.3d / 117.4 — pass priority.
 */
export function passPriority(state: GameState): GameState {
  if (state.pendingCast) return state;
  if (state.pendingLoyalty) return state;
  if (state.pendingActivated) return state;
  if (
    state.combat?.mode === 'declareAttackers' ||
    state.combat?.mode === 'declareBlockers' ||
    state.combat?.mode === 'assignDamage'
  ) {
    return state; // Arena: must Confirm declaration / damage assign first
  }
  if (state.pendingChoices.length > 0) return state;
  if (state.winnerId) return state;

  const aliveCount = state.players.filter((p) => !p.hasLost).length;
  if (aliveCount === 0) return state;

  const passes = state.consecutivePasses + 1;

  if (passes >= aliveCount) {
    if (state.stack.length > 0) {
      return resolveStackFn({ ...state, consecutivePasses: 0 });
    }
    const advanced = advanceStep({ ...state, consecutivePasses: 0 });
    return givePriority(advanced, advanced.activePlayerIndex);
  }

  const nextIndex = nextAlivePriorityIndex(state, state.priorityPlayerIndex);
  return givePriority({ ...state, consecutivePasses: passes }, nextIndex);
}

/** Push without paying (tests / abilities). */
export function pushStack(state: GameState, obj: StackObject): GameState {
  const next = clonePlayers(state);
  next.stack = [...next.stack, obj];
  next.consecutivePasses = 0;
  return givePriority(next, next.priorityPlayerIndex);
}
