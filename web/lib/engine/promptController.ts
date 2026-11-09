/**
 * Arena-like PromptController — stops, Full Control, pass-turn, auto-yield.
 * GRE (priority/turn) stays CR-correct; this layer decides when the client auto-passes.
 */
import type { GameState, Phase, PlayerClock, Step, StopKey } from './types';
import { passPriority } from './priority';

export type PassTurnMode = PlayerClock['passTurnMode'];

export type PrimaryPrompt = {
  kind:
    | 'pass'
    | 'passTurn'
    | 'confirmAttackers'
    | 'confirmBlockers'
    | 'confirmDamage'
    | 'resolveStack'
    | 'waiting'
    | 'choice'
    | 'casting';
  label: string;
  /** Main button enabled for the local player. */
  enabled: boolean;
};

export const STOP_RAIL: { key: StopKey; label: string; yours: boolean }[] = [
  { key: 'upkeep', label: 'Upkeep', yours: true },
  { key: 'draw', label: 'Draw', yours: true },
  { key: 'beginCombat', label: 'Begin C.', yours: true },
  { key: 'declareAttackers', label: 'Attack', yours: true },
  { key: 'declareBlockers', label: 'Block', yours: true },
  { key: 'combatDamage', label: 'Dmg', yours: true },
  { key: 'endCombat', label: 'EoC', yours: true },
  { key: 'endStep', label: 'End', yours: true },
  { key: 'oppUpkeep', label: 'Opp Upk', yours: false },
  { key: 'oppDraw', label: 'Opp Draw', yours: false },
  { key: 'oppBeginCombat', label: 'Opp BC', yours: false },
  { key: 'oppDeclareAttackers', label: 'Opp Atk', yours: false },
  { key: 'oppDeclareBlockers', label: 'Opp Blk', yours: false },
  { key: 'oppCombatDamage', label: 'Opp Dmg', yours: false },
  { key: 'oppEndStep', label: 'Opp End', yours: false },
];

export function defaultPlayerClock(): PlayerClock {
  return {
    stops: [],
    fullControl: false,
    holdPriorityOnce: false,
    passTurnMode: 'off',
  };
}

export function ensurePlayerClocks(state: GameState): GameState {
  if (state.playerClocks && Object.keys(state.playerClocks).length > 0) {
    const next = { ...state, playerClocks: { ...state.playerClocks } };
    for (const p of state.players) {
      if (!next.playerClocks[p.id]) next.playerClocks[p.id] = defaultPlayerClock();
    }
    return next;
  }
  const clocks: Record<string, PlayerClock> = {};
  for (const p of state.players) clocks[p.id] = defaultPlayerClock();
  return { ...state, playerClocks: clocks };
}

export function getClock(state: GameState, playerId: string): PlayerClock {
  return state.playerClocks?.[playerId] || defaultPlayerClock();
}

export function setClock(
  state: GameState,
  playerId: string,
  patch: Partial<PlayerClock>,
): GameState {
  const base = ensurePlayerClocks(state);
  const prev = base.playerClocks[playerId] || defaultPlayerClock();
  return {
    ...base,
    playerClocks: {
      ...base.playerClocks,
      [playerId]: {
        ...prev,
        ...patch,
        stops: patch.stops ? [...patch.stops] : [...prev.stops],
      },
    },
  };
}

export function toggleStop(state: GameState, playerId: string, key: StopKey): GameState {
  const clock = getClock(state, playerId);
  const has = clock.stops.includes(key);
  const stops = has ? clock.stops.filter((s) => s !== key) : [...clock.stops, key];
  return setClock(state, playerId, { stops });
}

export function setFullControl(state: GameState, playerId: string, on: boolean): GameState {
  return setClock(state, playerId, {
    fullControl: on,
    holdPriorityOnce: on ? true : false,
  });
}

/** Arena Ctrl — hold priority for the next window after you act. */
export function armHoldPriority(state: GameState, playerId: string): GameState {
  return setClock(state, playerId, { holdPriorityOnce: true });
}

export function clearHoldPriority(state: GameState, playerId: string): GameState {
  return setClock(state, playerId, { holdPriorityOnce: false });
}

export function setPassTurnMode(
  state: GameState,
  playerId: string,
  mode: PassTurnMode,
): GameState {
  return setClock(state, playerId, { passTurnMode: mode });
}

/** Map current phase/step → stop key for a given player. */
export function stopKeyFor(
  state: GameState,
  playerId: string,
): StopKey | null {
  const activeId = state.players[state.activePlayerIndex]?.id;
  const yours = activeId === playerId;
  const step = state.step;
  const phase = state.phase;

  const mapYours: Partial<Record<Step, StopKey>> = {
    upkeep: 'upkeep',
    draw: 'draw',
    beginCombat: 'beginCombat',
    declareAttackers: 'declareAttackers',
    declareBlockers: 'declareBlockers',
    combatDamage: 'combatDamage',
    endCombat: 'endCombat',
    endStep: 'endStep',
  };
  const mapOpp: Partial<Record<Step, StopKey>> = {
    upkeep: 'oppUpkeep',
    draw: 'oppDraw',
    beginCombat: 'oppBeginCombat',
    declareAttackers: 'oppDeclareAttackers',
    declareBlockers: 'oppDeclareBlockers',
    combatDamage: 'oppCombatDamage',
    endStep: 'oppEndStep',
  };

  if (phase === 'main1' || phase === 'main2') {
    // Main phases: no dedicated stop key — Full Control / pass-turn covers them
    return null;
  }
  return (yours ? mapYours[step] : mapOpp[step]) || null;
}

export function isCombatPrompt(state: GameState): boolean {
  const m = state.combat?.mode;
  return m === 'declareAttackers' || m === 'declareBlockers' || m === 'assignDamage';
}

export function hasBlockingPrompt(state: GameState, playerId: string): boolean {
  if (state.pendingCast?.playerId === playerId) return true;
  if (state.pendingLoyalty?.playerId === playerId) return true;
  if (state.pendingActivated?.playerId === playerId) return true;
  if (state.pendingChoices.some((c) => c.playerId === playerId)) return true;
  if (state.combat?.mode === 'declareAttackers' && state.combat.declaringPlayerId === playerId) {
    return true;
  }
  if (state.combat?.mode === 'declareBlockers' && state.combat.declaringPlayerId === playerId) {
    return true;
  }
  if (state.combat?.mode === 'assignDamage') {
    const ap = state.players[state.activePlayerIndex]?.id;
    return ap === playerId;
  }
  return false;
}

/**
 * Whether Arena-like chrome should auto-pass this priority window for playerId.
 * CR priority still applies; this only decides client fast-forward of empty windows.
 */
export function shouldAutoYield(state: GameState, playerId: string): boolean {
  if (state.winnerId) return false;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return false;
  // Combat declare / damage confirm / cast UI / SBAs — never skip
  if (hasBlockingPrompt(state, playerId)) return false;

  const clock = getClock(state, playerId);

  // Full Control / Hold Priority — never auto-yield
  if (clock.fullControl || clock.holdPriorityOnce) return false;

  // Explicit stop on this step
  const key = stopKeyFor(state, playerId);
  if (key && clock.stops.includes(key)) return false;

  // Pass-turn modes
  if (clock.passTurnMode === 'unconditional') return true;
  if (clock.passTurnMode === 'untilResponse') {
    const top = state.stack[state.stack.length - 1];
    if (top && top.controller !== playerId) return false;
    return true;
  }

  // Stack (CR 117): after you put something on the stack you get priority again;
  // without Hold Priority, hand it to the opponent (consecutivePasses === 0).
  // When priority comes back (respond / Pass to resolve), stop.
  if (state.stack.length > 0) {
    const top = state.stack[state.stack.length - 1];
    if (top && top.controller === playerId && state.consecutivePasses === 0) {
      return true;
    }
    return false;
  }

  const activeId = state.players[state.activePlayerIndex]?.id;
  const isActive = activeId === playerId;
  const me = state.players.find((p) => p.id === playerId);

  // Your main: stop only if you still have a card in hand (land / cast decision).
  // Empty hand → fly through into combat / end step.
  if (
    isActive &&
    !isCombatPrompt(state) &&
    (state.phase === 'main1' || state.phase === 'main2')
  ) {
    if (me && me.hand.length > 0) return false;
    return true;
  }

  // Empty upkeep / draw / beginCombat / endCombat / endStep (and NAP windows): fly through.
  // Untap has no priority (turn structure skips it).
  return true;
}

/**
 * One auto-yield tick. May clear holdPriorityOnce after a manual-kept window is "consumed"
 * only when user passes — not here.
 */
export function tickAutoYield(state: GameState, playerId: string): GameState {
  const s = ensurePlayerClocks(state);
  if (!shouldAutoYield(s, playerId)) return s;
  return passPriority(s);
}

/**
 * Fast-forward empty priority windows in one shot (Arena feel).
 * Runs optional AI actor whenever it changes state, then human auto-yields, until a
 * real decision window (main with cards, combat confirm, stack respond/resolve, stop, FC).
 */
export function drainAutoPriority(
  state: GameState,
  humanId: string,
  aiActor?: (s: GameState) => GameState,
): GameState {
  let s = ensurePlayerClocks(state);
  for (let i = 0; i < 48; i++) {
    if (s.winnerId) return s;
    const before = s;

    if (aiActor) {
      const aiNext = aiActor(s);
      if (aiNext !== s) {
        s = ensurePlayerClocks(aiNext);
        continue;
      }
    }

    if (shouldAutoYield(s, humanId)) {
      s = passPriority(s);
      if (s === before) break;
      continue;
    }

    break;
  }
  return s;
}

/** After player takes a real action (cast etc.), clear pass-turn "until response" if they acted. */
export function onPlayerTookAction(state: GameState, playerId: string): GameState {
  const clock = getClock(state, playerId);
  let next = state;
  if (clock.passTurnMode === 'untilResponse') {
    next = setClock(next, playerId, { passTurnMode: 'off' });
  }
  // holdPriorityOnce stays until they pass or toggle off
  return next;
}

/** Player manually passes priority — clear hold once. */
export function onPlayerPassed(state: GameState, playerId: string): GameState {
  let next = clearHoldPriority(state, playerId);
  // unconditional pass-turn stays until toggled off
  return next;
}

export function describePhaseStep(phase: Phase, step: Step): string {
  if (phase === 'main1') return 'Main 1';
  if (phase === 'main2') return 'Main 2';
  const labels: Partial<Record<Step, string>> = {
    untap: 'Untap',
    upkeep: 'Upkeep',
    draw: 'Draw',
    beginCombat: 'Begin Combat',
    declareAttackers: 'Declare Attackers',
    declareBlockers: 'Declare Blockers',
    combatDamage: 'Combat Damage',
    endCombat: 'End Combat',
    endStep: 'End Step',
    cleanup: 'Cleanup',
  };
  return labels[step] || `${phase}/${step}`;
}

export function primaryPrompt(state: GameState, youId: string): PrimaryPrompt {
  const priorityId = state.players[state.priorityPlayerIndex]?.id;
  const yours = priorityId === youId;

  if (state.pendingChoices.some((c) => c.playerId === youId)) {
    return { kind: 'choice', label: 'Choice…', enabled: false };
  }
  if (state.pendingCast?.playerId === youId) {
    if (state.pendingCast.phase === 'additionalCost') {
      const needD = state.pendingCast.costDiscardNeed || 0;
      const needS = state.pendingCast.costSacrificeNeed || 0;
      const gotD = state.pendingCast.costDiscardIds?.length || 0;
      const gotS = state.pendingCast.costSacrificeIds?.length || 0;
      const ready = gotD >= needD && gotS >= needS;
      return { kind: 'casting', label: 'Confirm Cost', enabled: ready };
    }
    if (state.pendingCast.phase === 'pay') {
      return { kind: 'casting', label: 'Pay & Cast', enabled: true };
    }
    return { kind: 'casting', label: 'Casting…', enabled: false };
  }
  if (state.pendingLoyalty?.playerId === youId || state.pendingActivated?.playerId === youId) {
    return { kind: 'casting', label: 'Casting…', enabled: false };
  }
  if (state.combat?.mode === 'declareAttackers' && state.combat.declaringPlayerId === youId) {
    return { kind: 'confirmAttackers', label: 'Confirm Attackers', enabled: true };
  }
  if (state.combat?.mode === 'declareBlockers' && state.combat.declaringPlayerId === youId) {
    return { kind: 'confirmBlockers', label: 'Confirm Blockers', enabled: true };
  }
  if (state.combat?.mode === 'assignDamage') {
    const ap = state.players[state.activePlayerIndex]?.id;
    if (ap === youId) {
      return { kind: 'confirmDamage', label: 'Confirm Damage', enabled: true };
    }
  }
  if (!yours) {
    return { kind: 'waiting', label: 'Waiting…', enabled: false };
  }
  if (state.stack.length > 0) {
    return { kind: 'resolveStack', label: 'Pass (Resolve)', enabled: true };
  }
  const clock = getClock(state, youId);
  if (clock.passTurnMode !== 'off') {
    return {
      kind: 'passTurn',
      label: clock.passTurnMode === 'unconditional' ? 'Passing Turn…' : 'Pass Turn',
      enabled: true,
    };
  }
  return { kind: 'pass', label: 'Pass', enabled: true };
}

/** Phase rail segments for UI (active highlight). */
export const PHASE_RAIL: { phase: Phase; label: string }[] = [
  { phase: 'beginning', label: 'Beg' },
  { phase: 'main1', label: 'M1' },
  { phase: 'combat', label: 'Combat' },
  { phase: 'main2', label: 'M2' },
  { phase: 'ending', label: 'End' },
];
