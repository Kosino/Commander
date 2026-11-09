import { beginMulligans } from './mulligan';
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
  decks: {
    playerId: string;
    playerName?: string;
    cards: CardData[];
    commander: CardData;
    partner?: CardData;
    companion?: CardData;
  }[],
): GameState {
  const players: Player[] = decks.map((d) => {
    const commander = makeInstance(d.commander, d.playerId, 'command', { isCommander: true });
    const commandZone = [commander];
    if (d.partner) {
      commandZone.push(
        makeInstance(d.partner, d.playerId, 'command', { isCommander: true }),
      );
    }
    if (d.companion) {
      const comp = makeInstance(d.companion, d.playerId, 'command', {
        isCommander: false,
      });
      comp.isCompanion = true;
      commandZone.push(comp);
    }

    const skipIds = new Set(
      [d.commander, d.partner, d.companion]
        .filter(Boolean)
        .map((c) => c!.oracle_id),
    );
    const libraryCards = d.cards.filter((c) => !skipIds.has(c.oracle_id));
    const shuffled = shuffle(libraryCards).map((c) => makeInstance(c, d.playerId, 'library'));
    const hand = shuffled.splice(0, 7);
    for (const c of hand) c.zone = 'hand';

    // Partner: color identity = union on both commander cards' identities already on CardData;
    // cast checks use all isCommander cards' identities via getCommandColorIdentity.

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
      commandZone,
      manaPool: emptyManaPool(),
      commanderDamage: {},
      attemptedEmptyDraw: false,
      landsPlayedThisTurn: 0,
      citysBlessing: false,
      attackedThisTurn: false,
      lostLifeThisTurn: false,
      extraTurns: 0,
      mulligansTaken: 0,
      emblems: [],
      experience: 0,
      energy: 0,
      hasLost: false,
    };
  });

  const playerClocks: GameState['playerClocks'] = {};
  for (const p of players) {
    playerClocks[p.id] = {
      stops: [],
      fullControl: false,
      holdPriorityOnce: false,
      passTurnMode: 'off',
    };
  }

  const base = {
    players,
    activePlayerIndex: 0,
    phase: 'beginning' as const,
    step: 'untap' as const,
    stack: [],
    priorityPlayerIndex: 0,
    consecutivePasses: 0,
    turnNumber: 1,
    stateBasedActionsPending: false,
    pendingChoices: [] as GameState['pendingChoices'],
    playerClocks,
    winnerId: null,
    pendingCast: null,
    pendingLoyalty: null,
    pendingActivated: null,
    waitingTriggers: [],
    combat: null,
    monarchPlayerId: null,
    creatureDiedThisTurn: false,
    spellsCastThisTurn: 0,
    spellsCastPreviousTurn: 0,
    dayNight: null as 'day' | 'night' | null,
    preventionShields: [],
    redirectShields: [],
    preventCombatDamageThisTurn: false,
    preventAllDamageThisTurn: false,
    delayedTriggers: [],
  };
  return beginMulligans(base);
}
