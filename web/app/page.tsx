'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import {
  Card,
  computeDeckStats,
  exportDeckJson,
  exportDeckText,
  parseDeckJson,
  parseDeckText,
  TypeBucket,
  validateDeck,
} from '../lib/deck';
import { canStartPlay, savePlayDeck } from '../lib/playSession';

const TYPE_ORDER: TypeBucket[] = [
  'Creatures',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Enchantments',
  'Planeswalkers',
  'Lands',
  'Other',
];

export default function DeckBuilder() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [commander, setCommander] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => computeDeckStats(deck), [deck]);
  const maxCurve = Math.max(1, ...stats.manaCurve);

  const searchCards = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.cards || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const resolveCardByName = async (name: string): Promise<Card | null> => {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(name)}`);
      const data = await res.json();
      const cards: Card[] = data.cards || [];
      const exact = cards.find((c) => c.name.toLowerCase() === name.toLowerCase());
      return exact || cards[0] || null;
    } catch {
      return null;
    }
  };

  const addToDeck = (card: Card) => {
    if (deck.length >= 100) return;
    const newDeck = [...deck, card];
    setDeck(newDeck);
    setErrors(validateDeck(newDeck, commander));
  };

  const setAsCommander = (card: Card) => {
    if (!card.type_line?.includes('Legendary Creature')) {
      alert('Commander musí být Legendary Creature');
      return;
    }
    setCommander(card);
    let newDeck = deck.filter((c) => c.oracle_id !== card.oracle_id);
    if (newDeck.length < 100) newDeck = [card, ...newDeck];
    setDeck(newDeck);
    setErrors(validateDeck(newDeck, card));
  };

  const removeFromDeck = (index: number) => {
    const removed = deck[index];
    const newDeck = deck.filter((_, i) => i !== index);
    const stillCommander =
      commander && removed.oracle_id === commander.oracle_id ? null : commander;
    setDeck(newDeck);
    setCommander(stillCommander);
    setErrors(validateDeck(newDeck, stillCommander));
  };

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMsg(okMsg);
    } catch {
      setStatusMsg('Nepodařilo se zkopírovat do schránky.');
    }
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg(`Staženo: ${filename}`);
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const handleExportJson = () => {
    const json = exportDeckJson(commander, deck);
    downloadFile(json, 'deck.json', 'application/json');
    if (commander) {
      savePlayDeck({ name: 'My Deck', commander, cards: deck });
    }
  };

  const handleExportText = () => {
    const text = exportDeckText(commander, deck);
    void copyText(text, 'Textový deck zkopírován do schránky.');
  };

  const applyImportedDeck = (newCommander: Card | null, newDeck: Card[]) => {
    setCommander(newCommander);
    setDeck(newDeck);
    setErrors(validateDeck(newDeck, newCommander));
    setShowImport(false);
    setImportText('');
    setStatusMsg(`Importováno ${newDeck.length} karet.`);
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const handleImportJson = async (raw: string) => {
    try {
      const data = parseDeckJson(raw);
      applyImportedDeck(data.commander, data.cards);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Neplatný JSON.');
    }
  };

  const handleImportText = async (raw: string) => {
    const { commanderName, entries } = parseDeckText(raw);
    setStatusMsg('Resolvuji karty přes search…');
    const newDeck: Card[] = [];
    let newCommander: Card | null = null;
    const missing: string[] = [];

    if (commanderName) {
      newCommander = await resolveCardByName(commanderName);
      if (!newCommander) missing.push(commanderName);
      else newDeck.push(newCommander);
    }

    for (const { count, name } of entries) {
      const card = await resolveCardByName(name);
      if (!card) {
        missing.push(name);
        continue;
      }
      for (let i = 0; i < count; i++) {
        if (newDeck.length >= 100) break;
        newDeck.push(card);
      }
    }

    applyImportedDeck(newCommander, newDeck);
    if (missing.length) {
      alert(`Nenalezeno (${missing.length}): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
    }
  };

  const onFileSelected = async (file: File) => {
    const raw = await file.text();
    if (file.name.endsWith('.json') || raw.trim().startsWith('{')) {
      await handleImportJson(raw);
    } else {
      await handleImportText(raw);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold">MTG Commander Deck Builder</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canStartPlay(commander, deck)}
            onClick={() => {
              if (!commander) return;
              savePlayDeck({ name: 'My Deck', commander, cards: deck });
              router.push('/play?src=deck');
            }}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded disabled:opacity-40"
            title={
              errors.length
                ? 'Deck má validační chyby — hra stejně půjde (MVP)'
                : 'Spustit hru s tímto deckem vs demo soupeř'
            }
          >
            Hrát vs AI
          </button>
          <Link
            href="/play/online"
            className="text-sm bg-indigo-800 hover:bg-indigo-700 px-3 py-1.5 rounded"
          >
            Online 2P
          </Link>
          <Link
            href="/play"
            className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded"
          >
            Demo vs AI
          </Link>
          <button
            onClick={handleExportJson}
            disabled={deck.length === 0}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded disabled:opacity-40"
          >
            Export JSON
          </button>
          <button
            onClick={handleExportText}
            disabled={deck.length === 0}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded disabled:opacity-40"
          >
            Kopírovat text
          </button>
          <button
            onClick={() => setShowImport((v) => !v)}
            className="text-sm bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded"
          >
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,.dec,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileSelected(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {statusMsg && (
        <div className="mb-4 p-2 bg-emerald-950 border border-emerald-800 rounded text-sm text-emerald-200">
          {statusMsg}
        </div>
      )}

      {showImport && (
        <div className="mb-6 p-4 bg-zinc-900 border border-zinc-700 rounded space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded"
            >
              Načíst soubor
            </button>
            <button
              onClick={() => void handleImportJson(importText)}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded"
            >
              Importovat jako JSON
            </button>
            <button
              onClick={() => void handleImportText(importText)}
              className="text-sm bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded"
            >
              Importovat jako text
            </button>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n…"}
            rows={8}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm font-mono"
          />
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 p-3 bg-red-950 border border-red-800 rounded text-sm">
          <div className="font-semibold text-red-300 mb-1">Validace decku:</div>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search */}
        <div className="lg:col-span-1">
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchCards()}
              placeholder="Hledat kartu..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
            />
            <button
              onClick={searchCards}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? '...' : 'Hledat'}
            </button>
          </div>

          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {results.map((card) => (
              <div key={card.oracle_id} className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="font-semibold">
                  {card.name} {card.mana_cost}
                </div>
                <div className="text-sm text-zinc-400">{card.type_line}</div>
                {card.color_identity && card.color_identity.length > 0 && (
                  <div className="text-xs text-zinc-500 mt-1">
                    Identity: {card.color_identity.join('')}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => addToDeck(card)}
                    className="text-xs bg-zinc-700 hover:bg-zinc-600 px-2 py-1 rounded"
                  >
                    + Deck
                  </button>
                  <button
                    onClick={() => setAsCommander(card)}
                    className="text-xs bg-amber-700 hover:bg-amber-600 px-2 py-1 rounded"
                  >
                    Commander
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Deck + stats */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Deck ({deck.length}/100)</h2>
            {commander && (
              <div className="mt-2 p-3 bg-amber-950 border border-amber-800 rounded">
                <div className="text-sm text-amber-300">Commander</div>
                <div className="font-bold">
                  {commander.name} {commander.mana_cost}
                </div>
                <div className="text-sm text-zinc-400">{commander.type_line}</div>
                <div className="text-xs text-zinc-500">
                  Identity: {(commander.color_identity || []).join('') || 'C'}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-300">Mana curve</h3>
                <span className="text-xs text-zinc-500">avg CMC {stats.avgCmc}</span>
              </div>
              <div className="flex items-end gap-1.5 h-28">
                {stats.manaCurve.map((count, cmc) => (
                  <div key={cmc} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <span className="text-[10px] text-zinc-500">{count || ''}</span>
                    <div
                      className="w-full bg-blue-600/80 rounded-t min-h-[2px] transition-all"
                      style={{ height: `${(count / maxCurve) * 100}%` }}
                      title={`${cmc === 6 ? '6+' : cmc}: ${count}`}
                    />
                    <span className="text-[10px] text-zinc-400">{cmc === 6 ? '6+' : cmc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Typy</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {TYPE_ORDER.map((t) => (
                  <div key={t} className="flex justify-between text-zinc-400">
                    <span>{t}</span>
                    <span className="text-zinc-200 tabular-nums">{stats.typeCounts[t]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {deck.map((card, i) => (
              <div
                key={`${card.oracle_id || card.name}-${i}`}
                className="flex justify-between items-center bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
              >
                <span>
                  {card.name} {card.mana_cost}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 hidden sm:inline">{card.type_line}</span>
                  <button
                    onClick={() => removeFromDeck(i)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
