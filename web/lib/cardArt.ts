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
