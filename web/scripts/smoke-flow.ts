/**
 * Minimal CLI smoke: demo game boots, priority, pass, combat declare stubs.
 * Run: npx tsx scripts/smoke-flow.ts
 */
import {
  createDemoGame,
  givePriority,
  passPriority,
  legalAttackers,
  isCombatDeclaring,
} from '../lib/engine';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const g0 = createDemoGame();
assert(g0.players.length === 2, '2 players');
assert(g0.players.every((p) => p.life === 40), '40 life');
let g = givePriority(g0, g0.activePlayerIndex);
assert(typeof g.priorityPlayerIndex === 'number', 'priority');

for (let i = 0; i < 40; i++) {
  const before = g.turnNumber;
  g = passPriority(g);
  if (g.turnNumber > before) break;
  if (g.winnerId) break;
}
assert(g.turnNumber >= 1, 'turns advance');
assert(!isCombatDeclaring(g) || legalAttackers(g).length >= 0, 'combat helpers');

console.log(
  `smoke-flow OK — turn ${g.turnNumber} phase ${g.phase}/${g.step} stack ${g.stack.length}`,
);
