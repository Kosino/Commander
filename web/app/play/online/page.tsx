'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { StoredDeck } from '../../../lib/engine/fromDeck';
import { isValidStoredDeck } from '../../../lib/engine/fromDeck';
import type { GameState, MaxSeats, RoomAction, SeatId } from '../../../lib/onlineTypes';
import { ALL_SEATS } from '../../../lib/onlineTypes';
import { loadPlayDeck } from '../../../lib/playSession';
import { ArenaTable } from '../../../components/play/ArenaTable';
import {
  isCombatDeclaring,
  legalAttackers,
  legalBlockers,
  listLegalTargets,
  parseLoyaltyAbilities,
  parseActivatedAbilities,
  type CardInstance,
  type TargetRef,
} from '../../../lib/engine';

type Session = {
  roomId: string;
  seat: SeatId;
  seatToken: string;
  names: Partial<Record<SeatId, string>>;
};

type View = {
  version: number;
  maxSeats?: MaxSeats;
  names: Partial<Record<SeatId, string>>;
  joined: Partial<Record<SeatId, boolean>>;
  lastSeen?: Partial<Record<SeatId, number>>;
  you: SeatId;
  deckHint?: Partial<Record<SeatId, string>>;
  state: GameState | null;
};

type DeckChoice = 'session' | 'demo' | 'file';

export default function OnlinePlayPage() {
  const [name, setName] = useState('Player');
  const [joinCode, setJoinCode] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deckChoice, setDeckChoice] = useState<DeckChoice>('session');
  const [fileDeck, setFileDeck] = useState<StoredDeck | null>(null);
  const [sessionDeck, setSessionDeck] = useState<StoredDeck | null>(null);
  const [maxSeats] = useState<MaxSeats>(2);

  useEffect(() => {
    setSessionDeck(loadPlayDeck());
  }, []);

  const resolveDeckPayload = (): StoredDeck | 'demo' | null => {
    if (deckChoice === 'demo') return 'demo';
    if (deckChoice === 'session') {
      if (!sessionDeck) {
        setError('V session není deck — nejdřív „Hrát vs AI“ z builderu, nebo zvol Demo / JSON.');
        return null;
      }
      return sessionDeck;
    }
    if (!fileDeck) {
      setError('Nejdřív načti deck JSON.');
      return null;
    }
    return fileDeck;
  };

  const refresh = useCallback(async (s: Session) => {
    const res = await fetch(
      `/api/room/${s.roomId}?seat=${s.seat}&token=${encodeURIComponent(s.seatToken)}`,
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Sync failed');
      return;
    }
    setView(data);
    setError(null);
  }, []);

  // SSE push + lehký polling fallback
  useEffect(() => {
    if (!session) return;
    let es: EventSource | null = null;
    let pollId = 0;

    void refresh(session);

    const url = `/api/room/${session.roomId}/events?seat=${session.seat}&token=${encodeURIComponent(session.seatToken)}`;
    try {
      es = new EventSource(url);
      es.onmessage = () => {
        void refresh(session);
      };
      es.onerror = () => {
        // fallback poll if SSE drops
        if (!pollId) {
          pollId = window.setInterval(() => void refresh(session), 1200);
        }
      };
    } catch {
      pollId = window.setInterval(() => void refresh(session), 1200);
    }

    return () => {
      es?.close();
      if (pollId) window.clearInterval(pollId);
    };
  }, [session, refresh]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const deck = resolveDeckPayload();
    if (!deck) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name, deck, maxSeats }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setSession({
        roomId: data.roomId,
        seat: data.seat,
        seatToken: data.seatToken,
        names: data.names,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
    setBusy(false);
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    const deck = resolveDeckPayload();
    if (!deck) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', name, roomId: joinCode.trim(), deck }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Join failed');
      setSession({
        roomId: data.roomId,
        seat: data.seat,
        seatToken: data.seatToken,
        names: data.names,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Join failed');
    }
    setBusy(false);
  };

  const onDeckFile = async (file: File | null) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!isValidStoredDeck(raw)) throw new Error('JSON musí mít commander + cards[]');
      setFileDeck(raw);
      setDeckChoice('file');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Špatný JSON');
      setFileDeck(null);
    }
  };

  const send = async (action: RoomAction) => {
    if (!session) return;
    const res = await fetch(`/api/room/${session.roomId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seat: session.seat,
        token: session.seatToken,
        action,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Action failed');
      return;
    }
    setView(data);
    setError(null);
  };

  const state = view?.state ?? null;
  const myPriority = state?.players[state.priorityPlayerIndex]?.id === session?.seat;

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
              Tablebound
            </Link>
            <h1 className="text-2xl font-bold">Play against friend</h1>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/play" className="text-zinc-400 hover:text-zinc-200">
              Modes
            </Link>
            <Link href="/builder" className="text-zinc-400 hover:text-zinc-200">
              Deckbuilder
            </Link>
          </div>
        </div>
        <p className="text-sm text-zinc-500">
          Vytvoř místnost a pošli kód soupeři. Každý přinese vlastní deck (nebo demo).
        </p>
        <label className="block text-sm space-y-1">
          <span className="text-zinc-400">Jméno</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
          />
        </label>
        <fieldset className="text-sm space-y-2">
          <legend className="text-zinc-400 mb-1">Tvůj deck</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="deck"
              checked={deckChoice === 'session'}
              onChange={() => setDeckChoice('session')}
            />
            Ze session
            <span className="text-xs text-zinc-500">
              {sessionDeck
                ? `(${sessionDeck.commander.name}, ${sessionDeck.cards.length} karet)`
                : '(prázdná — nejdřív ulož z builderu)'}
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="deck"
              checked={deckChoice === 'demo'}
              onChange={() => setDeckChoice('demo')}
            />
            Demo deck
          </label>
          <label className="flex items-center gap-2 flex-wrap">
            <input
              type="radio"
              name="deck"
              checked={deckChoice === 'file'}
              onChange={() => setDeckChoice('file')}
            />
            JSON soubor
            <input
              type="file"
              accept=".json,application/json"
              className="text-xs"
              onChange={(e) => void onDeckFile(e.target.files?.[0] || null)}
            />
            {fileDeck && (
              <span className="text-xs text-zinc-500">
                {fileDeck.commander.name} · {fileDeck.cards.length}
              </span>
            )}
          </label>
        </fieldset>
        <button
          type="button"
          disabled={busy}
          onClick={() => void create()}
          className="w-full bg-indigo-700 hover:bg-indigo-600 rounded py-2 text-sm font-medium disabled:opacity-40"
        >
          Vytvořit místnost
        </button>
        <div className="border-t border-zinc-800 pt-4 space-y-3">
          <label className="block text-sm space-y-1">
            <span className="text-zinc-400">Kód místnosti</span>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 font-mono"
            />
          </label>
          <button
            type="button"
            disabled={busy || !joinCode.trim()}
            onClick={() => void join()}
            className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded py-2 text-sm disabled:opacity-40"
          >
            Připojit se (se stejným deck výběrem výše)
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  if (!state) {
    const cap = view?.maxSeats || maxSeats;
    const seatList = ALL_SEATS.slice(0, cap);
    const filled = seatList.filter((s) => view?.joined?.[s]).length;
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-bold">Lobby ({filled}/{cap})</h1>
        <p className="text-3xl font-mono tracking-widest text-indigo-300">{session.roomId}</p>
        <p className="text-sm text-zinc-500">
          Ty jsi <strong>{session.seat}</strong> (
          {view?.names?.[session.seat] || session.names[session.seat]}). Pošli kód ostatním.
        </p>
        <ul className="text-sm space-y-1">
          {seatList.map((s) => (
            <li key={s} className="flex justify-between gap-2 border-b border-zinc-800 py-1">
              <span>
                {s}: {view?.names?.[s] || '—'}
                {view?.joined?.[s] ? '' : ' (volné)'}
              </span>
              <span className="text-xs text-zinc-500">{view?.deckHint?.[s] || '—'}</span>
            </li>
          ))}
        </ul>
        {session.seat === 'p1' && filled >= 2 && (
          <button
            type="button"
            className="w-full bg-emerald-800 hover:bg-emerald-700 rounded py-2 text-sm"
            onClick={() =>
              void fetch('/api/room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'start',
                  roomId: session.roomId,
                  seat: session.seat,
                  token: session.seatToken,
                }),
              }).then(async (res) => {
                if (!res.ok) {
                  const d = await res.json().catch(() => ({}));
                  setError(d.error || 'Start failed');
                  return;
                }
                void refresh(session);
              })
            }
          >
            Start game now
          </button>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Link href="/play/online" className="text-sm text-zinc-400">
          Zrušit
        </Link>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  const castingMine = !!state.pendingCast && state.pendingCast.playerId === session.seat;
  const declaring = isCombatDeclaring(state);

  const legal = (() => {
    if (!state.pendingCast || state.pendingCast.playerId !== session.seat) return [] as TargetRef[];
    const slot = state.pendingCast.slots[state.pendingCast.currentSlot];
    if (!slot) return [];
    return listLegalTargets(state, slot.filter);
  })();
  const highlightIds = new Set<string>();
  for (const t of legal) if (t.kind === 'permanent') highlightIds.add(t.permanentId);
  const highlightPlayers = new Set<string>();
  for (const t of legal) if (t.kind === 'player') highlightPlayers.add(t.playerId);
  const highlightStackIds = new Set<string>();
  for (const t of legal) if (t.kind === 'stack') highlightStackIds.add(t.stackId);
  if (state.combat?.mode === 'declareAttackers') {
    for (const id of legalAttackers(state)) highlightIds.add(id);
    for (const id of state.combat.draftAttackerIds) highlightIds.add(id);
  }
  if (state.combat?.mode === 'declareBlockers') {
    for (const id of legalBlockers(state)) highlightIds.add(id);
    for (const ids of Object.values(state.combat.draftBlocks)) {
      for (const id of ids) highlightIds.add(id);
    }
    for (const a of state.combat.attackers) highlightIds.add(a.attackerId);
  }

  const onBattlefield = (playerId: string, card: CardInstance) => {
    if (state.combat?.mode === 'declareAttackers') {
      void send({ type: 'toggleDraftAttacker', creatureId: card.id });
      return;
    }
    if (state.combat?.mode === 'declareBlockers') {
      if (state.combat.attackers.some((a) => a.attackerId === card.id)) {
        void send({ type: 'focusAttacker', attackerId: card.id });
      } else {
        const focus = state.combat.focusAttackerId || state.combat.attackers[0]?.attackerId;
        if (focus) void send({ type: 'toggleDraftBlocker', attackerId: focus, blockerId: card.id });
      }
      return;
    }
    if (castingMine) {
      void send({
        type: 'selectCastTarget',
        target: { kind: 'permanent', permanentId: card.id },
      });
      return;
    }
    if (myPriority && playerId === session.seat) {
      void send({ type: 'activateMana', cardId: card.id });
    }
  };

  return (
    <>
      <div className="fixed top-2 right-2 z-30 flex flex-wrap gap-1.5 text-[0.65rem]">
        <span className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 font-mono">
          {session.roomId}
        </span>
        <Link
          href="/play"
          className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600"
        >
          Modes
        </Link>
        <Link
          href="/play/online"
          className="px-2 py-1 border border-[var(--pt-line,#2a2f2c)] bg-black/50 hover:border-amber-600"
        >
          Lobby
        </Link>
      </div>
      {error && (
        <div className="fixed top-10 left-1/2 z-30 -translate-x-1/2 text-sm text-red-300 bg-black/80 px-3 py-1 border border-red-900">
          {error}
        </div>
      )}
      <ArenaTable
        state={state}
        youId={session.seat}
        sourceLabel={`online · v${view?.version ?? 0}`}
        highlightIds={highlightIds}
        highlightPlayers={highlightPlayers}
        highlightStackIds={highlightStackIds}
        casting={castingMine || declaring}
        onPass={() => void send({ type: 'pass' })}
        onPlayerLifeClick={(pid) => {
          if (castingMine) {
            void send({ type: 'selectCastTarget', target: { kind: 'player', playerId: pid } });
          }
        }}
        onBattlefieldCard={onBattlefield}
        onHandCard={(c) => {
          if (!myPriority || state.pendingCast) return;
          if (c.card.type_line.includes('Land')) void send({ type: 'playLand', cardId: c.id });
          else void send({ type: 'beginCast', cardId: c.id });
        }}
        onCommandCard={(c) => {
          if (myPriority && !state.pendingCast) {
            void send({ type: 'beginCastCommander', cardId: c.id });
          }
        }}
        onStackObject={(stackId) => {
          if (castingMine) {
            void send({ type: 'selectCastTarget', target: { kind: 'stack', stackId } });
          }
        }}
        onGraveyardCard={
          castingMine
            ? (c) =>
                void send({
                  type: 'selectCastTarget',
                  target: { kind: 'permanent', permanentId: c.id },
                })
            : myPriority && !state.pendingCast
              ? (c) => void send({ type: 'beginCastFlashback', cardId: c.id })
              : undefined
        }
        promptSlot={
          <>
      {state.pendingChoices.length > 0 && (
        <div className="p-3 bg-amber-950 border border-amber-800 rounded space-y-2 text-sm">
          <div className="font-semibold text-amber-200">SBA choice</div>
          {state.pendingChoices.map((choice, i) => {
            const mine = choice.playerId === session.seat;
            if (choice.type === 'legend') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Legend rule — {choice.name}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <div className="flex flex-wrap gap-2">
                      {choice.permanentIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="text-xs bg-amber-800 hover:bg-amber-700 px-2 py-1 rounded"
                          onClick={() => void send({ type: 'resolveLegend', keepId: id })}
                        >
                          Keep {id.slice(-6)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (choice.type === 'ward') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Ward {'{' + choice.cost + '}'}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs bg-amber-800 px-2 py-1 rounded"
                        onClick={() => void send({ type: 'resolveWard', pay: true })}
                      >
                        Zaplatit
                      </button>
                      <button
                        type="button"
                        className="text-xs bg-zinc-700 px-2 py-1 rounded"
                        onClick={() => void send({ type: 'resolveWard', pay: false })}
                      >
                        Zrušit
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (choice.type === 'scry') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Scry {choice.cardIds.length}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() => void send({ type: 'resolveScry', bottomIds: [] })}
                    >
                      Keep all on top
                    </button>
                  )}
                </div>
              );
            }
            if (choice.type === 'surveil') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Surveil {choice.cardIds.length}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() => void send({ type: 'resolveSurveil', toGyIds: [] })}
                    >
                      Keep all on top
                    </button>
                  )}
                </div>
              );
            }
            if (choice.type === 'lookAtTop') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Look at top {choice.cardIds.length}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() => void send({ type: 'resolveLookAtTop' })}
                    >
                      OK
                    </button>
                  )}
                </div>
              );
            }
            if (choice.type === 'fabricate') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Fabricate {choice.amount}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs bg-amber-800 px-2 py-1 rounded"
                        onClick={() => void send({ type: 'resolveFabricate', mode: 'tokens' })}
                      >
                        Servos
                      </button>
                      <button
                        type="button"
                        className="text-xs bg-amber-800 px-2 py-1 rounded"
                        onClick={() => void send({ type: 'resolveFabricate', mode: 'counters' })}
                      >
                        Counters
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (choice.type === 'discardSelect') {
              const hand = state.players.find((p) => p.id === choice.playerId)?.hand || [];
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Discard {choice.amount}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() =>
                        void send({
                          type: 'resolveDiscardSelect',
                          cardIds: hand.slice(0, choice.amount).map((c) => c.id),
                        })
                      }
                    >
                      Discard first {choice.amount}
                    </button>
                  )}
                </div>
              );
            }
            if (choice.type === 'riot') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Riot
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs bg-amber-800 px-2 py-1 rounded"
                        onClick={() =>
                          void send({
                            type: 'resolveRiot',
                            permanentId: choice.permanentId,
                            choice: 'haste',
                          })
                        }
                      >
                        Haste
                      </button>
                      <button
                        type="button"
                        className="text-xs bg-amber-800 px-2 py-1 rounded"
                        onClick={() =>
                          void send({
                            type: 'resolveRiot',
                            permanentId: choice.permanentId,
                            choice: 'counter',
                          })
                        }
                      >
                        +1/+1
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (choice.type === 'sacrificePermanents') {
              const bf =
                state.players.find((p) => p.id === choice.playerId)?.battlefield || [];
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Sacrifice {choice.amount}
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() =>
                        void send({
                          type: 'resolveSacrificePermanents',
                          permanentIds: bf.slice(0, choice.amount).map((c) => c.id),
                        })
                      }
                    >
                      Sac first {choice.amount}
                    </button>
                  )}
                </div>
              );
            }
            if (choice.type === 'mulligan') {
              const hand = state.players.find((p) => p.id === choice.playerId)?.hand || [];
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Mulligan ({choice.mulligansTaken} · {choice.phase})
                    {!mine && <span className="text-zinc-500"> (ceka souper)</span>}
                  </div>
                  {mine && choice.phase === 'decide' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs bg-amber-800 px-2 py-1 rounded"
                        onClick={() => void send({ type: 'resolveMulliganKeep' })}
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        className="text-xs bg-zinc-700 px-2 py-1 rounded"
                        onClick={() => void send({ type: 'resolveMulliganTake' })}
                      >
                        Mulligan
                      </button>
                    </div>
                  )}
                  {mine && choice.phase === 'bottom' && (
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() =>
                        void send({
                          type: 'resolveMulliganBottom',
                          bottomIds: hand.slice(0, choice.mulligansTaken).map((c) => c.id),
                        })
                      }
                    >
                      Bottom first {choice.mulligansTaken}
                    </button>
                  )}
                </div>
              );
            }
            if (choice.type === 'orderTriggers') {
              return (
                <div key={i} className="space-y-1">
                  <div>
                    Trigger order ({choice.triggerIds.length})
                    {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
                  </div>
                  {mine && (
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() =>
                        void send({
                          type: 'resolveTriggerOrder',
                          orderedIds: choice.triggerIds,
                        })
                      }
                    >
                      Confirm default order
                    </button>
                  )}
                </div>
              );
            }
            if (choice.type !== 'commanderToCommandZone') return null;
            return (
              <div key={i} className="space-y-1">
                <div>
                  Commander → command zone? ({choice.from})
                  {!mine && <span className="text-zinc-500"> (ceka souper)</span>}
                </div>
                {mine && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs bg-amber-800 px-2 py-1 rounded"
                      onClick={() =>
                        void send({
                          type: 'resolveCommanderZone',
                          cardId: choice.cardId,
                          toCommandZone: true,
                        })
                      }
                    >
                      Ano
                    </button>
                    <button
                      type="button"
                      className="text-xs bg-zinc-700 px-2 py-1 rounded"
                      onClick={() =>
                        void send({
                          type: 'resolveCommanderZone',
                          cardId: choice.cardId,
                          toCommandZone: false,
                        })
                      }
                    >
                      Ne
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {state.combat?.mode === 'declareAttackers' &&
        state.combat.declaringPlayerId === session.seat && (
          <div className="p-3 bg-orange-950 border border-orange-700 rounded text-sm space-y-2">
            <div className="font-semibold text-orange-200">Declare attackers</div>
            <div className="flex flex-wrap gap-1 text-xs">
              {(
                state.players.find((p) => p.id === state.combat?.draftDefendPlayerId)
                  ?.battlefield || []
              )
                .filter((c) => c.card.type_line.includes('Planeswalker'))
                .map((pw) => (
                  <button
                    key={pw.id}
                    type="button"
                    className={`px-2 py-0.5 rounded border ${
                      state.combat?.draftDefendPlaneswalkerId === pw.id
                        ? 'border-orange-400'
                        : 'border-zinc-600'
                    }`}
                    onClick={() =>
                      void send({ type: 'setDefendPlaneswalker', planeswalkerId: pw.id })
                    }
                  >
                    {pw.card.name}
                  </button>
                ))}
              {state.combat.draftDefendPlaneswalkerId && (
                <button
                  type="button"
                  className="px-2 py-0.5 rounded border border-zinc-600"
                  onClick={() =>
                    void send({ type: 'setDefendPlaneswalker', planeswalkerId: null })
                  }
                >
                  Player
                </button>
              )}
            </div>
            <button
              type="button"
              className="bg-orange-700 px-3 py-1 rounded text-xs"
              onClick={() => void send({ type: 'confirmAttackers' })}
            >
              Confirm attackers
            </button>
          </div>
        )}

      {state.combat?.mode === 'declareBlockers' &&
        state.combat.declaringPlayerId === session.seat && (
          <div className="p-3 bg-orange-950 border border-orange-700 rounded text-sm space-y-2">
            <div className="font-semibold text-orange-200">Declare blockers</div>
            <button
              type="button"
              className="bg-orange-700 px-3 py-1 rounded text-xs"
              onClick={() => void send({ type: 'confirmBlockers' })}
            >
              Confirm blockers
            </button>
          </div>
        )}

      {state.combat?.mode === 'assignDamage' &&
        state.players[state.activePlayerIndex]?.id === session.seat && (
          <div className="p-3 bg-red-950 border border-red-800 rounded text-sm space-y-2">
            <div className="font-semibold text-red-200">Assign combat damage</div>
            <p className="text-xs text-red-100/70">
              Prefill = lethal; Confirm applies (edit via setDamage API later / use solo for fine control).
            </p>
            <button
              type="button"
              className="bg-red-700 px-3 py-1 rounded text-xs"
              onClick={() => void send({ type: 'confirmDamageAssign' })}
            >
              Confirm damage
            </button>
          </div>
        )}

      {state.pendingLoyalty && state.pendingLoyalty.playerId === session.seat && (
        <div className="p-3 bg-sky-950 border border-sky-800 rounded text-sm space-y-2">
          <div className="flex justify-between">
            <span className="font-semibold text-sky-200">Loyalty</span>
            <button
              type="button"
              className="text-xs bg-zinc-800 px-2 py-1 rounded"
              onClick={() => void send({ type: 'cancelLoyalty' })}
            >
              Cancel
            </button>
          </div>
          {(() => {
            const pid = state.pendingLoyalty!.permanentId;
            const perm = state.players.flatMap((p) => p.battlefield).find((c) => c.id === pid);
            return parseLoyaltyAbilities(perm?.card.oracle_text).map((ab, i) => (
              <button
                key={i}
                type="button"
                className="text-xs bg-sky-800 px-2 py-1 rounded mr-1"
                title={ab.text}
                onClick={() =>
                  void send({ type: 'beginLoyalty', permanentId: pid, abilityIndex: i })
                }
              >
                {ab.loyaltyCost >= 0 ? '+' : ''}
                {ab.loyaltyCost}
              </button>
            ));
          })()}
        </div>
      )}

      {state.pendingActivated && state.pendingActivated.playerId === session.seat && (
        <div className="p-3 bg-emerald-950 border border-emerald-800 rounded text-sm space-y-2">
          <div className="flex justify-between">
            <span className="font-semibold text-emerald-200">Activated ability</span>
            <button
              type="button"
              className="text-xs bg-zinc-800 px-2 py-1 rounded"
              onClick={() => void send({ type: 'cancelActivated' })}
            >
              Cancel
            </button>
          </div>
          {(() => {
            const pid = state.pendingActivated!.permanentId;
            const perm = state.players.flatMap((p) => p.battlefield).find((c) => c.id === pid);
            const abs = parseActivatedAbilities(perm?.card.oracle_text);
            return state.pendingActivated!.options.map((idx) => (
              <button
                key={idx}
                type="button"
                className="text-xs bg-emerald-800 px-2 py-1 rounded mr-1"
                onClick={() =>
                  void send({
                    type: 'beginActivatedIndex',
                    permanentId: pid,
                    abilityIndex: idx,
                  })
                }
              >
                {abs[idx]?.costLabel || `#${idx}`}
              </button>
            ));
          })()}
        </div>
      )}

      {state.pendingCast && state.pendingCast.playerId === session.seat && (
        <div className="p-3 bg-fuchsia-950 border border-fuchsia-700 rounded text-sm space-y-2">
          <div className="flex justify-between gap-2">
            <span>
              Casting {state.pendingCast.cardName}
              {state.pendingCast.phase ? ` · ${state.pendingCast.phase}` : ''}
            </span>
            <button
              type="button"
              className="text-xs bg-zinc-800 px-2 py-1 rounded"
              onClick={() => void send({ type: 'cancelCast' })}
            >
              Cancel
            </button>
          </div>
          {state.pendingCast.phase === 'mode' &&
            state.pendingCast.resolvedScript?.modes?.map((m, i) => (
              <button
                key={i}
                type="button"
                className="text-xs bg-fuchsia-800 px-2 py-1 rounded mr-1"
                onClick={() => void send({ type: 'selectCastMode', modeIndex: i })}
              >
                {m.label}
              </button>
            ))}
          {state.pendingCast.phase === 'x' &&
            [0, 1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className="text-xs bg-fuchsia-800 px-2 py-1 rounded mr-1"
                onClick={() => void send({ type: 'setCastX', xValue: n })}
              >
                X={n}
              </button>
            ))}
          {state.pendingCast.phase === 'kicker' && (
            <>
              <button
                type="button"
                className="text-xs bg-fuchsia-800 px-2 py-1 rounded mr-1"
                onClick={() => void send({ type: 'setCastKicker', pay: true })}
              >
                Kick
              </button>
              <button
                type="button"
                className="text-xs bg-zinc-700 px-2 py-1 rounded"
                onClick={() => void send({ type: 'setCastKicker', pay: false })}
              >
                No kicker
              </button>
            </>
          )}
          {state.pendingCast.phase === 'buyback' && (
            <>
              <button
                type="button"
                className="text-xs bg-fuchsia-800 px-2 py-1 rounded mr-1"
                onClick={() => void send({ type: 'setCastBuyback', pay: true })}
              >
                Buyback
              </button>
              <button
                type="button"
                className="text-xs bg-zinc-700 px-2 py-1 rounded"
                onClick={() => void send({ type: 'setCastBuyback', pay: false })}
              >
                No buyback
              </button>
            </>
          )}
          {(state.pendingCast.phase === 'convoke' ||
            state.pendingCast.phase === 'improvise' ||
            state.pendingCast.phase === 'delve') && (
            <button
              type="button"
              className="text-xs bg-fuchsia-800 px-2 py-1 rounded"
              onClick={() => void send({ type: 'confirmConvokeDelve' })}
            >
              Done {state.pendingCast.phase} (
              {state.pendingCast.phase === 'convoke'
                ? state.pendingCast.convokeTapped?.length || 0
                : state.pendingCast.phase === 'improvise'
                  ? state.pendingCast.improviseTapped?.length || 0
                  : state.pendingCast.delveExiled?.length || 0}
              )
            </button>
          )}
          {(!state.pendingCast.phase || state.pendingCast.phase === 'targets') && (
            <span className="text-fuchsia-200/80 text-xs">Klikni target (life / creature)</span>
          )}
        </div>
      )}
          </>
        }
      />
    </>
  );
}
