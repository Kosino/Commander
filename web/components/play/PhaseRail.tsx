'use client';

import type { GameState, StopKey } from '../../lib/engine';
import {
  STOP_RAIL,
  PHASE_RAIL,
  describePhaseStep,
  getClock,
  primaryPrompt,
  stopKeyFor,
} from '../../lib/engine';

type Props = {
  state: GameState;
  youId: string;
  onToggleStop: (key: StopKey) => void;
  onToggleFullControl: () => void;
  onArmHold: () => void;
  onPassTurn: (mode: 'untilResponse' | 'unconditional' | 'off') => void;
  onPrimary: () => void;
  /** When true, primary CTA is rendered elsewhere (e.g. under commander). */
  hidePrimary?: boolean;
};

export function PhaseRail({
  state,
  youId,
  onToggleStop,
  onToggleFullControl,
  onArmHold,
  onPassTurn,
  onPrimary,
  hidePrimary = false,
}: Props) {
  const clock = getClock(state, youId);
  const prompt = primaryPrompt(state, youId);
  const activeKey = stopKeyFor(state, youId);
  const yourStops = STOP_RAIL.filter((s) => s.yours);
  const oppStops = STOP_RAIL.filter((s) => !s.yours);

  return (
    <div className="phase-rail">
      <div className="phase-rail__phases">
        {PHASE_RAIL.map((p) => (
          <span
            key={p.phase}
            className={`phase-rail__phase ${
              state.phase === p.phase ? 'phase-rail__phase--active' : ''
            }`}
          >
            {p.label}
          </span>
        ))}
        <span className="phase-rail__step">
          {describePhaseStep(state.phase, state.step)}
        </span>
      </div>

      <div className="phase-rail__stops" title="Click to set stop (Arena)">
        <span className="phase-rail__stops-label">You</span>
        {yourStops.map((s) => {
          const on = clock.stops.includes(s.key);
          const now = activeKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              className={`phase-rail__stop ${on ? 'phase-rail__stop--on' : ''} ${
                now ? 'phase-rail__stop--now' : ''
              }`}
              onClick={() => onToggleStop(s.key)}
              title={s.label}
            >
              {s.label}
            </button>
          );
        })}
        <span className="phase-rail__stops-label">Opp</span>
        {oppStops.map((s) => {
          const on = clock.stops.includes(s.key);
          const now = activeKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              className={`phase-rail__stop ${on ? 'phase-rail__stop--on' : ''} ${
                now ? 'phase-rail__stop--now' : ''
              }`}
              onClick={() => onToggleStop(s.key)}
              title={s.label}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="phase-rail__actions">
        <button
          type="button"
          className={`phase-rail__chip ${clock.fullControl ? 'phase-rail__chip--on' : ''}`}
          onClick={onToggleFullControl}
          title="Full Control (Ctrl) — never auto-pass"
        >
          Full Control
        </button>
        <button
          type="button"
          className={`phase-rail__chip ${clock.holdPriorityOnce ? 'phase-rail__chip--on' : ''}`}
          onClick={onArmHold}
          title="Hold priority after next spell"
        >
          Hold
        </button>
        <button
          type="button"
          className={`phase-rail__chip ${
            clock.passTurnMode === 'untilResponse' ? 'phase-rail__chip--on' : ''
          }`}
          onClick={() =>
            onPassTurn(clock.passTurnMode === 'untilResponse' ? 'off' : 'untilResponse')
          }
          title="Pass turn until opponent responds (Enter)"
        >
          Pass Turn
        </button>
        <button
          type="button"
          className={`phase-rail__chip ${
            clock.passTurnMode === 'unconditional' ? 'phase-rail__chip--danger' : ''
          }`}
          onClick={() =>
            onPassTurn(clock.passTurnMode === 'unconditional' ? 'off' : 'unconditional')
          }
          title="Unconditional pass turn (Shift+Enter)"
        >
          Pass ∞
        </button>
        {!hidePrimary && (
          <button
            type="button"
            className="phase-rail__primary"
            disabled={!prompt.enabled}
            onClick={onPrimary}
          >
            {prompt.label}
          </button>
        )}
      </div>
    </div>
  );
}
