import { NextRequest, NextResponse } from 'next/server';
import { authSeat, getRoom, viewForSeat, type SeatId } from '../../../../lib/server/rooms';

/** GET /api/room/:id?seat=p1&token=... */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const seat = req.nextUrl.searchParams.get('seat') as SeatId | null;
  const token = req.nextUrl.searchParams.get('token') || '';

  if (seat !== 'p1' && seat !== 'p2') {
    return NextResponse.json({ error: 'seat required' }, { status: 400 });
  }

  const room = getRoom(id);
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  if (!authSeat(room, seat, token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(viewForSeat(room, seat));
}
