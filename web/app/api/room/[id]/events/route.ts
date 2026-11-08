import { NextRequest } from 'next/server';
import { authSeat, getRoomAsync, touchSeat } from '../../../../../lib/server/rooms';
import { isSeatId } from '../../../../../lib/onlineTypes';
import { subscribeRooms } from '../../../../../lib/server/roomStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** SSE: data: {"version":n}\n\n when room changes. */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const roomId = id.toUpperCase();
  const seat = req.nextUrl.searchParams.get('seat');
  const token = req.nextUrl.searchParams.get('token') || '';

  if (!isSeatId(seat)) {
    return new Response('seat required', { status: 400 });
  }

  const room = await getRoomAsync(roomId);
  if (!room) return new Response('Room not found', { status: 404 });
  if (!authSeat(room, seat, token)) return new Response('Unauthorized', { status: 401 });
  touchSeat(room, seat);

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({ version: room.version, hello: true });

      unsubscribe = subscribeRooms((changedId, version) => {
        if (changedId !== roomId) return;
        send({ version });
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      closed = true;
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
