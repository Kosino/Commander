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
    colors: identity.filter((c) => c !== 'C'),
    color_identity: identity,
    keywords: [],
  };
}

export type StoredDeck = {
  name?: string;
  commander: Card;
  cards: Card[];
};

function toEngineDeck(deck: StoredDeck): { commander: CardData; cards: CardData[] } {
  const commander = cardToCardData(deck.commander);
  const cards = deck.cards.map(cardToCardData);
  if (!cards.some((c) => c.oracle_id === commander.oracle_id)) {
    cards.unshift(commander);
  }
  return { commander, cards };
}

/** Player deck vs demo opponent. */
export function createGameFromPlayerDeck(deck: StoredDeck, playerName = 'Honza'): GameState {
  const { commander, cards } = toEngineDeck(deck);
  return createInitialGameState([
    { playerId: 'p1', playerName, commander, cards },
    getDemoOpponentDeck(),
  ]);
}

/** Online 2P: custom deck nebo demo na každé straně. */
export function createGameFromTwoDecks(
  p1: { deck: StoredDeck | 'demo'; name: string },
  p2: { deck: StoredDeck | 'demo'; name: string },
): GameState {
  const host = getDemoHostDeck();
  const opp = getDemoOpponentDeck();
  const left =
    p1.deck === 'demo'
      ? {
          playerId: 'p1' as const,
          playerName: p1.name,
          commander: host.commander,
          cards: host.cards,
        }
      : {
          playerId: 'p1' as const,
          playerName: p1.name,
          ...toEngineDeck(p1.deck),
        };

  const right =
    p2.deck === 'demo'
      ? {
          playerId: 'p2' as const,
          playerName: p2.name,
          commander: opp.commander,
          cards: opp.cards,
        }
      : {
          playerId: 'p2' as const,
          playerName: p2.name,
          ...toEngineDeck(p2.deck),
        };

  return createInitialGameState([left, right]);
}

export function isValidStoredDeck(raw: unknown): raw is StoredDeck {
  if (!raw || typeof raw !== 'object') return false;
  const d = raw as StoredDeck;
  if (!d.commander || typeof d.commander.name !== 'string') return false;
  if (!Array.isArray(d.cards) || d.cards.length === 0) return false;
  return d.cards.every((c) => c && typeof c.name === 'string');
}
