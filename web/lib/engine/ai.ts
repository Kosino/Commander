/**
 * Demo opponent AI (seat p2) — plays a full 2P turn vs the human.
 * Lands, casts (pay/targets), attacks, blocks, damage confirm, stack flash.
 */
import { playLand } from './actions';
import { beginActivate, beginActivatedIndex, beginLoyalty } from './abilities';
import { resolveTriggerOrder } from './triggers';
import {
  activateManaAbility,
  autoTapManaForCost,
  beginCast,
  beginCastCommander,
  cancelCast,
  confirmAdditionalCost,
  confirmCastPay,
  confirmConvokeDelve,
  confirmEscapeExile,
  pendingSpellManaCost,
  resolveWardChoice,
  selectCastMode,
  selectCastTarget,
  setCastBuyback,
  setCastKicker,
  setCastX,
  setHybridPick,
  toggleCostDiscard,
  toggleCostSacrifice,
  toggleEscapeExile,
} from './cast';
import {
  canBlock,
  confirmAttackers,
  confirmBlockers,
  confirmDamageAssign,
  legalAttackers,
  legalBattleTargets,
  setDefendBattle,
  setDefendPlaneswalker,
  toggleDraftAttacker,
  toggleDraftBlocker,
} from './combat';
import { canPayMana, parseManaCost } from './mana';
import { givePriority, passPriority } from './priority';
import {
  resolveMulliganBottom,
  resolveMulliganKeep,
} from './mulligan';
import {
  resolveBattleProtector,
  resolveCommanderZoneChoice,
  resolveDevourChoice,
  resolveDiscardSelect,
  resolveFabricateChoice,
  resolveLookAtTopChoice,
  resolveOptionalEffect,
  resolveRiotChoice,
  resolveSacrificePermanents,
  resolveScryChoice,
  resolveSurveilChoice,
  resolveLegendChoice,
} from './sba';
import { listLegalTargets } from './targets';
import {
  effectivePower,
  effectiveToughness,
  GameState,
  hasKeyword,
  isBattle,
  isCreature,
  isPlaneswalker,
  type ManaColor,
} from './types';
import { findCard } from './zones';

const AI_ID = 'p2';

export function isAiPlayer(playerId: string): boolean {
  return playerId === AI_ID;
}

/** Tap mana sources until pool can roughly pay `need` (generic + colored). */
function tapLandsFor(state: GameState, needGenericApprox: number): GameState {
  let next = state;
  const me = next.players.find((p) => p.id === AI_ID);
  if (!me) return next;
  let pool =
    me.manaPool.W + me.manaPool.U + me.manaPool.B + me.manaPool.R + me.manaPool.G + me.manaPool.C;
  if (pool >= needGenericApprox) return next;

  for (const perm of [...me.battlefield]) {
    if (perm.tapped) continue;
    if (
      !perm.card.type_line.includes('Land') &&
      !/\{T\}:\s*Add/i.test(perm.card.oracle_text || '') &&
      !perm.card.name.toLowerCase().includes('sol ring')
    ) {
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

function manaNeedApprox(manaCost?: string): number {
  const c = parseManaCost(manaCost);
  return c.generic + c.W + c.U + c.B + c.R + c.G + c.C + (c.hybrids?.length || 0);
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

function cmcLen(mana?: string): number {
  return manaNeedApprox(mana);
}

/** Start a cast (hand or command). Returns new state with pendingCast / on stack. */
function tryCastSomething(state: GameState): GameState | null {
  const me = state.players.find((p) => p.id === AI_ID);
  if (!me) return null;

  // Commander first if affordable-ish
  for (const cmd of me.commandZone.filter((c) => c.isCommander)) {
    let next = tapLandsFor(state, manaNeedApprox(cmd.card.mana_cost) + 2);
    next = autoTapManaForCost(next, AI_ID, parseManaCost(cmd.card.mana_cost));
    const cast = beginCastCommander(next, AI_ID, cmd.id);
    if (cast !== next) return cast;
  }

  const candidates = [...me.hand]
    .filter((c) => !c.card.type_line.includes('Land'))
    .sort((a, b) => cmcLen(a.card.mana_cost) - cmcLen(b.card.mana_cost));

  for (const card of candidates) {
    const targets = (card.card.oracle_text || '').match(/\btarget\b/gi)?.length || 0;
    if (targets > 2) continue;
    let next = tapLandsFor(state, manaNeedApprox(card.card.mana_cost));
    next = autoTapManaForCost(next, AI_ID, parseManaCost(card.card.mana_cost));
    const cast = beginCast(next, AI_ID, card.id);
    // Pay-phase / targeting both leave pendingCast — that is success (finish next ticks)
    if (cast !== next) return cast;
  }

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
    if (atk.defendingPlayerId !== AI_ID) continue;
    const af = findCard(next, atk.attackerId);
    const attacker =
      af?.zone === 'battlefield'
        ? af.player.battlefield.find((c) => c.id === atk.attackerId)
        : undefined;
    if (!attacker) continue;

    const needTwo = hasKeyword(attacker, 'menace');
    const atkP = effectivePower(attacker, next);
    const blockers = me.battlefield.filter(
      (c) => isCreature(c) && !c.tapped && !used.has(c.id) && canBlock(attacker, c, next),
    );

    blockers.sort((a, b) => {
      const score = (c: typeof a) => {
        let s = 0;
        if (hasKeyword(attacker, 'flying') && (hasKeyword(c, 'reach') || hasKeyword(c, 'flying'))) {
          s += 10;
        }
        const tp = effectiveToughness(c, next) || 0;
        const pw = effectivePower(c, next);
        if (tp > atkP) s += 5;
        if (pw >= (effectiveToughness(attacker, next) || 99)) s += 3;
        s -= pw;
        return s;
      };
      return score(b) - score(a);
    });

    let want = 0;
    if (needTwo) want = blockers.length >= 2 ? 2 : 0;
    else if (hasKeyword(attacker, 'flying')) want = blockers.length > 0 ? 1 : 0;
    else if (atkP >= 2) want = blockers.length > 0 ? 1 : 0;
    const myLife = me.life;
    if (myLife <= atkP + 5 && blockers.length > 0) want = Math.max(want, needTwo ? 2 : 1);

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

function finishPendingCast(state: GameState): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.playerId !== AI_ID) return state;

  if (pending.phase === 'mode' && pending.resolvedScript?.modes?.length) {
    return selectCastMode(state, 0);
  }
  if (pending.phase === 'x') return setCastX(state, 1);
  if (pending.phase === 'kicker') return setCastKicker(state, false);
  if (pending.phase === 'buyback') return setCastBuyback(state, false);
  if (pending.phase === 'escapeExile') {
    const me = state.players.find((p) => p.id === AI_ID);
    const need = pending.escapeNeeded || 0;
    let s = state;
    const gy = (me?.graveyard || []).filter((c) => c.id !== pending.cardId);
    for (const c of gy.slice(0, need)) s = toggleEscapeExile(s, c.id);
    return confirmEscapeExile(s);
  }
  if (
    pending.phase === 'convoke' ||
    pending.phase === 'improvise' ||
    pending.phase === 'delve'
  ) {
    return confirmConvokeDelve(state);
  }
  if (pending.phase === 'additionalCost') {
    let s = state;
    const me = s.players.find((p) => p.id === AI_ID);
    const needD = pending.costDiscardNeed || 0;
    const needS = pending.costSacrificeNeed || 0;
    const hand = (me?.hand || []).filter((c) => c.id !== pending.cardId);
    const lands = hand.filter((c) => c.card.type_line.includes('Land'));
    const pool = pending.costDiscardFilter === 'land' ? lands : hand;
    for (const c of pool.slice(0, needD)) s = toggleCostDiscard(s, c.id);
    const creatures = (me?.battlefield || []).filter((c) => isCreature(c));
    for (const c of creatures.slice(0, needS)) s = toggleCostSacrifice(s, c.id);
    const done = confirmAdditionalCost(s);
    if (done.pendingCast?.phase === 'additionalCost') return cancelCast(done);
    return done;
  }
  if (pending.phase === 'pay') {
    let s = autoTapForPendingIfNeeded(state);
    const cost = pendingSpellManaCost(s);
    const hybrids = cost?.hybrids || [];
    for (let i = 0; i < hybrids.length; i++) {
      const h = hybrids[i];
      const me = s.players.find((p) => p.id === AI_ID);
      const pick: ManaColor =
        me && (me.manaPool[h.a] || 0) >= (me.manaPool[h.b] || 0) ? h.a : h.b;
      s = setHybridPick(s, i, pick);
    }
    const paid = confirmCastPay(s);
    // Stuck unaffordable → cancel so the turn can continue
    if (paid.pendingCast?.phase === 'pay') return cancelCast(paid);
    return paid;
  }
  // targets (or missing phase while slots remain)
  const slot = pending.slots[pending.currentSlot];
  if (slot) {
    const legal = listLegalTargets(state, slot.filter, AI_ID, pending.sourceColors);
    const preferred = [...legal].sort((a, b) => {
      const score = (t: (typeof legal)[0]) => {
        if (t.kind !== 'permanent') return t.kind === 'player' ? 1 : 0;
        const f = findCard(state, t.permanentId);
        const perm =
          f?.zone === 'battlefield'
            ? f.player.battlefield.find((c) => c.id === t.permanentId)
            : undefined;
        if (!perm) return 0;
        if (perm.controller === AI_ID) return -5;
        if (isPlaneswalker(perm)) return 8;
        if (isCreature(perm)) return 5 + effectivePower(perm, state);
        return 2;
      };
      return score(b) - score(a);
    });
    if (preferred[0]) return selectCastTarget(state, preferred[0]);
    return cancelCast(state);
  }
  return cancelCast(state);
}

function autoTapForPendingIfNeeded(state: GameState): GameState {
  const cost = pendingSpellManaCost(state);
  if (!cost || !state.pendingCast) return state;
  return autoTapManaForCost(state, AI_ID, cost);
}

/** Cast an instant / flash when responding (stack open or combat/EOT). */
function tryCastFlash(state: GameState): GameState | null {
  const me = state.players.find((p) => p.id === AI_ID);
  if (!me) return null;
  const top = state.stack[state.stack.length - 1];
  if (top && top.controller === AI_ID && state.stack.length >= 2) return null;

  const candidates = [...me.hand]
    .filter(
      (c) =>
        /\bInstant\b/i.test(c.card.type_line) ||
        hasKeyword(c, 'flash') ||
        /\bflash\b/i.test(c.card.oracle_text || ''),
    )
    .sort((a, b) => cmcLen(a.card.mana_cost) - cmcLen(b.card.mana_cost));

  for (const card of candidates) {
    if (top && top.controller !== AI_ID) {
      const text = card.card.oracle_text || '';
      const interactive = /counter|destroy|exile|damage|bounce|return target/i.test(text);
      if (!interactive && state.stack.length > 0) continue;
    }
    let next = tapLandsFor(state, manaNeedApprox(card.card.mana_cost));
    next = autoTapManaForCost(next, AI_ID, parseManaCost(card.card.mana_cost));
    const cast = beginCast(next, AI_ID, card.id);
    if (cast !== next) return cast;
  }
  return null;
}

/** Simple planeswalker / activated abilities on AI main. */
function tryActivateSomething(state: GameState): GameState | null {
  const me = state.players.find((p) => p.id === AI_ID);
  if (!me) return null;
  for (const perm of me.battlefield) {
    if (isPlaneswalker(perm)) {
      const next = beginLoyalty(state, AI_ID, perm.id, 0);
      if (next !== state) return next;
    }
  }
  for (const perm of me.battlefield) {
    if (isPlaneswalker(perm) || perm.card.type_line.includes('Land')) continue;
    const next = beginActivate(state, AI_ID, perm.id);
    if (next !== state) return next;
  }
  return null;
}

/**
 * One AI tick. Returns same state if nothing to do.
 * Human is p1; AI is always p2 and must play its own turn.
 */
export function runDemoAi(state: GameState): GameState {
  if (state.winnerId) return state;

  // --- Forced prompts (any phase) ---
  if (state.combat?.mode === 'assignDamage') {
    const ap = state.players[state.activePlayerIndex];
    if (ap?.id === AI_ID) return confirmDamageAssign(state);
  }

  if (state.pendingLoyalty?.playerId === AI_ID) {
    return beginLoyalty(state, AI_ID, state.pendingLoyalty.permanentId, 0);
  }

  if (state.pendingActivated?.playerId === AI_ID) {
    const idx = state.pendingActivated.options[0];
    return beginActivatedIndex(state, AI_ID, state.pendingActivated.permanentId, idx ?? 0);
  }

  const orderChoice = state.pendingChoices.find(
    (c) => c.type === 'orderTriggers' && c.playerId === AI_ID,
  );
  if (orderChoice && orderChoice.type === 'orderTriggers') {
    return resolveTriggerOrder(state, orderChoice.triggerIds);
  }

  if (state.pendingCast) {
    if (state.pendingCast.playerId !== AI_ID) return state;
    return finishPendingCast(state);
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
    if (choice.type === 'scry') return resolveScryChoice(state, []);
    if (choice.type === 'surveil') return resolveSurveilChoice(state, []);
    if (choice.type === 'lookAtTop') return resolveLookAtTopChoice(state);
    if (choice.type === 'fabricate') return resolveFabricateChoice(state, 'counters');
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
    if (choice.type === 'devour') {
      const me = state.players.find((p) => p.id === AI_ID);
      const ids = (me?.battlefield || [])
        .filter((c) => isCreature(c) && c.id !== choice.permanentId)
        .map((c) => c.id);
      return resolveDevourChoice(state, ids);
    }
    if (choice.type === 'optionalEffect') return resolveOptionalEffect(state, true);
    if (choice.type === 'chooseBattleProtector') {
      return resolveBattleProtector(state, choice.opponentIds[0]);
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
      return resolveLegendChoice(state, choice.permanentIds[0]);
    }
  }
  // Wait for human choices
  if (state.pendingChoices.length > 0) return state;

  // --- Combat declare (AI is declaring) ---
  if (state.combat?.mode === 'declareAttackers' && state.combat.declaringPlayerId === AI_ID) {
    let next = state;
    const opp = next.players.find((p) => p.id !== AI_ID && !p.hasLost);
    if (opp) {
      const pws = opp.battlefield.filter((c) => isPlaneswalker(c));
      if (pws.length > 0) {
        pws.sort(
          (a, b) => (a.counters['loyalty'] ?? 99) - (b.counters['loyalty'] ?? 99),
        );
        next = setDefendPlaneswalker(next, pws[0].id);
      }
    }
    const battles = legalBattleTargets(next);
    if (battles.length > 0 && !next.combat?.draftDefendPlaneswalkerId) {
      next = setDefendBattle(next, battles[0]);
    }
    const legal = legalAttackers(next);
    for (const id of legal) {
      next = toggleDraftAttacker(next, id);
    }
    next = confirmAttackers(next);
    return givePriority(next, next.priorityPlayerIndex);
  }

  if (state.combat?.mode === 'declareBlockers' && state.combat.declaringPlayerId === AI_ID) {
    const next = declareBlocks(state);
    return givePriority(next, next.priorityPlayerIndex);
  }

  // --- Priority window ---
  const priority = state.players[state.priorityPlayerIndex];
  if (!priority || priority.id !== AI_ID || priority.hasLost) return state;

  const isActive = state.players[state.activePlayerIndex]?.id === AI_ID;

  // Responses: stack / combat priority / end step
  if (state.stack.length > 0 || state.phase === 'combat' || state.step === 'endStep') {
    const flash = tryCastFlash(state);
    if (flash) return flash;
  }

  // AI's own main phases — land, cast, activate, then pass into combat / end
  if (
    isActive &&
    (state.phase === 'main1' || state.phase === 'main2') &&
    state.stack.length === 0
  ) {
    const land = tryPlayLand(state);
    if (land) return land;
    const cast = tryCastSomething(state);
    if (cast) return cast;
    const act = tryActivateSomething(state);
    if (act) return act;
  }

  return passPriority(state);
}
