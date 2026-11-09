'use client';

import { useState, type CSSProperties, type KeyboardEvent } from 'react';
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
  /** Board sm / default / hand dock size. */
  size?: 'sm' | 'md' | 'hand';
  /** Combat lane / arrow chrome. */
  combatRole?: 'attacking' | 'blocking' | 'defend-target';
  /** When set, card is HTML5-draggable (Arena-style). */
  dragPayload?: PlayDragPayload;
  dropTarget?: boolean;
  onDropPayload?: (payload: PlayDragPayload) => void;
  className?: string;
  style?: CSSProperties;
};

export function CardTile({
  card,
  onClick,
  legal,
  focus,
  disabled,
  size = 'md',
  combatRole,
  dragPayload,
  dropTarget,
  onDropPayload,
  className,
  style,
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
  const inert = disabled || (!onClick && !canDrag && !dropTarget);
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (inert || !onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <>
      {/* div not <button>: HTML5 drag from <button> is broken in Chrome/Firefox */}
      <div
        role="button"
        tabIndex={inert ? -1 : 0}
        aria-disabled={inert || undefined}
        onClick={inert ? undefined : onClick}
        onKeyDown={onKeyDown}
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
                e.stopPropagation();
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
                e.stopPropagation();
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
        data-card-id={card.id}
        className={[
          'play-card',
          size === 'sm' ? 'play-card--sm' : '',
          size === 'hand' ? 'play-card--hand' : '',
          card.tapped ? 'play-card--tapped' : '',
          legal ? 'play-card--legal' : '',
          focus ? 'play-card--focus' : '',
          canDrag ? 'play-card--draggable' : '',
          art ? 'play-card--art' : '',
          combatRole === 'attacking' ? 'play-card--attacking' : '',
          combatRole === 'blocking' ? 'play-card--blocking' : '',
          combatRole === 'defend-target' ? 'play-card--defend-target' : '',
          inert ? 'play-card--inert' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={tip}
        style={{
          ...(art
            ? {
                backgroundImage: `linear-gradient(to top, rgba(8,12,10,.92) 0%, rgba(8,12,10,.35) 45%, transparent 70%), url(${art})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center top',
              }
            : {}),
          ...style,
        }}
      >
        <div className="play-card__name">{card.card.name}</div>
        <div className="play-card__meta">
          {card.card.mana_cost || '—'}
          {pt ? ` · ${pt}` : ''}
          {card.damageMarked > 0 ? ` · dmg ${card.damageMarked}` : ''}
          {counters ? ` · ${counters}` : ''}
          {card.classLevel != null && card.classLevel > 0
            ? ` · L${card.classLevel}`
            : ''}
          {card.solved ? ' · solved' : ''}
          {card.isCompanion ? ' · companion' : ''}
        </div>
      </div>
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
