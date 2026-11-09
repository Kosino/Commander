'use client';

import { useState } from 'react';
import type { CardInstance } from '../../lib/engine';
import { CardTile } from './CardTile';

type DecideProps = {
  mulligansTaken: number;
  hand: CardInstance[];
  onKeep: () => void;
  onMulligan: () => void;
};

type BottomProps = {
  need: number;
  hand: CardInstance[];
  onDone: (bottomIds: string[]) => void;
};

/** London mulligan — Keep / Mulligan with visible hand. */
export function MulliganDecide({ mulligansTaken, hand, onKeep, onMulligan }: DecideProps) {
  return (
    <div className="play-mulligan">
      <div className="play-mulligan__title">London mulligan</div>
      <div className="play-mulligan__sub">
        {mulligansTaken === 0
          ? 'Opening hand — keep 7 or mulligan'
          : `Mulligan #${mulligansTaken} — keep and put ${mulligansTaken} on bottom, or mulligan again`}
      </div>
      <div className="play-mulligan__hand">
        {hand.map((c) => (
          <CardTile key={c.id} card={c} size="hand" disabled />
        ))}
      </div>
      <div className="play-mulligan__actions">
        <button type="button" className="play-mulligan__btn play-mulligan__btn--keep" onClick={onKeep}>
          Keep
        </button>
        <button type="button" className="play-mulligan__btn" onClick={onMulligan}>
          Mulligan
        </button>
      </div>
    </div>
  );
}

/** After keep with N mulligans — pick N cards to bottom. */
export function MulliganBottom({ need, hand, onDone }: BottomProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= need) return prev;
      return [...prev, id];
    });
  };
  return (
    <div className="play-mulligan">
      <div className="play-mulligan__title">Put {need} on bottom</div>
      <div className="play-mulligan__sub">
        Selected {picked.length}/{need} — order = bottom order
      </div>
      <div className="play-mulligan__hand">
        {hand.map((c) => {
          const on = picked.includes(c.id);
          const ord = on ? picked.indexOf(c.id) + 1 : null;
          return (
            <button
              key={c.id}
              type="button"
              className={`play-mulligan__pick ${on ? 'play-mulligan__pick--on' : ''}`}
              onClick={() => toggle(c.id)}
            >
              <CardTile card={c} size="sm" disabled />
              {ord != null && <span className="play-mulligan__ord">{ord}</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="play-mulligan__btn play-mulligan__btn--keep"
        disabled={picked.length !== need}
        onClick={() => onDone(picked)}
      >
        Confirm bottom
      </button>
    </div>
  );
}
