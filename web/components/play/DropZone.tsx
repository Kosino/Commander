'use client';

import { useState, type ReactNode } from 'react';
import { readPlayDrag, type PlayDragPayload } from './dnd';

type Props = {
  className?: string;
  label?: string;
  active?: boolean;
  /** Shown via CSS when lane is empty (`data-empty`). */
  emptyHint?: string;
  /** If set, only these payload sources are handled (others fall through). */
  acceptSrc?: PlayDragPayload['src'][];
  onDropPayload: (payload: PlayDragPayload) => void;
  children?: ReactNode;
};

/**
 * Lane / player / stack drop target.
 * dragOver uses capture + preventDefault so child cards cannot block drops.
 * drop uses bubble so a child CardTile dropTarget can handle combat first.
 */
export function DropZone({
  className,
  label,
  active = true,
  emptyHint,
  acceptSrc,
  onDropPayload,
  children,
}: Props) {
  const [over, setOver] = useState(false);
  const dataAttrs = emptyHint ? { 'data-empty': emptyHint } : undefined;
  if (!active) {
    return (
      <div className={className} {...dataAttrs}>
        {children}
      </div>
    );
  }

  const accepts = (p: PlayDragPayload) => !acceptSrc || acceptSrc.includes(p.src);

  return (
    <div
      className={[className, over ? 'play-drop--over' : ''].filter(Boolean).join(' ')}
      aria-label={label}
      {...dataAttrs}
      onDragEnterCapture={(e) => {
        e.preventDefault();
      }}
      onDragOverCapture={(e) => {
        // Must preventDefault in capture so drops work over non-droppable children
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOver(false);
        }
      }}
      onDrop={(e) => {
        const p = readPlayDrag(e.dataTransfer);
        if (!p || !accepts(p)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onDropPayload(p);
      }}
    >
      {children}
    </div>
  );
}
