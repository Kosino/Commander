/**
 * Day and Night — CR 732 + daybound/nightbound (702.145).
 */
import { hasDaybound, hasNightbound } from './effects';
import { transformPermanent } from './sba';
import { GameState } from './types';
import { clonePlayers } from './zones';

export function isDay(state: GameState): boolean {
  return state.dayNight === 'day';
}

export function isNight(state: GameState): boolean {
  return state.dayNight === 'night';
}

function permanentHasDayboundFace(c: {
  card: { oracle_text?: string; keywords?: string[]; other_face?: { oracle_text?: string; keywords?: string[] } };
}): boolean {
  return hasDaybound(c.card) || !!(c.card.other_face && hasDaybound(c.card.other_face));
}

function permanentHasNightboundFace(c: {
  card: { oracle_text?: string; keywords?: string[]; other_face?: { oracle_text?: string; keywords?: string[] } };
}): boolean {
  return hasNightbound(c.card) || !!(c.card.other_face && hasNightbound(c.card.other_face));
}

/** 702.145d / 702.145g — if neither, daybound → day; nightbound (no daybound) → night. */
export function ensureDayNightFromPermanents(state: GameState): GameState {
  if (state.dayNight === 'day' || state.dayNight === 'night') return state;
  let hasDb = false;
  let hasNb = false;
  for (const p of state.players) {
    for (const c of p.battlefield) {
      if (permanentHasDayboundFace(c)) hasDb = true;
      if (permanentHasNightboundFace(c)) hasNb = true;
    }
  }
  if (hasDb) return becomeDay(state);
  if (hasNb) return becomeNight(state);
  return state;
}

export function becomeDay(state: GameState): GameState {
  if (state.dayNight === 'day') return syncDayboundNightboundFaces(state);
  const next: GameState = { ...state, dayNight: 'day' };
  return syncDayboundNightboundFaces(next);
}

export function becomeNight(state: GameState): GameState {
  if (state.dayNight === 'night') return syncDayboundNightboundFaces(state);
  const next: GameState = { ...state, dayNight: 'night' };
  return syncDayboundNightboundFaces(next);
}

/**
 * Align DFC faces with day/night:
 * night → show nightbound face; day → show daybound face.
 */
export function syncDayboundNightboundFaces(state: GameState): GameState {
  if (state.dayNight !== 'day' && state.dayNight !== 'night') return state;
  let next = state;
  const flip: string[] = [];
  for (const p of next.players) {
    for (const c of p.battlefield) {
      if (!c.card.other_face) continue;
      if (state.dayNight === 'night') {
        // Want nightbound face up: if current face is daybound, transform
        if (hasDaybound(c.card) && !hasNightbound(c.card)) flip.push(c.id);
      } else {
        // Want daybound face up: if current face is nightbound, transform
        if (hasNightbound(c.card) && !hasDaybound(c.card)) flip.push(c.id);
      }
    }
  }
  for (const id of flip) next = transformPermanent(next, id);
  return next;
}

/**
 * Untap step — 732.2: previous AP cast 0 while day → night;
 * previous AP cast 2+ while night → day.
 */
export function checkDayNightAtUntap(state: GameState): GameState {
  const prev = state.spellsCastPreviousTurn ?? 0;
  if (state.dayNight === 'day' && prev === 0) {
    return becomeNight(state);
  }
  if (state.dayNight === 'night' && prev >= 2) {
    return becomeDay(state);
  }
  return ensureDayNightFromPermanents(state);
}

/** Enter BF with daybound while night → enter transformed; if neither → become day. */
export function applyDayboundEtbFace(
  state: GameState,
  permanentId: string,
): GameState {
  let next = clonePlayers(state);
  const perm = next.players
    .flatMap((p) => p.battlefield)
    .find((c) => c.id === permanentId);
  if (!perm || !hasDaybound(perm.card) || !perm.card.other_face) {
    return ensureDayNightFromPermanents(state);
  }
  if (next.dayNight == null) {
    next = becomeDay(next);
  } else if (next.dayNight === 'night') {
    next = transformPermanent(next, permanentId);
  }
  return next;
}
