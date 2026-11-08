import { ManaColor, Player } from './types';

export type HybridSymbol = { a: ManaColor; b: ManaColor };
export type PhyrexianSymbol = ManaColor;

export type ManaCost = {
  generic: number;
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
  /** Hybrid symbols — pay either color. */
  hybrids: HybridSymbol[];
  /** Phyrexian — pay color or 2 life. */
  phyrexian: PhyrexianSymbol[];
  /** Unpayable / empty cost. */
  unpayable: boolean;
};

const EMPTY: ManaCost = {
  generic: 0,
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
  C: 0,
  hybrids: [],
  phyrexian: [],
  unpayable: false,
};

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

/** Count {X} symbols in a mana cost. */
export function countX(manaCost?: string): number {
  if (!manaCost) return 0;
  const face = manaCost.split('//')[0];
  return (face.match(/\{X\}/gi) || []).length;
}

/** Mana value (CMC) of a mana cost string (X counts as 0). */
export function manaValue(manaCost?: string, xValue = 0): number {
  const c = parseManaCost(manaCost, xValue);
  return (
    c.generic +
    c.W +
    c.U +
    c.B +
    c.R +
    c.G +
    c.C +
    c.hybrids.length +
    c.phyrexian.length
  );
}

/**
 * Parse `{2}{U}{U}` → cost.
 * @param xValue announced value of each X (added to generic × countX).
 */
export function parseManaCost(manaCost?: string, xValue = 0): ManaCost {
  if (!manaCost) return { ...EMPTY, hybrids: [], phyrexian: [], unpayable: true };
  const face = manaCost.split('//')[0];
  const symbols = face.match(/\{([^}]+)\}/g);
  if (!symbols) return { ...EMPTY, hybrids: [], phyrexian: [], unpayable: true };

  const cost: ManaCost = {
    ...EMPTY,
    hybrids: [],
    phyrexian: [],
  };
  let xCount = 0;
  for (const raw of symbols) {
    const s = raw.slice(1, -1).toUpperCase();
    if (/^\d+$/.test(s)) {
      cost.generic += parseInt(s, 10);
    } else if (s === 'X' || s === 'Y' || s === 'Z') {
      if (s === 'X') xCount += 1;
    } else if (s === 'W' || s === 'U' || s === 'B' || s === 'R' || s === 'G' || s === 'C') {
      cost[s] += 1;
    } else if (s === 'S') {
      cost.generic += 1;
    } else if (/^[WUBRG]\/[WUBRG]$/.test(s)) {
      const [a, b] = s.split('/') as [ManaColor, ManaColor];
      cost.hybrids.push({ a, b });
    } else if (/^[WUBRG]\/P$/.test(s)) {
      cost.phyrexian.push(s[0] as ManaColor);
    } else if (s === 'P') {
      cost.generic += 1;
    } else {
      cost.generic += 1;
    }
  }
  cost.generic += Math.max(0, xValue) * xCount;
  return cost;
}

/** Add generic mana (commander tax, etc.). */
export function withExtraGeneric(cost: ManaCost, extra: number): ManaCost {
  return {
    ...cost,
    hybrids: [...cost.hybrids],
    phyrexian: [...cost.phyrexian],
    generic: cost.generic + Math.max(0, extra),
    unpayable: false,
  };
}

function tryPayHybrid(
  avail: Record<ManaColor, number>,
  hybrids: HybridSymbol[],
): Record<ManaColor, number> | null {
  // Greedy: for each hybrid, prefer the color with more available
  const pool = { ...avail };
  for (const h of hybrids) {
    if (pool[h.a] >= pool[h.b] && pool[h.a] > 0) pool[h.a] -= 1;
    else if (pool[h.b] > 0) pool[h.b] -= 1;
    else if (pool[h.a] > 0) pool[h.a] -= 1;
    else return null;
  }
  return pool;
}

function norm(cost: ManaCost): ManaCost {
  return {
    ...cost,
    hybrids: cost.hybrids || [],
    phyrexian: cost.phyrexian || [],
  };
}

export function canPayMana(
  pool: Player['manaPool'],
  cost: ManaCost,
  life = 40,
): boolean {
  const c = norm(cost);
  if (
    c.unpayable &&
    c.generic === 0 &&
    !COLORS.some((col) => c[col] > 0) &&
    c.hybrids.length === 0 &&
    c.phyrexian.length === 0
  ) {
    return false;
  }
  const avail = { ...pool };
  for (const col of COLORS) {
    if ((avail[col] || 0) < c[col]) return false;
    avail[col] -= c[col];
  }
  let lifeLeft = life;
  for (const col of c.phyrexian) {
    if (avail[col] > 0) avail[col] -= 1;
    else if (lifeLeft >= 2) lifeLeft -= 2;
    else return false;
  }
  const afterHybrid = tryPayHybrid(avail, c.hybrids);
  if (!afterHybrid) return false;
  let genericNeed = c.generic;
  const order: ManaColor[] = ['C', 'W', 'U', 'B', 'R', 'G'];
  for (const col of order) {
    const use = Math.min(afterHybrid[col], genericNeed);
    afterHybrid[col] -= use;
    genericNeed -= use;
  }
  return genericNeed === 0;
}

/** Returns new pool after paying, or null if cannot. */
export function payMana(
  pool: Player['manaPool'],
  cost: ManaCost,
  life = 40,
): Player['manaPool'] | null {
  const result = payManaDetailed(pool, cost, life);
  return result ? result.pool : null;
}

/** Pay mana; also returns life lost to phyrexian. */
export function payManaDetailed(
  pool: Player['manaPool'],
  cost: ManaCost,
  life = 40,
): { pool: Player['manaPool']; lifePaid: number } | null {
  const c = norm(cost);
  if (!canPayMana(pool, c, life)) return null;
  const avail = { ...pool };
  for (const col of COLORS) {
    avail[col] -= c[col];
  }
  let lifePaid = 0;
  for (const col of c.phyrexian) {
    if (avail[col] > 0) avail[col] -= 1;
    else lifePaid += 2;
  }
  const afterHybrid = tryPayHybrid(avail, c.hybrids);
  if (!afterHybrid) return null;
  let genericNeed = c.generic;
  const order: ManaColor[] = ['C', 'W', 'U', 'B', 'R', 'G'];
  for (const col of order) {
    const use = Math.min(afterHybrid[col], genericNeed);
    afterHybrid[col] -= use;
    genericNeed -= use;
  }
  if (genericNeed > 0) return null;
  return { pool: afterHybrid, lifePaid };
}

/** Mana color produced by a basic land type line. */
export function basicLandMana(typeLine: string): ManaColor | null {
  if (typeLine.includes('Plains')) return 'W';
  if (typeLine.includes('Island')) return 'U';
  if (typeLine.includes('Swamp')) return 'B';
  if (typeLine.includes('Mountain')) return 'R';
  if (typeLine.includes('Forest')) return 'G';
  if (typeLine.includes('Wastes')) return 'C';
  return null;
}
