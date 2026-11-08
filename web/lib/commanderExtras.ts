import type { Card } from './deck';
// type-only import — no runtime cycle with deck.ts

/** Partner / Partner with (702.123). */
export function hasPartner(card: Card | { oracle_text?: string; keywords?: string[] }): boolean {
  const kw = (card as { keywords?: string[] }).keywords || [];
  if (kw.some((k) => /^partner\b/i.test(k))) return true;
  const t = card.oracle_text || '';
  return /\bPartner(?:\s+with\s+[^\n(]+)?\b/i.test(t);
}

/** Named "Partner with NAME". */
export function partnerWithName(card: Card): string | null {
  const m = (card.oracle_text || '').match(/\bPartner\s+with\s+([^\n(]+)/i);
  if (!m) return null;
  return m[1].replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function hasCompanion(card: Card | { oracle_text?: string; keywords?: string[] }): boolean {
  const kw = (card as { keywords?: string[] }).keywords || [];
  if (kw.some((k) => /^companion\b/i.test(k))) return true;
  return /\bCompanion\b/i.test(card.oracle_text || '');
}

/** Two cards can be partners together. */
export function partnersCompatible(a: Card, b: Card): boolean {
  if (!hasPartner(a) || !hasPartner(b)) return false;
  const aw = partnerWithName(a);
  const bw = partnerWithName(b);
  if (aw && bw) {
    return (
      aw.toLowerCase() === b.name.toLowerCase() &&
      bw.toLowerCase() === a.name.toLowerCase()
    );
  }
  if (aw) return aw.toLowerCase() === b.name.toLowerCase() && !bw;
  if (bw) return bw.toLowerCase() === a.name.toLowerCase() && !aw;
  // Generic Partner + generic Partner
  return !aw && !bw;
}

export function mergedColorIdentity(...cards: (Card | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const c of cards) {
    for (const col of c?.color_identity || []) set.add(col);
  }
  return [...set];
}
