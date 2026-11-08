import { continueAbilityTarget, finalizeAbility } from './abilities';
import {
  affinityDiscount,
  cantBeCountered,
  hasAscend,
  hasCascade,
  hasConvoke,
  hasDelve,
  hasEvolve,
  hasImprovise,
  hasRebound,
  hasRetrace,
  hasRiot,
  hasSplitSecond,
  hasStorm,
  isSaga,
  manaCostHasX,
  oracleEntersTapped,
  overloadScript,
  parseAdditionalCosts,
  parseBackup,
  parseBloodthirst,
  parseBlitzCost,
  parseCyclingCost,
  parseDashCost,
  parseDevour,
  parseEmbalmCost,
  parseEntersWithCounters,
  parseEscape,
  parseEvokeCost,
  parseFabricate,
  parseFlashbackCost,
  parseJumpStartCost,
  parseModular,
  parseOracleScript,
  parseOverloadCost,
  parseSpectacleCost,
  parseUnearthCost,
  selfCostReduction,
  SpellScript,
  TargetRef,
} from './effects';
import { afterPlayerAction, givePriority, registerStackResolver } from './priority';
import {
  canPayMana,
  manaValue,
  parseManaCost,
  payMana,
  payManaDetailed,
  basicLandMana,
  withExtraGeneric,
  ManaCost,
} from './mana';
import { applyEffects } from './resolveEffects';
import { isLegalTarget, listLegalTargets } from './targets';
import { makeInstance } from './setup';
import {
  CardInstance,
  effectivePower,
  GameState,
  hasKeyword,
  isCreature,
  ManaColor,
  StackObject,
} from './types';
import {
  addDelayedTrigger,
  finalizeTriggerTargets,
  fireCastAnySpellTriggers,
  fireCastNoncreatureTriggers,
  fireEtbTriggers,
} from './triggers';
import { resolveSagaChapter } from './saga';
import { totalWardCost, withWardGate } from './ward';
import { clonePlayers, findCard, moveCard } from './zones';

let _stackSeq = 0;
function nextStackId(): string {
  _stackSeq += 1;
  return `stk_${_stackSeq}`;
}

function isInstant(typeLine: string): boolean {
  return typeLine.includes('Instant');
}

function isPermanentSpell(typeLine: string): boolean {
  return (
    typeLine.includes('Creature') ||
    typeLine.includes('Artifact') ||
    typeLine.includes('Enchantment') ||
    typeLine.includes('Planeswalker') ||
    typeLine.includes('Battle') ||
    typeLine.includes('Kindred')
  );
}

function timingOk(state: GameState, card: CardInstance): boolean {
  // Split second on stack → no casting (702.60)
  if (state.stack.some((o) => o.cardInstance && hasSplitSecond(o.cardInstance.card))) {
    return false;
  }
  const typeLine = card.card.type_line;
  // Instant speed / Flash (702.8)
  if (isInstant(typeLine) || hasKeyword(card, 'flash')) return true;
  const ap = state.players[state.activePlayerIndex];
  const priority = state.players[state.priorityPlayerIndex];
  if (!ap || !priority || ap.id !== priority.id) return false;
  if (state.phase !== 'main1' && state.phase !== 'main2') return false;
  if (state.stack.length > 0) return false;
  return true;
}

/** Commander tax: +{2} per previous cast from command zone (903.8). */
export function commanderTaxCost(instance: CardInstance, manaCost?: string): ManaCost {
  const base = parseManaCost(manaCost);
  const tax = 2 * (instance.commanderCastCount || 0);
  return withExtraGeneric(base, tax);
}

type CastFrom =
  | 'hand'
  | 'command'
  | 'flashback'
  | 'jumpstart'
  | 'escape'
  | 'retrace'
  | 'dash'
  | 'blitz'
  | 'spectacle'
  | 'embalm'
  | 'evoke'
  | 'overload';

function spellCost(instance: CardInstance, from: CastFrom, xValue = 0): ManaCost {
  if (from === 'flashback') {
    return parseManaCost(parseFlashbackCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'jumpstart') {
    return parseManaCost(parseJumpStartCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'escape') {
    return parseManaCost(parseEscape(instance.card.oracle_text)?.mana || undefined, xValue);
  }
  if (from === 'dash') {
    return parseManaCost(parseDashCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'blitz') {
    return parseManaCost(parseBlitzCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'spectacle') {
    return parseManaCost(parseSpectacleCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'embalm') {
    return parseManaCost(parseEmbalmCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'evoke') {
    return parseManaCost(parseEvokeCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'overload') {
    return parseManaCost(parseOverloadCost(instance.card.oracle_text) || undefined, xValue);
  }
  if (from === 'retrace') {
    return parseManaCost(instance.card.mana_cost, xValue);
  }
  if (from === 'command' && instance.isCommander) {
    return commanderTaxCost(instance, instance.card.mana_cost);
  }
  return parseManaCost(instance.card.mana_cost, xValue);
}

function applyGenericDiscount(cost: ManaCost, amount: number): ManaCost {
  if (amount <= 0) return cost;
  return { ...cost, generic: Math.max(0, cost.generic - amount) };
}

function mergeScript(
  base: SpellScript,
  modeIndex?: number,
  payKicker?: boolean,
): SpellScript {
  let targets = [...(base.targets || [])];
  let effects = [...(base.effects || [])];
  if (base.modes && modeIndex != null && base.modes[modeIndex]) {
    const m = base.modes[modeIndex];
    targets = [...m.targets];
    effects = [...m.effects];
  }
  if (payKicker && base.kicker) {
    const remap = new Map<string, string>();
    for (const t of base.kicker.targets) {
      const nk = `k_${t.key}`;
      remap.set(t.key, nk);
      targets.push({ ...t, key: nk });
    }
    for (const e of base.kicker.effects) {
      if ('targetKey' in e && typeof (e as { targetKey?: string }).targetKey === 'string') {
        const tk = (e as { targetKey: string }).targetKey;
        const nt = remap.get(tk);
        effects.push(nt ? { ...e, targetKey: nt } : e);
      } else {
        effects.push(e);
      }
    }
  }
  return {
    targets,
    effects,
    modes: base.modes,
    kicker: base.kicker,
    buyback: base.buyback,
    hasX: base.hasX,
  };
}

type CastPhase =
  | 'mode'
  | 'x'
  | 'kicker'
  | 'buyback'
  | 'convoke'
  | 'improvise'
  | 'delve'
  | 'targets'
  | 'done';

function nextCastPhase(
  script: SpellScript,
  after: 'start' | 'mode' | 'x' | 'kicker' | 'buyback' | 'convoke' | 'improvise' | 'delve',
  flags?: { convoke?: boolean; improvise?: boolean; delve?: boolean },
): CastPhase {
  const hasModes = !!(script.modes && script.modes.length > 0);
  const hasX = !!script.hasX;
  const hasKicker = !!script.kicker;
  const hasBuyback = !!script.buyback;
  const wantConvoke = !!flags?.convoke;
  const wantImprovise = !!flags?.improvise;
  const wantDelve = !!flags?.delve;
  const afterAnnounce = (): CastPhase => {
    if (wantConvoke) return 'convoke';
    if (wantImprovise) return 'improvise';
    if (wantDelve) return 'delve';
    return script.targets.length ? 'targets' : 'done';
  };
  if (after === 'start') {
    if (hasModes) return 'mode';
    if (hasX) return 'x';
    if (hasKicker) return 'kicker';
    if (hasBuyback) return 'buyback';
    return afterAnnounce();
  }
  if (after === 'mode') {
    if (hasX) return 'x';
    if (hasKicker) return 'kicker';
    if (hasBuyback) return 'buyback';
    return afterAnnounce();
  }
  if (after === 'x') {
    if (hasKicker) return 'kicker';
    if (hasBuyback) return 'buyback';
    return afterAnnounce();
  }
  if (after === 'kicker') {
    if (hasBuyback) return 'buyback';
    return afterAnnounce();
  }
  if (after === 'buyback') return afterAnnounce();
  if (after === 'convoke') {
    if (wantImprovise) return 'improvise';
    if (wantDelve) return 'delve';
    return script.targets.length ? 'targets' : 'done';
  }
  if (after === 'improvise') {
    if (wantDelve) return 'delve';
    return script.targets.length ? 'targets' : 'done';
  }
  return script.targets.length ? 'targets' : 'done';
}

function castKeywordFlags(card: CardInstance): {
  convoke: boolean;
  improvise: boolean;
  delve: boolean;
} {
  return {
    convoke: hasConvoke(card.card),
    improvise: hasImprovise(card.card),
    delve: hasDelve(card.card),
  };
}

function maxConvokeSlots(state: GameState, playerId: string): number {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  return p.battlefield.filter((c) => isCreature(c) && !c.tapped).length;
}

function maxDelveSlots(state: GameState, playerId: string, excludeId?: string): number {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  return p.graveyard.filter((c) => c.id !== excludeId).length;
}

/** Reduce cost via convoke (colored preferred) then delve (generic only). */
function reduceCostWithConvokeDelve(
  cost: ManaCost,
  creatures: CardInstance[],
  delveCount: number,
): ManaCost {
  const c: ManaCost = {
    ...cost,
    hybrids: [...(cost.hybrids || [])],
    phyrexian: [...(cost.phyrexian || [])],
  };
  const rem = [...creatures];
  for (const col of ['W', 'U', 'B', 'R', 'G'] as const) {
    while (c[col] > 0) {
      const i = rem.findIndex((cr) => (cr.card.colors || []).includes(col));
      if (i < 0) break;
      rem.splice(i, 1);
      c[col] -= 1;
    }
  }
  const fromCreatures = Math.min(c.generic, rem.length);
  c.generic -= fromCreatures;
  c.generic = Math.max(0, c.generic - Math.max(0, delveCount));
  return c;
}

function canAffordCost(
  state: GameState,
  playerId: string,
  cost: ManaCost,
  manaCost?: string,
  opts?: {
    convoke?: boolean;
    improvise?: boolean;
    delve?: boolean;
    excludeGyId?: string;
    card?: CardInstance;
  },
): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  let adjusted = cost;
  if (opts?.card) {
    const disc =
      affinityDiscount(state, playerId, opts.card.card) +
      selfCostReduction(opts.card.card.oracle_text);
    adjusted = applyGenericDiscount(adjusted, disc);
  }
  const colored = adjusted.W + adjusted.U + adjusted.B + adjusted.R + adjusted.G + adjusted.C;
  const isZero =
    manaCost === '{0}' ||
    (manaCost != null && adjusted.generic === 0 && colored === 0 && !adjusted.unpayable);
  if (adjusted.unpayable && !isZero) return false;
  if (isZero) return true;
  if (opts?.convoke || opts?.improvise || opts?.delve) {
    const creatures = opts?.convoke
      ? player.battlefield.filter((c) => isCreature(c) && !c.tapped)
      : [];
    const artifacts = opts?.improvise
      ? player.battlefield.filter(
          (c) => c.card.type_line.includes('Artifact') && !c.tapped,
        )
      : [];
    const delveN = opts?.delve ? maxDelveSlots(state, playerId, opts.excludeGyId) : 0;
    // Improvise only pays generic (702.126) — treat as delve-like after colored convoke
    adjusted = reduceCostWithConvokeDelve(adjusted, creatures, delveN + artifacts.length);
  }
  return canPayMana(player.manaPool, adjusted, player.life);
}

function findCastable(
  state: GameState,
  playerId: string,
  cardId: string,
  from: CastFrom,
): CardInstance | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const gy =
    from === 'flashback' ||
    from === 'jumpstart' ||
    from === 'escape' ||
    from === 'retrace' ||
    from === 'embalm';
  const list = from === 'command' ? player.commandZone : gy ? player.graveyard : player.hand;
  return list.find((c) => c.id === cardId) || null;
}

/** Parse `{T}: Add {G}{G}` / `{T}: Add {C}{C}`. */
function parseTapAddMana(oracle?: string): Partial<Record<ManaColor, number>> | null {
  if (!oracle) return null;
  const m = oracle.match(/\{T\}:\s*Add\s*((?:\{[WUBRGC0-9]+\})+)/i);
  if (!m) return null;
  const add: Partial<Record<ManaColor, number>> = {};
  const symbols = m[1].match(/\{([^}]+)\}/g) || [];
  for (const raw of symbols) {
    const s = raw.slice(1, -1).toUpperCase();
    if (/^\d+$/.test(s)) {
      add.C = (add.C || 0) + parseInt(s, 10);
    } else if (s === 'W' || s === 'U' || s === 'B' || s === 'R' || s === 'G' || s === 'C') {
      add[s] = (add[s] || 0) + 1;
    }
  }
  return Object.keys(add).length ? add : null;
}

/** Mana ability: tap basic land, Sol Ring, or `{T}: Add …`. Allowed during targeting (Arena). */
export function activateManaAbility(
  state: GameState,
  playerId: string,
  permanentId: string,
): GameState {
  const next = clonePlayers(state);
  const player = next.players.find((p) => p.id === playerId);
  if (!player || player.hasLost) return state;
  if (next.pendingCast) {
    if (next.pendingCast.playerId !== playerId) return state;
  } else if (next.players[next.priorityPlayerIndex]?.id !== playerId) {
    return state;
  }

  const perm = player.battlefield.find((c) => c.id === permanentId);
  if (!perm || perm.tapped) return state;

  let add: Partial<Record<ManaColor, number>> | null = null;
  let sacrificeAfter = false;
  const basic = basicLandMana(perm.card.type_line);
  if (basic && perm.card.type_line.includes('Land')) {
    add = { [basic]: 1 };
  } else if (
    /treasure/i.test(perm.card.type_line) ||
    perm.card.name.toLowerCase() === 'treasure'
  ) {
    // {T}, Sacrifice this artifact: Add {C}.
    add = { C: 1 };
    sacrificeAfter = true;
  } else {
    add = parseTapAddMana(perm.card.oracle_text);
    if (!add && perm.card.name.toLowerCase().includes('sol ring')) {
      add = { C: 2 };
    }
    // "{T}, Sacrifice …: Add {C}"
    if (
      !add &&
      /\{T\},?\s*sacrifice\s+this\s+artifact:\s*add\s*\{C\}/i.test(perm.card.oracle_text || '')
    ) {
      add = { C: 1 };
      sacrificeAfter = true;
    }
  }
  if (!add) return state;

  perm.tapped = true;
  for (const [c, n] of Object.entries(add)) {
    player.manaPool[c as keyof typeof player.manaPool] += n || 0;
  }
  if (sacrificeAfter) {
    const idx = player.battlefield.findIndex((c) => c.id === permanentId);
    if (idx >= 0) {
      const [tok] = player.battlefield.splice(idx, 1);
      // tokens cease; non-tokens to GY
      if (!tok.isToken) {
        tok.zone = 'graveyard';
        player.graveyard.push(tok);
      }
    }
  }
  return next;
}

function beginCastFrom(
  state: GameState,
  playerId: string,
  cardId: string,
  from: CastFrom,
): GameState {
  if (state.pendingCast) return state;
  if (state.combat?.mode === 'declareAttackers' || state.combat?.mode === 'declareBlockers') {
    return state;
  }
  if (state.pendingChoices.length > 0) return state;

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasLost) return state;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;

  const card = findCastable(state, playerId, cardId, from);
  if (!card) return state;
  if (from === 'command' && !card.isCommander) return state;
  if (from === 'flashback' && !parseFlashbackCost(card.card.oracle_text)) return state;
  if (from === 'jumpstart') {
    if (!parseJumpStartCost(card.card.oracle_text)) return state;
    if (player.hand.length < 1) return state;
  }
  if (from === 'escape') {
    const esc = parseEscape(card.card.oracle_text);
    if (!esc) return state;
    if (player.graveyard.filter((c) => c.id !== cardId).length < esc.exile) return state;
  }
  if (from === 'retrace') {
    if (!hasRetrace(card.card)) return state;
    if (!player.hand.some((c) => c.card.type_line.includes('Land'))) return state;
  }
  if (from === 'dash' && !parseDashCost(card.card.oracle_text)) return state;
  if (from === 'blitz' && !parseBlitzCost(card.card.oracle_text)) return state;
  if (from === 'spectacle') {
    if (!parseSpectacleCost(card.card.oracle_text)) return state;
    const oppLost = state.players.some((p) => p.id !== playerId && p.lostLifeThisTurn);
    if (!oppLost) return state;
  }
  if (from === 'embalm' && !parseEmbalmCost(card.card.oracle_text)) return state;
  if (from === 'evoke' && !parseEvokeCost(card.card.oracle_text)) return state;
  if (from === 'overload' && !parseOverloadCost(card.card.oracle_text)) return state;
  if (card.card.type_line.includes('Land') && !card.card.type_line.includes('Creature')) {
    return state;
  }
  if (from !== 'embalm' && !timingOk(state, card)) return state;

  const cost = spellCost(card, from);
  const manaStr =
    from === 'flashback'
      ? parseFlashbackCost(card.card.oracle_text) || undefined
      : from === 'jumpstart'
        ? parseJumpStartCost(card.card.oracle_text) || undefined
        : from === 'escape'
          ? parseEscape(card.card.oracle_text)?.mana
          : from === 'dash'
            ? parseDashCost(card.card.oracle_text) || undefined
            : from === 'blitz'
              ? parseBlitzCost(card.card.oracle_text) || undefined
              : from === 'spectacle'
                ? parseSpectacleCost(card.card.oracle_text) || undefined
                : from === 'embalm'
                  ? parseEmbalmCost(card.card.oracle_text) || undefined
                  : card.card.mana_cost;
  const kw = castKeywordFlags(card);
  if (!canAffordCost(state, playerId, cost, manaStr, { ...kw, card })) return state;

  // Embalm is an activated ability → token copy (no stack targets from spell script)
  if (from === 'embalm') {
    return finalizeEmbalm(state, playerId, cardId);
  }

  const script = parseOracleScript(
    card.card.oracle_text,
    card.card.type_line,
    card.card.mana_cost,
  );
  // Ensure hasX from mana cost
  if (manaCostHasX(card.card.mana_cost)) script.hasX = true;

  const sourceColors = card.card.colors || [];
  const tagMap: Partial<Record<CastFrom, string>> = {
    flashback: ' (FB)',
    jumpstart: ' (JS)',
    escape: ' (Esc)',
    retrace: ' (Ret)',
    dash: ' (Dash)',
    blitz: ' (Blitz)',
    spectacle: ' (Spec)',
  };
  const phase = nextCastPhase(script, 'start', kw);
  if (phase === 'done') {
    return finalizeCast(state, playerId, cardId, {}, script, from);
  }
  if (phase === 'targets') {
    for (const slot of script.targets) {
      if (listLegalTargets(state, slot.filter, playerId, sourceColors).length === 0) return state;
    }
  }
  return {
    ...state,
    pendingCast: {
      playerId,
      cardId,
      cardName: `${card.card.name}${tagMap[from] || ''}`,
      slots: phase === 'targets' ? script.targets : [],
      chosen: {},
      currentSlot: 0,
      from,
      sourceColors,
      phase,
      resolvedScript: script,
      convokeTapped: [],
      delveExiled: [],
    },
  };
}

function pendingKwFlags(
  state: GameState,
  pending: NonNullable<GameState['pendingCast']>,
): { convoke: boolean; delve: boolean } {
  const card = findCastable(state, pending.playerId, pending.cardId, pending.from as CastFrom);
  return card ? castKeywordFlags(card) : { convoke: false, delve: false };
}

function advanceAfterAnnounce(
  state: GameState,
  pending: NonNullable<GameState['pendingCast']>,
  merged: SpellScript,
  after: 'mode' | 'x' | 'kicker' | 'buyback' | 'convoke' | 'improvise' | 'delve',
  extra: Partial<NonNullable<GameState['pendingCast']>> = {},
): GameState {
  const kw = pendingKwFlags(state, pending);
  const phase = nextCastPhase(merged, after, kw);
  if (phase === 'done') {
    return finalizeCast(
      { ...state, pendingCast: null },
      pending.playerId,
      pending.cardId,
      pending.chosen,
      merged,
      pending.from as CastFrom,
      undefined,
      pending.xValue || 0,
      !!pending.payKicker,
      extra.convokeTapped ?? pending.convokeTapped,
      extra.delveExiled ?? pending.delveExiled,
      extra.improviseTapped ?? pending.improviseTapped,
      extra.payBuyback ?? pending.payBuyback,
    );
  }
  if (phase === 'targets') {
    for (const slot of merged.targets) {
      if (
        listLegalTargets(state, slot.filter, pending.playerId, pending.sourceColors).length === 0
      ) {
        return state;
      }
    }
  }
  return {
    ...state,
    pendingCast: {
      ...pending,
      ...extra,
      resolvedScript: { ...pending.resolvedScript!, ...merged },
      phase,
      slots: phase === 'targets' ? merged.targets : [],
      currentSlot: 0,
      chosen: phase === 'targets' ? {} : pending.chosen,
    },
  };
}

/** Choose modal mode (Choose one —). */
export function selectCastMode(state: GameState, modeIndex: number): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.phase !== 'mode' || !pending.resolvedScript?.modes) return state;
  if (!pending.resolvedScript.modes[modeIndex]) return state;
  const merged = mergeScript(pending.resolvedScript, modeIndex, pending.payKicker);
  return advanceAfterAnnounce(state, { ...pending, modeIndex }, merged, 'mode', { modeIndex });
}

/** Announce X for {X} spells. */
export function setCastX(state: GameState, xValue: number): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.phase !== 'x') return state;
  const x = Math.max(0, Math.floor(xValue));
  const base = pending.resolvedScript || { targets: [], effects: [] };
  const merged = mergeScript(base, pending.modeIndex, pending.payKicker);
  return advanceAfterAnnounce(
    state,
    { ...pending, xValue: x },
    { ...merged, hasX: true },
    'x',
    { xValue: x },
  );
}

/** Opt into / out of kicker. */
export function setCastKicker(state: GameState, pay: boolean): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.phase !== 'kicker' || !pending.resolvedScript?.kicker) return state;
  const merged = mergeScript(pending.resolvedScript, pending.modeIndex, pay);
  return advanceAfterAnnounce(state, { ...pending, payKicker: pay }, merged, 'kicker', {
    payKicker: pay,
  });
}

/** Opt into / out of buyback. */
export function setCastBuyback(state: GameState, pay: boolean): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.phase !== 'buyback' || !pending.resolvedScript?.buyback) return state;
  const merged = mergeScript(
    pending.resolvedScript,
    pending.modeIndex,
    pending.payKicker,
  );
  return advanceAfterAnnounce(state, { ...pending, payBuyback: pay }, merged, 'buyback', {
    payBuyback: pay,
  });
}

/** Toggle a creature for convoke payment. */
export function toggleConvokeCreature(state: GameState, creatureId: string): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.phase !== 'convoke') return state;
  const found = state.players
    .find((p) => p.id === pending.playerId)
    ?.battlefield.find((c) => c.id === creatureId);
  if (!found || !isCreature(found) || found.tapped) return state;
  const set = new Set(pending.convokeTapped || []);
  if (set.has(creatureId)) set.delete(creatureId);
  else set.add(creatureId);
  return {
    ...state,
    pendingCast: { ...pending, convokeTapped: [...set] },
  };
}

/** Toggle a GY card for delve payment. */
export function toggleDelveCard(state: GameState, cardId: string): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.phase !== 'delve') return state;
  if (cardId === pending.cardId) return state;
  const gy = state.players.find((p) => p.id === pending.playerId)?.graveyard;
  if (!gy?.some((c) => c.id === cardId)) return state;
  const set = new Set(pending.delveExiled || []);
  if (set.has(cardId)) set.delete(cardId);
  else set.add(cardId);
  return {
    ...state,
    pendingCast: { ...pending, delveExiled: [...set] },
  };
}

/** Toggle an artifact for improvise payment. */
export function toggleImproviseArtifact(state: GameState, permanentId: string): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.phase !== 'improvise') return state;
  const found = state.players
    .find((p) => p.id === pending.playerId)
    ?.battlefield.find((c) => c.id === permanentId);
  if (!found || !found.card.type_line.includes('Artifact') || found.tapped) return state;
  const set = new Set(pending.improviseTapped || []);
  if (set.has(permanentId)) set.delete(permanentId);
  else set.add(permanentId);
  return {
    ...state,
    pendingCast: { ...pending, improviseTapped: [...set] },
  };
}

/** Finish convoke/improvise/delve selection → targets or finalize. */
export function confirmConvokeDelve(state: GameState): GameState {
  const pending = state.pendingCast;
  if (
    !pending ||
    (pending.phase !== 'convoke' &&
      pending.phase !== 'improvise' &&
      pending.phase !== 'delve')
  ) {
    return state;
  }
  const base = pending.resolvedScript || { targets: [], effects: [] };
  const merged = mergeScript(base, pending.modeIndex, pending.payKicker);
  return advanceAfterAnnounce(state, pending, merged, pending.phase);
}

export function beginCastEvoke(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'evoke');
}

export function beginCastOverload(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'overload');
}

/**
 * Arena: click card in hand → propose cast.
 * If targets needed → pendingCast; else pay and put on stack.
 */
export function beginCast(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'hand');
}

/** Cast commander from command zone (with tax). */
export function beginCastCommander(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'command');
}

/** Flashback — cast from graveyard (702.34). */
export function beginCastFlashback(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'flashback');
}

/** Jump-start — cast from GY + discard a card (702.126). */
export function beginCastJumpStart(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'jumpstart');
}

export function beginCastEscape(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'escape');
}

export function beginCastRetrace(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'retrace');
}

export function beginCastDash(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'dash');
}

export function beginCastBlitz(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'blitz');
}

export function beginCastSpectacle(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'spectacle');
}

export function beginEmbalm(state: GameState, playerId: string, cardId: string): GameState {
  return beginCastFrom(state, playerId, cardId, 'embalm');
}

function finalizeEmbalm(state: GameState, playerId: string, cardId: string): GameState {
  const card = findCastable(state, playerId, cardId, 'embalm');
  if (!card) return state;
  const costStr = parseEmbalmCost(card.card.oracle_text);
  if (!costStr) return state;
  const cost = parseManaCost(costStr);
  if (!canAffordCost(state, playerId, cost, costStr)) return state;
  let next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId)!;
  const paid = payMana(p.manaPool, cost);
  if (!paid) return state;
  p.manaPool = paid;
  const idx = p.graveyard.findIndex((c) => c.id === cardId);
  if (idx === -1) return state;
  const [src] = p.graveyard.splice(idx, 1);
  src.zone = 'exile';
  p.exile.push(src);
  const tok = makeInstance(
    { ...src.card, name: `${src.card.name} (embalm)`, oracle_id: `embalm-${src.card.oracle_id}` },
    playerId,
    'battlefield',
    { isToken: true },
  );
  tok.summoningSick = true;
  p.battlefield.push(tok);
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

/**
 * Unearth — pay cost from GY, return to BF with haste; exile EOT (702.110).
 */
export function beginUnearth(state: GameState, playerId: string, cardId: string): GameState {
  if (state.pendingCast || state.pendingChoices.length > 0) return state;
  if (state.combat?.mode === 'declareAttackers' || state.combat?.mode === 'declareBlockers') {
    return state;
  }
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasLost) return state;
  const card = player.graveyard.find((c) => c.id === cardId);
  if (!card) return state;
  const costStr = parseUnearthCost(card.card.oracle_text);
  if (!costStr) return state;
  const cost = parseManaCost(costStr);
  if (!canAffordCost(state, playerId, cost, costStr)) return state;

  let next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId)!;
  if (cost.generic + cost.W + cost.U + cost.B + cost.R + cost.G + cost.C > 0) {
    const paid = payMana(p.manaPool, cost);
    if (!paid) return state;
    p.manaPool = paid;
  }
  const idx = p.graveyard.findIndex((c) => c.id === cardId);
  if (idx === -1) return state;
  const [inst] = p.graveyard.splice(idx, 1);
  inst.zone = 'battlefield';
  inst.unearthed = true;
  inst.summoningSick = false; // haste
  if (!inst.card.keywords.includes('haste')) {
    inst.card = { ...inst.card, keywords: [...inst.card.keywords, 'haste'] };
  }
  p.battlefield.push(inst);
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

/**
 * Cycling — discard from hand, pay cycling cost, draw (702.28).
 * Instant-speed special action while you have priority.
 */
export function beginCycle(state: GameState, playerId: string, cardId: string): GameState {
  if (state.pendingCast || state.pendingChoices.length > 0) return state;
  if (state.combat?.mode === 'declareAttackers' || state.combat?.mode === 'declareBlockers') {
    return state;
  }
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasLost) return state;
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return state;
  const cycleCost = parseCyclingCost(card.card.oracle_text);
  if (cycleCost === null) return state;

  const cost = withExtraGeneric(parseManaCost('{0}'), cycleCost);
  const payCost = {
    generic: cycleCost,
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
    C: 0,
    unpayable: false,
  };
  if (cycleCost > 0 && !canPayMana(player.manaPool, payCost)) return state;

  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId)!;
  if (cycleCost > 0) {
    const paid = payMana(p.manaPool, payCost);
    if (!paid) return state;
    p.manaPool = paid;
  }
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return state;
  const [c] = p.hand.splice(idx, 1);
  c.zone = 'graveyard';
  if (c.isCommander) c.commanderRelocationPending = true;
  p.graveyard.push(c);

  // Draw 1
  if (p.library.length === 0) p.attemptedEmptyDraw = true;
  else {
    const d = p.library.shift()!;
    d.zone = 'hand';
    p.hand.push(d);
  }
  void cost;
  next.consecutivePasses = 0;
  return afterPlayerAction(next);
}

/** @deprecated use beginCast — kept as alias */
export function castSpell(state: GameState, playerId: string, cardId: string): GameState {
  return beginCast(state, playerId, cardId);
}

export function cancelCast(state: GameState): GameState {
  if (!state.pendingCast) return state;
  return { ...state, pendingCast: null };
}

/** Arena: click legal target while casting. */
export function selectCastTarget(state: GameState, target: TargetRef): GameState {
  const pending = state.pendingCast;
  if (!pending) return state;
  if (pending.from === 'ability' || pending.from === 'equip' || pending.from === 'crew') {
    return continueAbilityTarget(state, target);
  }
  if (pending.phase === 'convoke' && target.kind === 'permanent') {
    return toggleConvokeCreature(state, target.permanentId);
  }
  if (pending.phase === 'improvise' && target.kind === 'permanent') {
    return toggleImproviseArtifact(state, target.permanentId);
  }
  if (pending.phase === 'delve' && target.kind === 'permanent') {
    return toggleDelveCard(state, target.permanentId);
  }
  const slot = pending.slots[pending.currentSlot];
  if (!slot) return state;
  if (!isLegalTarget(state, slot.filter, target, pending.playerId)) return state;

  const chosen = { ...pending.chosen, [slot.key]: target };
  const nextSlot = pending.currentSlot + 1;

  if (pending.from === 'trigger') {
    if (nextSlot >= pending.slots.length) {
      return finalizeTriggerTargets({ ...state, pendingCast: { ...pending, chosen } }, chosen);
    }
    return {
      ...state,
      pendingCast: { ...pending, chosen, currentSlot: nextSlot },
    };
  }

  const castFroms: CastFrom[] = [
    'hand',
    'command',
    'flashback',
    'jumpstart',
    'escape',
    'retrace',
    'dash',
    'blitz',
    'spectacle',
    'embalm',
  ];
  const from: CastFrom = castFroms.includes(pending.from as CastFrom)
    ? (pending.from as CastFrom)
    : 'hand';

  if (nextSlot >= pending.slots.length) {
    const script =
      pending.resolvedScript ||
      parseOracleScript(
        findCastable(state, pending.playerId, pending.cardId, from)?.card.oracle_text,
        findCastable(state, pending.playerId, pending.cardId, from)?.card.type_line,
        findCastable(state, pending.playerId, pending.cardId, from)?.card.mana_cost,
      );
    const merged = mergeScript(script, pending.modeIndex, pending.payKicker);
    return finalizeCast(
      { ...state, pendingCast: null },
      pending.playerId,
      pending.cardId,
      chosen,
      merged,
      from,
      undefined,
      pending.xValue || 0,
      !!pending.payKicker,
      pending.convokeTapped,
      pending.delveExiled,
      pending.improviseTapped,
      !!pending.payBuyback,
    );
  }

  return {
    ...state,
    pendingCast: { ...pending, chosen, currentSlot: nextSlot },
  };
}

function runCascade(state: GameState, playerId: string, mv: number): GameState {
  let next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId);
  if (!p) return next;
  const skipped: CardInstance[] = [];
  let found: CardInstance | null = null;
  while (p.library.length > 0) {
    const c = p.library.shift()!;
    const landOnly =
      c.card.type_line.includes('Land') && !c.card.type_line.includes('Creature');
    if (!landOnly && manaValue(c.card.mana_cost) < mv) {
      found = c;
      break;
    }
    skipped.push(c);
  }
  for (const c of skipped) {
    c.zone = 'library';
    p.library.push(c);
  }
  if (!found) return next;
  const script = parseOracleScript(found.card.oracle_text, found.card.type_line);
  // MVP: targetless → cast free onto stack; else put in hand
  if (script.targets.length > 0) {
    found.zone = 'hand';
    p.hand.push(found);
    return next;
  }
  found.zone = 'stack';
  next.stack = [
    ...next.stack,
    {
      id: nextStackId(),
      kind: 'spell',
      controller: playerId,
      name: `${found.card.name} (cascade)`,
      cardInstance: found,
      targets: {},
      script,
    },
  ];
  return next;
}

function finalizeCast(
  state: GameState,
  playerId: string,
  cardId: string,
  targets: Record<string, TargetRef>,
  scriptIn: ReturnType<typeof parseOracleScript>,
  from: CastFrom = 'hand',
  opts?: { skipWardCheck?: boolean },
  xValue = 0,
  payKicker = false,
  convokeTapped?: string[],
  delveExiled?: string[],
  improviseTapped?: string[],
  payBuyback = false,
): GameState {
  let script = scriptIn;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const card = findCastable(state, playerId, cardId, from);
  if (!card) return { ...state, pendingCast: null };

  if (from === 'overload') {
    script = overloadScript(script);
  }

  const extraCosts = parseAdditionalCosts(card.card.oracle_text);
  if (extraCosts.sacrificeCreature) {
    if (!player.battlefield.some((c) => isCreature(c))) {
      return { ...state, pendingCast: null };
    }
  }
  if (extraCosts.discard && player.hand.filter((c) => c.id !== cardId).length < extraCosts.discard) {
    return { ...state, pendingCast: null };
  }
  if (extraCosts.payLife && player.life <= extraCosts.payLife) {
    return { ...state, pendingCast: null };
  }

  let cost = spellCost(card, from, xValue);
  cost = applyGenericDiscount(
    cost,
    affinityDiscount(state, playerId, card.card) + selfCostReduction(card.card.oracle_text),
  );
  if (payKicker && script.kicker) {
    cost = withExtraGeneric(
      {
        ...cost,
        ...parseManaCost(script.kicker.cost),
        generic: cost.generic + parseManaCost(script.kicker.cost).generic,
        W: cost.W + parseManaCost(script.kicker.cost).W,
        U: cost.U + parseManaCost(script.kicker.cost).U,
        B: cost.B + parseManaCost(script.kicker.cost).B,
        R: cost.R + parseManaCost(script.kicker.cost).R,
        G: cost.G + parseManaCost(script.kicker.cost).G,
        C: cost.C + parseManaCost(script.kicker.cost).C,
        hybrids: [...(cost.hybrids || []), ...(parseManaCost(script.kicker.cost).hybrids || [])],
        phyrexian: [
          ...(cost.phyrexian || []),
          ...(parseManaCost(script.kicker.cost).phyrexian || []),
        ],
      },
      0,
    );
  }
  if (payBuyback && script.buyback) {
    const bc = parseManaCost(script.buyback.cost);
    cost = {
      ...cost,
      generic: cost.generic + bc.generic,
      W: cost.W + bc.W,
      U: cost.U + bc.U,
      B: cost.B + bc.B,
      R: cost.R + bc.R,
      G: cost.G + bc.G,
      C: cost.C + bc.C,
      hybrids: [...(cost.hybrids || []), ...(bc.hybrids || [])],
      phyrexian: [...(cost.phyrexian || []), ...(bc.phyrexian || [])],
    };
  }
  const manaStr =
    from === 'flashback'
      ? parseFlashbackCost(card.card.oracle_text) || undefined
      : from === 'jumpstart'
        ? parseJumpStartCost(card.card.oracle_text) || undefined
        : from === 'escape'
          ? parseEscape(card.card.oracle_text)?.mana
          : from === 'dash'
            ? parseDashCost(card.card.oracle_text) || undefined
            : from === 'blitz'
              ? parseBlitzCost(card.card.oracle_text) || undefined
              : from === 'spectacle'
                ? parseSpectacleCost(card.card.oracle_text) || undefined
                : card.card.mana_cost;

  const convokeIds = convokeTapped || [];
  const delveIds = delveExiled || [];
  const improviseIds = improviseTapped || [];
  const convokeCreatures = convokeIds
    .map((id) => player.battlefield.find((c) => c.id === id))
    .filter((c): c is CardInstance => !!c && isCreature(c) && !c.tapped);
  const improviseArts = improviseIds
    .map((id) => player.battlefield.find((c) => c.id === id))
    .filter(
      (c): c is CardInstance =>
        !!c && c.card.type_line.includes('Artifact') && !c.tapped,
    );
  const reduced = reduceCostWithConvokeDelve(
    cost,
    convokeCreatures,
    delveIds.length + improviseArts.length,
  );
  if (!canPayMana(player.manaPool, reduced, player.life)) {
    return { ...state, pendingCast: null };
  }
  cost = reduced;
  if (from === 'jumpstart' && player.hand.length < 1) {
    return { ...state, pendingCast: null };
  }
  if (from === 'retrace' && !player.hand.some((c) => c.card.type_line.includes('Land'))) {
    return { ...state, pendingCast: null };
  }

  // Substitute X into damage/etc. effects (amount === -1 sentinel)
  script = {
    ...script,
    effects: script.effects.map((e) =>
      e.type === 'damage' && e.amount < 0 ? { ...e, amount: xValue } : e,
    ),
  };

  if (!opts?.skipWardCheck && totalWardCost(state, playerId, targets) > 0) {
    return withWardGate(state, {
      kind: 'spell',
      playerId,
      cardId,
      from: from === 'embalm' ? 'hand' : from,
      targets,
      script,
    });
  }

  const colored = cost.W + cost.U + cost.B + cost.R + cost.G + cost.C;
  const isZero =
    manaStr === '{0}' ||
    (manaStr != null && cost.generic === 0 && colored === 0 && !cost.unpayable);

  let next = clonePlayers(state);
  next.pendingCast = null;
  const p = next.players.find((x) => x.id === playerId)!;

  // Tap convoke/improvise / exile delve before mana payment
  for (const id of convokeIds) {
    const perm = p.battlefield.find((c) => c.id === id);
    if (perm && isCreature(perm) && !perm.tapped) perm.tapped = true;
  }
  for (const id of improviseIds) {
    const perm = p.battlefield.find((c) => c.id === id);
    if (perm && perm.card.type_line.includes('Artifact') && !perm.tapped) perm.tapped = true;
  }
  for (const id of delveIds) {
    const gi = p.graveyard.findIndex((c) => c.id === id);
    if (gi < 0) continue;
    const [ex] = p.graveyard.splice(gi, 1);
    ex.zone = 'exile';
    p.exile.push(ex);
  }

  // Additional costs
  if (extraCosts.sacrificeCreature) {
    const sacIdx = p.battlefield.findIndex((c) => isCreature(c));
    if (sacIdx < 0) return { ...state, pendingCast: null };
    const [sac] = p.battlefield.splice(sacIdx, 1);
    sac.zone = 'graveyard';
    p.graveyard.push(sac);
  }
  if (extraCosts.discard) {
    let n = extraCosts.discard;
    while (n > 0 && p.hand.length > 0) {
      const hi = p.hand.findIndex((c) => c.id !== cardId);
      if (hi < 0) break;
      const [d] = p.hand.splice(hi, 1);
      d.zone = 'graveyard';
      p.graveyard.push(d);
      n -= 1;
    }
  }
  if (extraCosts.payLife) {
    p.life -= extraCosts.payLife;
    p.lostLifeThisTurn = true;
  }

  if (!isZero) {
    const paid = payManaDetailed(p.manaPool, cost, p.life);
    if (!paid) return { ...state, pendingCast: null };
    p.manaPool = paid.pool;
    if (paid.lifePaid > 0) {
      p.life -= paid.lifePaid;
      p.lostLifeThisTurn = true;
    }
  }

  if (from === 'jumpstart') {
    if (p.hand.length < 1) return { ...state, pendingCast: null };
    const [disc] = p.hand.splice(0, 1);
    disc.zone = 'graveyard';
    p.graveyard.push(disc);
  }
  if (from === 'retrace') {
    const li = p.hand.findIndex((c) => c.card.type_line.includes('Land'));
    if (li < 0) return { ...state, pendingCast: null };
    const [land] = p.hand.splice(li, 1);
    land.zone = 'graveyard';
    p.graveyard.push(land);
  }
  if (from === 'escape') {
    const esc = parseEscape(card.card.oracle_text);
    if (!esc) return { ...state, pendingCast: null };
    const others = p.graveyard.filter((c) => c.id !== cardId);
    if (others.length < esc.exile) return { ...state, pendingCast: null };
    for (let i = 0; i < esc.exile; i++) {
      const c = others[i];
      const gi = p.graveyard.findIndex((x) => x.id === c.id);
      if (gi < 0) continue;
      const [ex] = p.graveyard.splice(gi, 1);
      ex.zone = 'exile';
      p.exile.push(ex);
    }
  }

  const fromGy =
    from === 'flashback' || from === 'jumpstart' || from === 'escape' || from === 'retrace';
  // evoke/overload from hand
  const zoneList = from === 'command' ? p.commandZone : fromGy ? p.graveyard : p.hand;
  const idx = zoneList.findIndex((c) => c.id === cardId);
  if (idx === -1) return { ...state, pendingCast: null };
  const [instance] = zoneList.splice(idx, 1);
  instance.zone = 'stack';
  if (from === 'flashback') instance.castViaFlashback = true;
  if (from === 'jumpstart' || from === 'escape' || from === 'retrace') {
    instance.castViaJumpStart = true; // exile on resolve (GY alts)
  }
  if (from === 'dash') instance.dashed = true;
  if (from === 'blitz') instance.blitzed = true;
  if (from === 'evoke') instance.evoked = true;
  if (payBuyback) instance.castViaBuyback = true;
  if (hasRebound(instance.card) && from === 'hand') instance.castViaRebound = true;

  if (from === 'command' && instance.isCommander) {
    instance.commanderCastCount += 1;
  }

  const stormBefore = next.spellsCastThisTurn;
  next.spellsCastThisTurn += 1;

  const obj: StackObject = {
    id: nextStackId(),
    kind: 'spell',
    controller: playerId,
    name: instance.card.name,
    cardInstance: instance,
    targets,
    script,
  };
  next.stack = [...next.stack, obj];

  if (hasStorm(instance.card)) {
    for (let i = 0; i < stormBefore; i++) {
      next.stack = [
        ...next.stack,
        {
          id: nextStackId(),
          kind: 'spell',
          controller: playerId,
          name: `${instance.card.name} (storm)`,
          targets: { ...targets },
          script,
        },
      ];
    }
  }

  next.consecutivePasses = 0;

  if (hasCascade(instance.card)) {
    next = runCascade(next, playerId, manaValue(instance.card.mana_cost));
  }

  const isCreatureSpell = instance.card.type_line.includes('Creature');
  if (!isCreatureSpell) {
    next = fireCastNoncreatureTriggers(next, playerId);
  }
  next = fireCastAnySpellTriggers(next, playerId);

  return afterPlayerAction(next);
}

/** Pay Ward {N} generic or cancel the pending cast/activate. */
export function resolveWardChoice(state: GameState, pay: boolean): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'ward');
  if (!choice || choice.type !== 'ward') return state;
  const cleared = {
    ...state,
    pendingChoices: state.pendingChoices.filter((c) => c !== choice),
  };
  if (!pay) return cleared;

  const next = clonePlayers(cleared);
  const p = next.players.find((x) => x.id === choice.playerId);
  if (!p) return state;
  const wardMana = withExtraGeneric(parseManaCost('{0}'), choice.cost);
  // {0} parse may be unpayable empty — force generic only
  const cost = { generic: choice.cost, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, unpayable: false };
  if (choice.cost > 0) {
    if (!canPayMana(p.manaPool, cost)) return state;
    const paid = payMana(p.manaPool, cost);
    if (!paid) return state;
    p.manaPool = paid;
  }
  void wardMana;

  const r = choice.resume;
  if (r.kind === 'spell') {
    return finalizeCast(next, r.playerId, r.cardId, r.targets, r.script, r.from || 'hand', {
      skipWardCheck: true,
    });
  }
  return finalizeAbility(
    next,
    r.playerId,
    r.cardId,
    r.targets,
    r.script as NonNullable<ReturnType<typeof import('./effects').parseTapAbility>>,
    { skipWardCheck: true },
  );
}

/** Resolve top spell: apply effects, then permanent → BF / instant → GY. */
export function resolveSpellEffects(state: GameState): GameState {
  if (state.stack.length === 0) return state;
  let next = clonePlayers(state);
  const top = next.stack[next.stack.length - 1];
  next.stack = next.stack.slice(0, -1);
  next.consecutivePasses = 0;

  if (
    top.kind === 'ability' ||
    top.kind === 'trigger' ||
    (top.kind === 'spell' && !top.cardInstance)
  ) {
    // Activated / triggered abilities + storm copies
    const script = top.script;
    if (script) {
      next = applyEffects(
        next,
        top.controller,
        script.effects,
        top.targets || {},
        undefined,
        top.sourcePermanentId,
      );
    }
  } else if (top.kind === 'spell' && top.cardInstance) {
    const inst = top.cardInstance;
    const owner = next.players.find((p) => p.id === inst.owner);
    if (owner) {
      if (isPermanentSpell(inst.card.type_line)) {
        inst.zone = 'battlefield';
        inst.summoningSick = inst.card.type_line.includes('Creature');
        if (inst.dashed || inst.blitzed) {
          inst.summoningSick = false;
          if (!inst.card.keywords.includes('haste')) {
            inst.card = { ...inst.card, keywords: [...inst.card.keywords, 'haste'] };
          }
        }
        if (inst.card.type_line.includes('Planeswalker') && inst.card.loyalty) {
          const loy = parseInt(inst.card.loyalty, 10);
          if (Number.isFinite(loy)) inst.counters['loyalty'] = loy;
        }
        const modN = parseModular(inst.card.oracle_text);
        if (modN !== null) {
          inst.counters['+1/+1'] = (inst.counters['+1/+1'] || 0) + modN;
        }
        // Aura attach from cast targets
        const script = top.script || parseOracleScript(inst.card.oracle_text, inst.card.type_line);
        for (const e of script.effects) {
          if (e.type === 'attach') {
            const t = top.targets?.[e.targetKey];
            if (t?.kind === 'permanent') inst.attachedTo = t.permanentId;
          }
        }
        if (oracleEntersTapped(inst.card.oracle_text)) inst.tapped = true;
        const ewc = parseEntersWithCounters(inst.card.oracle_text);
        if (ewc) {
          inst.counters[ewc.counter] = (inst.counters[ewc.counter] || 0) + ewc.amount;
        }
        owner.battlefield.push(inst);

        // Bloodthirst (702.53) — if opponent lost life this turn
        const bt = parseBloodthirst(inst.card.oracle_text, inst.card.keywords);
        if (bt != null && bt > 0) {
          const oppLost = next.players.some(
            (p) => p.id !== top.controller && p.lostLifeThisTurn,
          );
          if (oppLost) {
            inst.counters['+1/+1'] = (inst.counters['+1/+1'] || 0) + bt;
          }
        }

        // Devour N (702.81) — MVP: sac all other creatures you control
        const devourN = parseDevour(inst.card.oracle_text, inst.card.keywords);
        if (devourN != null && devourN > 0) {
          const others = owner.battlefield.filter(
            (c) => c.id !== inst.id && isCreature(c),
          );
          let eaten = 0;
          for (const o of others) {
            next = moveCard(next, o.id, 'graveyard').state;
            eaten += 1;
          }
          if (eaten > 0) {
            const f = findCard(next, inst.id);
            const perm =
              f?.zone === 'battlefield'
                ? f.player.battlefield.find((c) => c.id === inst.id)
                : undefined;
            if (perm) {
              perm.counters['+1/+1'] =
                (perm.counters['+1/+1'] || 0) + eaten * devourN;
            }
          }
        }

        // Saga (714) — enters with a lore counter, then chapter I
        if (isSaga(inst.card)) {
          inst.counters['lore'] = (inst.counters['lore'] || 0) + 1;
          next = resolveSagaChapter(next, top.controller, inst.id, 1);
        }

        next = fireEtbTriggers(next, top.controller, inst);

        // Backup N (702.164) — put N +1/+1 on another creature
        const bak = parseBackup(inst.card.oracle_text, inst.card.keywords);
        if (bak != null && bak > 0) {
          next = applyEffects(
            next,
            top.controller,
            [{ type: 'backup', amount: bak }],
            {},
            undefined,
            inst.id,
          );
        }

        // Fabricate N (702.122)
        const fab = parseFabricate(inst.card.oracle_text, inst.card.keywords);
        if (fab != null && fab > 0) {
          next = applyEffects(
            next,
            top.controller,
            [{ type: 'fabricate', amount: fab }],
            {},
            undefined,
            inst.id,
          );
        }

        // Evolve — other evolve creatures may get +1/+1
        if (isCreature(inst)) {
          const n = clonePlayers(next);
          const ctrl = n.players.find((x) => x.id === top.controller);
          if (ctrl) {
            const np = effectivePower(inst, n);
            const nt = inst.card.toughness ? parseInt(inst.card.toughness, 10) : 0;
            for (const evo of ctrl.battlefield) {
              if (evo.id === inst.id || !hasEvolve(evo.card) || !isCreature(evo)) continue;
              const ep = effectivePower(evo, n);
              const et = evo.card.toughness ? parseInt(evo.card.toughness, 10) : 0;
              const plus = evo.counters['+1/+1'] || 0;
              if (np > ep + plus || nt > et + plus) {
                evo.counters['+1/+1'] = plus + 1;
              }
            }
          }
          next = n;
        }
        if (hasRiot(inst.card) && inst.card.type_line.includes('Creature')) {
          next = {
            ...next,
            pendingChoices: [
              ...next.pendingChoices,
              { type: 'riot', playerId: top.controller, permanentId: inst.id },
            ],
          };
        }
        if (hasAscend(inst.card)) {
          next = applyEffects(next, top.controller, [{ type: 'ascend' }], {});
        }
      } else {
        const script = top.script || parseOracleScript(inst.card.oracle_text, inst.card.type_line);
        const targets = top.targets || {};
        next = applyEffects(next, top.controller, script.effects, targets);
        const ownerAfter = next.players.find((p) => p.id === inst.owner);
        if (inst.castViaBuyback) {
          inst.zone = 'hand';
          inst.castViaBuyback = false;
          ownerAfter?.hand.push(inst);
        } else if (inst.castViaRebound) {
          inst.zone = 'exile';
          inst.castViaRebound = false;
          ownerAfter?.exile.push(inst);
          // Rebound: cast again (free) at beginning of next upkeep (702.87)
          next = addDelayedTrigger(next, {
            controllerId: top.controller,
            name: `${inst.card.name} (rebound)`,
            when: 'upkeep',
            script,
            targets: { ...targets },
          });
        } else if (inst.castViaFlashback || inst.castViaJumpStart) {
          inst.zone = 'exile';
          inst.castViaFlashback = false;
          inst.castViaJumpStart = false;
          ownerAfter?.exile.push(inst);
        } else {
          inst.zone = 'graveyard';
          ownerAfter?.graveyard.push(inst);
        }
      }
    }
  }

  return givePriority(next, next.activePlayerIndex);
}

registerStackResolver(resolveSpellEffects);
