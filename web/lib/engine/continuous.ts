/**
 * Continuous effects — layer-aware helpers (CR 613 MVP → deepen).
 * Layer 7b: "base power and toughness are N/N" (set).
 * Layer 7c: anthem / "creatures you control get +N/+N".
 * Keyword grants: "creatures you control have flying".
 */
import { activeOracleText } from './classCase';
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

/**
 * Layer 7b set-P/T: "~'s power and toughness are equal to…" / "base power and toughness are N/N".
 * Returns absolute P/T when a set effect applies, else null (use printed + bonuses).
 */
export function continuousSetPt(
  c: CardInstance,
  state: GameState,
): { power: number; toughness: number } | null {
  if (!c.card.type_line.includes('Creature') && !c.crewed) return null;
  const self = c.card.oracle_text || '';
  const base = self.match(
    /(?:base\s+)?power\s+and\s+toughness\s+are\s+(\d+)\/(\d+)/i,
  );
  if (base) {
    return { power: parseInt(base[1], 10), toughness: parseInt(base[2], 10) };
  }
  const eq = self.match(
    /(?:~|this\s+creature|[A-Z][\w']*)'s\s+power\s+and\s+toughness\s+are\s+each\s+equal\s+to\s+the\s+number\s+of\s+cards?\s+in\s+your\s+hand/i,
  );
  if (eq) {
    const p = state.players.find((x) => x.id === c.controller);
    const n = p?.hand.length || 0;
    return { power: n, toughness: n };
  }
  const lands = self.match(
    /(?:~|this\s+creature|[A-Z][\w']*)'s\s+power\s+and\s+toughness\s+are\s+each\s+equal\s+to\s+the\s+number\s+of\s+lands?\s+you\s+control/i,
  );
  if (lands) {
    const p = state.players.find((x) => x.id === c.controller);
    const n = p?.battlefield.filter((x) => /land/i.test(x.card.type_line)).length || 0;
    return { power: n, toughness: n };
  }
  return null;
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
      const text = activeOracleText(src);
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
