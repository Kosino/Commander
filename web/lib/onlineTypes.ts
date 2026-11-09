/** Client-safe types for online multiplayer (no server store). */
export type { GameState } from './engine';
export type { TargetRef } from './engine';

export type SeatId = 'p1' | 'p2' | 'p3' | 'p4';
export const ALL_SEATS: SeatId[] = ['p1', 'p2', 'p3', 'p4'];
export type MaxSeats = 2 | 3 | 4;

export function isSeatId(v: unknown): v is SeatId {
  return v === 'p1' || v === 'p2' || v === 'p3' || v === 'p4';
}

export type RoomAction =
  | { type: 'pass' }
  | { type: 'playLand'; cardId: string }
  | { type: 'beginCast'; cardId: string }
  | { type: 'beginCastCommander'; cardId: string }
  | { type: 'beginCastFlashback'; cardId: string }
  | { type: 'beginCastJumpStart'; cardId: string }
  | { type: 'beginCastEscape'; cardId: string }
  | { type: 'beginCastRetrace'; cardId: string }
  | { type: 'beginCastDash'; cardId: string }
  | { type: 'beginCastBlitz'; cardId: string }
  | { type: 'beginCastSpectacle'; cardId: string }
  | { type: 'beginEmbalm'; cardId: string }
  | { type: 'beginCastEvoke'; cardId: string }
  | { type: 'beginCastOverload'; cardId: string }
  | { type: 'beginUnearth'; cardId: string }
  | { type: 'beginCycle'; cardId: string }
  | { type: 'selectCastTarget'; target: import('./engine').TargetRef }
  | { type: 'selectCastMode'; modeIndex: number }
  | { type: 'setCastX'; xValue: number }
  | { type: 'setCastKicker'; pay: boolean }
  | { type: 'setCastBuyback'; pay: boolean }
  | { type: 'toggleConvokeCreature'; creatureId: string }
  | { type: 'toggleImproviseArtifact'; permanentId: string }
  | { type: 'toggleDelveCard'; cardId: string }
  | { type: 'confirmConvokeDelve' }
  | { type: 'cancelCast' }
  | { type: 'confirmCastPay' }
  | { type: 'setPreferPhyrexianLife'; prefer: boolean }
  | { type: 'setHybridPick'; index: number; color: import('./engine').ManaColor }
  | { type: 'toggleCostDiscard'; cardId: string }
  | { type: 'toggleCostSacrifice'; permanentId: string }
  | { type: 'confirmAdditionalCost' }
  | {
      type: 'setAttackerDefendTarget';
      attackerId: string;
      defendingPlayerId: string;
      defendingPlaneswalkerId?: string | null;
      defendingBattleId?: string | null;
    }
  | { type: 'dropBlockerOnAttacker'; attackerId: string; blockerId: string }
  | { type: 'activateMana'; cardId: string }
  | { type: 'autoTapForPending' }
  | { type: 'beginActivate'; cardId: string }
  | { type: 'toggleDraftAttacker'; creatureId: string }
  | { type: 'setDefendPlayer'; defendingPlayerId: string }
  | { type: 'setDefendPlaneswalker'; planeswalkerId: string | null }
  | { type: 'confirmAttackers' }
  | { type: 'focusAttacker'; attackerId: string }
  | { type: 'toggleDraftBlocker'; attackerId: string; blockerId: string }
  | { type: 'confirmBlockers' }
  | { type: 'confirmDamageAssign' }
  | {
      type: 'setDamageAssignAmount';
      attackerId: string;
      target: { kind: 'blocker'; blockerId: string } | { kind: 'player' };
      amount: number;
    }
  | { type: 'beginLoyalty'; permanentId: string; abilityIndex: number }
  | { type: 'cancelLoyalty' }
  | { type: 'beginActivatedIndex'; permanentId: string; abilityIndex: number }
  | { type: 'cancelActivated' }
  | { type: 'resolveTriggerOrder'; orderedIds: string[] }
  | { type: 'resolveLegend'; keepId: string }
  | { type: 'resolveCommanderZone'; cardId: string; toCommandZone: boolean }
  | { type: 'resolveMulliganKeep' }
  | { type: 'resolveMulliganTake' }
  | { type: 'resolveMulliganBottom'; bottomIds: string[] }
  | { type: 'resolveWard'; pay: boolean }
  | { type: 'resolveScry'; bottomIds: string[] }
  | { type: 'resolveSurveil'; toGyIds: string[] }
  | { type: 'resolveLookAtTop' }
  | { type: 'resolveFabricate'; mode: 'tokens' | 'counters' }
  | { type: 'resolveDiscardSelect'; cardIds: string[] }
  | { type: 'resolveRiot'; permanentId: string; choice: 'haste' | 'counter' }
  | { type: 'resolveSacrificePermanents'; permanentIds: string[] }
  | { type: 'resolveDevour'; creatureIds: string[] }
  | { type: 'resolveOptionalEffect'; take: boolean }
  | { type: 'resolveBattleProtector'; opponentId: string }
  | { type: 'confirmEscapeExile' }
  | { type: 'toggleEscapeExile'; cardId: string }
  | { type: 'setDefendBattle'; battleId: string | null }
  | { type: 'toggleStop'; key: import('./engine').StopKey }
  | { type: 'setFullControl'; on: boolean }
  | { type: 'armHoldPriority' }
  | { type: 'clearHoldPriority' }
  | { type: 'setPassTurnMode'; mode: 'off' | 'untilResponse' | 'unconditional' }
  | { type: 'moveDraftBlocker'; attackerId: string; blockerId: string; direction: -1 | 1 };
