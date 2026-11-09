import { getAfterlife, hasAscend, parseModular } from './effects';
import { applyEffects } from './resolveEffects';
import {
  GameState,
  hasKeyword,
  isBattle,
  isCreature,
  isLegendary,
  isPlaneswalker,
  isSiege,
  parseLoyalty,
  parseDefense,
  effectiveToughness,
  PendingChoice,
} from './types';
import { deathDestination } from './replacement';
import { fireDiesFromSnapshot, fireEtbTriggers, queueTrigger } from './triggers';
import { clonePlayers, findCard, moveCard } from './zones';
import { makeInstance } from './setup';

function losePlayer(state: GameState, playerId: string, reason: string): GameState {
  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId);
  if (!p || p.hasLost) return next;
  p.hasLost = true;
  p.loseReason = reason;

  const alive = next.players.filter((x) => !x.hasLost);
  if (alive.length === 1) next.winnerId = alive[0].id;
  if (alive.length === 0) next.winnerId = null;
  return next;
}

/**
 * One SBA sweep (CR 704.3 / 704.5 + Commander 704.6c–d).
 * Returns { state, performed }. Caller loops until !performed.
 * Legend rule and commander-to-CZ "may" become pendingChoices when ambiguous.
 */
export function applyStateBasedActionsOnce(state: GameState): { state: GameState; performed: boolean } {
  if (state.pendingChoices.length > 0) {
    return { state, performed: false };
  }

  let next = clonePlayers(state);
  let performed = false;

  // 704.5a life ≤ 0
  for (const p of next.players) {
    if (!p.hasLost && p.life <= 0) {
      next = losePlayer(next, p.id, '704.5a life ≤ 0');
      performed = true;
    }
  }

  // 704.5b empty library draw
  for (const p of next.players) {
    if (!p.hasLost && p.attemptedEmptyDraw) {
      next = losePlayer(next, p.id, '704.5b draw from empty library');
      performed = true;
    }
  }

  // 704.5c poison ≥ 10
  for (const p of next.players) {
    if (!p.hasLost && p.poison >= 10) {
      next = losePlayer(next, p.id, '704.5c poison ≥ 10');
      performed = true;
    }
  }

  // 704.6c commander damage ≥ 21
  for (const p of next.players) {
    if (p.hasLost) continue;
    for (const [cmdId, dmg] of Object.entries(p.commanderDamage)) {
      if (dmg >= 21) {
        next = losePlayer(next, p.id, `704.6c commander damage ≥ 21 (${cmdId})`);
        performed = true;
        break;
      }
    }
  }

  // Reset empty-draw flags after check
  for (const p of next.players) {
    if (p.attemptedEmptyDraw) {
      p.attemptedEmptyDraw = false;
      performed = true;
    }
  }

  // 704.5d tokens off battlefield cease to exist
  for (const p of next.players) {
    for (const zone of ['hand', 'library', 'graveyard', 'exile', 'command'] as const) {
      const list = zone === 'command' ? p.commandZone : p[zone];
      const before = list.length;
      const kept = list.filter((c) => !c.isToken);
      if (kept.length !== before) {
        if (zone === 'command') p.commandZone = kept;
        else p[zone] = kept;
        performed = true;
      }
    }
  }

  // 704.5n/p — Aura/Equipment attached to missing permanent
  for (const p of next.players) {
    for (const perm of [...p.battlefield]) {
      if (!perm.attachedTo) continue;
      const host = findCard(next, perm.attachedTo);
      if (host?.zone === 'battlefield') continue;
      if (perm.card.type_line.includes('Aura')) {
        next = moveCard(next, perm.id, 'graveyard').state;
        performed = true;
      } else {
        perm.attachedTo = undefined;
        performed = true;
      }
    }
  }

  // Creatures / planeswalkers dying
  const toGraveyard: string[] = [];

  for (const p of next.players) {
    for (const perm of p.battlefield) {
      if (isCreature(perm)) {
        const tough = effectiveToughness(perm, next);
        const indestructible = hasKeyword(perm, 'indestructible');
        // 704.5f toughness ≤ 0 — still dies even with indestructible
        if (tough !== null && tough <= 0) {
          toGraveyard.push(perm.id);
          continue;
        }
        // 704.5g / 704.5h — destroy by damage / deathtouch; indestructible / regenerate
        const lethal =
          !indestructible &&
          tough !== null &&
          tough > 0 &&
          (perm.damageMarked >= tough || perm.deathtouchSinceLastSba);
        if (lethal) {
          if (perm.regenerateShield) {
            perm.regenerateShield = false;
            perm.damageMarked = 0;
            perm.deathtouchSinceLastSba = false;
            perm.tapped = true;
            continue;
          }
          toGraveyard.push(perm.id);
          continue;
        }
      }
      if (isPlaneswalker(perm)) {
        const loy = perm.counters['loyalty'] ?? parseLoyalty(perm.card) ?? 0;
        if (loy <= 0) toGraveyard.push(perm.id); // 704.5i
      }
      // 704.5v — Battle with 0 defense
      if (isBattle(perm)) {
        const def = perm.counters['defense'] ?? parseDefense(perm.card) ?? 0;
        if (def <= 0) {
          // Siege with back face: exile → cast transformed (310.12b MVP: put BF)
          if (isSiege(perm) && perm.card.other_face && !perm.transformed) {
            const ctrl = perm.controller;
            const back = perm.card.other_face;
            next = moveCard(next, perm.id, 'exile').state;
            const owner = next.players.find((p) => p.id === ctrl);
            if (owner) {
              const transformed = makeInstance(back, ctrl, 'battlefield');
              transformed.transformed = true;
              if (back.loyalty) {
                const loy = parseInt(back.loyalty, 10);
                if (Number.isFinite(loy)) transformed.counters['loyalty'] = loy;
              }
              owner.battlefield.push(transformed);
              next = fireEtbTriggers(next, ctrl, transformed);
            }
            performed = true;
            continue;
          }
          toGraveyard.push(perm.id);
        }
      }
    }
  }

  type DiedSnap = {
    controllerId: string;
    oracle?: string;
    cardId: string;
    name?: string;
    counters: Record<string, number>;
    keywords: string[];
    oracleText?: string;
    blitzed?: boolean;
    wasCreature?: boolean;
  };
  const diedSnap: DiedSnap[] = [];
  for (const id of toGraveyard) {
    const found = findCard(next, id);
    if (found?.zone === 'battlefield') {
      diedSnap.push({
        controllerId: found.card.controller,
        oracle: found.card.card.oracle_text,
        cardId: found.card.id,
        name: found.card.card.name,
        counters: { ...found.card.counters },
        keywords: found.card.card.keywords || [],
        oracleText: found.card.card.oracle_text,
        blitzed: found.card.blitzed,
        wasCreature: isCreature(found.card),
      });
      // Detach auras → GY, equipment → unattach (704.5n / 704.5p)
      for (const p of next.players) {
        for (const perm of [...p.battlefield]) {
          if (perm.attachedTo !== id) continue;
          if (perm.card.type_line.includes('Enchantment') && perm.card.type_line.includes('Aura')) {
            const movedAura = moveCard(next, perm.id, 'graveyard');
            next = movedAura.state;
          } else {
            const eq = p.battlefield.find((c) => c.id === perm.id);
            if (eq) eq.attachedTo = undefined;
          }
        }
      }
    }
    const dest = deathDestination(next, id);
    const moved = moveCard(next, id, dest);
    next = moved.state;
    performed = true;
  }
  if (diedSnap.length > 0) {
    const creatureDeaths = diedSnap.filter((d) => d.wasCreature).length;
    if (creatureDeaths > 0) {
      next.creatureDiedThisTurn = true;
      next.creaturesDiedThisTurn = (next.creaturesDiedThisTurn || 0) + creatureDeaths;
    }
    next = fireDiesFromSnapshot(
      next,
      diedSnap.map((d) => ({
        controllerId: d.controllerId,
        oracle: d.oracle,
        cardId: d.cardId,
        wasCreature: d.wasCreature,
      })),
    );
    // Afterlife (trigger) / Modular / Blitz draw
    for (const d of diedSnap) {
      const al = getAfterlife({ oracle_text: d.oracleText, keywords: d.keywords });
      if (al > 0) {
        next = queueTrigger(next, {
          controllerId: d.controllerId,
          name: `${d.name || 'Creature'} afterlife`,
          sourcePermanentId: d.cardId,
          script: { targets: [], effects: [{ type: 'afterlife', count: al }] },
        });
      }
      const mod = parseModular(d.oracleText);
      if (mod !== null) {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === d.controllerId);
        const dest = p?.battlefield.find(
          (c) => isCreature(c) && c.id !== d.cardId && /artifact/i.test(c.card.type_line),
        );
        const plus = d.counters['+1/+1'] || 0;
        if (dest && plus > 0) {
          dest.counters['+1/+1'] = (dest.counters['+1/+1'] || 0) + plus;
          next = n;
        }
      }
      if (d.blitzed) {
        next = applyEffects(next, d.controllerId, [{ type: 'draw', amount: 1 }], {});
      }
    }
    // Persist / Undying (702.78 / 702.92) — return after dies triggers
    for (const d of diedSnap) {
      const hasPersist =
        d.keywords.some((k) => k.toLowerCase() === 'persist') ||
        /\bpersist\b/i.test(d.oracleText || '');
      const hasUndying =
        d.keywords.some((k) => k.toLowerCase() === 'undying') ||
        /\bundying\b/i.test(d.oracleText || '');
      if (hasPersist && !(d.counters['-1/-1'] > 0)) {
        const moved = moveCard(next, d.cardId, 'battlefield');
        next = moved.state;
        const f = findCard(next, d.cardId);
        if (f?.zone === 'battlefield') {
          const perm = f.player.battlefield.find((c) => c.id === d.cardId);
          if (perm) {
            perm.counters = { '-1/-1': 1 };
            perm.damageMarked = 0;
            perm.summoningSick = true;
          }
        }
        performed = true;
      } else if (hasUndying && !(d.counters['+1/+1'] > 0)) {
        const moved = moveCard(next, d.cardId, 'battlefield');
        next = moved.state;
        const f = findCard(next, d.cardId);
        if (f?.zone === 'battlefield') {
          const perm = f.player.battlefield.find((c) => c.id === d.cardId);
          if (perm) {
            perm.counters = { '+1/+1': 1 };
            perm.damageMarked = 0;
            perm.summoningSick = true;
          }
        }
        performed = true;
      }
    }
  }

  // Ascend — city's blessing if 10+ permanents while controlling Ascend (702.130)
  for (const p of next.players) {
    if (p.citysBlessing || p.hasLost) continue;
    if (p.battlefield.length < 10) continue;
    if (p.battlefield.some((c) => hasAscend(c.card))) {
      p.citysBlessing = true;
      performed = true;
    }
  }

  // Clear deathtouch flags after SBA check
  for (const p of next.players) {
    for (const perm of p.battlefield) {
      if (perm.deathtouchSinceLastSba) {
        perm.deathtouchSinceLastSba = false;
      }
    }
  }

  // 704.5j legend rule — if >1 same name controlled by same player, pending choice
  const legendChoices: PendingChoice[] = [];
  for (const p of next.players) {
    if (p.hasLost) continue;
    const byName = new Map<string, string[]>();
    for (const perm of p.battlefield) {
      if (!isLegendary(perm)) continue;
      const name = perm.card.name;
      const ids = byName.get(name) || [];
      ids.push(perm.id);
      byName.set(name, ids);
    }
    for (const [name, ids] of byName) {
      if (ids.length > 1) {
        legendChoices.push({ type: 'legend', playerId: p.id, name, permanentIds: ids });
      }
    }
  }
  if (legendChoices.length) {
    next.pendingChoices = [...next.pendingChoices, ...legendChoices];
    performed = true;
    next.stateBasedActionsPending = true;
    return { state: next, performed };
  }

  // 704.6d / 903.9 — commander put into GY/exile/hand/library → owner may put in command zone
  for (const p of next.players) {
    for (const c of [...p.graveyard, ...p.exile, ...p.hand, ...p.library]) {
      if (!c.isCommander || !c.commanderRelocationPending) continue;
      c.commanderRelocationPending = false;
      const from =
        c.zone === 'exile'
          ? 'exile'
          : c.zone === 'hand'
            ? 'hand'
            : c.zone === 'library'
              ? 'library'
              : 'graveyard';
      next.pendingChoices.push({
        type: 'commanderToCommandZone',
        playerId: p.id,
        cardId: c.id,
        from,
      });
      performed = true;
    }
  }

  // 704.5q +1/+1 and -1/-1 cancel
  for (const p of next.players) {
    for (const perm of p.battlefield) {
      const plus = perm.counters['+1/+1'] || 0;
      const minus = perm.counters['-1/-1'] || 0;
      if (plus > 0 && minus > 0) {
        const n = Math.min(plus, minus);
        perm.counters['+1/+1'] = plus - n;
        perm.counters['-1/-1'] = minus - n;
        if (perm.counters['+1/+1'] === 0) delete perm.counters['+1/+1'];
        if (perm.counters['-1/-1'] === 0) delete perm.counters['-1/-1'];
        performed = true;
      }
    }
  }

  next.stateBasedActionsPending = performed;
  return { state: next, performed };
}

/** CR 117.5 / 704.3 — repeat SBA until stable or a pending choice blocks. */
export function checkStateBasedActions(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 64; i++) {
    const { state: next, performed } = applyStateBasedActionsOnce(current);
    current = next;
    if (!performed || current.pendingChoices.length > 0) break;
  }
  current = { ...current, stateBasedActionsPending: false };
  return current;
}

/** Resolve legend rule: keep one permanent, rest to GY. */
export function resolveLegendChoice(state: GameState, keepId: string): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'legend' && c.permanentIds.includes(keepId));
  if (!choice || choice.type !== 'legend') return state;

  let next: GameState = {
    ...state,
    pendingChoices: state.pendingChoices.filter((c) => c !== choice),
  };
  for (const id of choice.permanentIds) {
    if (id === keepId) continue;
    next = moveCard(next, id, 'graveyard').state;
  }
  return checkStateBasedActions(next);
}

/** Scry: move selected cards to bottom (order preserved); rest stay on top in order. */
export function resolveScryChoice(state: GameState, bottomIds: string[]): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'scry');
  if (!choice || choice.type !== 'scry') return state;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  const p = next.players.find((x) => x.id === choice.playerId);
  if (!p) return next;

  const topSet = new Set(choice.cardIds);
  const topCards = choice.cardIds
    .map((id) => p.library.find((c) => c.id === id))
    .filter(Boolean) as typeof p.library;
  const bottomSet = new Set(bottomIds.filter((id) => topSet.has(id)));
  const keepTop = topCards.filter((c) => !bottomSet.has(c.id));
  const toBottom = topCards.filter((c) => bottomSet.has(c.id));
  const rest = p.library.filter((c) => !topSet.has(c.id));
  p.library = [...keepTop, ...rest, ...toBottom];
  return checkStateBasedActions(next);
}

/** Surveil: selected cards → GY; rest stay on top. */
export function resolveSurveilChoice(state: GameState, toGyIds: string[]): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'surveil');
  if (!choice || choice.type !== 'surveil') return state;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  const p = next.players.find((x) => x.id === choice.playerId);
  if (!p) return next;

  const topSet = new Set(choice.cardIds);
  const gySet = new Set(toGyIds.filter((id) => topSet.has(id)));
  const keepTop = choice.cardIds
    .map((id) => p.library.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c && !gySet.has(c.id));
  const toGy = choice.cardIds
    .map((id) => p.library.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c && gySet.has(c.id));
  const rest = p.library.filter((c) => !topSet.has(c.id));
  p.library = [...keepTop, ...rest];
  for (const c of toGy) {
    c.zone = 'graveyard';
    if (c.isCommander) c.commanderRelocationPending = true;
    p.graveyard.push(c);
  }
  return checkStateBasedActions(next);
}

/** Riot: haste or +1/+1 counter. */
export function resolveRiotChoice(
  state: GameState,
  permanentId: string,
  choice: 'haste' | 'counter',
): GameState {
  const pending = state.pendingChoices.find(
    (c) => c.type === 'riot' && c.permanentId === permanentId,
  );
  if (!pending || pending.type !== 'riot') return state;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== pending);
  const found = findCard(next, permanentId);
  if (found?.zone === 'battlefield') {
    const perm = found.player.battlefield.find((c) => c.id === permanentId);
    if (perm) {
      if (choice === 'haste') {
        perm.summoningSick = false;
        // MVP: mark haste via keyword on instance — use temp flag
        if (!perm.card.keywords.includes('haste')) {
          perm.card = { ...perm.card, keywords: [...perm.card.keywords, 'haste'] };
        }
      } else {
        perm.counters['+1/+1'] = (perm.counters['+1/+1'] || 0) + 1;
      }
    }
  }
  return checkStateBasedActions(next);
}

/** Annihilator / sac N permanents. */
export function resolveSacrificePermanents(state: GameState, permanentIds: string[]): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'sacrificePermanents');
  if (!choice || choice.type !== 'sacrificePermanents') return state;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  const pick = permanentIds.slice(0, choice.amount);
  let s = next;
  for (const id of pick) {
    const found = findCard(s, id);
    if (!found || found.zone !== 'battlefield' || found.player.id !== choice.playerId) continue;
    s = moveCard(s, id, 'graveyard').state;
  }
  // Auto-fill if short
  while (pick.length < choice.amount) {
    const p = s.players.find((x) => x.id === choice.playerId);
    if (!p || p.battlefield.length === 0) break;
    const auto = p.battlefield[0];
    pick.push(auto.id);
    s = moveCard(s, auto.id, 'graveyard').state;
  }
  return checkStateBasedActions(s);
}

/** Discard N cards chosen by player. */
export function resolveDiscardSelect(state: GameState, cardIds: string[]): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'discardSelect');
  if (!choice || choice.type !== 'discardSelect') return state;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  const p = next.players.find((x) => x.id === choice.playerId);
  if (!p) return next;

  const pick = cardIds.slice(0, choice.amount);
  for (const id of pick) {
    const idx = p.hand.findIndex((c) => c.id === id);
    if (idx < 0) continue;
    const [c] = p.hand.splice(idx, 1);
    c.zone = 'graveyard';
    if (c.isCommander) c.commanderRelocationPending = true;
    p.graveyard.push(c);
  }
  // If not enough chosen, discard random remainder
  while (pick.length < choice.amount && p.hand.length > 0) {
    const idx = Math.floor(Math.random() * p.hand.length);
    const [c] = p.hand.splice(idx, 1);
    c.zone = 'graveyard';
    if (c.isCommander) c.commanderRelocationPending = true;
    p.graveyard.push(c);
    pick.push(c.id);
  }
  let after = checkStateBasedActions(next);
  // Cleanup hand-size done → next turn (avoid circular import at module load)
  if (
    after.phase === 'ending' &&
    after.step === 'cleanup' &&
    after.pendingChoices.length === 0 &&
    after.stack.length === 0
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { beginNextTurn } = require('./turn') as typeof import('./turn');
    after = beginNextTurn(after);
  }
  return after;
}

/** Look at top — dismiss after viewing (order unchanged). */
export function resolveLookAtTopChoice(state: GameState): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'lookAtTop');
  if (!choice || choice.type !== 'lookAtTop') return state;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  return checkStateBasedActions(next);
}

/** Devour — sac chosen other creatures; get devourN +1/+1 each (702.81). */
export function resolveDevourChoice(state: GameState, creatureIds: string[]): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'devour');
  if (!choice || choice.type !== 'devour') return state;
  let next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  const p = next.players.find((x) => x.id === choice.playerId);
  if (!p) return checkStateBasedActions(next);
  let eaten = 0;
  for (const id of creatureIds) {
    if (id === choice.permanentId) continue;
    const found = findCard(next, id);
    if (!found || found.zone !== 'battlefield' || found.player.id !== choice.playerId) continue;
    if (!isCreature(found.card)) continue;
    next = moveCard(next, id, 'graveyard').state;
    eaten += 1;
  }
  if (eaten > 0) {
    const f = findCard(next, choice.permanentId);
    const perm =
      f?.zone === 'battlefield'
        ? f.player.battlefield.find((c) => c.id === choice.permanentId)
        : undefined;
    if (perm) {
      perm.counters['+1/+1'] = (perm.counters['+1/+1'] || 0) + eaten * choice.devourN;
    }
  }
  return checkStateBasedActions(next);
}

/** Siege ETB — set protector (310.12a). */
export function resolveBattleProtector(state: GameState, opponentId: string): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'chooseBattleProtector');
  if (!choice || choice.type !== 'chooseBattleProtector') return state;
  if (!choice.opponentIds.includes(opponentId)) return state;
  const next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  const found = findCard(next, choice.battleId);
  if (found?.zone === 'battlefield') {
    const battle = found.player.battlefield.find((c) => c.id === choice.battleId);
    if (battle) battle.protectorPlayerId = opponentId;
  }
  return checkStateBasedActions(next);
}

/** Flip a DFC / transform permanent in place (701.27). */
export function transformPermanent(state: GameState, permanentId: string): GameState {
  const next = clonePlayers(state);
  const found = findCard(next, permanentId);
  if (!found || found.zone !== 'battlefield') return state;
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm?.card.other_face) return state;
  const back = perm.card.other_face;
  const front = { ...perm.card, other_face: undefined };
  // Swap: current becomes other_face of new face
  perm.card = { ...back, other_face: front };
  perm.transformed = !perm.transformed;
  perm.damageMarked = 0;
  perm.tempPower = 0;
  perm.tempToughness = 0;
  perm.tempKeywords = [];
  // Re-init loyalty/defense for new face
  if (back.loyalty) {
    const loy = parseInt(back.loyalty, 10);
    if (Number.isFinite(loy)) perm.counters['loyalty'] = loy;
  }
  if (back.defense) {
    const def = parseInt(back.defense, 10);
    if (Number.isFinite(def)) perm.counters['defense'] = def;
  }
  return checkStateBasedActions(next);
}

/** Optional "You may …" — take or decline. */
export function resolveOptionalEffect(state: GameState, take: boolean): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'optionalEffect');
  if (!choice || choice.type !== 'optionalEffect') return state;
  let next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  if (take) {
    next = applyEffects(
      next,
      choice.playerId,
      choice.script.effects,
      {},
      undefined,
      choice.sourcePermanentId,
    );
  }
  return checkStateBasedActions(next);
}

/** Fabricate — tokens or +1/+1 counters (702.122). */
export function resolveFabricateChoice(
  state: GameState,
  mode: 'tokens' | 'counters',
): GameState {
  const choice = state.pendingChoices.find((c) => c.type === 'fabricate');
  if (!choice || choice.type !== 'fabricate') return state;
  let next = clonePlayers(state);
  next.pendingChoices = next.pendingChoices.filter((c) => c !== choice);
  const p = next.players.find((x) => x.id === choice.playerId);
  if (!p) return checkStateBasedActions(next);
  if (mode === 'counters') {
    const perm = p.battlefield.find((c) => c.id === choice.permanentId);
    if (perm) {
      perm.counters['+1/+1'] = (perm.counters['+1/+1'] || 0) + choice.amount;
    }
  } else {
    next = applyEffects(
      next,
      choice.playerId,
      [{ type: 'fabricate', amount: choice.amount }],
      {},
    );
    // Without sourcePermanentId, fabricate creates Servos
  }
  return checkStateBasedActions(next);
}

/** Resolve 704.6d: put commander to command zone or leave it. */
export function resolveCommanderZoneChoice(
  state: GameState,
  cardId: string,
  toCommandZone: boolean,
): GameState {
  const choice = state.pendingChoices.find(
    (c) => c.type === 'commanderToCommandZone' && c.cardId === cardId,
  );
  if (!choice || choice.type !== 'commanderToCommandZone') return state;

  let next: GameState = {
    ...state,
    pendingChoices: state.pendingChoices.filter((c) => c !== choice),
  };
  if (toCommandZone) {
    next = moveCard(next, cardId, 'command').state;
  }
  return checkStateBasedActions(next);
}
