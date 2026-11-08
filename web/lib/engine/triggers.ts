/**
 * Triggered abilities ÔÇö queue onto the stack (CR 603), then priority.
 * Targeted triggers use pendingCast.from==='trigger' before stacking.
 */
import {
  parseAttackEffects,
  parseBeginningStepScripts,
  parseCastAnySpellEffects,
  parseCombatDamagePlayerEffects,
  parseCreatureDiesWatcher,
  parseDiesEffects,
  parseEtbScript,
  parseEtbWatcher,
  parseLandfallEffects,
  parseProwessOrCastNoncreature,
  SpellScript,
  StepTriggerWhen,
} from './effects';
import { listLegalTargets } from './targets';
import {
  CardInstance,
  DelayedTrigger,
  GameState,
  isCreature,
  StackObject,
  WaitingTrigger,
} from './types';
import { clonePlayers } from './zones';
import { afterPlayerAction } from './priority';

let _trigSeq = 0;
function nextTrigId(): string {
  _trigSeq += 1;
  return `trg_${_trigSeq}`;
}

let _delaySeq = 0;
export function nextDelayId(): string {
  _delaySeq += 1;
  return `delay_${_delaySeq}`;
}

function apnapPlayerIds(state: GameState): string[] {
  const n = state.players.length;
  const start = state.activePlayerIndex;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = state.players[(start + i) % n];
    if (p && !p.hasLost) ids.push(p.id);
  }
  return ids;
}

function putWaitingOnStack(state: GameState, t: WaitingTrigger): GameState {
  const next = clonePlayers(state);
  next.stack = [
    ...next.stack,
    {
      id: t.id,
      kind: 'trigger',
      controller: t.controllerId,
      name: t.name,
      sourcePermanentId: t.sourcePermanentId,
      targets: t.targets || {},
      script: t.script,
    },
  ];
  next.consecutivePasses = 0;
  return next;
}

/** CR 603.3b — buffer → stack in APNAP order; multi → orderTriggers choice. */
export function flushWaitingTriggers(state: GameState): GameState {
  if (state.pendingCast) return state;
  if (state.pendingChoices.some((c) => c.type === 'orderTriggers')) return state;

  let next = state;
  let waiting = [...(next.waitingTriggers || [])];
  if (waiting.length === 0) return next;

  for (const pid of apnapPlayerIds(next)) {
    const mine = waiting.filter((t) => t.controllerId === pid);
    if (mine.length === 0) continue;
    if (mine.length === 1) {
      next = putWaitingOnStack(next, mine[0]);
      waiting = waiting.filter((t) => t.id !== mine[0].id);
      next = { ...next, waitingTriggers: waiting };
      continue;
    }
    next = {
      ...next,
      waitingTriggers: waiting,
      pendingChoices: [
        ...next.pendingChoices,
        {
          type: 'orderTriggers',
          playerId: pid,
          triggerIds: mine.map((t) => t.id),
        },
      ],
    };
    return next;
  }
  return { ...next, waitingTriggers: waiting };
}

/** orderedIds = resolve order (first resolves first). */
export function resolveTriggerOrder(state: GameState, orderedIds: string[]): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'orderTriggers');
  if (!choice || choice.type !== 'orderTriggers') return state;

  const waiting = [...(state.waitingTriggers || [])];
  const ids =
    orderedIds.length > 0 ? orderedIds : choice.triggerIds;

  let next: GameState = {
    ...state,
    pendingChoices: state.pendingChoices.filter((c) => c !== choice),
  };
  for (const id of [...ids].reverse()) {
    const t = waiting.find((x) => x.id === id);
    if (!t) continue;
    next = putWaitingOnStack(next, t);
    next.waitingTriggers = (next.waitingTriggers || []).filter((x) => x.id !== id);
  }
  return flushWaitingTriggers(next);
}

function enqueueWaiting(
  state: GameState,
  opts: {
    controllerId: string;
    name: string;
    sourcePermanentId?: string;
    script: SpellScript;
    targets?: StackObject['targets'];
  },
): GameState {
  const next = clonePlayers(state);
  const wt: WaitingTrigger = {
    id: nextTrigId(),
    controllerId: opts.controllerId,
    name: opts.name,
    sourcePermanentId: opts.sourcePermanentId,
    script: opts.script,
    targets: opts.targets,
  };
  next.waitingTriggers = [...(next.waitingTriggers || []), wt];
  next.consecutivePasses = 0;
  return flushWaitingTriggers(next);
}

/** Put a triggered ability on the stack (via APNAP buffer). */
export function queueTrigger(
  state: GameState,
  opts: {
    controllerId: string;
    name: string;
    sourcePermanentId?: string;
    script: SpellScript;
    targets?: StackObject['targets'];
  },
): GameState {
  if (!opts.script.effects.length) return state;
  if (opts.script.effects.length === 1 && opts.script.effects[0].type === 'noop') {
    return state;
  }
  // Targeted trigger → Arena-like choose targets first
  if (opts.script.targets.length > 0 && !opts.targets) {
    return beginTriggerTargeting(state, opts);
  }
  return enqueueWaiting(state, opts);
}

/** Start targeting for a triggered ability (pendingCast.from = trigger). */
export function beginTriggerTargeting(
  state: GameState,
  opts: {
    controllerId: string;
    name: string;
    sourcePermanentId?: string;
    script: SpellScript;
  },
): GameState {
  if (state.pendingCast) {
    // Already choosing something ÔÇö queue without targets (fizzle illegal later)
    return queueTriggerDirect(state, opts, {});
  }
  for (const slot of opts.script.targets) {
    if (listLegalTargets(state, slot.filter, opts.controllerId).length === 0) {
      // No legal targets ÔÇö trigger removed (603.3d MVP: don't put on stack)
      return state;
    }
  }
  return {
    ...state,
    pendingCast: {
      playerId: opts.controllerId,
      cardId: opts.sourcePermanentId || `trg_${opts.name}`,
      cardName: opts.name,
      slots: opts.script.targets,
      chosen: {},
      currentSlot: 0,
      from: 'trigger',
      abilitySourceId: opts.sourcePermanentId,
      abilityScript: opts.script,
      phase: 'targets',
      resolvedScript: opts.script,
      pendingTrigger: {
        controllerId: opts.controllerId,
        name: opts.name,
        sourcePermanentId: opts.sourcePermanentId,
        script: opts.script,
      },
    },
    consecutivePasses: 0,
  };
}

function queueTriggerDirect(
  state: GameState,
  opts: {
    controllerId: string;
    name: string;
    sourcePermanentId?: string;
    script: SpellScript;
  },
  targets: NonNullable<StackObject['targets']>,
): GameState {
  return enqueueWaiting(state, { ...opts, targets });
}

/** Finish trigger targeting ÔåÆ put on stack. */
export function finalizeTriggerTargets(
  state: GameState,
  targets: Record<string, import('./effects').TargetRef>,
): GameState {
  const pending = state.pendingCast;
  if (!pending || pending.from !== 'trigger' || !pending.pendingTrigger) {
    return { ...state, pendingCast: null };
  }
  const pt = pending.pendingTrigger;
  let next = clonePlayers(state);
  next.pendingCast = null;
  next = queueTriggerDirect(next, pt, targets);
  return afterPlayerAction(next);
}

export function addDelayedTrigger(
  state: GameState,
  delay: Omit<DelayedTrigger, 'id'> & { id?: string },
): GameState {
  const next = clonePlayers(state);
  next.delayedTriggers = [
    ...next.delayedTriggers,
    { ...delay, id: delay.id || nextDelayId() },
  ];
  return next;
}

/** Move delayed triggers for `when` onto the stack. */
export function flushDelayedTriggers(
  state: GameState,
  when: DelayedTrigger['when'],
): GameState {
  let next = clonePlayers(state);
  const due = next.delayedTriggers.filter((d) => d.when === when);
  next.delayedTriggers = next.delayedTriggers.filter((d) => d.when !== when);
  for (const d of due) {
    next = queueTrigger(next, {
      controllerId: d.controllerId,
      name: d.name,
      sourcePermanentId: d.sourcePermanentId,
      script: d.script,
      targets: d.targets,
    });
  }
  return next;
}

export function fireDiesFromSnapshot(
  state: GameState,
  snapshots: {
    controllerId: string;
    oracle?: string;
    cardId?: string;
    name?: string;
    wasCreature?: boolean;
  }[],
): GameState {
  let next = state;
  for (const s of snapshots) {
    const dies = parseDiesEffects(s.oracle);
    if (dies.length === 0) continue;
    next = queueTrigger(next, {
      controllerId: s.controllerId,
      name: `${s.name || 'Creature'} dies`,
      sourcePermanentId: s.cardId,
      script: { targets: [], effects: dies },
    });
  }
  // Watchers on permanents / emblems
  for (const s of snapshots) {
    if (s.wasCreature === false) continue;
    next = fireCreatureDiesWatchers(next, s.controllerId, s.cardId);
  }
  return next;
}

/** "Whenever a/another creature dies" on permanents and emblems. */
export function fireCreatureDiesWatchers(
  state: GameState,
  diedControllerId: string,
  diedId?: string,
): GameState {
  let next = state;
  for (const p of next.players) {
    if (p.hasLost) continue;
    for (const perm of [...p.battlefield]) {
      const w = parseCreatureDiesWatcher(perm.card.oracle_text);
      if (!w) continue;
      if (w.otherOnly && diedId && perm.id === diedId) continue;
      if (w.yourOnly && diedControllerId !== perm.controller) continue;
      next = queueTrigger(next, {
        controllerId: perm.controller,
        name: `${perm.card.name} (dies watcher)`,
        sourcePermanentId: perm.id,
        script: { targets: [], effects: w.effects },
      });
    }
    for (const emb of p.emblems || []) {
      const w = parseCreatureDiesWatcher(emb.oracle_text);
      if (!w) continue;
      if (w.yourOnly && diedControllerId !== p.id) continue;
      next = queueTrigger(next, {
        controllerId: p.id,
        name: `${emb.name} (dies watcher)`,
        script: { targets: [], effects: w.effects },
      });
    }
  }
  return next;
}

/** Constellation / artifact / creature ETB under your control. */
export function fireEtbWatchers(
  state: GameState,
  controllerId: string,
  permanent: CardInstance,
): GameState {
  let next = state;
  const tl = permanent.card.type_line;
  for (const p of next.players) {
    if (p.hasLost || p.id !== controllerId) continue;
    for (const perm of [...p.battlefield]) {
      if (perm.id === permanent.id) continue;
      const w = parseEtbWatcher(perm.card.oracle_text);
      if (!w) continue;
      if (w.kind === 'enchantment' && !tl.includes('Enchantment')) continue;
      if (w.kind === 'artifact' && !tl.includes('Artifact')) continue;
      if (w.kind === 'creature' && !isCreature(permanent)) continue;
      next = queueTrigger(next, {
        controllerId: perm.controller,
        name: `${perm.card.name} (ETB watcher)`,
        sourcePermanentId: perm.id,
        script: { targets: [], effects: w.effects },
      });
    }
  }
  return next;
}

export function fireAttackTriggers(state: GameState, attackers: CardInstance[]): GameState {
  let next = state;
  for (const atk of attackers) {
    const effects = parseAttackEffects(atk.card.oracle_text);
    if (effects.length === 0) continue;
    next = queueTrigger(next, {
      controllerId: atk.controller,
      name: `${atk.card.name} attacks`,
      sourcePermanentId: atk.id,
      script: { targets: [], effects },
    });
  }
  return next;
}

export function fireLandfall(state: GameState, controllerId: string): GameState {
  let next = state;
  const p = next.players.find((x) => x.id === controllerId);
  if (!p) return next;
  for (const perm of [...p.battlefield]) {
    const effects = parseLandfallEffects(perm.card.oracle_text);
    if (effects.length === 0) continue;
    next = queueTrigger(next, {
      controllerId,
      name: `${perm.card.name} landfall`,
      sourcePermanentId: perm.id,
      script: { targets: [], effects },
    });
  }
  return next;
}

export function fireCastNoncreatureTriggers(
  state: GameState,
  casterId: string,
): GameState {
  let next = state;
  const p = next.players.find((x) => x.id === casterId);
  if (!p) return next;

  for (const perm of [...p.battlefield]) {
    if (!isCreature(perm)) continue;
    const effects = parseProwessOrCastNoncreature(perm.card.oracle_text, perm.card.keywords);
    if (effects.length === 0) continue;
    next = queueTrigger(next, {
      controllerId: casterId,
      name: `${perm.card.name} prowess/cast`,
      sourcePermanentId: perm.id,
      script: { targets: [], effects },
    });
  }
  return next;
}

/** "Whenever you cast a spell" ÔÇö any spell including creatures. */
export function fireCastAnySpellTriggers(state: GameState, casterId: string): GameState {
  let next = state;
  const p = next.players.find((x) => x.id === casterId);
  if (!p) return next;
  for (const perm of [...p.battlefield]) {
    const effects = parseCastAnySpellEffects(perm.card.oracle_text);
    if (effects.length === 0) continue;
    next = queueTrigger(next, {
      controllerId: casterId,
      name: `${perm.card.name} cast spell`,
      sourcePermanentId: perm.id,
      script: { targets: [], effects },
    });
  }
  return next;
}

/** ETB ÔÇö targeted or targetless via parseEtbScript. Evoke ÔåÆ also sac self. */
export function fireEtbTriggers(
  state: GameState,
  controllerId: string,
  permanent: CardInstance,
  _effects?: import('./effects').Effect[],
): GameState {
  let next = state;
  const script = parseEtbScript(permanent.card.oracle_text);
  if (!(script.effects.length === 1 && script.effects[0].type === 'noop')) {
    next = queueTrigger(next, {
      controllerId,
      name: `${permanent.card.name} ETB`,
      sourcePermanentId: permanent.id,
      script,
    });
  }
  if (permanent.evoked) {
    next = queueTrigger(next, {
      controllerId,
      name: `${permanent.card.name} evoke`,
      sourcePermanentId: permanent.id,
      script: { targets: [], effects: [{ type: 'sacrificeSelf' }] },
    });
  }
  next = fireEtbWatchers(next, controllerId, permanent);
  return next;
}

/** "At the beginning of your/each upkeep|draw step|end step" on permanents + emblems. */
export function fireBeginningStepTriggers(
  state: GameState,
  when: StepTriggerWhen,
): GameState {
  let next = state;
  const activeId = next.players[next.activePlayerIndex]?.id;
  for (const p of next.players) {
    if (p.hasLost) continue;
    for (const perm of [...p.battlefield]) {
      const trigs = parseBeginningStepScripts(perm.card.oracle_text);
      for (const t of trigs) {
        if (t.when !== when) continue;
        if (t.yourOnly && perm.controller !== activeId) continue;
        next = queueTrigger(next, {
          controllerId: perm.controller,
          name: `${perm.card.name} (${when})`,
          sourcePermanentId: perm.id,
          script: t.script,
        });
      }
    }
    for (const emb of p.emblems || []) {
      const trigs = parseBeginningStepScripts(emb.oracle_text);
      for (const t of trigs) {
        if (t.when !== when) continue;
        if (t.yourOnly && p.id !== activeId) continue;
        next = queueTrigger(next, {
          controllerId: p.id,
          name: `${emb.name} (${when})`,
          script: t.script,
        });
      }
    }
  }
  return next;
}

export function fireCombatDamagePlayerTriggers(
  state: GameState,
  attacker: CardInstance,
): GameState {
  const effects = parseCombatDamagePlayerEffects(attacker.card.oracle_text);
  if (effects.length === 0) return state;
  return queueTrigger(state, {
    controllerId: attacker.controller,
    name: `${attacker.card.name} combat damage`,
    sourcePermanentId: attacker.id,
    script: { targets: [], effects },
  });
}
