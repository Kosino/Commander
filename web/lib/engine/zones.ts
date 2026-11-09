import { CardInstance, GameState, Player, ZoneName } from './types';

/** Rest in Peace / Leyline of the Void — shared with replacement.ts. */
export function graveyardBecomesExile(state: GameState): boolean {
  for (const p of state.players) {
    for (const perm of p.battlefield) {
      const t = perm.card.oracle_text || '';
      if (
        /if a card would be put into (?:a |any )?graveyard(?: from anywhere)?,?\s*exile (?:it|them) instead/i.test(
          t,
        ) ||
        /if a card or token would be put into a graveyard from anywhere,?\s*exile it instead/i.test(
          t,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function getPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function zoneList(player: Player, zone: ZoneName): CardInstance[] {
  switch (zone) {
    case 'library':
      return player.library;
    case 'hand':
      return player.hand;
    case 'battlefield':
      return player.battlefield;
    case 'graveyard':
      return player.graveyard;
    case 'exile':
      return player.exile;
    case 'command':
      return player.commandZone;
    case 'stack':
      return [];
  }
}

function clonePlayers(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      library: [...p.library],
      hand: [...p.hand],
      battlefield: [...p.battlefield],
      graveyard: [...p.graveyard],
      exile: [...p.exile],
      commandZone: [...p.commandZone],
      manaPool: { ...p.manaPool },
      commanderDamage: { ...p.commanderDamage },
      emblems: p.emblems ? p.emblems.map((e) => ({ ...e })) : [],
      experience: p.experience || 0,
      energy: p.energy || 0,
    })),
    stack: state.stack.map((s) => ({
      ...s,
      targets: s.targets ? { ...s.targets } : undefined,
      script: s.script,
      cardInstance: s.cardInstance,
    })),
    pendingChoices: [...state.pendingChoices],
    playerClocks: Object.fromEntries(
      Object.entries(state.playerClocks || {}).map(([id, c]) => [
        id,
        { ...c, stops: [...(c.stops || [])] },
      ]),
    ),
    pendingCast: state.pendingCast
      ? {
          ...state.pendingCast,
          slots: [...state.pendingCast.slots],
          chosen: { ...state.pendingCast.chosen },
          sourceColors: state.pendingCast.sourceColors
            ? [...state.pendingCast.sourceColors]
            : undefined,
          convokeTapped: state.pendingCast.convokeTapped
            ? [...state.pendingCast.convokeTapped]
            : undefined,
          delveExiled: state.pendingCast.delveExiled
            ? [...state.pendingCast.delveExiled]
            : undefined,
          escapeExiled: state.pendingCast.escapeExiled
            ? [...state.pendingCast.escapeExiled]
            : undefined,
          escapeNeeded: state.pendingCast.escapeNeeded,
          improviseTapped: state.pendingCast.improviseTapped
            ? [...state.pendingCast.improviseTapped]
            : undefined,
          hybridPicks: state.pendingCast.hybridPicks
            ? [...state.pendingCast.hybridPicks]
            : undefined,
          costDiscardIds: state.pendingCast.costDiscardIds
            ? [...state.pendingCast.costDiscardIds]
            : undefined,
          costSacrificeIds: state.pendingCast.costSacrificeIds
            ? [...state.pendingCast.costSacrificeIds]
            : undefined,
          costDiscardNeed: state.pendingCast.costDiscardNeed,
          costDiscardFilter: state.pendingCast.costDiscardFilter,
          costSacrificeNeed: state.pendingCast.costSacrificeNeed,
          preferPhyrexianLife: state.pendingCast.preferPhyrexianLife,
          pendingTrigger: state.pendingCast.pendingTrigger
            ? { ...state.pendingCast.pendingTrigger }
            : undefined,
        }
      : null,
    combat: state.combat
      ? {
          ...state.combat,
          attackers: state.combat.attackers.map((a) => ({
            ...a,
            blockers: [...a.blockers],
          })),
          draftAttackerIds: [...state.combat.draftAttackerIds],
          draftAttackTargets: Object.fromEntries(
            Object.entries(state.combat.draftAttackTargets || {}).map(([k, v]) => [
              k,
              { ...v },
            ]),
          ),
          draftBlocks: Object.fromEntries(
            Object.entries(state.combat.draftBlocks).map(([k, v]) => [k, [...v]]),
          ),
          assignedFirstWave: [...state.combat.assignedFirstWave],
        }
      : null,
    monarchPlayerId: state.monarchPlayerId,
    creatureDiedThisTurn: state.creatureDiedThisTurn,
    spellsCastThisTurn: state.spellsCastThisTurn,
    spellsCastPreviousTurn: state.spellsCastPreviousTurn,
    dayNight: state.dayNight ?? null,
    preventionShields: state.preventionShields.map((s) => ({ ...s })),
    redirectShields: (state.redirectShields || []).map((s) => ({ ...s })),
    preventCombatDamageThisTurn: !!state.preventCombatDamageThisTurn,
    preventAllDamageThisTurn: !!state.preventAllDamageThisTurn,
    delayedTriggers: state.delayedTriggers.map((d) => ({
      ...d,
      script: d.script,
      targets: d.targets ? { ...d.targets } : undefined,
    })),
  };
}

/** Move a card between zones on its owner. Returns false if not found. */
export function moveCard(
  state: GameState,
  cardId: string,
  toZone: ZoneName,
): { state: GameState; card?: CardInstance } {
  const next = clonePlayers(state);

  for (const player of next.players) {
    const zones: ZoneName[] = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];
    for (const z of zones) {
      const list = zoneList(player, z);
      const idx = list.findIndex((c) => c.id === cardId);
      if (idx === -1) continue;
      const [card] = list.splice(idx, 1);
      // Unearth: if would leave battlefield for anywhere but exile → exile instead (702.110c)
      let dest = toZone;
      if (
        card.unearthed &&
        z === 'battlefield' &&
        toZone !== 'exile' &&
        toZone !== 'battlefield'
      ) {
        dest = 'exile';
        card.unearthed = false;
      }
      // Rest in Peace-style: would enter GY → exile instead (614)
      if (dest === 'graveyard' && graveyardBecomesExile(next)) {
        dest = 'exile';
      }
      card.zone = dest;
      if (dest !== 'battlefield') {
        card.damageMarked = 0;
        card.deathtouchSinceLastSba = false;
        card.tapped = false;
        if (dest !== 'exile') card.unearthed = false;
      }
      if (
        card.isCommander &&
        (dest === 'graveyard' || dest === 'exile' || dest === 'hand' || dest === 'library')
      ) {
        card.commanderRelocationPending = true;
      }
      if (dest === 'command') {
        card.commanderRelocationPending = false;
      }
      zoneList(player, dest).push(card);
      return { state: next, card };
    }
  }
  return { state };
}

export function findCard(
  state: GameState,
  cardId: string,
): { player: Player; card: CardInstance; zone: ZoneName } | null {
  for (const player of state.players) {
    const zones: ZoneName[] = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];
    for (const z of zones) {
      const card = zoneList(player, z).find((c) => c.id === cardId);
      if (card) return { player, card, zone: z };
    }
  }
  return null;
}

export { clonePlayers };
