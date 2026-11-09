import type { CombatState, GameState } from '../../lib/engine';

export type CombatArrowKind = 'attack' | 'block' | 'draft';

export type CombatArrow = {
  id: string;
  fromKey: string;
  toKey: string;
  kind: CombatArrowKind;
};

/** DOM key for a permanent card tile. */
export function cardKey(cardId: string): string {
  return `card:${cardId}`;
}

/** DOM key for a player life/HUD target. */
export function playerKey(playerId: string): string {
  return `player:${playerId}`;
}

function defendTargetKey(
  defendingPlayerId: string,
  defendingPlaneswalkerId?: string | null,
  defendingBattleId?: string | null,
): string {
  if (defendingBattleId) return cardKey(defendingBattleId);
  if (defendingPlaneswalkerId) return cardKey(defendingPlaneswalkerId);
  return playerKey(defendingPlayerId);
}

/** Build logical attack/block arrows from combat draft or confirmed decls. */
export function buildCombatArrows(state: GameState): CombatArrow[] {
  const combat = state.combat;
  if (!combat?.mode) return [];
  // Arena keeps attack/block arrows through post-declare priority (idle) until damage.
  if (combat.mode === 'idle' && combat.attackers.length === 0) return [];

  const out: CombatArrow[] = [];

  if (combat.mode === 'declareAttackers') {
    for (const id of combat.draftAttackerIds) {
      const per = combat.draftAttackTargets?.[id];
      const playerId = per?.defendingPlayerId || combat.draftDefendPlayerId || '';
      const pw = per?.defendingPlaneswalkerId ?? combat.draftDefendPlaneswalkerId;
      const battle = per?.defendingBattleId ?? combat.draftDefendBattleId;
      if (!playerId && !battle) continue;
      out.push({
        id: `draft-${id}`,
        fromKey: cardKey(id),
        toKey: defendTargetKey(playerId, pw, battle),
        kind: 'draft',
      });
    }
    return out;
  }

  for (const a of combat.attackers) {
    out.push({
      id: `atk-${a.attackerId}`,
      fromKey: cardKey(a.attackerId),
      toKey: defendTargetKey(
        a.defendingPlayerId,
        a.defendingPlaneswalkerId,
        a.defendingBattleId,
      ),
      kind: 'attack',
    });

    const blockers =
      combat.mode === 'declareBlockers'
        ? combat.draftBlocks[a.attackerId] || a.blockers
        : a.blockers;
    for (const bid of blockers) {
      out.push({
        id: `blk-${a.attackerId}-${bid}`,
        fromKey: cardKey(bid),
        toKey: cardKey(a.attackerId),
        kind: 'block',
      });
    }
  }

  return out;
}

export function combatRoleForCard(
  combat: CombatState | null | undefined,
  cardId: string,
): 'attacking' | 'blocking' | 'defend-target' | undefined {
  if (!combat?.mode) return undefined;
  if (combat.mode === 'idle' && combat.attackers.length === 0) return undefined;

  if (combat.mode === 'declareAttackers') {
    if (combat.draftAttackerIds.includes(cardId)) return 'attacking';
    if (
      combat.draftDefendPlaneswalkerId === cardId ||
      combat.draftDefendBattleId === cardId
    ) {
      return 'defend-target';
    }
    return undefined;
  }

  for (const a of combat.attackers) {
    if (a.attackerId === cardId) return 'attacking';
    if (a.defendingPlaneswalkerId === cardId || a.defendingBattleId === cardId) {
      return 'defend-target';
    }
    const blockers =
      combat.mode === 'declareBlockers'
        ? combat.draftBlocks[a.attackerId] || a.blockers
        : a.blockers;
    if (blockers.includes(cardId)) return 'blocking';
  }
  return undefined;
}

export function isDefendPlayerHighlighted(
  combat: CombatState | null | undefined,
  playerId: string,
): boolean {
  if (!combat?.mode) return false;
  if (combat.mode === 'declareAttackers') {
    return (
      combat.draftDefendPlayerId === playerId &&
      !combat.draftDefendPlaneswalkerId &&
      !combat.draftDefendBattleId
    );
  }
  if (combat.mode === 'idle' && combat.attackers.length === 0) return false;
  return combat.attackers.some(
    (a) =>
      a.defendingPlayerId === playerId &&
      !a.defendingPlaneswalkerId &&
      !a.defendingBattleId,
  );
}
