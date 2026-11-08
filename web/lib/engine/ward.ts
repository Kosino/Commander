/**
 * Ward — MVP: before spell/ability goes on stack, caster may pay total Ward cost
 * or the cast/activate is cancelled (702.21 simplified, no separate trigger on stack).
 */
import { getWardCost, TargetRef } from './effects';
import { GameState, WardResume } from './types';
import { findCard } from './zones';

export function totalWardCost(
  state: GameState,
  casterId: string,
  targets: Record<string, TargetRef>,
): number {
  let total = 0;
  for (const t of Object.values(targets)) {
    if (t.kind !== 'permanent') continue;
    const found = findCard(state, t.permanentId);
    if (!found || found.zone !== 'battlefield') continue;
    if (found.card.controller === casterId) continue; // only opponents' permanents
    total += getWardCost(found.card.card);
  }
  return total;
}

export function withWardGate(
  state: GameState,
  resume: WardResume,
): GameState {
  const cost = totalWardCost(state, resume.playerId, resume.targets);
  if (cost <= 0) return state; // caller puts on stack normally

  return {
    ...state,
    pendingCast: null,
    pendingChoices: [
      ...state.pendingChoices,
      { type: 'ward', playerId: resume.playerId, cost, resume },
    ],
    consecutivePasses: 0,
  };
}
