'use client';

import { useState } from 'react';
import type { CardInstance } from '../../lib/engine';
import { scryfallImageUrl } from '../../lib/cardArt';
import {
  encodePlayDrag,
  PLAY_DND_MIME,
  readPlayDrag,
  type PlayDragPayload,
} from './dnd';

type Props = {
  card: CardInstance;
  onClick?: () => void;
  legal?: boolean;
  focus?: boolean;
  disabled?: boolean;
  /** When set, card is HTML5-draggable (Arena-style). */
  dragPayload?: PlayDragPayload;
  dropTarget?: boolean;
  onDropPayload?: (payload: PlayDragPayload) => void;
};

export function CardTile({
  card,
  onClick,
  legal,
  focus,
  disabled,
  dragPayload,
  dropTarget,
  onDropPayload,
}: Props) {
  const [zoom, setZoom] = useState(false);
  const pt =
    card.card.power != null && card.card.toughness != null
      ? `${card.card.power}/${card.card.toughness}`
      : card.card.loyalty
        ? `loy ${card.counters['loyalty'] ?? card.card.loyalty}`
        : null;
  const counters = Object.entries(card.counters)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n}${k}`)
    .join(' ');

  const canDrag = !!dragPayload && !disabled;
  const art =
    card.card.image_uri ||
    (card.faceDown ? null : scryfallImageUrl(card.card.name, 'normal'));
  const tip = [
    card.card.name,
    card.isCompanion ? '(Companion)' : '',
    card.card.oracle_text || '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <>
      <button
        type="button"
        disabled={disabled || (!onClick && !canDrag && !dropTarget)}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!card.faceDown) setZoom(true);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          if (!card.faceDown) setZoom(true);
        }}
        draggable={canDrag}
        onDragStart={
          canDrag
            ? (e) => {
                const raw = encodePlayDrag(dragPayload!);
                e.dataTransfer.setData(PLAY_DND_MIME, raw);
                e.dataTransfer.setData('text/plain', raw);
                e.dataTransfer.effectAllowed = 'move';
                e.currentTarget.classList.add('play-card--dragging');
              }
            : undefined
        }
        onDragEnd={(e) => e.currentTarget.classList.remove('play-card--dragging')}
        onDragOver={
          dropTarget && onDropPayload
            ? (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                e.currentTarget.classList.add('play-card--drop');
              }
            : undefined
        }
        onDragLeave={
          dropTarget ? (e) => e.currentTarget.classList.remove('play-card--drop') : undefined
        }
        onDrop={
          dropTarget && onDropPayload
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.remove('play-card--drop');
                const p = readPlayDrag(e.dataTransfer);
                if (p) onDropPayload(p);
              }
            : undefined
        }
        className={[
          'play-card',
          card.tapped ? 'play-card--tapped' : '',
          legal ? 'play-card--legal' : '',
          focus ? 'play-card--focus' : '',
          canDrag ? 'play-card--draggable' : '',
          art ? 'play-card--art' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={tip}
        style={
          art
            ? {
                backgroundImage: `linear-gradient(to top, rgba(8,12,10,.92) 0%, rgba(8,12,10,.35) 45%, transparent 70%), url(${art})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
              }
            : undefined
        }
      >
        <div className="play-card__name">{card.card.name}</div>
        <div className="play-card__meta">
          {card.card.mana_cost || '—'}
          {pt ? ` · ${pt}` : ''}
          {card.damageMarked > 0 ? ` · dmg ${card.damageMarked}` : ''}
          {counters ? ` · ${counters}` : ''}
          {card.isCompanion ? ' · companion' : ''}
        </div>
      </button>
      {zoom && art && (
        <div
          className="play-card-zoom"
          role="dialog"
          onClick={() => setZoom(false)}
          onKeyDown={(e) => e.key === 'Escape' && setZoom(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art} alt={card.card.name} className="play-card-zoom__img" />
          <p className="play-card-zoom__text">{card.card.oracle_text}</p>
        </div>
      )}
    </>
  );
}
