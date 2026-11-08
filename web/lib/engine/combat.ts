/**
 * Combat — CR 506–510, UX inspired by MTG Arena (declare → confirm → priority).
 * First/double strike: two damage waves (510.4).
 */
import {
  AttackerDecl,
  DamageAssignEntry,
  emptyCombat,
  GameState,
  hasKeyword,
  isCreature,
  isPlaneswalker,
  canAttack,
  effectivePower,
  effectiveToughness,
  CombatState,
  CardInstance,
} from './types';
import { hasKeywordState } from './continuous';
import { checkStateBasedActions } from './sba';
import {
  getAnnihilator,
  getLandwalk,
  getToxicAmount,
  hasFear,
  hasIntimidate,
  hasMentor,
  hasShadow,
  hasTraining,
  parseBattalionEffects,
  parseRenown,
} from './effects';
import { protectsFromColors } from './protection';
import { applyDamageWithPrevention } from './replacement';
import {
  fireAttackTriggers,
  fireCombatDamagePlayerTriggers,
  queueTrigger,
} from './triggers';
import { clonePlayers, findCard } from './zones';

function ap(state: GameState) {
  return state.players[state.activePlayerIndex];
}

export function ensureCombat(state: GameState): CombatState {
  return state.combat ?? emptyCombat();
}

function strikeFlags(c: CardInstance): { first: boolean; double: boolean } {
  return {
    first: hasKeyword(c, 'first strike'),
    double: hasKeyword(c, 'double strike'),
  };
}

function combatNeedsFirstStrikeWave(state: GameState): boolean {
  const combat = ensureCombat(state);
  for (const atk of combat.attackers) {
    const a = findCard(state, atk.attackerId);
    if (a?.zone === 'battlefield') {
      const f = strikeFlags(a.card);
      if (f.first || f.double) return true;
    }
    for (const bid of atk.blockers) {
      const b = findCard(state, bid);
      if (b?.zone === 'battlefield') {
        const f = strikeFlags(b.card);
        if (f.first || f.double) return true;
      }
    }
  }
  return false;
}

export function startDeclareAttackers(state: GameState): GameState {
  const active = ap(state);
  if (!active) return state;
  const opponents = state.players.filter((p) => !p.hasLost && p.id !== active.id);
  return {
    ...state,
    combat: {
      ...emptyCombat(),
      mode: 'declareAttackers',
      declaringPlayerId: active.id,
      draftDefendPlayerId: opponents[0]?.id ?? null,
      draftAttackerIds: [],
    },
    consecutivePasses: 0,
  };
}

export function setDefendPlayer(state: GameState, defendingPlayerId: string): GameState {
  if (state.combat?.mode !== 'declareAttackers') return state;
  return {
    ...state,
    combat: {
      ...state.combat,
      draftDefendPlayerId: defendingPlayerId,
      draftDefendPlaneswalkerId: null,
    },
  };
}

/** Attack a planeswalker controlled by the current draft defender (or null = player). */
export function setDefendPlaneswalker(
  state: GameState,
  planeswalkerId: string | null,
): GameState {
  if (state.combat?.mode !== 'declareAttackers') return state;
  const defendId = state.combat.draftDefendPlayerId;
  if (!defendId) return state;
  if (planeswalkerId) {
    const found = findCard(state, planeswalkerId);
    if (!found || found.zone !== 'battlefield' || found.player.id !== defendId) return state;
    if (!isPlaneswalker(found.card)) return state;
  }
  return {
    ...state,
    combat: { ...state.combat, draftDefendPlaneswalkerId: planeswalkerId },
  };
}

export function toggleDraftAttacker(state: GameState, creatureId: string): GameState {
  if (state.combat?.mode !== 'declareAttackers') return state;
  const active = ap(state);
  if (!active || state.combat.declaringPlayerId !== active.id) return state;

  const found = findCard(state, creatureId);
  if (!found || found.zone !== 'battlefield') return state;
  if (found.player.id !== active.id) return state;
  if (!legalAttackers(state).includes(creatureId)) return state;

  const ids = new Set(state.combat.draftAttackerIds);
  if (ids.has(creatureId)) ids.delete(creatureId);
  else ids.add(creatureId);

  return {
    ...state,
    combat: { ...state.combat, draftAttackerIds: [...ids] },
  };
}

export function confirmAttackers(state: GameState): GameState {
  if (state.combat?.mode !== 'declareAttackers') return state;
  const active = ap(state);
  const defendId = state.combat.draftDefendPlayerId;
  if (!active || !defendId) return state;

  let next = clonePlayers(state);
  const attackers: AttackerDecl[] = [];

  const draft = new Set(state.combat.draftAttackerIds);
  // Goaded creatures must attack if able (701.38)
  for (const perm of active.battlefield) {
    if (perm.goaded && canAttack(perm, next)) draft.add(perm.id);
  }
  for (const id of draft) {
    const found = findCard(next, id);
    if (!found || found.zone !== 'battlefield') continue;
    if (found.player.id !== active.id) continue;
    const perm = found.player.battlefield.find((c) => c.id === id);
    if (!perm || !canAttack(perm, next)) {
      continue;
    }
    if (!hasKeywordState(perm, 'vigilance', next)) perm.tapped = true;
    attackers.push({
      attackerId: id,
      defendingPlayerId: defendId,
      defendingPlaneswalkerId: state.combat.draftDefendPlaneswalkerId || null,
      blockers: [],
    });
  }

  if (attackers.length === 0) {
    return skipToEndCombat(next);
  }

  // Raid flag
  const ap2 = next.players.find((p) => p.id === active.id);
  if (ap2) ap2.attackedThisTurn = true;

  const atkCards: CardInstance[] = [];
  for (const a of attackers) {
    const f = findCard(next, a.attackerId);
    const perm =
      f?.zone === 'battlefield'
        ? f.player.battlefield.find((c) => c.id === a.attackerId)
        : undefined;
    if (perm) atkCards.push(perm);
  }
  next = fireAttackTriggers(next, atkCards);

  // Mentor — attacking creature with mentor gives +1/+1 to another attacking creature with lesser power
  for (const mentor of atkCards) {
    if (!hasMentor(mentor.card)) continue;
    const mp = effectivePower(mentor, next);
    const pupil = atkCards.find(
      (c) => c.id !== mentor.id && effectivePower(c, next) < mp,
    );
    if (pupil) pupil.counters['+1/+1'] = (pupil.counters['+1/+1'] || 0) + 1;
  }

  // Training (702.147) — attacks with another creature of greater power → +1/+1
  for (const trainee of atkCards) {
    if (!hasTraining(trainee.card)) continue;
    const tp = effectivePower(trainee, next);
    if (atkCards.some((c) => c.id !== trainee.id && effectivePower(c, next) > tp)) {
      trainee.counters['+1/+1'] = (trainee.counters['+1/+1'] || 0) + 1;
    }
  }

  // Battalion (702.100) — attacks with ≥2 other creatures
  if (atkCards.length >= 3) {
    for (const atk of atkCards) {
      const effects = parseBattalionEffects(atk.card.oracle_text);
      if (!effects.length) continue;
      next = queueTrigger(next, {
        controllerId: atk.controller,
        name: `${atk.card.name} battalion`,
        sourcePermanentId: atk.id,
        script: { targets: [], effects },
      });
    }
  }

  // Exalted (702.83): if exactly one attacker, each exalted you control pumps it
  if (attackers.length === 1) {
    const alone = atkCards[0];
    const activePlayer = next.players.find((p) => p.id === active.id);
    if (alone && activePlayer) {
      let exaltedCount = 0;
      for (const perm of activePlayer.battlefield) {
        if (hasKeyword(perm, 'exalted') || /\bexalted\b/i.test(perm.card.oracle_text || '')) {
          exaltedCount += 1;
        }
      }
      if (exaltedCount > 0) {
        alone.tempPower = (alone.tempPower || 0) + exaltedCount;
        alone.tempToughness = (alone.tempToughness || 0) + exaltedCount;
      }
    }
  }

  // Annihilator — defending player sacrifices N permanents (pending)
  for (const a of attackers) {
    const af = findCard(next, a.attackerId);
    const atk =
      af?.zone === 'battlefield'
        ? af.player.battlefield.find((c) => c.id === a.attackerId)
        : undefined;
    if (!atk) continue;
    const n = getAnnihilator(atk.card);
    if (n > 0) {
      next.pendingChoices = [
        ...next.pendingChoices,
        { type: 'sacrificePermanents', playerId: a.defendingPlayerId, amount: n },
      ];
    }
  }

  next.combat = {
    ...emptyCombat(),
    mode: 'idle',
    attackers,
  };
  next.consecutivePasses = 0;
  next.priorityPlayerIndex = next.activePlayerIndex;
  return next;
}

export function skipToEndCombat(state: GameState): GameState {
  const next = clonePlayers(state);
  next.combat = { ...emptyCombat(), mode: 'idle', attackers: [] };
  next.phase = 'combat';
  next.step = 'endCombat';
  next.consecutivePasses = 0;
  next.priorityPlayerIndex = next.activePlayerIndex;
  return next;
}

export function startDeclareBlockers(state: GameState): GameState {
  const combat = ensureCombat(state);
  if (combat.attackers.length === 0) return skipToEndCombat(state);

  const defendingPlayerId = combat.attackers[0]?.defendingPlayerId;
  if (!defendingPlayerId) return skipToEndCombat(state);

  return {
    ...state,
    combat: {
      ...combat,
      mode: 'declareBlockers',
      declaringPlayerId: defendingPlayerId,
      draftBlocks: Object.fromEntries(combat.attackers.map((a) => [a.attackerId, [...a.blockers]])),
      focusAttackerId: combat.attackers[0]?.attackerId ?? null,
    },
    consecutivePasses: 0,
  };
}

export function focusAttacker(state: GameState, attackerId: string): GameState {
  if (state.combat?.mode !== 'declareBlockers') return state;
  if (!state.combat.attackers.some((a) => a.attackerId === attackerId)) return state;
  return { ...state, combat: { ...state.combat, focusAttackerId: attackerId } };
}

/** CR 509.1b — flying needs flying/reach; "can't be blocked" etc. */
export function canBlock(
  attacker: CardInstance,
  blocker: CardInstance,
  state?: GameState,
): boolean {
  if (!isCreature(blocker) || blocker.tapped) return false;
  if (blocker.goaded) return false; // goaded can't block (701.38)
  const bText = (blocker.card.oracle_text || '').toLowerCase();
  if (/\bcan't block\b/.test(bText) || /\bcannot block\b/.test(bText)) return false;
  if (state && hasKeywordState(attacker, 'flying', state)) {
    if (!hasKeywordState(blocker, 'flying', state) && !hasKeywordState(blocker, 'reach', state)) {
      return false;
    }
  } else if (hasKeyword(attacker, 'flying')) {
    if (!hasKeyword(blocker, 'flying') && !hasKeyword(blocker, 'reach')) return false;
  }
  // Protection: can't be blocked by creatures of protected colors
  if (protectsFromColors(attacker, blocker.card.colors || [])) return false;
  const text = (attacker.card.oracle_text || '').toLowerCase();
  if (/\bcan't be blocked\b/.test(text) || /\bcannot be blocked\b/.test(text)) return false;
  if (hasKeyword(attacker, 'unblockable') || /\bunblockable\b/i.test(text)) return false;
  // Fear — only artifact / black
  if (hasFear(attacker.card)) {
    const artifact = blocker.card.type_line.includes('Artifact');
    const black = (blocker.card.colors || []).includes('B');
    if (!artifact && !black) return false;
  }
  // Intimidate — artifact or shares a color
  if (hasIntimidate(attacker.card)) {
    const artifact = blocker.card.type_line.includes('Artifact');
    const share = (attacker.card.colors || []).some((c) =>
      (blocker.card.colors || []).includes(c),
    );
    if (!artifact && !share) return false;
  }
  // Shadow — only shadow
  if (hasShadow(attacker.card) && !hasShadow(blocker.card)) return false;
  if (hasShadow(blocker.card) && !hasShadow(attacker.card)) return false;
  // Landwalk
  const walk = getLandwalk(attacker.card);
  if (walk && state) {
    const def = state.players.find((p) =>
      p.battlefield.some((c) => c.id === blocker.id),
    );
    // defender is blocker's controller
    const defender = state.players.find((p) => p.id === blocker.controller);
    void def;
    if (defender) {
      const hasLand = defender.battlefield.some((c) => {
        const tl = c.card.type_line.toLowerCase();
        return tl.includes('land') && tl.includes(walk);
      });
      if (hasLand) return false;
    }
  }
  return true;
}

function applyLifelink(next: GameState, creature: CardInstance, amount: number) {
  if (amount <= 0 || !hasKeyword(creature, 'lifelink')) return;
  const ctrl = next.players.find((p) => p.id === creature.controller);
  if (ctrl && !ctrl.hasLost) ctrl.life += amount;
}

export function toggleDraftBlocker(
  state: GameState,
  attackerId: string,
  blockerId: string,
): GameState {
  if (state.combat?.mode !== 'declareBlockers') return state;
  const defId = state.combat.declaringPlayerId;
  if (!defId) return state;

  const blockerFound = findCard(state, blockerId);
  if (!blockerFound || blockerFound.zone !== 'battlefield' || blockerFound.player.id !== defId) {
    return state;
  }
  if (!isCreature(blockerFound.card) || blockerFound.card.tapped) return state;

  const attackerFound = findCard(state, attackerId);
  if (!attackerFound || attackerFound.zone !== 'battlefield') return state;
  const already = (state.combat.draftBlocks[attackerId] || []).includes(blockerId);
  if (!already && !canBlock(attackerFound.card, blockerFound.card, state)) return state;

  const draft = { ...state.combat.draftBlocks };
  for (const [aid, list] of Object.entries(draft)) {
    draft[aid] = list.filter((id) => id !== blockerId);
  }
  const list = [...(draft[attackerId] || [])];
  const idx = list.indexOf(blockerId);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(blockerId);
  draft[attackerId] = list;

  return { ...state, combat: { ...state.combat, draftBlocks: draft, focusAttackerId: attackerId } };
}

/** Arena: reorder blockers for damage assignment (CR 510.1c). */
export function moveDraftBlocker(
  state: GameState,
  attackerId: string,
  blockerId: string,
  direction: -1 | 1,
): GameState {
  if (state.combat?.mode !== 'declareBlockers') return state;
  const list = [...(state.combat.draftBlocks[attackerId] || [])];
  const idx = list.indexOf(blockerId);
  if (idx < 0) return state;
  const j = idx + direction;
  if (j < 0 || j >= list.length) return state;
  [list[idx], list[j]] = [list[j], list[idx]];
  return {
    ...state,
    combat: {
      ...state.combat,
      draftBlocks: { ...state.combat.draftBlocks, [attackerId]: list },
      focusAttackerId: attackerId,
    },
  };
}

export function confirmBlockers(state: GameState): GameState {
  if (state.combat?.mode !== 'declareBlockers') return state;
  const next = clonePlayers(state);
  const combat = ensureCombat(next);
  next.combat = {
    ...emptyCombat(),
    mode: 'idle',
    attackers: combat.attackers.map((a) => {
      let blockers = [...(combat.draftBlocks[a.attackerId] || [])];
      const af = findCard(next, a.attackerId);
      const attacker =
        af?.zone === 'battlefield'
          ? af.player.battlefield.find((c) => c.id === a.attackerId)
          : undefined;
      // Menace (702.110): must be blocked by ≥2 creatures or not at all.
      if (
        attacker &&
        hasKeywordState(attacker, 'menace', next) &&
        blockers.length === 1
      ) {
        blockers = [];
      }
      return { ...a, blockers };
    }),
  };
  next.consecutivePasses = 0;
  next.priorityPlayerIndex = next.activePlayerIndex;
  return next;
}

type Wave = 'first' | 'normal';

function shouldAssignThisWave(
  creature: CardInstance,
  wave: Wave,
  assignedFirstWave: Set<string>,
): boolean {
  const { first, double } = strikeFlags(creature);
  if (wave === 'first') return first || double;
  // normal wave: no FS/DS at first wave start ≈ not in assignedFirstWave as FS-only,
  // plus currently double strike
  if (double) return true;
  if (first && assignedFirstWave.has(creature.id)) return false; // FS already dealt
  if (first) return false; // FS that somehow didn't deal — still skip normal
  return true;
}

/** Lethal amount needed to kill blocker this combat (deathtouch → 1). */
function lethalNeeded(
  attacker: CardInstance,
  blocker: CardInstance,
  state: GameState,
): number {
  if (hasKeyword(attacker, 'deathtouch')) return 1;
  const tough = effectiveToughness(blocker, state);
  if (tough === null) return 1;
  // Infect/wither apply -1/-1 immediately; lethal = current toughness.
  if (hasKeyword(attacker, 'infect') || hasKeyword(attacker, 'wither')) {
    return Math.max(1, tough);
  }
  return Math.max(1, tough - blocker.damageMarked);
}

function syncDamageReplacements(next: GameState, from: GameState) {
  next.preventionShields = from.preventionShields;
  next.redirectShields = from.redirectShields;
  next.preventAllDamageThisTurn = from.preventAllDamageThisTurn;
  next.preventCombatDamageThisTurn = from.preventCombatDamageThisTurn;
}

function applyRedirectedCombatDamage(
  next: GameState,
  attacker: CardInstance,
  target: { kind: 'player'; playerId: string } | { kind: 'permanent'; permanentId: string },
  amount: number,
  originalPlayerId?: string,
) {
  if (amount <= 0) return;
  if (target.kind === 'player') {
    const def = next.players.find((p) => p.id === target.playerId);
    if (!def || def.hasLost) return;
    if (hasKeyword(attacker, 'infect')) def.poison += amount;
    else {
      def.life -= amount;
      def.lostLifeThisTurn = true;
      if (attacker.isCommander && originalPlayerId && target.playerId === originalPlayerId) {
        def.commanderDamage[attacker.id] = (def.commanderDamage[attacker.id] || 0) + amount;
      }
    }
    return;
  }
  const found = findCard(next, target.permanentId);
  if (!found || found.zone !== 'battlefield') return;
  const dest = found.player.battlefield.find((c) => c.id === target.permanentId);
  if (!dest) return;
  if (protectsFromColors(dest, attacker.card.colors || [])) return;
  if (isPlaneswalker(dest)) {
    dest.counters['loyalty'] = Math.max(0, (dest.counters['loyalty'] ?? 0) - amount);
  } else if (isCreature(dest)) {
    if (hasKeyword(attacker, 'infect') || hasKeyword(attacker, 'wither')) {
      dest.counters['-1/-1'] = (dest.counters['-1/-1'] || 0) + amount;
    } else {
      dest.damageMarked += amount;
    }
    if (hasKeyword(attacker, 'deathtouch')) dest.deathtouchSinceLastSba = true;
  }
}

function dealCombatToPlaneswalker(
  next: GameState,
  attacker: CardInstance,
  planeswalkerId: string,
  amount: number,
) {
  if (amount <= 0) return;
  const prev = applyDamageWithPrevention(
    next,
    { kind: 'permanent', permanentId: planeswalkerId },
    amount,
    { sourceControllerId: attacker.controller },
  );
  syncDamageReplacements(next, prev.state);
  amount = prev.dealt;
  if (amount <= 0) return;
  if (prev.target.kind === 'stack') return;
  applyRedirectedCombatDamage(next, attacker, prev.target, amount);
}

function dealCombatToPlayer(
  next: GameState,
  attacker: CardInstance,
  playerId: string,
  amount: number,
  planeswalkerId?: string | null,
) {
  if (amount <= 0) return;
  if (planeswalkerId) {
    dealCombatToPlaneswalker(next, attacker, planeswalkerId, amount);
    return;
  }
  const prev = applyDamageWithPrevention(next, { kind: 'player', playerId }, amount, {
    sourceControllerId: attacker.controller,
  });
  syncDamageReplacements(next, prev.state);
  amount = prev.dealt;
  if (amount <= 0) return;
  if (prev.target.kind === 'stack') return;
  applyRedirectedCombatDamage(next, attacker, prev.target, amount, playerId);
  if (prev.target.kind !== 'player') return;

  const destPlayerId = prev.target.playerId;
  const toxic = getToxicAmount(attacker.card);
  if (toxic > 0 && destPlayerId === playerId) {
    const def = next.players.find((p) => p.id === destPlayerId);
    if (def) def.poison += toxic;
  }
  // Combat damage to the monarch → attacker’s controller becomes monarch (702.138c)
  if (next.monarchPlayerId === destPlayerId) {
    next.monarchPlayerId = attacker.controller;
  }

  // Renown (702.112) — first combat damage to a player
  const renownN = parseRenown(attacker.card.oracle_text, attacker.card.keywords);
  if (renownN != null && renownN > 0 && !attacker.renowned) {
    const af = findCard(next, attacker.id);
    const perm =
      af?.zone === 'battlefield'
        ? af.player.battlefield.find((c) => c.id === attacker.id)
        : undefined;
    if (perm && !perm.renowned) {
      perm.renowned = true;
      perm.counters['+1/+1'] = (perm.counters['+1/+1'] || 0) + renownN;
    }
  }

  // "deals combat damage to a player" → stack (603)
  const afterTrig = fireCombatDamagePlayerTriggers(next, attacker);
  next.players = afterTrig.players;
  next.stack = afterTrig.stack;
  next.pendingCast = afterTrig.pendingCast;
  next.pendingChoices = afterTrig.pendingChoices;
  next.consecutivePasses = afterTrig.consecutivePasses;
  next.delayedTriggers = afterTrig.delayedTriggers;
}

function dealDamageToCreature(
  next: GameState,
  source: CardInstance,
  dest: CardInstance,
  amount: number,
): number {
  if (amount <= 0) return 0;
  // Protection prevents damage from matching colors
  if (protectsFromColors(dest, source.card.colors || [])) return 0;
  const prev = applyDamageWithPrevention(
    next,
    { kind: 'permanent', permanentId: dest.id },
    amount,
    { sourceControllerId: source.controller },
  );
  syncDamageReplacements(next, prev.state);
  amount = prev.dealt;
  if (amount <= 0) return 0;
  if (prev.target.kind === 'player') {
    const pid = prev.target.playerId;
    const p = next.players.find((x) => x.id === pid);
    if (p && !p.hasLost) {
      if (hasKeyword(source, 'infect')) p.poison += amount;
      else {
        p.life -= amount;
        p.lostLifeThisTurn = true;
      }
    }
    return amount;
  }
  if (prev.target.kind !== 'permanent') return 0;
  const destId = prev.target.permanentId;
  const found = findCard(next, destId);
  const perm =
    found?.zone === 'battlefield'
      ? found.player.battlefield.find((c) => c.id === destId)
      : undefined;
  if (!perm) return 0;
  if (hasKeyword(source, 'infect') || hasKeyword(source, 'wither')) {
    perm.counters['-1/-1'] = (perm.counters['-1/-1'] || 0) + amount;
  } else {
    perm.damageMarked += amount;
  }
  if (hasKeyword(source, 'deathtouch')) perm.deathtouchSinceLastSba = true;
  return amount;
}

/** Default Arena-like lethal assignment for one attacker. */
export function defaultDamageAssign(
  state: GameState,
  attacker: CardInstance,
  atk: AttackerDecl,
  power: number,
): DamageAssignEntry {
  const entry: DamageAssignEntry = { toBlockers: {}, toPlayer: 0 };
  if (power <= 0) return entry;
  if (atk.blockers.length === 0) {
    entry.toPlayer = power;
    return entry;
  }
  const living: CardInstance[] = [];
  for (const blockerId of atk.blockers) {
    const bf = findCard(state, blockerId);
    if (!bf || bf.zone !== 'battlefield') continue;
    const blocker = bf.player.battlefield.find((c) => c.id === blockerId);
    if (blocker) living.push(blocker);
  }
  if (living.length === 0) {
    if (hasKeyword(attacker, 'trample')) entry.toPlayer = power;
    return entry;
  }
  const trample = hasKeyword(attacker, 'trample');
  let remaining = power;
  for (let i = 0; i < living.length; i++) {
    const blocker = living[i];
    const isLast = i === living.length - 1;
    if (remaining <= 0) break;
    const need = lethalNeeded(attacker, blocker, state);
    const toBlocker = trample
      ? Math.min(remaining, need)
      : isLast
        ? remaining
        : Math.min(remaining, need);
    entry.toBlockers[blocker.id] = toBlocker;
    remaining -= toBlocker;
  }
  if (remaining > 0 && trample) entry.toPlayer = remaining;
  else if (remaining > 0 && living.length > 0) {
    const last = living[living.length - 1];
    entry.toBlockers[last.id] = (entry.toBlockers[last.id] || 0) + remaining;
  }
  return entry;
}

function needsManualDamageAssign(state: GameState, wave: Wave): boolean {
  const combat = state.combat;
  if (!combat) return false;
  const assigned = new Set(combat.assignedFirstWave);
  for (const atk of combat.attackers) {
    const af = findCard(state, atk.attackerId);
    const attacker =
      af?.zone === 'battlefield'
        ? af.player.battlefield.find((c) => c.id === atk.attackerId)
        : undefined;
    if (!attacker || !shouldAssignThisWave(attacker, wave, assigned)) continue;
    const power = effectivePower(attacker, state);
    if (power <= 0) continue;
    if (atk.blockers.length > 1) return true;
    if (hasKeyword(attacker, 'trample') && atk.blockers.length >= 1) return true;
  }
  return false;
}

/**
 * Assign attacker damage among blockers (manual map or CR 510.1c auto).
 * Returns total damage dealt (for lifelink).
 */
function assignAttackerDamage(
  next: GameState,
  attacker: CardInstance,
  atk: AttackerDecl,
  power: number,
): number {
  const manual = next.combat?.damageAssign?.[attacker.id];
  const plan = manual || defaultDamageAssign(next, attacker, atk, power);

  let dealt = 0;
  for (const [blockerId, amt] of Object.entries(plan.toBlockers)) {
    if (amt <= 0) continue;
    const bf = findCard(next, blockerId);
    const blocker =
      bf?.zone === 'battlefield'
        ? bf.player.battlefield.find((c) => c.id === blockerId)
        : undefined;
    if (!blocker) continue;
    dealt += dealDamageToCreature(next, attacker, blocker, amt);
  }
  if (plan.toPlayer > 0) {
    dealCombatToPlayer(
      next,
      attacker,
      atk.defendingPlayerId,
      plan.toPlayer,
      atk.defendingPlaneswalkerId,
    );
    dealt += plan.toPlayer;
  }
  return dealt;
}

/** Prefill lethal assignment and wait for Confirm (Arena). */
export function startDamageAssign(state: GameState, wave: Wave): GameState {
  const next = clonePlayers(state);
  const combat = ensureCombat(next);
  const assigned = new Set(combat.assignedFirstWave);
  const draft: Record<string, DamageAssignEntry> = {};
  const apId = next.players[next.activePlayerIndex]?.id || null;

  for (const atk of combat.attackers) {
    const af = findCard(next, atk.attackerId);
    const attacker =
      af?.zone === 'battlefield'
        ? af.player.battlefield.find((c) => c.id === atk.attackerId)
        : undefined;
    if (!attacker || !shouldAssignThisWave(attacker, wave, assigned)) continue;
    const power = effectivePower(attacker, next);
    draft[attacker.id] = defaultDamageAssign(next, attacker, atk, power);
  }

  next.combat = {
    ...combat,
    mode: 'assignDamage',
    declaringPlayerId: apId,
    damageAssign: draft,
    assignWave: wave,
    focusAttackerId: Object.keys(draft)[0] || combat.focusAttackerId,
  };
  next.consecutivePasses = 0;
  next.priorityPlayerIndex = next.activePlayerIndex;
  return next;
}

export function setDamageAssignAmount(
  state: GameState,
  attackerId: string,
  target: { kind: 'blocker'; blockerId: string } | { kind: 'player' },
  amount: number,
): GameState {
  if (state.combat?.mode !== 'assignDamage') return state;
  const next = clonePlayers(state);
  const combat = ensureCombat(next);
  const cur = combat.damageAssign?.[attackerId] || { toBlockers: {}, toPlayer: 0 };
  const entry: DamageAssignEntry = {
    toBlockers: { ...cur.toBlockers },
    toPlayer: cur.toPlayer,
  };
  const n = Math.max(0, Math.floor(amount));
  if (target.kind === 'blocker') entry.toBlockers[target.blockerId] = n;
  else entry.toPlayer = n;
  next.combat = {
    ...combat,
    damageAssign: { ...(combat.damageAssign || {}), [attackerId]: entry },
    focusAttackerId: attackerId,
  };
  return next;
}

/** Confirm assignment → deal the pending wave. */
export function confirmDamageAssign(state: GameState): GameState {
  if (state.combat?.mode !== 'assignDamage') return state;
  const wave = state.combat.assignWave || 'normal';
  return applyCombatDamageWave(state, wave);
}

function dealFromCreature(
  next: GameState,
  creature: CardInstance,
  atk: AttackerDecl,
  asAttacker: boolean,
): void {
  const power = effectivePower(creature, next);
  if (power <= 0) return;

  if (asAttacker) {
    const dealt = assignAttackerDamage(next, creature, atk, power);
    applyLifelink(next, creature, dealt);
  } else {
    const af = findCard(next, atk.attackerId);
    if (!af || af.zone !== 'battlefield') return;
    const attacker = af.player.battlefield.find((c) => c.id === atk.attackerId);
    if (!attacker) return;
    const actual = dealDamageToCreature(next, creature, attacker, power);
    applyLifelink(next, creature, actual);
  }
}

/**
 * Apply one combat damage wave. Sets combat.damageWave / assignedFirstWave.
 * Returns whether a second wave is still needed after this one.
 */
export function applyCombatDamageWave(state: GameState, wave: Wave): GameState {
  let next = clonePlayers(state);
  const combat = ensureCombat(next);
  const assigned = new Set(combat.assignedFirstWave);

  // Fog / prevent all damage this turn (614 / 615)
  if (next.preventCombatDamageThisTurn || next.preventAllDamageThisTurn) {
    next = checkStateBasedActions(next);
    next.combat = {
      ...ensureCombat(next),
      attackers: combat.attackers,
      mode: 'idle',
      damageWave: wave,
      assignedFirstWave: [...assigned],
    };
    return next;
  }

  for (const atk of combat.attackers) {
    const attackerFound = findCard(next, atk.attackerId);
    if (attackerFound?.zone === 'battlefield') {
      const attacker = attackerFound.player.battlefield.find((c) => c.id === atk.attackerId);
      if (attacker && shouldAssignThisWave(attacker, wave, assigned)) {
        dealFromCreature(next, attacker, atk, true);
        if (wave === 'first') assigned.add(attacker.id);
      }
    }

    for (const blockerId of atk.blockers) {
      const bf = findCard(next, blockerId);
      if (bf?.zone !== 'battlefield') continue;
      const blocker = bf.player.battlefield.find((c) => c.id === blockerId);
      if (!blocker) continue;
      if (!shouldAssignThisWave(blocker, wave, assigned)) continue;
      dealFromCreature(next, blocker, atk, false);
      if (wave === 'first') assigned.add(blocker.id);
    }
  }

  next = checkStateBasedActions(next);
  next.combat = {
    ...ensureCombat(next),
    attackers: combat.attackers,
    mode: 'idle',
    damageWave: wave,
    assignedFirstWave: [...assigned],
  };
  return next;
}

/** Entry from turn.ts when entering combatDamage — first wave if FS/DS present. */
export function applyCombatDamage(state: GameState): GameState {
  const needsSplit = combatNeedsFirstStrikeWave(state);
  const wave: Wave = needsSplit ? 'first' : 'normal';
  if (needsManualDamageAssign(state, wave)) return startDamageAssign(state, wave);
  return applyCombatDamageWave(state, wave);
}

/** After priority ends first damage step — run normal wave, stay on combatDamage. */
export function applySecondCombatDamageWave(state: GameState): GameState {
  if (needsManualDamageAssign(state, 'normal')) return startDamageAssign(state, 'normal');
  return applyCombatDamageWave(state, 'normal');
}

export function awaitingSecondDamageWave(state: GameState): boolean {
  return (
    state.phase === 'combat' &&
    state.step === 'combatDamage' &&
    state.combat?.damageWave === 'first'
  );
}

export function clearCombat(state: GameState): GameState {
  return { ...state, combat: null };
}

export function legalAttackers(state: GameState): string[] {
  const active = ap(state);
  if (!active) return [];
  return active.battlefield.filter((c) => canAttack(c, state)).map((c) => c.id);
}

export function legalBlockers(state: GameState, attackerId?: string): string[] {
  const defId = state.combat?.declaringPlayerId;
  if (!defId) return [];
  const def = state.players.find((p) => p.id === defId);
  if (!def) return [];
  const focus =
    attackerId ||
    state.combat?.focusAttackerId ||
    state.combat?.attackers[0]?.attackerId ||
    null;
  const atkFound = focus ? findCard(state, focus) : null;
  const attacker =
    atkFound?.zone === 'battlefield'
      ? atkFound.player.battlefield.find((c) => c.id === focus)
      : undefined;
  return def.battlefield
    .filter((c) => {
      if (!isCreature(c) || c.tapped) return false;
      if (attacker && !canBlock(attacker, c, state)) return false;
      return true;
    })
    .map((c) => c.id);
}

export function isCombatDeclaring(state: GameState): boolean {
  const m = state.combat?.mode;
  return m === 'declareAttackers' || m === 'declareBlockers' || m === 'assignDamage';
}
