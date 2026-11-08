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
  if ((perm.counters['finality'] || 0) > 0) return 'exile';
  if (diesToExile(perm)) return 'exile';
  return 'graveyard';
}

/** Consume one shield counter; returns whether it blocked destroy (122.1c). */
export function tryConsumeShieldCounter(
  state: GameState,
  permanentId: string,
): { state: GameState; consumed: boolean } {
  const next = clonePlayers(state);
  const found = findCard(next, permanentId);
  if (!found || found.zone !== 'battlefield') return { state, consumed: false };
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm || (perm.counters['shield'] || 0) <= 0) return { state, consumed: false };
  perm.counters['shield'] = (perm.counters['shield'] || 0) - 1;
  if (perm.counters['shield'] <= 0) delete perm.counters['shield'];
  return { state: next, consumed: true };
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

/** Life-gain replacements (119.10) — can't gain / double. */
export function applyLifeGain(
  state: GameState,
  playerId: string,
  amount: number,
): number {
  if (amount <= 0) return 0;
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  const texts: string[] = [];
  for (const perm of p.battlefield) texts.push(perm.card.oracle_text || '');
  for (const e of p.emblems || []) texts.push(e.oracle_text || '');
  for (const t of texts) {
    if (/you can'?t gain life/i.test(t) || /players can'?t gain life/i.test(t)) {
      return 0;
    }
  }
  let out = amount;
  for (const t of texts) {
    if (
      /if you would gain life,?\s*you gain twice that much(?: life)? instead/i.test(t)
    ) {
      out *= 2;
    }
  }
  return out;
}

/**
 * Damage amount modifiers from source controller (614) before prevention.
 * "plus N" / "twice that much".
 */
export function applyDamageAmountReplacement(
  state: GameState,
  sourceControllerId: string | undefined,
  amount: number,
): number {
  if (amount <= 0 || !sourceControllerId) return amount;
  const p = state.players.find((x) => x.id === sourceControllerId);
  if (!p) return amount;
  let out = amount;
  for (const perm of p.battlefield) {
    const t = perm.card.oracle_text || '';
    const plus = t.match(
      /if a source you control would deal damage to (?:a permanent or player|an? (?:opponent|player|creature))[^,]*,?\s*it deals that much damage plus (\d+) instead/i,
    );
    if (plus) out += parseInt(plus[1], 10);
    if (
      /if a source you control would deal damage to (?:a permanent or player|an? (?:opponent|player|creature))[^,]*,?\s*it deals twice that much damage instead/i.test(
        t,
      )
    ) {
      out *= 2;
    }
  }
  for (const e of p.emblems || []) {
    const t = e.oracle_text || '';
    if (
      /if a source you control would deal damage[^,]*,?\s*it deals twice that much damage instead/i.test(
        t,
      )
    ) {
      out *= 2;
    }
  }
  return out;
}

function applyRedirect(
  state: GameState,
  target: TargetRef,
  amount: number,
): { state: GameState; target: TargetRef; amount: number } {
  if (amount <= 0) return { state, target, amount };
  const shields = state.redirectShields || [];
  if (!shields.length) return { state, target, amount };

  if (target.kind === 'stack') return { state, target, amount };
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
 * Apply damage through amount replacement, redirect, then prevention.
 * Returns { state, dealt, target } where dealt is damage that actually happens
 * and target is the (possibly redirected) destination.
 */
export function applyDamageWithPrevention(
  state: GameState,
  target: TargetRef,
  amount: number,
  opts?: { sourceControllerId?: string },
): { state: GameState; dealt: number; target: TargetRef } {
  if (amount <= 0) return { state, dealt: 0, target };
  if (state.preventAllDamageThisTurn) {
    return { state, dealt: 0, target };
  }

  amount = applyDamageAmountReplacement(state, opts?.sourceControllerId, amount);

  const redirected = applyRedirect(state, target, amount);
  let next = redirected.state;
  target = redirected.target;
  let remaining = redirected.amount;
  if (target.kind === 'stack') return { state: next, dealt: 0, target };

  // Shield counter on permanent (122.1c) — prevent all damage, remove one counter
  if (target.kind === 'permanent' && remaining > 0) {
    const found = findCard(next, target.permanentId);
    const perm =
      found?.zone === 'battlefield'
        ? found.player.battlefield.find((c) => c.id === target.permanentId)
        : undefined;
    if (perm && (perm.counters['shield'] || 0) > 0) {
      next = clonePlayers(next);
      const p2 = findCard(next, target.permanentId);
      const pr =
        p2?.zone === 'battlefield'
          ? p2.player.battlefield.find((c) => c.id === target.permanentId)
          : undefined;
      if (pr) {
        pr.counters['shield'] = (pr.counters['shield'] || 0) - 1;
        if (pr.counters['shield'] <= 0) delete pr.counters['shield'];
      }
      return { state: next, dealt: 0, target };
    }
  }

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
