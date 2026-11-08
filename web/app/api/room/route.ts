import { NextRequest, NextResponse } from 'next/server';
import { createRoom, joinRoom } from '../../../lib/server/rooms';

/** POST { action: 'create'|'join', name?, roomId?, deck? } — deck = StoredDeck | 'demo' | omit */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const deck = body.deck;

  if (body.action === 'create') {
    const result = createRoom(name || 'Player 1', deck);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      roomId: result.room.id,
      seat: result.seat,
      seatToken: result.seatToken,
      joined: result.room.joined,
      names: result.room.names,
    });
  }

  if (body.action === 'join') {
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    const result = joinRoom(roomId, name || 'Player 2', deck);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      roomId: result.room.id,
      seat: result.seat,
      seatToken: result.seatToken,
      joined: result.room.joined,
      names: result.room.names,
      version: result.room.version,
    });
  }

  return NextResponse.json({ error: 'action must be create|join' }, { status: 400 });
}
