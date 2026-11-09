'use client';

import {
  effectivePower,
  type GameState,
} from '../../lib/engine';

type DamageTarget =
  | { kind: 'blocker'; blockerId: string }
  | { kind: 'player' };

type Props = {
  state: GameState;
  youId: string;
  onMoveBlocker: (attackerId: string, blockerId: string, direction: -1 | 1) => void;
  onConfirmBlockers: () => void;
  onSetDamage: (attackerId: string, target: DamageTarget, amount: number) => void;
  onConfirmDamage: () => void;
  /** When true, Confirm lives on the Pass/primary CTA — hide duplicate buttons. */
  primaryHandlesConfirm?: boolean;
};

/** Shared Arena combat chrome: blocker order + manual damage assign. */
export function CombatPromptPanel({
  state,
  youId,
  onMoveBlocker,
  onConfirmBlockers,
  onSetDamage,
  onConfirmDamage,
  primaryHandlesConfirm = false,
}: Props) {
  const combat = state.combat;
  if (!combat) return null;

  if (combat.mode === 'declareBlockers' && combat.declaringPlayerId === youId) {
    return (
      <div className="mb-4 p-3 bg-orange-950 border border-orange-700 rounded flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm space-y-2">
          <div className="font-semibold text-orange-200">Declare blockers</div>
          <div className="text-xs text-orange-100/80">
            Focus attacker, then blockers — order = damage assignment. Menace needs ≥2.
          </div>
          <ul className="text-xs space-y-1">
            {combat.attackers.map((a) => (
              <li key={a.attackerId} className="space-y-0.5">
                <div>
                  Atk {a.attackerId.slice(-4)}
                  {combat.focusAttackerId === a.attackerId ? ' (focus)' : ''} ← blockers:
                </div>
                <div className="flex flex-wrap gap-1">
                  {(combat.draftBlocks[a.attackerId] || []).map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center gap-0.5 border border-zinc-600 rounded px-1"
                    >
                      {b.slice(-4)}
                      <button
                        type="button"
                        className="text-[10px] text-zinc-400 hover:text-white"
                        onClick={() => onMoveBlocker(a.attackerId, b, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-zinc-400 hover:text-white"
                        onClick={() => onMoveBlocker(a.attackerId, b, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  ))}
                  {(combat.draftBlocks[a.attackerId] || []).length === 0 && '—'}
                </div>
              </li>
            ))}
          </ul>
        </div>
        {!primaryHandlesConfirm && (
          <button
            type="button"
            onClick={onConfirmBlockers}
            className="text-sm bg-orange-700 hover:bg-orange-600 px-3 py-1.5 rounded"
          >
            Confirm blockers
          </button>
        )}
      </div>
    );
  }

  if (
    combat.mode === 'assignDamage' &&
    state.players[state.activePlayerIndex]?.id === youId
  ) {
    return (
      <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-red-200 text-sm">
            Assign combat damage ({combat.assignWave || 'normal'})
            {primaryHandlesConfirm ? (
              <span className="ml-2 font-normal text-red-100/70">· use Pass / Confirm</span>
            ) : null}
          </div>
          {!primaryHandlesConfirm && (
            <button
              type="button"
              className="text-sm bg-red-700 hover:bg-red-600 px-3 py-1.5 rounded"
              onClick={onConfirmDamage}
            >
              Confirm damage
            </button>
          )}
        </div>
        {Object.entries(combat.damageAssign || {}).map(([atkId, entry]) => {
          const atk = combat.attackers.find((a) => a.attackerId === atkId);
          const af = state.players.flatMap((p) => p.battlefield).find((c) => c.id === atkId);
          const power = af ? effectivePower(af, state) : 0;
          const sum =
            Object.values(entry.toBlockers).reduce((a, b) => a + b, 0) + entry.toPlayer;
          return (
            <div key={atkId} className="text-xs space-y-1 border-t border-red-900/60 pt-2">
              <div className="text-red-100">
                {af?.card.name || atkId.slice(-6)} · power {power} · assigned {sum}
                {sum !== power ? ' (!)' : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                {(atk?.blockers || []).map((bid) => {
                  const bl = state.players
                    .flatMap((p) => p.battlefield)
                    .find((c) => c.id === bid);
                  const cur = entry.toBlockers[bid] || 0;
                  return (
                    <div key={bid} className="inline-flex items-center gap-1 border border-red-900/50 rounded px-1 py-0.5">
                      <span>{bl?.card.name || bid.slice(-4)}</span>
                      <button
                        type="button"
                        className="play-dmg-step"
                        onClick={() =>
                          onSetDamage(atkId, { kind: 'blocker', blockerId: bid }, Math.max(0, cur - 1))
                        }
                      >
                        −
                      </button>
                      <span className="tabular-nums w-4 text-center">{cur}</span>
                      <button
                        type="button"
                        className="play-dmg-step"
                        onClick={() =>
                          onSetDamage(atkId, { kind: 'blocker', blockerId: bid }, cur + 1)
                        }
                      >
                        +
                      </button>
                    </div>
                  );
                })}
                <div className="inline-flex items-center gap-1 border border-red-900/50 rounded px-1 py-0.5">
                  <span>player/PW</span>
                  <button
                    type="button"
                    className="play-dmg-step"
                    onClick={() =>
                      onSetDamage(atkId, { kind: 'player' }, Math.max(0, entry.toPlayer - 1))
                    }
                  >
                    −
                  </button>
                  <span className="tabular-nums w-4 text-center">{entry.toPlayer}</span>
                  <button
                    type="button"
                    className="play-dmg-step"
                    onClick={() => onSetDamage(atkId, { kind: 'player' }, entry.toPlayer + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
