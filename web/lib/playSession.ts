import type { Card } from './deck';
import type { StoredDeck } from './engine/fromDeck';

const KEY = 'mtg-client-play-deck';

export function savePlayDeck(deck: StoredDeck): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(deck));
}

export function loadPlayDeck(): StoredDeck | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredDeck;
    if (!data?.commander || !Array.isArray(data.cards)) return null;
    return {
      ...data,
      partner: data.partner ?? null,
      companion: data.companion ?? null,
    };
  } catch {
    return null;
  }
}

export function clearPlayDeck(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}

export function canStartPlay(commander: Card | null, deck: Card[]): boolean {
  return !!commander && deck.length > 0;
}
