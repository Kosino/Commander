/**
 * Class cards (717) + Case cards (720).
 */
import {
  isCase,
  isClass,
  parseActivatedAbilities,
  parseCaseParts,
  parseClassLevels,
  type ParsedActivated,
} from './effects';
import { canPayMana, parseManaCost, payMana } from './mana';
import { afterPlayerAction } from './priority';
import { GameState, isCreature } from './types';
import { clonePlayers, findCard } from './zones';

/** Oracle text currently "active" for continuous/triggers (Class level / Case solved). */
export function activeOracleText(perm: {
  card: { type_line?: string; oracle_text?: string };
  classLevel?: number;
  solved?: boolean;
}): string {
  const full = perm.card.oracle_text || '';
  if (isClass(perm.card)) {
    const level = perm.classLevel ?? 1;
    const sections = parseClassLevels(full);
    if (!sections.length) return full;
    return sections
      .filter((s) => s.level <= level)
      .map((s) => s.text)
      .join('\n');
  }
  if (isCase(perm.card)) {
    const parts = parseCaseParts(full);
    if (!parts) return full;
    const bits = [parts.alwaysText];
    if (perm.solved && parts.solvedText) bits.push(parts.solvedText);
    return bits.filter(Boolean).join('\n');
  }
  return full;
}

/** Gain next Class level (717.2a) — sorcery speed. */
export function tryClassLevelUp(
  state: GameState,
  playerId: string,
  permanentId: string,
): GameState {
  if (state.pendingCast || state.pendingChoices.length > 0) return state;
  if (state.players[state.priorityPlayerIndex]?.id !== playerId) return state;
  if (state.stack.length > 0) return state;
  const ap = state.players[state.activePlayerIndex];
  if (!ap || ap.id !== playerId) return state;
  if (state.phase !== 'main1' && state.phase !== 'main2') return state;

  const found = findCard(state, permanentId);
  if (!found || found.zone !== 'battlefield' || found.player.id !== playerId) {
    return state;
  }
  const perm = found.player.battlefield.find((c) => c.id === permanentId);
  if (!perm || !isClass(perm.card)) return state;

  const level = perm.classLevel ?? 1;
  const sections = parseClassLevels(perm.card.oracle_text);
  const nextSec = sections.find((s) => s.level === level + 1 && s.cost);
  if (!nextSec?.cost) return state;

  const cost = parseManaCost(nextSec.cost);
  if (!canPayMana(found.player.manaPool, cost, found.player.life)) return state;

  const n = clonePlayers(state);
  const p = n.players.find((x) => x.id === playerId);
  const c = p?.battlefield.find((x) => x.id === permanentId);
  if (!p || !c) return state;
  const paid = payMana(p.manaPool, cost, p.life);
  if (!paid) return state;
  p.manaPool = paid;
  c.classLevel = level + 1;
  return afterPlayerAction(n);
}

/** End step — Cases "To solve" become solved (720.3a). */
export function checkCasesToSolve(state: GameState): GameState {
  const ap = state.players[state.activePlayerIndex];
  if (!ap || ap.hasLost) return state;
  let next = clonePlayers(state);
  const p = next.players.find((x) => x.id === ap.id);
  if (!p) return state;
  let changed = false;
  for (const perm of p.battlefield) {
    if (!isCase(perm.card) || perm.solved) continue;
    const parts = parseCaseParts(perm.card.oracle_text);
    if (!parts?.toSolve) continue;
    if (caseConditionMet(next, ap.id, parts.toSolve)) {
      perm.solved = true;
      changed = true;
    }
  }
  return changed ? next : state;
}

export function caseConditionMet(
  state: GameState,
  controllerId: string,
  condition: string,
): boolean {
  const text = condition.toLowerCase();
  const p = state.players.find((x) => x.id === controllerId);
  if (!p) return false;

  const countMatch = text.match(
    /you control (?:(\d+)|([a-z]+)) or more (\w+)/i,
  );
  if (countMatch) {
    const n = countMatch[1]
      ? parseInt(countMatch[1], 10)
      : wordToNum(countMatch[2]);
    const kind = countMatch[3].toLowerCase();
    const num = p.battlefield.filter((c) => {
      const tl = c.card.type_line.toLowerCase();
      if (kind.startsWith('creature')) return isCreature(c);
      if (kind.startsWith('artifact')) return tl.includes('artifact');
      if (kind.startsWith('enchantment')) return tl.includes('enchantment');
      if (kind.startsWith('land')) return tl.includes('land');
      return tl.includes(kind);
    }).length;
    return num >= n;
  }

  if (/you gained life this turn/i.test(text)) {
    return !!p.gainedLifeThisTurn;
  }
  if (/you lost life this turn/i.test(text)) {
    return !!p.lostLifeThisTurn;
  }
  if (/creature (?:you control )?died this turn|a creature died this turn/i.test(text)) {
    return !!state.creatureDiedThisTurn;
  }
  if (/you cast (?:a |one )?spell this turn/i.test(text)) {
    return (state.spellsCastThisTurn || 0) >= 1;
  }
  if (/you cast (?:two|2) or more spells this turn/i.test(text)) {
    return (state.spellsCastThisTurn || 0) >= 2;
  }
  if (/you attacked/i.test(text)) {
    return !!p.attackedThisTurn;
  }
  // Fallback: unknown condition — don't solve
  return false;
}

function wordToNum(w: string): number {
  const map: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  return map[w.toLowerCase()] || 0;
}

/** Solved activated `{cost}: …` from Solved section — used by abilities path. */
export function parseSolvedActivated(oracleText?: string): ParsedActivated[] {
  const parts = parseCaseParts(oracleText);
  if (!parts?.solvedText) return [];
  return parseActivatedAbilities(parts.solvedText);
}
