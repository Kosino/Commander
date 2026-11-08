import { NextRequest, NextResponse } from 'next/server';
import { authSeat, getRoomAsync, touchSeat, viewForSeat } from '../../../../lib/server/rooms';
import { isSeatId } from '../../../../lib/onlineTypes';

/** GET /api/room/:id?seat=p1&token=... */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const seatRaw = req.nextUrl.searchParams.get('seat');
  const token = req.nextUrl.searchParams.get('token') || '';

  if (!isSeatId(seatRaw)) {
    return NextResponse.json({ error: 'seat required' }, { status: 400 });
  }

  const room = await getRoomAsync(id);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (!authSeat(room, seatRaw, token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  touchSeat(room, seatRaw);

  return NextResponse.json(viewForSeat(room, seatRaw));
}
