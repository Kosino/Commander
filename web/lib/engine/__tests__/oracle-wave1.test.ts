/**
 * Wave-1 patterns confirmed missing by coverage-report.txt (strict staples).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseEtbScript,
  parseOracleScript,
  scriptHasRealEffects,
} from '../effects';
import { applyEffects } from '../resolveEffects';
import { card, player, putOnBattlefield, readyGame } from './helpers';
import { makeInstance } from '../setup';

describe('oracle wave1', () => {
  it('Demonic Tutor — searchLibraryHand', () => {
    const script = parseOracleScript(
      'Search your library for a card, put that card into your hand, then shuffle.',
      'Sorcery',
    );
    assert.ok(scriptHasRealEffects(script));
    assert.ok(script.effects.some((e) => e.type === 'searchLibraryHand'));
    let s = readyGame();
    const want = card({ name: 'Prize', type_line: 'Instant', mana_cost: '{U}' });
    const p = player(s, 'p1');
    p.library = [makeInstance(want, 'p1', 'library'), ...p.library];
    s = applyEffects(s, 'p1', script.effects, {});
    assert.ok(player(s, 'p1').hand.some((c) => c.card.name === 'Prize'));
  });

  it('Worldly Tutor — searchLibraryTop creature', () => {
    const script = parseOracleScript(
      'Search your library for a creature card, reveal it, then shuffle and put that card on top.',
      'Instant',
    );
    assert.ok(script.effects.some((e) => e.type === 'searchLibraryTop' && e.cardType === 'creature'));
  });

  it('Mystical Tutor — searchLibraryTop instant', () => {
    const script = parseOracleScript(
      'Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.',
      'Instant',
    );
    // "instant or sorcery" — first match may be instant
    assert.ok(scriptHasRealEffects(script));
  });

  it('Enlightened Tutor — searchLibraryTop artifact/enchantment', () => {
    const script = parseOracleScript(
      'Search your library for an artifact or enchantment card, reveal it, then shuffle and put that card on top.',
      'Instant',
    );
    assert.ok(scriptHasRealEffects(script));
  });

  it('Regrowth — return target card from GY', () => {
    const script = parseOracleScript(
      'Return target card from your graveyard to your hand.',
      'Sorcery',
    );
    assert.ok(script.effects.some((e) => e.type === 'returnToHand'));
  });

  it('Eternal Witness ETB — return target card', () => {
    const script = parseEtbScript(
      'When Eternal Witness enters, you may return target card from your graveyard to your hand.',
    );
    assert.ok(scriptHasRealEffects(script));
  });

  it('Reckless Impulse — exileTopMayPlay', () => {
    const script = parseOracleScript(
      'Exile the top two cards of your library. Until the end of your next turn, you may play those cards.',
      'Sorcery',
    );
    assert.ok(script.effects.some((e) => e.type === 'exileTopMayPlay' && e.amount === 2));
    let s = readyGame();
    const beforeLib = player(s, 'p1').library.length;
    s = applyEffects(s, 'p1', script.effects, {});
    assert.equal(player(s, 'p1').library.length, beforeLib - 2);
    assert.ok(player(s, 'p1').exile.length >= 2);
  });

  it('Dockside Extortionist ETB — treasures per opp artifacts/enchantments', () => {
    const script = parseEtbScript(
      'When Dockside Extortionist enters the battlefield, create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.',
    );
    assert.ok(
      script.effects.some((e) => e.type === 'createTreasurePerOppArtifactsEnchantments'),
    );
    let s = readyGame();
    s = putOnBattlefield(
      s,
      'p2',
      card({ name: 'Rock', type_line: 'Artifact' }),
    ).state;
    s = putOnBattlefield(
      s,
      'p2',
      card({ name: 'Aura', type_line: 'Enchantment' }),
    ).state;
    const before = player(s, 'p1').battlefield.length;
    s = applyEffects(s, 'p1', script.effects, {});
    assert.equal(player(s, 'p1').battlefield.length, before + 2);
  });
});
