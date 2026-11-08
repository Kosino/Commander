import fs from 'fs';
import path from 'path';
import type { Room } from './rooms';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

type Listener = (roomId: string, version: number) => void;

type GlobalBag = {
  __mtgRooms?: Map<string, Room>;
  __mtgRoomListeners?: Set<Listener>;
  __mtgRoomsLoaded?: boolean;
};

function g(): GlobalBag {
  return globalThis as unknown as GlobalBag;
}

function ensureLoaded(): Map<string, Room> {
  const bag = g();
  if (!bag.__mtgRooms) bag.__mtgRooms = new Map();
  if (!bag.__mtgRoomListeners) bag.__mtgRoomListeners = new Set();

  if (!bag.__mtgRoomsLoaded) {
    bag.__mtgRoomsLoaded = true;
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Room[];
        const now = Date.now();
        for (const room of raw) {
          if (!room?.id) continue;
          if (now - (room.createdAt || 0) > MAX_AGE_MS) continue;
          bag.__mtgRooms.set(room.id, room);
        }
      }
    } catch (err) {
      console.error('roomStore load failed', err);
    }
  }
  return bag.__mtgRooms;
}

function persist(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const rooms = [...ensureLoaded().values()];
    fs.writeFileSync(DATA_FILE, JSON.stringify(rooms), 'utf8');
  } catch (err) {
    console.error('roomStore persist failed', err);
  }
}

export function roomMap(): Map<string, Room> {
  return ensureLoaded();
}

export function saveRooms(): void {
  persist();
}

export function subscribeRooms(listener: Listener): () => void {
  const bag = g();
  if (!bag.__mtgRoomListeners) bag.__mtgRoomListeners = new Set();
  bag.__mtgRoomListeners.add(listener);
  return () => bag.__mtgRoomListeners?.delete(listener);
}

export function notifyRoom(roomId: string, version: number): void {
  const bag = g();
  for (const l of bag.__mtgRoomListeners || []) {
    try {
      l(roomId, version);
    } catch {
      /* ignore listener errors */
    }
  }
}
