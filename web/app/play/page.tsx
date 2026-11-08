'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CardInstance,
  GameState,
  Player,
  TargetRef,
  activateManaAbility,
  beginActivate,
  beginCast,
  beginCastCommander,
  beginCastFlashback,
  beginCastJumpStart,
  beginCastEscape,
  beginCastRetrace,
  beginCastDash,
  beginCastBlitz,
  beginCastEvoke,
  beginCastOverload,
  beginCastSpectacle,
  beginEmbalm,
  beginUnearth,
  beginCycle,
  cancelCast,
  confirmAttackers,
  confirmBlockers,
  createDemoGame,
  createGameFromPlayerDeck,
  focusAttacker,
  givePriority,
  isCombatDeclaring,
  legalAttackers,
  legalBlockers,
  listLegalTargets,
  moveDraftBlocker,
  passPriority,
  playLand,
  resolveCommanderZoneChoice,
  resolveDiscardSelect,
  resolveLegendChoice,
  resolveFabricateChoice,
  resolveLookAtTopChoice,
  resolveRiotChoice,
  resolveSacrificePermanents,
  resolveScryChoice,
  resolveSurveilChoice,
  resolveWardChoice,
  runDemoAi,
  selectCastTarget,
  selectCastMode,
  setCastX,
  setCastKicker,
  setCastBuyback,
  setDefendPlayer,
  setDefendPlaneswalker,
  confirmConvokeDelve,
  toggleDraftAttacker,
  toggleDraftBlocker,
  isPlaneswalker,
} from '../../lib/engine';
import { loadPlayDeck } from '../../lib/playSession';

function startGame(preferDeck: boolean): { state: GameState; source: 'deck' | 'demo' } {
  if (preferDeck) {
    const deck = loadPlayDeck();
    if (deck) {
      return {
        state: givePriority(createGameFromPlayerDeck(deck), 0),
        source: 'deck',
      };
    }
  }
  const g = createDemoGame();
  return { state: givePriority(g, g.activePlayerIndex), source: 'demo' };
}

function targetKey(t: TargetRef): string {
  if (t.kind === 'player') return `p:${t.playerId}`;
  if (t.kind === 'stack') return `s:${t.stackId}`;
  return `c:${t.permanentId}`;
}

function ZoneColumn({
  title,
  cards,
  compact,
  onCardClick,
  highlightIds,
}: {
  title: string;
  cards: CardInstance[];
  compact?: boolean;
  onCardClick?: (card: CardInstance) => void;
  highlightIds?: Set<string>;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-2 min-h-[5rem]">
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
        {title} ({cards.length})
      </div>
      <div className={`flex flex-wrap gap-1 ${compact ? 'max-h-24 overflow-y-auto' : ''}`}>
        {cards.map((c) => {
          const lit = highlightIds?.has(c.id);
          const clickable = !!onCardClick;
          const Tag = clickable ? 'button' : 'span';
          return (
            <Tag
              key={c.id}
              type={clickable ? 'button' : undefined}
              title={c.card.type_line + (clickable ? ' (klik)' : '')}
              onClick={clickable ? () => onCardClick(c) : undefined}
              className={`text-xs px-1.5 py-0.5 rounded border text-left ${
                lit
                  ? 'border-fuchsia-400 bg-fuchsia-950 text-fuchsia-100 ring-1 ring-fuchsia-400'
                  : c.isCommander
                    ? 'border-amber-600 bg-amber-950 text-amber-100'
                    : c.tapped
                      ? 'border-zinc-600 bg-zinc-800 text-zinc-400 italic'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-200'
              } ${clickable ? 'hover:border-emerald-500 cursor-pointer' : ''}`}
            >
              {c.isToken ? '[T] ' : ''}
              {c.card.name}
              {c.card.mana_cost ? ` ${c.card.mana_cost}` : ''}
              {c.goaded ? ' (goad)' : ''}
              {c.unearthed ? ' (UE)' : ''}
              {c.crewed ? ' (crew)' : ''}
              {c.dashed ? ' (dash)' : ''}
              {c.blitzed ? ' (blitz)' : ''}
              {c.monstrous ? ' (monstrous)' : ''}
              {c.attachedTo ? ' ⚔' : ''}
              {c.isCommander && c.commanderCastCount > 0
                ? ` +${2 * c.commanderCastCount}`
                : ''}
              {(c.counters['+1/+1'] || 0) > 0 ? ` +${c.counters['+1/+1']}/+${c.counters['+1/+1']}` : ''}
              {(c.counters['-1/-1'] || 0) > 0 ? ` ${-c.counters['-1/-1']}/${-c.counters['-1/-1']}` : ''}
              {(c.counters['loyalty'] || 0) > 0 ? ` ♥${c.counters['loyalty']}` : ''}
              {c.damageMarked > 0 ? ` (−${c.damageMarked})` : ''}
            </Tag>
          );
        })}
        {cards.length === 0 && <span className="text-xs text-zinc-600">—</span>}
      </div>
    </div>
  );
}

function PlayerPanel({
  player,
  isActive,
  hasPriority,
  perspective,
  onHandCard,
  onCommandCard,
  onBattlefieldCard,
  onGraveyardCard,
  onPlayerTarget,
  highlightIds,
  highlightPlayer,
  casting,
}: {
  player: Player;
  isActive: boolean;
  hasPriority: boolean;
  perspective: 'you' | 'opp';
  onHandCard?: (card: CardInstance) => void;
  onCommandCard?: (card: CardInstance) => void;
  onBattlefieldCard?: (card: CardInstance) => void;
  onGraveyardCard?: (card: CardInstance) => void;
  onPlayerTarget?: () => void;
  highlightIds?: Set<string>;
  highlightPlayer?: boolean;
  casting?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        player.hasLost
          ? 'border-red-900 opacity-60'
          : highlightPlayer
            ? 'border-fuchsia-400 bg-fuchsia-950/30'
            : hasPriority
              ? 'border-emerald-600 bg-emerald-950/20'
              : isActive
                ? 'border-sky-700 bg-sky-950/20'
                : 'border-zinc-800 bg-zinc-950'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold">{player.name}</span>
          <span className="text-xs text-zinc-500 ml-2">{perspective === 'you' ? '(ty)' : ''}</span>
          {isActive && <span className="ml-2 text-xs text-sky-400">active</span>}
          {hasPriority && !casting && (
            <span className="ml-2 text-xs text-emerald-400">priority</span>
          )}
          {player.hasLost && (
            <span className="ml-2 text-xs text-red-400">LOST: {player.loseReason}</span>
          )}
          {player.citysBlessing && (
            <span className="ml-2 text-xs text-sky-300">city&apos;s blessing</span>
          )}
        </div>
        {onPlayerTarget ? (
          <button
            type="button"
            onClick={onPlayerTarget}
            className={`text-sm tabular-nums px-2 py-0.5 rounded border ${
              highlightPlayer
                ? 'border-fuchsia-400 text-fuchsia-100'
                : 'border-zinc-700 text-zinc-300'
            }`}
          >
            Life <span className="font-semibold">{player.life}</span>
            {player.poison > 0 && <span className="ml-2 text-green-400">☠ {player.poison}</span>}
          </button>
        ) : (
          <div className="text-sm tabular-nums text-zinc-300">
            Life <span className="text-zinc-100 font-semibold">{player.life}</span>
            {player.poison > 0 && <span className="ml-2 text-green-400">☠ {player.poison}</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <ZoneColumn
          title="Command"
          cards={player.commandZone}
          onCardClick={!casting && hasPriority ? onCommandCard : undefined}
        />
        <ZoneColumn
          title="Hand"
          cards={player.hand}
          onCardClick={!casting && hasPriority ? onHandCard : undefined}
        />
        <ZoneColumn
          title="Battlefield"
          cards={player.battlefield}
          onCardClick={onBattlefieldCard}
          highlightIds={highlightIds}
        />
        <ZoneColumn
          title="Graveyard"
          cards={player.graveyard}
          compact
          onCardClick={onGraveyardCard}
          highlightIds={highlightIds}
        />
        <ZoneColumn title="Exile" cards={player.exile} compact />
        <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs text-zinc-400">
          Library: {player.library.length}
          <div className="mt-1 text-zinc-500">
            Mana:{' '}
            {Object.entries(player.manaPool)
              .filter(([, n]) => n > 0)
              .map(([c, n]) => `${n}${c}`)
              .join(' ') || '—'}
          </div>
          <div className="mt-1 text-zinc-500">
            Lands this turn: {player.landsPlayedThisTurn}/1
          </div>
          {Object.keys(player.commanderDamage).length > 0 && (
            <div className="mt-1 text-amber-500/90">
              Cmd dmg:{' '}
              {Object.entries(player.commanderDamage)
                .map(([id, d]) => `${id.slice(-4)}:${d}`)
                .join(' ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PlayPage() {
  const [state, setState] = useState<GameState | null>(null);
  const [source, setSource] = useState<'deck' | 'demo'>('demo');

  useEffect(() => {
    const preferDeck = new URLSearchParams(window.location.search).get('src') === 'deck';
    const boot = startGame(preferDeck);
    setSource(boot.source);
    setState(boot.state);
  }, []);

  // Demo AI (P2)
  useEffect(() => {
    if (!state) return;
    const t = window.setTimeout(() => {
      setState((s) => {
        if (!s) return s;
        const next = runDemoAi(s);
        return next === s ? s : next;
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [state]);

  const you = state?.players[0];
  const opp = state?.players[1];
  const priorityPlayer = state ? state.players[state.priorityPlayerIndex] : undefined;
  const casting = !!state?.pendingCast;
  const declaring = state ? isCombatDeclaring(state) : false;

  const legal = useMemo(() => {
    if (!state?.pendingCast) return [] as TargetRef[];
    const slot = state.pendingCast.slots[state.pendingCast.currentSlot];
    if (!slot) return [];
    return listLegalTargets(state, slot.filter);
  }, [state]);

  const legalPermIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of legal) {
      if (t.kind === 'permanent') s.add(t.permanentId);
    }
    if (state?.pendingCast?.phase === 'convoke') {
      const p = state.players.find((x) => x.id === state.pendingCast!.playerId);
      for (const c of p?.battlefield || []) {
        if (c.card.type_line.includes('Creature') && !c.tapped) s.add(c.id);
      }
      for (const id of state.pendingCast.convokeTapped || []) s.add(id);
    }
    if (state?.pendingCast?.phase === 'improvise') {
      const p = state.players.find((x) => x.id === state.pendingCast!.playerId);
      for (const c of p?.battlefield || []) {
        if (c.card.type_line.includes('Artifact') && !c.tapped) s.add(c.id);
      }
      for (const id of state.pendingCast.improviseTapped || []) s.add(id);
    }
    if (state?.pendingCast?.phase === 'delve') {
      const p = state.players.find((x) => x.id === state.pendingCast!.playerId);
      for (const c of p?.graveyard || []) {
        if (c.id !== state.pendingCast.cardId) s.add(c.id);
      }
      for (const id of state.pendingCast.delveExiled || []) s.add(id);
    }
    return s;
  }, [legal, state]);

  const legalPlayerIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of legal) {
      if (t.kind === 'player') s.add(t.playerId);
    }
    return s;
  }, [legal]);

  const legalStackIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of legal) {
      if (t.kind === 'stack') s.add(t.stackId);
    }
    return s;
  }, [legal]);

  const combatHighlight = useMemo(() => {
    const s = new Set<string>();
    if (!state) return s;
    if (state.combat?.mode === 'declareAttackers') {
      for (const id of legalAttackers(state)) s.add(id);
      for (const id of state.combat.draftAttackerIds) s.add(id);
    }
    if (state.combat?.mode === 'declareBlockers') {
      for (const id of legalBlockers(state)) s.add(id);
      for (const ids of Object.values(state.combat.draftBlocks)) {
        for (const id of ids) s.add(id);
      }
      for (const a of state.combat.attackers) s.add(a.attackerId);
    }
    return s;
  }, [state]);

  const canPass = useMemo(() => {
    if (!state) return false;
    return (
      !state.winnerId &&
      !state.pendingCast &&
      !declaring &&
      state.pendingChoices.length === 0 &&
      !!priorityPlayer &&
      !priorityPlayer.hasLost
    );
  }, [state, priorityPlayer, declaring]);

  const restart = (mode: 'deck' | 'demo' = source) => {
    const next = startGame(mode === 'deck');
    setSource(next.source);
    setState(next.state);
  };

  const onHandCard = (playerId: string, card: CardInstance) => {
    setState((s) => {
      if (card.card.type_line.includes('Land')) {
        return playLand(s, playerId, card.id);
      }
      // Cheap alternate costs first; expensive overload only if normal cast can't start
      for (const fn of [beginCastEvoke, beginCastSpectacle, beginCastDash, beginCastBlitz]) {
        const alt = fn(s, playerId, card.id);
        if (alt !== s) return alt;
      }
      const cast = beginCast(s, playerId, card.id);
      if (cast !== s) return cast;
      const overload = beginCastOverload(s, playerId, card.id);
      if (overload !== s) return overload;
      return beginCycle(s, playerId, card.id);
    });
  };

  const onCommandCard = (playerId: string, card: CardInstance) => {
    setState((s) => beginCastCommander(s, playerId, card.id));
  };

  const onBattlefieldCard = (playerId: string, card: CardInstance) => {
    setState((s) => {
      if (s.combat?.mode === 'declareAttackers') {
        return toggleDraftAttacker(s, card.id);
      }
      if (s.combat?.mode === 'declareBlockers') {
        if (s.combat.attackers.some((a) => a.attackerId === card.id)) {
          return focusAttacker(s, card.id);
        }
        const focus = s.combat.focusAttackerId || s.combat.attackers[0]?.attackerId;
        if (!focus) return s;
        return toggleDraftBlocker(s, focus, card.id);
      }
      if (s.pendingCast) {
        if (
          s.pendingCast.phase === 'convoke' ||
          s.pendingCast.phase === 'improvise' ||
          s.pendingCast.phase === 'delve'
        ) {
          return selectCastTarget(s, { kind: 'permanent', permanentId: card.id });
        }
        const slot = s.pendingCast.slots[s.pendingCast.currentSlot];
        const ok =
          slot &&
          listLegalTargets(s, slot.filter).some(
            (t) => t.kind === 'permanent' && t.permanentId === card.id,
          );
        if (ok) return selectCastTarget(s, { kind: 'permanent', permanentId: card.id });
        return activateManaAbility(s, playerId, card.id);
      }
      if (s.players[s.priorityPlayerIndex]?.id !== playerId) return s;
      const mana = activateManaAbility(s, playerId, card.id);
      if (mana !== s) return mana;
      return beginActivate(s, playerId, card.id);
    });
  };

  const finishAttackers = () => {
    setState((s) => {
      const next = confirmAttackers(s);
      return givePriority(next, next.priorityPlayerIndex);
    });
  };

  const finishBlockers = () => {
    setState((s) => {
      const next = confirmBlockers(s);
      return givePriority(next, next.priorityPlayerIndex);
    });
  };

  const onPlayerTarget = (playerId: string) => {
    setState((s) => {
      if (!s.pendingCast) return s;
      const slot = s.pendingCast.slots[s.pendingCast.currentSlot];
      if (!slot) return s;
      const ok = listLegalTargets(s, slot.filter).some(
        (t) => t.kind === 'player' && t.playerId === playerId,
      );
      if (!ok) return s;
      return selectCastTarget(s, { kind: 'player', playerId });
    });
  };

  const slotPrompt = state?.pendingCast
    ? state.pendingCast.slots[state.pendingCast.currentSlot]?.prompt
    : null;

  if (!state) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-400 p-6 text-sm">Načítám hru…</div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Herní plátno</h1>
          <p className="text-sm text-zinc-500">
            Solo vs AI · {source === 'deck' ? 'tvůj deck' : 'demo decky'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded"
          >
            Deck builder
          </Link>
          <Link
            href="/play/online"
            className="text-sm bg-indigo-800 hover:bg-indigo-700 px-3 py-1.5 rounded"
          >
            Online 2P
          </Link>
          <button
            onClick={() => restart('deck')}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded"
          >
            Restart (deck)
          </button>
          <button
            onClick={() => restart('demo')}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded"
          >
            Nová demo hra
          </button>
          <button
            disabled={!canPass}
            onClick={() => setState((s) => passPriority(s))}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded disabled:opacity-40"
          >
            Pass priority
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-sm bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
        <span>
          Tah <strong>{state.turnNumber}</strong>
        </span>
        <span>
          Fáze <strong>{state.phase}</strong> / <strong>{state.step}</strong>
        </span>
        <span>
          Stack <strong>{state.stack.length}</strong>
        </span>
        <span>
          Passes <strong>{state.consecutivePasses}</strong>
        </span>
        {state.combat?.damageWave && state.step === 'combatDamage' && (
          <span className="text-orange-300">
            Damage wave: <strong>{state.combat.damageWave}</strong>
            {state.combat.damageWave === 'first' ? ' (FS/DS)' : ''}
          </span>
        )}
        {state.monarchPlayerId && (
          <span className="text-yellow-300">
            Monarch:{' '}
            {state.players.find((p) => p.id === state.monarchPlayerId)?.name ||
              state.monarchPlayerId}
          </span>
        )}
        {state.players.some((p) => p.citysBlessing) && (
          <span className="text-sky-300">
            Blessing:{' '}
            {state.players
              .filter((p) => p.citysBlessing)
              .map((p) => p.name)
              .join(', ')}
          </span>
        )}
        {state.winnerId && (
          <span className="text-amber-300">
            Winner: {state.players.find((p) => p.id === state.winnerId)?.name}
          </span>
        )}
      </div>

      {state.pendingCast && (
        <div className="mb-4 p-3 bg-fuchsia-950 border border-fuchsia-700 rounded flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm space-y-2">
            <div className="font-semibold text-fuchsia-200">
              {state.pendingCast.from === 'ability'
                ? 'Activate'
                : state.pendingCast.from === 'equip'
                  ? 'Equip'
                  : state.pendingCast.from === 'crew'
                    ? 'Crew'
                    : state.pendingCast.from === 'trigger'
                      ? 'Trigger'
                      : 'Casting'}
              : {state.pendingCast.cardName}
              {state.pendingCast.phase && state.pendingCast.phase !== 'targets' && (
                <span className="text-fuchsia-400 font-normal"> · {state.pendingCast.phase}</span>
              )}
            </div>
            {state.pendingCast.phase === 'mode' && state.pendingCast.resolvedScript?.modes && (
              <div className="flex flex-wrap gap-2">
                {state.pendingCast.resolvedScript.modes.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    className="text-xs bg-fuchsia-800 hover:bg-fuchsia-700 px-2 py-1 rounded"
                    onClick={() => setState((s) => selectCastMode(s, i))}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            {state.pendingCast.phase === 'x' && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-fuchsia-100/80 text-xs">X =</span>
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="text-xs bg-fuchsia-800 hover:bg-fuchsia-700 px-2 py-1 rounded"
                    onClick={() => setState((s) => setCastX(s, n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {state.pendingCast.phase === 'kicker' && state.pendingCast.resolvedScript?.kicker && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs bg-fuchsia-800 hover:bg-fuchsia-700 px-2 py-1 rounded"
                  onClick={() => setState((s) => setCastKicker(s, true))}
                >
                  Kick {state.pendingCast.resolvedScript.kicker.cost}
                </button>
                <button
                  type="button"
                  className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                  onClick={() => setState((s) => setCastKicker(s, false))}
                >
                  No kicker
                </button>
              </div>
            )}
            {state.pendingCast.phase === 'buyback' && state.pendingCast.resolvedScript?.buyback && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs bg-fuchsia-800 hover:bg-fuchsia-700 px-2 py-1 rounded"
                  onClick={() => setState((s) => setCastBuyback(s, true))}
                >
                  Buyback {state.pendingCast.resolvedScript.buyback.cost}
                </button>
                <button
                  type="button"
                  className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                  onClick={() => setState((s) => setCastBuyback(s, false))}
                >
                  No buyback
                </button>
              </div>
            )}
            {(state.pendingCast.phase === 'convoke' ||
              state.pendingCast.phase === 'improvise' ||
              state.pendingCast.phase === 'delve') && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-fuchsia-100/80 text-xs">
                  {state.pendingCast.phase === 'convoke'
                    ? `Convoke — tap creatures (${state.pendingCast.convokeTapped?.length || 0})`
                    : state.pendingCast.phase === 'improvise'
                      ? `Improvise — tap artifacts (${state.pendingCast.improviseTapped?.length || 0})`
                      : `Delve — exile from GY (${state.pendingCast.delveExiled?.length || 0})`}
                </span>
                <button
                  type="button"
                  className="text-xs bg-fuchsia-800 hover:bg-fuchsia-700 px-2 py-1 rounded"
                  onClick={() => setState((s) => confirmConvokeDelve(s))}
                >
                  Done
                </button>
              </div>
            )}
            {(state.pendingCast.phase === 'targets' ||
              !state.pendingCast.phase ||
              state.pendingCast.from === 'crew') && (
              <>
                <div className="text-fuchsia-100/80">
                  {state.pendingCast.from === 'crew'
                    ? `Tap creatures (need ${state.pendingCast.crewNeeded} power)`
                    : slotPrompt || 'Choose targets'}
                  {state.pendingCast.slots.length > 0 && (
                    <>
                      {' '}
                      · slot {state.pendingCast.currentSlot + 1}/{state.pendingCast.slots.length}
                    </>
                  )}
                </div>
                <div className="text-xs text-fuchsia-300/70">
                  Fialový highlight = legální target. Můžeš tapnout land na manu.
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setState((s) => cancelCast(s))}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded"
          >
            Cancel
          </button>
        </div>
      )}

      {state.combat?.mode === 'declareAttackers' && (
        <div className="mb-4 p-3 bg-orange-950 border border-orange-700 rounded flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm space-y-1">
            <div className="font-semibold text-orange-200">Declare attackers (Arena)</div>
            <div className="text-orange-100/80">
              Klikni creatury (untapped, ne sick). Draft:{' '}
              {state.combat.draftAttackerIds.length || 'nikdo'}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-orange-300/80">Útok na:</span>
              {state.players
                .filter((p) => !p.hasLost && p.id !== state.players[state.activePlayerIndex]?.id)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setState((s) => setDefendPlayer(s, p.id))}
                    className={`px-2 py-0.5 rounded border ${
                      state.combat?.draftDefendPlayerId === p.id &&
                      !state.combat?.draftDefendPlaneswalkerId
                        ? 'border-orange-400 bg-orange-900'
                        : 'border-zinc-600'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              {(
                state.players.find((p) => p.id === state.combat?.draftDefendPlayerId)
                  ?.battlefield || []
              )
                .filter((c) => isPlaneswalker(c))
                .map((pw) => (
                  <button
                    key={pw.id}
                    type="button"
                    onClick={() => setState((s) => setDefendPlaneswalker(s, pw.id))}
                    className={`px-2 py-0.5 rounded border ${
                      state.combat?.draftDefendPlaneswalkerId === pw.id
                        ? 'border-orange-400 bg-orange-900'
                        : 'border-zinc-600'
                    }`}
                  >
                    {pw.card.name} ({pw.counters['loyalty'] ?? pw.card.loyalty ?? '?'})
                  </button>
                ))}
            </div>
          </div>
          <button
            type="button"
            onClick={finishAttackers}
            className="text-sm bg-orange-700 hover:bg-orange-600 px-3 py-1.5 rounded"
          >
            Confirm attackers
          </button>
        </div>
      )}

      {state.combat?.mode === 'declareBlockers' && (
        <div className="mb-4 p-3 bg-orange-950 border border-orange-700 rounded flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm space-y-2">
            <div className="font-semibold text-orange-200">Declare blockers (Arena)</div>
            <div className="text-xs text-orange-100/80">
              Klikni útočníka (focus) pak blockery — pořadí = damage assignment. Menace = ≥2
              blockery (jinak se při confirm zruší). Flying jen flying/reach.
            </div>
            <ul className="text-xs space-y-1">
              {state.combat.attackers.map((a) => (
                <li key={a.attackerId} className="space-y-0.5">
                  <div>Atk {a.attackerId.slice(-4)} ← blockers (pořadí = dmg):</div>
                  <div className="flex flex-wrap gap-1">
                    {(state.combat?.draftBlocks[a.attackerId] || []).map((b) => (
                      <span key={b} className="inline-flex items-center gap-0.5 border border-zinc-600 rounded px-1">
                        {b.slice(-4)}
                        <button
                          type="button"
                          className="text-[10px] text-zinc-400 hover:text-white"
                          onClick={() =>
                            setState((s) => moveDraftBlocker(s, a.attackerId, b, -1))
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="text-[10px] text-zinc-400 hover:text-white"
                          onClick={() =>
                            setState((s) => moveDraftBlocker(s, a.attackerId, b, 1))
                          }
                        >
                          ↓
                        </button>
                      </span>
                    ))}
                    {(state.combat?.draftBlocks[a.attackerId] || []).length === 0 && '—'}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={finishBlockers}
            className="text-sm bg-orange-700 hover:bg-orange-600 px-3 py-1.5 rounded"
          >
            Confirm blockers
          </button>
        </div>
      )}

      {state.pendingChoices.length > 0 && (
        <div className="mb-4 p-3 bg-amber-950 border border-amber-800 rounded space-y-2">
          <div className="font-semibold text-amber-200 text-sm">Pending choices (SBA)</div>
          {state.pendingChoices.map((choice, i) => {
            if (choice.type === 'legend') {
              return (
                <div key={i} className="text-sm space-y-1">
                  <div>
                    Legend rule — {choice.name} (hráč {choice.playerId}): nech jedno
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {choice.permanentIds.map((id) => (
                      <button
                        key={id}
                        className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                        onClick={() => setState((s) => resolveLegendChoice(s, id))}
                      >
                        Keep {id}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            if (choice.type === 'ward') {
              return (
                <div key={i} className="text-sm space-y-1">
                  <div>
                    Ward {'{' + choice.cost + '}'} — zaplatit, nebo spell/ability zrušit?
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                      onClick={() => setState((s) => resolveWardChoice(s, true))}
                    >
                      Zaplatit
                    </button>
                    <button
                      className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                      onClick={() => setState((s) => resolveWardChoice(s, false))}
                    >
                      Zrušit cast
                    </button>
                  </div>
                </div>
              );
            }
            if (choice.type === 'scry') {
              return (
                <LibraryLookChoice
                  key={i}
                  label="Scry — klikni karty na spodek library"
                  cardIds={choice.cardIds}
                  state={state}
                  onDone={(ids) => setState((s) => resolveScryChoice(s, ids))}
                />
              );
            }
            if (choice.type === 'surveil') {
              return (
                <LibraryLookChoice
                  key={i}
                  label="Surveil — klikni karty do graveyardu"
                  cardIds={choice.cardIds}
                  state={state}
                  onDone={(ids) => setState((s) => resolveSurveilChoice(s, ids))}
                />
              );
            }
            if (choice.type === 'lookAtTop') {
              return (
                <LibraryLookChoice
                  key={i}
                  label="Look at top — OK po prohlédnutí"
                  cardIds={choice.cardIds}
                  state={state}
                  onDone={() => setState((s) => resolveLookAtTopChoice(s))}
                />
              );
            }
            if (choice.type === 'fabricate') {
              return (
                <div key={i} className="text-sm space-y-1">
                  <div>Fabricate {choice.amount} — tokeny nebo +1/+1?</div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                      onClick={() => setState((s) => resolveFabricateChoice(s, 'tokens'))}
                    >
                      {choice.amount} Servo
                    </button>
                    <button
                      className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                      onClick={() => setState((s) => resolveFabricateChoice(s, 'counters'))}
                    >
                      +{choice.amount}/+{choice.amount}
                    </button>
                  </div>
                </div>
              );
            }
            if (choice.type === 'discardSelect') {
              const p = state.players.find((x) => x.id === choice.playerId);
              return (
                <DiscardChoice
                  key={i}
                  amount={choice.amount}
                  hand={p?.hand || []}
                  onDone={(ids) => setState((s) => resolveDiscardSelect(s, ids))}
                />
              );
            }
            if (choice.type === 'riot') {
              return (
                <div key={i} className="text-sm space-y-1">
                  <div>Riot — haste nebo +1/+1?</div>
                  <div className="flex gap-2">
                    <button
                      className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                      onClick={() =>
                        setState((s) => resolveRiotChoice(s, choice.permanentId, 'haste'))
                      }
                    >
                      Haste
                    </button>
                    <button
                      className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                      onClick={() =>
                        setState((s) => resolveRiotChoice(s, choice.permanentId, 'counter'))
                      }
                    >
                      +1/+1
                    </button>
                  </div>
                </div>
              );
            }
            if (choice.type === 'sacrificePermanents') {
              const p = state.players.find((x) => x.id === choice.playerId);
              return (
                <SacrificeChoice
                  key={i}
                  amount={choice.amount}
                  permanents={p?.battlefield || []}
                  onDone={(ids) => setState((s) => resolveSacrificePermanents(s, ids))}
                />
              );
            }
            return (
              <div key={i} className="text-sm space-y-1">
                <div>
                  Commander {choice.cardId} v {choice.from} — dát do command zone? (704.6d)
                </div>
                <div className="flex gap-2">
                  <button
                    className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                    onClick={() =>
                      setState((s) => resolveCommanderZoneChoice(s, choice.cardId, true))
                    }
                  >
                    Ano → command
                  </button>
                  <button
                    className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                    onClick={() =>
                      setState((s) => resolveCommanderZoneChoice(s, choice.cardId, false))
                    }
                  >
                    Nechat
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-4">
        {opp && (
          <PlayerPanel
            player={opp}
            isActive={state.activePlayerIndex === 1}
            hasPriority={state.priorityPlayerIndex === 1}
            perspective="opp"
            casting={casting || declaring}
            highlightIds={new Set([...legalPermIds, ...combatHighlight])}
            highlightPlayer={legalPlayerIds.has(opp.id)}
            onHandCard={(c) => onHandCard(opp.id, c)}
            onBattlefieldCard={(c) => onBattlefieldCard(opp.id, c)}
            onPlayerTarget={
              casting && legalPlayerIds.has(opp.id) ? () => onPlayerTarget(opp.id) : undefined
            }
          />
        )}

        <div className="text-center text-xs text-zinc-600 py-1">— stack / stůl —</div>
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded p-3 min-h-[3rem]">
          <div className="text-xs text-zinc-500 mb-1">Stack</div>
          {state.stack.length === 0 ? (
            <span className="text-xs text-zinc-600">prázdný</span>
          ) : (
            <div className="flex flex-col gap-1">
              {[...state.stack].reverse().map((obj) => {
                const lit = legalStackIds.has(obj.id);
                const Tag = lit ? 'button' : 'div';
                return (
                  <Tag
                    key={obj.id}
                    type={lit ? 'button' : undefined}
                    onClick={
                      lit
                        ? () =>
                            setState((s) =>
                              selectCastTarget(s, { kind: 'stack', stackId: obj.id }),
                            )
                        : undefined
                    }
                    className={`text-xs px-2 py-1 rounded text-left ${
                      lit
                        ? 'bg-fuchsia-900 border border-fuchsia-400'
                        : 'bg-zinc-800 border border-transparent'
                    }`}
                  >
                    [{obj.kind}] {obj.name} ({obj.controller})
                    {obj.targets && Object.keys(obj.targets).length > 0 && (
                      <span className="text-zinc-500">
                        {' '}
                        → {Object.values(obj.targets).map(targetKey).join(', ')}
                      </span>
                    )}
                  </Tag>
                );
              })}
            </div>
          )}
        </div>

        {you && (
          <PlayerPanel
            player={you}
            isActive={state.activePlayerIndex === 0}
            hasPriority={state.priorityPlayerIndex === 0}
            perspective="you"
            casting={casting || declaring}
            highlightIds={new Set([...legalPermIds, ...combatHighlight])}
            highlightPlayer={legalPlayerIds.has(you.id)}
            onHandCard={(c) => onHandCard(you.id, c)}
            onCommandCard={(c) => onCommandCard(you.id, c)}
            onBattlefieldCard={(c) => onBattlefieldCard(you.id, c)}
            onGraveyardCard={
              casting
                ? (c) =>
                    setState((s) =>
                      selectCastTarget(s, { kind: 'permanent', permanentId: c.id }),
                    )
                : state.priorityPlayerIndex === 0 && !declaring
                  ? (c) =>
                      setState((s) => {
                        for (const fn of [
                          beginCastFlashback,
                          beginCastJumpStart,
                          beginCastEscape,
                          beginCastRetrace,
                          beginEmbalm,
                          beginUnearth,
                        ]) {
                          const n = fn(s, you.id, c.id);
                          if (n !== s) return n;
                        }
                        return s;
                      })
                  : undefined
            }
            onPlayerTarget={
              casting && legalPlayerIds.has(you.id) ? () => onPlayerTarget(you.id) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function LibraryLookChoice({
  label,
  cardIds,
  state,
  onDone,
}: {
  label: string;
  cardIds: string[];
  state: GameState;
  onDone: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const ownerId = state.pendingChoices.find(
    (c) => c.type === 'scry' || c.type === 'surveil' || c.type === 'lookAtTop',
  )?.playerId;
  const you = state.players.find((p) => p.id === ownerId);
  const cards = cardIds
    .map((id) => you?.library.find((c) => c.id === id))
    .filter(Boolean) as CardInstance[];

  return (
    <div className="text-sm space-y-2">
      <div>{label}</div>
      <div className="flex flex-wrap gap-1">
        {cards.map((c) => {
          const on = picked.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`text-xs px-2 py-1 rounded border ${
                on ? 'border-amber-400 bg-amber-900' : 'border-zinc-600'
              }`}
              onClick={() =>
                setPicked((prev) => {
                  const n = new Set(prev);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
            >
              {c.card.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
        onClick={() => onDone([...picked])}
      >
        Confirm
      </button>
    </div>
  );
}

function SacrificeChoice({
  amount,
  permanents,
  onDone,
}: {
  amount: number;
  permanents: CardInstance[];
  onDone: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  return (
    <div className="text-sm space-y-2">
      <div>
        Sacrifice {amount} — vyber permanent ({picked.size}/{amount})
      </div>
      <div className="flex flex-wrap gap-1">
        {permanents.map((c) => {
          const on = picked.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`text-xs px-2 py-1 rounded border ${
                on ? 'border-amber-400 bg-amber-900' : 'border-zinc-600'
              }`}
              onClick={() =>
                setPicked((prev) => {
                  const n = new Set(prev);
                  if (n.has(c.id)) n.delete(c.id);
                  else if (n.size < amount) n.add(c.id);
                  return n;
                })
              }
            >
              {c.card.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={picked.size < Math.min(amount, permanents.length)}
        className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded disabled:opacity-40"
        onClick={() => onDone([...picked])}
      >
        Confirm sac
      </button>
    </div>
  );
}

function DiscardChoice({
  amount,
  hand,
  onDone,
}: {
  amount: number;
  hand: CardInstance[];
  onDone: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  return (
    <div className="text-sm space-y-2">
      <div>
        Discard {amount} — vyber karty ({picked.size}/{amount})
      </div>
      <div className="flex flex-wrap gap-1">
        {hand.map((c) => {
          const on = picked.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`text-xs px-2 py-1 rounded border ${
                on ? 'border-amber-400 bg-amber-900' : 'border-zinc-600'
              }`}
              onClick={() =>
                setPicked((prev) => {
                  const n = new Set(prev);
                  if (n.has(c.id)) n.delete(c.id);
                  else if (n.size < amount) n.add(c.id);
                  return n;
                })
              }
            >
              {c.card.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={picked.size < Math.min(amount, hand.length)}
        className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded disabled:opacity-40"
        onClick={() => onDone([...picked])}
      >
        Confirm discard
      </button>
    </div>
  );
}
