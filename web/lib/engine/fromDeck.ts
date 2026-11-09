import type { Card } from '../deck';
import { getDemoHostDeck, getDemoOpponentDeck } from './demo';
import { createInitialGameState } from './setup';
import { CardData, GameState, ManaColor } from './types';

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

function asColors(ids?: string[]): ManaColor[] {
  if (!ids) return [];
  return ids.filter((c): c is ManaColor => (COLORS as string[]).includes(c));
}

/** Deck-builder Card → engine CardData. */
export function cardToCardData(card: Card): CardData {
  const identity = asColors(card.color_identity);
  return {
    oracle_id: card.oracle_id || `local-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: card.name,
    mana_cost: card.mana_cost,
    type_line: card.type_line || '',
    oracle_text: card.oracle_text,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    defense: card.defense,
    colors: identity.filter((c) => c !== 'C'),
    color_identity: identity,
    keywords: card.keywords || [],
    image_uri: card.image_uri,
    other_face: card.other_face ? cardToCardData(card.other_face) : undefined,
  };
}

export type StoredDeck = {
  name?: string;
  commander: Card;
  partner?: Card | null;
  companion?: Card | null;
  cards: Card[];
};

function toEngineDeck(deck: StoredDeck): {
  commander: CardData;
  partner?: CardData;
  companion?: CardData;
  cards: CardData[];
} {
  const commander = cardToCardData(deck.commander);
  const partner = deck.partner ? cardToCardData(deck.partner) : undefined;
  const companion = deck.companion ? cardToCardData(deck.companion) : undefined;
  const cards = deck.cards.map(cardToCardData);
  const ids = new Set(cards.map((c) => c.oracle_id));
  if (!ids.has(commander.oracle_id)) cards.unshift(commander);
  if (partner && !ids.has(partner.oracle_id)) cards.unshift(partner);
  return { commander, partner, companion, cards };
}

/** Player deck vs demo opponent. */
export function createGameFromPlayerDeck(deck: StoredDeck, playerName = 'Honza'): GameState {
  const { commander, partner, companion, cards } = toEngineDeck(deck);
  return createInitialGameState([
    { playerId: 'p1', playerName, commander, partner, companion, cards },
    getDemoOpponentDeck(),
  ]);
}

function seatDeck(
  seat: string,
  entry: { deck: StoredDeck | 'demo'; name: string },
  demo: 'host' | 'opp',
) {
  const host = getDemoHostDeck();
  const opp = getDemoOpponentDeck();
  const base = demo === 'host' ? host : opp;
  if (entry.deck === 'demo') {
    return {
      playerId: seat,
      playerName: entry.name,
      commander: base.commander,
      cards: base.cards,
    };
  }
  return {
    playerId: seat,
    playerName: entry.name,
    ...toEngineDeck(entry.deck),
  };
}

/** Online 2P: custom deck nebo demo na každé straně. */
export function createGameFromTwoDecks(
  p1: { deck: StoredDeck | 'demo'; name: string },
  p2: { deck: StoredDeck | 'demo'; name: string },
): GameState {
  return createGameFromSeats([
    { seat: 'p1', ...p1 },
    { seat: 'p2', ...p2 },
  ]);
}

/** Online 2–4P EDH seats. */
export function createGameFromSeats(
  seats: { seat: string; deck: StoredDeck | 'demo'; name: string }[],
): GameState {
  if (seats.length < 2) {
    throw new Error('Need at least 2 players');
  }
  const players = seats.map((s, i) => {
    if (s.deck !== 'demo' && typeof s.deck === 'object') {
      const d = toEngineDeck(s.deck);
      return {
        playerId: s.seat,
        playerName: s.name,
        commander: d.commander,
        partner: d.partner,
        companion: d.companion,
        cards: d.cards,
      };
    }
    return seatDeck(s.seat, s, i === 0 ? 'host' : 'opp');
  });
  return createInitialGameState(players);
}

export function isValidStoredDeck(raw: unknown): raw is StoredDeck {
  if (!raw || typeof raw !== 'object') return false;
  const d = raw as StoredDeck;
  if (!d.commander || typeof d.commander.name !== 'string') return false;
  if (!Array.isArray(d.cards) || d.cards.length === 0) return false;
  return d.cards.every((c) => c && typeof c.name === 'string');
}
