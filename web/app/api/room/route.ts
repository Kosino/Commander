import { NextRequest, NextResponse } from 'next/server';
import { createRoom, joinRoom, startRoom } from '../../../lib/server/rooms';
import { isSeatId, type MaxSeats } from '../../../lib/onlineTypes';

/** POST { action: 'create'|'join'|'start', name?, roomId?, deck?, maxSeats?, seat?, token? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const deck = body.deck;

  if (body.action === 'create') {
    const ms = Number(body.maxSeats);
    const maxSeats: MaxSeats = ms === 3 || ms === 4 ? ms : 2;
    const result = createRoom(name || 'Player 1', deck, maxSeats);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      roomId: result.room.id,
      seat: result.seat,
      seatToken: result.seatToken,
      maxSeats: result.room.maxSeats,
      joined: result.room.joined,
      names: result.room.names,
    });
  }

  if (body.action === 'join') {
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    const result = await joinRoom(roomId, name || 'Player 2', deck);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      roomId: result.room.id,
      seat: result.seat,
      seatToken: result.seatToken,
      maxSeats: result.room.maxSeats,
      joined: result.room.joined,
      names: result.room.names,
      version: result.room.version,
    });
  }

  if (body.action === 'start') {
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    const seat = body.seat;
    const token = typeof body.token === 'string' ? body.token : '';
    if (!isSeatId(seat)) {
      return NextResponse.json({ error: 'seat required' }, { status: 400 });
    }
    const result = await startRoom(roomId, seat, token);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      roomId: result.room.id,
      maxSeats: result.room.maxSeats,
      joined: result.room.joined,
      names: result.room.names,
      version: result.room.version,
      started: !!result.room.state,
    });
  }

  return NextResponse.json({ error: 'action must be create|join|start' }, { status: 400 });
}
