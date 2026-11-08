import { NextRequest, NextResponse } from 'next/server';
import {
  applyRoomAction,
  authSeat,
  getRoomAsync,
  viewForSeat,
  type RoomAction,
} from '../../../../../lib/server/rooms';
import { isSeatId } from '../../../../../lib/onlineTypes';

/** POST { seat, token, action } */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const seat = body.seat;
  const token = typeof body.token === 'string' ? body.token : '';
  const action = body.action as RoomAction;

  if (!isSeatId(seat)) {
    return NextResponse.json({ error: 'seat required' }, { status: 400 });
  }
  if (!action || typeof action.type !== 'string') {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }

  const room = await getRoomAsync(id);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (!authSeat(room, seat, token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = applyRoomAction(id, seat, token, action);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(viewForSeat(room, seat));
}
