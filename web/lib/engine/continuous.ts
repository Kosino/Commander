/**
 * Continuous effects — minimal layer-aware helpers (CR 613 MVP).
 * Layer 7c: anthem / "creatures you control get +N/+N" from permanents.
 * Keyword grants: "creatures you control have flying".
 */
import { continuousGrantedKeywords, hasChangeling } from './effects';
import { CardInstance, GameState, hasKeyword } from './types';

/** Keyword on card or granted by continuous effects. */
export function hasKeywordState(
  c: CardInstance,
  keyword: string,
  state: GameState,
): boolean {
  if (hasKeyword(c, keyword)) return true;
  return continuousGrantedKeywords(c, state).some(
    (k) => k.toLowerCase() === keyword.toLowerCase(),
  );
}

/** Static P/T bonus from other permanents' continuous effects. */
export function continuousPtBonus(
  c: CardInstance,
  state: GameState,
): { power: number; toughness: number } {
  if (!c.card.type_line.includes('Creature') && !c.crewed) {
    return { power: 0, toughness: 0 };
  }
  let power = 0;
  let toughness = 0;
  const ctrl = c.controller;
  for (const p of state.players) {
    for (const src of p.battlefield) {
      if (src.id === c.id) continue;
      const text = src.card.oracle_text || '';
      // "Creatures you control get +N/+N"
      const you = text.match(
        /creatures\s+you\s+control\s+get\s+([+-]\d+)\/([+-]\d+)/i,
      );
      if (you && src.controller === ctrl) {
        power += parseInt(you[1], 10);
        toughness += parseInt(you[2], 10);
      }
      // "Other creatures you control get +N/+N"
      const other = text.match(
        /other\s+creatures\s+you\s+control\s+get\s+([+-]\d+)\/([+-]\d+)/i,
      );
      if (other && src.controller === ctrl) {
        power += parseInt(other[1], 10);
        toughness += parseInt(other[2], 10);
      }
      // "Creatures get +N/+N" (global anthem)
      if (!you && !other) {
        const all = text.match(/(?:^|\n)\s*creatures\s+get\s+([+-]\d+)\/([+-]\d+)/i);
        if (all) {
          power += parseInt(all[1], 10);
          toughness += parseInt(all[2], 10);
        }
      }
      // "Creatures your opponents control get -N/-N"
      const opp = text.match(
        /creatures\s+your\s+opponents\s+control\s+get\s+([+-]\d+)\/([+-]\d+)/i,
      );
      if (opp && src.controller !== ctrl) {
        power += parseInt(opp[1], 10);
        toughness += parseInt(opp[2], 10);
      }

      // "Artifact creatures you control get +N/+N"
      const art = text.match(
        /artifact\s+creatures\s+you\s+control\s+get\s+([+-]\d+)\/([+-]\d+)/i,
      );
      if (
        art &&
        src.controller === ctrl &&
        c.card.type_line.includes('Artifact') &&
        c.card.type_line.includes('Creature')
      ) {
        power += parseInt(art[1], 10);
        toughness += parseInt(art[2], 10);
      }
      // "TYPE you control get +N/+N" (tribal) — subtype after em-dash or in type line
      const tribal = text.match(
        /(\w+)\s+creatures\s+you\s+control\s+get\s+([+-]\d+)\/([+-]\d+)/i,
      );
      if (tribal && src.controller === ctrl && !/^artifact$/i.test(tribal[1])) {
        const subtype = tribal[1];
        if (
          new RegExp(`\\b${subtype}\\b`, 'i').test(c.card.type_line) ||
          hasChangeling(c.card)
        ) {
          power += parseInt(tribal[2], 10);
          toughness += parseInt(tribal[3], 10);
        }
      }
    }
  }
  // Self static "~ gets +N/+N" / "CARDNAME gets +N/+N" (not attachment text)
  {
    const selfText = c.card.oracle_text || '';
    const self = selfText.match(
      /(?:^|\n)\s*(?:~|this\s+creature|[A-Z][\w']*(?:\s+[A-Z][\w']*)*)\s+gets?\s+([+-]\d+)\/([+-]\d+)(?!\s+until)/i,
    );
    // Skip if it's "Enchanted/Equipped creature gets" on this card (Aura/Equip — applied via attachment)
    if (
      self &&
      !/enchanted|equipped/i.test(self[0]) &&
      !/creatures?\s+you\s+control/i.test(self[0])
    ) {
      power += parseInt(self[1], 10);
      toughness += parseInt(self[2], 10);
    }
  }

  // Emblem continuous P/T (rare, but "creatures you control get")
  const owner = state.players.find((p) => p.id === ctrl);
  for (const emb of owner?.emblems || []) {
    const you = (emb.oracle_text || '').match(
      /creatures\s+you\s+control\s+get\s+([+-]\d+)\/([+-]\d+)/i,
    );
    if (you) {
      power += parseInt(you[1], 10);
      toughness += parseInt(you[2], 10);
    }
  }
  return { power, toughness };
}
