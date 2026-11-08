import {
  CardData,
  CardInstance,
  emptyManaPool,
  GameState,
  Player,
  ZoneName,
} from './types';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let _instanceSeq = 0;
export function nextInstanceId(): string {
  _instanceSeq += 1;
  return `ci_${_instanceSeq}`;
}

export function makeInstance(
  card: CardData,
  playerId: string,
  zone: ZoneName,
  opts: { isCommander?: boolean; isToken?: boolean } = {},
): CardInstance {
  return {
    id: nextInstanceId(),
    card,
    owner: playerId,
    controller: playerId,
    zone,
    tapped: false,
    faceDown: false,
    counters: {},
    damageMarked: 0,
    deathtouchSinceLastSba: false,
    isCommander: !!opts.isCommander,
    commanderCastCount: 0,
    isToken: opts.isToken,
    summoningSick: false,
  };
}

/** Nastaví hru: life 40, commander do command zone, zbytek zamíchaná library, 7 do ruky. */
export function createInitialGameState(
  decks: { playerId: string; playerName?: string; cards: CardData[]; commander: CardData }[],
): GameState {
  const players: Player[] = decks.map((d) => {
    const commander = makeInstance(d.commander, d.playerId, 'command', { isCommander: true });

    const libraryCards = d.cards.filter((c) => c.oracle_id !== d.commander.oracle_id);
    const shuffled = shuffle(libraryCards).map((c) => makeInstance(c, d.playerId, 'library'));
    const hand = shuffled.splice(0, 7);
    for (const c of hand) c.zone = 'hand';

    return {
      id: d.playerId,
      name: d.playerName || d.playerId,
      life: 40,
      poison: 0,
      library: shuffled,
      hand,
      battlefield: [],
      graveyard: [],
      exile: [],
      commandZone: [commander],
      manaPool: emptyManaPool(),
      commanderDamage: {},
      attemptedEmptyDraw: false,
      landsPlayedThisTurn: 0,
      citysBlessing: false,
      attackedThisTurn: false,
      lostLifeThisTurn: false,
      extraTurns: 0,
      emblems: [],
      experience: 0,
      energy: 0,
      hasLost: false,
    };
  });

  return {
    players,
    activePlayerIndex: 0,
    phase: 'beginning',
    step: 'untap',
    stack: [],
    priorityPlayerIndex: 0,
    consecutivePasses: 0,
    turnNumber: 1,
    stateBasedActionsPending: false,
    pendingChoices: [],
    winnerId: null,
    pendingCast: null,
    combat: null,
    monarchPlayerId: null,
    creatureDiedThisTurn: false,
    spellsCastThisTurn: 0,
    preventionShields: [],
    redirectShields: [],
    preventCombatDamageThisTurn: false,
    preventAllDamageThisTurn: false,
    delayedTriggers: [],
  };
}
