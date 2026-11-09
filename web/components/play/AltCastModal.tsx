'use client';

export type AltCastOption = {
  id: string;
  label: string;
  hint?: string;
};

type Props = {
  cardName: string;
  options: AltCastOption[];
  onPick: (id: string) => void;
  onCancel: () => void;
};

/** Choose normal cast vs alt cost (evoke / spectacle / dash / …). */
export function AltCastModal({ cardName, options, onPick, onCancel }: Props) {
  if (options.length <= 1) return null;
  return (
    <div className="play-altcast" role="dialog" aria-label="Cast options">
      <div className="play-altcast__title">Cast {cardName}</div>
      <div className="play-altcast__list">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="play-altcast__opt"
            onClick={() => onPick(o.id)}
          >
            <span className="play-altcast__opt-label">{o.label}</span>
            {o.hint && <span className="play-altcast__opt-hint">{o.hint}</span>}
          </button>
        ))}
      </div>
      <button type="button" className="play-altcast__cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
