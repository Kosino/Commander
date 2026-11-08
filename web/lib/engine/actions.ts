import { oracleEntersTapped } from './effects';
import { GameState } from './types';
import { afterPlayerAction } from './priority';
import { fireEtbTriggers, fireLandfall } from './triggers';
import { clonePlayers, findCard, moveCard } from './zones';

/** Special action: play a land (CR 305) — once per turn. */
export function playLand(state: GameState, playerId: string, cardId: string): GameState {
  if (state.pendingCast) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasLost) return state;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;

  const card = player.hand.find((c) => c.id === cardId);
  if (!card || !card.card.type_line.includes('Land')) return state;

  if (state.phase !== 'main1' && state.phase !== 'main2') return state;
  if (state.stack.length > 0) return state;
  if (player.landsPlayedThisTurn >= 1) return state;

  const moved = moveCard(state, cardId, 'battlefield');
  if (!moved.card) return state;
  let next = clonePlayers(moved.state);
  const p = next.players.find((x) => x.id === playerId);
  if (p) p.landsPlayedThisTurn += 1;
  const onBf = findCard(next, cardId);
  if (onBf?.zone === 'battlefield') {
    const perm = onBf.player.battlefield.find((c) => c.id === cardId);
    if (perm && oracleEntersTapped(perm.card.oracle_text)) perm.tapped = true;
    if (perm) next = fireEtbTriggers(next, playerId, perm);
  }
  next = fireLandfall(next, playerId);
  return afterPlayerAction(next);
}
