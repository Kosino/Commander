'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CardInstance,
  GameState,
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
  beginLoyalty,
  cancelLoyalty,
  beginActivatedIndex,
  cancelActivated,
  resolveTriggerOrder,
  parseActivatedAbilities,
  type WaitingTrigger,
  confirmAttackers,
  confirmBlockers,
  confirmDamageAssign,
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
  resolveMulliganBottom,
  resolveMulliganKeep,
  resolveMulliganTake,
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
  setDamageAssignAmount,
  setDefendPlayer,
  setDefendPlaneswalker,
  confirmConvokeDelve,
  toggleDraftAttacker,
  toggleDraftBlocker,
  isPlaneswalker,
  parseLoyaltyAbilities,
  effectivePower,
} from '../../../lib/engine';
import { loadPlayDeck } from '../../../lib/playSession';
import { ArenaTable } from '../../../components/play/ArenaTable';

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

export default function PlayPage() {
  const [state, setState] = useState<GameState>(() => startGame(false).state);
  const [source, setSource] = useState<'deck' | 'demo'>('demo');
  const [autoPass, setAutoPass] = useState(false);

  useEffect(() => {
    const preferDeck = new URLSearchParams(window.location.search).get('src') === 'deck';
    if (!preferDeck) return;
    const boot = startGame(true);
    setSource(boot.source);
    setState(boot.state);
  }, []);

  // Demo AI (P2) + optional auto-pass when you have priority and nothing pending
  useEffect(() => {
    const t = window.setTimeout(() => {
      setState((s) => {
        const next = runDemoAi(s);
        if (next !== s) return next;
        if (!autoPass) return s;
        const you = s.players[0];
        if (!you || s.players[s.priorityPlayerIndex]?.id !== you.id) return s;
        if (s.pendingCast || s.pendingLoyalty || s.pendingActivated) return s;
        if (s.pendingChoices.length > 0) return s;
        if (isCombatDeclaring(s)) return s;
        return passPriority(s);
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [state, autoPass]);

  const you = state.players[0];
  const casting =
    !!state.pendingCast || !!state.pendingLoyalty || !!state.pendingActivated;
  const declaring = isCombatDeclaring(state);

  const legal = useMemo(() => {
    if (!state.pendingCast) return [] as TargetRef[];
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

  const slotPrompt = state.pendingCast
    ? state.pendingCast.slots[state.pendingCast.currentSlot]?.prompt
    : null;

  const highlightIds = new Set([...legalPermIds, ...combatHighlight]);
  const highlightPlayers = legalPlayerIds;

  return (
    <>
      <div className="fixed top-2 right-2 z-30 flex flex-wrap gap-1.5 text-[0.65rem]">
        <Link href="/" className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600">
          Home
        </Link>
        <Link href="/play" className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600">
          Modes
        </Link>
        <Link href="/builder" className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600">
          Builder
        </Link>
        <Link href="/play/online" className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600">
          Friend
        </Link>
        <button type="button" onClick={() => restart('demo')} className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600">
          Demo
        </button>
        <button type="button" onClick={() => restart('deck')} className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600">
          Deck
        </button>
        <label className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={autoPass}
            onChange={(e) => setAutoPass(e.target.checked)}
          />
          Auto-pass
        </label>
      </div>

      <ArenaTable
        state={state}
        youId={you?.id || 'p1'}
        sourceLabel={source === 'deck' ? 'deck' : 'demo'}
        highlightIds={highlightIds}
        highlightPlayers={highlightPlayers}
        highlightStackIds={legalStackIds}
        casting={casting || declaring}
        onPass={() => setState((s) => passPriority(s))}
        onPlayerLifeClick={(pid) => onPlayerTarget(pid)}
        onBattlefieldCard={(pid, c) => onBattlefieldCard(pid, c)}
        onHandCard={(c) => you && onHandCard(you.id, c)}
        onCommandCard={(c) => you && onCommandCard(you.id, c)}
        onStackObject={(stackId) =>
          setState((s) => selectCastTarget(s, { kind: 'stack', stackId }))
        }
        onGraveyardCard={
          casting
            ? (c) =>
                setState((s) =>
                  selectCastTarget(s, { kind: 'permanent', permanentId: c.id }),
                )
            : you && state.priorityPlayerIndex === 0 && !declaring
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
        promptSlot={
          <>
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
                <span className="text-fuchsia-400 font-normal"> Â· {state.pendingCast.phase}</span>
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
                    ? `Convoke â€” tap creatures (${state.pendingCast.convokeTapped?.length || 0})`
                    : state.pendingCast.phase === 'improvise'
                      ? `Improvise â€” tap artifacts (${state.pendingCast.improviseTapped?.length || 0})`
                      : `Delve â€” exile from GY (${state.pendingCast.delveExiled?.length || 0})`}
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
                      Â· slot {state.pendingCast.currentSlot + 1}/{state.pendingCast.slots.length}
                    </>
                  )}
                </div>
                <div className="text-xs text-fuchsia-300/70">
                  FialovÃ½ highlight = legÃ¡lnÃ­ target. MÅ¯Å¾eÅ¡ tapnout land na manu.
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
              <span className="text-orange-300/80">Ãštok na:</span>
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
              Klikni ÃºtoÄnÃ­ka (focus) pak blockery â€” poÅ™adÃ­ = damage assignment. Menace = â‰¥2
              blockery (jinak se pÅ™i confirm zruÅ¡Ã­). Flying jen flying/reach.
            </div>
            <ul className="text-xs space-y-1">
              {state.combat.attackers.map((a) => (
                <li key={a.attackerId} className="space-y-0.5">
                  <div>Atk {a.attackerId.slice(-4)} â† blockers (poÅ™adÃ­ = dmg):</div>
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
                          â†‘
                        </button>
                        <button
                          type="button"
                          className="text-[10px] text-zinc-400 hover:text-white"
                          onClick={() =>
                            setState((s) => moveDraftBlocker(s, a.attackerId, b, 1))
                          }
                        >
                          â†“
                        </button>
                      </span>
                    ))}
                    {(state.combat?.draftBlocks[a.attackerId] || []).length === 0 && 'â€”'}
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

      {state.combat?.mode === 'assignDamage' && (
        <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-red-200 text-sm">
              Assign combat damage ({state.combat.assignWave || 'normal'})
            </div>
            <button
              type="button"
              className="text-sm bg-red-700 hover:bg-red-600 px-3 py-1.5 rounded"
              onClick={() => setState((s) => confirmDamageAssign(s))}
            >
              Confirm damage
            </button>
          </div>
          {Object.entries(state.combat.damageAssign || {}).map(([atkId, entry]) => {
            const atk = state.combat?.attackers.find((a) => a.attackerId === atkId);
            const af = state.players.flatMap((p) => p.battlefield).find((c) => c.id === atkId);
            const power = af ? effectivePower(af, state) : 0;
            const sum =
              Object.values(entry.toBlockers).reduce((a, b) => a + b, 0) + entry.toPlayer;
            return (
              <div key={atkId} className="text-xs space-y-1 border-t border-red-900/60 pt-2">
                <div className="text-red-100">
                  {af?.card.name || atkId.slice(-6)} · power {power} · assigned {sum}
                  {sum !== power ? ' (!)' : ''}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(atk?.blockers || []).map((bid) => {
                    const bl = state.players
                      .flatMap((p) => p.battlefield)
                      .find((c) => c.id === bid);
                    return (
                      <label key={bid} className="flex items-center gap-1">
                        <span>{bl?.card.name || bid.slice(-4)}</span>
                        <input
                          type="number"
                          min={0}
                          className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1"
                          value={entry.toBlockers[bid] || 0}
                          onChange={(e) =>
                            setState((s) =>
                              setDamageAssignAmount(
                                s,
                                atkId,
                                { kind: 'blocker', blockerId: bid },
                                parseInt(e.target.value, 10) || 0,
                              ),
                            )
                          }
                        />
                      </label>
                    );
                  })}
                  <label className="flex items-center gap-1">
                    <span>player/PW</span>
                    <input
                      type="number"
                      min={0}
                      className="w-12 bg-zinc-900 border border-zinc-700 rounded px-1"
                      value={entry.toPlayer}
                      onChange={(e) =>
                        setState((s) =>
                          setDamageAssignAmount(
                            s,
                            atkId,
                            { kind: 'player' },
                            parseInt(e.target.value, 10) || 0,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {state.pendingLoyalty && state.pendingLoyalty.playerId === state.players[0]?.id && (
        <div className="mb-4 p-3 bg-sky-950 border border-sky-800 rounded space-y-2">
          <div className="flex justify-between gap-2">
            <div className="font-semibold text-sky-200 text-sm">Planeswalker loyalty</div>
            <button
              type="button"
              className="text-xs bg-zinc-800 px-2 py-1 rounded"
              onClick={() => setState((s) => cancelLoyalty(s))}
            >
              Cancel
            </button>
          </div>
          {(() => {
            const id = state.pendingLoyalty!.permanentId;
            const perm = state.players.flatMap((p) => p.battlefield).find((c) => c.id === id);
            const abs = parseLoyaltyAbilities(perm?.card.oracle_text);
            const loy = perm?.counters['loyalty'] ?? 0;
            return (
              <div className="flex flex-wrap gap-2">
                {abs.map((ab, i) => {
                  const cost = ab.loyaltyCost;
                  const label = `${cost >= 0 ? '+' : ''}${cost}`;
                  const illegal = cost < 0 && loy + cost < 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={illegal}
                      className="text-xs bg-sky-800 hover:bg-sky-700 disabled:opacity-40 px-2 py-1 rounded"
                      title={ab.text}
                      onClick={() =>
                        setState((s) =>
                          beginLoyalty(s, state.pendingLoyalty!.playerId, id, i),
                        )
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {state.pendingActivated && state.pendingActivated.playerId === state.players[0]?.id && (
        <div className="mb-4 p-3 bg-emerald-950 border border-emerald-800 rounded space-y-2">
          <div className="flex justify-between gap-2">
            <div className="font-semibold text-emerald-200 text-sm">Activated ability</div>
            <button
              type="button"
              className="text-xs bg-zinc-800 px-2 py-1 rounded"
              onClick={() => setState((s) => cancelActivated(s))}
            >
              Cancel
            </button>
          </div>
          {(() => {
            const id = state.pendingActivated!.permanentId;
            const perm = state.players.flatMap((p) => p.battlefield).find((c) => c.id === id);
            const abs = parseActivatedAbilities(perm?.card.oracle_text);
            return (
              <div className="flex flex-wrap gap-2">
                {state.pendingActivated!.options.map((idx) => {
                  const ab = abs[idx];
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="text-xs bg-emerald-800 hover:bg-emerald-700 px-2 py-1 rounded"
                      title={ab?.costLabel}
                      onClick={() =>
                        setState((s) =>
                          beginActivatedIndex(
                            s,
                            state.pendingActivated!.playerId,
                            id,
                            idx,
                          ),
                        )
                      }
                    >
                      {ab?.costLabel || `#${idx}`}
                    </button>
                  );
                })}
              </div>
            );
          })()}
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
                    Legend rule â€” {choice.name} (hrÃ¡Ä {choice.playerId}): nech jedno
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
                    Ward {'{' + choice.cost + '}'} â€” zaplatit, nebo spell/ability zruÅ¡it?
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
                      ZruÅ¡it cast
                    </button>
                  </div>
                </div>
              );
            }
            if (choice.type === 'scry') {
              return (
                <LibraryLookChoice
                  key={i}
                  label="Scry â€” klikni karty na spodek library"
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
                  label="Surveil â€” klikni karty do graveyardu"
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
                  label="Look at top â€” OK po prohlÃ©dnutÃ­"
                  cardIds={choice.cardIds}
                  state={state}
                  onDone={() => setState((s) => resolveLookAtTopChoice(s))}
                />
              );
            }
            if (choice.type === 'fabricate') {
              return (
                <div key={i} className="text-sm space-y-1">
                  <div>Fabricate {choice.amount} â€” tokeny nebo +1/+1?</div>
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
                  <div>Riot â€” haste nebo +1/+1?</div>
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
            if (choice.type === 'mulligan') {
              const p = state.players.find((x) => x.id === choice.playerId);
              if (choice.playerId !== state.players[0]?.id) {
                return (
                  <div key={i} className="text-sm text-zinc-400">
                    Mulligan — ceka souper…
                  </div>
                );
              }
              if (choice.phase === 'decide') {
                return (
                  <div key={i} className="text-sm space-y-2">
                    <div className="font-semibold text-amber-200">
                      London mulligan ({choice.mulligansTaken} taken)
                    </div>
                    <div className="text-xs text-zinc-400">
                      Ruka: {p?.hand.map((c) => c.card.name).join(', ') || '—'}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                        onClick={() => setState((s) => resolveMulliganKeep(s, choice.playerId))}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                        onClick={() => setState((s) => resolveMulliganTake(s, choice.playerId))}
                      >
                        Mulligan
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <DiscardChoice
                  key={i}
                  amount={choice.mulligansTaken}
                  hand={p?.hand || []}
                  onDone={(ids) =>
                    setState((s) => resolveMulliganBottom(s, choice.playerId, ids))
                  }
                />
              );
            }
            if (choice.type === 'orderTriggers') {
              if (choice.playerId !== state.players[0]?.id) {
                return (
                  <div key={i} className="text-sm text-zinc-400">
                    Trigger order — čeká soupeř…
                  </div>
                );
              }
              return (
                <TriggerOrderChoice
                  key={i}
                  triggerIds={choice.triggerIds}
                  waiting={state.waitingTriggers || []}
                  onDone={(ids) => setState((s) => resolveTriggerOrder(s, ids))}
                />
              );
            }
            if (choice.type !== 'commanderToCommandZone') return null;
            return (
              <div key={i} className="text-sm space-y-1">
                <div>
                  Commander v {choice.from} — dat do command zone? (903.9)
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

          </>
        }
      />
    </>
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

function TriggerOrderChoice({
  triggerIds,
  waiting,
  onDone,
}: {
  triggerIds: string[];
  waiting: WaitingTrigger[];
  onDone: (ids: string[]) => void;
}) {
  const [order, setOrder] = useState<string[]>(() => [...triggerIds]);
  const label = (id: string) => waiting.find((t) => t.id === id)?.name || id.slice(-6);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    setOrder((prev) => {
      const n = [...prev];
      const tmp = n[i];
      n[i] = n[j];
      n[j] = tmp;
      return n;
    });
  };
  return (
    <div className="text-sm space-y-2">
      <div className="font-semibold text-amber-200">
        Trigger order (603.3b) — first listed resolves first
      </div>
      <ul className="space-y-1">
        {order.map((id, i) => (
          <li key={id} className="flex items-center gap-2">
            <span className="flex-1 text-xs">{label(id)}</span>
            <button
              type="button"
              className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded disabled:opacity-30"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded disabled:opacity-30"
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
        onClick={() => onDone(order)}
      >
        Confirm order
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
        Sacrifice {amount} â€” vyber permanent ({picked.size}/{amount})
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
        Discard {amount} â€” vyber karty ({picked.size}/{amount})
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
