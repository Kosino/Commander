import {
  GameState,
  activateManaAbility,
  beginActivate,
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
  createGameFromTwoDecks,
  focusAttacker,
  givePriority,
  isValidStoredDeck,
  passPriority,
  playLand,
  moveDraftBlocker,
  resolveCommanderZoneChoice,
  resolveDiscardSelect,
  resolveLegendChoice,
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
import type { RoomAction, SeatId } from '../onlineTypes';
import { notifyRoom, roomMap, saveRooms } from './roomStore';

export type { RoomAction, SeatId };

export interface Room {
  id: string;
  createdAt: number;
  tokens: Record<SeatId, string>;
  joined: Record<SeatId, boolean>;
  names: Record<SeatId, string>;
  decks: Partial<Record<SeatId, StoredDeck | 'demo'>>;
  state: GameState | null;
  version: number;
}

function store() {
  return roomMap();
}

function bump(room: Room): void {
  saveRooms();
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
  const d1 = room.decks.p1 ?? 'demo';
  const d2 = room.decks.p2 ?? 'demo';
  const g = createGameFromTwoDecks(
    { deck: d1, name: room.names.p1 },
    { deck: d2, name: room.names.p2 },
  );
  room.state = givePriority(g, g.activePlayerIndex);
  room.version += 1;
}

export function createRoom(
  hostName: string,
  deckRaw?: unknown,
): { room: Room; seat: SeatId; seatToken: string } | { error: string } {
  const deck = parseDeckInput(deckRaw);
  if (typeof deck === 'object' && 'error' in deck) return deck;

  const id = code();
  const room: Room = {
    id,
    createdAt: Date.now(),
    tokens: { p1: token(), p2: token() },
    joined: { p1: true, p2: false },
    names: { p1: hostName || 'Player 1', p2: 'Player 2' },
    decks: { p1: deck },
    state: null,
    version: 0,
  };
  store().set(id, room);
  bump(room);
  return { room, seat: 'p1', seatToken: room.tokens.p1 };
}

export function joinRoom(
  roomId: string,
  guestName: string,
  deckRaw?: unknown,
): { room: Room; seat: SeatId; seatToken: string } | { error: string } {
  const room = store().get(roomId.toUpperCase());
  if (!room) return { error: 'Room not found' };
  if (room.joined.p2) return { error: 'Room full (2 players only)' };

  const deck = parseDeckInput(deckRaw);
  if (typeof deck === 'object' && 'error' in deck) return deck;

  room.joined.p2 = true;
  room.names.p2 = guestName || 'Player 2';
  room.decks.p2 = deck;
  startMatch(room);
  bump(room);
  return { room, seat: 'p2', seatToken: room.tokens.p2 };
}

export function getRoom(roomId: string): Room | undefined {
  return store().get(roomId.toUpperCase());
}

export function authSeat(room: Room, seat: SeatId, seatToken: string): boolean {
  return room.tokens[seat] === seatToken;
}

/** Public view: hide opponent hand card faces. */
export function viewForSeat(room: Room, seat: SeatId): {
  version: number;
  names: Record<SeatId, string>;
  joined: Record<SeatId, boolean>;
  you: SeatId;
  deckHint: Record<SeatId, string>;
  state: GameState | null;
} {
  const deckHint: Record<SeatId, string> = {
    p1: !room.decks.p1 ? '—' : room.decks.p1 === 'demo' ? 'demo' : room.decks.p1.name || 'custom',
    p2: !room.decks.p2 ? '—' : room.decks.p2 === 'demo' ? 'demo' : room.decks.p2.name || 'custom',
  };

  if (!room.state) {
    return {
      version: room.version,
      names: room.names,
      joined: room.joined,
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
    names: room.names,
    joined: room.joined,
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
  const room = getRoom(roomId);
  if (!room) return { error: 'Room not found' };
  if (!authSeat(room, seat, seatToken)) return { error: 'Unauthorized' };
  if (!room.state) return { error: 'Game not started (waiting for opponent)' };
  if (!actorOk(room.state, seat, action)) return { error: 'Not your action' };

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
    case 'resolveLegend':
      s = resolveLegendChoice(s, action.keepId);
      break;
    case 'resolveCommanderZone':
      s = resolveCommanderZoneChoice(s, action.cardId, action.toCommandZone);
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
