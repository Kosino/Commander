import { TargetFilter, TargetRef } from './effects';
import { hasKeywordState } from './continuous';
import { protectsFromColors } from './protection';
import { GameState, isCreature, ManaColor } from './types';

function canBeTargeted(
  state: GameState,
  permanentId: string,
  targetingPlayerId?: string,
  sourceColors?: ManaColor[],
): boolean {
  for (const p of state.players) {
    const perm = p.battlefield.find((c) => c.id === permanentId);
    if (!perm) continue;
    if (hasKeywordState(perm, 'shroud', state)) return false;
    if (
      hasKeywordState(perm, 'hexproof', state) &&
      targetingPlayerId &&
      targetingPlayerId !== perm.controller
    ) {
      return false;
    }
    if (sourceColors && sourceColors.length && protectsFromColors(perm, sourceColors)) {
      return false;
    }
    return true;
  }
  return false;
}

/** Legal targets for a filter — Arena highlights these. */
export function listLegalTargets(
  state: GameState,
  filter: TargetFilter,
  targetingPlayerId?: string,
  sourceColors?: ManaColor[],
): TargetRef[] {
  const out: TargetRef[] = [];
  const caster = targetingPlayerId || state.pendingCast?.playerId;
  const colors = sourceColors ?? state.pendingCast?.sourceColors;

  if (filter === 'player' || filter === 'anyTarget') {
    for (const p of state.players) {
      if (!p.hasLost) out.push({ kind: 'player', playerId: p.id });
    }
  }

  if (
    filter === 'creature' ||
    filter === 'creatureYouControl' ||
    filter === 'permanent' ||
    filter === 'anyTarget'
  ) {
    for (const p of state.players) {
      if (p.hasLost) continue;
      for (const perm of p.battlefield) {
        if (
          (filter === 'creature' || filter === 'creatureYouControl') &&
          !isCreature(perm)
        ) {
          continue;
        }
        if (filter === 'creatureYouControl' && caster && perm.controller !== caster) continue;
        if (!canBeTargeted(state, perm.id, caster, colors)) continue;
        out.push({ kind: 'permanent', permanentId: perm.id });
      }
    }
  }

  if (filter === 'spell') {
    for (const obj of state.stack) {
      if (obj.kind === 'spell') out.push({ kind: 'stack', stackId: obj.id });
    }
  }

  if (filter === 'creatureCardInYourGy' && caster) {
    const p = state.players.find((x) => x.id === caster);
    if (p) {
      for (const c of p.graveyard) {
        if (isCreature(c)) out.push({ kind: 'permanent', permanentId: c.id });
      }
    }
  }

  if (filter === 'cardInAnyGy') {
    for (const p of state.players) {
      for (const c of p.graveyard) {
        out.push({ kind: 'permanent', permanentId: c.id });
      }
    }
  }

  return out;
}

export function isLegalTarget(
  state: GameState,
  filter: TargetFilter,
  target: TargetRef,
  targetingPlayerId?: string,
  sourceColors?: ManaColor[],
): boolean {
  return listLegalTargets(state, filter, targetingPlayerId, sourceColors).some((t) => {
    if (t.kind !== target.kind) return false;
    if (t.kind === 'player' && target.kind === 'player') return t.playerId === target.playerId;
    if (t.kind === 'permanent' && target.kind === 'permanent') {
      return t.permanentId === target.permanentId;
    }
    if (t.kind === 'stack' && target.kind === 'stack') return t.stackId === target.stackId;
    return false;
  });
}
