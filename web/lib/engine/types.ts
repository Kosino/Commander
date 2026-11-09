// Core Rules Engine – datové struktury
// Vázáno na docs/rulebook.md a Comprehensive Rules 2026

import type { SpellScript, TargetRef, TargetSlot } from './effects';
// SpellScript used by WaitingTrigger / DelayedTrigger
import { continuousPtBonus, continuousSetPt, hasKeywordState } from './continuous';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export type ZoneName =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'stack'
  | 'exile'
  | 'command';

export interface CardData {
  oracle_id: string;
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  /** Starting defense (Battles — CR 310). */
  defense?: string;
  colors: ManaColor[];
  color_identity: ManaColor[];
  keywords: string[];
  /** Optional Scryfall art URL (or named-image endpoint). */
  image_uri?: string;
  /** Back face for DFC / Siege (712 / 310.12b). */
  other_face?: CardData;
}

export interface CardInstance {
  id: string;
  card: CardData;
  owner: string;
  controller: string;
  zone: ZoneName;
  tapped: boolean;
  faceDown: boolean;
  counters: Record<string, number>;
  /** Damage marked on a creature (CR 120 / 704.5g). */
  damageMarked: number;
  /** Deathtouch damage since last SBA check (704.5h). */
  deathtouchSinceLastSba: boolean;
  isCommander: boolean;
  commanderCastCount: number;
  /** Companion (702.124) — cast once from command; not a commander. */
  isCompanion?: boolean;
  /** True for token permanents (704.5d). */
  isToken?: boolean;
  /** 704.6d / 903.9 — put into GY/exile/hand/library; owner may move to command zone. */
  commanderRelocationPending?: boolean;
  /** Summoning sickness until controller's next untap (508.1a); haste ignores. */
  summoningSick: boolean;
  /** Until end of turn P/T mods (pump spells). */
  tempPower?: number;
  tempToughness?: number;
  /** Until end of turn keyword grants (gains flying until EOT). */
  tempKeywords?: string[];
  /** One-shot regenerate shield (701.14) — clears after use or cleanup. */
  regenerateShield?: boolean;
  /** Aura/Equipment attached to this permanent id (on BF). */
  attachedTo?: string;
  /** Spell was cast via flashback — exile on leave stack. */
  castViaFlashback?: boolean;
  /** Spell was cast via jump-start — exile on leave stack. */
  castViaJumpStart?: boolean;
  /** Unearth: exile at end of turn / if leaves BF (702.110). */
  unearthed?: boolean;
  /** Goaded — must attack if able; can't block (701.38). */
  goaded?: boolean;
  /** Player id who goaded; cleared when that player's next turn begins. */
  goadedBy?: string;
  /** Dash — return to hand at end of combat/turn (702.108). */
  dashed?: boolean;
  /** Blitz — sacrifice at EOT; draw if dies (702.150). */
  blitzed?: boolean;
  /** Evoke — sacrifice when it enters (702.34). */
  evoked?: boolean;
  /** Buyback paid — return to hand on resolve (702.26). */
  castViaBuyback?: boolean;
  /** Rebound — exile on resolve, cast again next upkeep (702.87). */
  castViaRebound?: boolean;
  /** Monstrosity activated (702.111). */
  monstrous?: boolean;
  /** Renown — has become renowned (702.111 / 702.112). */
  renowned?: boolean;
  /** Vehicle currently crewed (creature until cleanup). */
  crewed?: boolean;
  /** Base power while crewed (from card when Vehicle). */
  vehiclePower?: string;
  vehicleToughness?: string;
  /** Battle protector (310.12a) — opponent who can block attacks on this battle. */
  protectorPlayerId?: string;
  /** DFC currently showing back face (701.27). */
  transformed?: boolean;
  /** Class level designation (717) — defaults to 1 while a Class. */
  classLevel?: number;
  /** Case solved designation (720.3b). */
  solved?: boolean;
}

export interface Player {
  id: string;
  name: string;
  life: number;
  poison: number;
  library: CardInstance[];
  hand: CardInstance[];
  battlefield: CardInstance[];
  graveyard: CardInstance[];
  exile: CardInstance[];
  commandZone: CardInstance[];
  manaPool: Record<ManaColor, number>;
  /** commander instance id → combat damage dealt to this player (903.10a / 704.6c). */
  commanderDamage: Record<string, number>;
  /** 704.5b — attempted draw from empty library since last SBA. */
  attemptedEmptyDraw: boolean;
  /** CR 305.2 — one land per turn (MVP; ignore Explore etc.). */
  landsPlayedThisTurn: number;
  /** City's Blessing from Ascend (702.130). */
  citysBlessing: boolean;
  /** Raid — this player attacked with a creature this turn. */
  attackedThisTurn: boolean;
  /** Life lost this turn (spectacle / etc.). */
  lostLifeThisTurn: boolean;
  /** Life gained this turn (Case / morbid-adjacent conditions). */
  gainedLifeThisTurn?: boolean;
  /** Pending extra turns (CR 500.7) — taken before opponent. */
  extraTurns?: number;
  /** London mulligans taken this game (bottom N after keep). */
  mulligansTaken?: number;
  /** Emblems (114) — command-zone-like continuous/triggered text. */
  emblems?: { id: string; name: string; oracle_text: string }[];
  /** Experience counters (122.1b / Planechase-style on player). */
  experience: number;
  /** Energy counters (702.135). */
  energy: number;
  hasLost: boolean;
  loseReason?: string;
}

/** Extra game-level flags (monarch, etc.). */
export type GameExtras = {
  monarchPlayerId: string | null;
};

/** Prevent-next-N-damage shield (CR 615 MVP). */
export type PreventionShield = {
  id: string;
  controllerId: string;
  kind: 'player' | 'permanent';
  targetId: string;
  amount: number;
};

/** Redirect next N damage from A → B (CR 614 MVP). */
export type RedirectShield = {
  id: string;
  controllerId: string;
  fromKind: 'player' | 'permanent';
  fromId: string;
  toKind: 'player' | 'permanent';
  toId: string;
  amount: number;
};

/** Object on the stack (spell, activated ability, or triggered ability). */
export interface StackObject {
  id: string;
  kind: 'spell' | 'ability' | 'trigger';
  controller: string;
  name: string;
  /** Spell card while on the stack. */
  cardInstance?: CardInstance;
  /** Permanent that activated / triggered. */
  sourcePermanentId?: string;
  /** Chosen targets (Arena: declared during cast). */
  targets?: Record<string, TargetRef>;
  script?: SpellScript;
  /** Source colors for protection checks on resolve. */
  sourceColors?: ManaColor[];
}

/**
 * Arena-like cast modal: announce spell → choose targets → pay → stack.
 * While set, other actions (except mana abilities / cancel) should wait.
 */
export type PendingCast = {
  playerId: string;
  cardId: string;
  cardName: string;
  slots: TargetSlot[];
  chosen: Record<string, TargetRef>;
  /** Index of slot currently being chosen. */
  currentSlot: number;
  /** Hand / command / GY casts / ability / equip. */
  from:
    | 'hand'
    | 'command'
    | 'flashback'
    | 'jumpstart'
    | 'escape'
    | 'retrace'
    | 'dash'
    | 'blitz'
    | 'spectacle'
    | 'embalm'
    | 'evoke'
    | 'overload'
    | 'cascade'
    | 'ability'
    | 'equip'
    | 'crew'
    | 'trigger';
  /** When from==='ability'|'equip'|'crew'|'trigger', permanent id (same as cardId usually). */
  abilitySourceId?: string;
  /** Colors of the spell/source (protection checks). */
  sourceColors?: ManaColor[];
  /** Ability/loyalty script when from==='ability' (avoids re-parse). */
  abilityScript?: SpellScript;
  /** Activated ability requires tapping the source. */
  abilityNeedsTap?: boolean;
  /** Mana already paid for activated ability (non-tap). */
  abilityManaPaid?: boolean;
  /** Crew: tapped creature ids so far / needed power. */
  crewNeeded?: number;
  crewTapped?: string[];
  /**
   * Cast announcement phases (Arena-like):
   * mode → x → kicker → targets → (pay/finalize).
   */
  phase?:
    | 'mode'
    | 'x'
    | 'kicker'
    | 'buyback'
    | 'convoke'
    | 'improvise'
    | 'delve'
    | 'escapeExile'
    | 'targets'
    | 'additionalCost'
    | 'pay';
  /** Prefer 2 life over colored mana for Phyrexian symbols (Arena toggle). */
  preferPhyrexianLife?: boolean;
  /** Per-hybrid symbol color pick (parallel to cost.hybrids). */
  hybridPicks?: ManaColor[];
  /**
   * Additional cost picks (jump-start / retrace / discard / sacrifice).
   * Filled in `additionalCost` phase before `pay`.
   */
  costDiscardNeed?: number;
  /** 'land' = retrace; otherwise any non-spell card from hand. */
  costDiscardFilter?: 'any' | 'land';
  costDiscardIds?: string[];
  costSacrificeNeed?: number;
  costSacrificeIds?: string[];
  /** Chosen mode index when script.modes set. */
  modeIndex?: number;
  /** Announced X value. */
  xValue?: number;
  /** Whether kicker is being paid. */
  payKicker?: boolean;
  /** Whether buyback is being paid. */
  payBuyback?: boolean;
  /** Improvise: tapped artifact ids toward generic. */
  improviseTapped?: string[];
  /** Resolved script after mode/kicker choices (targets still pending). */
  resolvedScript?: SpellScript;
  /** Convoke: tapped creature ids toward generic. */
  convokeTapped?: string[];
  /** Delve: exiled GY card ids toward generic. */
  delveExiled?: string[];
  /** Escape: other GY cards chosen to exile as additional cost. */
  escapeExiled?: string[];
  /** Escape — how many other cards must be exiled. */
  escapeNeeded?: number;
  /** Pending trigger awaiting targets before stack. */
  pendingTrigger?: {
    controllerId: string;
    name: string;
    sourcePermanentId?: string;
    script: SpellScript;
  };
};

export type Phase = 'beginning' | 'main1' | 'combat' | 'main2' | 'ending';

export type Step =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'main' // main1 / main2 (phase distinguishes)
  | 'beginCombat'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'combatDamage'
  | 'endCombat'
  | 'endStep'
  | 'cleanup';

/** Arena-like phase stops (PromptController). */
export type StopKey =
  | 'upkeep'
  | 'draw'
  | 'beginCombat'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'combatDamage'
  | 'endCombat'
  | 'endStep'
  | 'oppUpkeep'
  | 'oppDraw'
  | 'oppBeginCombat'
  | 'oppDeclareAttackers'
  | 'oppDeclareBlockers'
  | 'oppCombatDamage'
  | 'oppEndStep';

/** Per-player Arena clock / stop settings. */
export type PlayerClock = {
  stops: StopKey[];
  /** Ctrl / Full Control — never auto-yield. */
  fullControl: boolean;
  /** Keep priority after next action once (Arena temporary Full Control). */
  holdPriorityOnce: boolean;
  /** Enter / Shift+Enter style pass-turn. */
  passTurnMode: 'off' | 'untilResponse' | 'unconditional';
};

/** Stashed cast/activate waiting on Ward payment. */
export type WardResume = {
  kind: 'spell' | 'ability';
  playerId: string;
  cardId: string;
  from?:
    | 'hand'
    | 'command'
    | 'flashback'
    | 'jumpstart'
    | 'escape'
    | 'retrace'
    | 'dash'
    | 'blitz'
    | 'spectacle'
    | 'evoke'
    | 'overload'
    | 'cascade';
  targets: Record<string, TargetRef>;
  script: SpellScript;
};

export type PendingChoice =
  | {
      type: 'legend';
      playerId: string;
      name: string;
      permanentIds: string[];
    }
  | {
      type: 'commanderToCommandZone';
      playerId: string;
      cardId: string;
      from: 'graveyard' | 'exile' | 'hand' | 'library';
    }
  | {
      /** London mulligan (903.4 / CR 103.5) — decide keep or take another. */
      type: 'mulligan';
      playerId: string;
      /** How many mulligans already taken (0 = opening hand). */
      mulligansTaken: number;
      phase: 'decide' | 'bottom';
    }
  | {
      type: 'ward';
      playerId: string;
      cost: number;
      resume: WardResume;
    }
  | {
      type: 'scry';
      playerId: string;
      /** Top N library cards (order = current top). */
      cardIds: string[];
    }
  | {
      type: 'surveil';
      playerId: string;
      cardIds: string[];
    }
  | {
      type: 'discardSelect';
      playerId: string;
      amount: number;
    }
  | {
      type: 'riot';
      playerId: string;
      permanentId: string;
    }
  | {
      type: 'sacrificePermanents';
      playerId: string;
      amount: number;
    }
  | {
      type: 'lookAtTop';
      playerId: string;
      cardIds: string[];
    }
  | {
      type: 'fabricate';
      playerId: string;
      permanentId: string;
      amount: number;
    }
  | {
      /** Devour N — choose any number of other creatures to sac (702.81). */
      type: 'devour';
      playerId: string;
      permanentId: string;
      devourN: number;
    }
  | {
      /** Optional "You may …" effect (MVP: single effect batch). */
      type: 'optionalEffect';
      playerId: string;
      label: string;
      script: SpellScript;
      sourcePermanentId?: string;
    }
  | {
      /** Siege ETB — choose which opponent protects the battle (310.12a). */
      type: 'chooseBattleProtector';
      playerId: string;
      battleId: string;
      opponentIds: string[];
    }
  | {
      /** CR 603.3b — order simultaneous triggers you control. */
      type: 'orderTriggers';
      playerId: string;
      /** Waiting trigger ids (default APNAP / timestamp order). */
      triggerIds: string[];
    };

export interface GameState {
  players: Player[];
  activePlayerIndex: number;
  phase: Phase;
  step: Step;
  stack: StackObject[];
  priorityPlayerIndex: number;
  /** Consecutive passes without actions (117.4). */
  consecutivePasses: number;
  turnNumber: number;
  stateBasedActionsPending: boolean;
  pendingChoices: PendingChoice[];
  /** Arena PromptController — stops / Full Control / pass-turn per player. */
  playerClocks: Record<string, PlayerClock>;
  /** Winner player id when only one remains (multiplayer), or null. */
  winnerId: string | null;
  /** In-progress cast targeting (Arena GRE-style prompt). */
  pendingCast: PendingCast | null;
  /** Planeswalker loyalty ability picker (multiple +/−/0). */
  pendingLoyalty?: { playerId: string; permanentId: string } | null;
  /** Activated ability picker when permanent has several. */
  pendingActivated?: {
    playerId: string;
    permanentId: string;
    /** Indices into parseActivatedAbilities(). */
    options: number[];
  } | null;
  /** Simultaneous triggers waiting to be ordered onto the stack (603.3b). */
  waitingTriggers?: WaitingTrigger[];
  /** Combat declaration / assignments (Arena combat UI). */
  combat: CombatState | null;
  /** The Monarch (702.138). */
  monarchPlayerId: string | null;
  /** Creature died this turn (morbid). */
  creatureDiedThisTurn: boolean;
  /** How many creatures died this turn (for equal-to draw). */
  creaturesDiedThisTurn?: number;
  /** Spells cast this turn (storm count; current spell not yet counted when checked). */
  spellsCastThisTurn: number;
  /** Spells cast by previous turn's active player (732.2 day/night check). */
  spellsCastPreviousTurn?: number;
  /** Day / night designation (732) — null = neither. */
  dayNight?: 'day' | 'night' | null;
  /** Active prevention shields (615). */
  preventionShields: PreventionShield[];
  /** Damage redirect shields (614 MVP). */
  redirectShields?: RedirectShield[];
  /** Fog — prevent all combat damage this turn. */
  preventCombatDamageThisTurn?: boolean;
  /** Prevent all damage this turn. */
  preventAllDamageThisTurn?: boolean;
  /** Delayed triggered abilities (603.7) — fire at named step. */
  delayedTriggers: DelayedTrigger[];
}

/** Triggered ability waiting for APNAP order before stacking. */
export type WaitingTrigger = {
  id: string;
  controllerId: string;
  name: string;
  sourcePermanentId?: string;
  script: SpellScript;
  targets?: Record<string, import('./effects').TargetRef>;
};

/** Delayed trigger created by resolving spell/ability. */
export type DelayedTrigger = {
  id: string;
  controllerId: string;
  name: string;
  /** When to put on stack. */
  when: 'endStep' | 'endCombat' | 'upkeep';
  script: SpellScript;
  targets?: Record<string, import('./effects').TargetRef>;
  sourcePermanentId?: string;
};

/** One attacking creature and what it attacks. */
export type AttackerDecl = {
  attackerId: string;
  defendingPlayerId: string;
  /** If set, attacking a planeswalker controlled by defendingPlayerId. */
  defendingPlaneswalkerId?: string | null;
  /** If set, attacking a battle (protector = defendingPlayerId). */
  defendingBattleId?: string | null;
  /** Blocker creature ids (order = damage assignment order MVP). */
  blockers: string[];
};

/**
 * Arena-like combat: declare → confirm TBA → priority.
 * `draft*` = výběr před potvrzením (jako Arena highlight + Confirm).
 */
/** Per-attacker combat damage assignment (510.1c / Arena). */
export type DamageAssignEntry = {
  /** blockerId → damage */
  toBlockers: Record<string, number>;
  /** Trample / unblocked remainder to player or PW. */
  toPlayer: number;
};

export type CombatState = {
  attackers: AttackerDecl[];
  /** Who is choosing (AP for attackers, defending player for blockers). */
  declaringPlayerId: string | null;
  mode: 'idle' | 'declareAttackers' | 'declareBlockers' | 'assignDamage' | null;
  /** Draft selection before Confirm. */
  draftAttackerIds: string[];
  /**
   * Per-attacker defend target (Arena: drag each attacker to face / PW).
   * Falls back to global draftDefend* when missing.
   */
  draftAttackTargets: Record<
    string,
    {
      defendingPlayerId: string;
      defendingPlaneswalkerId?: string | null;
      defendingBattleId?: string | null;
    }
  >;
  /** defender assigns: attackerId → blockerIds */
  draftBlocks: Record<string, string[]>;
  /** Default / brush defend target when declaring attacks. */
  draftDefendPlayerId: string | null;
  /** Optional planeswalker under draftDefendPlayerId being attacked. */
  draftDefendPlaneswalkerId: string | null;
  /** Optional battle being attacked (Siege: may be controlled by attacker). */
  draftDefendBattleId: string | null;
  /** Blocker UI: which attacker is focused (Arena-like). */
  focusAttackerId: string | null;
  /**
   * Combat damage waves (510.4 / Arena two damage steps).
   * `first` = FS/DS only; `normal` = rest + DS again.
   */
  damageWave: 'first' | 'normal' | null;
  /** Creature ids that assigned damage in the first wave (FS without DS skip second). */
  assignedFirstWave: string[];
  /** Manual damage assignment draft (active player). */
  damageAssign?: Record<string, DamageAssignEntry>;
  /** Which wave the current assignDamage prompt is for. */
  assignWave?: 'first' | 'normal' | null;
};

export function emptyManaPool(): Record<ManaColor, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

function typeLineOf(x: CardData | CardInstance): string {
  return 'card' in x ? x.card.type_line : x.type_line;
}

export function isCreature(x: CardData | CardInstance): boolean {
  if ('crewed' in x && (x as CardInstance).crewed) return true;
  return typeLineOf(x).includes('Creature');
}

export function isPlaneswalker(x: CardData | CardInstance): boolean {
  return typeLineOf(x).includes('Planeswalker');
}

export function isBattle(x: CardData | CardInstance): boolean {
  return typeLineOf(x).includes('Battle');
}

export function isSiege(x: CardData | CardInstance): boolean {
  return /\bsiege\b/i.test(typeLineOf(x));
}

export function isLegendary(x: CardData | CardInstance): boolean {
  return typeLineOf(x).includes('Legendary');
}

export function parseToughness(card: CardData): number | null {
  if (card.toughness == null || card.toughness === '') return null;
  const n = parseInt(card.toughness, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseLoyalty(card: CardData): number | null {
  if (card.loyalty == null || card.loyalty === '') return null;
  const n = parseInt(card.loyalty, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseDefense(card: CardData): number | null {
  if (card.defense == null || card.defense === '') return null;
  const n = parseInt(card.defense, 10);
  return Number.isFinite(n) ? n : null;
}

export function parsePower(card: CardData): number | null {
  if (card.power == null || card.power === '') return null;
  const n = parseInt(card.power, 10);
  return Number.isFinite(n) ? n : null;
}

/** Aura/Equipment "gets +N/+M" continuous boost (needs game state). */
export function attachmentPtBonus(
  c: CardInstance,
  state?: GameState,
): { power: number; toughness: number } {
  if (!state) return { power: 0, toughness: 0 };
  let power = 0;
  let toughness = 0;
  for (const p of state.players) {
    for (const att of p.battlefield) {
      if (att.attachedTo !== c.id) continue;
      const m = (att.card.oracle_text || '').match(/gets?\s+([+-]\d+)\/([+-]\d+)/i);
      if (m) {
        power += parseInt(m[1], 10);
        toughness += parseInt(m[2], 10);
      }
    }
  }
  return { power, toughness };
}

export function effectivePower(c: CardInstance, state?: GameState): number {
  const plus = c.counters['+1/+1'] || 0;
  const minus = c.counters['-1/-1'] || 0;
  const att = attachmentPtBonus(c, state);
  const cont = state ? continuousPtBonus(c, state) : { power: 0, toughness: 0 };
  const set = state ? continuousSetPt(c, state) : null;
  const printed = set ? set.power : (parsePower(c.card) ?? 0);
  return printed + (c.tempPower || 0) + plus - minus + att.power + cont.power;
}

export function effectiveToughness(c: CardInstance, state?: GameState): number | null {
  const set = state ? continuousSetPt(c, state) : null;
  const base = set ? set.toughness : parseToughness(c.card);
  if (base === null) return null;
  const plus = c.counters['+1/+1'] || 0;
  const minus = c.counters['-1/-1'] || 0;
  const att = attachmentPtBonus(c, state);
  const cont = state ? continuousPtBonus(c, state) : { power: 0, toughness: 0 };
  return base + (c.tempToughness || 0) + plus - minus + att.toughness + cont.toughness;
}

export function canAttack(c: CardInstance, state?: GameState): boolean {
  if (!isCreature(c) || c.tapped) return false;
  const text = (c.card.oracle_text || '').toLowerCase();
  if (/\bcan't attack\b/.test(text) || /\bcannot attack\b/.test(text)) return false;
  if (state ? hasKeywordState(c, 'defender', state) : hasKeyword(c, 'defender')) return false;
  const haste = state ? hasKeywordState(c, 'haste', state) : hasKeyword(c, 'haste');
  if (c.summoningSick && !haste) return false;
  return true;
}


export function emptyCombat(): CombatState {
  return {
    attackers: [],
    declaringPlayerId: null,
    mode: null,
    draftAttackerIds: [],
    draftAttackTargets: {},
    draftBlocks: {},
    draftDefendPlayerId: null,
    draftDefendPlaneswalkerId: null,
    draftDefendBattleId: null,
    focusAttackerId: null,
    damageWave: null,
    assignedFirstWave: [],
    damageAssign: {},
    assignWave: null,
  };
}

/** Keyword check — keywords[] or first oracle line / reminder-free word. */
export function hasKeyword(card: CardData | CardInstance, keyword: string): boolean {
  const k = keyword.toLowerCase();
  if ('tempKeywords' in (card as CardInstance)) {
    const inst = card as CardInstance;
    if ((inst.tempKeywords || []).some((x) => x.toLowerCase() === k)) return true;
  }
  const data = 'card' in (card as CardInstance) ? (card as CardInstance).card : (card as CardData);
  if (data.keywords.some((x) => x.toLowerCase() === k)) return true;
  const firstLine = (data.oracle_text || '').split('\n')[0] || '';
  // e.g. "Flying, first strike" or "Double strike"
  return new RegExp(`(^|,)\\s*${k}\\b`, 'i').test(firstLine);
}
