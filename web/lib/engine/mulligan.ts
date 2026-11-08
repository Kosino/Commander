/**
 * London mulligan (CR 103.4 / Commander 903.4) — MVP.
 * Each player: decide keep / mulligan; on keep after N mulligans, put N on bottom.
 */
import { GameState } from './types';
import { clonePlayers } from './zones';

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Opening mulligan choices for every alive player. */
export function beginMulligans(state: GameState): GameState {
  const next = clonePlayers(state);
  next.pendingChoices = [
    ...next.pendingChoices.filter((c) => c.type !== 'mulligan'),
    ...next.players
      .filter((p) => !p.hasLost)
      .map((p) => ({
        type: 'mulligan' as const,
        playerId: p.id,
        mulligansTaken: p.mulligansTaken || 0,
        phase: 'decide' as const,
      })),
  ];
  return next;
}

/** Keep current hand; if mulligansTaken > 0 → bottom phase, else done for this player. */
export function resolveMulliganKeep(state: GameState, playerId: string): GameState {
  const choice = state.pendingChoices.find(
    (c) => c.type === 'mulligan' && c.playerId === playerId && c.phase === 'decide',
  );
  if (!choice || choice.type !== 'mulligan') return state;

  const taken = choice.mulligansTaken;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);

  if (taken > 0) {
    next.pendingChoices.push({
      type: 'mulligan',
      playerId,
      mulligansTaken: taken,
      phase: 'bottom',
    });
  }
  return next;
}

/** Take another mulligan: shuffle hand into library, draw 7. */
export function resolveMulliganTake(state: GameState, playerId: string): GameState {
  const choice = state.pendingChoices.find(
    (c) => c.type === 'mulligan' && c.playerId === playerId && c.phase === 'decide',
  );
  if (!choice || choice.type !== 'mulligan') return state;

  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId);
  if (!p) return state;

  for (const c of p.hand) {
    c.zone = 'library';
    p.library.push(c);
  }
  p.hand = [];
  shuffleInPlace(p.library);
  const drawn = p.library.splice(0, Math.min(7, p.library.length));
  for (const c of drawn) {
    c.zone = 'hand';
    p.hand.push(c);
  }
  p.mulligansTaken = (p.mulligansTaken || 0) + 1;

  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  next.pendingChoices.push({
    type: 'mulligan',
    playerId,
    mulligansTaken: p.mulligansTaken,
    phase: 'decide',
  });
  return next;
}

/** After keep with N mulligans — put selected hand cards on bottom (order preserved). */
export function resolveMulliganBottom(state: GameState, playerId: string, bottomIds: string[]): GameState {
  const choice = state.pendingChoices.find(
    (c) => c.type === 'mulligan' && c.playerId === playerId && c.phase === 'bottom',
  );
  if (!choice || choice.type !== 'mulligan') return state;

  const need = choice.mulligansTaken;
  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId);
  if (!p) return state;

  const pick = bottomIds.slice(0, need);
  const moving: typeof p.hand = [];
  for (const id of pick) {
    const idx = p.hand.findIndex((c) => c.id === id);
    if (idx < 0) continue;
    const [c] = p.hand.splice(idx, 1);
    c.zone = 'library';
    moving.push(c);
  }
  // If not enough selected, auto bottom from end of hand
  while (moving.length < need && p.hand.length > 0) {
    const c = p.hand.pop()!;
    c.zone = 'library';
    moving.push(c);
  }
  p.library.push(...moving);

  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  return next;
}

export function hasOpenMulligans(state: GameState): boolean {
  return state.pendingChoices.some((c) => c.type === 'mulligan');
}
