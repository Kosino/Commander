import {
  GameState,
  activateManaAbility,
  beginActivate,
  beginLoyalty,
  cancelLoyalty,
  beginActivatedIndex,
  cancelActivated,
  resolveTriggerOrder,
  beginCast,
  beginCastCommander,
  beginCastFlashback,
  beginCastJumpStart,
  beginCastEscape,
  beginCastRetrace,
  beginCastDash,
  beginCastBlitz,
  beginCastSpectacle,
  beginEmbalm,
  beginCastEvoke,
  beginCastOverload,
  beginUnearth,
  beginCycle,
  cancelCast,
  confirmAttackers,
  confirmBlockers,
  confirmDamageAssign,
  setDamageAssignAmount,
  createGameFromSeats,
  focusAttacker,
  givePriority,
  isValidStoredDeck,
  passPriority,
  playLand,
  moveDraftBlocker,
  resolveCommanderZoneChoice,
  resolveDiscardSelect,
  resolveLegendChoice,
  resolveMulliganBottom,
  resolveMulliganKeep,
  resolveMulliganTake,
  resolveRiotChoice,
  resolveSacrificePermanents,
  resolveFabricateChoice,
  resolveLookAtTopChoice,
  resolveScryChoice,
  resolveSurveilChoice,
  resolveWardChoice,
  selectCastTarget,
  selectCastMode,
  setCastX,
  setCastKicker,
  setCastBuyback,
  setDefendPlayer,
  setDefendPlaneswalker,
  toggleConvokeCreature,
  toggleImproviseArtifact,
  toggleDelveCard,
  confirmConvokeDelve,
  toggleDraftAttacker,
  toggleDraftBlocker,
  type StoredDeck,
} from '../engine';
import type { MaxSeats, RoomAction, SeatId } from '../onlineTypes';
import { ALL_SEATS } from '../onlineTypes';
import { hydrateRoomFromRedis, notifyRoom, roomMap, saveRooms } from './roomStore';

export type { RoomAction, SeatId };

export interface Room {
  id: string;
  createdAt: number;
  maxSeats: MaxSeats;
  tokens: Partial<Record<SeatId, string>>;
  joined: Partial<Record<SeatId, boolean>>;
  names: Partial<Record<SeatId, string>>;
  decks: Partial<Record<SeatId, StoredDeck | 'demo'>>;
  /** Last activity per seat (reconnect / presence). */
  lastSeen: Partial<Record<SeatId, number>>;
  state: GameState | null;
  version: number;
}

function seatsFor(max: MaxSeats): SeatId[] {
  return ALL_SEATS.slice(0, max);
}

function store() {
  return roomMap();
}

function bump(room: Room): void {
  saveRooms(room);
  notifyRoom(room.id, room.version);
}

function code(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function token(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function parseDeckInput(raw: unknown): StoredDeck | 'demo' | { error: string } {
  if (raw === undefined || raw === null || raw === 'demo') return 'demo';
  if (!isValidStoredDeck(raw)) return { error: 'Invalid deck (need commander + cards[])' };
  return raw;
}

function startMatch(room: Room): void {
  const seats = seatsFor(room.maxSeats).filter((s) => room.joined[s]);
  if (seats.length < 2) return;
  const g = createGameFromSeats(
    seats.map((seat) => ({
      seat,
      deck: room.decks[seat] ?? 'demo',
      name: room.names[seat] || seat,
    })),
  );
  room.state = givePriority(g, g.activePlayerIndex);
  room.version += 1;
}

function joinedCount(room: Room): number {
  return seatsFor(room.maxSeats).filter((s) => room.joined[s]).length;
}

export function createRoom(
  hostName: string,
  deckRaw?: unknown,
  maxSeats: MaxSeats = 2,
): { room: Room; seat: SeatId; seatToken: string } | { error: string } {
  const deck = parseDeckInput(deckRaw);
  if (typeof deck === 'object' && 'error' in deck) return deck;
  const max: MaxSeats = maxSeats === 3 || maxSeats === 4 ? maxSeats : 2;

  const id = code();
  const tokens: Partial<Record<SeatId, string>> = {};
  const joined: Partial<Record<SeatId, boolean>> = {};
  const names: Partial<Record<SeatId, string>> = {};
  for (const s of seatsFor(max)) {
    tokens[s] = token();
    joined[s] = false;
    names[s] = s === 'p1' ? hostName || 'Player 1' : `Player ${s.slice(1)}`;
  }
  joined.p1 = true;
  const room: Room = {
    id,
    createdAt: Date.now(),
    maxSeats: max,
    tokens,
    joined,
    names,
    decks: { p1: deck },
    lastSeen: { p1: Date.now() },
    state: null,
    version: 0,
  };
  store().set(id, room);
  bump(room);
  return { room, seat: 'p1', seatToken: room.tokens.p1! };
}

export async function joinRoom(
  roomId: string,
  guestName: string,
  deckRaw?: unknown,
): Promise<{ room: Room; seat: SeatId; seatToken: string } | { error: string }> {
  const room = (await getRoomAsync(roomId)) || store().get(roomId.toUpperCase());
  if (!room) return { error: 'Room not found' };
  // Migrate legacy rooms without maxSeats
  if (!room.maxSeats) room.maxSeats = 2;
  if (!room.lastSeen) room.lastSeen = {};

  const open = seatsFor(room.maxSeats).find((s) => !room.joined[s]);
  if (!open) return { error: `Room full (${room.maxSeats} players)` };
  if (room.state) return { error: 'Game already started' };

  const deck = parseDeckInput(deckRaw);
  if (typeof deck === 'object' && 'error' in deck) return deck;

  room.joined[open] = true;
  room.names[open] = guestName || `Player ${open.slice(1)}`;
  room.decks[open] = deck;
  room.lastSeen[open] = Date.now();
  if (!room.tokens[open]) room.tokens[open] = token();

  if (joinedCount(room) >= room.maxSeats) {
    startMatch(room);
  } else {
    room.version += 1;
  }
  bump(room);
  return { room, seat: open, seatToken: room.tokens[open]! };
}

/** Host starts early when ≥2 seats filled (EDH lobby). */
export async function startRoom(
  roomId: string,
  seat: SeatId,
  seatToken: string,
): Promise<{ room: Room } | { error: string }> {
  const room = (await getRoomAsync(roomId)) || store().get(roomId.toUpperCase());
  if (!room) return { error: 'Room not found' };
  if (!authSeat(room, seat, seatToken)) return { error: 'Unauthorized' };
  if (seat !== 'p1') return { error: 'Only host can start' };
  if (room.state) return { error: 'Already started' };
  if (joinedCount(room) < 2) return { error: 'Need at least 2 players' };
  startMatch(room);
  bump(room);
  return { room };
}

/** Reconnect with existing seat token (presence). */
export function touchSeat(room: Room, seat: SeatId): void {
  if (!room.lastSeen) room.lastSeen = {};
  room.lastSeen[seat] = Date.now();
}

export function getRoom(roomId: string): Room | undefined {
  return store().get(roomId.toUpperCase());
}

/** Prefer this in API routes when REDIS_URL may be set (cross-instance). */
export async function getRoomAsync(roomId: string): Promise<Room | undefined> {
  const id = roomId.toUpperCase();
  const local = store().get(id);
  if (local) return local;
  return hydrateRoomFromRedis(id);
}

export function authSeat(room: Room, seat: SeatId, seatToken: string): boolean {
  return !!room.tokens[seat] && room.tokens[seat] === seatToken;
}

/** Public view: hide opponent hand card faces. */
export function viewForSeat(room: Room, seat: SeatId): {
  version: number;
  maxSeats: MaxSeats;
  names: Partial<Record<SeatId, string>>;
  joined: Partial<Record<SeatId, boolean>>;
  lastSeen: Partial<Record<SeatId, number>>;
  you: SeatId;
  deckHint: Partial<Record<SeatId, string>>;
  state: GameState | null;
} {
  if (!room.maxSeats) room.maxSeats = 2;
  const deckHint: Partial<Record<SeatId, string>> = {};
  for (const s of seatsFor(room.maxSeats)) {
    const d = room.decks[s];
    deckHint[s] = !d ? '—' : d === 'demo' ? 'demo' : d.name || 'custom';
  }

  if (!room.state) {
    return {
      version: room.version,
      maxSeats: room.maxSeats,
      names: room.names,
      joined: room.joined,
      lastSeen: room.lastSeen || {},
      you: seat,
      deckHint,
      state: null,
    };
  }

  const state: GameState = structuredClone(room.state);
  for (const p of state.players) {
    if (p.id !== seat) {
      p.hand = p.hand.map((c) => ({
        ...c,
        card: {
          ...c.card,
          name: 'Card',
          oracle_text: undefined,
          mana_cost: undefined,
          type_line: '',
        },
        faceDown: true,
      }));
    }
  }

  return {
    version: room.version,
    maxSeats: room.maxSeats,
    names: room.names,
    joined: room.joined,
    lastSeen: room.lastSeen || {},
    you: seat,
    deckHint,
    state,
  };
}

function actorOk(state: GameState, seat: SeatId, _action: RoomAction): boolean {
  if (state.pendingChoices.length > 0) {
    return state.pendingChoices[0].playerId === seat;
  }
  if (state.pendingCast) return state.pendingCast.playerId === seat;
  if (state.combat?.mode === 'declareAttackers' || state.combat?.mode === 'declareBlockers') {
    return state.combat.declaringPlayerId === seat;
  }
  return state.players[state.priorityPlayerIndex]?.id === seat;
}

export function applyRoomAction(
  roomId: string,
  seat: SeatId,
  seatToken: string,
  action: RoomAction,
): { version: number; state: GameState } | { error: string } {
  // Caller should hydrate via getRoomAsync first when using Redis.
  const room = getRoom(roomId);
  if (!room) return { error: 'Room not found' };
  if (!authSeat(room, seat, seatToken)) return { error: 'Unauthorized' };
  if (!room.state) return { error: 'Game not started (waiting for players)' };
  if (!actorOk(room.state, seat, action)) return { error: 'Not your action' };
  touchSeat(room, seat);

  let s = room.state;
  switch (action.type) {
    case 'pass':
      s = passPriority(s);
      break;
    case 'playLand':
      s = playLand(s, seat, action.cardId);
      break;
    case 'beginCast': {
      const before = s;
      s = beginCast(s, seat, action.cardId);
      if (s === before) s = beginCastSpectacle(s, seat, action.cardId);
      if (s === before) s = beginCastDash(s, seat, action.cardId);
      if (s === before) s = beginCastBlitz(s, seat, action.cardId);
      if (s === before) s = beginCycle(s, seat, action.cardId);
      break;
    }
    case 'beginCastCommander':
      s = beginCastCommander(s, seat, action.cardId);
      break;
    case 'beginCastFlashback': {
      const before = s;
      s = beginCastFlashback(s, seat, action.cardId);
      if (s === before) s = beginCastJumpStart(s, seat, action.cardId);
      if (s === before) s = beginCastEscape(s, seat, action.cardId);
      if (s === before) s = beginCastRetrace(s, seat, action.cardId);
      if (s === before) s = beginEmbalm(s, seat, action.cardId);
      if (s === before) s = beginUnearth(s, seat, action.cardId);
      break;
    }
    case 'beginCastJumpStart':
      s = beginCastJumpStart(s, seat, action.cardId);
      break;
    case 'beginCastEscape':
      s = beginCastEscape(s, seat, action.cardId);
      break;
    case 'beginCastRetrace':
      s = beginCastRetrace(s, seat, action.cardId);
      break;
    case 'beginCastDash':
      s = beginCastDash(s, seat, action.cardId);
      break;
    case 'beginCastBlitz':
      s = beginCastBlitz(s, seat, action.cardId);
      break;
    case 'beginCastSpectacle':
      s = beginCastSpectacle(s, seat, action.cardId);
      break;
    case 'beginEmbalm':
      s = beginEmbalm(s, seat, action.cardId);
      break;
    case 'beginCastEvoke':
      s = beginCastEvoke(s, seat, action.cardId);
      break;
    case 'beginCastOverload':
      s = beginCastOverload(s, seat, action.cardId);
      break;
    case 'beginUnearth':
      s = beginUnearth(s, seat, action.cardId);
      break;
    case 'beginCycle':
      s = beginCycle(s, seat, action.cardId);
      break;
    case 'selectCastTarget':
      s = selectCastTarget(s, action.target);
      break;
    case 'selectCastMode':
      s = selectCastMode(s, action.modeIndex);
      break;
    case 'setCastX':
      s = setCastX(s, action.xValue);
      break;
    case 'setCastKicker':
      s = setCastKicker(s, action.pay);
      break;
    case 'setCastBuyback':
      s = setCastBuyback(s, action.pay);
      break;
    case 'toggleConvokeCreature':
      s = toggleConvokeCreature(s, action.creatureId);
      break;
    case 'toggleImproviseArtifact':
      s = toggleImproviseArtifact(s, action.permanentId);
      break;
    case 'toggleDelveCard':
      s = toggleDelveCard(s, action.cardId);
      break;
    case 'confirmConvokeDelve':
      s = confirmConvokeDelve(s);
      break;
    case 'cancelCast':
      s = cancelCast(s);
      break;
    case 'activateMana': {
      const before = s;
      s = activateManaAbility(s, seat, action.cardId);
      if (s === before) s = beginActivate(s, seat, action.cardId);
      break;
    }
    case 'beginActivate':
      s = beginActivate(s, seat, action.cardId);
      break;
    case 'toggleDraftAttacker':
      s = toggleDraftAttacker(s, action.creatureId);
      break;
    case 'setDefendPlayer':
      s = setDefendPlayer(s, action.defendingPlayerId);
      break;
    case 'setDefendPlaneswalker':
      s = setDefendPlaneswalker(s, action.planeswalkerId);
      break;
    case 'confirmAttackers': {
      const next = confirmAttackers(s);
      s = givePriority(next, next.priorityPlayerIndex);
      break;
    }
    case 'focusAttacker':
      s = focusAttacker(s, action.attackerId);
      break;
    case 'toggleDraftBlocker':
      s = toggleDraftBlocker(s, action.attackerId, action.blockerId);
      break;
    case 'confirmBlockers': {
      const next = confirmBlockers(s);
      s = givePriority(next, next.priorityPlayerIndex);
      break;
    }
    case 'confirmDamageAssign':
      s = confirmDamageAssign(s);
      break;
    case 'setDamageAssignAmount':
      s = setDamageAssignAmount(s, action.attackerId, action.target, action.amount);
      break;
    case 'beginLoyalty':
      s = beginLoyalty(s, seat, action.permanentId, action.abilityIndex);
      break;
    case 'cancelLoyalty':
      s = cancelLoyalty(s);
      break;
    case 'beginActivatedIndex':
      s = beginActivatedIndex(s, seat, action.permanentId, action.abilityIndex);
      break;
    case 'cancelActivated':
      s = cancelActivated(s);
      break;
    case 'resolveTriggerOrder':
      s = resolveTriggerOrder(s, action.orderedIds);
      break;
    case 'resolveLegend':
      s = resolveLegendChoice(s, action.keepId);
      break;
    case 'resolveCommanderZone':
      s = resolveCommanderZoneChoice(s, action.cardId, action.toCommandZone);
      break;
    case 'resolveMulliganKeep':
      s = resolveMulliganKeep(s, seat);
      break;
    case 'resolveMulliganTake':
      s = resolveMulliganTake(s, seat);
      break;
    case 'resolveMulliganBottom':
      s = resolveMulliganBottom(s, seat, action.bottomIds);
      break;
    case 'resolveWard':
      s = resolveWardChoice(s, action.pay);
      break;
    case 'resolveScry':
      s = resolveScryChoice(s, action.bottomIds);
      break;
    case 'resolveSurveil':
      s = resolveSurveilChoice(s, action.toGyIds);
      break;
    case 'resolveLookAtTop':
      s = resolveLookAtTopChoice(s);
      break;
    case 'resolveFabricate':
      s = resolveFabricateChoice(s, action.mode);
      break;
    case 'resolveDiscardSelect':
      s = resolveDiscardSelect(s, action.cardIds);
      break;
    case 'resolveRiot':
      s = resolveRiotChoice(s, action.permanentId, action.choice);
      break;
    case 'resolveSacrificePermanents':
      s = resolveSacrificePermanents(s, action.permanentIds);
      break;
    case 'moveDraftBlocker':
      s = moveDraftBlocker(s, action.attackerId, action.blockerId, action.direction);
      break;
    default:
      return { error: 'Unknown action' };
  }

  room.state = s;
  room.version += 1;
  bump(room);
  return { version: room.version, state: s };
}
