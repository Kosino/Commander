/** Arena-style drag payloads for play table. */
export type PlayDragPayload =
  | { src: 'hand'; cardId: string }
  | { src: 'command'; cardId: string }
  | { src: 'bf'; playerId: string; cardId: string }
  | { src: 'gy'; cardId: string };

export const PLAY_DND_MIME = 'application/x-mtg-play';

export function encodePlayDrag(p: PlayDragPayload): string {
  return JSON.stringify(p);
}

export function decodePlayDrag(raw: string | undefined | null): PlayDragPayload | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as PlayDragPayload;
    if (!v || typeof v !== 'object' || !('src' in v)) return null;
    return v;
  } catch {
    return null;
  }
}

export function readPlayDrag(dt: DataTransfer | null): PlayDragPayload | null {
  if (!dt) return null;
  return (
    decodePlayDrag(dt.getData(PLAY_DND_MIME)) ||
    decodePlayDrag(dt.getData('text/plain'))
  );
}
