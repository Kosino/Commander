'use client';

import { useLayoutEffect, useState } from 'react';
import type { GameState } from '../../lib/engine';
import {
  buildCombatArrows,
  type CombatArrow,
  type CombatArrowKind,
} from './combatArrowModel';

type Point = { x: number; y: number };

type Drawn = CombatArrow & {
  d: string;
  color: string;
};

function colorFor(kind: CombatArrowKind): string {
  if (kind === 'block') return 'rgba(110, 190, 140, 0.88)';
  if (kind === 'draft') return 'rgba(212, 168, 75, 0.78)';
  return 'rgba(212, 168, 75, 0.92)';
}

function centerIn(root: DOMRect, el: Element): Point | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    x: r.left + r.width / 2 - root.left,
    y: r.top + r.height / 2 - root.top,
  };
}

function resolveEl(felt: HTMLElement, key: string): Element | null {
  if (key.startsWith('card:')) {
    const id = key.slice(5);
    return felt.querySelector(`[data-card-id="${id.replace(/"/g, '')}"]`);
  }
  if (key.startsWith('player:')) {
    const id = key.slice(7);
    return felt.querySelector(`[data-player-id="${id.replace(/"/g, '')}"]`);
  }
  return null;
}

function curvePath(from: Point, to: Point): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(48, len * 0.18);
  const cx = mx - (dy / len) * bulge;
  const cy = my + (dx / len) * bulge;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

function measure(felt: HTMLElement, state: GameState): { w: number; h: number; drawn: Drawn[] } {
  const root = felt.getBoundingClientRect();
  const arrows = buildCombatArrows(state);
  const drawn: Drawn[] = [];
  for (const a of arrows) {
    const fromEl = resolveEl(felt, a.fromKey);
    const toEl = resolveEl(felt, a.toKey);
    if (!fromEl || !toEl) continue;
    const from = centerIn(root, fromEl);
    const to = centerIn(root, toEl);
    if (!from || !to) continue;
    drawn.push({
      ...a,
      d: curvePath(from, to),
      color: colorFor(a.kind),
    });
  }
  return { w: root.width, h: root.height, drawn };
}

type Props = {
  feltRef: React.RefObject<HTMLDivElement | null>;
  state: GameState;
};

/** SVG overlay of combat attack/block arrows over the Arena felt. */
export function CombatArrowOverlay({ feltRef, state }: Props) {
  const [pack, setPack] = useState<{ w: number; h: number; drawn: Drawn[] }>({
    w: 0,
    h: 0,
    drawn: [],
  });

  const combatSig = JSON.stringify({
    mode: state.combat?.mode,
    draft: state.combat?.draftAttackerIds,
    defend: [
      state.combat?.draftDefendPlayerId,
      state.combat?.draftDefendPlaneswalkerId,
      state.combat?.draftDefendBattleId,
    ],
    attackers: state.combat?.attackers,
    blocks: state.combat?.draftBlocks,
    focus: state.combat?.focusAttackerId,
    turn: state.turnNumber,
    phase: state.phase,
    step: state.step,
  });

  useLayoutEffect(() => {
    const felt = feltRef.current;
    if (!felt) return;

    const tick = () => setPack(measure(felt, state));
    tick();

    const ro = new ResizeObserver(tick);
    ro.observe(felt);
    window.addEventListener('scroll', tick, true);
    const t = window.setTimeout(tick, 40);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', tick, true);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feltRef, combatSig]);

  if (pack.drawn.length === 0 || pack.w < 8 || pack.h < 8) return null;

  return (
    <svg
      className="play-combat-arrows"
      width={pack.w}
      height={pack.h}
      viewBox={`0 0 ${pack.w} ${pack.h}`}
      aria-hidden
    >
      <defs>
        <marker
          id="play-arrow-atk"
          markerWidth="7"
          markerHeight="7"
          refX="5.5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0.4 L5.5,3 L0,5.6 Z" fill="rgba(212, 168, 75, 0.95)" />
        </marker>
        <marker
          id="play-arrow-blk"
          markerWidth="7"
          markerHeight="7"
          refX="5.5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0.4 L5.5,3 L0,5.6 Z" fill="rgba(110, 190, 140, 0.95)" />
        </marker>
        <marker
          id="play-arrow-draft"
          markerWidth="7"
          markerHeight="7"
          refX="5.5"
          refY="3"
          orient="auto"
        >
          <path d="M0,0.4 L5.5,3 L0,5.6 Z" fill="rgba(212, 168, 75, 0.9)" />
        </marker>
      </defs>
      {pack.drawn.map((a) => (
        <path
          key={a.id}
          d={a.d}
          fill="none"
          stroke={a.color}
          strokeWidth={a.kind === 'draft' ? 1.75 : 2.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={
            a.kind === 'block'
              ? 'url(#play-arrow-blk)'
              : a.kind === 'draft'
                ? 'url(#play-arrow-draft)'
                : 'url(#play-arrow-atk)'
          }
          className={`play-combat-arrow play-combat-arrow--${a.kind}`}
        />
      ))}
    </svg>
  );
}
