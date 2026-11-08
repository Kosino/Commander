/**
 * Room persistence + cross-instance notify.
 * Default: local file `.data/rooms.json`.
 * Multi-instance: set REDIS_URL (or UPSTASH_REDIS_URL) — rooms + pub/sub.
 */
import fs from 'fs';
import path from 'path';
import type { Room } from './rooms';

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h
const REDIS_PREFIX = 'mtg:room:';
const REDIS_INDEX = 'mtg:rooms';
const REDIS_CHANNEL = 'mtg:room-notify';

type Listener = (roomId: string, version: number) => void;

type GlobalBag = {
  __mtgRooms?: Map<string, Room>;
  __mtgRoomListeners?: Set<Listener>;
  __mtgRoomsLoaded?: boolean;
  __mtgRedis?: {
    client: import('redis').RedisClientType;
    sub: import('redis').RedisClientType;
    ready: Promise<void>;
  } | null;
  __mtgRedisTried?: boolean;
};

function g(): GlobalBag {
  return globalThis as unknown as GlobalBag;
}

function redisUrl(): string | undefined {
  return (
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    undefined
  );
}

async function ensureRedis(): Promise<GlobalBag['__mtgRedis']> {
  const bag = g();
  if (bag.__mtgRedisTried) return bag.__mtgRedis ?? null;
  bag.__mtgRedisTried = true;
  const url = redisUrl();
  if (!url) {
    bag.__mtgRedis = null;
    return null;
  }
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url });
    const sub = client.duplicate();
    client.on('error', (e) => console.error('redis client', e));
    sub.on('error', (e) => console.error('redis sub', e));
    const ready = (async () => {
      await client.connect();
      await sub.connect();
      await sub.subscribe(REDIS_CHANNEL, (message) => {
        try {
          const { roomId, version } = JSON.parse(message) as {
            roomId: string;
            version: number;
          };
          for (const l of bag.__mtgRoomListeners || []) {
            try {
              l(roomId, version);
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore bad payload */
        }
      });
    })();
    bag.__mtgRedis = { client, sub, ready };
    await ready;
    console.info('[roomStore] Redis backend active');
    return bag.__mtgRedis;
  } catch (err) {
    console.error('[roomStore] Redis init failed, using file store', err);
    bag.__mtgRedis = null;
    return null;
  }
}

function ensureLoaded(): Map<string, Room> {
  const bag = g();
  if (!bag.__mtgRooms) bag.__mtgRooms = new Map();
  if (!bag.__mtgRoomListeners) bag.__mtgRoomListeners = new Set();

  if (!bag.__mtgRoomsLoaded) {
    bag.__mtgRoomsLoaded = true;
    // Kick Redis connect in background when configured
    void ensureRedis();
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

function persistFile(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const rooms = [...ensureLoaded().values()];
    fs.writeFileSync(DATA_FILE, JSON.stringify(rooms), 'utf8');
  } catch (err) {
    console.error('roomStore persist failed', err);
  }
}

async function persistRedis(room: Room): Promise<void> {
  const r = await ensureRedis();
  if (!r) return;
  await r.ready;
  await r.client.set(`${REDIS_PREFIX}${room.id}`, JSON.stringify(room), {
    EX: Math.ceil(MAX_AGE_MS / 1000),
  });
  await r.client.sAdd(REDIS_INDEX, room.id);
}

/** Load one room from Redis into local cache (multi-instance). */
export async function hydrateRoomFromRedis(roomId: string): Promise<Room | undefined> {
  const r = await ensureRedis();
  if (!r) return ensureLoaded().get(roomId.toUpperCase());
  await r.ready;
  const id = roomId.toUpperCase();
  const raw = await r.client.get(`${REDIS_PREFIX}${id}`);
  if (!raw) return ensureLoaded().get(id);
  try {
    const room = JSON.parse(raw) as Room;
    ensureLoaded().set(id, room);
    return room;
  } catch {
    return ensureLoaded().get(id);
  }
}

export function roomMap(): Map<string, Room> {
  return ensureLoaded();
}

export function saveRooms(room?: Room): void {
  persistFile();
  if (room) {
    void persistRedis(room);
  } else {
    for (const rm of ensureLoaded().values()) {
      void persistRedis(rm);
    }
  }
}

export function subscribeRooms(listener: Listener): () => void {
  const bag = g();
  if (!bag.__mtgRoomListeners) bag.__mtgRoomListeners = new Set();
  bag.__mtgRoomListeners.add(listener);
  void ensureRedis();
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
  void (async () => {
    const r = await ensureRedis();
    if (!r) return;
    await r.ready;
    await r.client.publish(
      REDIS_CHANNEL,
      JSON.stringify({ roomId, version }),
    );
  })();
}

export function usingRedis(): boolean {
  return !!redisUrl();
}
