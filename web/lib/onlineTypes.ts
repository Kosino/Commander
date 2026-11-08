/** Client-safe types for online 2P (no server store). */
export type { GameState } from './engine';
export type { TargetRef } from './engine';

export type SeatId = 'p1' | 'p2';

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
  | { type: 'activateMana'; cardId: string }
  | { type: 'beginActivate'; cardId: string }
  | { type: 'toggleDraftAttacker'; creatureId: string }
  | { type: 'setDefendPlayer'; defendingPlayerId: string }
  | { type: 'setDefendPlaneswalker'; planeswalkerId: string | null }
  | { type: 'confirmAttackers' }
  | { type: 'focusAttacker'; attackerId: string }
  | { type: 'toggleDraftBlocker'; attackerId: string; blockerId: string }
  | { type: 'confirmBlockers' }
  | { type: 'resolveLegend'; keepId: string }
  | { type: 'resolveCommanderZone'; cardId: string; toCommandZone: boolean }
  | { type: 'resolveWard'; pay: boolean }
  | { type: 'resolveScry'; bottomIds: string[] }
  | { type: 'resolveSurveil'; toGyIds: string[] }
  | { type: 'resolveLookAtTop' }
  | { type: 'resolveFabricate'; mode: 'tokens' | 'counters' }
  | { type: 'resolveDiscardSelect'; cardIds: string[] }
  | { type: 'resolveRiot'; permanentId: string; choice: 'haste' | 'counter' }
  | { type: 'resolveSacrificePermanents'; permanentIds: string[] }
  | { type: 'moveDraftBlocker'; attackerId: string; blockerId: string; direction: -1 | 1 };
