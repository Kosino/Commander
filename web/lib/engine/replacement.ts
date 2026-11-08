/**
 * Replacement / prevention — CR 614 / 615 MVP.
 * Prevention shields, fog, GY→exile, draw doubling, damage redirect.
 */
import {
  GameState,
  CardInstance,
  PreventionShield,
  RedirectShield,
  ManaColor,
} from './types';
import { TargetRef } from './effects';
import { clonePlayers, findCard } from './zones';

export type { PreventionShield, RedirectShield };

let _shieldSeq = 0;
export function nextShieldId(): string {
  _shieldSeq += 1;
  return `prev_${_shieldSeq}`;
}

let _redirSeq = 0;
export function nextRedirectId(): string {
  _redirSeq += 1;
  return `redir_${_redirSeq}`;
}

/** Add a "prevent next N damage" shield. */
export function addPreventionShield(
  state: GameState,
  shield: Omit<PreventionShield, 'id'> & { id?: string },
): GameState {
  const next = clonePlayers(state);
  next.preventionShields = [
    ...next.preventionShields,
    { ...shield, id: shield.id || nextShieldId() },
  ];
  return next;
}

export function addRedirectShield(
  state: GameState,
  shield: Omit<RedirectShield, 'id'> & { id?: string },
): GameState {
  const next = clonePlayers(state);
  next.redirectShields = [
    ...(next.redirectShields || []),
    { ...shield, id: shield.id || nextRedirectId() },
  ];
  return next;
}

/** Rest in Peace / Leyline of the Void style continuous replacement. */
export function graveyardBecomesExile(state: GameState): boolean {
  for (const p of state.players) {
    for (const perm of p.battlefield) {
      const t = perm.card.oracle_text || '';
      if (
        /if a card would be put into (?:a |any )?graveyard(?: from anywhere)?,?\s*exile (?:it|them) instead/i.test(
          t,
        ) ||
        /if a card or token would be put into a graveyard from anywhere,?\s*exile it instead/i.test(t)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** True if permanent should exile instead of going to GY (replacement). */
export function diesToExile(perm: CardInstance): boolean {
  if (perm.unearthed) return true;
  const t = (perm.card.oracle_text || '').toLowerCase();
  return (
    /\bif\s+.+would\s+die,?\s+exile\s+(?:it|them)\s+instead/i.test(t) ||
    /\bexile\s+.+\s+instead\s+of\s+putting\s+.+graveyard/i.test(t)
  );
}

/** Resolve zone for a permanent leaving BF via "death". */
export function deathDestination(
  state: GameState,
  permanentId: string,
): 'graveyard' | 'exile' {
  if (graveyardBecomesExile(state)) return 'exile';
  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield') return 'graveyard';
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm) return 'graveyard';
  if (diesToExile(perm)) return 'exile';
  return 'graveyard';
}

/** Thought Reflection-style: each draw becomes two. */
export function drawReplacementMultiplier(state: GameState, playerId: string): number {
  let mult = 1;
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 1;
  const texts: string[] = [];
  for (const perm of p.battlefield) texts.push(perm.card.oracle_text || '');
  for (const e of p.emblems || []) texts.push(e.oracle_text || '');
  for (const t of texts) {
    if (/if you would draw a card,?\s*draw two cards instead/i.test(t)) {
      mult *= 2;
    }
  }
  return mult;
}

export function applyDrawAmount(state: GameState, playerId: string, amount: number): number {
  if (amount <= 0) return 0;
  return amount * drawReplacementMultiplier(state, playerId);
}

function applyRedirect(
  state: GameState,
  target: TargetRef,
  amount: number,
): { state: GameState; target: TargetRef; amount: number } {
  if (amount <= 0) return { state, target, amount };
  const shields = state.redirectShields || [];
  if (!shields.length) return { state, target, amount };

  const tid = target.kind === 'player' ? target.playerId : target.permanentId;
  const kind = target.kind === 'player' ? 'player' : 'permanent';
  const idx = shields.findIndex((s) => s.fromKind === kind && s.fromId === tid);
  if (idx < 0) return { state, target, amount };

  const next = clonePlayers(state);
  const used = (next.redirectShields || [])[idx];
  if (!used) return { state, target, amount };
  const use = Math.min(used.amount, amount);
  const left = used.amount - use;
  const rest = (next.redirectShields || []).filter((_, i) => i !== idx);
  next.redirectShields = left > 0 ? [...rest, { ...used, amount: left }] : rest;
  const cur: TargetRef =
    used.toKind === 'player'
      ? { kind: 'player', playerId: used.toId }
      : { kind: 'permanent', permanentId: used.toId };
  return { state: next, target: cur, amount };
}

/**
 * Apply damage through redirect then prevention.
 * Returns { state, dealt, target } where dealt is damage that actually happens
 * and target is the (possibly redirected) destination.
 */
export function applyDamageWithPrevention(
  state: GameState,
  target: TargetRef,
  amount: number,
): { state: GameState; dealt: number; target: TargetRef } {
  if (amount <= 0) return { state, dealt: 0, target };
  if (state.preventAllDamageThisTurn) {
    return { state, dealt: 0, target };
  }

  const redirected = applyRedirect(state, target, amount);
  let next = redirected.state;
  target = redirected.target;
  let remaining = redirected.amount;

  const tid = target.kind === 'player' ? target.playerId : target.permanentId;
  const kind = target.kind === 'player' ? 'player' : 'permanent';

  next = clonePlayers(next);
  const kept: PreventionShield[] = [];
  for (const s of next.preventionShields) {
    if (remaining <= 0 || s.kind !== kind || s.targetId !== tid) {
      kept.push(s);
      continue;
    }
    const use = Math.min(s.amount, remaining);
    remaining -= use;
    const left = s.amount - use;
    if (left > 0) kept.push({ ...s, amount: left });
  }
  next.preventionShields = kept;
  return { state: next, dealt: remaining, target };
}

/** Devotion to a color (700.5) — mana symbols of that color among permanents you control. */
export function devotionTo(
  state: GameState,
  playerId: string,
  color: ManaColor,
): number {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  let n = 0;
  const re = new RegExp(`\\{${color}\\}`, 'gi');
  for (const perm of p.battlefield) {
    const cost = perm.card.mana_cost || '';
    const m = cost.match(re);
    if (m) n += m.length;
  }
  return n;
}

/** Domain (607) — number of basic land types among lands you control. */
export function domainCount(state: GameState, playerId: string): number {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  const types = new Set<string>();
  for (const perm of p.battlefield) {
    if (!/land/i.test(perm.card.type_line)) continue;
    const tl = perm.card.type_line;
    if (/\bPlains\b/i.test(tl) || /\bPlains\b/i.test(perm.card.name)) types.add('Plains');
    if (/\bIsland\b/i.test(tl) || /\bIsland\b/i.test(perm.card.name)) types.add('Island');
    if (/\bSwamp\b/i.test(tl) || /\bSwamp\b/i.test(perm.card.name)) types.add('Swamp');
    if (/\bMountain\b/i.test(tl) || /\bMountain\b/i.test(perm.card.name)) types.add('Mountain');
    if (/\bForest\b/i.test(tl) || /\bForest\b/i.test(perm.card.name)) types.add('Forest');
    // Duals via type line "Land — Plains Island"
    for (const basic of ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) {
      if (new RegExp(`\\b${basic}\\b`, 'i').test(tl)) types.add(basic);
    }
  }
  return types.size;
}
