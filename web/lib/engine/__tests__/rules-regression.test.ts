/**
 * CR interaction regressions — small GameState, no demo deck.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  beginCast,
  commanderTaxCost,
  confirmCastPay,
  selectCastTarget,
} from '../cast';
import {
  applyCombatDamage,
  confirmAttackers,
  confirmBlockers,
  confirmDamageAssign,
  startDeclareAttackers,
  startDeclareBlockers,
  toggleDraftAttacker,
  toggleDraftBlocker,
} from '../combat';
import { continuousPtBonus } from '../continuous';
import { playLand } from '../actions';
import { passPriority, pushStack } from '../priority';
import { addPreventionShield, applyDamageWithPrevention } from '../replacement';
import {
  checkStateBasedActions,
  resolveCommanderZoneChoice,
  resolveLegendChoice,
} from '../sba';
import { listLegalTargets } from '../targets';
import { moveCard } from '../zones';
import { card, fillMana, player, putInHand, putOnBattlefield, readyGame } from './helpers';

describe('CR rules regressions', () => {
  it('704.5f zero toughness goes to graveyard', () => {
    let s = readyGame();
    const { state, card: c } = putOnBattlefield(
      s,
      'p1',
      card({ name: 'Zero', type_line: 'Creature — Test', power: '0', toughness: '0' }),
    );
    s = checkStateBasedActions(state);
    assert.ok(player(s, 'p1').graveyard.some((x) => x.id === c.id));
    assert.ok(!player(s, 'p1').battlefield.some((x) => x.id === c.id));
  });

  it('903.9a commander death offers command zone then resolveCommanderZoneChoice', () => {
    let s = readyGame();
    const cmdCard = player(s, 'p1').commandZone[0]!;
    // Move commander to battlefield then to GY via moveCard (sets relocation pending)
    s = moveCard(s, cmdCard.id, 'battlefield').state;
    s = moveCard(s, cmdCard.id, 'graveyard').state;
    s = checkStateBasedActions(s);
    const choice = s.pendingChoices.find((c) => c.type === 'commanderToCommandZone');
    assert.ok(choice && choice.type === 'commanderToCommandZone');
    s = resolveCommanderZoneChoice(s, choice.cardId, true);
    assert.ok(player(s, 'p1').commandZone.some((x) => x.id === cmdCard.id));
  });

  it('903.10a / 704.6c 21 commander damage loses', () => {
    let s = readyGame();
    const cmdId = player(s, 'p1').commandZone[0]!.id;
    const next = structuredClone(s) as typeof s;
    player(next, 'p2').commanderDamage[cmdId] = 21;
    s = checkStateBasedActions(next);
    assert.equal(player(s, 'p2').hasLost, true);
  });

  it('704.5j legend choice then keep one', () => {
    let s = readyGame();
    const legend = card({
      name: 'Same Name',
      type_line: 'Legendary Creature — Test',
      power: '2',
      toughness: '2',
    });
    let a = putOnBattlefield(s, 'p1', legend);
    s = a.state;
    const id1 = a.card.id;
    a = putOnBattlefield(s, 'p1', { ...legend, oracle_id: 'same-2' });
    s = a.state;
    const id2 = a.card.id;
    // Force same display name for legend rule
    const p = player(s, 'p1');
    for (const c of p.battlefield) {
      if (c.id === id1 || c.id === id2) c.card = { ...c.card, name: 'Same Name' };
    }
    s = checkStateBasedActions(s);
    const leg = s.pendingChoices.find((c) => c.type === 'legend');
    assert.ok(leg && leg.type === 'legend');
    assert.equal(leg.permanentIds.length, 2);
    s = resolveLegendChoice(s, id1);
    assert.ok(player(s, 'p1').battlefield.some((c) => c.id === id1));
    assert.ok(!player(s, 'p1').battlefield.some((c) => c.id === id2));
  });

  it('117.4 both pass on empty stack advances the step', () => {
    let s = readyGame();
    s = { ...s, phase: 'main1', step: 'main', consecutivePasses: 0, priorityPlayerIndex: 0 };
    s = passPriority(s);
    s = passPriority(s);
    assert.ok(!(s.phase === 'main1' && s.step === 'main'));
  });

  it('305.1 / 117.1a land only active in main, once, not on stack', () => {
    let s = readyGame();
    const land = card({ name: 'Forest', type_line: 'Basic Land — Forest', oracle_text: '{T}: Add {G}.' });
    let h = putInHand(s, 'p1', land);
    s = h.state;
    const landId = h.card.id;
    s = playLand(s, 'p1', landId);
    assert.ok(player(s, 'p1').battlefield.some((c) => c.id === landId));

    h = putInHand(s, 'p1', card({ name: 'Forest2', type_line: 'Basic Land — Forest', oracle_id: 'f2' }));
    s = h.state;
    const before = player(s, 'p1').battlefield.length;
    s = playLand(s, 'p1', h.card.id);
    assert.equal(player(s, 'p1').battlefield.length, before); // second land fails

    {
      const n = structuredClone(s) as typeof s;
      n.phase = 'beginning';
      n.step = 'upkeep';
      player(n, 'p1').landsPlayedThisTurn = 0;
      h = putInHand(n, 'p1', card({ name: 'Forest3', type_line: 'Basic Land — Forest', oracle_id: 'f3' }));
      const after = playLand(h.state, 'p1', h.card.id);
      assert.ok(!player(after, 'p1').battlefield.some((c) => c.id === h.card.id));
    }
  });

  it('307.1 sorcery fails on nonempty stack', () => {
    let s = readyGame();
    s = pushStack(s, {
      id: 'stk_blocker',
      kind: 'spell',
      controller: 'p1',
      name: 'Hold',
      script: { targets: [], effects: [] },
    });
    const spell = card({
      name: 'Wrath Lite',
      type_line: 'Sorcery',
      mana_cost: '{2}{W}',
      oracle_text: 'Destroy all creatures.',
      colors: ['W'],
      color_identity: ['W'],
    });
    const h = putInHand(s, 'p1', spell);
    s = fillMana(h.state, 'p1');
    const before = s.pendingCast;
    s = beginCast(s, 'p1', h.card.id);
    assert.equal(s.pendingCast, before); // unchanged / still null
    assert.equal(s.pendingCast, null);
  });

  it('608 damage spell resolves LIFO and reduces life', () => {
    let s = readyGame();
    const lifeBefore = player(s, 'p2').life;
    s = pushStack(s, {
      id: 'stk_first',
      kind: 'ability',
      controller: 'p1',
      name: 'Bolt A',
      targets: { t0: { kind: 'player', playerId: 'p2' } },
      script: {
        targets: [{ key: 't0', prompt: 'x', filter: 'player' }],
        effects: [{ type: 'damage', amount: 2, targetKey: 't0' }],
      },
    });
    s = pushStack(s, {
      id: 'stk_second',
      kind: 'ability',
      controller: 'p1',
      name: 'Bolt B',
      targets: { t0: { kind: 'player', playerId: 'p2' } },
      script: {
        targets: [{ key: 't0', prompt: 'x', filter: 'player' }],
        effects: [{ type: 'damage', amount: 3, targetKey: 't0' }],
      },
    });
    s = passPriority(s);
    s = passPriority(s);
    assert.equal(player(s, 'p2').life, lifeBefore - 3);
    assert.equal(s.stack.length, 1);
    assert.equal(s.stack[0]!.id, 'stk_first');
    s = passPriority(s);
    s = passPriority(s);
    assert.equal(player(s, 'p2').life, lifeBefore - 5);
    assert.equal(s.stack.length, 0);
  });

  it('608.2b counter removes spell; effect does not happen', () => {
    let s = readyGame();
    const lifeBefore = player(s, 'p2').life;
    s = pushStack(s, {
      id: 'stk_dmg',
      kind: 'ability',
      controller: 'p1',
      name: 'Bolt',
      targets: { t0: { kind: 'player', playerId: 'p2' } },
      script: {
        targets: [{ key: 't0', prompt: 'x', filter: 'player' }],
        effects: [{ type: 'damage', amount: 5, targetKey: 't0' }],
      },
    });
    s = pushStack(s, {
      id: 'stk_counter',
      kind: 'ability',
      controller: 'p2',
      name: 'Counter',
      targets: { t0: { kind: 'stack', stackId: 'stk_dmg' } },
      script: {
        targets: [],
        effects: [{ type: 'counter', targetKey: 't0' }],
      },
    });
    s = passPriority(s);
    s = passPriority(s);
    assert.ok(!s.stack.some((x) => x.id === 'stk_dmg'));
    assert.equal(player(s, 'p2').life, lifeBefore);
  });

  it('510 + 702.15b attack, block, lifelink life, dead creature via SBA', () => {
    let s = readyGame();
    const atk = putOnBattlefield(
      s,
      'p1',
      card({
        name: 'Linker',
        type_line: 'Creature — Test',
        power: '3',
        toughness: '3',
        keywords: ['lifelink'],
        oracle_text: 'Lifelink',
      }),
    );
    s = atk.state;
    const blk = putOnBattlefield(
      s,
      'p2',
      card({ name: 'Blocker', type_line: 'Creature — Test', power: '1', toughness: '1' }),
    );
    s = blk.state;
    const lifeBefore = player(s, 'p1').life;
    s = { ...s, phase: 'combat', step: 'declareAttackers', activePlayerIndex: 0 };
    s = startDeclareAttackers(s);
    s = toggleDraftAttacker(s, atk.card.id);
    s = confirmAttackers(s);
    s = startDeclareBlockers(s);
    s = toggleDraftBlocker(s, atk.card.id, blk.card.id);
    s = confirmBlockers(s);
    if (s.combat?.mode === 'assignDamage') {
      s = confirmDamageAssign(s);
    }
    s = { ...s, phase: 'combat', step: 'combatDamage' };
    s = applyCombatDamage(s);
    s = checkStateBasedActions(s);
    assert.ok(player(s, 'p1').life > lifeBefore, 'lifelink should gain life');
    assert.ok(
      player(s, 'p2').graveyard.some((c) => c.id === blk.card.id) ||
        !player(s, 'p2').battlefield.some((c) => c.id === blk.card.id),
    );
  });

  it('702.11b hexproof cannot be targeted by an opponent', () => {
    let s = readyGame();
    const hex = putOnBattlefield(
      s,
      'p1',
      card({
        name: 'Hexed',
        type_line: 'Creature — Test',
        power: '2',
        toughness: '2',
        keywords: ['hexproof'],
        oracle_text: 'Hexproof',
      }),
    );
    s = hex.state;
    const legal = listLegalTargets(s, 'creature', 'p2', ['U']);
    assert.ok(!legal.some((t) => t.kind === 'permanent' && t.permanentId === hex.card.id));
  });

  it('613.4c anthem +1/+1; opponents -2/-2 sends 2/2 to GY via SBA', () => {
    let s = readyGame();
    const critter = putOnBattlefield(
      s,
      'p2',
      card({ name: 'Bear', type_line: 'Creature — Bear', power: '2', toughness: '2' }),
    );
    s = critter.state;
    const anthem = putOnBattlefield(
      s,
      'p1',
      card({
        name: 'Hate',
        type_line: 'Enchantment',
        oracle_text: 'Creatures your opponents control get -2/-2.',
      }),
    );
    s = anthem.state;
    const bonus = continuousPtBonus(critter.card, s);
    assert.equal(bonus.toughness, -2);
    s = checkStateBasedActions(s);
    assert.ok(player(s, 'p2').graveyard.some((c) => c.id === critter.card.id));
  });

  it('615 prevention shield reduces damage', () => {
    let s = readyGame();
    s = addPreventionShield(s, {
      controllerId: 'p2',
      kind: 'player',
      targetId: 'p2',
      amount: 2,
    });
    const { dealt } = applyDamageWithPrevention(s, { kind: 'player', playerId: 'p2' }, 5);
    assert.equal(dealt, 3);
  });

  it('903.4 off-identity card cannot be cast', () => {
    let s = readyGame({ p1Cmd: card({
      name: 'Green Cmd',
      type_line: 'Legendary Creature — Druid',
      mana_cost: '{2}{G}',
      power: '2',
      toughness: '2',
      colors: ['G'],
      color_identity: ['G'],
    }) });
    // ensure command zone identity is G-only
    player(s, 'p1').commandZone[0]!.card.color_identity = ['G'];
    const blue = card({
      name: 'Blue Spell',
      type_line: 'Instant',
      mana_cost: '{U}',
      oracle_text: 'Draw a card.',
      colors: ['U'],
      color_identity: ['U'],
    });
    const h = putInHand(s, 'p1', blue);
    s = fillMana(h.state, 'p1');
    s = beginCast(s, 'p1', h.card.id);
    assert.equal(s.pendingCast, null);
  });

  it('903.8 commanderTaxCost adds {2} per previous command-zone cast', () => {
    const inst = {
      ...putOnBattlefield(
        readyGame(),
        'p1',
        card({
          name: 'Cmd',
          type_line: 'Legendary Creature — Test',
          mana_cost: '{1}{G}',
          power: '2',
          toughness: '2',
          color_identity: ['G'],
        }),
      ).card,
      isCommander: true,
      commanderCastCount: 2,
    };
    const cost = commanderTaxCost(inst, '{1}{G}');
    assert.equal(cost.generic, 5); // {1} + 2×{2} tax
    assert.equal(cost.G, 1);
  });
});
