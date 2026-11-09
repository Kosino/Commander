/** Scryfall CDN image helpers (no local art dump). */

export function scryfallImageUrl(
  name: string,
  version: 'small' | 'normal' | 'large' | 'art_crop' = 'normal',
): string {
  const q = encodeURIComponent(name);
  return `https://api.scryfall.com/cards/named?exact=${q}&format=image&version=${version}`;
}

export function scryfallArtCropUrl(name: string): string {
  return scryfallImageUrl(name, 'art_crop');
}

export async function scryfallAutocomplete(q: string): Promise<string[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(
    `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q.trim())}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: string[] };
  return data.data || [];
}

export async function scryfallNamedCard(name: string): Promise<{
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  color_identity?: string[];
  oracle_id?: string;
  keywords?: string[];
  image_uri?: string;
} | null> {
  const res = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
  );
  if (!res.ok) return null;
  const c = await res.json();
  const face = Array.isArray(c.card_faces) ? c.card_faces[0] : null;
  return {
    name: c.name,
    mana_cost: c.mana_cost || face?.mana_cost,
    type_line: c.type_line || face?.type_line,
    oracle_text: c.oracle_text || face?.oracle_text,
    power: c.power || face?.power,
    toughness: c.toughness || face?.toughness,
    color_identity: c.color_identity,
    oracle_id: c.oracle_id,
    keywords: c.keywords,
    image_uri: c.image_uris?.normal || face?.image_uris?.normal,
  };
}
