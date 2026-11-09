/** Minimal GameState builders for rules regression tests (no demo deck). */
import { createInitialGameState, makeInstance } from '../setup';
import type { CardData, GameState, Player } from '../types';
import { emptyManaPool } from '../types';

export function card(partial: {
  name: string;
  type_line: string;
  oracle_text?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
  colors?: CardData['colors'];
  color_identity?: CardData['color_identity'];
  keywords?: string[];
  oracle_id?: string;
}): CardData {
  return {
    oracle_id: partial.oracle_id || partial.name,
    name: partial.name,
    type_line: partial.type_line,
    oracle_text: partial.oracle_text || '',
    mana_cost: partial.mana_cost || '',
    power: partial.power,
    toughness: partial.toughness,
    colors: partial.colors || [],
    color_identity: partial.color_identity || partial.colors || [],
    keywords: partial.keywords || [],
  };
}

const filler = (n: number, pid: string) =>
  Array.from({ length: n }, (_, i) =>
    card({ name: `Filler ${pid} ${i}`, type_line: 'Creature — Test', power: '1', toughness: '1', mana_cost: '{G}' }),
  );

export function cmd(name: string, identity: CardData['color_identity'] = ['G']): CardData {
  return card({
    name,
    type_line: 'Legendary Creature — Test',
    mana_cost: '{2}{G}',
    power: '2',
    toughness: '2',
    colors: identity,
    color_identity: identity,
  });
}

/** Two-player game on main1, mulligans cleared, p1 active with priority. */
export function readyGame(opts?: {
  p1Extra?: CardData[];
  p2Extra?: CardData[];
  p1Cmd?: CardData;
  p2Cmd?: CardData;
}): GameState {
  const p1Cmd = opts?.p1Cmd || cmd('Commander A', ['G']);
  const p2Cmd = opts?.p2Cmd || cmd('Commander B', ['U']);
  let g = createInitialGameState([
    {
      playerId: 'p1',
      playerName: 'P1',
      commander: p1Cmd,
      cards: [...filler(10, 'p1'), ...(opts?.p1Extra || [])],
    },
    {
      playerId: 'p2',
      playerName: 'P2',
      commander: p2Cmd,
      cards: [...filler(10, 'p2'), ...(opts?.p2Extra || [])],
    },
  ]);
  g = {
    ...g,
    pendingChoices: [],
    phase: 'main1',
    step: 'main',
    activePlayerIndex: 0,
    priorityPlayerIndex: 0,
    consecutivePasses: 0,
    stack: [],
    combat: null,
    pendingCast: null,
  };
  return g;
}

export function putOnBattlefield(state: GameState, playerId: string, data: CardData, extra?: Partial<import('../types').CardInstance>) {
  const next = structuredClone(state) as GameState;
  const p = next.players.find((x) => x.id === playerId)!;
  const inst = makeInstance(data, playerId, 'battlefield');
  Object.assign(inst, extra || {});
  inst.summoningSick = false;
  p.battlefield.push(inst);
  return { state: next, card: inst };
}

export function putInHand(state: GameState, playerId: string, data: CardData) {
  const next = structuredClone(state) as GameState;
  const p = next.players.find((x) => x.id === playerId)!;
  const inst = makeInstance(data, playerId, 'hand');
  p.hand.push(inst);
  return { state: next, card: inst };
}

export function fillMana(state: GameState, playerId: string, amount = 20): GameState {
  const next = structuredClone(state) as GameState;
  const p = next.players.find((x) => x.id === playerId)!;
  p.manaPool = { ...emptyManaPool(), C: amount, W: amount, U: amount, B: amount, R: amount, G: amount };
  return next;
}

export function player(state: GameState, id: string): Player {
  return state.players.find((p) => p.id === id)!;
}
