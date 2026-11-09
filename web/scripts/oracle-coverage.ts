/**
 * Oracle coverage — staples (default), full dump stream, or demo.
 * Usage:
 *   npx tsx scripts/oracle-coverage.ts              # --staples
 *   npx tsx scripts/oracle-coverage.ts --staples
 *   npx tsx scripts/oracle-coverage.ts --oracle ../data/oracle-cards.jsonl.gz
 *   npx tsx scripts/oracle-coverage.ts --demo
 *   npx tsx scripts/oracle-coverage.ts --json
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as readline from 'readline';
import {
  cardParseCoverage,
  parseActivatedAbilities,
  parseDiesEffects,
  parseEtbScript,
  parseOracleScript,
  scriptHasRealEffects,
} from '../lib/engine/effects';
import { createDemoGame } from '../lib/engine/demo';
import type { CardData } from '../lib/engine/types';

const FIXTURES = path.join(__dirname, 'fixtures');
const STAPLES_PATH = path.join(FIXTURES, 'commander-staples.json');
const REPORT_PATH = path.join(FIXTURES, 'coverage-report.txt');
const DEFAULT_ORACLE = path.resolve(__dirname, '../../data/oracle-cards.jsonl.gz');

/** ~150 common EDH names — oracle text is sliced from the local dump, never hand-written. */
const STAPLE_NAMES: string[] = [
  'Sol Ring',
  'Arcane Signet',
  'Command Tower',
  'Cultivate',
  'Kodama\'s Reach',
  'Farseek',
  'Nature\'s Lore',
  'Three Visits',
  'Rampant Growth',
  'Explosive Vegetation',
  'Demonic Tutor',
  'Vampiric Tutor',
  'Imperial Seal',
  'Diabolic Intent',
  'Worldly Tutor',
  'Mystical Tutor',
  'Enlightened Tutor',
  'Idyllic Tutor',
  'Swords to Plowshares',
  'Path to Exile',
  'Beast Within',
  'Generous Gift',
  'Chaos Warp',
  'Anguished Unmaking',
  'Assassin\'s Trophy',
  'Fatal Push',
  'Counterspell',
  'Negate',
  'Swan Song',
  'Mana Drain',
  'Force of Will',
  'Fierce Guardianship',
  'Deflecting Swat',
  'Deadly Rollick',
  'Flawless Maneuver',
  'Teferi\'s Protection',
  'Cyclonic Rift',
  'Blasphemous Act',
  'Damnation',
  'Wrath of God',
  'Toxic Deluge',
  'Farewell',
  'Austere Command',
  'Rhystic Study',
  'Mystic Remora',
  'Smothering Tithe',
  'Dockside Extortionist',
  'Esper Sentinel',
  'Ragavan, Nimble Pilferer',
  'Birds of Paradise',
  'Delighted Halfling',
  'Bloom Tender',
  'Priest of Titania',
  'Elves of Deep Shadow',
  'Llanowar Elves',
  'Fyndhorn Elves',
  'Elvish Mystic',
  'Avacyn\'s Pilgrim',
  'Noble Hierarch',
  'Sylvan Library',
  'Necropotence',
  'Phyrexian Arena',
  'Dark Confidant',
  'The One Ring',
  'Sensei\'s Divining Top',
  'Scroll Rack',
  'Lightning Greaves',
  'Swiftfoot Boots',
  'Shadowspear',
  'Skullclamp',
  'Sword of Feast and Famine',
  'Sword of Fire and Ice',
  'Chromatic Lantern',
  'Fellwar Stone',
  'Mind Stone',
  'Thought Vessel',
  'Worn Powerstone',
  'Thran Dynamo',
  'Gilded Lotus',
  'Mana Crypt',
  'Mana Vault',
  'Chrome Mox',
  'Mox Diamond',
  'Jeweled Lotus',
  'Ancient Tomb',
  'City of Brass',
  'Mana Confluence',
  'Exotic Orchard',
  'Reflecting Pool',
  'Breeding Pool',
  'Steam Vents',
  'Watery Grave',
  'Overgrown Tomb',
  'Blood Crypt',
  'Stomping Ground',
  'Sacred Foundry',
  'Temple Garden',
  'Godless Shrine',
  'Hallowed Fountain',
  'Savannah',
  'Bayou',
  'Taiga',
  'Tropical Island',
  'Underground Sea',
  'Volcanic Island',
  'Tundra',
  'Scrubland',
  'Plateau',
  'Badlands',
  'Fetid Heath',
  'Flooded Strand',
  'Polluted Delta',
  'Bloodstained Mire',
  'Wooded Foothills',
  'Windswept Heath',
  'Misty Rainforest',
  'Scalding Tarn',
  'Verdant Catacombs',
  'Arid Mesa',
  'Marsh Flats',
  'Eternal Witness',
  'Regrowth',
  'Reclaim',
  'Noxious Revival',
  'Sevinne\'s Reclamation',
  'Bala Ged Recovery',
  'Reckless Impulse',
  'Light Up the Stage',
  'Expressive Iteration',
  'Mana Leak',
  "Dovin's Veto",
  'Absorb',
  'Remand',
  'Memory Lapse',
  'Pact of Negation',
  'Force of Negation',
  'Flusterstorm',
  'Mental Misstep',
  'Spell Pierce',
  'Dispel',
  'Glorious Anthem',
  'Spear of Heliod',
  'Always Watching',
  'Intangible Virtue',
  'Beastmaster Ascension',
  'Hardened Scales',
  'Doubling Season',
  'Parallel Lives',
  'Anointed Procession',
  'Pitiless Plunderer',
  'Professional Face-Breaker',
  'Rejuvenating Springs',
  'Training Center',
  'Spectator Seating',
  'Undergrowth Stadium',
  'Vault of Champions',
  'Reliquary Tower',
  'Rogue\'s Passage',
  'Boseiju, Who Endures',
  'Otawara, Soaring City',
  'Takenuma, Abandoned Mire',
  'Eiganjo, Seat of the Empire',
  'Sokenzan, Crucible of Defiance',
  'Yavimaya, Cradle of Growth',
  'Urza\'s Saga',
  'The Great Henge',
  'Craterhoof Behemoth',
  'Avenger of Zendikar',
  'Terror of the Peaks',
  'Dragonlord Dromoka',
  'Atraxa, Praetors\' Voice',
  'Korvold, Fae-Cursed King',
  'Kaalia of the Vast',
  'Kenrith, the Returned King',
  'Tymna the Weaver',
  'Thrasios, Triton Hero',
  'Kinnan, Bonder Prodigy',
  'Sisay, Weatherlight Captain',
  'Solemn Simulacrum',
  'Burnished Hart',
  'Wood Elves',
  'Farhaven Elf',
  'Sakura-Tribe Elder',
  'Eternal Witness',
  'Reclamation Sage',
  'Beast Whisperer',
  'Guardian Project',
  'Kindred Discovery',
  'Coastal Piracy',
  'Bident of Thassa',
  'Revel in Riches',
  'Black Market Connections',
  'Deadly Dispute',
  'Village Rites',
  'Night\'s Whisper',
  'Sign in Blood',
  'Read the Bones',
  'Painful Truths',
  'Fact or Fiction',
  'Brainstorm',
  'Ponder',
  'Preordain',
  'Serum Visions',
  'Opt',
  'Consider',
];

type CoverCard = {
  oracle_id: string;
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
};

function argvFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argvValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function toCardData(c: CoverCard): CardData {
  return {
    oracle_id: c.oracle_id || c.name,
    name: c.name,
    mana_cost: c.mana_cost,
    type_line: c.type_line || '',
    oracle_text: c.oracle_text,
    colors: (c.colors || []) as CardData['colors'],
    color_identity: (c.color_identity || []) as CardData['color_identity'],
    keywords: c.keywords || [],
  };
}

/** Strict: real cast/ETB/dies/activated effect, mana ability, or recognized static anthem/keyword grant. */
export function cardParseCoverageStrict(card: {
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
}): { ok: boolean; cast: boolean; etb: boolean; dies: boolean; activated: boolean; staticOk: boolean; land: boolean } {
  const tl = card.type_line || '';
  const land = /\bLand\b/i.test(tl);
  if (land) {
    return { ok: true, cast: true, etb: true, dies: true, activated: true, staticOk: true, land: true };
  }
  const text = (card.oracle_text || '').trim();
  if (!text) {
    return { ok: true, cast: true, etb: true, dies: true, activated: true, staticOk: true, land: false };
  }
  const cast = scriptHasRealEffects(parseOracleScript(card.oracle_text, tl, card.mana_cost));
  const etb = scriptHasRealEffects(parseEtbScript(card.oracle_text));
  const dies = parseDiesEffects(card.oracle_text).length > 0;
  const activated = parseActivatedAbilities(card.oracle_text).length > 0;
  const manaAbility = /\{[^}]*T[^}]*\}:\s*Add\b/i.test(text) || /\{T\}:\s*Add\b/i.test(text);
  const staticOk =
    /\b(?:other )?creatures you control get\b/i.test(text) ||
    /\bcreatures you control have\b/i.test(text) ||
    /\bcreatures your opponents control get\b/i.test(text) ||
    /\b(?:artifact |enchantment |token )?creatures you control get\b/i.test(text);
  const ok = cast || etb || dies || activated || manaAbility || staticOk;
  return { ok, cast, etb, dies, activated: activated || manaAbility, staticOk, land: false };
}

/** Normalize oracle clause → template key for missing-pattern clustering. */
export function normalizeTemplateClause(raw: string): string {
  let s = raw.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\{[^}]+\}/g, '{M}');
  s = s.replace(/\b\d+\b/g, 'N');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function missingTemplates(
  cards: CoverCard[],
): { template: string; count: number; example: string }[] {
  const counts = new Map<string, { count: number; example: string }>();
  for (const c of cards) {
    const strict = cardParseCoverageStrict(c);
    if (strict.ok) continue;
    const text = (c.oracle_text || '').trim();
    if (!text) continue;
    const clauses = text
      .split(/(?<=\.)\s+|\n+/)
      .map((x) => normalizeTemplateClause(x))
      .filter((x) => x.length > 3);
    const keys = clauses.length ? clauses : [normalizeTemplateClause(text)];
    for (const t of keys) {
      const prev = counts.get(t);
      if (prev) prev.count += 1;
      else counts.set(t, { count: 1, example: c.name });
    }
  }
  return [...counts.entries()]
    .map(([template, v]) => ({ template, count: v.count, example: v.example }))
    .sort((a, b) => b.count - a.count || a.template.localeCompare(b.template))
    .slice(0, 25);
}

function pickFromScryfallRow(row: Record<string, unknown>): CoverCard | null {
  const name = String(row.name || '');
  if (!name) return null;
  const type_line = String(row.type_line || '');
  const oracle_text =
    typeof row.oracle_text === 'string'
      ? row.oracle_text
      : Array.isArray(row.card_faces)
        ? (row.card_faces as { oracle_text?: string }[])
            .map((f) => f.oracle_text || '')
            .filter(Boolean)
            .join('\n')
        : undefined;
  return {
    oracle_id: String(row.oracle_id || row.id || name),
    name,
    mana_cost: typeof row.mana_cost === 'string' ? row.mana_cost : undefined,
    type_line,
    oracle_text,
    colors: Array.isArray(row.colors) ? (row.colors as string[]) : [],
    color_identity: Array.isArray(row.color_identity)
      ? (row.color_identity as string[])
      : [],
    keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
  };
}

async function streamOracleGzip(
  filePath: string,
  onCard: (c: CoverCard) => void | boolean,
): Promise<void> {
  const input = fs.createReadStream(filePath).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const c = pickFromScryfallRow(row);
    if (!c) continue;
    const stop = onCard(c);
    if (stop === false) break;
  }
}

async function sliceStaplesFromGzip(gzipPath: string): Promise<CoverCard[]> {
  const want = new Map(STAPLE_NAMES.map((n) => [n.toLowerCase(), n]));
  const found = new Map<string, CoverCard>();
  await streamOracleGzip(gzipPath, (c) => {
    const key = c.name.toLowerCase();
    if (want.has(key) && !found.has(key)) {
      found.set(key, c);
    }
    if (found.size >= want.size) return false;
  });
  // Prefer canonical list order
  const out: CoverCard[] = [];
  for (const n of STAPLE_NAMES) {
    const c = found.get(n.toLowerCase());
    if (c) out.push(c);
  }
  return out;
}

function loadStaplesFixture(): CoverCard[] {
  if (!fs.existsSync(STAPLES_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(STAPLES_PATH, 'utf8')) as CoverCard[];
  return Array.isArray(raw) ? raw : [];
}

function saveStaplesFixture(cards: CoverCard[]) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  fs.writeFileSync(STAPLES_PATH, JSON.stringify(cards, null, 2), 'utf8');
}

type Score = {
  label: string;
  total: number;
  strictOk: number;
  lenientOk: number;
  strictPct: number;
  lenientPct: number;
  top: { template: string; count: number; example: string }[];
};

function scoreCards(label: string, cards: CoverCard[]): Score {
  let strictOk = 0;
  let lenientOk = 0;
  for (const c of cards) {
    if (cardParseCoverageStrict(c).ok) strictOk += 1;
    if (cardParseCoverage(toCardData(c)).ok) lenientOk += 1;
  }
  const total = cards.length;
  const strictPct = total ? Math.round((1000 * strictOk) / total) / 10 : 0;
  const lenientPct = total ? Math.round((1000 * lenientOk) / total) / 10 : 0;
  return {
    label,
    total,
    strictOk,
    lenientOk,
    strictPct,
    lenientPct,
    top: missingTemplates(cards),
  };
}

function printScore(s: Score) {
  console.log(`\n=== ${s.label} ===`);
  console.log(`cards: ${s.total}`);
  console.log(`strict:  ${s.strictOk}/${s.total} (${s.strictPct}%)`);
  console.log(`lenient: ${s.lenientOk}/${s.total} (${s.lenientPct}%)`);
  if (s.top.length) {
    console.log('top 25 missing templates (strict):');
    for (const t of s.top) {
      console.log(`  [${t.count}] ${t.template}  (e.g. ${t.example})`);
    }
  }
}

function writeReport(s: Score, extraLines: string[] = []) {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const lines = [
    `label: ${s.label}`,
    `cards: ${s.total}`,
    `strict: ${s.strictPct}% (${s.strictOk}/${s.total})`,
    `lenient: ${s.lenientPct}% (${s.lenientOk}/${s.total})`,
    ...extraLines,
    '',
    'top 25 missing templates (strict):',
    ...s.top.map((t) => `- [${t.count}] ${t.template} | e.g. ${t.example}`),
    '',
  ];
  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`\nWrote ${REPORT_PATH}`);
}

async function runStaples(): Promise<Score> {
  let cards = loadStaplesFixture();
  const gzipPath = fs.existsSync(DEFAULT_ORACLE) ? DEFAULT_ORACLE : '';
  if (cards.length === 0 && gzipPath) {
    console.log(`Slicing staples from ${gzipPath} …`);
    cards = await sliceStaplesFromGzip(gzipPath);
    saveStaplesFixture(cards);
    console.log(`Wrote ${STAPLES_PATH} (${cards.length} cards)`);
  } else if (cards.length === 0 && !gzipPath) {
    console.log('No staples fixture and no oracle dump — empty staples run.');
  } else if (gzipPath && cards.length < 50) {
    // Refresh thin fixtures when dump is available
    console.log(`Refreshing staples fixture from ${gzipPath} …`);
    cards = await sliceStaplesFromGzip(gzipPath);
    saveStaplesFixture(cards);
    console.log(`Wrote ${STAPLES_PATH} (${cards.length} cards)`);
  }
  const score = scoreCards('Commander staples', cards);
  printScore(score);
  writeReport(score);
  return score;
}

async function runOracle(oraclePath: string): Promise<Score> {
  const cards: CoverCard[] = [];
  let strictOk = 0;
  let lenientOk = 0;
  const missCards: CoverCard[] = [];
  await streamOracleGzip(oraclePath, (c) => {
    cards.push(c);
    if (cardParseCoverageStrict(c).ok) strictOk += 1;
    else missCards.push(c);
    if (cardParseCoverage(toCardData(c)).ok) lenientOk += 1;
    // keep only misses for template clustering to bound memory
    return;
  });
  const total = cards.length;
  const score: Score = {
    label: `Oracle dump (${oraclePath})`,
    total,
    strictOk,
    lenientOk,
    strictPct: total ? Math.round((1000 * strictOk) / total) / 10 : 0,
    lenientPct: total ? Math.round((1000 * lenientOk) / total) / 10 : 0,
    top: missingTemplates(missCards.length ? missCards : cards),
  };
  printScore(score);
  writeReport(score, ['mode: --oracle']);
  return score;
}

function runDemo(): Score {
  const g = createDemoGame();
  const demoCards: CoverCard[] = [];
  for (const p of g.players) {
    for (const zone of [...p.library, ...p.hand, ...p.commandZone, ...p.battlefield]) {
      demoCards.push({
        oracle_id: zone.card.oracle_id,
        name: zone.card.name,
        mana_cost: zone.card.mana_cost,
        type_line: zone.card.type_line,
        oracle_text: zone.card.oracle_text,
        colors: zone.card.colors,
        color_identity: zone.card.color_identity,
        keywords: zone.card.keywords,
      });
    }
  }
  // unique by oracle_id/name
  const seen = new Set<string>();
  const uniq: CoverCard[] = [];
  for (const c of demoCards) {
    const k = c.oracle_id || c.name;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(c);
  }
  const score = scoreCards('Demo game cards', uniq);
  printScore(score);
  writeReport(score, ['mode: --demo']);
  return score;
}

async function main() {
  const wantJson = argvFlag('--json');
  const oracleArg = argvValue('--oracle');
  const demo = argvFlag('--demo');
  const staples = argvFlag('--staples') || (!demo && !oracleArg);

  let score: Score;
  if (oracleArg) {
    const p = path.resolve(oracleArg);
    if (!fs.existsSync(p)) {
      console.error(`Oracle file missing: ${p} — falling back to staples`);
      score = await runStaples();
    } else {
      score = await runOracle(p);
    }
  } else if (demo) {
    score = runDemo();
  } else if (staples) {
    score = await runStaples();
  } else {
    score = await runStaples();
  }

  if (wantJson) {
    console.log(JSON.stringify(score, null, 2));
  }
  console.log('\nDone.');
}

const runningDirectly = process.argv.some((a) => /oracle-coverage/i.test(a));
if (runningDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
