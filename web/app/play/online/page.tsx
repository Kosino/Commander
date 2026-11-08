'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoredDeck } from '../../../lib/engine/fromDeck';
import { isValidStoredDeck } from '../../../lib/engine/fromDeck';
import type { GameState, RoomAction, SeatId } from '../../../lib/onlineTypes';
import { loadPlayDeck } from '../../../lib/playSession';

type Session = {
  roomId: string;
  seat: SeatId;
  seatToken: string;
  names: Record<SeatId, string>;
};

type View = {
  version: number;
  names: Record<SeatId, string>;
  joined: Record<SeatId, boolean>;
  you: SeatId;
  deckHint?: Record<SeatId, string>;
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
        body: JSON.stringify({ action: 'create', name, deck }),
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
  const you = state?.players.find((p) => p.id === session?.seat);
  const opp = state?.players.find((p) => p.id !== session?.seat);
  const myPriority = state?.players[state.priorityPlayerIndex]?.id === session?.seat;

  const canPass = useMemo(() => {
    if (!state || !session) return false;
    if (state.pendingCast || state.pendingChoices.length) return false;
    if (state.combat?.mode === 'declareAttackers' || state.combat?.mode === 'declareBlockers') {
      return false;
    }
    return myPriority && !state.winnerId;
  }, [state, session, myPriority]);

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Online 2 hráči</h1>
          <Link href="/play" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Solo AI
          </Link>
        </div>
        <p className="text-sm text-zinc-500">
          Vytvoř místnost a pošli kód soupeři. Každý přinese vlastní deck (nebo demo).
          Stav se ukládá do <code className="text-zinc-400">.data/rooms.json</code> a syncuje přes SSE.
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
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-bold">Čekám na soupeře…</h1>
        <p className="text-3xl font-mono tracking-widest text-indigo-300">{session.roomId}</p>
        <p className="text-sm text-zinc-500">
          Ty jsi <strong>{session.seat}</strong> (
          {view?.names?.[session.seat] || session.names[session.seat]}). Pošli kód druhému hráči.
          {view?.deckHint && (
            <span className="block mt-1 text-xs">
              Decy: p1={view.deckHint.p1} · p2={view.deckHint.p2}
            </span>
          )}
        </p>
        <Link href="/play/online" className="text-sm text-zinc-400">
          Zrušit
        </Link>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Online · {session.roomId}</h1>
          <p className="text-xs text-zinc-500">
            Ty: {session.seat} ({you?.name}) · v{view?.version}
            {myPriority ? ' · tvá priorita' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/play"
            className="text-sm bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded"
          >
            Solo AI
          </Link>
          <button
            type="button"
            disabled={!canPass}
            onClick={() => void send({ type: 'pass' })}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded disabled:opacity-40"
          >
            Pass
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

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
            return (
              <div key={i} className="space-y-1">
                <div>
                  Commander → command zone? ({choice.from})
                  {!mine && <span className="text-zinc-500"> (čeká soupeř)</span>}
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

      <div className="text-sm bg-zinc-900 border border-zinc-800 rounded px-3 py-2 flex flex-wrap gap-3">
        <span>
          Tah {state.turnNumber}
        </span>
        <span>
          {state.phase}/{state.step}
        </span>
        <span>Stack {state.stack.length}</span>
        {state.monarchPlayerId && (
          <span className="text-yellow-300">
            Monarch{' '}
            {state.players.find((p) => p.id === state.monarchPlayerId)?.name ||
              state.monarchPlayerId}
          </span>
        )}
        {state.players.some((p) => p.citysBlessing) && (
          <span className="text-sky-300">
            Blessing{' '}
            {state.players
              .filter((p) => p.citysBlessing)
              .map((p) => p.name)
              .join(', ')}
          </span>
        )}
      </div>

      {state.stack.length > 0 && (
        <div className="bg-zinc-900 border border-dashed border-zinc-700 rounded p-2 space-y-1">
          <div className="text-xs text-zinc-500">Stack (klik = counter target)</div>
          {[...state.stack].reverse().map((obj) => (
            <button
              key={obj.id}
              type="button"
              disabled={state.pendingCast?.playerId !== session.seat}
              onClick={() =>
                void send({ type: 'selectCastTarget', target: { kind: 'stack', stackId: obj.id } })
              }
              className="block w-full text-left text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-2 py-1 rounded"
            >
              [{obj.kind}] {obj.name}
            </button>
          ))}
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

      <div className="space-y-3">
        {opp && (
          <OnlinePanel
            title={`${opp.name} (soupeř)`}
            player={opp}
            hideHand
            onLifeClick={
              state.pendingCast?.playerId === session.seat
                ? () => void send({ type: 'selectCastTarget', target: { kind: 'player', playerId: opp.id } })
                : undefined
            }
            onPermanentClick={
              state.pendingCast?.playerId === session.seat
                ? (id) =>
                    void send({
                      type: 'selectCastTarget',
                      target: { kind: 'permanent', permanentId: id },
                    })
                : undefined
            }
          />
        )}
        {you && (
          <OnlinePanel
            title={`${you.name} (ty)`}
            player={you}
            onHandClick={
              myPriority && !state.pendingCast
                ? (card) => {
                    if (card.card.type_line.includes('Land')) {
                      void send({ type: 'playLand', cardId: card.id });
                    } else {
                      void send({ type: 'beginCast', cardId: card.id });
                    }
                  }
                : undefined
            }
            onCommandClick={
              myPriority && !state.pendingCast
                ? (card) => void send({ type: 'beginCastCommander', cardId: card.id })
                : undefined
            }
            onGraveyardClick={
              state.pendingCast?.playerId === session.seat
                ? (card) =>
                    void send({
                      type: 'selectCastTarget',
                      target: { kind: 'permanent', permanentId: card.id },
                    })
                : myPriority && !state.pendingCast
                  ? (card) => void send({ type: 'beginCastFlashback', cardId: card.id })
                  : undefined
            }
            onPermanentClick={(id) => {
              if (state.combat?.mode === 'declareAttackers') {
                void send({ type: 'toggleDraftAttacker', creatureId: id });
                return;
              }
              if (state.combat?.mode === 'declareBlockers') {
                if (state.combat.attackers.some((a) => a.attackerId === id)) {
                  void send({ type: 'focusAttacker', attackerId: id });
                } else {
                  const focus =
                    state.combat.focusAttackerId || state.combat.attackers[0]?.attackerId;
                  if (focus) {
                    void send({ type: 'toggleDraftBlocker', attackerId: focus, blockerId: id });
                  }
                }
                return;
              }
              if (state.pendingCast?.playerId === session.seat) {
                void send({
                  type: 'selectCastTarget',
                  target: { kind: 'permanent', permanentId: id },
                });
                return;
              }
              if (myPriority) void send({ type: 'activateMana', cardId: id });
            }}
            onLifeClick={
              state.pendingCast?.playerId === session.seat
                ? () =>
                    void send({
                      type: 'selectCastTarget',
                      target: { kind: 'player', playerId: you.id },
                    })
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function OnlinePanel({
  title,
  player,
  hideHand,
  onHandClick,
  onCommandClick,
  onPermanentClick,
  onGraveyardClick,
  onLifeClick,
}: {
  title: string;
  player: GameState['players'][number];
  hideHand?: boolean;
  onHandClick?: (card: GameState['players'][number]['hand'][number]) => void;
  onCommandClick?: (card: GameState['players'][number]['commandZone'][number]) => void;
  onPermanentClick?: (id: string) => void;
  onGraveyardClick?: (card: GameState['players'][number]['graveyard'][number]) => void;
  onLifeClick?: () => void;
}) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{title}</span>
        {onLifeClick ? (
          <button type="button" onClick={onLifeClick} className="tabular-nums underline-offset-2 hover:underline">
            Life {player.life}
          </button>
        ) : (
          <span className="tabular-nums text-zinc-400">Life {player.life}</span>
        )}
      </div>
      <div className="text-xs text-zinc-500">
        Hand {player.hand.length} · BF {player.battlefield.length} · Lib {player.library.length} ·
        Lands {player.landsPlayedThisTurn}/1
        {Object.keys(player.commanderDamage).length > 0 && (
          <span className="text-amber-500">
            {' '}
            · Cmd{' '}
            {Object.entries(player.commanderDamage)
              .map(([id, d]) => `${d}`)
              .join('/')}
          </span>
        )}
        {player.citysBlessing && <span className="text-sky-300"> · blessing</span>}
      </div>
      {player.commandZone.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {player.commandZone.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!onCommandClick}
              onClick={() => onCommandClick?.(c)}
              className="text-xs border border-amber-800 text-amber-200 rounded px-1.5 py-0.5 disabled:opacity-50"
              title={`Cast from command (tax ×${c.commanderCastCount})`}
            >
              CZ: {c.card.name} {c.card.mana_cost || ''}
              {c.commanderCastCount > 0 ? ` +${2 * c.commanderCastCount}` : ''}
            </button>
          ))}
        </div>
      )}
      {!hideHand && (
        <div className="flex flex-wrap gap-1">
          {player.hand.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!onHandClick}
              onClick={() => onHandClick?.(c)}
              className="text-xs border border-zinc-700 rounded px-1.5 py-0.5 disabled:opacity-50"
            >
              {c.card.name} {c.card.mana_cost || ''}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {player.battlefield.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!onPermanentClick}
            onClick={() => onPermanentClick?.(c.id)}
            className={`text-xs border rounded px-1.5 py-0.5 ${
              c.tapped ? 'border-zinc-600 italic text-zinc-500' : 'border-zinc-700'
            }`}
          >
            {c.isToken ? '[T] ' : ''}
            {c.card.name}
            {c.goaded ? ' (goad)' : ''}
            {c.unearthed ? ' (unearth)' : ''}
            {(c.counters['+1/+1'] || 0) > 0 ? ` +${c.counters['+1/+1']}` : ''}
            {(c.counters['loyalty'] || 0) > 0 ? ` ♥${c.counters['loyalty']}` : ''}
            {c.damageMarked ? ` (−${c.damageMarked})` : ''}
          </button>
        ))}
      </div>
      {player.graveyard.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] uppercase text-zinc-600 self-center">GY</span>
          {player.graveyard.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!onGraveyardClick}
              onClick={() => onGraveyardClick?.(c)}
              className="text-xs border border-zinc-800 text-zinc-400 rounded px-1.5 py-0.5 disabled:opacity-50"
            >
              {c.card.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
