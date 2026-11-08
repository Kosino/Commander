'use client';

import { useState, type ReactNode } from 'react';
import { readPlayDrag, type PlayDragPayload } from './dnd';

type Props = {
  className?: string;
  label?: string;
  active?: boolean;
  onDropPayload: (payload: PlayDragPayload) => void;
  children?: ReactNode;
};

/** Lane / player / stack drop target. */
export function DropZone({ className, label, active = true, onDropPayload, children }: Props) {
  const [over, setOver] = useState(false);
  if (!active) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div
      className={[className, over ? 'play-drop--over' : ''].filter(Boolean).join(' ')}
      aria-label={label}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const p = readPlayDrag(e.dataTransfer);
        if (p) onDropPayload(p);
      }}
    >
      {children}
    </div>
  );
}
