import {
  applyCombatDamage,
  applySecondCombatDamageWave,
  awaitingSecondDamageWave,
  clearCombat,
  startDeclareAttackers,
  startDeclareBlockers,
} from './combat';
import { emptyManaPool, GameState, Phase, Step } from './types';
import { applyDrawAmount } from './replacement';
import { checkCasesToSolve } from './classCase';
import { checkDayNightAtUntap } from './dayNight';
import { advanceSagasForActivePlayer } from './saga';
import { fireBeginningStepTriggers, flushDelayedTriggers } from './triggers';
import { clonePlayers, moveCard } from './zones';
import { checkStateBasedActions } from './sba';

/** Canonical step order (CR 500). */
const STEP_ORDER: { phase: Phase; step: Step }[] = [
  { phase: 'beginning', step: 'untap' },
  { phase: 'beginning', step: 'upkeep' },
  { phase: 'beginning', step: 'draw' },
  { phase: 'main1', step: 'main' },
  { phase: 'combat', step: 'beginCombat' },
  { phase: 'combat', step: 'declareAttackers' },
  { phase: 'combat', step: 'declareBlockers' },
  { phase: 'combat', step: 'combatDamage' },
  { phase: 'combat', step: 'endCombat' },
  { phase: 'main2', step: 'main' },
  { phase: 'ending', step: 'endStep' },
  { phase: 'ending', step: 'cleanup' },
];

function indexOf(phase: Phase, step: Step): number {
  const i = STEP_ORDER.findIndex((s) => s.phase === phase && s.step === step);
  return i === -1 ? 0 : i;
}

export function emptyAllManaPools(state: GameState): GameState {
  const next = clonePlayers(state);
  for (const p of next.players) {
    p.manaPool = emptyManaPool();
  }
  return next;
}

function untapActivePlayer(state: GameState): GameState {
  const next = clonePlayers(state);
  const player = next.players[next.activePlayerIndex];
  if (!player) return next;
  for (const perm of player.battlefield) {
    // Stun counter (122.1d): would untap → remove stun instead
    if (perm.tapped && (perm.counters['stun'] || 0) > 0) {
      perm.counters['stun'] = (perm.counters['stun'] || 0) - 1;
      if (perm.counters['stun'] <= 0) delete perm.counters['stun'];
    } else {
      perm.tapped = false;
    }
    perm.summoningSick = false;
  }
  return next;
}

export function drawForActivePlayer(state: GameState, count = 1): GameState {
  const playerId = state.players[state.activePlayerIndex]?.id || '';
  const n = applyDrawAmount(state, playerId, count);
  const next = clonePlayers(state);
  const player = next.players[next.activePlayerIndex];
  if (!player || player.hasLost) return next;

  for (let i = 0; i < n; i++) {
    if (player.library.length === 0) {
      player.attemptedEmptyDraw = true;
      break;
    }
    const card = player.library.shift()!;
    card.zone = 'hand';
    player.hand.push(card);
  }
  return next;
}

function removeDamageCleanup(state: GameState): GameState {
  const next = clonePlayers(state);
  for (const p of next.players) {
    for (const perm of p.battlefield) {
      perm.damageMarked = 0;
      perm.tempPower = undefined;
      perm.tempToughness = undefined;
      perm.tempKeywords = undefined;
      perm.regenerateShield = false;
      // Vehicles stop being creatures
      if (perm.crewed) {
        perm.crewed = false;
        perm.summoningSick = true;
      }
    }
  }
  return next;
}

function nextAliveActiveIndex(state: GameState): number {
  let idx = state.activePlayerIndex;
  for (let i = 0; i < state.players.length; i++) {
    idx = (idx + 1) % state.players.length;
    if (!state.players[idx].hasLost) return idx;
  }
  return state.activePlayerIndex;
}

export function beginNextTurn(state: GameState): GameState {
  let next = emptyAllManaPools(state);
  next = clearCombat(next);
  next.consecutivePasses = 0;
  // Extra turn: same player keeps active seat (500.7)
  const current = next.players[next.activePlayerIndex];
  if (current && (current.extraTurns || 0) > 0) {
    const n = clonePlayers(next);
    const p = n.players[n.activePlayerIndex];
    if (p) p.extraTurns = (p.extraTurns || 1) - 1;
    next = n;
  } else {
    next.activePlayerIndex = nextAliveActiveIndex(next);
  }
  next.turnNumber += 1;
  const ap = next.players[next.activePlayerIndex];
  next.creatureDiedThisTurn = false;
  next.creaturesDiedThisTurn = 0;
  // 732.2 — snapshot before reset (previous turn's AP cast count)
  next.spellsCastPreviousTurn = next.spellsCastThisTurn;
  next.spellsCastThisTurn = 0;
  next.preventCombatDamageThisTurn = false;
  next.preventAllDamageThisTurn = false;
  next.redirectShields = [];
  for (const p of next.players) {
    p.landsPlayedThisTurn = 0;
    p.attackedThisTurn = false;
    p.lostLifeThisTurn = false;
    p.gainedLifeThisTurn = false;
    // Clear goad from creatures goaded by the player whose turn is starting (701.38c)
    if (ap) {
      for (const perm of p.battlefield) {
        if (perm.goaded && perm.goadedBy === ap.id) {
          perm.goaded = false;
          perm.goadedBy = undefined;
        }
      }
    }
  }
  next.phase = 'beginning';
  next.step = 'untap';
  next = untapActivePlayer(next);
  next = checkDayNightAtUntap(next);
  next.phase = 'beginning';
  next.step = 'upkeep';
  next = flushDelayedTriggers(next, 'upkeep');
  next = fireBeginningStepTriggers(next, 'upkeep');
  next = checkStateBasedActions(next);
  next.priorityPlayerIndex = next.activePlayerIndex;
  return next;
}

/**
 * After London mulligans finish on turn 1: leave opening untap (no priority) and
 * enter upkeep — same entry as beginNextTurn after untap. Arena then auto-yields
 * through empty upkeep/draw into main1 where lands/spells can be played.
 */
export function beginFirstTurnAfterMulligans(state: GameState): GameState {
  if (state.pendingChoices.some((c) => c.type === 'mulligan')) return state;
  if (state.turnNumber !== 1 || state.phase !== 'beginning' || state.step !== 'untap') {
    return state;
  }
  let next = emptyAllManaPools(state);
  next.consecutivePasses = 0;
  next.phase = 'beginning';
  next.step = 'upkeep';
  next = flushDelayedTriggers(next, 'upkeep');
  next = fireBeginningStepTriggers(next, 'upkeep');
  next = checkStateBasedActions(next);
  next.priorityPlayerIndex = next.activePlayerIndex;
  return next;
}

/**
 * Advance to next step/phase after all players passed with empty stack (117.4).
 */
export function advanceStep(state: GameState): GameState {
  let next = emptyAllManaPools(state);
  next.consecutivePasses = 0;

  // Arena / 510.4 — second combat damage step before leaving combatDamage
  if (awaitingSecondDamageWave(next)) {
    next = applySecondCombatDamageWave(next);
    next.priorityPlayerIndex = next.activePlayerIndex;
    return next;
  }

  const cur = indexOf(next.phase, next.step);

  if (next.phase === 'ending' && next.step === 'cleanup') {
    return beginNextTurn(next);
  }

  if (cur >= STEP_ORDER.length - 1) {
    return beginNextTurn(next);
  }

  // Leaving end of combat → clear combat data
  if (next.phase === 'combat' && next.step === 'endCombat') {
    next = clearCombat(next);
  }

  const dest = STEP_ORDER[cur + 1];
  next.phase = dest.phase;
  next.step = dest.step;

  if (next.phase === 'combat' && next.step === 'endCombat') {
    next = flushDelayedTriggers(next, 'endCombat');
  }

  if (next.phase === 'beginning' && next.step === 'untap') {
    next = untapActivePlayer(next);
    next = checkDayNightAtUntap(next);
    next.phase = 'beginning';
    next.step = 'upkeep';
  }

  if (next.phase === 'beginning' && next.step === 'upkeep') {
    next = flushDelayedTriggers(next, 'upkeep');
    next = fireBeginningStepTriggers(next, 'upkeep');
  }

  if (next.phase === 'beginning' && next.step === 'draw') {
    // Turn-based draw first, then beginning-of-draw-step triggers (504)
    next = drawForActivePlayer(next, 1);
    next = fireBeginningStepTriggers(next, 'draw');
  }

  // Precombat main — Saga lore counters (714.3b)
  if (next.phase === 'main1' && next.step === 'main') {
    next = advanceSagasForActivePlayer(next);
  }

  // Combat turn-based / Arena declare prompts
  if (next.phase === 'combat' && next.step === 'declareAttackers') {
    next = startDeclareAttackers(next);
    return next; // no priority until Confirm
  }

  if (next.phase === 'combat' && next.step === 'declareBlockers') {
    next = startDeclareBlockers(next);
    if (next.combat?.mode === 'declareBlockers') return next;
    // skipped to endCombat
    next = checkStateBasedActions(next);
    next.priorityPlayerIndex = next.activePlayerIndex;
    return next;
  }

  if (next.phase === 'combat' && next.step === 'combatDamage') {
    next = applyCombatDamage(next);
  }

  // End step — delayed + permanent beginning triggers, monarch (702.138d); exile unearthed
  if (next.phase === 'ending' && next.step === 'endStep') {
    next = flushDelayedTriggers(next, 'endStep');
    next = fireBeginningStepTriggers(next, 'endStep');
    next = checkCasesToSolve(next);
    const n = clonePlayers(next);
    if (n.monarchPlayerId) {
      const mid = n.monarchPlayerId;
      const p = n.players.find((x) => x.id === mid);
      if (p && !p.hasLost) {
        if (p.library.length === 0) p.attemptedEmptyDraw = true;
        else {
          const c = p.library.shift()!;
          c.zone = 'hand';
          p.hand.push(c);
        }
      }
    }
    const toExile: string[] = [];
    const toHand: string[] = [];
    const toSac: string[] = [];
    for (const p of n.players) {
      for (const perm of p.battlefield) {
        if (perm.unearthed) toExile.push(perm.id);
        if (perm.dashed) toHand.push(perm.id);
        if (perm.blitzed) toSac.push(perm.id);
      }
    }
    next = n;
    for (const id of toExile) {
      next = moveCard(next, id, 'exile').state;
      const f = next.players.flatMap((p) => p.exile).find((c) => c.id === id);
      if (f) f.unearthed = false;
    }
    for (const id of toHand) {
      next = moveCard(next, id, 'hand').state;
      const f = next.players.flatMap((p) => p.hand).find((c) => c.id === id);
      if (f) {
        f.dashed = false;
        f.summoningSick = false;
      }
    }
    for (const id of toSac) {
      next = moveCard(next, id, 'graveyard').state;
      const f = next.players.flatMap((p) => p.graveyard).find((c) => c.id === id);
      if (f) f.blitzed = false;
    }
  }

  if (next.phase === 'ending' && next.step === 'cleanup') {
    next = removeDamageCleanup(next);
    next = emptyAllManaPools(next);
    // Hand size (514.1) — discard down to 7
    const ap = next.players[next.activePlayerIndex];
    if (ap && !ap.hasLost && ap.hand.length > 7) {
      const n = clonePlayers(next);
      n.pendingChoices = [
        ...n.pendingChoices,
        {
          type: 'discardSelect',
          playerId: ap.id,
          amount: ap.hand.length - 7,
        },
      ];
      next = n;
      next = checkStateBasedActions(next);
      return next; // stay on cleanup until discard resolved
    }
    next = checkStateBasedActions(next);
    if (next.pendingChoices.length === 0 && next.stack.length === 0) {
      return beginNextTurn(next);
    }
    return next;
  }

  next = checkStateBasedActions(next);
  next.priorityPlayerIndex = next.activePlayerIndex;
  return next;
}

export function stepReceivesPriority(phase: Phase, step: Step): boolean {
  if (phase === 'beginning' && step === 'untap') return false;
  if (phase === 'ending' && step === 'cleanup') return false;
  return true;
}
