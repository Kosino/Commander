'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CardInstance,
  GameState,
  TargetRef,
  activateManaAbility,
  applyGraveCastOption,
  applyHandCastOption,
  autoTapForPendingCast,
  beginActivate,
  beginCastCommander,
  cancelCast,
  canPayMana,
  confirmAdditionalCost,
  confirmCastPay,
  dropBlockerOnAttacker,
  formatManaCost,
  listGraveCastOptions,
  listHandCastOptions,
  pendingSpellManaCost,
  setAttackerDefendTarget,
  setHybridPick,
  setPreferPhyrexianLife,
  toggleCostDiscard,
  toggleCostSacrifice,
  type GraveCastOption,
  type HandCastOption,
  type ManaColor,
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
  resolveDevourChoice,
  resolveOptionalEffect,
  resolveBattleProtector,
  setDefendBattle,
  legalBattleTargets,
  isBattle,
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
  confirmEscapeExile,
  isCreature,
  toggleDraftAttacker,
  toggleDraftBlocker,
  isPlaneswalker,
  parseLoyaltyAbilities,
  ensurePlayerClocks,
  getClock,
  toggleStop,
  setFullControl,
  armHoldPriority,
  clearHoldPriority,
  setPassTurnMode,
  drainAutoPriority,
  onPlayerPassed,
  onPlayerTookAction,
  primaryPrompt,
  type StopKey,
} from '../../../lib/engine';
import { loadPlayDeck } from '../../../lib/playSession';
import { AltCastModal } from '../../../components/play/AltCastModal';
import { ArenaTable } from '../../../components/play/ArenaTable';
import { CombatPromptPanel } from '../../../components/play/CombatPromptPanel';
import { ManaGems } from '../../../components/play/ManaGems';
import { MulliganBottom, MulliganDecide } from '../../../components/play/MulliganPanel';

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
  /** Placeholder until client boot — avoids SSR hydrate mismatch from Math.random shuffle. */
  const [state, setState] = useState<GameState>(() =>
    ensurePlayerClocks(startGame(false).state),
  );
  const [source, setSource] = useState<'deck' | 'demo'>('demo');
  const [mounted, setMounted] = useState(false);
  const [altCast, setAltCast] = useState<{
    cardId: string;
    cardName: string;
    options: { id: string; label: string; hint?: string }[];
    zone: 'hand' | 'gy';
  } | null>(null);

  useEffect(() => {
    const preferDeck = new URLSearchParams(window.location.search).get('src') === 'deck';
    const boot = startGame(preferDeck);
    setSource(boot.source);
    setState(ensurePlayerClocks(boot.state));
    setMounted(true);
  }, []);

  // Demo AI (P2) + drain empty priority windows (Arena fast-forward)
  useEffect(() => {
    if (!mounted) return;
    const t = window.setTimeout(() => {
      setState((s) => {
        let next = ensurePlayerClocks(s);
        const you = next.players[0];
        if (!you) return next;
        // Cancel pass-turn when opponent put something on stack
        const clock = getClock(next, you.id);
        if (clock.passTurnMode === 'untilResponse') {
          const top = next.stack[next.stack.length - 1];
          if (top && top.controller !== you.id) {
            next = setPassTurnMode(next, you.id, 'off');
          }
        }
        return drainAutoPriority(next, you.id, runDemoAi);
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [state, mounted]);

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
    if (state?.pendingCast?.phase === 'delve' || state?.pendingCast?.phase === 'escapeExile') {
      const p = state.players.find((x) => x.id === state.pendingCast!.playerId);
      for (const c of p?.graveyard || []) {
        if (c.id !== state.pendingCast.cardId) s.add(c.id);
      }
      for (const id of state.pendingCast.delveExiled || []) s.add(id);
      for (const id of state.pendingCast.escapeExiled || []) s.add(id);
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
      if (s.pendingCast?.phase === 'additionalCost' && s.pendingCast.playerId === playerId) {
        return toggleCostDiscard(s, card.id);
      }
      if (s.players[s.priorityPlayerIndex]?.id !== playerId) return s;
      if (
        s.combat?.mode === 'declareAttackers' ||
        s.combat?.mode === 'declareBlockers' ||
        s.combat?.mode === 'assignDamage'
      ) {
        return s;
      }
      if (card.card.type_line.includes('Land')) {
        queueMicrotask(() => setAltCast(null));
        return afterAct(playLand(s, playerId, card.id));
      }
      const options = listHandCastOptions(s, playerId, card.id);
      if (options.length === 0) return s;
      if (options.length > 1) {
        queueMicrotask(() =>
          setAltCast({
            cardId: card.id,
            cardName: card.card.name,
            options,
            zone: 'hand',
          }),
        );
        return s;
      }
      queueMicrotask(() => setAltCast(null));
      return afterAct(applyHandCastOption(s, playerId, card.id, options[0].id));
    });
  };

  const onCommandCard = (playerId: string, card: CardInstance) => {
    setState((s) => {
      if (s.players[s.priorityPlayerIndex]?.id !== playerId) return s;
      if (
        s.combat?.mode === 'declareAttackers' ||
        s.combat?.mode === 'declareBlockers' ||
        s.combat?.mode === 'assignDamage'
      ) {
        return s;
      }
      return afterAct(beginCastCommander(s, playerId, card.id));
    });
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
        if (s.pendingCast.phase === 'additionalCost') {
          return toggleCostSacrifice(s, card.id);
        }
        if (
          s.pendingCast.phase === 'convoke' ||
          s.pendingCast.phase === 'improvise' ||
          s.pendingCast.phase === 'delve' ||
          s.pendingCast.phase === 'escapeExile'
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

  const youId = you?.id || 'p1';

  const handlePrimary = () => {
    setState((s) => {
      const prompt = primaryPrompt(s, youId);
      if (prompt.kind === 'casting' && s.pendingCast?.phase === 'additionalCost' && prompt.enabled) {
        return confirmAdditionalCost(s);
      }
      if (prompt.kind === 'casting' && s.pendingCast?.phase === 'pay' && prompt.enabled) {
        return onPlayerTookAction(confirmCastPay(s), youId);
      }
      if (prompt.kind === 'confirmAttackers') {
        return givePriority(confirmAttackers(s), s.priorityPlayerIndex);
      }
      if (prompt.kind === 'confirmBlockers') {
        return givePriority(confirmBlockers(s), s.priorityPlayerIndex);
      }
      if (prompt.kind === 'confirmDamage') {
        return confirmDamageAssign(s);
      }
      if (prompt.enabled) {
        return onPlayerPassed(passPriority(s), youId);
      }
      return s;
    });
  };

  const clockControls = {
    onToggleStop: (key: StopKey) => setState((s) => toggleStop(s, youId, key)),
    onToggleFullControl: () =>
      setState((s) => {
        const on = !getClock(s, youId).fullControl;
        return setFullControl(s, youId, on);
      }),
    onArmHold: () =>
      setState((s) =>
        getClock(s, youId).holdPriorityOnce
          ? clearHoldPriority(s, youId)
          : armHoldPriority(s, youId),
      ),
    onPassTurn: (mode: 'untilResponse' | 'unconditional' | 'off') =>
      setState((s) => setPassTurnMode(s, youId, mode)),
    onPrimary: handlePrimary,
  };

  /** Wrap casts so pass-turn cancels and hold stays until Pass. */
  const afterAct = (s: GameState) => onPlayerTookAction(s, youId);

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

  if (!mounted) {
    return (
      <div className="min-h-dvh grid place-items-center bg-[#0a1610] text-sm text-zinc-400">
        Loading table…
      </div>
    );
  }

  return (
    <>
      {altCast && (
        <AltCastModal
          cardName={altCast.cardName}
          options={altCast.options}
          onPick={(id) => {
            const cardId = altCast.cardId;
            const zone = altCast.zone;
            setAltCast(null);
            setState((s) =>
              afterAct(
                zone === 'gy'
                  ? applyGraveCastOption(s, youId, cardId, id as GraveCastOption['id'])
                  : applyHandCastOption(s, youId, cardId, id as HandCastOption['id']),
              ),
            );
          }}
          onCancel={() => setAltCast(null)}
        />
      )}
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
      </div>

      <ArenaTable
        state={state}
        youId={youId}
        sourceLabel={source === 'deck' ? 'deck' : 'demo'}
        highlightIds={highlightIds}
        highlightPlayers={highlightPlayers}
        highlightStackIds={legalStackIds}
        casting={casting || declaring}
        onPass={() => setState((s) => onPlayerPassed(passPriority(s), youId))}
        clockControls={clockControls}
        onPlayerLifeClick={(pid) => onPlayerTarget(pid)}
        onBattlefieldCard={(pid, c) => onBattlefieldCard(pid, c)}
        onHandCard={(c) => you && onHandCard(you.id, c)}
        onCommandCard={(c) => you && onCommandCard(you.id, c)}
        onBlockerDropOnAttacker={(attackerId, blockerId) =>
          setState((s) => dropBlockerOnAttacker(s, attackerId, blockerId))
        }
        onAttackerDropOnDefend={(attackerId, target) =>
          setState((s) =>
            setAttackerDefendTarget(s, attackerId, {
              defendingPlayerId: target.playerId,
              defendingPlaneswalkerId: target.planeswalkerId,
              defendingBattleId: target.battleId,
            }),
          )
        }
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
              ? (c) => {
                  const options = listGraveCastOptions(state, you.id, c.id);
                  if (options.length === 0) return;
                  if (options.length > 1) {
                    setAltCast({
                      cardId: c.id,
                      cardName: c.card.name,
                      options,
                      zone: 'gy',
                    });
                    return;
                  }
                  setAltCast(null);
                  setState((s) =>
                    afterAct(applyGraveCastOption(s, you.id, c.id, options[0].id)),
                  );
                }
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
              state.pendingCast.phase === 'delve' ||
              state.pendingCast.phase === 'escapeExile') && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-fuchsia-100/80 text-xs">
                  {state.pendingCast.phase === 'convoke'
                    ? `Convoke — tap creatures (${state.pendingCast.convokeTapped?.length || 0})`
                    : state.pendingCast.phase === 'improvise'
                      ? `Improvise — tap artifacts (${state.pendingCast.improviseTapped?.length || 0})`
                      : state.pendingCast.phase === 'escapeExile'
                        ? `Escape — exile ${state.pendingCast.escapeNeeded || 0} from GY (${state.pendingCast.escapeExiled?.length || 0})`
                        : `Delve — exile from GY (${state.pendingCast.delveExiled?.length || 0})`}
                </span>
                <button
                  type="button"
                  className="text-xs bg-fuchsia-800 hover:bg-fuchsia-700 px-2 py-1 rounded"
                  onClick={() =>
                    setState((s) =>
                      s.pendingCast?.phase === 'escapeExile'
                        ? confirmEscapeExile(s)
                        : confirmConvokeDelve(s),
                    )
                  }
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
                  Highlight = legal target. Tap lands for mana, or Auto-tap.
                </div>
              </>
            )}
            {state.pendingCast.phase === 'additionalCost' && (
              <div className="text-sm space-y-1">
                <div className="font-semibold text-fuchsia-100">Additional cost</div>
                {(state.pendingCast.costDiscardNeed || 0) > 0 && (
                  <div className="text-xs text-fuchsia-200/80">
                    Discard {state.pendingCast.costDiscardFilter === 'land' ? 'land' : 'card'}
                    {(state.pendingCast.costDiscardNeed || 0) > 1
                      ? `s (${state.pendingCast.costDiscardIds?.length || 0}/${state.pendingCast.costDiscardNeed})`
                      : ` (${state.pendingCast.costDiscardIds?.length || 0}/1)`}
                    — click hand
                  </div>
                )}
                {(state.pendingCast.costSacrificeNeed || 0) > 0 && (
                  <div className="text-xs text-fuchsia-200/80">
                    Sacrifice creature ({state.pendingCast.costSacrificeIds?.length || 0}/
                    {state.pendingCast.costSacrificeNeed}) — click battlefield
                  </div>
                )}
                <button
                  type="button"
                  className="play-cast-mana__btn play-cast-mana__btn--go"
                  disabled={
                    (state.pendingCast.costDiscardIds?.length || 0) <
                      (state.pendingCast.costDiscardNeed || 0) ||
                    (state.pendingCast.costSacrificeIds?.length || 0) <
                      (state.pendingCast.costSacrificeNeed || 0)
                  }
                  onClick={() => setState((s) => confirmAdditionalCost(s))}
                >
                  Confirm cost
                </button>
              </div>
            )}
            {(() => {
              const cost = pendingSpellManaCost(state);
              if (!cost || state.pendingCast?.phase === 'additionalCost') return null;
              const hybrids = cost.hybrids || [];
              const picks = state.pendingCast?.hybridPicks || [];
              const hybridsReady =
                hybrids.length === 0 ||
                (picks.length === hybrids.length &&
                  hybrids.every((h, i) => picks[i] === h.a || picks[i] === h.b));
              const can =
                !!you &&
                hybridsReady &&
                canPayMana(you.manaPool, cost, you.life, {
                  hybridPicks: hybrids.length ? picks : undefined,
                  preferPhyrexianLife: !!state.pendingCast?.preferPhyrexianLife,
                });
              const phy = (cost.phyrexian || []).length > 0;
              return (
                <div className="play-cast-mana">
                  <span className="inline-flex items-center gap-1">
                    Cost <ManaGems cost={cost} />
                    <span className="text-fuchsia-300/50">({formatManaCost(cost)})</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Pool <ManaGems pool={you?.manaPool} />
                  </span>
                  {hybrids.map((h, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 text-xs">
                      {'{'}
                      {h.a}/{h.b}
                      {'}'}
                      <button
                        type="button"
                        className={`play-cast-mana__btn ${picks[i] === h.a ? 'play-cast-mana__btn--go' : ''}`}
                        onClick={() => setState((s) => setHybridPick(s, i, h.a as ManaColor))}
                      >
                        {h.a}
                      </button>
                      <button
                        type="button"
                        className={`play-cast-mana__btn ${picks[i] === h.b ? 'play-cast-mana__btn--go' : ''}`}
                        onClick={() => setState((s) => setHybridPick(s, i, h.b as ManaColor))}
                      >
                        {h.b}
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="play-cast-mana__btn"
                    onClick={() => setState((s) => autoTapForPendingCast(s))}
                  >
                    Auto-tap
                  </button>
                  {phy && (
                    <button
                      type="button"
                      className={`play-cast-mana__btn ${
                        state.pendingCast?.preferPhyrexianLife ? 'play-cast-mana__btn--go' : ''
                      }`}
                      onClick={() =>
                        setState((s) =>
                          setPreferPhyrexianLife(s, !s.pendingCast?.preferPhyrexianLife),
                        )
                      }
                    >
                      Phyrexian: {state.pendingCast?.preferPhyrexianLife ? 'life' : 'mana'}
                    </button>
                  )}
                  {state.pendingCast?.phase === 'pay' && (
                    <button
                      type="button"
                      className="play-cast-mana__btn play-cast-mana__btn--go"
                      disabled={!can}
                      onClick={() => setState((s) => afterAct(confirmCastPay(s)))}
                    >
                      Pay &amp; Cast
                    </button>
                  )}
                </div>
              );
            })()}
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

      {state.combat?.mode === 'declareAttackers' &&
        state.combat.declaringPlayerId === youId && (
        <div className="mb-4 p-3 bg-orange-950 border border-orange-700 rounded flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm space-y-1">
            <div className="font-semibold text-orange-200">Declare attackers</div>
            <div className="text-orange-100/80 text-xs">
              Click creatures to attack · draft {state.combat.draftAttackerIds.length || 0} ·
              confirm with Pass button
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-orange-300/80">Attack:</span>
              {state.players
                .filter((p) => !p.hasLost && p.id !== state.players[state.activePlayerIndex]?.id)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setState((s) => setDefendPlayer(s, p.id))}
                    className={`px-2 py-0.5 rounded border ${
                      state.combat?.draftDefendPlayerId === p.id &&
                      !state.combat?.draftDefendPlaneswalkerId &&
                      !state.combat?.draftDefendBattleId
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
              {legalBattleTargets(state).map((bid) => {
                const f = state.players
                  .flatMap((p) => p.battlefield)
                  .find((c) => c.id === bid);
                if (!f || !isBattle(f)) return null;
                return (
                  <button
                    key={bid}
                    type="button"
                    onClick={() => setState((s) => setDefendBattle(s, bid))}
                    className={`px-2 py-0.5 rounded border ${
                      state.combat?.draftDefendBattleId === bid
                        ? 'border-orange-400 bg-orange-900'
                        : 'border-zinc-600'
                    }`}
                  >
                    Battle: {f.card.name} (def {f.counters['defense'] ?? f.card.defense ?? '?'})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <CombatPromptPanel
        state={state}
        youId={youId}
        primaryHandlesConfirm
        onMoveBlocker={(attackerId, blockerId, direction) =>
          setState((s) => moveDraftBlocker(s, attackerId, blockerId, direction))
        }
        onConfirmBlockers={finishBlockers}
        onSetDamage={(attackerId, target, amount) =>
          setState((s) => setDamageAssignAmount(s, attackerId, target, amount))
        }
        onConfirmDamage={() => setState((s) => confirmDamageAssign(s))}
      />

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
            if (choice.type === 'devour') {
              const p = state.players.find((x) => x.id === choice.playerId);
              const creatures = (p?.battlefield || []).filter(
                (c) => isCreature(c) && c.id !== choice.permanentId,
              );
              return (
                <SacrificeChoice
                  key={i}
                  amount={creatures.length}
                  label={`Devour ${choice.devourN} — sac any (0–${creatures.length})`}
                  allowPartial
                  permanents={creatures}
                  onDone={(ids) => setState((s) => resolveDevourChoice(s, ids))}
                />
              );
            }
            if (choice.type === 'optionalEffect') {
              return (
                <div key={i} className="text-sm space-y-2">
                  <div>You may {choice.label}?</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                      onClick={() => setState((s) => resolveOptionalEffect(s, true))}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                      onClick={() => setState((s) => resolveOptionalEffect(s, false))}
                    >
                      No
                    </button>
                  </div>
                </div>
              );
            }
            if (choice.type === 'chooseBattleProtector') {
              return (
                <div key={i} className="text-sm space-y-2">
                  <div>Choose battle protector</div>
                  <div className="flex gap-2 flex-wrap">
                    {choice.opponentIds.map((oid) => {
                      const name =
                        state.players.find((p) => p.id === oid)?.name || oid;
                      return (
                        <button
                          key={oid}
                          type="button"
                          className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                          onClick={() =>
                            setState((s) => resolveBattleProtector(s, oid))
                          }
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (choice.type === 'mulligan') {
              const p = state.players.find((x) => x.id === choice.playerId);
              if (choice.playerId !== state.players[0]?.id) {
                return (
                  <div key={i} className="text-sm text-zinc-400">
                    Mulligan — čeká soupeř…
                  </div>
                );
              }
              if (choice.phase === 'decide') {
                return (
                  <MulliganDecide
                    key={i}
                    mulligansTaken={choice.mulligansTaken}
                    hand={p?.hand || []}
                    onKeep={() => setState((s) => resolveMulliganKeep(s, choice.playerId))}
                    onMulligan={() => setState((s) => resolveMulliganTake(s, choice.playerId))}
                  />
                );
              }
              return (
                <MulliganBottom
                  key={i}
                  need={choice.mulligansTaken}
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
  label,
  allowPartial,
}: {
  amount: number;
  permanents: CardInstance[];
  onDone: (ids: string[]) => void;
  label?: string;
  allowPartial?: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const need = Math.min(amount, permanents.length);
  return (
    <div className="text-sm space-y-2">
      <div>
        {label || `Sacrifice ${amount} — vyber permanent (${picked.size}/${need})`}
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
        disabled={allowPartial ? false : picked.size < need}
        className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded disabled:opacity-40"
        onClick={() => onDone([...picked])}
      >
        Confirm
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
