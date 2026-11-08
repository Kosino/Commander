/**
 * Activated abilities — `{T}: …`, Equip, loyalty, Clue/Food (Arena-like).
 */
import {
  parseActivatedAbilities,
  parseAdapt,
  parseCrewCost,
  parseEquipCost,
  parseLoyaltyAbilities,
  parseMonstrosity,
  parseTapAbility,
  SpellScript,
  TargetRef,
} from './effects';
import { canPayMana, parseManaCost, payMana } from './mana';
import { afterPlayerAction } from './priority';
import { applyEffects } from './resolveEffects';
import { isLegalTarget, listLegalTargets } from './targets';
import { effectivePower, GameState, isCreature, isPlaneswalker, StackObject } from './types';
import { totalWardCost, withWardGate } from './ward';
import { clonePlayers, findCard, moveCard } from './zones';

let _stackSeq = 10000;
function nextStackId(): string {
  _stackSeq += 1;
  return `stk_ab_${_stackSeq}`;
}

/**
 * Click permanent: if it has a `{T}:` non-mana ability and is untapped, start activate.
 * Else try Equip. Mana abilities stay in cast.activateManaAbility.
 */
export function beginActivate(
  state: GameState,
  playerId: string,
  permanentId: string,
): GameState {
  if (state.pendingCast) return state;
  if (state.combat?.mode === 'declareAttackers' || state.combat?.mode === 'declareBlockers') {
    return state;
  }
  if (state.pendingChoices.length > 0) return state;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;
  if (
    state.stack.some(
      (o) =>
        o.cardInstance &&
        (/\bsplit second\b/i.test(o.cardInstance.card.oracle_text || '') ||
          (o.cardInstance.card.keywords || []).some((k) => k.toLowerCase() === 'split second')),
    )
  ) {
    return state;
  }

  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm) return state;

  // Equip (does not require untapped)
  if (perm.card.type_line.includes('Equipment') || parseEquipCost(perm.card.oracle_text) !== null) {
    const equip = beginEquip(state, playerId, permanentId);
    if (equip !== state) return equip;
  }

  // Crew vehicle
  if (/vehicle/i.test(perm.card.type_line) && !perm.crewed) {
    const crew = beginCrew(state, playerId, permanentId);
    if (crew !== state) return crew;
  }

  // Adapt / Monstrosity (activated, pay {N})
  const adapt = tryAdapt(state, playerId, permanentId);
  if (adapt !== state) return adapt;
  const monst = tryMonstrosity(state, playerId, permanentId);
  if (monst !== state) return monst;

  // Planeswalker: pick loyalty ability (Arena) — multiple → pendingLoyalty UI
  if (isPlaneswalker(perm)) {
    const abilities = parseLoyaltyAbilities(perm.card.oracle_text);
    if (abilities.length === 1) {
      const loy = beginLoyalty(state, playerId, permanentId, 0);
      if (loy !== state) return loy;
    } else if (abilities.length > 1) {
      const ap = state.players[state.activePlayerIndex];
      const okTiming =
        state.players[state.priorityPlayerIndex]?.id === playerId &&
        ap?.id === playerId &&
        (state.phase === 'main1' || state.phase === 'main2') &&
        state.stack.length === 0 &&
        !state.pendingCast &&
        state.pendingChoices.length === 0;
      if (okTiming) {
        return {
          ...state,
          pendingLoyalty: { playerId, permanentId },
          consecutivePasses: 0,
        };
      }
    }
  }

  // Clue / Food / Blood — sacrifice activates
  if (
    /clue/i.test(perm.card.type_line) ||
    /food/i.test(perm.card.type_line) ||
    /blood/i.test(perm.card.type_line)
  ) {
    const sac = activateClueOrFood(state, playerId, permanentId);
    if (sac !== state) return sac;
  }

  // Map — {1}, {T}, sac: explore (MVP: +1/+1 on a creature + mill 1)
  if (/map/i.test(perm.card.type_line)) {
    const map = activateMap(state, playerId, permanentId);
    if (map !== state) return map;
  }

  // Activated abilities: {T}: / {N}: / {T}, {N}:
  const activated = parseActivatedAbilities(perm.card.oracle_text);
  const legalIdx: number[] = [];
  for (let i = 0; i < activated.length; i++) {
    const ab = activated[i];
    if (ab.needsTap && perm.tapped) continue;
    const free = !ab.manaCost;
    if (!free) {
      const cost = parseManaCost(ab.manaCost);
      if (!canPayMana(found.player.manaPool, cost, found.player.life)) continue;
    }
    if (
      ab.script.targets.some(
        (slot) => listLegalTargets(state, slot.filter, playerId).length === 0,
      )
    ) {
      continue;
    }
    legalIdx.push(i);
  }

  if (legalIdx.length === 0) {
    // Fallback legacy tap-only
    if (perm.tapped) return state;
    const script = parseTapAbility(perm.card.oracle_text);
    if (!script) return state;
    return startAbilityPending(state, playerId, permanentId, script, '{T}', true);
  }

  if (legalIdx.length > 1) {
    return {
      ...state,
      pendingActivated: { playerId, permanentId, options: legalIdx },
      consecutivePasses: 0,
    };
  }

  return beginActivatedIndex(state, playerId, permanentId, legalIdx[0]);
}

export function cancelActivated(state: GameState): GameState {
  if (!state.pendingActivated) return state;
  return { ...state, pendingActivated: null };
}

/** Activate by index into parseActivatedAbilities(). */
export function beginActivatedIndex(
  state: GameState,
  playerId: string,
  permanentId: string,
  abilityIndex: number,
): GameState {
  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm) return state;
  const activated = parseActivatedAbilities(perm.card.oracle_text);
  const ab = activated[abilityIndex];
  if (!ab) return state;
  if (ab.needsTap && perm.tapped) return state;
  const free = !ab.manaCost;
  if (!free) {
    const cost = parseManaCost(ab.manaCost);
    if (!canPayMana(found.player.manaPool, cost, found.player.life)) return state;
  }

  let next: GameState = { ...state, pendingActivated: null };
  if (!free) {
    const cost = parseManaCost(ab.manaCost);
    const n = clonePlayers(next);
    const p = n.players.find((x) => x.id === playerId);
    if (!p) return state;
    const paid = payMana(p.manaPool, cost, p.life);
    if (!paid) return state;
    p.manaPool = paid;
    next = n;
  }

  return startAbilityPending(
    next,
    playerId,
    permanentId,
    ab.script,
    ab.costLabel,
    ab.needsTap,
  );
}

function startAbilityPending(
  state: GameState,
  playerId: string,
  permanentId: string,
  script: SpellScript,
  costLabel: string,
  needsTap: boolean,
): GameState {
  const found = findCard(state, permanentId);
  const name = found?.card.card.name || 'Ability';
  if (script.targets.length === 0) {
    return finalizeAbility(state, playerId, permanentId, {}, script, {
      needsTap,
      manaAlreadyPaid: true,
    });
  }
  return {
    ...state,
    pendingActivated: null,
    pendingCast: {
      playerId,
      cardId: permanentId,
      cardName: `${name} (${costLabel})`,
      slots: script.targets,
      chosen: {},
      currentSlot: 0,
      from: 'ability',
      abilitySourceId: permanentId,
      sourceColors: found?.card.card.colors || [],
      abilityScript: script,
      abilityNeedsTap: needsTap,
      abilityManaPaid: true,
    },
  };
}

/** Crew N — tap creatures you control with total power ≥ N. */
export function beginCrew(
  state: GameState,
  playerId: string,
  vehicleId: string,
): GameState {
  if (state.pendingCast || state.pendingChoices.length > 0) return state;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;
  const found = findCard(state, vehicleId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const veh = found.player.battlefield.find((c) => c.id === vehicleId);
  if (!veh || veh.crewed) return state;
  const need = parseCrewCost(veh.card.oracle_text);
  if (need === null) return state;
  const legal = found.player.battlefield.filter(
    (c) => isCreature(c) && !c.tapped && c.id !== vehicleId,
  );
  if (legal.reduce((s, c) => s + effectivePower(c, state), 0) < need) return state;

  return {
    ...state,
    pendingCast: {
      playerId,
      cardId: vehicleId,
      cardName: `Crew ${veh.card.name} (${need})`,
      slots: [],
      chosen: {},
      currentSlot: 0,
      from: 'crew',
      abilitySourceId: vehicleId,
      crewNeeded: need,
      crewTapped: [],
    },
  };
}

/** Click creature while crewing — tap toward crew cost. */
export function continueCrewTap(state: GameState, creatureId: string): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.from !== 'crew' || pending.crewNeeded == null) return state;
  const found = findCard(state, creatureId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== pending.playerId) {
    return state;
  }
  const perm = found.player.battlefield.find((c) => c.id === creatureId);
  if (!perm || !isCreature(perm) || perm.tapped) return state;
  if (perm.id === pending.abilitySourceId) return state;
  if ((pending.crewTapped || []).includes(creatureId)) return state;

  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === pending.playerId)!;
  const c = p.battlefield.find((x) => x.id === creatureId)!;
  c.tapped = true;
  const tapped = [...(pending.crewTapped || []), creatureId];
  let power = 0;
  for (const id of tapped) {
    const cr = p.battlefield.find((x) => x.id === id);
    if (cr) power += effectivePower(cr, next);
  }
  if (power >= pending.crewNeeded) {
    const veh = p.battlefield.find((x) => x.id === pending.abilitySourceId);
    if (veh) {
      veh.crewed = true;
      veh.summoningSick = false;
    }
    next.pendingCast = null;
    next.consecutivePasses = 0;
    return afterPlayerAction(next);
  }
  next.pendingCast = { ...pending, crewTapped: tapped };
  return next;
}

function tryAdapt(state: GameState, playerId: string, permanentId: string): GameState {
  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm) return state;
  const n = parseAdapt(perm.card.oracle_text);
  if (n === null) return state;
  if ((perm.counters['+1/+1'] || 0) > 0) return state;
  const cost = parseManaCost(`{${n}}`);
  // Adapt cost is usually "{N}: Adapt N" — MVP pay {N} generic equal to adapt number
  const payCost = {
    generic: n,
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
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !canPayMana(player.manaPool, payCost)) return state;
  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId)!;
  const paid = payMana(p.manaPool, payCost);
  if (!paid) return state;
  p.manaPool = paid;
  const pr = p.battlefield.find((c) => c.id === permanentId)!;
  pr.counters['+1/+1'] = (pr.counters['+1/+1'] || 0) + n;
  next.consecutivePasses = 0;
  void cost;
  return afterPlayerAction(next);
}

function tryMonstrosity(state: GameState, playerId: string, permanentId: string): GameState {
  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm || perm.monstrous) return state;
  const n = parseMonstrosity(perm.card.oracle_text);
  if (n === null) return state;
  // MVP: pay {2}{G}{G}-like as generic 2+n? Use `{X}` where X = monstrosity N as generic N+2
  const payCost = {
    generic: n + 2,
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
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !canPayMana(player.manaPool, payCost)) return state;
  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId)!;
  const paid = payMana(p.manaPool, payCost);
  if (!paid) return state;
  p.manaPool = paid;
  const pr = p.battlefield.find((c) => c.id === permanentId)!;
  pr.monstrous = true;
  pr.counters['+1/+1'] = (pr.counters['+1/+1'] || 0) + n;
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

/** Map token — pay {1}, tap, sac: target explores (MVP auto: first creature). */
export function activateMap(
  state: GameState,
  playerId: string,
  permanentId: string,
): GameState {
  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm || perm.tapped || !/map/i.test(perm.card.type_line)) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const payCost = {
    generic: 1,
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
  if (!canPayMana(player.manaPool, payCost)) return state;
  const creature = player.battlefield.find((c) => isCreature(c) && c.id !== permanentId);
  if (!creature) return state;

  let next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId)!;
  const paid = payMana(p.manaPool, payCost);
  if (!paid) return state;
  p.manaPool = paid;
  next = moveCard(next, permanentId, 'graveyard').state;
  next = applyEffects(
    next,
    playerId,
    [{ type: 'explore', targetKey: 'ex' }],
    { ex: { kind: 'permanent', permanentId: creature.id } },
    undefined,
    creature.id,
  );
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

/** Clue / Food / Blood — pay, sacrifice. */
export function activateClueOrFood(
  state: GameState,
  playerId: string,
  permanentId: string,
): GameState {
  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm) return state;
  const isClue = /clue/i.test(perm.card.type_line);
  const isFood = /food/i.test(perm.card.type_line);
  const isBlood = /blood/i.test(perm.card.type_line);
  if (!isClue && !isFood && !isBlood) return state;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const generic = isBlood ? 1 : 2;
  if (isBlood && player.hand.length < 1) return state;
  const payCost = {
    generic,
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
  if (!canPayMana(player.manaPool, payCost)) return state;

  let next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId)!;
  const paid = payMana(p.manaPool, payCost);
  if (!paid) return state;
  p.manaPool = paid;
  next = moveCard(next, permanentId, 'graveyard').state;
  const p2 = next.players.find((x) => x.id === playerId)!;
  if (isClue) {
    if (p2.library.length === 0) p2.attemptedEmptyDraw = true;
    else {
      const c = p2.library.shift()!;
      c.zone = 'hand';
      p2.hand.push(c);
    }
  } else if (isFood) {
    p2.life += 3;
  } else if (isBlood) {
    if (p2.hand.length > 0) {
      const [d] = p2.hand.splice(0, 1);
      d.zone = 'graveyard';
      p2.graveyard.push(d);
    }
    if (p2.library.length === 0) p2.attemptedEmptyDraw = true;
    else {
      const c = p2.library.shift()!;
      c.zone = 'hand';
      p2.hand.push(c);
    }
  }
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

/**
 * Activate planeswalker loyalty ability by index (0 = first listed).
 * Sorcery-speed MVP: main phase, empty stack, active player.
 */
export function cancelLoyalty(state: GameState): GameState {
  if (!state.pendingLoyalty) return state;
  return { ...state, pendingLoyalty: null };
}

export function beginLoyalty(
  state: GameState,
  playerId: string,
  permanentId: string,
  abilityIndex: number,
): GameState {
  if (state.pendingCast || state.pendingChoices.length > 0) return state;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;
  const ap = state.players[state.activePlayerIndex];
  if (!ap || ap.id !== playerId) return state;
  if (state.phase !== 'main1' && state.phase !== 'main2') return state;
  if (state.stack.length > 0) return state;

  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm || !isPlaneswalker(perm)) return state;

  const abilities = parseLoyaltyAbilities(perm.card.oracle_text);
  const ab = abilities[abilityIndex];
  if (!ab) return state;
  const loy = perm.counters['loyalty'] ?? 0;
  if (ab.loyaltyCost < 0 && loy + ab.loyaltyCost < 0) return state;

  // Apply loyalty cost immediately (as cost to activate)
  const nextBase = clonePlayers(state);
  nextBase.pendingLoyalty = null;
  const pperm = nextBase.players
    .find((p) => p.id === playerId)!
    .battlefield.find((c) => c.id === permanentId)!;
  pperm.counters['loyalty'] = loy + ab.loyaltyCost;

  if (ab.script.targets.length === 0) {
    const obj: StackObject = {
      id: nextStackId(),
      kind: 'ability',
      controller: playerId,
      name: `${perm.card.name} (${ab.loyaltyCost >= 0 ? '+' : ''}${ab.loyaltyCost})`,
      sourcePermanentId: permanentId,
      targets: {},
      script: ab.script,
    };
    nextBase.stack = [...nextBase.stack, obj];
    nextBase.consecutivePasses = 0;
    return afterPlayerAction(nextBase);
  }
  for (const slot of ab.script.targets) {
    if (listLegalTargets(nextBase, slot.filter, playerId).length === 0) return state;
  }
  return {
    ...nextBase,
    pendingCast: {
      playerId,
      cardId: permanentId,
      cardName: `${perm.card.name} (${ab.loyaltyCost >= 0 ? '+' : ''}${ab.loyaltyCost})`,
      slots: ab.script.targets,
      chosen: {},
      currentSlot: 0,
      from: 'ability',
      abilitySourceId: permanentId,
      sourceColors: perm.card.colors || [],
      abilityScript: ab.script,
    },
  };
}

/** Equip {N} — pay, choose creature you control, attach (702.6). */
export function beginEquip(
  state: GameState,
  playerId: string,
  equipmentId: string,
): GameState {
  if (state.pendingCast || state.pendingChoices.length > 0) return state;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;

  const found = findCard(state, equipmentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) return state;
  const perm = found.player.battlefield.find((c) => c.id === equipmentId);
  if (!perm) return state;
  const equipCost = parseEquipCost(perm.card.oracle_text);
  if (equipCost === null) return state;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const payCost = {
    generic: equipCost,
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
  if (equipCost > 0 && !canPayMana(player.manaPool, payCost)) return state;

  const slots = [
    {
      key: 'eq',
      filter: 'creatureYouControl' as const,
      prompt: 'Choose creature to equip',
    },
  ];
  if (listLegalTargets(state, 'creatureYouControl', playerId).length === 0) return state;

  return {
    ...state,
    pendingCast: {
      playerId,
      cardId: equipmentId,
      cardName: `Equip ${perm.card.name}`,
      slots,
      chosen: {},
      currentSlot: 0,
      from: 'equip',
      abilitySourceId: equipmentId,
      sourceColors: perm.card.colors || [],
    },
  };
}

function finalizeEquip(
  state: GameState,
  playerId: string,
  equipmentId: string,
  creatureId: string,
): GameState {
  const found = findCard(state, equipmentId);
  if (!found || found.zone !== 'battlefield') return { ...state, pendingCast: null };
  const equipCost = parseEquipCost(found.card.card.oracle_text);
  if (equipCost === null) return { ...state, pendingCast: null };

  const next = clonePlayers(state);
  next.pendingCast = null;
  const p = next.players.find((x) => x.id === playerId);
  if (!p) return state;
  const payCost = {
    generic: equipCost,
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
  if (equipCost > 0) {
    if (!canPayMana(p.manaPool, payCost)) return state;
    const paid = payMana(p.manaPool, payCost);
    if (!paid) return state;
    p.manaPool = paid;
  }

  const eq = p.battlefield.find((c) => c.id === equipmentId);
  const creature = findCard(next, creatureId);
  if (!eq || creature?.zone !== 'battlefield' || creature.card.controller !== playerId) {
    return state;
  }
  eq.attachedTo = creatureId;
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

export function finalizeAbility(
  state: GameState,
  playerId: string,
  permanentId: string,
  targets: Record<string, TargetRef>,
  script: SpellScript,
  opts?: { skipWardCheck?: boolean; needsTap?: boolean; manaAlreadyPaid?: boolean },
): GameState {
  if (!opts?.skipWardCheck && totalWardCost(state, playerId, targets) > 0) {
    return withWardGate(state, {
      kind: 'ability',
      playerId,
      cardId: permanentId,
      targets,
      script,
    });
  }

  const next = clonePlayers(state);
  next.pendingCast = null;
  next.pendingActivated = null;
  const found = findCard(next, permanentId);
  if (!found || found.zone !== 'battlefield') return { ...state, pendingCast: null };
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm || found.player.id !== playerId) {
    return { ...state, pendingCast: null };
  }
  const needsTap = opts?.needsTap ?? !isPlaneswalker(perm);
  if (needsTap) {
    if (perm.tapped) return { ...state, pendingCast: null };
    perm.tapped = true;
  }
  const obj: StackObject = {
    id: nextStackId(),
    kind: 'ability',
    controller: playerId,
    name: `${perm.card.name}'s ability`,
    sourcePermanentId: permanentId,
    targets,
    script,
  };
  next.stack = [...next.stack, obj];
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

/** Called from selectCastTarget when pending.from === 'ability' | 'equip' | 'crew'. */
export function continueAbilityTarget(state: GameState, target: TargetRef): GameState {
  const pending = state.pendingCast;
  if (!pending) return state;
  if (pending.from === 'crew') {
    if (target.kind !== 'permanent') return state;
    return continueCrewTap(state, target.permanentId);
  }
  if (pending.from !== 'ability' && pending.from !== 'equip') return state;
  const slot = pending.slots[pending.currentSlot];
  if (!slot) return state;
  if (!isLegalTarget(state, slot.filter, target, pending.playerId)) return state;

  const chosen = { ...pending.chosen, [slot.key]: target };
  const nextSlot = pending.currentSlot + 1;
  const sourceId = pending.abilitySourceId || pending.cardId;

  if (nextSlot >= pending.slots.length) {
    if (pending.from === 'equip') {
      if (target.kind !== 'permanent') return state;
      return finalizeEquip(
        { ...state, pendingCast: null },
        pending.playerId,
        sourceId,
        target.permanentId,
      );
    }
    const found = findCard(state, sourceId);
    const script =
      pending.abilityScript ||
      parseTapAbility(found?.card.card.oracle_text) ||
      ({ targets: pending.slots, effects: [{ type: 'noop' as const }] } as NonNullable<
        ReturnType<typeof parseTapAbility>
      >);
    return finalizeAbility(
      { ...state, pendingCast: null },
      pending.playerId,
      sourceId,
      chosen,
      script,
      {
        needsTap: pending.abilityNeedsTap ?? true,
        manaAlreadyPaid: pending.abilityManaPaid,
      },
    );
  }
  return {
    ...state,
    pendingCast: { ...pending, chosen, currentSlot: nextSlot },
  };
}
