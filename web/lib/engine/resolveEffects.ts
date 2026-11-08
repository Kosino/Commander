import { cantBeCountered, Effect, parseDiesEffects, TargetRef } from './effects';
import { protectsFromColors } from './protection';
import {
  addPreventionShield,
  addRedirectShield,
  applyDamageWithPrevention,
  applyDrawAmount,
  applyLifeGain,
  tryConsumeShieldCounter,
  deathDestination,
  devotionTo,
  domainCount,
  graveyardBecomesExile,
} from './replacement';
import { makeInstance } from './setup';
import {
  CardData,
  CardInstance,
  effectivePower,
  effectiveToughness,
  GameState,
  hasKeyword,
  isCreature,
  ManaColor,
} from './types';
import {
  addDelayedTrigger,
  fireCreatureDiesWatchers,
  fireEtbTriggers,
  queueTrigger,
} from './triggers';
import { clonePlayers, findCard, moveCard } from './zones';

/** Explore (701.40) — land → hand; else +1/+1 on explorer + bottom. */
function resolveExplore(
  state: GameState,
  controllerId: string,
  targetKey: string | undefined,
  targets: Record<string, TargetRef>,
  sourcePermanentId?: string,
): GameState {
  let explorerId = sourcePermanentId;
  if (targetKey && targets[targetKey]?.kind === 'permanent') {
    explorerId = targets[targetKey].permanentId;
  }
  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === controllerId);
  if (!p || p.library.length === 0) return next;
  const top = p.library.shift()!;
  if (/land/i.test(top.card.type_line)) {
    top.zone = 'hand';
    p.hand.push(top);
  } else {
    if (explorerId) {
      const cr = p.battlefield.find((c) => c.id === explorerId);
      if (cr) cr.counters['+1/+1'] = (cr.counters['+1/+1'] || 0) + 1;
    }
    top.zone = 'library';
    p.library.push(top);
  }
  return next;
}

function drawCards(state: GameState, playerId: string, amount: number): GameState {
  const n = applyDrawAmount(state, playerId, amount);
  const next = clonePlayers(state);
  const p = next.players.find((x) => x.id === playerId);
  if (!p) return next;
  for (let i = 0; i < n; i++) {
    if (p.library.length === 0) {
      p.attemptedEmptyDraw = true;
      break;
    }
    const c = p.library.shift()!;
    c.zone = 'hand';
    p.hand.push(c);
  }
  return next;
}

function applyDamage(
  state: GameState,
  target: TargetRef,
  amount: number,
  sourceColors?: ManaColor[],
  sourceControllerId?: string,
): GameState {
  const prevented = applyDamageWithPrevention(state, target, amount, {
    sourceControllerId,
  });
  let next = prevented.state;
  const dealt = prevented.dealt;
  target = prevented.target;
  if (dealt <= 0) return next;
  next = clonePlayers(next);
  if (target.kind === 'player') {
    const p = next.players.find((x) => x.id === target.playerId);
    if (p && !p.hasLost) {
      p.life -= dealt;
      if (dealt > 0) p.lostLifeThisTurn = true;
    }
    return next;
  }
  if (target.kind !== 'permanent') return next;
  const found = findCard(next, target.permanentId);
  if (!found || found.zone !== 'battlefield') return next;
  const perm = found.player.battlefield.find((c) => c.id === target.permanentId);
  if (!perm) return next;
  if (sourceColors && protectsFromColors(perm, sourceColors)) return next;
  if (perm.card.type_line.includes('Planeswalker')) {
    const loy = (perm.counters['loyalty'] ?? 0) - dealt;
    perm.counters['loyalty'] = Math.max(0, loy);
  } else {
    perm.damageMarked += dealt;
  }
  return next;
}

function putCardToGy(
  state: GameState,
  playerId: string,
  card: CardInstance,
): void {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return;
  if (graveyardBecomesExile(state)) {
    card.zone = 'exile';
    if (card.isCommander) card.commanderRelocationPending = true;
    p.exile.push(card);
  } else {
    card.zone = 'graveyard';
    if (card.isCommander) card.commanderRelocationPending = true;
    p.graveyard.push(card);
  }
}

function requirePermanent(state: GameState, target: TargetRef | undefined): string | null {
  if (!target || target.kind !== 'permanent') return null;
  const found = findCard(state, target.permanentId);
  if (!found || found.zone !== 'battlefield') return null;
  return target.permanentId;
}

function findBf(state: GameState, id: string): CardInstance | undefined {
  const found = findCard(state, id);
  if (!found || found.zone !== 'battlefield') return undefined;
  return found.player.battlefield.find((c) => c.id === id);
}

function applyFightDamage(source: CardInstance, dest: CardInstance, amount: number) {
  if (amount <= 0) return;
  if (protectsFromColors(dest, source.card.colors || [])) return;
  if (hasKeyword(source, 'wither') || hasKeyword(source, 'infect')) {
    dest.counters['-1/-1'] = (dest.counters['-1/-1'] || 0) + amount;
  } else {
    dest.damageMarked += amount;
  }
  if (hasKeyword(source, 'deathtouch')) dest.deathtouchSinceLastSba = true;
}

function createSimpleTokens(
  state: GameState,
  controllerId: string,
  count: number,
  spec: { name: string; typeline: string; oracle: string },
): GameState {
  const n = clonePlayers(state);
  const controller = n.players.find((p) => p.id === controllerId);
  if (!controller) return n;
  for (let i = 0; i < count; i++) {
    const data: CardData = {
      oracle_id: `token-${spec.name.toLowerCase()}`,
      name: spec.name,
      type_line: spec.typeline,
      oracle_text: spec.oracle,
      colors: [] as ManaColor[],
      color_identity: [] as ManaColor[],
      keywords: [],
    };
    controller.battlefield.push(
      makeInstance(data, controllerId, 'battlefield', { isToken: true }),
    );
  }
  return n;
}

export function applyEffects(
  state: GameState,
  controllerId: string,
  effects: Effect[],
  targets: Record<string, TargetRef>,
  sourceColors?: ManaColor[],
  sourcePermanentId?: string,
): GameState {
  let next = state;
  for (const effect of effects) {
    switch (effect.type) {
      case 'damage': {
        const t = targets[effect.targetKey];
        if (t) next = applyDamage(next, t, effect.amount, sourceColors, controllerId);
        break;
      }
      case 'draw':
        next = drawCards(next, controllerId, effect.amount);
        break;
      case 'gainLife': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) p.life += applyLifeGain(next, controllerId, effect.amount);
        next = n;
        break;
      }
      case 'loseLife': {
        const n = clonePlayers(next);
        if (effect.targetKey) {
          const t = targets[effect.targetKey];
          if (t?.kind === 'player') {
            const p = n.players.find((x) => x.id === t.playerId);
            if (p && !p.hasLost) p.life -= effect.amount;
          }
        } else {
          for (const p of n.players) {
            if (p.id !== controllerId && !p.hasLost) p.life -= effect.amount;
          }
        }
        next = n;
        break;
      }
      case 'destroy': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const found = findCard(next, id);
          const perm =
            found?.zone === 'battlefield'
              ? found.player.battlefield.find((c) => c.id === id)
              : undefined;
          if (perm && hasKeyword(perm, 'indestructible')) break;
          {
            const sh = tryConsumeShieldCounter(next, id);
            if (sh.consumed) {
              next = sh.state;
              break;
            }
          }
          if (perm?.regenerateShield) {
            const n = clonePlayers(next);
            const p = findBf(n, id);
            if (p) {
              p.regenerateShield = false;
              p.damageMarked = 0;
              p.deathtouchSinceLastSba = false;
              p.tapped = true;
            }
            next = n;
            break;
          }
          const ctrl = perm?.controller;
          const oracle = perm?.card.oracle_text;
          const name = perm?.card.name;
          const dest = deathDestination(next, id);
          next = moveCard(next, id, dest).state;
          if (perm?.card.type_line.includes('Creature') && dest === 'graveyard') {
            next = {
              ...next,
              creatureDiedThisTurn: true,
              creaturesDiedThisTurn: (next.creaturesDiedThisTurn || 0) + 1,
            };
          }
          if (ctrl && dest === 'graveyard') {
            const dies = parseDiesEffects(oracle);
            if (dies.length) {
              next = queueTrigger(next, {
                controllerId: ctrl,
                name: `${name || 'Permanent'} dies`,
                sourcePermanentId: id,
                script: { targets: [], effects: dies },
              });
            }
            if (perm?.card.type_line.includes('Creature')) {
              next = fireCreatureDiesWatchers(next, ctrl, id);
            }
          }
        }
        break;
      }
      case 'preventDamage': {
        const t = targets[effect.targetKey];
        if (!t || t.kind === 'stack') break;
        next = addPreventionShield(next, {
          controllerId,
          kind: t.kind === 'player' ? 'player' : 'permanent',
          targetId: t.kind === 'player' ? t.playerId : t.permanentId,
          amount: effect.amount,
        });
        break;
      }
      case 'exile': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) next = moveCard(next, id, 'exile').state;
        break;
      }
      case 'bounce': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) next = moveCard(next, id, 'hand').state;
        break;
      }
      case 'tap': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const n = clonePlayers(next);
          const found = findCard(n, t.permanentId);
          if (found?.zone === 'battlefield') {
            const perm = found.player.battlefield.find((c) => c.id === t.permanentId);
            if (perm) perm.tapped = true;
          }
          next = n;
        }
        break;
      }
      case 'untap': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const n = clonePlayers(next);
          const found = findCard(n, t.permanentId);
          if (found?.zone === 'battlefield') {
            const perm = found.player.battlefield.find((c) => c.id === t.permanentId);
            if (perm) perm.tapped = false;
          }
          next = n;
        }
        break;
      }
      case 'pump': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const n = clonePlayers(next);
          const found = findCard(n, t.permanentId);
          if (found?.zone === 'battlefield') {
            const perm = found.player.battlefield.find((c) => c.id === t.permanentId);
            if (perm) {
              perm.tempPower = (perm.tempPower || 0) + effect.power;
              perm.tempToughness = (perm.tempToughness || 0) + effect.toughness;
            }
          }
          next = n;
        }
        break;
      }
      case 'mill': {
        const n = clonePlayers(next);
        const pid =
          effect.targetKey && targets[effect.targetKey]?.kind === 'player'
            ? (targets[effect.targetKey] as { kind: 'player'; playerId: string }).playerId
            : controllerId;
        const p = n.players.find((x) => x.id === pid);
        if (p) {
          for (let i = 0; i < effect.amount; i++) {
            if (p.library.length === 0) break;
            const c = p.library.shift()!;
            putCardToGy(n, pid, c);
          }
        }
        next = n;
        break;
      }
      case 'discard': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'player') {
          const n = clonePlayers(next);
          const p = n.players.find((x) => x.id === t.playerId);
          if (p) {
            for (let i = 0; i < effect.amount; i++) {
              if (p.hand.length === 0) break;
              const idx = Math.floor(Math.random() * p.hand.length);
              const [c] = p.hand.splice(idx, 1);
              putCardToGy(n, t.playerId, c);
            }
          }
          next = n;
        }
        break;
      }
      case 'counter': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'stack') {
          const n = clonePlayers(next);
          const idx = n.stack.findIndex((s) => s.id === t.stackId);
          if (idx >= 0) {
            const obj = n.stack[idx];
            if (obj.cardInstance && cantBeCountered(obj.cardInstance.card.oracle_text)) {
              break;
            }
            const [removed] = n.stack.splice(idx, 1);
            if (removed.cardInstance) {
              const inst = removed.cardInstance;
              const owner = n.players.find((p) => p.id === inst.owner);
              if (owner) {
                inst.zone = 'graveyard';
                if (inst.isCommander) inst.commanderRelocationPending = true;
                owner.graveyard.push(inst);
              }
            }
          }
          next = n;
        }
        break;
      }
      case 'createToken': {
        const n = clonePlayers(next);
        const controller = n.players.find((p) => p.id === controllerId);
        if (controller) {
          for (let i = 0; i < effect.count; i++) {
            const data: CardData = {
              oracle_id: `token-${effect.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
              name: effect.name,
              type_line: effect.typeline,
              power: effect.power,
              toughness: effect.toughness,
              colors: [] as ManaColor[],
              color_identity: [] as ManaColor[],
              keywords: [],
            };
            const tok = makeInstance(data, controllerId, 'battlefield', { isToken: true });
            tok.summoningSick = true;
            controller.battlefield.push(tok);
          }
        }
        next = n;
        break;
      }
      case 'addCounter': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const n = clonePlayers(next);
          const found = findCard(n, t.permanentId);
          if (found?.zone === 'battlefield') {
            const perm = found.player.battlefield.find((c) => c.id === t.permanentId);
            if (perm) {
              perm.counters[effect.counter] =
                (perm.counters[effect.counter] || 0) + effect.amount;
            }
          }
          next = n;
        }
        break;
      }
      case 'fight': {
        const aId = requirePermanent(next, targets[effect.aKey]);
        const bId = requirePermanent(next, targets[effect.bKey]);
        if (aId && bId && aId !== bId) {
          const n = clonePlayers(next);
          const a = findBf(n, aId);
          const b = findBf(n, bId);
          if (a && b) {
            const ap = effectivePower(a, n);
            const bp = effectivePower(b, n);
            applyFightDamage(a, b, ap);
            applyFightDamage(b, a, bp);
          }
          next = n;
        }
        break;
      }
      case 'searchBasicLand': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          const idx = p.library.findIndex(
            (c) =>
              c.card.type_line.includes('Basic') && c.card.type_line.includes('Land'),
          );
          if (idx >= 0) {
            const [land] = p.library.splice(idx, 1);
            land.zone = 'battlefield';
            land.tapped = effect.tapped;
            land.summoningSick = false;
            p.battlefield.push(land);
          }
          // Shuffle library after search (701.20)
          for (let i = p.library.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [p.library[i], p.library[j]] = [p.library[j], p.library[i]];
          }
        }
        next = n;
        break;
      }
      case 'scry': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p && effect.amount > 0) {
          const ids = p.library.slice(0, effect.amount).map((c) => c.id);
          if (ids.length > 0) {
            n.pendingChoices = [
              ...n.pendingChoices,
              { type: 'scry', playerId: controllerId, cardIds: ids },
            ];
          }
        }
        next = n;
        break;
      }
      case 'returnToHand': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const found = findCard(next, t.permanentId);
          if (found?.zone === 'graveyard' && found.player.id === controllerId) {
            next = moveCard(next, t.permanentId, 'hand').state;
          }
        }
        break;
      }
      case 'surveil': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p && effect.amount > 0) {
          const ids = p.library.slice(0, effect.amount).map((c) => c.id);
          if (ids.length > 0) {
            n.pendingChoices = [
              ...n.pendingChoices,
              { type: 'surveil', playerId: controllerId, cardIds: ids },
            ];
          }
        }
        next = n;
        break;
      }
      case 'loot': {
        next = drawCards(next, controllerId, effect.draw);
        const n = clonePlayers(next);
        n.pendingChoices = [
          ...n.pendingChoices,
          { type: 'discardSelect', playerId: controllerId, amount: effect.discard },
        ];
        next = n;
        break;
      }
      case 'sacrifice': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const found = findCard(next, id);
          if (found?.zone === 'battlefield' && found.card.controller === controllerId) {
            const controller = found.card.controller;
            const oracle = found.card.card.oracle_text;
            const wasCreature = isCreature(found.card);
            next = moveCard(next, id, 'graveyard').state;
            const dies = parseDiesEffects(oracle);
            if (dies.length) next = applyEffects(next, controller, dies, {});
            if (wasCreature) {
              next = {
                ...next,
                creatureDiedThisTurn: true,
                creaturesDiedThisTurn: (next.creaturesDiedThisTurn || 0) + 1,
              };
              next = fireCreatureDiesWatchers(next, controller, id);
            }
          }
        }
        break;
      }
      case 'pumpSelf': {
        if (!sourcePermanentId) break;
        const n = clonePlayers(next);
        const perm = findBf(n, sourcePermanentId);
        if (perm) {
          perm.tempPower = (perm.tempPower || 0) + effect.power;
          perm.tempToughness = (perm.tempToughness || 0) + effect.toughness;
        }
        next = n;
        break;
      }
      case 'destroyAllCreatures': {
        let n = next;
        const ids: string[] = [];
        for (const p of n.players) {
          for (const perm of p.battlefield) {
            if (perm.card.type_line.includes('Creature') && !hasKeyword(perm, 'indestructible')) {
              ids.push(perm.id);
            }
          }
        }
        for (const id of ids) {
          const found = findCard(n, id);
          if (!found || found.zone !== 'battlefield') continue;
          const controllerId = found.card.controller;
          const oracle = found.card.card.oracle_text;
          n = moveCard(n, id, 'graveyard').state;
          const dies = parseDiesEffects(oracle);
          if (dies.length) n = applyEffects(n, controllerId, dies, {});
        }
        next = n;
        break;
      }
      case 'createTreasure': {
        next = createSimpleTokens(next, controllerId, effect.count, {
          name: 'Treasure',
          typeline: 'Artifact — Treasure',
          oracle: '{T}, Sacrifice this artifact: Add {C}.',
        });
        break;
      }
      case 'createClue': {
        next = createSimpleTokens(next, controllerId, effect.count, {
          name: 'Clue',
          typeline: 'Artifact — Clue',
          oracle: '{2}, Sacrifice this artifact: Draw a card.',
        });
        break;
      }
      case 'createFood': {
        next = createSimpleTokens(next, controllerId, effect.count, {
          name: 'Food',
          typeline: 'Artifact — Food',
          oracle: '{2}, Sacrifice this artifact: You gain 3 life.',
        });
        break;
      }
      case 'createBlood': {
        next = createSimpleTokens(next, controllerId, effect.count, {
          name: 'Blood',
          typeline: 'Artifact — Blood',
          oracle: '{1}, Sacrifice this artifact: Discard a card, then draw a card.',
        });
        break;
      }
      case 'createMap': {
        next = createSimpleTokens(next, controllerId, effect.count, {
          name: 'Map',
          typeline: 'Artifact — Map',
          oracle:
            '{1}, {T}, Sacrifice this artifact: Target creature you control explores.',
        });
        break;
      }
      case 'createPowerstone': {
        next = createSimpleTokens(next, controllerId, effect.count, {
          name: 'Powerstone',
          typeline: 'Artifact — Powerstone',
          oracle: '{T}: Add {C}. This mana can\'t be spent to cast a nonartifact spell.',
        });
        break;
      }
      case 'populate': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        const tok = p?.battlefield.find((c) => c.isToken && isCreature(c));
        if (p && tok) {
          const data: CardData = { ...tok.card, oracle_id: `token-copy-${tok.card.name}` };
          p.battlefield.push(
            makeInstance(data, controllerId, 'battlefield', { isToken: true }),
          );
        }
        next = n;
        break;
      }
      case 'amass': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          let army = p.battlefield.find(
            (c) => /army/i.test(c.card.type_line) && c.controller === controllerId,
          );
          if (!army) {
            const data: CardData = {
              oracle_id: 'token-zombie-army',
              name: 'Zombie Army',
              type_line: 'Creature — Zombie Army',
              power: '0',
              toughness: '0',
              colors: ['B'] as ManaColor[],
              color_identity: ['B'] as ManaColor[],
              keywords: [],
            };
            army = makeInstance(data, controllerId, 'battlefield', { isToken: true });
            p.battlefield.push(army);
          }
          army.counters['+1/+1'] = (army.counters['+1/+1'] || 0) + effect.amount;
        }
        next = n;
        break;
      }
      case 'drawIfRaid': {
        const p = next.players.find((x) => x.id === controllerId);
        if (p?.attackedThisTurn) next = drawCards(next, controllerId, effect.amount);
        break;
      }
      case 'drawIfMorbid': {
        if (next.creatureDiedThisTurn) next = drawCards(next, controllerId, effect.amount);
        break;
      }
      case 'afterlife': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          for (let i = 0; i < effect.count; i++) {
            const data: CardData = {
              oracle_id: 'token-spirit',
              name: 'Spirit',
              type_line: 'Creature — Spirit',
              power: '1',
              toughness: '1',
              colors: ['W'] as ManaColor[],
              color_identity: ['W'] as ManaColor[],
              keywords: [],
            };
            p.battlefield.push(
              makeInstance(data, controllerId, 'battlefield', { isToken: true }),
            );
          }
        }
        next = n;
        break;
      }
      case 'goad': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const n = clonePlayers(next);
          const perm = findBf(n, id);
          if (perm) {
            perm.goaded = true;
            perm.goadedBy = controllerId;
          }
          next = n;
        }
        break;
      }
      case 'proliferate': {
        const n = clonePlayers(next);
        for (const p of n.players) {
          if (p.poison > 0) p.poison += 1;
          for (const perm of p.battlefield) {
            for (const [k, v] of Object.entries(perm.counters)) {
              if (v > 0) perm.counters[k] = v + 1;
            }
          }
        }
        next = n;
        break;
      }
      case 'ascend': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p && !p.citysBlessing && p.battlefield.length >= 10) {
          p.citysBlessing = true;
        }
        next = n;
        break;
      }
      case 'gainLifeIfBlessing': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p?.citysBlessing) {
          p.life += applyLifeGain(next, controllerId, effect.amount);
        }
        next = n;
        break;
      }
      case 'returnToBattlefield': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const found = findCard(next, t.permanentId);
          if (found?.zone === 'graveyard' && found.player.id === controllerId) {
            next = moveCard(next, t.permanentId, 'battlefield').state;
            const f2 = findCard(next, t.permanentId);
            if (f2?.zone === 'battlefield') {
              const perm = f2.player.battlefield.find((c) => c.id === t.permanentId);
              if (perm) {
                perm.summoningSick = perm.card.type_line.includes('Creature');
                perm.damageMarked = 0;
              }
            }
          }
        }
        break;
      }
      case 'becomeMonarch': {
        const n = clonePlayers(next);
        n.monarchPlayerId = controllerId;
        next = n;
        break;
      }
      case 'attach': {
        break;
      }
      case 'flicker': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const before = findCard(next, id);
          const ownerId = before?.card.owner;
          next = moveCard(next, id, 'exile').state;
          // Return under owner's control (common flicker wording)
          if (ownerId) {
            const n = clonePlayers(next);
            const found = findCard(n, id);
            if (found?.zone === 'exile' && found.player.id !== ownerId) {
              const ix = found.player.exile.findIndex((c) => c.id === id);
              if (ix >= 0) {
                const [moved] = found.player.exile.splice(ix, 1);
                moved.controller = ownerId;
                n.players.find((p) => p.id === ownerId)?.exile.push(moved);
              }
            } else if (found?.zone === 'exile') {
              found.card.controller = ownerId;
            }
            next = n;
          }
          next = moveCard(next, id, 'battlefield').state;
          const f2 = findCard(next, id);
          if (f2?.zone === 'battlefield') {
            const perm = f2.player.battlefield.find((c) => c.id === id);
            if (perm) {
              perm.controller = perm.owner;
              perm.damageMarked = 0;
              perm.tapped = false;
              perm.deathtouchSinceLastSba = false;
              perm.summoningSick = isCreature(perm);
              next = fireEtbTriggers(next, perm.controller, perm);
            }
          }
        }
        break;
      }
      case 'createCopy': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const src = findBf(next, t.permanentId);
          if (src) {
            const n = clonePlayers(next);
            const ctrl = n.players.find((p) => p.id === controllerId);
            if (ctrl) {
              const copy = makeInstance(
                { ...src.card, oracle_id: `copy-${src.card.oracle_id}` },
                controllerId,
                'battlefield',
                { isToken: true },
              );
              copy.summoningSick = isCreature(copy);
              if (src.card.loyalty) {
                const loy = parseInt(src.card.loyalty, 10);
                if (Number.isFinite(loy)) copy.counters['loyalty'] = loy;
              }
              ctrl.battlefield.push(copy);
              next = fireEtbTriggers(n, controllerId, copy);
            }
          }
        }
        break;
      }
      case 'gainControl': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const n = clonePlayers(next);
          const found = findCard(n, id);
          if (found?.zone === 'battlefield' && found.player.id !== controllerId) {
            const idx = found.player.battlefield.findIndex((c) => c.id === id);
            if (idx >= 0) {
              const [perm] = found.player.battlefield.splice(idx, 1);
              perm.controller = controllerId;
              perm.summoningSick = isCreature(perm);
              const newCtrl = n.players.find((p) => p.id === controllerId);
              if (newCtrl) newCtrl.battlefield.push(perm);
            }
          }
          next = n;
        }
        break;
      }
      case 'delayEndStep': {
        next = addDelayedTrigger(next, {
          controllerId,
          name: 'Delayed (end step)',
          when: 'endStep',
          script: { targets: [], effects: effect.effects },
          targets: { ...targets },
        });
        break;
      }
      case 'delayEndCombat': {
        next = addDelayedTrigger(next, {
          controllerId,
          name: 'Delayed (end combat)',
          when: 'endCombat',
          script: { targets: [], effects: effect.effects },
          targets: { ...targets },
        });
        break;
      }
      case 'damageEachCreature': {
        const n = clonePlayers(next);
        for (const p of n.players) {
          for (const perm of p.battlefield) {
            if (!isCreature(perm)) continue;
            const dealt = applyDamageWithPrevention(
              n,
              { kind: 'permanent', permanentId: perm.id },
              effect.amount,
            );
            n.preventionShields = dealt.state.preventionShields;
            if (dealt.dealt > 0) perm.damageMarked += dealt.dealt;
          }
        }
        next = n;
        break;
      }
      case 'damageEachOpponent': {
        let n = clonePlayers(next);
        for (const p of n.players) {
          if (p.id === controllerId || p.hasLost) continue;
          const dealt = applyDamageWithPrevention(
            n,
            { kind: 'player', playerId: p.id },
            effect.amount,
          );
          n = dealt.state;
          const pp = n.players.find((x) => x.id === p.id);
          if (pp && dealt.dealt > 0) {
            pp.life -= dealt.dealt;
            pp.lostLifeThisTurn = true;
          }
        }
        next = n;
        break;
      }
      case 'sacrificeSelf': {
        if (sourcePermanentId) {
          const found = findCard(next, sourcePermanentId);
          if (found?.zone === 'battlefield' && found.card.controller === controllerId) {
            next = moveCard(
              next,
              sourcePermanentId,
              deathDestination(next, sourcePermanentId),
            ).state;
          }
        }
        break;
      }
      case 'grantKeyword': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const n = clonePlayers(next);
          const perm = findBf(n, id);
          if (perm) {
            const kws = new Set(perm.tempKeywords || []);
            kws.add(effect.keyword);
            perm.tempKeywords = [...kws];
          }
          next = n;
        }
        break;
      }
      case 'regenerate': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const n = clonePlayers(next);
          const perm = findBf(n, id);
          if (perm) perm.regenerateShield = true;
          next = n;
        }
        break;
      }
      case 'destroyAllArtifacts': {
        let n = clonePlayers(next);
        const ids: string[] = [];
        for (const p of n.players) {
          for (const perm of p.battlefield) {
            if (perm.card.type_line.includes('Artifact') && !hasKeyword(perm, 'indestructible')) {
              ids.push(perm.id);
            }
          }
        }
        for (const id of ids) n = moveCard(n, id, deathDestination(n, id)).state;
        next = n;
        break;
      }
      case 'destroyAllEnchantments': {
        let n = clonePlayers(next);
        const ids: string[] = [];
        for (const p of n.players) {
          for (const perm of p.battlefield) {
            if (
              perm.card.type_line.includes('Enchantment') &&
              !hasKeyword(perm, 'indestructible')
            ) {
              ids.push(perm.id);
            }
          }
        }
        for (const id of ids) n = moveCard(n, id, deathDestination(n, id)).state;
        next = n;
        break;
      }
      case 'exileAllCreatures': {
        let n = clonePlayers(next);
        const ids: string[] = [];
        for (const p of n.players) {
          for (const perm of p.battlefield) {
            if (isCreature(perm)) ids.push(perm.id);
          }
        }
        for (const id of ids) n = moveCard(n, id, 'exile').state;
        if (ids.length) n.creatureDiedThisTurn = true;
        next = n;
        break;
      }
      case 'bounceAllCreatures': {
        let n = clonePlayers(next);
        const ids: string[] = [];
        for (const p of n.players) {
          for (const perm of p.battlefield) {
            if (isCreature(perm)) ids.push(perm.id);
          }
        }
        for (const id of ids) {
          const f = findCard(n, id);
          if (f?.card.isToken) {
            const idx = f.player.battlefield.findIndex((c) => c.id === id);
            if (idx >= 0) f.player.battlefield.splice(idx, 1);
          } else {
            n = moveCard(n, id, 'hand').state;
          }
        }
        next = n;
        break;
      }
      case 'eachPlayerSacCreature': {
        let n = clonePlayers(next);
        const died: { ctrl: string; id: string }[] = [];
        for (const p of n.players) {
          if (p.hasLost) continue;
          const creature = p.battlefield.find((c) => isCreature(c));
          if (!creature) continue;
          died.push({ ctrl: p.id, id: creature.id });
          n = moveCard(n, creature.id, deathDestination(n, creature.id)).state;
          n.creatureDiedThisTurn = true;
          n.creaturesDiedThisTurn = (n.creaturesDiedThisTurn || 0) + 1;
        }
        next = n;
        for (const d of died) next = fireCreatureDiesWatchers(next, d.ctrl, d.id);
        break;
      }
      case 'untapAllYouControl': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          for (const perm of p.battlefield) {
            if (isCreature(perm)) perm.tapped = false;
          }
        }
        next = n;
        break;
      }
      case 'pumpAllYouControl': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          for (const perm of p.battlefield) {
            if (!isCreature(perm)) continue;
            perm.tempPower = (perm.tempPower || 0) + effect.power;
            perm.tempToughness = (perm.tempToughness || 0) + effect.toughness;
          }
        }
        next = n;
        break;
      }
      case 'copySpell': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'stack') {
          const n = clonePlayers(next);
          const src = n.stack.find((s) => s.id === t.stackId);
          if (src && src.script) {
            n.stack = [
              ...n.stack,
              {
                id: `stk_copy_${Date.now()}`,
                kind: 'spell',
                controller: controllerId,
                name: `${src.name} (copy)`,
                targets: { ...(src.targets || {}) },
                script: src.script,
              },
            ];
            n.consecutivePasses = 0;
          }
          next = n;
        }
        break;
      }
      case 'drawEqualCreatures': {
        const p = next.players.find((x) => x.id === controllerId);
        const n = p ? p.battlefield.filter((c) => isCreature(c)).length : 0;
        if (n > 0) next = drawCards(next, controllerId, n);
        break;
      }
      case 'gainLifeEqualCreatures': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          const count = p.battlefield.filter((c) => isCreature(c)).length;
          p.life += applyLifeGain(next, controllerId, count);
        }
        next = n;
        break;
      }
      case 'damageEqualPower': {
        const src = targets[effect.targetKey];
        const dest = targets[effect.destKey];
        if (src?.kind === 'permanent' && dest) {
          const perm = findBf(next, src.permanentId);
          if (perm) {
            const amt = effectivePower(perm, next);
            if (amt > 0) {
              next = applyDamage(
                next,
                dest,
                amt,
                perm.card.colors,
                perm.controller,
              );
            }
          }
        }
        break;
      }
      case 'createEmblem': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          if (!p.emblems) p.emblems = [];
          p.emblems.push({
            id: `emb_${Date.now()}_${p.emblems.length}`,
            name: effect.name,
            oracle_text: effect.oracle_text,
          });
        }
        next = n;
        break;
      }
      case 'extraTurn': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) p.extraTurns = (p.extraTurns || 0) + 1;
        next = n;
        break;
      }
      case 'putLandFromHand': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          const idx = p.hand.findIndex((c) => c.card.type_line.includes('Land'));
          if (idx >= 0) {
            const [land] = p.hand.splice(idx, 1);
            land.zone = 'battlefield';
            land.summoningSick = false;
            p.battlefield.push(land);
            next = fireEtbTriggers(n, controllerId, land);
            break;
          }
        }
        next = n;
        break;
      }
      case 'preventCombatDamageThisTurn': {
        const n = clonePlayers(next);
        n.preventCombatDamageThisTurn = true;
        next = n;
        break;
      }
      case 'preventAllDamageThisTurn': {
        const n = clonePlayers(next);
        n.preventAllDamageThisTurn = true;
        n.preventCombatDamageThisTurn = true;
        next = n;
        break;
      }
      case 'redirectDamage': {
        const to = targets[effect.toKey];
        const from =
          effect.fromKey === 'self'
            ? ({ kind: 'player', playerId: controllerId } as TargetRef)
            : targets[effect.fromKey];
        if (from && to && from.kind !== 'stack' && to.kind !== 'stack') {
          const fromKind = from.kind === 'player' ? 'player' : 'permanent';
          const fromId = from.kind === 'player' ? from.playerId : from.permanentId;
          const toKind = to.kind === 'player' ? 'player' : 'permanent';
          const toId = to.kind === 'player' ? to.playerId : to.permanentId;
          next = addRedirectShield(next, {
            controllerId,
            fromKind,
            fromId,
            toKind,
            toId,
            amount: effect.amount,
          });
        }
        break;
      }
      case 'putOnTop': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          const moved = moveCard(next, id, 'library');
          next = moved.state;
          if (moved.card) {
            const owner = next.players.find((x) => x.id === moved.card!.owner);
            if (owner) {
              const idx = owner.library.findIndex((c) => c.id === id);
              if (idx > 0) {
                const [c] = owner.library.splice(idx, 1);
                owner.library.unshift(c);
              }
            }
          }
        }
        break;
      }
      case 'putOnBottom': {
        const id = requirePermanent(next, targets[effect.targetKey]);
        if (id) {
          // moveCard already pushes to end of library = bottom
          next = moveCard(next, id, 'library').state;
        }
        break;
      }
      case 'lookAtTop': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          const ids = p.library.slice(0, effect.amount).map((c) => c.id);
          if (ids.length) {
            n.pendingChoices = [
              ...n.pendingChoices,
              { type: 'lookAtTop', playerId: controllerId, cardIds: ids },
            ];
          }
        }
        next = n;
        break;
      }
      case 'exileFromGraveyard': {
        const t = targets[effect.targetKey];
        if (t?.kind === 'permanent') {
          const found = findCard(next, t.permanentId);
          if (found?.zone === 'graveyard') {
            next = moveCard(next, t.permanentId, 'exile').state;
          }
        }
        break;
      }
      case 'getExperience': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) p.experience = (p.experience || 0) + effect.amount;
        next = n;
        break;
      }
      case 'getEnergy': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) p.energy = (p.energy || 0) + effect.amount;
        next = n;
        break;
      }
      case 'drawEqualExperience': {
        const p = next.players.find((x) => x.id === controllerId);
        const n = p?.experience || 0;
        if (n > 0) next = drawCards(next, controllerId, n);
        break;
      }
      case 'damageEqualDevotion': {
        const amt = devotionTo(next, controllerId, effect.color);
        const t = targets[effect.targetKey];
        if (t && amt > 0) {
          next = applyDamage(next, t, amt, sourceColors, controllerId);
        }
        break;
      }
      case 'drawEqualDevotion': {
        const amt = devotionTo(next, controllerId, effect.color);
        if (amt > 0) next = drawCards(next, controllerId, amt);
        break;
      }
      case 'gainLifeEqualDevotion': {
        const amt = devotionTo(next, controllerId, effect.color);
        if (amt > 0) {
          const n = clonePlayers(next);
          const p = n.players.find((x) => x.id === controllerId);
          if (p) p.life += applyLifeGain(next, controllerId, amt);
          next = n;
        }
        break;
      }
      case 'damageEqualDomain': {
        const amt = domainCount(next, controllerId);
        const t = targets[effect.targetKey];
        if (t && amt > 0) {
          next = applyDamage(next, t, amt, sourceColors, controllerId);
        }
        break;
      }
      case 'drawEqualDomain': {
        const amt = domainCount(next, controllerId);
        if (amt > 0) next = drawCards(next, controllerId, amt);
        break;
      }
      case 'explore': {
        next = resolveExplore(next, controllerId, effect.targetKey, targets, sourcePermanentId);
        break;
      }
      case 'fabricate': {
        if (sourcePermanentId) {
          const n = clonePlayers(next);
          n.pendingChoices = [
            ...n.pendingChoices,
            {
              type: 'fabricate',
              playerId: controllerId,
              permanentId: sourcePermanentId,
              amount: effect.amount,
            },
          ];
          next = n;
        } else {
          // No source — create Servos
          next = createSimpleTokens(next, controllerId, effect.amount, {
            name: 'Servo',
            typeline: 'Artifact Creature — Servo',
            oracle: '',
          });
        }
        break;
      }
      case 'support': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          const others = p.battlefield.filter(
            (c) => isCreature(c) && c.id !== sourcePermanentId,
          );
          for (const c of others.slice(0, effect.amount)) {
            c.counters['+1/+1'] = (c.counters['+1/+1'] || 0) + 1;
          }
        }
        next = n;
        break;
      }
      case 'bolster': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          let best: CardInstance | undefined;
          let bestT = Infinity;
          for (const c of p.battlefield) {
            if (!isCreature(c)) continue;
            const t = effectiveToughness(c, n);
            if (t == null) continue;
            if (t < bestT) {
              bestT = t;
              best = c;
            }
          }
          if (best) {
            best.counters['+1/+1'] = (best.counters['+1/+1'] || 0) + effect.amount;
          }
        }
        next = n;
        break;
      }
      case 'backup': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          const other = p.battlefield.find(
            (c) => isCreature(c) && c.id !== sourcePermanentId,
          );
          if (other) {
            other.counters['+1/+1'] = (other.counters['+1/+1'] || 0) + effect.amount;
          }
        }
        next = n;
        break;
      }
      case 'loseLifeEachOpponent': {
        const n = clonePlayers(next);
        for (const p of n.players) {
          if (p.id === controllerId || p.hasLost) continue;
          p.life -= effect.amount;
          if (effect.amount > 0) p.lostLifeThisTurn = true;
        }
        next = n;
        break;
      }
      case 'discardEachOpponent': {
        const n = clonePlayers(next);
        for (const p of n.players) {
          if (p.id === controllerId || p.hasLost) continue;
          const amt = Math.min(effect.amount, p.hand.length);
          if (amt <= 0) continue;
          // Auto-discard from end of hand (Arena-like when no choice UI)
          for (let i = 0; i < amt; i++) {
            const c = p.hand.pop();
            if (!c) break;
            c.zone = 'graveyard';
            if (c.isCommander) c.commanderRelocationPending = true;
            p.graveyard.push(c);
          }
        }
        next = n;
        break;
      }
      case 'addCounterAllYouControl': {
        const n = clonePlayers(next);
        const p = n.players.find((x) => x.id === controllerId);
        if (p) {
          for (const c of p.battlefield) {
            if (!isCreature(c)) continue;
            c.counters[effect.counter] =
              (c.counters[effect.counter] || 0) + effect.amount;
          }
        }
        next = n;
        break;
      }
      case 'drawEqualDiedThisTurn': {
        const amt = next.creaturesDiedThisTurn || (next.creatureDiedThisTurn ? 1 : 0);
        if (amt > 0) next = drawCards(next, controllerId, amt);
        break;
      }
      case 'noop':
        break;
    }
  }
  return next;
}
