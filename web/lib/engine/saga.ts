/**
 * Sagas — CR 714 MVP (lore counters + chapter abilities).
 */
import { isSaga, parseSagaChapters } from './effects';
import { GameState } from './types';
import { queueTrigger } from './triggers';
import { clonePlayers, findCard, moveCard } from './zones';

/** Put chapter N ability on stack; sacrifice saga if final chapter (714.4 MVP). */
export function resolveSagaChapter(
  state: GameState,
  controllerId: string,
  sagaId: string,
  chapter: number,
): GameState {
  const found = findCard(state, sagaId);
  if (!found || found.zone !== 'battlefield') return state;
  const saga = found.player.battlefield.find((c) => c.id === sagaId);
  if (!saga) return state;
  const chapters = parseSagaChapters(saga.card.oracle_text);
  const ch = chapters.find((c) => c.chapter === chapter);
  let next = state;
  if (ch && ch.effects.length) {
    next = queueTrigger(next, {
      controllerId,
      name: `${saga.card.name} — ${chapter}`,
      sourcePermanentId: sagaId,
      script: { targets: [], effects: ch.effects },
    });
  }
  const max = chapters.reduce((m, c) => Math.max(m, c.chapter), 0);
  if (max > 0 && chapter >= max) {
    next = moveCard(next, sagaId, 'graveyard').state;
  }
  return next;
}

/** Precombat main — +1 lore on each Saga you control (714.3b). */
export function advanceSagasForActivePlayer(state: GameState): GameState {
  const ap = state.players[state.activePlayerIndex];
  if (!ap || ap.hasLost) return state;
  let next = state;
  const sagas = [...ap.battlefield.filter((c) => isSaga(c.card))];
  for (const saga of sagas) {
    const n = clonePlayers(next);
    const p = n.players.find((x) => x.id === ap.id);
    const perm = p?.battlefield.find((c) => c.id === saga.id);
    if (!perm) continue;
    const lore = (perm.counters['lore'] || 0) + 1;
    perm.counters['lore'] = lore;
    next = resolveSagaChapter(n, ap.id, saga.id, lore);
  }
  return next;
}
