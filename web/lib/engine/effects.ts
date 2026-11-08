/**
 * MVP effect layer — Arena-style: parse simple oracle patterns → structured effects.
 */

export type TargetFilter =
  | 'anyTarget'
  | 'creature'
  | 'creatureYouControl'
  | 'creatureCardInYourGy'
  | 'cardInAnyGy'
  | 'player'
  | 'permanent'
  | 'spell';

export type TargetRef =
  | { kind: 'player'; playerId: string }
  | { kind: 'permanent'; permanentId: string }
  | { kind: 'stack'; stackId: string };

export type TargetSlot = {
  key: string;
  filter: TargetFilter;
  prompt: string;
};

export type Effect =
  | { type: 'damage'; amount: number; targetKey: string }
  | { type: 'draw'; amount: number }
  | { type: 'gainLife'; amount: number }
  | { type: 'loseLife'; amount: number; targetKey?: string }
  | { type: 'destroy'; targetKey: string }
  | { type: 'exile'; targetKey: string }
  | { type: 'bounce'; targetKey: string }
  | { type: 'tap'; targetKey: string }
  | { type: 'untap'; targetKey: string }
  | { type: 'pump'; targetKey: string; power: number; toughness: number }
  | { type: 'mill'; amount: number; targetKey?: string }
  | { type: 'discard'; amount: number; targetKey: string }
  | { type: 'counter'; targetKey: string }
  | { type: 'addCounter'; targetKey: string; counter: string; amount: number }
  | { type: 'fight'; aKey: string; bKey: string }
  | { type: 'searchBasicLand'; tapped: boolean }
  | { type: 'scry'; amount: number }
  | { type: 'surveil'; amount: number }
  | { type: 'loot'; draw: number; discard: number }
  | { type: 'sacrifice'; targetKey: string }
  | { type: 'pumpSelf'; power: number; toughness: number }
  | { type: 'returnToHand'; targetKey: string }
  | { type: 'destroyAllCreatures' }
  | { type: 'createTreasure'; count: number }
  | { type: 'createClue'; count: number }
  | { type: 'createFood'; count: number }
  | { type: 'createBlood'; count: number }
  | { type: 'createMap'; count: number }
  | { type: 'createPowerstone'; count: number }
  | { type: 'attach'; targetKey: string }
  | { type: 'returnToBattlefield'; targetKey: string }
  | { type: 'becomeMonarch' }
  | { type: 'goad'; targetKey: string }
  | { type: 'proliferate' }
  | { type: 'ascend' }
  | { type: 'gainLifeIfBlessing'; amount: number }
  | { type: 'populate' }
  | { type: 'amass'; amount: number }
  | { type: 'drawIfRaid'; amount: number }
  | { type: 'drawIfMorbid'; amount: number }
  | { type: 'afterlife'; count: number }
  | { type: 'preventDamage'; amount: number; targetKey: string }
  | { type: 'flicker'; targetKey: string }
  | { type: 'createCopy'; targetKey: string }
  | { type: 'gainControl'; targetKey: string }
  | { type: 'delayEndStep'; effects: Effect[] }
  | { type: 'delayEndCombat'; effects: Effect[] }
  | { type: 'damageEachCreature'; amount: number }
  | { type: 'damageEachOpponent'; amount: number }
  | { type: 'sacrificeSelf' }
  | { type: 'grantKeyword'; targetKey: string; keyword: string }
  | { type: 'regenerate'; targetKey: string }
  | { type: 'destroyAllArtifacts' }
  | { type: 'destroyAllEnchantments' }
  | { type: 'exileAllCreatures' }
  | { type: 'bounceAllCreatures' }
  | { type: 'eachPlayerSacCreature' }
  | { type: 'untapAllYouControl' }
  | { type: 'pumpAllYouControl'; power: number; toughness: number }
  | { type: 'copySpell'; targetKey: string }
  | { type: 'drawEqualCreatures' }
  | { type: 'damageEqualPower'; targetKey: string; destKey: string }
  | { type: 'gainLifeEqualCreatures' }
  | { type: 'createEmblem'; name: string; oracle_text: string }
  | { type: 'extraTurn' }
  | { type: 'putLandFromHand' }
  | { type: 'preventCombatDamageThisTurn' }
  | { type: 'preventAllDamageThisTurn' }
  | {
      type: 'redirectDamage';
      /** 'self' = controller; else target key */
      fromKey: string;
      toKey: string;
      amount: number;
    }
  | { type: 'putOnTop'; targetKey: string }
  | { type: 'putOnBottom'; targetKey: string }
  | { type: 'lookAtTop'; amount: number }
  | { type: 'exileFromGraveyard'; targetKey: string }
  | { type: 'getExperience'; amount: number }
  | { type: 'getEnergy'; amount: number }
  | { type: 'drawEqualExperience' }
  | { type: 'damageEqualDevotion'; color: 'W' | 'U' | 'B' | 'R' | 'G'; targetKey: string }
  | { type: 'drawEqualDevotion'; color: 'W' | 'U' | 'B' | 'R' | 'G' }
  | { type: 'gainLifeEqualDevotion'; color: 'W' | 'U' | 'B' | 'R' | 'G' }
  | { type: 'damageEqualDomain'; targetKey: string }
  | { type: 'drawEqualDomain' }
  | { type: 'explore'; targetKey?: string }
  | { type: 'fabricate'; amount: number }
  | { type: 'support'; amount: number }
  | { type: 'bolster'; amount: number }
  | { type: 'backup'; amount: number }
  | {
      type: 'createToken';
      count: number;
      power: string;
      toughness: string;
      name: string;
      typeline: string;
    }
  | { type: 'loseLifeEachOpponent'; amount: number }
  | { type: 'discardEachOpponent'; amount: number }
  | { type: 'addCounterAllYouControl'; counter: string; amount: number }
  | { type: 'drawEqualDiedThisTurn' }
  | { type: 'noop' };

/** One mode of a modal spell ("Choose one —"). */
export type SpellMode = {
  label: string;
  targets: TargetSlot[];
  effects: Effect[];
};

export type KickerOption = {
  cost: string;
  targets: TargetSlot[];
  effects: Effect[];
};

export type SpellScript = {
  targets: TargetSlot[];
  effects: Effect[];
  /** Modal: Choose one — … */
  modes?: SpellMode[];
  /** Optional kicker additional cost + effects. */
  kicker?: KickerOption;
  /** Optional buyback — return to hand on resolve if paid. */
  buyback?: { cost: string };
  /** Mana cost contains {X}. */
  hasX?: boolean;
  /** Convoke — tap creatures for generic. */
  hasConvoke?: boolean;
  /** Delve — exile GY cards for generic. */
  hasDelve?: boolean;
};

function nextKey(targets: TargetSlot[]): string {
  return `t${targets.length + 1}`;
}

function addTarget(targets: TargetSlot[], filter: TargetFilter, prompt: string): string {
  const key = nextKey(targets);
  targets.push({ key, filter, prompt });
  return key;
}

function parseCount(word: string): number {
  const w = word.toLowerCase();
  if (w === 'a' || w === 'one') return 1;
  if (w === 'two') return 2;
  if (w === 'three') return 3;
  const n = parseInt(w, 10);
  return Number.isFinite(n) ? n : 1;
}

function extractClauses(
  oracleText: string | undefined,
  pattern: RegExp,
): { clauses: string[]; rest: string } {
  if (!oracleText) return { clauses: [], rest: '' };
  const flat = oracleText.replace(/\n/g, ' ').trim();
  const clauses: string[] = [];
  const rest = flat.replace(pattern, (_m, clause: string) => {
    clauses.push(String(clause).trim());
    return ' ';
  });
  return { clauses, rest: rest.replace(/\s+/g, ' ').trim() };
}

/** Pull ETB sentences out of oracle (for separate trigger handling). */
export function extractEtbClauses(oracleText?: string): { etb: string[]; rest: string } {
  const { clauses, rest } = extractClauses(
    oracleText,
    /when (?:~|this (?:creature|permanent|artifact|enchantment)|[^.]+?) enters(?: the battlefield)?[, ]+([^.]+)\./gi,
  );
  return { etb: clauses, rest };
}

export function extractDiesClauses(oracleText?: string): string[] {
  return extractClauses(
    oracleText,
    /when (?:~|this (?:creature|permanent)|[^.]+?) dies[, ]+([^.]+)\./gi,
  ).clauses;
}

export function extractAttackClauses(oracleText?: string): string[] {
  return extractClauses(
    oracleText,
    /when(?:ever)? (?:~|this creature|[^.]+?) attacks[, ]+([^.]+)\./gi,
  ).clauses;
}

export function extractCombatDamagePlayerClauses(oracleText?: string): string[] {
  return extractClauses(
    oracleText,
    /when(?:ever)? (?:~|this creature|[^.]+?) deals combat damage to a player[, ]+([^.]+)\./gi,
  ).clauses;
}

/** Ward {N} — 0 if none. */
export function getWardCost(card: { oracle_text?: string; keywords?: string[] }): number {
  const text = (card.oracle_text || '').replace(/\n/g, ' ');
  const m = text.match(/\bward\s*\{(\d+)\}/i);
  if (m) return parseInt(m[1], 10);
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'ward')) return 1;
  if (/\bward\b/i.test((text.split('\n')[0] || text).slice(0, 40))) return 1;
  return 0;
}

function parseEffectsFromText(
  text: string,
  targets: TargetSlot[],
  effects: Effect[],
  opts: { allowTargets: boolean },
): void {
  if (!text) return;

  // Peel delayed clauses so nested effects are not also immediate.
  const delayed: { when: 'endStep' | 'endCombat'; clause: string }[] = [];
  let work = text;
  const eotRe = /at\s+the\s+beginning\s+of\s+the\s+next\s+end\s+step[, ]+([^.]+)/gi;
  for (const m of text.matchAll(eotRe)) {
    delayed.push({ when: 'endStep', clause: m[1] });
  }
  work = work.replace(eotRe, ' ');
  const eocRe = /at\s+end\s+of\s+combat[, ]+([^.]+)/gi;
  for (const m of text.matchAll(eocRe)) {
    delayed.push({ when: 'endCombat', clause: m[1] });
  }
  work = work.replace(eocRe, ' ');
  text = work;

  if (opts.allowTargets && /counter\s+target\s+spell/i.test(text)) {
    const key = addTarget(targets, 'spell', 'Choose spell to counter');
    effects.push({ type: 'counter', targetKey: key });
  }

  if (opts.allowTargets) {
    const dmgAny = text.match(/(?:deals?|deal)\s+(\d+)\s+damage\s+to\s+any\s+target/i);
    const dmgX = text.match(/(?:deals?|deal)\s+x\s+damage\s+to\s+any\s+target/i);
    if (dmgX) {
      const key = addTarget(targets, 'anyTarget', 'Choose target for damage');
      effects.push({ type: 'damage', amount: -1, targetKey: key });
    }
    if (dmgAny) {
      const key = addTarget(targets, 'anyTarget', 'Choose target for damage');
      effects.push({ type: 'damage', amount: parseInt(dmgAny[1], 10), targetKey: key });
    }

    const dmgCreat = text.match(/(?:deals?|deal)\s+(\d+)\s+damage\s+to\s+target\s+creature/i);
    if (dmgCreat && !dmgAny) {
      const key = addTarget(targets, 'creature', 'Choose target creature');
      effects.push({ type: 'damage', amount: parseInt(dmgCreat[1], 10), targetKey: key });
    }

    const dmgPlayer = text.match(/(?:deals?|deal)\s+(\d+)\s+damage\s+to\s+target\s+player/i);
    if (dmgPlayer && !dmgAny) {
      const key = addTarget(targets, 'player', 'Choose target player');
      effects.push({ type: 'damage', amount: parseInt(dmgPlayer[1], 10), targetKey: key });
    }

    if (/destroy\s+target\s+creature/i.test(text)) {
      const key = addTarget(targets, 'creature', 'Choose creature to destroy');
      effects.push({ type: 'destroy', targetKey: key });
    } else if (/destroy\s+target\s+permanent/i.test(text)) {
      const key = addTarget(targets, 'permanent', 'Choose permanent to destroy');
      effects.push({ type: 'destroy', targetKey: key });
    } else if (/destroy\s+target\s+artifact/i.test(text)) {
      const key = addTarget(targets, 'permanent', 'Choose artifact to destroy');
      effects.push({ type: 'destroy', targetKey: key });
    } else if (/destroy\s+target\s+enchantment/i.test(text)) {
      const key = addTarget(targets, 'permanent', 'Choose enchantment to destroy');
      effects.push({ type: 'destroy', targetKey: key });
    }

    const isFlicker =
      /exile\s+target\s+(?:creature|permanent).+return\s+(?:it|that\s+card)\s+to\s+the\s+battlefield/i.test(
        text,
      ) || /\bflicker\b/i.test(text);
    if (!isFlicker && /exile\s+target\s+creature/i.test(text)) {
      const key = addTarget(targets, 'creature', 'Choose creature to exile');
      effects.push({ type: 'exile', targetKey: key });
    } else if (!isFlicker && /exile\s+target\s+permanent/i.test(text)) {
      const key = addTarget(targets, 'permanent', 'Choose permanent to exile');
      effects.push({ type: 'exile', targetKey: key });
    }

    if (
      /return\s+target\s+creature\s+to\s+(?:its|their)\s+owner'?s?\s+hand/i.test(text) ||
      /return\s+target\s+permanent\s+to\s+(?:its|their)\s+owner'?s?\s+hand/i.test(text)
    ) {
      const filter: TargetFilter = /creature/.test(text) ? 'creature' : 'permanent';
      const key = addTarget(targets, filter, 'Choose permanent to bounce');
      effects.push({ type: 'bounce', targetKey: key });
    }

    if (/tap\s+target\s+creature/i.test(text)) {
      const key = addTarget(targets, 'creature', 'Choose creature to tap');
      effects.push({ type: 'tap', targetKey: key });
    }
    if (/untap\s+target\s+creature/i.test(text)) {
      const key = addTarget(targets, 'creature', 'Choose creature to untap');
      effects.push({ type: 'untap', targetKey: key });
    }

    const pump = text.match(
      /target\s+creature\s+gets\s+([+-]\d+)\/([+-]\d+)\s+until\s+end\s+of\s+turn/i,
    );
    if (pump) {
      const key = addTarget(targets, 'creature', 'Choose creature to pump');
      effects.push({
        type: 'pump',
        targetKey: key,
        power: parseInt(pump[1], 10),
        toughness: parseInt(pump[2], 10),
      });
    }

    const loseLifeTarget = text.match(/target\s+player\s+loses?\s+(\d+)\s+life/i);
    if (loseLifeTarget) {
      const key = addTarget(targets, 'player', 'Choose player to lose life');
      effects.push({
        type: 'loseLife',
        amount: parseInt(loseLifeTarget[1], 10),
        targetKey: key,
      });
    }

    const millTarget = text.match(/target\s+player\s+mills?\s+(a|one|two|three|\d+)\s+cards?/i);
    if (millTarget) {
      const key = addTarget(targets, 'player', 'Choose player to mill');
      effects.push({ type: 'mill', amount: parseCount(millTarget[1]), targetKey: key });
    }

    const discard = text.match(/target\s+player\s+discards?\s+(a|one|two|three|\d+)\s+cards?/i);
    if (discard) {
      const key = addTarget(targets, 'player', 'Choose player to discard');
      effects.push({ type: 'discard', amount: parseCount(discard[1]), targetKey: key });
    }

    const counters = text.match(
      /put\s+(a|one|two|three|\d+)\s+\+1\/\+1\s+counters?\s+on\s+target\s+creature/i,
    );
    if (counters) {
      const key = addTarget(targets, 'creature', 'Choose creature for +1/+1');
      effects.push({
        type: 'addCounter',
        targetKey: key,
        counter: '+1/+1',
        amount: parseCount(counters[1]),
      });
    }
  }

  const lootMatch = text.match(
    /draw\s+(a|one|two|three|\d+)\s+cards?,?\s+then\s+discard\s+(a|one|two|three|\d+)\s+cards?/i,
  );
  if (lootMatch) {
    effects.push({
      type: 'loot',
      draw: parseCount(lootMatch[1]),
      discard: parseCount(lootMatch[2]),
    });
  } else {
    const draw = text.match(/draw\s+(a|one|two|three|\d+)\s+cards?/i);
    if (draw) effects.push({ type: 'draw', amount: parseCount(draw[1]) });
  }

  const life = text.match(/you\s+gain\s+(\d+)\s+life/i);
  if (life) effects.push({ type: 'gainLife', amount: parseInt(life[1], 10) });

  const millSelf = text.match(/\bmill\s+(a|one|two|three|\d+)\s+cards?\b/i);
  if (millSelf && !/target\s+player\s+mills?/i.test(text)) {
    effects.push({ type: 'mill', amount: parseCount(millSelf[1]) });
  }

  const token = text.match(
    /create\s+(a|one|two|three|\d+)\s+(\d+)\/(\d+)\s+(?:(white|blue|black|red|green|colorless)\s+)?([A-Za-z][\w']*)\s+creature\s+tokens?/i,
  );
  if (token) {
    effects.push({
      type: 'createToken',
      count: parseCount(token[1]),
      power: token[2],
      toughness: token[3],
      name: token[5],
      typeline: `Creature — ${token[5]}`,
    });
  }
  // "Create a 2/2 green and white Wolf creature token" (multi-color)
  const tokenMulti = text.match(
    /create\s+(a|one|two|three|\d+)\s+(\d+)\/(\d+)\s+(?:(?:white|blue|black|red|green|colorless)(?:\s+and\s+(?:white|blue|black|red|green))*\s+)?([A-Za-z][\w']*)\s+creature\s+tokens?/i,
  );
  if (!token && tokenMulti) {
    effects.push({
      type: 'createToken',
      count: parseCount(tokenMulti[1]),
      power: tokenMulti[2],
      toughness: tokenMulti[3],
      name: tokenMulti[4],
      typeline: `Creature — ${tokenMulti[4]}`,
    });
  }

  if (opts.allowTargets && /target\s+creature\s+you\s+control\s+fights?\s+target\s+creature/i.test(text)) {
    const aKey = addTarget(targets, 'creatureYouControl', 'Choose your creature to fight');
    const bKey = addTarget(targets, 'creature', 'Choose creature to fight');
    effects.push({ type: 'fight', aKey, bKey });
  }

  if (
    /search\s+your\s+library\s+for\s+a\s+basic\s+land\s+card/i.test(text) &&
    /battlefield/i.test(text)
  ) {
    effects.push({
      type: 'searchBasicLand',
      tapped: /tapped/i.test(text),
    });
  }

  const scry = text.match(/\bscry\s+(\d+)\b/i);
  if (scry) effects.push({ type: 'scry', amount: parseInt(scry[1], 10) });

  const surveil = text.match(/\bsurveil\s+(\d+)\b/i);
  if (surveil) effects.push({ type: 'surveil', amount: parseInt(surveil[1], 10) });

  if (opts.allowTargets && /sacrifice\s+target\s+creature/i.test(text)) {
    const key = addTarget(targets, 'creatureYouControl', 'Choose creature to sacrifice');
    effects.push({ type: 'sacrifice', targetKey: key });
  }

  if (
    opts.allowTargets &&
    /return\s+target\s+creature\s+card\s+from\s+(?:your|a)\s+graveyard\s+to\s+(?:your|its\s+owner'?s?)\s+hand/i.test(
      text,
    )
  ) {
    const key = addTarget(targets, 'creatureCardInYourGy', 'Choose creature card in your GY');
    effects.push({ type: 'returnToHand', targetKey: key });
  }

  if (/destroy\s+all\s+creatures/i.test(text)) {
    effects.push({ type: 'destroyAllCreatures' });
  }

  const treasures = text.match(
    /create\s+(a|one|two|three|\d+)\s+treasure\s+tokens?/i,
  );
  if (treasures) {
    effects.push({ type: 'createTreasure', count: parseCount(treasures[1]) });
  }

  const clues = text.match(/create\s+(a|one|two|three|\d+)\s+clue\s+tokens?/i);
  if (clues) effects.push({ type: 'createClue', count: parseCount(clues[1]) });
  if (/\binvestigate\b/i.test(text)) effects.push({ type: 'createClue', count: 1 });

  const foods = text.match(/create\s+(a|one|two|three|\d+)\s+food\s+tokens?/i);
  if (foods) effects.push({ type: 'createFood', count: parseCount(foods[1]) });

  const bloods = text.match(/create\s+(a|one|two|three|\d+)\s+blood\s+tokens?/i);
  if (bloods) effects.push({ type: 'createBlood', count: parseCount(bloods[1]) });

  if (
    opts.allowTargets &&
    /return\s+target\s+creature\s+card\s+from\s+(?:your|a)\s+graveyard\s+to\s+the\s+battlefield/i.test(
      text,
    )
  ) {
    const key = addTarget(targets, 'creatureCardInYourGy', 'Choose creature to reanimate');
    effects.push({ type: 'returnToBattlefield', targetKey: key });
  }

  if (/you\s+become\s+the\s+monarch/i.test(text)) {
    effects.push({ type: 'becomeMonarch' });
  }

  if (opts.allowTargets && /\bgoad\s+target\s+creature\b/i.test(text)) {
    const key = addTarget(targets, 'creature', 'Choose creature to goad');
    effects.push({ type: 'goad', targetKey: key });
  }

  if (/\bproliferate\b/i.test(text)) {
    effects.push({ type: 'proliferate' });
  }

  if (/\bascend\b/i.test(text)) {
    effects.push({ type: 'ascend' });
  }

  const blessLife = text.match(
    /(?:you\s+)?gain\s+(\d+)\s+life\s+if\s+you\s+have\s+the\s+city'?s?\s+blessing/i,
  );
  if (blessLife) {
    effects.push({ type: 'gainLifeIfBlessing', amount: parseInt(blessLife[1], 10) });
  }

  const maps = text.match(/create\s+(a|one|two|three|\d+)\s+map\s+tokens?/i);
  if (maps) effects.push({ type: 'createMap', count: parseCount(maps[1]) });

  const stones = text.match(/create\s+(a|one|two|three|\d+)\s+powerstone\s+tokens?/i);
  if (stones) effects.push({ type: 'createPowerstone', count: parseCount(stones[1]) });

  if (/\bpopulate\b/i.test(text)) effects.push({ type: 'populate' });

  const amass = text.match(/\bamass\s+(\d+)\b/i);
  if (amass) effects.push({ type: 'amass', amount: parseInt(amass[1], 10) });

  const raidDraw = text.match(
    /raid\s*[—-]\s*(?:if\s+you\s+attacked\s+(?:this\s+turn|with\s+a\s+creature\s+this\s+turn),?\s*)?draw\s+(a|one|two|three|\d+)\s+cards?/i,
  );
  if (raidDraw) effects.push({ type: 'drawIfRaid', amount: parseCount(raidDraw[1]) });
  else if (/\braid\b/i.test(text) && /\bdraw\s+a\s+card\b/i.test(text)) {
    effects.push({ type: 'drawIfRaid', amount: 1 });
  }

  const morbidDraw = text.match(
    /morbid\s*[—-]\s*(?:if\s+a\s+creature\s+died\s+this\s+turn,?\s*)?draw\s+(a|one|two|three|\d+)\s+cards?/i,
  );
  if (morbidDraw) effects.push({ type: 'drawIfMorbid', amount: parseCount(morbidDraw[1]) });
  else if (/\bmorbid\b/i.test(text) && /\bdraw\s+a\s+card\b/i.test(text)) {
    effects.push({ type: 'drawIfMorbid', amount: 1 });
  }

  // Afterlife is a dies keyword — handled in SBA via getAfterlife, not cast script.

  if (opts.allowTargets) {
    if (
      /exile\s+target\s+(?:creature|permanent).+return\s+(?:it|that\s+card)\s+to\s+the\s+battlefield/i.test(
        text,
      ) ||
      /\bflicker\b/i.test(text)
    ) {
      const key = addTarget(targets, 'permanent', 'Choose permanent to flicker');
      effects.push({ type: 'flicker', targetKey: key });
    }
    if (
      /create\s+a\s+token\s+that'?s?\s+a\s+copy\s+of\s+target/i.test(text) ||
      /put\s+a\s+token\s+onto\s+the\s+battlefield\s+that'?s?\s+a\s+copy\s+of\s+target/i.test(text)
    ) {
      const key = addTarget(targets, 'creature', 'Choose creature to copy');
      effects.push({ type: 'createCopy', targetKey: key });
    }
    if (/gain\s+control\s+of\s+target\s+creature/i.test(text)) {
      const key = addTarget(targets, 'creature', 'Choose creature to steal');
      effects.push({ type: 'gainControl', targetKey: key });
    }
    const gainsKw = text.match(
      /target\s+creature\s+gains?\s+(flying|haste|vigilance|trample|lifelink|deathtouch|hexproof|indestructible|menace|reach|first\s+strike|double\s+strike)\s+until\s+end\s+of\s+turn/i,
    );
    if (gainsKw) {
      const key = addTarget(targets, 'creature', 'Choose creature to grant keyword');
      effects.push({
        type: 'grantKeyword',
        targetKey: key,
        keyword: gainsKw[1].toLowerCase().replace(/\s+/g, ' '),
      });
    }
    if (/regenerate\s+target\s+creature/i.test(text)) {
      const key = addTarget(targets, 'creature', 'Choose creature to regenerate');
      effects.push({ type: 'regenerate', targetKey: key });
    }
    if (/copy\s+target\s+(?:instant|sorcery\s+)?spell/i.test(text)) {
      const key = addTarget(targets, 'spell', 'Choose spell to copy');
      effects.push({ type: 'copySpell', targetKey: key });
    }
  }

  if (/destroy\s+all\s+artifacts/i.test(text)) {
    effects.push({ type: 'destroyAllArtifacts' });
  }
  if (/destroy\s+all\s+enchantments/i.test(text)) {
    effects.push({ type: 'destroyAllEnchantments' });
  }
  if (/exile\s+all\s+creatures/i.test(text)) {
    effects.push({ type: 'exileAllCreatures' });
  }
  if (
    /return\s+all\s+creatures\s+to\s+(?:their\s+owners'?|its\s+owner'?s?)\s+hands?/i.test(text)
  ) {
    effects.push({ type: 'bounceAllCreatures' });
  }
  if (/each\s+player\s+sacrifices?\s+a\s+creature/i.test(text)) {
    effects.push({ type: 'eachPlayerSacCreature' });
  }
  if (/untap\s+all\s+creatures\s+you\s+control/i.test(text)) {
    effects.push({ type: 'untapAllYouControl' });
  }
  const pumpAll = text.match(
    /creatures\s+you\s+control\s+get\s+([+-]\d+)\/([+-]\d+)\s+until\s+end\s+of\s+turn/i,
  );
  if (pumpAll) {
    effects.push({
      type: 'pumpAllYouControl',
      power: parseInt(pumpAll[1], 10),
      toughness: parseInt(pumpAll[2], 10),
    });
  }
  if (/draw\s+(?:a\s+card|cards)\s+equal\s+to\s+the\s+number\s+of\s+creatures\s+you\s+control/i.test(text)) {
    effects.push({ type: 'drawEqualCreatures' });
  }
  if (/you\s+gain\s+life\s+equal\s+to\s+the\s+number\s+of\s+creatures\s+you\s+control/i.test(text)) {
    effects.push({ type: 'gainLifeEqualCreatures' });
  }
  if (
    opts.allowTargets &&
    (/target\s+creature\s+you\s+control\s+deals?\s+damage\s+equal\s+to\s+its\s+power\s+to\s+any\s+target/i.test(
      text,
    ) ||
      /(?:deals?|deal)\s+damage\s+equal\s+to\s+(?:its|that\s+creature'?s?)\s+power\s+to\s+any\s+target/i.test(
        text,
      ))
  ) {
    const aKey = addTarget(targets, 'creatureYouControl', 'Choose creature for power');
    const dKey = addTarget(targets, 'anyTarget', 'Choose damage destination');
    effects.push({ type: 'damageEqualPower', targetKey: aKey, destKey: dKey });
  }
  const emblem = text.match(
    /you\s+get\s+an\s+emblem\s+with\s+[“"]([^”"]+)[”"]/i,
  );
  if (emblem) {
    effects.push({
      type: 'createEmblem',
      name: 'Emblem',
      oracle_text: emblem[1].trim(),
    });
  } else if (/you\s+get\s+an\s+emblem/i.test(text)) {
    // Fallback: remainder after "with"
    const m2 = text.match(/you\s+get\s+an\s+emblem\s+with\s+(.+?)(?:\.|$)/i);
    if (m2) {
      effects.push({
        type: 'createEmblem',
        name: 'Emblem',
        oracle_text: m2[1].replace(/[.“"”]/g, '').trim(),
      });
    }
  }
  if (/take\s+an\s+extra\s+turn\s+after\s+this\s+one/i.test(text)) {
    effects.push({ type: 'extraTurn' });
  }
  if (
    /put\s+a\s+land\s+card\s+from\s+your\s+hand\s+onto\s+the\s+battlefield/i.test(text)
  ) {
    effects.push({ type: 'putLandFromHand' });
  }

  if (/prevent\s+all\s+combat\s+damage\s+that\s+would\s+be\s+dealt\s+this\s+turn/i.test(text)) {
    effects.push({ type: 'preventCombatDamageThisTurn' });
  } else if (/prevent\s+all\s+damage\s+that\s+would\s+be\s+dealt\s+this\s+turn/i.test(text)) {
    effects.push({ type: 'preventAllDamageThisTurn' });
  }

  if (
    opts.allowTargets &&
    /the\s+next\s+(\d+)\s+damage\s+that\s+would\s+be\s+dealt\s+to\s+you.+dealt\s+to\s+target\s+creature\s+instead/i.test(
      text,
    )
  ) {
    const m = text.match(/the\s+next\s+(\d+)\s+damage/i);
    const toKey = addTarget(targets, 'creature', 'Choose redirect destination');
    effects.push({
      type: 'redirectDamage',
      fromKey: 'self',
      toKey,
      amount: m ? parseInt(m[1], 10) : 3,
    });
  } else if (
    opts.allowTargets &&
    /redirect\s+(?:the\s+next\s+)?(\d+)\s+damage.+to\s+target\s+creature/i.test(text)
  ) {
    const m = text.match(/redirect\s+(?:the\s+next\s+)?(\d+)\s+damage/i);
    const fromKey = addTarget(targets, 'anyTarget', 'Choose who would take damage');
    const toKey = addTarget(targets, 'creature', 'Choose redirect destination');
    effects.push({
      type: 'redirectDamage',
      fromKey,
      toKey,
      amount: m ? parseInt(m[1], 10) : 3,
    });
  }

  if (opts.allowTargets && /put\s+target\s+(?:creature|permanent)\s+on\s+top\s+of\s+(?:its|their)\s+owner'?s?\s+library/i.test(text)) {
    const filter: TargetFilter = /creature/i.test(text) ? 'creature' : 'permanent';
    const key = addTarget(targets, filter, 'Choose permanent to put on top');
    effects.push({ type: 'putOnTop', targetKey: key });
  }
  if (
    opts.allowTargets &&
    /put\s+target\s+(?:creature|permanent)\s+on\s+(?:the\s+)?bottom\s+of\s+(?:its|their)\s+owner'?s?\s+library/i.test(
      text,
    )
  ) {
    const filter: TargetFilter = /creature/i.test(text) ? 'creature' : 'permanent';
    const key = addTarget(targets, filter, 'Choose permanent to put on bottom');
    effects.push({ type: 'putOnBottom', targetKey: key });
  }

  const lookAt = text.match(
    /look\s+at\s+the\s+top\s+(a|one|two|three|\d+)\s+cards?\s+of\s+your\s+library/i,
  );
  if (lookAt) effects.push({ type: 'lookAtTop', amount: parseCount(lookAt[1]) });

  if (
    opts.allowTargets &&
    /exile\s+target\s+(?:creature\s+)?card\s+from\s+(?:a|target|an?\s+opponent'?s?)\s+graveyard/i.test(
      text,
    )
  ) {
    const key = addTarget(targets, 'cardInAnyGy', 'Choose card in a graveyard');
    effects.push({ type: 'exileFromGraveyard', targetKey: key });
  } else if (
    opts.allowTargets &&
    /exile\s+target\s+card\s+from\s+a\s+graveyard/i.test(text)
  ) {
    const key = addTarget(targets, 'cardInAnyGy', 'Choose card in a graveyard');
    effects.push({ type: 'exileFromGraveyard', targetKey: key });
  }

  const xp = text.match(
    /you\s+get\s+(a|one|two|three|\d+)\s+experience\s+counters?/i,
  );
  if (xp) effects.push({ type: 'getExperience', amount: parseCount(xp[1]) });
  else if (/you\s+get\s+an?\s+experience\s+counter/i.test(text)) {
    effects.push({ type: 'getExperience', amount: 1 });
  }

  if (/you\s+get\b/i.test(text) && /\{E\}/i.test(text)) {
    const n = (text.match(/\{E\}/gi) || []).length;
    if (n > 0) effects.push({ type: 'getEnergy', amount: n });
  } else {
    const energyWord = text.match(
      /you\s+get\s+(a|one|two|three|\d+)\s+energy\s+counters?/i,
    );
    if (energyWord) {
      effects.push({ type: 'getEnergy', amount: parseCount(energyWord[1]) });
    } else if (/you\s+get\s+an?\s+energy\s+counter/i.test(text)) {
      effects.push({ type: 'getEnergy', amount: 1 });
    }
  }

  if (
    /draw\s+(?:a\s+card|cards)\s+(?:for\s+each|equal\s+to\s+the\s+number\s+of)\s+experience\s+counters?\s+you\s+have/i.test(
      text,
    )
  ) {
    effects.push({ type: 'drawEqualExperience' });
  }

  const devotionDmg = text.match(
    /(?:deals?|deal)\s+damage\s+equal\s+to\s+your\s+devotion\s+to\s+(white|blue|black|red|green)\s+to\s+(?:any\s+target|target\s+(?:creature|player))/i,
  );
  if (devotionDmg && opts.allowTargets) {
    const colorMap: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
      white: 'W',
      blue: 'U',
      black: 'B',
      red: 'R',
      green: 'G',
    };
    const key = addTarget(targets, 'anyTarget', 'Choose devotion damage target');
    effects.push({
      type: 'damageEqualDevotion',
      color: colorMap[devotionDmg[1].toLowerCase()],
      targetKey: key,
    });
  }
  const devotionDraw = text.match(
    /draw\s+(?:a\s+card|cards)\s+equal\s+to\s+your\s+devotion\s+to\s+(white|blue|black|red|green)/i,
  );
  if (devotionDraw) {
    const colorMap: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
      white: 'W',
      blue: 'U',
      black: 'B',
      red: 'R',
      green: 'G',
    };
    effects.push({
      type: 'drawEqualDevotion',
      color: colorMap[devotionDraw[1].toLowerCase()],
    });
  }
  const devotionLife = text.match(
    /you\s+gain\s+life\s+equal\s+to\s+your\s+devotion\s+to\s+(white|blue|black|red|green)/i,
  );
  if (devotionLife) {
    const colorMap: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
      white: 'W',
      blue: 'U',
      black: 'B',
      red: 'R',
      green: 'G',
    };
    effects.push({
      type: 'gainLifeEqualDevotion',
      color: colorMap[devotionLife[1].toLowerCase()],
    });
  }

  if (
    opts.allowTargets &&
    /(?:deals?|deal)\s+damage\s+equal\s+to\s+the\s+number\s+of\s+basic\s+land\s+types\s+among\s+lands\s+you\s+control/i.test(
      text,
    )
  ) {
    const key = addTarget(targets, 'anyTarget', 'Choose domain damage target');
    effects.push({ type: 'damageEqualDomain', targetKey: key });
  }
  if (
    /draw\s+(?:a\s+card|cards)\s+equal\s+to\s+the\s+number\s+of\s+basic\s+land\s+types\s+among\s+lands\s+you\s+control/i.test(
      text,
    )
  ) {
    effects.push({ type: 'drawEqualDomain' });
  }

  if (/\bexplores?\b/i.test(text) && !/map token/i.test(text)) {
    if (opts.allowTargets && /target\s+creature\s+(?:you\s+control\s+)?explores?/i.test(text)) {
      const key = addTarget(targets, 'creatureYouControl', 'Choose creature to explore');
      effects.push({ type: 'explore', targetKey: key });
    } else if (/\bexplore\b/i.test(text) || /this\s+creature\s+explores?/i.test(text)) {
      effects.push({ type: 'explore' });
    }
  }

  const fabricate = text.match(/\bfabricate\s+(\d+)\b/i);
  if (fabricate) effects.push({ type: 'fabricate', amount: parseInt(fabricate[1], 10) });

  const support = text.match(/\bsupport\s+(\d+)\b/i);
  if (support) effects.push({ type: 'support', amount: parseInt(support[1], 10) });

  const bolster = text.match(/\bbolster\s+(\d+)\b/i);
  if (bolster) effects.push({ type: 'bolster', amount: parseInt(bolster[1], 10) });

  const backup = text.match(/\bbackup\s+(\d+)\b/i);
  if (backup) effects.push({ type: 'backup', amount: parseInt(backup[1], 10) });

  // Each opponent loses N life / discards
  const oppLose = text.match(/each\s+opponent\s+loses?\s+(\d+)\s+life/i);
  if (oppLose) {
    effects.push({ type: 'loseLifeEachOpponent', amount: parseInt(oppLose[1], 10) });
  }
  if (/each\s+opponent\s+discards?\s+(a|one)\s+card/i.test(text)) {
    effects.push({ type: 'discardEachOpponent', amount: 1 });
  }
  const oppDiscN = text.match(/each\s+opponent\s+discards?\s+(\d+)\s+cards?/i);
  if (oppDiscN) {
    effects.push({ type: 'discardEachOpponent', amount: parseInt(oppDiscN[1], 10) });
  }

  // Put N +1/+1 counters on each creature you control
  const countersAll = text.match(
    /put\s+(a|one|two|three|\d+)\s+\+1\/\+1\s+counters?\s+on\s+each\s+creature\s+you\s+control/i,
  );
  if (countersAll) {
    effects.push({
      type: 'addCounterAllYouControl',
      counter: '+1/+1',
      amount: parseCount(countersAll[1]),
    });
  }

  // Draw a card for each creature that died this turn
  if (
    /draw\s+(a|one)\s+card\s+for\s+each\s+creature\s+that\s+died\s+this\s+turn/i.test(text) ||
    /draw\s+cards?\s+equal\s+to\s+the\s+number\s+of\s+creatures?\s+that\s+died\s+this\s+turn/i.test(
      text,
    )
  ) {
    effects.push({ type: 'drawEqualDiedThisTurn' });
  }

  // Destroy target artifact or enchantment
  if (
    opts.allowTargets &&
    /destroy\s+target\s+artifact\s+or\s+enchantment/i.test(text)
  ) {
    const key = addTarget(targets, 'permanent', 'Choose artifact or enchantment');
    effects.push({ type: 'destroy', targetKey: key });
  }

  // Return target creature card from your graveyard to your hand
  if (
    opts.allowTargets &&
    /return\s+target\s+creature\s+card\s+from\s+(?:your|a)\s+graveyard\s+to\s+(?:your|its\s+owner'?s)\s+hand/i.test(
      text,
    )
  ) {
    const key = addTarget(targets, 'creatureCardInYourGy', 'Choose creature card in your GY');
    effects.push({ type: 'returnToHand', targetKey: key });
  }

  // Target creature gains KEYWORD until end of turn
  if (opts.allowTargets) {
    const gainKw = text.match(
      /target\s+creature\s+gains?\s+(flying|first\s+strike|double\s+strike|deathtouch|lifelink|vigilance|trample|haste|hexproof|indestructible|menace)\s+until\s+end\s+of\s+turn/i,
    );
    if (gainKw) {
      const key = addTarget(targets, 'creature', 'Choose creature to grant keyword');
      const kw = gainKw[1].toLowerCase().replace(/\s+/g, ' ');
      effects.push({ type: 'grantKeyword', targetKey: key, keyword: kw });
    }
  }

  // You draw a card and you lose 1 life (sign in blood-ish) — already draw+lose separate
  const drawLose = text.match(
    /(?:you\s+)?draw\s+(a|one|two|three|\d+)\s+cards?\s+and\s+(?:you\s+)?lose\s+(\d+)\s+life/i,
  );
  if (drawLose) {
    effects.push({ type: 'draw', amount: parseCount(drawLose[1]) });
    effects.push({ type: 'loseLife', amount: parseInt(drawLose[2], 10) });
  }

  for (const d of delayed) {
    const nested: Effect[] = [];
    parseEffectsFromText(d.clause, targets, nested, { allowTargets: opts.allowTargets });
    if (!nested.length) continue;
    effects.push(
      d.when === 'endStep'
        ? { type: 'delayEndStep', effects: nested }
        : { type: 'delayEndCombat', effects: nested },
    );
  }

  const prevent = text.match(
    /prevent\s+the\s+next\s+(\d+)\s+damage\s+that\s+would\s+be\s+dealt\s+to\s+(any\s+target|target\s+creature|target\s+player)/i,
  );
  if (prevent && opts.allowTargets) {
    const filter: TargetFilter =
      /player/i.test(prevent[2]) && !/any/.test(prevent[2])
        ? 'player'
        : /creature/i.test(prevent[2])
          ? 'creature'
          : 'anyTarget';
    const key = addTarget(targets, filter, 'Choose prevent target');
    effects.push({ type: 'preventDamage', amount: parseInt(prevent[1], 10), targetKey: key });
  }
}

/** Parse modal "Choose one — A. B. C." into modes. */
export function parseModes(oracleText: string): SpellMode[] | null {
  const m = oracleText.match(/choose\s+one\s*[—\-–]\s*([\s\S]+)/i);
  if (!m) return null;
  let body = m[1];
  // Cut off kicker / flashback lines
  body = body.split(/\nkicker\b/i)[0];
  body = body.split(/\nflashback\b/i)[0];
  // Split on • or numbered options or ". " between capital clauses
  let parts = body
    .split(/•/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    parts = body
      .split(/\s*\d+\.\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (parts.length < 2) {
    // "Deal 3 damage to any target. Draw a card." style after Choose one —
    parts = body
      .split(/\.\s+(?=[A-Z])/)
      .map((s) => s.replace(/\.$/, '').trim())
      .filter(Boolean);
  }
  if (parts.length < 2) return null;
  return parts.map((label) => {
    const targets: TargetSlot[] = [];
    const effects: Effect[] = [];
    parseEffectsFromText(label, targets, effects, { allowTargets: true });
    if (effects.length === 0) effects.push({ type: 'noop' });
    return { label: label.slice(0, 80), targets, effects };
  });
}

export function parseKicker(oracleText?: string): KickerOption | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bkicker\s*((?:\{[^}]+\})+)/i);
  if (!m) return null;
  // Effects after "If ~ was kicked," / "If this spell was kicked,"
  const kicked = oracleText.match(
    /if\s+(?:~|this\s+spell)\s+was\s+kicked[, ]+([^.]+)\./i,
  );
  const targets: TargetSlot[] = [];
  const effects: Effect[] = [];
  if (kicked) {
    parseEffectsFromText(kicked[1], targets, effects, { allowTargets: true });
  }
  if (effects.length === 0) effects.push({ type: 'draw', amount: 1 }); // weak fallback only if kicked clause missing — better noop
  if (!kicked) {
    effects.length = 0;
    effects.push({ type: 'noop' });
  }
  return { cost: m[1], targets, effects };
}

export function manaCostHasX(manaCost?: string): boolean {
  if (!manaCost) return false;
  return /\{X\}/i.test(manaCost);
}

export function hasConvoke(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'convoke')) return true;
  return /\bconvoke\b/i.test(card.oracle_text || '');
}

export function hasDelve(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'delve')) return true;
  return /\bdelve\b/i.test(card.oracle_text || '');
}

export function parseBuybackCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bbuyback\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

export function hasRebound(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'rebound')) return true;
  return /\brebound\b/i.test(card.oracle_text || '');
}

export function hasSplitSecond(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'split second')) return true;
  return /\bsplit second\b/i.test(card.oracle_text || '');
}

export function cantBeCountered(oracleText?: string): boolean {
  if (!oracleText) return false;
  return /can'?t be countered/i.test(oracleText) || /cannot be countered/i.test(oracleText);
}

/** "… enters with N +1/+1 counters" / "enters the battlefield with" */
export function parseEntersWithCounters(oracleText?: string): { counter: string; amount: number } | null {
  if (!oracleText) return null;
  const m = oracleText.match(
    /enters(?:\s+the\s+battlefield)?\s+with\s+(a|one|two|three|\d+)\s+(\+1\/\+1|-1\/-1)\s+counters?/i,
  );
  if (!m) return null;
  const amount = /^(a|one)$/i.test(m[1])
    ? 1
    : /^two$/i.test(m[1])
      ? 2
      : /^three$/i.test(m[1])
        ? 3
        : parseInt(m[1], 10);
  return { counter: m[2], amount: Number.isFinite(amount) ? amount : 1 };
}

/** Additional cost: sacrifice a creature / discard a card. */
export function parseAdditionalCosts(oracleText?: string): {
  sacrificeCreature?: boolean;
  discard?: number;
  payLife?: number;
} {
  if (!oracleText) return {};
  const flat = oracleText.replace(/\n/g, ' ');
  const out: { sacrificeCreature?: boolean; discard?: number; payLife?: number } = {};
  if (
    /as\s+an\s+additional\s+cost\s+to\s+cast[^,]*,?\s*sacrifice\s+a\s+creature/i.test(flat) ||
    /as\s+an\s+additional\s+cost[^,]*,?\s*sacrifice\s+a\s+creature/i.test(flat)
  ) {
    out.sacrificeCreature = true;
  }
  const disc = flat.match(
    /as\s+an\s+additional\s+cost\s+to\s+cast[^,]*,?\s*discard\s+(a|one|two|three|\d+)\s+cards?/i,
  );
  if (disc) {
    out.discard = /^(a|one)$/i.test(disc[1])
      ? 1
      : /^two$/i.test(disc[1])
        ? 2
        : /^three$/i.test(disc[1])
          ? 3
          : parseInt(disc[1], 10);
  }
  const life = flat.match(
    /as\s+an\s+additional\s+cost\s+to\s+cast[^,]*,?\s*pay\s+(\d+)\s+life/i,
  );
  if (life) out.payLife = parseInt(life[1], 10);
  return out;
}

/** Keywords granted by continuous text on other permanents. */
export function continuousGrantedKeywords(
  permanent: { id: string; controller: string; card: { type_line: string } },
  state: {
    players: {
      battlefield: {
        id: string;
        controller: string;
        attachedTo?: string;
        card: { oracle_text?: string };
      }[];
    }[];
  },
): string[] {
  if (!permanent.card.type_line.includes('Creature')) return [];
  const granted = new Set<string>();
  const kwList = [
    'flying',
    'haste',
    'vigilance',
    'trample',
    'lifelink',
    'deathtouch',
    'hexproof',
    'indestructible',
    'menace',
    'reach',
    'first strike',
    'double strike',
  ];
  for (const p of state.players) {
    for (const src of p.battlefield) {
      if (src.id === permanent.id) continue;
      const text = src.card.oracle_text || '';
      for (const kw of kwList) {
        const reYou = new RegExp(
          `creatures\\s+you\\s+control\\s+have\\s+${kw.replace(' ', '\\s+')}`,
          'i',
        );
        const reOther = new RegExp(
          `other\\s+creatures\\s+you\\s+control\\s+have\\s+${kw.replace(' ', '\\s+')}`,
          'i',
        );
        if (reYou.test(text) && src.controller === permanent.controller) granted.add(kw);
        if (reOther.test(text) && src.controller === permanent.controller) granted.add(kw);
      }
      // Equipped / Enchanted creature has KW
      if (src.attachedTo === permanent.id) {
        for (const kw of kwList) {
          const re = new RegExp(
            `(?:equipped|enchanted)\\s+creature\\s+(?:gets?\\s+[^.]*(?:and\\s+)?has\\s+|has\\s+)${kw.replace(' ', '\\s+')}`,
            'i',
          );
          const re2 = new RegExp(
            `(?:equipped|enchanted)\\s+creature\\s+has\\s+${kw.replace(' ', '\\s+')}`,
            'i',
          );
          if (re.test(text) || re2.test(text)) granted.add(kw);
        }
      }
    }
  }
  return [...granted];
}

export function hasAffinity(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => /^affinity\b/i.test(k))) return true;
  return /\baffinity\s+for\b/i.test(card.oracle_text || '');
}

/** Affinity for artifacts | lands | … → count of matching permanents you control. */
export function affinityDiscount(
  state: { players: { id: string; battlefield: { card: { type_line: string } }[] }[] },
  controllerId: string,
  card: { oracle_text?: string; keywords?: string[] },
): number {
  if (!hasAffinity(card)) return 0;
  const text = `${(card.keywords || []).join(' ')} ${card.oracle_text || ''}`.toLowerCase();
  let kind: 'artifact' | 'land' | 'creature' | 'enchantment' = 'artifact';
  if (/affinity\s+for\s+lands?/i.test(text)) kind = 'land';
  else if (/affinity\s+for\s+creatures?/i.test(text)) kind = 'creature';
  else if (/affinity\s+for\s+enchantments?/i.test(text)) kind = 'enchantment';
  else if (/affinity\s+for\s+artifacts?/i.test(text)) kind = 'artifact';
  const p = state.players.find((x) => x.id === controllerId);
  if (!p) return 0;
  const needle =
    kind === 'artifact'
      ? 'Artifact'
      : kind === 'land'
        ? 'Land'
        : kind === 'creature'
          ? 'Creature'
          : 'Enchantment';
  return p.battlefield.filter((c) => c.card.type_line.includes(needle)).length;
}

export function hasImprovise(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'improvise')) return true;
  return /\bimprovise\b/i.test(card.oracle_text || '');
}

export function parseOverloadCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\boverload\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

export function parseEvokeCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bevoke\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/** Static "This spell costs {N} less to cast" on the card itself. */
export function selfCostReduction(oracleText?: string): number {
  if (!oracleText) return 0;
  const m = oracleText.match(
    /this\s+spell\s+costs?\s*\{(\d+)\}\s*less\s+to\s+cast/i,
  );
  return m ? parseInt(m[1], 10) : 0;
}

export function oracleEntersTapped(oracleText?: string): boolean {
  if (!oracleText) return false;
  return /enters(?:\s+the\s+battlefield)?\s+tapped/i.test(oracleText);
}

export type StepTriggerWhen = 'upkeep' | 'draw' | 'endStep';

/** Permanent triggers: "At the beginning of your/each upkeep/…" */
export function parseBeginningStepScripts(
  oracleText?: string,
): { when: StepTriggerWhen; yourOnly: boolean; script: SpellScript }[] {
  if (!oracleText) return [];
  const out: { when: StepTriggerWhen; yourOnly: boolean; script: SpellScript }[] = [];
  const re =
    /at\s+the\s+beginning\s+of\s+(your|each(?:\s+player'?s?)?)\s+(upkeep|draw\s+step|end\s+step)[, ]+([^.]+)/gi;
  for (const m of oracleText.matchAll(re)) {
    const yourOnly = /^your$/i.test(m[1]);
    const whenRaw = m[2].toLowerCase();
    const when: StepTriggerWhen =
      whenRaw.startsWith('upkeep') ? 'upkeep' : whenRaw.startsWith('draw') ? 'draw' : 'endStep';
    const targets: TargetSlot[] = [];
    const effects: Effect[] = [];
    parseEffectsFromText(m[3], targets, effects, { allowTargets: true });
    if (!effects.length || (effects.length === 1 && effects[0].type === 'noop')) continue;
    out.push({ when, yourOnly, script: { targets, effects } });
  }
  return out;
}

/** Rewrite a targeted damage/destroy script into each-creature / each-opponent (overload). */
export function overloadScript(script: SpellScript): SpellScript {
  const effects: Effect[] = [];
  for (const e of script.effects) {
    if (e.type === 'damage') {
      // Heuristic: creature targets → each creature; else each opponent
      const slot = script.targets.find((t) => t.key === e.targetKey);
      if (slot && (slot.filter === 'creature' || slot.filter === 'anyTarget')) {
        effects.push({ type: 'damageEachCreature', amount: e.amount < 0 ? 0 : e.amount });
      } else {
        effects.push({ type: 'damageEachOpponent', amount: e.amount < 0 ? 0 : e.amount });
      }
    } else if (e.type === 'destroy') {
      effects.push({ type: 'destroyAllCreatures' });
    } else if (e.type === 'tap') {
      // skip targeted tap under overload MVP
    } else {
      effects.push(e);
    }
  }
  if (!effects.length) effects.push({ type: 'noop' });
  return { targets: [], effects };
}

/** Instant/sorcery (and cast) script — trigger clauses stripped so they don't fire on cast. */
export function parseOracleScript(
  oracleText?: string,
  typeLine?: string,
  manaCost?: string,
): SpellScript {
  if (!oracleText) return { targets: [], effects: [{ type: 'noop' }] };
  const modes = parseModes(oracleText);
  const kicker = parseKicker(oracleText);
  const hasX = manaCostHasX(manaCost);

  let { rest } = extractEtbClauses(oracleText);
  rest = extractClauses(
    rest,
    /when (?:~|this (?:creature|permanent)|[^.]+?) dies[, ]+([^.]+)\./gi,
  ).rest;
  rest = extractClauses(
    rest,
    /when(?:ever)? (?:~|this creature|[^.]+?) attacks[, ]+([^.]+)\./gi,
  ).rest;
  rest = extractClauses(
    rest,
    /when(?:ever)? (?:~|this creature|[^.]+?) deals combat damage to a player[, ]+([^.]+)\./gi,
  ).rest;
  // Strip activated ability lines / cycling / equip / kicker / modal header from spell body
  rest = rest.replace(/\{T\}:[^.]*\.?/gi, ' ');
  rest = rest.replace(/cycling\s*\{[^}]+\}[^.]*\.?/gi, ' ');
  rest = rest.replace(/equip\s*\{[^}]+\}[^.]*\.?/gi, ' ');
  rest = rest.replace(/kicker\s*(?:\{[^}]+\})+/gi, ' ');
  rest = rest.replace(/if\s+(?:~|this\s+spell)\s+was\s+kicked[^.]*\./gi, ' ');
  const buybackCost = parseBuybackCost(oracleText);
  const buyback = buybackCost ? { cost: buybackCost } : undefined;

  if (modes) {
    // Modal body replaced by modes — don't also parse as linear effects
    return {
      targets: [],
      effects: [{ type: 'noop' }],
      modes,
      kicker: kicker || undefined,
      buyback,
      hasX,
    };
  }

  const targets: TargetSlot[] = [];
  const effects: Effect[] = [];

  // Aura: Enchant creature
  if (typeLine?.includes('Enchantment') && /enchant\s+creature/i.test(oracleText)) {
    const key = addTarget(targets, 'creature', 'Choose creature to enchant');
    effects.push({ type: 'attach', targetKey: key });
  }

  // Strip buyback/rebound/additional-cost reminder lines from spell body
  let body = rest || oracleText.replace(/\n/g, ' ');
  body = body.replace(/buyback\s*(?:\{[^}]+\})+/gi, ' ');
  body = body.replace(/\brebound\b/gi, ' ');
  body = body.replace(/as\s+an\s+additional\s+cost\s+to\s+cast[^.]*\./gi, ' ');

  parseEffectsFromText(body, targets, effects, {
    allowTargets: true,
  });
  if (effects.length === 0) effects.push({ type: 'noop' });
  return {
    targets,
    effects,
    kicker: kicker || undefined,
    buyback,
    hasX,
  };
}

/** Equip {N} → generic cost or null. */
export function parseEquipCost(oracleText?: string): number | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bequip\s*\{(\d+)\}/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Cycling {N} → generic cost or null. */
export function parseCyclingCost(oracleText?: string): number | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bcycling\s*\{(\d+)\}/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Flashback `{2}{R}` → mana cost string or null. */
export function parseFlashbackCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bflashback\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/** Jump-start `{2}{U}` — cast from GY + discard (702.126). */
export function parseJumpStartCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bjump-?start\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/** Unearth `{2}{B}` — activate from GY (702.110). */
export function parseUnearthCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bunearth\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

export function hasCascade(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'cascade')) return true;
  return /\bcascade\b/i.test(card.oracle_text || '');
}

export function hasAscend(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'ascend')) return true;
  return /\bascend\b/i.test(card.oracle_text || '');
}

export function hasStorm(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'storm')) return true;
  return /\bstorm\b/i.test(card.oracle_text || '');
}

export function hasEvolve(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'evolve')) return true;
  return /\bevolve\b/i.test(card.oracle_text || '');
}

export function hasMentor(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'mentor')) return true;
  return /\bmentor\b/i.test(card.oracle_text || '');
}

export function hasChangeling(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'changeling')) return true;
  return /\bchangeling\b/i.test(card.oracle_text || '');
}

export function hasTraining(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'training')) return true;
  return /\btraining\b/i.test(card.oracle_text || '');
}

export function parseRenown(oracleText?: string, keywords?: string[]): number | null {
  for (const k of keywords || []) {
    const m = k.toLowerCase().match(/renown\s+(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const m = (oracleText || '').match(/\brenown\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

export function parseBloodthirst(oracleText?: string, keywords?: string[]): number | null {
  for (const k of keywords || []) {
    const m = k.toLowerCase().match(/bloodthirst\s+(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const m = (oracleText || '').match(/\bbloodthirst\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

export function parseDevour(oracleText?: string, keywords?: string[]): number | null {
  for (const k of keywords || []) {
    const m = k.toLowerCase().match(/devour\s+(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const m = (oracleText || '').match(/\bdevour\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

export function parseFabricate(oracleText?: string, keywords?: string[]): number | null {
  for (const k of keywords || []) {
    const m = k.toLowerCase().match(/fabricate\s+(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const m = (oracleText || '').match(/\bfabricate\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

export function parseBackup(oracleText?: string, keywords?: string[]): number | null {
  for (const k of keywords || []) {
    const m = k.toLowerCase().match(/backup\s+(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  const m = (oracleText || '').match(/\bbackup\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

export function parseSupport(oracleText?: string): number | null {
  const m = (oracleText || '').match(/\bsupport\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

export function parseBolster(oracleText?: string): number | null {
  const m = (oracleText || '').match(/\bbolster\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Battalion — … (702.100) */
export function parseBattalionEffects(oracleText?: string): Effect[] {
  if (!oracleText) return [];
  const m = oracleText.match(/battalion\s*[—–-]\s*([^.]+)/i);
  if (!m) return [];
  return parseTargetlessClauses([m[1].trim()]);
}

export type SagaChapter = { chapter: number; effects: Effect[] };

function romanToInt(s: string): number | null {
  const map: Record<string, number> = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
    viii: 8,
    ix: 9,
    x: 10,
  };
  const key = s.toLowerCase();
  if (map[key] != null) return map[key];
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Saga chapter lines: "I — …" / "II — …" */
export function parseSagaChapters(oracleText?: string): SagaChapter[] {
  if (!oracleText) return [];
  const out: SagaChapter[] = [];
  const re = /(?:^|\n)\s*(I{1,3}|IV|V|VI{0,3}|IX|X|\d+)\s*[—–-]\s*([^\n]+)/gi;
  for (const m of oracleText.matchAll(re)) {
    const chapter = romanToInt(m[1]);
    if (chapter == null) continue;
    const effects = parseTargetlessClauses([m[2].trim()]);
    if (effects.length) out.push({ chapter, effects });
  }
  return out.sort((a, b) => a.chapter - b.chapter);
}

export function isSaga(card: { type_line?: string }): boolean {
  return /enchantment\s+—\s*saga/i.test(card.type_line || '') || /\bsaga\b/i.test(card.type_line || '');
}

/** Escape — cost + exile N other cards from GY. */
export function parseEscape(
  oracleText?: string,
): { mana: string; exile: number } | null {
  if (!oracleText) return null;
  const m = oracleText.match(
    /\bescape\s*((?:\{[^}]+\})+)\s*,?\s*exile\s+(?:(\d+)|([a-z]+))\s+other\s+cards?\s+from\s+your\s+graveyard/i,
  );
  if (!m) return null;
  const exile = m[2] ? parseInt(m[2], 10) : parseCount(m[3] || 'one');
  return { mana: m[1], exile };
}

/** Retrace — cast from GY by discarding a land. */
export function hasRetrace(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'retrace')) return true;
  return /\bretrace\b/i.test(card.oracle_text || '');
}

/** Dash `{2}{R}` */
export function parseDashCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bdash\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/** Blitz `{2}{R}` */
export function parseBlitzCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bblitz\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/** Spectacle `{R}` alt cost. */
export function parseSpectacleCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bspectacle\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/** Crew N */
export function parseCrewCost(oracleText?: string): number | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bcrew\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Adapt N */
export function parseAdapt(oracleText?: string): number | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\badapt\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Monstrosity N */
export function parseMonstrosity(oracleText?: string): number | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bmonstrosity\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Embalm `{3}{W}` */
export function parseEmbalmCost(oracleText?: string): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bembalm\s*((?:\{[^}]+\})+)/i);
  return m ? m[1] : null;
}

/** Modular N */
export function parseModular(oracleText?: string): number | null {
  if (!oracleText) return null;
  const m = oracleText.match(/\bmodular\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

export function getAfterlife(card: { oracle_text?: string; keywords?: string[] }): number {
  const text = card.oracle_text || '';
  const m = text.match(/\bafterlife\s+(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  for (const k of card.keywords || []) {
    const km = k.toLowerCase().match(/afterlife\s+(\d+)/);
    if (km) return parseInt(km[1], 10);
  }
  return 0;
}

export function hasFear(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'fear')) return true;
  return /\bfear\b/i.test(card.oracle_text || '');
}

export function hasIntimidate(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'intimidate')) return true;
  return /\bintimidate\b/i.test(card.oracle_text || '');
}

export function hasShadow(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'shadow')) return true;
  return /\bshadow\b/i.test(card.oracle_text || '');
}

/** "Islandwalk" / "forestwalk" etc. */
export function getLandwalk(
  card: { oracle_text?: string; keywords?: string[] },
): string | null {
  for (const k of card.keywords || []) {
    const m = k.toLowerCase().match(/^(plains|island|swamp|mountain|forest)walk$/);
    if (m) return m[1];
  }
  const m = (card.oracle_text || '').match(
    /\b(plains|island|swamp|mountain|forest)walk\b/i,
  );
  return m ? m[1].toLowerCase() : null;
}

/** Annihilator N. */
export function getAnnihilator(card: { oracle_text?: string; keywords?: string[] }): number {
  const text = card.oracle_text || '';
  const m = text.match(/\bannihilator\s+(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  for (const k of card.keywords || []) {
    const km = k.toLowerCase().match(/annihilator\s+(\d+)/);
    if (km) return parseInt(km[1], 10);
  }
  return 0;
}

export function hasRiot(card: { oracle_text?: string; keywords?: string[] }): boolean {
  if ((card.keywords || []).some((k) => k.toLowerCase() === 'riot')) return true;
  return /\briot\b/i.test(card.oracle_text || '');
}

export type LoyaltyAbility = {
  loyaltyCost: number;
  script: SpellScript;
  text: string;
};

/** Parse `+1: Draw a card.` style loyalty abilities. */
export function parseLoyaltyAbilities(oracleText?: string): LoyaltyAbility[] {
  if (!oracleText) return [];
  const out: LoyaltyAbility[] = [];
  const re = /([+-]\d+|0):\s*([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(oracleText)) !== null) {
    const loyaltyCost = parseInt(m[1], 10);
    const line = m[2].replace(/\s+/g, ' ').trim();
    const targets: TargetSlot[] = [];
    const effects: Effect[] = [];
    parseEffectsFromText(line, targets, effects, { allowTargets: true });
    if (effects.length === 0) effects.push({ type: 'noop' });
    out.push({ loyaltyCost, script: { targets, effects }, text: line });
  }
  return out;
}

/** Toxic N — poison on combat damage to player. */
export function getToxicAmount(card: { oracle_text?: string; keywords?: string[] }): number {
  const text = card.oracle_text || '';
  const m = text.match(/\btoxic\s+(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  for (const k of card.keywords || []) {
    const km = k.toLowerCase().match(/toxic\s+(\d+)/);
    if (km) return parseInt(km[1], 10);
  }
  return 0;
}

function parseTargetlessClauses(clauses: string[]): Effect[] {
  const effects: Effect[] = [];
  for (const clause of clauses) {
    if (/\btarget\b/i.test(clause) || /\bany target\b/i.test(clause)) continue;
    parseEffectsFromText(clause, [], effects, { allowTargets: false });
  }
  return effects.filter((e) => e.type !== 'noop');
}

/**
 * Targetless ETB effects only.
 * e.g. "When ~ enters the battlefield, draw a card."
 */
export function parseEtbEffects(oracleText?: string): Effect[] {
  return parseTargetlessClauses(extractEtbClauses(oracleText).etb);
}

/** Full ETB script including targeted clauses (for stack + targeting). */
export function parseEtbScript(oracleText?: string): SpellScript {
  const clauses = extractEtbClauses(oracleText).etb;
  const targets: TargetSlot[] = [];
  const effects: Effect[] = [];
  for (const clause of clauses) {
    parseEffectsFromText(clause, targets, effects, { allowTargets: true });
  }
  if (effects.length === 0) effects.push({ type: 'noop' });
  return { targets, effects };
}

export function parseDiesEffects(oracleText?: string): Effect[] {
  return parseTargetlessClauses(extractDiesClauses(oracleText));
}

export function parseAttackEffects(oracleText?: string): Effect[] {
  return parseTargetlessClauses(extractAttackClauses(oracleText));
}

export function parseCombatDamagePlayerEffects(oracleText?: string): Effect[] {
  return parseTargetlessClauses(extractCombatDamagePlayerClauses(oracleText));
}

/** True if script has at least one non-noop effect (or modal with real modes). */
export function scriptHasRealEffects(script: SpellScript): boolean {
  if (script.modes && script.modes.length > 0) {
    return script.modes.some((m) => m.effects.some((e) => e.type !== 'noop'));
  }
  return script.effects.some((e) => e.type !== 'noop');
}

/**
 * Coverage helper — how well we parse a card for cast/ETB/dies.
 * Lands with mana abilities count as ok without spell effects.
 */
export function cardParseCoverage(card: {
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
}): {
  ok: boolean;
  cast: boolean;
  etb: boolean;
  dies: boolean;
  land: boolean;
} {
  const tl = card.type_line || '';
  const land = /\bLand\b/i.test(tl);
  if (land) {
    return { ok: true, cast: true, etb: true, dies: true, land: true };
  }
  const cast = scriptHasRealEffects(
    parseOracleScript(card.oracle_text, tl, card.mana_cost),
  );
  const etb = scriptHasRealEffects(parseEtbScript(card.oracle_text));
  const dies = parseDiesEffects(card.oracle_text).length > 0;
  // Permanent without text = vanilla ok; with text need cast or trigger coverage
  const text = (card.oracle_text || '').trim();
  if (!text) return { ok: true, cast: true, etb: true, dies: true, land: false };
  // Keyword soup / equip / crew / cycling lines without spell body still "ok" for play
  const keywordOnly =
    !/\b(target|draw|destroy|exile|create|deal|deals|return|put|gain|lose|search|counter|mill|scry|surveil)\b/i.test(
      text,
    ) &&
    (/^[A-Za-z][A-Za-z\s,/]*(?:\(.+\))?$/m.test(text.split('\n')[0] || '') ||
      /\b(equip|crew|cycling|flashback|unearth|escape|embalm|modular|evolve|undying|persist|mentor|exalted|prowess|training|bloodthirst|renown|adapt|monstrosity)\b/i.test(
        text,
      ));
  const ok =
    cast ||
    etb ||
    dies ||
    keywordOnly ||
    /\b\{T\}:\s*Add\b/i.test(text) ||
    /\b\{T\}:/i.test(text);
  return { ok, cast, etb, dies, land: false };
}

export function extractLandfallClauses(oracleText?: string): string[] {
  const flat = (oracleText || '').replace(/\n/g, ' ');
  const out: string[] = [];
  // "Landfall — Draw a card." / "Whenever a land enters …, draw a card."
  const landfallKw = flat.match(/landfall\s*[—–-]\s*([^.]+)\./i);
  if (landfallKw) out.push(landfallKw[1].trim());
  out.push(
    ...extractClauses(
      oracleText,
      /when(?:ever)? a land enters(?: the battlefield)? under your control[, ]+([^.]+)\./gi,
    ).clauses,
  );
  return out;
}

export function parseLandfallEffects(oracleText?: string): Effect[] {
  return parseTargetlessClauses(extractLandfallClauses(oracleText));
}

/** Prowess keyword or "Whenever you cast a noncreature spell, …" */
export function parseProwessOrCastNoncreature(oracleText?: string, keywords?: string[]): Effect[] {
  const hasProwess = (keywords || []).some((k) => k.toLowerCase() === 'prowess');
  const text = (oracleText || '').replace(/\n/g, ' ');
  if (hasProwess || /\bprowess\b/i.test(text.split('.')[0] || '')) {
    return [{ type: 'pumpSelf', power: 1, toughness: 1 }];
  }
  const clauses = extractClauses(
    oracleText,
    /when(?:ever)? you cast a noncreature spell[, ]+([^.]+)\./gi,
  ).clauses;
  return parseTargetlessClauses(clauses);
}

/** "Whenever you cast a spell, …" (any spell). */
export function parseCastAnySpellEffects(oracleText?: string): Effect[] {
  const clauses = extractClauses(
    oracleText,
    /when(?:ever)? you cast a spell[, ]+([^.]+)\./gi,
  ).clauses;
  return parseTargetlessClauses(clauses);
}

/** Watcher: whenever a/another creature dies … */
export function parseCreatureDiesWatcher(oracleText?: string): {
  otherOnly: boolean;
  yourOnly: boolean;
  effects: Effect[];
} | null {
  if (!oracleText) return null;
  const m = oracleText.match(
    /when(?:ever)?\s+(a|another)\s+creature(?:\s+you\s+control)?\s+dies[, ]+([^.]+)/i,
  );
  if (!m) return null;
  const otherOnly = /^another$/i.test(m[1]);
  const yourOnly = /creature\s+you\s+control\s+dies/i.test(oracleText);
  const effects = parseTargetlessClauses([m[2]]);
  if (!effects.length) return null;
  return { otherOnly, yourOnly, effects };
}

/** Watcher: whenever an enchantment / artifact / creature enters under your control. */
export function parseEtbWatcher(
  oracleText?: string,
): { kind: 'enchantment' | 'artifact' | 'creature'; effects: Effect[] } | null {
  if (!oracleText) return null;
  const m = oracleText.match(
    /when(?:ever)?\s+(?:an?\s+)?(enchantment|artifact|creature)\s+enters(?:\s+the\s+battlefield)?\s+under\s+your\s+control[, ]+([^.]+)/i,
  );
  if (!m) return null;
  const kind = m[1].toLowerCase() as 'enchantment' | 'artifact' | 'creature';
  const effects = parseTargetlessClauses([m[2]]);
  if (!effects.length) return null;
  return { kind, effects };
}

/** First `{T}: …` activated ability (non-mana). */
export function parseTapAbility(oracleText?: string): SpellScript | null {
  const all = parseActivatedAbilities(oracleText).filter((a) => a.needsTap);
  return all[0]?.script || null;
}

export type ParsedActivated = {
  /** Mana cost symbols excluding {T}, e.g. "{2}{G}" or "". */
  manaCost: string;
  needsTap: boolean;
  script: SpellScript;
  /** Cost prefix as written, e.g. "{T}, {2}". */
  costLabel: string;
};

/**
 * Parse activated abilities `{cost}: effect` including non-tap (e.g. `{2}: Draw a card`).
 * Skips mana abilities (`Add {G}`).
 */
export function parseActivatedAbilities(oracleText?: string): ParsedActivated[] {
  if (!oracleText) return [];
  const out: ParsedActivated[] = [];
  for (const raw of oracleText.split(/\n/)) {
    const line = raw.trim();
    // "{T}: …" or "{2}{G}: …" or "{T}, {1}: …"
    const m = line.match(/^((?:\{[^}]+\}(?:,\s*)?)+):\s*(.+)$/i);
    if (!m) continue;
    const costPart = m[1].trim();
    const effectPart = m[2].trim();
    if (/^add\b/i.test(effectPart)) continue;

    const needsTap = /\{T\}/i.test(costPart);
    const manaCost = costPart
      .replace(/\{T\}/gi, '')
      .replace(/,\s*/g, '')
      .replace(/\s+/g, '');

    const targets: TargetSlot[] = [];
    const effects: Effect[] = [];
    parseEffectsFromText(effectPart, targets, effects, { allowTargets: true });
    if (effects.length === 0 || (effects.length === 1 && effects[0].type === 'noop')) {
      continue;
    }
    out.push({
      manaCost,
      needsTap,
      script: { targets, effects },
      costLabel: costPart.replace(/\s+/g, ''),
    });
  }
  return out;
}
