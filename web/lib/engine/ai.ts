/**
 * Minimal demo opponent — Arena-like auto actions for P2.
 * Plays lands, casts cheap spells, attacks, blocks flying with reach.
 */
import { playLand } from './actions';
import { beginActivatedIndex, beginLoyalty } from './abilities';
import { resolveTriggerOrder } from './triggers';
import {
  activateManaAbility,
  beginCast,
  cancelCast,
  confirmConvokeDelve,
  resolveWardChoice,
  selectCastMode,
  selectCastTarget,
  setCastBuyback,
  setCastKicker,
  setCastX,
} from './cast';
import {
  canBlock,
  confirmAttackers,
  confirmBlockers,
  confirmDamageAssign,
  legalAttackers,
  toggleDraftAttacker,
  toggleDraftBlocker,
} from './combat';
import { givePriority, passPriority } from './priority';
import {
  resolveMulliganBottom,
  resolveMulliganKeep,
} from './mulligan';
import {
  resolveCommanderZoneChoice,
  resolveDiscardSelect,
  resolveFabricateChoice,
  resolveLookAtTopChoice,
  resolveRiotChoice,
  resolveSacrificePermanents,
  resolveScryChoice,
  resolveSurveilChoice,
} from './sba';
import { canPayMana } from './mana';
import { listLegalTargets } from './targets';
import { GameState, hasKeyword, isCreature } from './types';
import { findCard } from './zones';

const AI_ID = 'p2';

export function isAiPlayer(playerId: string): boolean {
  return playerId === AI_ID;
}

function tapLandsFor(state: GameState, needGenericApprox: number): GameState {
  let next = state;
  const me = next.players.find((p) => p.id === AI_ID);
  if (!me) return next;
  let pool =
    me.manaPool.W + me.manaPool.U + me.manaPool.B + me.manaPool.R + me.manaPool.G + me.manaPool.C;
  if (pool >= needGenericApprox) return next;

  for (const perm of [...me.battlefield]) {
    if (perm.tapped) continue;
    if (!perm.card.type_line.includes('Land') && !perm.card.name.toLowerCase().includes('sol ring')) {
      continue;
    }
    const before = next;
    next = activateManaAbility(next, AI_ID, perm.id);
    if (next === before) continue;
    const m = next.players.find((p) => p.id === AI_ID)!;
    pool = m.manaPool.W + m.manaPool.U + m.manaPool.B + m.manaPool.R + m.manaPool.G + m.manaPool.C;
    if (pool >= needGenericApprox) break;
  }
  return next;
}

function tryPlayLand(state: GameState): GameState | null {
  const me = state.players.find((p) => p.id === AI_ID);
  if (!me || me.landsPlayedThisTurn >= 1) return null;
  if (state.phase !== 'main1' && state.phase !== 'main2') return null;
  if (state.stack.length > 0) return null;
  const land = me.hand.find((c) => c.card.type_line.includes('Land'));
  if (!land) return null;
  const next = playLand(state, AI_ID, land.id);
  return next === state ? null : next;
}

function tryCastSomething(state: GameState): GameState | null {
  const me = state.players.find((p) => p.id === AI_ID);
  if (!me) return null;
  if (state.phase !== 'main1' && state.phase !== 'main2' && state.stack.length === 0) {
    // still may cast flash/instant — handled below via beginCast timing
  }

  const candidates = [...me.hand]
    .filter((c) => !c.card.type_line.includes('Land'))
    .sort((a, b) => (a.card.mana_cost?.length || 0) - (b.card.mana_cost?.length || 0));

  for (const card of candidates) {
    // Prefer creatures / sol ring / simple spells without targets first
    const needsTarget =
      /target|any target/i.test(card.card.oracle_text || '') &&
      !/when .+ enters/i.test(card.card.oracle_text || '');
    if (needsTarget) continue;

    let next = tapLandsFor(state, 3);
    const cast = beginCast(next, AI_ID, card.id);
    if (cast !== next && !cast.pendingCast) return cast;
  }

  // Try a pump/damage if we can auto-skip (pendingCast would stall AI)
  return null;
}

function declareBlocks(state: GameState): GameState {
  let next = state;
  const combat = next.combat;
  if (!combat) return confirmBlockers(next);

  const me = next.players.find((p) => p.id === AI_ID);
  if (!me) return confirmBlockers(next);

  const used = new Set<string>();
  for (const atk of combat.attackers) {
    const af = findCard(next, atk.attackerId);
    const attacker =
      af?.zone === 'battlefield'
        ? af.player.battlefield.find((c) => c.id === atk.attackerId)
        : undefined;
    if (!attacker) continue;

    const needTwo = hasKeyword(attacker, 'menace');
    const blockers = me.battlefield.filter(
      (c) => isCreature(c) && !c.tapped && !used.has(c.id) && canBlock(attacker, c),
    );

    // Prefer reach/flying vs flying; otherwise first small blocker
    blockers.sort((a, b) => {
      const score = (c: typeof a) =>
        (hasKeyword(attacker, 'flying') && (hasKeyword(c, 'reach') || hasKeyword(c, 'flying'))
          ? 10
          : 0) - ((c.card.power && parseInt(c.card.power, 10)) || 0);
      return score(b) - score(a);
    });

    let want = 0;
    if (needTwo) want = blockers.length >= 2 ? 2 : 0;
    else if (hasKeyword(attacker, 'flying')) want = blockers.length > 0 ? 1 : 0;
    else if (effectiveThreat(attacker) >= 4) want = blockers.length > 0 ? 1 : 0;

    let n = 0;
    for (const b of blockers) {
      if (n >= want) break;
      next = toggleDraftBlocker(next, atk.attackerId, b.id);
      used.add(b.id);
      n += 1;
    }
  }

  return confirmBlockers(next);
}

function effectiveThreat(c: { card: { power?: string } }): number {
  return parseInt(c.card.power || '0', 10) || 0;
}

/**
 * One AI tick. Returns same state if nothing to do.
 * Call from UI when it's P2's turn to act.
 */
export function runDemoAi(state: GameState): GameState {
  if (state.winnerId) return state;

  if (state.combat?.mode === 'assignDamage') {
    const ap = state.players[state.activePlayerIndex];
    if (ap?.id === AI_ID) return confirmDamageAssign(state);
  }

  if (state.pendingLoyalty?.playerId === AI_ID) {
    return beginLoyalty(state, AI_ID, state.pendingLoyalty.permanentId, 0);
  }

  if (state.pendingActivated?.playerId === AI_ID) {
    const idx = state.pendingActivated.options[0];
    return beginActivatedIndex(
      state,
      AI_ID,
      state.pendingActivated.permanentId,
      idx ?? 0,
    );
  }

  const orderChoice = state.pendingChoices.find(
    (c) => c.type === 'orderTriggers' && c.playerId === AI_ID,
  );
  if (orderChoice && orderChoice.type === 'orderTriggers') {
    return resolveTriggerOrder(state, orderChoice.triggerIds);
  }

  const pending = state.pendingCast;
  if (pending) {
    if (pending.playerId !== AI_ID) return state;
    if (pending.phase === 'mode' && pending.resolvedScript?.modes?.length) {
      return selectCastMode(state, 0);
    }
    if (pending.phase === 'x') return setCastX(state, 1);
    if (pending.phase === 'kicker') return setCastKicker(state, false);
    if (pending.phase === 'buyback') return setCastBuyback(state, false);
    if (
      pending.phase === 'convoke' ||
      pending.phase === 'improvise' ||
      pending.phase === 'delve'
    ) {
      return confirmConvokeDelve(state);
    }
    const slot = pending.slots[pending.currentSlot];
    if (slot) {
      const legal = listLegalTargets(state, slot.filter, AI_ID, pending.sourceColors);
      if (legal[0]) return selectCastTarget(state, legal[0]);
      return cancelCast(state);
    }
    return cancelCast(state);
  }

  const choice = state.pendingChoices[0];
  if (choice && choice.playerId === AI_ID) {
    if (choice.type === 'ward') {
      const me = state.players.find((p) => p.id === AI_ID);
      const cost = {
        generic: choice.cost,
        W: 0,
        U: 0,
        B: 0,
        R: 0,
        G: 0,
        C: 0,
        hybrids: [],
        phyrexian: [],
        unpayable: false,
      };
      const can = me && (choice.cost === 0 || canPayMana(me.manaPool, cost));
      return resolveWardChoice(state, !!can);
    }
    if (choice.type === 'scry') {
      return resolveScryChoice(state, []);
    }
    if (choice.type === 'surveil') {
      return resolveSurveilChoice(state, []);
    }
    if (choice.type === 'lookAtTop') {
      return resolveLookAtTopChoice(state);
    }
    if (choice.type === 'fabricate') {
      return resolveFabricateChoice(state, 'counters');
    }
    if (choice.type === 'discardSelect') {
      const me = state.players.find((p) => p.id === AI_ID);
      const ids = (me?.hand || []).slice(0, choice.amount).map((c) => c.id);
      return resolveDiscardSelect(state, ids);
    }
    if (choice.type === 'riot') {
      return resolveRiotChoice(state, choice.permanentId, 'counter');
    }
    if (choice.type === 'sacrificePermanents') {
      const me = state.players.find((p) => p.id === AI_ID);
      const ids = (me?.battlefield || []).slice(0, choice.amount).map((c) => c.id);
      return resolveSacrificePermanents(state, ids);
    }
    if (choice.type === 'mulligan') {
      if (choice.phase === 'decide') return resolveMulliganKeep(state, AI_ID);
      const me = state.players.find((p) => p.id === AI_ID);
      const ids = (me?.hand || []).slice(0, choice.mulligansTaken).map((c) => c.id);
      return resolveMulliganBottom(state, AI_ID, ids);
    }
    if (choice.type === 'commanderToCommandZone') {
      return resolveCommanderZoneChoice(state, choice.cardId, true);
    }
    if (choice.type === 'legend') {
      return state;
    }
  }
  if (state.pendingChoices.length > 0) return state;

  if (state.combat?.mode === 'declareAttackers' && state.combat.declaringPlayerId === AI_ID) {
    let next = state;
    for (const id of legalAttackers(next)) {
      next = toggleDraftAttacker(next, id);
    }
    next = confirmAttackers(next);
    return givePriority(next, next.priorityPlayerIndex);
  }

  if (state.combat?.mode === 'declareBlockers' && state.combat.declaringPlayerId === AI_ID) {
    const next = declareBlocks(state);
    return givePriority(next, next.priorityPlayerIndex);
  }

  const priority = state.players[state.priorityPlayerIndex];
  if (!priority || priority.id !== AI_ID || priority.hasLost) return state;

  // Main-phase: land then cast
  if (
    (state.phase === 'main1' || state.phase === 'main2') &&
    state.stack.length === 0 &&
    state.players[state.activePlayerIndex]?.id === AI_ID
  ) {
    const land = tryPlayLand(state);
    if (land) return land;
    const cast = tryCastSomething(state);
    if (cast) return cast;
  }

  return passPriority(state);
}
