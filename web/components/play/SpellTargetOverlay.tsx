'use client';

import { useLayoutEffect, useState } from 'react';
import type { GameState, TargetRef } from '../../lib/engine';

type Drawn = { id: string; d: string; dashed?: boolean; stack?: boolean };

function centerIn(root: DOMRect, el: Element): { x: number; y: number } | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    x: r.left + r.width / 2 - root.left,
    y: r.top + r.height / 2 - root.top,
  };
}

function curve(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(40, len * 0.16);
  const cx = mx + (dy / len) * bulge;
  const cy = my - (dx / len) * bulge;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

function targetEl(rootEl: HTMLElement, t: TargetRef): Element | null {
  if (t.kind === 'permanent') return rootEl.querySelector(`[data-card-id="${t.permanentId}"]`);
  if (t.kind === 'player') return rootEl.querySelector(`[data-player-id="${t.playerId}"]`);
  if (t.kind === 'stack') return rootEl.querySelector(`[data-stack-id="${t.stackId}"]`);
  return null;
}

type Props = {
  tableRef: React.RefObject<HTMLDivElement | null>;
  state: GameState;
  legalPermanentIds?: Set<string>;
  legalPlayerIds?: Set<string>;
};

/** Arrows from casting source / stack objects to targets (Arena). */
export function SpellTargetOverlay({
  tableRef,
  state,
  legalPermanentIds,
  legalPlayerIds,
}: Props) {
  const [pack, setPack] = useState<{ w: number; h: number; drawn: Drawn[] }>({
    w: 0,
    h: 0,
    drawn: [],
  });

  const pending = state.pendingCast;
  const sig = JSON.stringify({
    cardId: pending?.cardId,
    chosen: pending?.chosen,
    phase: pending?.phase,
    slot: pending?.currentSlot,
    stack: state.stack.map((s) => ({ id: s.id, t: s.targets })),
    legalP: legalPermanentIds ? [...legalPermanentIds] : [],
    legalPl: legalPlayerIds ? [...legalPlayerIds] : [],
  });

  useLayoutEffect(() => {
    const rootEl = tableRef.current;
    if (!rootEl) {
      setPack({ w: 0, h: 0, drawn: [] });
      return;
    }
    const tick = () => {
      const root = rootEl.getBoundingClientRect();
      const drawn: Drawn[] = [];

      if (pending) {
        const src =
          rootEl.querySelector(`[data-card-id="${pending.cardId}"]`) ||
          rootEl.querySelector('[data-cast-source="1"]');
        const from = src ? centerIn(root, src) : null;
        if (from) {
          for (const [key, t] of Object.entries(pending.chosen || {})) {
            const el = targetEl(rootEl, t);
            if (!el) continue;
            const to = centerIn(root, el);
            if (!to) continue;
            drawn.push({ id: `chosen-${key}`, d: curve(from, to) });
          }
          if (legalPermanentIds) {
            for (const id of legalPermanentIds) {
              if (
                Object.values(pending.chosen || {}).some(
                  (t) => t.kind === 'permanent' && t.permanentId === id,
                )
              ) {
                continue;
              }
              const el = rootEl.querySelector(`[data-card-id="${id}"]`);
              if (!el) continue;
              const to = centerIn(root, el);
              if (!to) continue;
              drawn.push({ id: `legal-${id}`, d: curve(from, to), dashed: true });
            }
          }
          if (legalPlayerIds) {
            for (const id of legalPlayerIds) {
              if (
                Object.values(pending.chosen || {}).some(
                  (t) => t.kind === 'player' && t.playerId === id,
                )
              ) {
                continue;
              }
              const el = rootEl.querySelector(`[data-player-id="${id}"]`);
              if (!el) continue;
              const to = centerIn(root, el);
              if (!to) continue;
              drawn.push({ id: `legal-pl-${id}`, d: curve(from, to), dashed: true });
            }
          }
        }
      }

      // Persistent stack targeting arrows (Arena)
      for (const obj of state.stack) {
        if (!obj.targets || !Object.keys(obj.targets).length) continue;
        const src =
          rootEl.querySelector(`[data-stack-id="${obj.id}"]`) ||
          (obj.cardInstance
            ? rootEl.querySelector(`[data-card-id="${obj.cardInstance.id}"]`)
            : null) ||
          (obj.sourcePermanentId
            ? rootEl.querySelector(`[data-card-id="${obj.sourcePermanentId}"]`)
            : null);
        if (!src) continue;
        const from = centerIn(root, src);
        if (!from) continue;
        for (const [key, t] of Object.entries(obj.targets)) {
          const el = targetEl(rootEl, t);
          if (!el) continue;
          const to = centerIn(root, el);
          if (!to) continue;
          drawn.push({ id: `stack-${obj.id}-${key}`, d: curve(from, to), stack: true });
        }
      }

      setPack({ w: root.width, h: root.height, drawn });
    };
    tick();
    const ro = new ResizeObserver(tick);
    ro.observe(rootEl);
    const t = window.setTimeout(tick, 40);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableRef, sig]);

  if (pack.drawn.length === 0 || pack.w < 8) return null;

  return (
    <svg
      className="play-spell-arrows"
      width={pack.w}
      height={pack.h}
      viewBox={`0 0 ${pack.w} ${pack.h}`}
      aria-hidden
    >
      <defs>
        <marker
          id="play-spell-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0.4 L5,3 L0,5.6 Z" fill="rgba(180, 140, 210, 0.92)" />
        </marker>
        <marker
          id="play-stack-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0.4 L5,3 L0,5.6 Z" fill="rgba(212, 168, 75, 0.95)" />
        </marker>
      </defs>
      {pack.drawn.map((a) => (
        <path
          key={a.id}
          d={a.d}
          fill="none"
          stroke={
            a.dashed
              ? 'rgba(180, 140, 210, 0.32)'
              : a.stack
                ? 'rgba(212, 168, 75, 0.88)'
                : 'rgba(180, 140, 210, 0.88)'
          }
          strokeWidth={a.dashed ? 1.4 : 1.9}
          strokeDasharray={a.dashed ? '5 4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={
            a.dashed
              ? undefined
              : a.stack
                ? 'url(#play-stack-arrow)'
                : 'url(#play-spell-arrow)'
          }
        />
      ))}
    </svg>
  );
}
