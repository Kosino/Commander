/**
 * Report % of cards with parseable oracle effects (P4 tooling).
 * Usage: npx tsx scripts/oracle-coverage.ts
 * Optional: DEMO=1 for demo decks only; otherwise samples demo + tries session deck path.
 */
import { cardParseCoverage } from '../lib/engine/effects';
import { createDemoGame } from '../lib/engine/demo';
import type { CardData } from '../lib/engine/types';

function uniqueCards(cards: CardData[]): CardData[] {
  const seen = new Set<string>();
  const out: CardData[] = [];
  for (const c of cards) {
    const k = c.oracle_id || c.name;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function report(label: string, cards: CardData[]) {
  const uniq = uniqueCards(cards);
  let ok = 0;
  let land = 0;
  let cast = 0;
  let etb = 0;
  let dies = 0;
  const bad: string[] = [];
  for (const c of uniq) {
    const r = cardParseCoverage(c);
    if (r.land) land += 1;
    if (r.ok) ok += 1;
    else bad.push(c.name);
    if (r.cast) cast += 1;
    if (r.etb) etb += 1;
    if (r.dies) dies += 1;
  }
  const pct = uniq.length ? Math.round((1000 * ok) / uniq.length) / 10 : 0;
  console.log(`\n=== ${label} ===`);
  console.log(`unique cards: ${uniq.length}`);
  console.log(`parseable ok: ${ok} (${pct}%)`);
  console.log(`lands counted ok: ${land}`);
  console.log(`cast-effect: ${cast} · etb: ${etb} · dies: ${dies}`);
  if (bad.length) {
    console.log(`noop/missing (first 25):`);
    for (const n of bad.slice(0, 25)) console.log(`  - ${n}`);
    if (bad.length > 25) console.log(`  … +${bad.length - 25} more`);
  }
  return { uniq: uniq.length, ok, pct };
}

const g = createDemoGame();
const demoCards: CardData[] = [];
for (const p of g.players) {
  for (const zone of [
    ...p.library,
    ...p.hand,
    ...p.commandZone,
    ...p.battlefield,
  ]) {
    demoCards.push(zone.card);
  }
}
report('Demo game cards', demoCards);

// Synthetic smoke for new patterns
const samples: CardData[] = [
  {
    oracle_id: 's1',
    name: 'Sample Wrath Lite',
    type_line: 'Sorcery',
    oracle_text: 'Destroy all creatures.',
    colors: [],
    color_identity: [],
    keywords: [],
  },
  {
    oracle_id: 's2',
    name: 'Sample Opp Drain',
    type_line: 'Sorcery',
    oracle_text: 'Each opponent loses 3 life. You gain 3 life.',
    colors: ['B'],
    color_identity: ['B'],
    keywords: [],
  },
  {
    oracle_id: 's3',
    name: 'Sample Anthem Counters',
    type_line: 'Instant',
    oracle_text: 'Put a +1/+1 counter on each creature you control.',
    colors: ['G'],
    color_identity: ['G'],
    keywords: [],
  },
  {
    oracle_id: 's4',
    name: 'Sample Recursion',
    type_line: 'Sorcery',
    oracle_text: 'Return target creature card from your graveyard to your hand.',
    colors: ['B'],
    color_identity: ['B'],
    keywords: [],
  },
  {
    oracle_id: 's5',
    name: 'Sample Grant Fly',
    type_line: 'Instant',
    oracle_text: 'Target creature gains flying until end of turn.',
    colors: ['U'],
    color_identity: ['U'],
    keywords: [],
  },
];
report('New-pattern smoke samples', samples);

console.log('\nDone.');
