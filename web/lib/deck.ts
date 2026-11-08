export interface Card {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  color_identity?: string[];
  oracle_id?: string;
}

export interface DeckExport {
  name?: string;
  commander: Card | null;
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

export function validateDeck(deck: Card[], commander: Card | null): string[] {
  const errors: string[] = [];

  if (!commander) {
    errors.push('Chybí commander (Legendary Creature).');
    return errors;
  }

  if (deck.length !== 100) {
    errors.push(`Deck má ${deck.length} karet, musí mít přesně 100.`);
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

  const cmdIdentity = new Set(commander.color_identity || []);
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

  return errors;
}

export function exportDeckJson(commander: Card | null, deck: Card[], name = 'Untitled Deck'): string {
  const payload: DeckExport = { name, commander, cards: deck };
  return JSON.stringify(payload, null, 2);
}

/** Moxfield-ish text: 1 Card Name per line, commander section first. */
export function exportDeckText(commander: Card | null, deck: Card[]): string {
  const lines: string[] = [];
  if (commander) {
    lines.push('Commander');
    lines.push(`1 ${commander.name}`);
    lines.push('');
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
