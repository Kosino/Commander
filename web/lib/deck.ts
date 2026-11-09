import {
  hasCompanion,
  mergedColorIdentity,
  partnersCompatible,
} from './commanderExtras';

export interface Card {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  color_identity?: string[];
  oracle_id?: string;
  keywords?: string[];
  image_uri?: string;
  /** Back face for DFC / Siege. */
  other_face?: Card;
}

export interface DeckExport {
  name?: string;
  commander: Card | null;
  /** Second commander (Partner). */
  partner?: Card | null;
  /** Companion (outside deck / starts in command). */
  companion?: Card | null;
  cards: Card[];
}

export const BASIC_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];

export function isBasicLand(card: Card): boolean {
  return BASIC_LANDS.some(
    (land) => card.name === land || card.type_line?.includes(`Basic Land — ${land}`),
  );
}

export function isLand(card: Card): boolean {
  return !!card.type_line?.includes('Land');
}

/** Converted mana cost from a mana_cost string like `{2}{U}{U}`. X/Y/Z count as 0. */
export function parseCmc(manaCost?: string): number {
  if (!manaCost) return 0;
  // Split cards: use left face for curve
  const face = manaCost.split('//')[0];
  const symbols = face.match(/\{([^}]+)\}/g);
  if (!symbols) return 0;

  let cmc = 0;
  for (const raw of symbols) {
    const s = raw.slice(1, -1).toUpperCase();
    if (/^\d+$/.test(s)) {
      cmc += parseInt(s, 10);
    } else if (s === 'X' || s === 'Y' || s === 'Z') {
      continue;
    } else {
      // Colored, hybrid, phyrexian, snow, etc. → 1
      cmc += 1;
    }
  }
  return cmc;
}

export type TypeBucket =
  | 'Creatures'
  | 'Instants'
  | 'Sorceries'
  | 'Artifacts'
  | 'Enchantments'
  | 'Planeswalkers'
  | 'Lands'
  | 'Other';

export function classifyType(card: Card): TypeBucket {
  const t = card.type_line || '';
  if (t.includes('Land')) return 'Lands';
  if (t.includes('Creature')) return 'Creatures';
  if (t.includes('Planeswalker')) return 'Planeswalkers';
  if (t.includes('Instant')) return 'Instants';
  if (t.includes('Sorcery')) return 'Sorceries';
  if (t.includes('Artifact')) return 'Artifacts';
  if (t.includes('Enchantment')) return 'Enchantments';
  return 'Other';
}

export interface DeckStats {
  manaCurve: number[]; // index 0..6, where 6 = 6+
  typeCounts: Record<TypeBucket, number>;
  avgCmc: number;
  nonLandCount: number;
}

export function computeDeckStats(deck: Card[]): DeckStats {
  const manaCurve = [0, 0, 0, 0, 0, 0, 0];
  const typeCounts: Record<TypeBucket, number> = {
    Creatures: 0,
    Instants: 0,
    Sorceries: 0,
    Artifacts: 0,
    Enchantments: 0,
    Planeswalkers: 0,
    Lands: 0,
    Other: 0,
  };

  let cmcSum = 0;
  let nonLandCount = 0;

  for (const card of deck) {
    typeCounts[classifyType(card)] += 1;
    if (isLand(card)) continue;
    const cmc = parseCmc(card.mana_cost);
    cmcSum += cmc;
    nonLandCount += 1;
    const bucket = Math.min(cmc, 6);
    manaCurve[bucket] += 1;
  }

  return {
    manaCurve,
    typeCounts,
    avgCmc: nonLandCount ? Math.round((cmcSum / nonLandCount) * 100) / 100 : 0,
    nonLandCount,
  };
}

export function validateDeck(
  deck: Card[],
  commander: Card | null,
  opts?: { partner?: Card | null; companion?: Card | null },
): string[] {
  const errors: string[] = [];
  const partner = opts?.partner || null;
  const companion = opts?.companion || null;

  if (!commander) {
    errors.push('Chybí commander (Legendary Creature).');
    return errors;
  }

  // 100 main + 1 commander; with Partner: 98 main + 2 commanders.
  const need = partner ? 98 : 100;
  if (deck.length !== need) {
    errors.push(
      partner
        ? `Deck má ${deck.length} karet, s Partnerem musí mít 98 (+ 2 commandery).`
        : `Deck má ${deck.length} karet, musí mít přesně 100.`,
    );
  }

  if (partner && !partnersCompatible(commander, partner)) {
    errors.push('Partner: karty nejsou kompatibilní (Partner / Partner with).');
  }

  if (companion && !hasCompanion(companion)) {
    errors.push(`Companion: ${companion.name} nemá keyword Companion.`);
  }

  const nameCounts = new Map<string, number>();
  for (const card of deck) {
    if (isBasicLand(card)) continue;
    nameCounts.set(card.name, (nameCounts.get(card.name) || 0) + 1);
  }
  for (const [name, count] of nameCounts) {
    if (count > 1) {
      errors.push(`Singleton porušen: ${name} je ${count}× (kromě basic lands).`);
    }
  }

  const cmdIdentity = new Set(mergedColorIdentity(commander, partner));
  for (const card of deck) {
    for (const color of card.color_identity || []) {
      if (!cmdIdentity.has(color)) {
        errors.push(
          `Color identity: ${card.name} má barvu ${color}, která není v commanderovi (${[...cmdIdentity].join('') || 'bezbarvý'}).`,
        );
        break;
      }
    }
  }

  const checkBan = (name: string, where: string) => {
    if (COMMANDER_BANNED.has(name.toLowerCase())) {
      errors.push(`Banned ${where}: ${name}`);
    }
  };
  checkBan(commander.name, 'commander');
  if (partner) checkBan(partner.name, 'partner');
  if (companion) checkBan(companion.name, 'companion');
  for (const card of deck) checkBan(card.name, 'card');

  const gc = [...deck, commander, partner, companion]
    .filter((c): c is Card => !!c)
    .filter((c) => GAME_CHANGERS.has(c.name.toLowerCase()))
    .map((c) => c.name);
  if (gc.length) {
    errors.push(`Info — Game Changers: ${[...new Set(gc)].join(', ')}`);
  }

  return errors;
}

export function exportDeckJson(
  commander: Card | null,
  deck: Card[],
  name = 'Untitled Deck',
  extras?: { partner?: Card | null; companion?: Card | null },
): string {
  const payload: DeckExport = {
    name,
    commander,
    partner: extras?.partner || null,
    companion: extras?.companion || null,
    cards: deck,
  };
  return JSON.stringify(payload, null, 2);
}

/** Moxfield-ish text: 1 Card Name per line, commander section first. */
export function exportDeckText(
  commander: Card | null,
  deck: Card[],
  extras?: { partner?: Card | null; companion?: Card | null },
): string {
  const lines: string[] = [];
  if (commander) {
    lines.push('Commander');
    lines.push(`1 ${commander.name}`);
    if (extras?.partner) lines.push(`1 ${extras.partner.name}`);
    lines.push('');
    if (extras?.companion) {
      lines.push('Companion');
      lines.push(`1 ${extras.companion.name}`);
      lines.push('');
    }
    lines.push('Deck');
  }

  const counts = new Map<string, number>();
  for (const card of deck) {
    if (commander && card.oracle_id && card.oracle_id === commander.oracle_id) continue;
    if (commander && !card.oracle_id && card.name === commander.name) continue;
    counts.set(card.name, (counts.get(card.name) || 0) + 1);
  }

  for (const [name, count] of counts) {
    lines.push(`${count} ${name}`);
  }
  return lines.join('\n');
}

export function parseDeckJson(raw: string): DeckExport {
  const data = JSON.parse(raw) as DeckExport;
  if (!data || !Array.isArray(data.cards)) {
    throw new Error('Neplatný JSON deck (chybí cards).');
  }
  return {
    name: data.name,
    commander: data.commander ?? null,
    partner: data.partner ?? null,
    companion: data.companion ?? null,
    cards: data.cards,
  };
}

/**
 * Parse simple text list. Lines like "1 Sol Ring" or "Sol Ring".
 * Optional "Commander" / "Deck" section headers.
 * Only names are restored — re-search for full card data if needed.
 */
export function parseDeckText(raw: string): { commanderName: string | null; entries: { count: number; name: string }[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let mode: 'auto' | 'commander' | 'deck' = 'auto';
  let commanderName: string | null = null;
  const entries: { count: number; name: string }[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower === 'commander' || lower === 'commanders') {
      mode = 'commander';
      continue;
    }
    if (lower === 'deck' || lower === 'mainboard' || lower === 'main') {
      mode = 'deck';
      continue;
    }
    if (lower.startsWith('sideboard') || lower === 'maybeboard') break;

    const m = line.match(/^(\d+)\s+x?\s*(.+)$/i) || line.match(/^(.+)$/);
    if (!m) continue;

    let count = 1;
    let name: string;
    if (m.length === 3 && /^\d+$/.test(m[1])) {
      count = parseInt(m[1], 10);
      name = m[2].trim();
    } else {
      name = m[1].trim();
    }

    // Strip set codes like "(CMD) 123"
    name = name.replace(/\s*\([^)]*\)\s*\d*$/, '').trim();

    if (mode === 'commander' && !commanderName) {
      commanderName = name;
      continue;
    }
    entries.push({ count, name });
  }

  return { commanderName, entries };
}

/** Official Commander banned (subset; update with CR/RC lists as needed). */
export const COMMANDER_BANNED = new Set(
  [
    'Ancestral Recall',
    'Balance',
    'Biorhythm',
    'Black Lotus',
    'Channel',
    'Dockside Extortionist',
    'Emrakul, the Aeons Torn',
    'Erayo, Soratami Ascendant',
    'Fastbond',
    'Flash',
    'Golos, Tireless Pilgrim',
    'Griselbrand',
    'Hullbreacher',
    'Iona, Shield of Emeria',
    'Jeweled Lotus',
    'Library of Alexandria',
    'Limited Resources',
    'Lutri, the Spellchaser',
    'Mana Crypt',
    'Mana Geyser',
    'Mox Emerald',
    'Mox Jet',
    'Mox Pearl',
    'Mox Ruby',
    'Mox Sapphire',
    'Nadu, Winged Wisdom',
    'Paradox Engine',
    'Primeval Titan',
    'Prophet of Kruphix',
    'Recurring Nightmare',
    'Rofellos, Llanowar Emissary',
    'Sundering Titan',
    'Sway of the Stars',
    'Time Vault',
    'Time Walk',
    'Tinker',
    'Tolarian Academy',
    'Trade Secrets',
    'Upheaval',
    'Yawgmoth\'s Bargain',
  ].map((n) => n.toLowerCase()),
);

/** Commander Bracket Game Changers (advisory). */
export const GAME_CHANGERS = new Set(
  [
    'Cyclonic Rift',
    'Demonic Tutor',
    'Fierce Guardianship',
    'Force of Will',
    'Gaea\'s Cradle',
    'Jeska\'s Will',
    'Mana Drain',
    'Rhystic Study',
    'Smothering Tithe',
    'The One Ring',
    'Thassa\'s Oracle',
    'Underworld Breach',
  ].map((n) => n.toLowerCase()),
);

export type DeckLegality = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  gameChangers: string[];
};

/** EDH legality via builder validateDeck + structured Game Changers. */
export function validateEdhDeck(deck: DeckExport): DeckLegality {
  const raw = validateDeck(deck.cards, deck.commander, {
    partner: deck.partner,
    companion: deck.companion,
  });
  const errors = raw.filter((e) => !e.startsWith('Info —'));
  const gcLine = raw.find((e) => e.startsWith('Info — Game Changers:'));
  const gameChangers = gcLine
    ? gcLine.replace(/^Info — Game Changers:\s*/, '').split(', ').filter(Boolean)
    : [];
  const warnings = gcLine ? [gcLine.replace(/^Info — /, '')] : [];
  return { ok: errors.length === 0, errors, warnings, gameChangers };
}
