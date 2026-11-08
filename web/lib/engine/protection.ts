/**
 * Protection from [color] — MVP (702.16): targeting, blocking, damage.
 */
import { CardData, CardInstance, ManaColor } from './types';

const NAME_TO_COLOR: Record<string, ManaColor> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
};

function dataOf(card: CardData | CardInstance): CardData {
  return 'card' in (card as CardInstance) ? (card as CardInstance).card : (card as CardData);
}

/** Colors this permanent has protection from. */
export function getProtectionColors(card: CardData | CardInstance): ManaColor[] {
  const data = dataOf(card);
  const text = (data.oracle_text || '').toLowerCase();
  const out: ManaColor[] = [];
  for (const [name, color] of Object.entries(NAME_TO_COLOR)) {
    if (new RegExp(`protection from ${name}\\b`, 'i').test(text)) {
      out.push(color);
    }
  }
  // keywords array sometimes lists "Protection from red"
  for (const k of data.keywords || []) {
    const m = k.toLowerCase().match(/protection from (white|blue|black|red|green)/);
    if (m) out.push(NAME_TO_COLOR[m[1]]);
  }
  return [...new Set(out)];
}

/** True if any source color is protected against. */
export function protectsFromColors(
  permanent: CardData | CardInstance,
  sourceColors: ManaColor[],
): boolean {
  if (!sourceColors.length) return false;
  const prots = getProtectionColors(permanent);
  return sourceColors.some((c) => prots.includes(c));
}
