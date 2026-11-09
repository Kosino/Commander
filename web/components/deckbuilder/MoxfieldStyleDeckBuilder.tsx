'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  scryfallAutocomplete,
  scryfallImageUrl,
  scryfallNamedCard,
} from '@/lib/cardArt';
import type { Card } from '@/lib/deck';
import { clearPlayDeck, loadPlayDeck, savePlayDeck } from '@/lib/playSession';

export type DeckBrowserCard = {
  id: string;
  name: string;
  quantity: number;
  board: 'main' | 'commander' | 'sideboard';
  manaCost: string | null;
  typeLine: string | null;
  imageUrl: string | null;
  isBasicLand: boolean;
  illegal: boolean;
  colorIdentity?: string[];
  oracleText?: string;
};

type SortMode = 'name' | 'cmc';
type ViewMode = 'grid' | 'dense' | 'list';

const GROUP_ORDER = [
  'Commander',
  'Creatures',
  'Planeswalkers',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Enchantments',
  'Lands',
  'Other',
  'Sideboard',
] as const;

function classifyType(card: DeckBrowserCard): string {
  if (card.board === 'commander') return 'Commander';
  if (card.board === 'sideboard') return 'Sideboard';
  const t = card.typeLine || '';
  if (t.includes('Creature')) return 'Creatures';
  if (t.includes('Planeswalker')) return 'Planeswalkers';
  if (t.includes('Instant')) return 'Instants';
  if (t.includes('Sorcery')) return 'Sorceries';
  if (t.includes('Artifact')) return 'Artifacts';
  if (t.includes('Enchantment')) return 'Enchantments';
  if (t.includes('Land')) return 'Lands';
  return 'Other';
}

function cmcFromManaCost(manaCost: string | null): number {
  if (!manaCost) return 0;
  let n = 0;
  for (const m of manaCost.matchAll(/\{([^}]+)\}/g)) {
    const s = m[1];
    if (/^\d+$/.test(s)) n += parseInt(s, 10);
    else if (s !== 'X' && s !== 'Y' && s !== 'Z') n += 1;
  }
  return n;
}

function toBrowserCard(
  raw: {
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    color_identity?: string[];
    oracle_id?: string;
    image_uri?: string;
    image_uris?: { normal?: string };
  },
  board: DeckBrowserCard['board'] = 'main',
): DeckBrowserCard {
  const name = raw.name;
  return {
    id: raw.oracle_id || `${board}-${name}-${crypto.randomUUID()}`,
    name,
    quantity: 1,
    board,
    manaCost: raw.mana_cost || null,
    typeLine: raw.type_line || null,
    imageUrl:
      raw.image_uris?.normal ||
      raw.image_uri ||
      scryfallImageUrl(name, 'normal'),
    isBasicLand: /Basic Land/i.test(raw.type_line || ''),
    illegal: false,
    colorIdentity: raw.color_identity,
    oracleText: raw.oracle_text,
  };
}

function fromStored(cards: Card[], commander: Card, partner?: Card | null): DeckBrowserCard[] {
  const out: DeckBrowserCard[] = [];
  const cmdIds = new Set(
    [commander, partner].filter(Boolean).map((c) => c!.oracle_id || c!.name),
  );
  out.push(toBrowserCard(commander, 'commander'));
  if (partner) out.push(toBrowserCard(partner, 'commander'));
  for (const c of cards) {
    const key = c.oracle_id || c.name;
    if (cmdIds.has(key) || cmdIds.has(c.name)) continue;
    out.push(toBrowserCard(c, 'main'));
  }
  return out;
}

export default function MoxfieldStyleDeckBuilder() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const cmdSearchRef = useRef<HTMLInputElement>(null);
  const suggestSeq = useRef(0);
  const cmdSuggestSeq = useRef(0);

  const [deckName, setDeckName] = useState('Untitled Deck');
  const [cards, setCards] = useState<DeckBrowserCard[]>([]);
  const [started, setStarted] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createFormat] = useState('Commander / EDH');
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdSuggestions, setCmdSuggestions] = useState<string[]>([]);
  const [cmdSuggestOpen, setCmdSuggestOpen] = useState(false);
  const [cmdLegalOnly, setCmdLegalOnly] = useState(true);
  const [pickedCommander, setPickedCommander] = useState<DeckBrowserCard | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [results, setResults] = useState<
    Awaited<ReturnType<typeof scryfallNamedCard>>[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('name');
  const [view, setView] = useState<ViewMode>('grid');
  const [groupBy] = useState<'type'>('type');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    card: DeckBrowserCard;
  } | null>(null);

  useEffect(() => {
    const saved = loadPlayDeck();
    if (!saved?.commander) {
      setShowCreate(true);
      return;
    }
    setDeckName(saved.name || 'Untitled Deck');
    setCards(fromStored(saved.cards, saved.commander, saved.partner));
    setStarted(true);
  }, []);

  useEffect(() => {
    const close = () => {
      setContextMenu(null);
      setSuggestOpen(false);
      setCmdSuggestOpen(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Editor search autocomplete
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    const seq = ++suggestSeq.current;
    const t = window.setTimeout(async () => {
      try {
        const names = await scryfallAutocomplete(q);
        if (seq !== suggestSeq.current) return;
        setSuggestions(names.slice(0, 12));
        setSuggestOpen(names.length > 0);
        setSuggestIndex(-1);
      } catch {
        if (seq !== suggestSeq.current) return;
        setSuggestions([]);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [query]);

  // Create-modal commander autocomplete
  useEffect(() => {
    if (!showCreate) return;
    const q = cmdQuery.trim();
    if (q.length < 2) {
      setCmdSuggestions([]);
      setCmdSuggestOpen(false);
      return;
    }
    const seq = ++cmdSuggestSeq.current;
    const t = window.setTimeout(async () => {
      try {
        const names = await scryfallAutocomplete(q);
        if (seq !== cmdSuggestSeq.current) return;
        setCmdSuggestions(names.slice(0, 10));
        setCmdSuggestOpen(names.length > 0);
      } catch {
        if (seq !== cmdSuggestSeq.current) return;
        setCmdSuggestions([]);
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [cmdQuery, showCreate]);

  const groups = useMemo(() => {
    const map = new Map<string, DeckBrowserCard[]>();
    for (const card of cards) {
      const key = classifyType(card);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(card);
    }
    return GROUP_ORDER.map((key) => {
      const list = map.get(key) ?? [];
      const sorted = [...list].sort((a, b) => {
        if (sort === 'cmc') {
          const d = cmcFromManaCost(a.manaCost) - cmcFromManaCost(b.manaCost);
          if (d !== 0) return d;
        }
        return a.name.localeCompare(b.name);
      });
      return {
        key,
        cards: sorted,
        count: sorted.reduce((s, c) => s + c.quantity, 0),
      };
    }).filter((g) => g.cards.length > 0);
  }, [cards, sort]);

  const preview =
    cards.find((c) => c.id === previewId) ??
    cards.find((c) => c.board === 'commander') ??
    cards[0] ??
    null;

  const mainCount = cards
    .filter((c) => c.board === 'main')
    .reduce((s, c) => s + c.quantity, 0);
  const sideCount = cards
    .filter((c) => c.board === 'sideboard')
    .reduce((s, c) => s + c.quantity, 0);
  const commander = cards.find((c) => c.board === 'commander') || null;

  const curve = useMemo(() => {
    const bins = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const c of cards) {
      if (c.board !== 'main' || c.isBasicLand) continue;
      const cmc = Math.min(7, cmcFromManaCost(c.manaCost));
      bins[cmc] += c.quantity;
    }
    return bins;
  }, [cards]);

  const persist = () => {
    if (!commander) return;
    const mainCards: Card[] = cards
      .filter((c) => c.board === 'main')
      .flatMap((c) =>
        Array.from({ length: c.quantity }, () => ({
          name: c.name,
          mana_cost: c.manaCost || undefined,
          type_line: c.typeLine || undefined,
          oracle_text: c.oracleText,
          color_identity: c.colorIdentity,
          oracle_id: c.id,
          image_uri: c.imageUrl || undefined,
        })),
      );
    const cmds = cards.filter((c) => c.board === 'commander');
    const primary = cmds[0];
    const partner = cmds[1];
    if (!primary) return;
    savePlayDeck({
      name: deckName,
      commander: {
        name: primary.name,
        mana_cost: primary.manaCost || undefined,
        type_line: primary.typeLine || undefined,
        oracle_text: primary.oracleText,
        color_identity: primary.colorIdentity,
        oracle_id: primary.id,
        image_uri: primary.imageUrl || undefined,
      },
      partner: partner
        ? {
            name: partner.name,
            mana_cost: partner.manaCost || undefined,
            type_line: partner.typeLine || undefined,
            oracle_text: partner.oracleText,
            color_identity: partner.colorIdentity,
            oracle_id: partner.id,
            image_uri: partner.imageUrl || undefined,
          }
        : null,
      companion: null,
      cards: mainCards,
    });
  };

  const openCreateModal = () => {
    setCreateName('');
    setCmdQuery('');
    setPickedCommander(null);
    setCmdSuggestions([]);
    setShowCreate(true);
    window.setTimeout(() => cmdSearchRef.current?.focus(), 50);
  };

  const pickCommanderSuggestion = async (name: string) => {
    setCmdQuery(name);
    setCmdSuggestOpen(false);
    setCreateBusy(true);
    const raw = await scryfallNamedCard(name);
    setCreateBusy(false);
    if (!raw) return;
    if (cmdLegalOnly && !/Legendary Creature/i.test(raw.type_line || '')) {
      // still allow legendary planeswalkers that can be commanders later; MVP: legendary creature
      if (!/Legendary/i.test(raw.type_line || '')) {
        alert('Commander by měl být Legendary Creature.');
        return;
      }
    }
    setPickedCommander(toBrowserCard(raw, 'commander'));
    if (!createName.trim()) setCreateName(`${raw.name} Deck`);
  };

  const submitCreate = async () => {
    let cmd = pickedCommander;
    if (!cmd && cmdQuery.trim()) {
      setCreateBusy(true);
      const raw = await scryfallNamedCard(cmdQuery.trim());
      setCreateBusy(false);
      if (raw) cmd = toBrowserCard(raw, 'commander');
    }
    if (!cmd) {
      alert('Vyber commandera.');
      return;
    }
    clearPlayDeck();
    const name = createName.trim() || `${cmd.name} Deck`;
    setDeckName(name);
    setCards([cmd]);
    setPreviewId(cmd.id);
    setStarted(true);
    setShowCreate(false);
    setQuery('');
    setResults([]);
    savePlayDeck({
      name,
      commander: {
        name: cmd.name,
        mana_cost: cmd.manaCost || undefined,
        type_line: cmd.typeLine || undefined,
        oracle_text: cmd.oracleText,
        color_identity: cmd.colorIdentity,
        oracle_id: cmd.id,
        image_uri: cmd.imageUrl || undefined,
      },
      partner: null,
      companion: null,
      cards: [],
    });
    window.requestAnimationFrame(() => searchRef.current?.focus());
  };

  const addFromSearch = async (nameOrCard: string | NonNullable<Awaited<ReturnType<typeof scryfallNamedCard>>>) => {
    let raw =
      typeof nameOrCard === 'string' ? await scryfallNamedCard(nameOrCard) : nameOrCard;
    if (!raw && typeof nameOrCard === 'string') {
      const res = await fetch(`/api/search?q=${encodeURIComponent(nameOrCard)}`);
      const data = await res.json();
      const hit = (data.cards || []).find(
        (c: { name: string }) => c.name.toLowerCase() === nameOrCard.toLowerCase(),
      ) || (data.cards || [])[0];
      if (hit) raw = hit;
    }
    if (!raw) return;
    const newCard = toBrowserCard(raw, 'main');
    setCards((prev) => {
      const existing = prev.find(
        (c) => c.board === 'main' && c.name.toLowerCase() === newCard.name.toLowerCase(),
      );
      if (existing && (existing.isBasicLand || existing.quantity >= 1)) {
        if (existing.isBasicLand) {
          return prev.map((c) =>
            c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c,
          );
        }
      }
      if (existing && !existing.isBasicLand) {
        // singleton — don't add duplicate
        return prev;
      }
      return [...prev, newCard];
    });
    setPreviewId(newCard.id);
    setSuggestOpen(false);
    setResults([]);
    setQuery('');
  };

  const searchCards = async (exact?: string) => {
    const q = (exact ?? query).trim();
    if (!q) return;
    setLoading(true);
    setSuggestOpen(false);
    try {
      if (exact) {
        await addFromSearch(exact);
      } else {
        const names = suggestions.length
          ? suggestions
          : await scryfallAutocomplete(q);
        const top = names.slice(0, 8);
        const resolved = await Promise.all(top.map((n) => scryfallNamedCard(n)));
        setResults(resolved.filter(Boolean));
      }
    } finally {
      setLoading(false);
    }
  };

  const removeCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    if (previewId === id) setPreviewId(null);
  };

  const setAsCommander = (id: string) => {
    setCards((prev) =>
      prev.map((c) => ({
        ...c,
        board: c.id === id ? 'commander' : c.board === 'commander' ? 'main' : c.board,
      })),
    );
  };

  const gridClass =
    view === 'dense'
      ? 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7'
      : view === 'list'
        ? 'space-y-1'
        : 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-zinc-900 flex flex-col">
      {/* Top chrome */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <Link href="/" className="text-sm font-semibold text-[#5b2d8e] hover:underline">
            Tablebound
          </Link>
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            onBlur={() => {
              if (!deckName.trim()) setDeckName('Untitled Deck');
              persist();
            }}
            className="text-base font-semibold bg-transparent border-b border-transparent hover:border-zinc-300 focus:border-[#5b2d8e] focus:outline-none max-w-[14rem]"
          />
          <nav className="hidden md:flex items-center gap-3 text-sm text-zinc-600 ml-2">
            <span className="cursor-default opacity-50">Primer</span>
            <button
              type="button"
              className="hover:text-[#5b2d8e] disabled:opacity-40"
              disabled={!commander || mainCount < 1}
              onClick={() => {
                persist();
                router.push('/play');
              }}
            >
              Playtest
            </button>
            <span className="cursor-default opacity-50">Bulk Edit</span>
          </nav>
          <div className="flex-1" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openCreateModal();
            }}
            className="text-sm font-semibold bg-[#5b2d8e] hover:bg-[#6d3aa8] text-white px-3 py-1.5 rounded"
          >
            Create New Deck
          </button>
          <button
            type="button"
            onClick={() => {
              persist();
              router.push('/play/ai?src=deck');
            }}
            disabled={!commander}
            className="text-sm border border-zinc-300 hover:border-[#5b2d8e] px-3 py-1.5 rounded disabled:opacity-40"
          >
            vs AI
          </button>
        </div>

        <div className="px-4 pb-3 flex flex-wrap items-start gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-xl" onClick={(e) => e.stopPropagation()}>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length && setSuggestOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && suggestions.length) {
                  e.preventDefault();
                  setSuggestOpen(true);
                  setSuggestIndex((i) => Math.min(i + 1, suggestions.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp' && suggestions.length) {
                  e.preventDefault();
                  setSuggestIndex((i) => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (suggestOpen && suggestIndex >= 0 && suggestions[suggestIndex]) {
                    void addFromSearch(suggestions[suggestIndex]);
                  } else if (suggestions[0]) {
                    void addFromSearch(suggestions[0]);
                  } else {
                    void searchCards();
                  }
                }
                if (e.key === 'Escape') setSuggestOpen(false);
              }}
              placeholder="Find and add cards to main deck..."
              autoComplete="off"
              className="w-full rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm focus:outline-none focus:border-[#5b2d8e] focus:ring-1 focus:ring-[#5b2d8e]"
            />
            {suggestOpen && suggestions.length > 0 && (
              <ul className="absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl text-sm">
                {suggestions.map((name, i) => (
                  <li key={name}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 ${
                        i === suggestIndex ? 'bg-purple-50' : 'hover:bg-zinc-50'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void addFromSearch(name);
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {results.length > 0 && !suggestOpen && (
              <ul className="absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl text-sm">
                {results.map((card) =>
                  card ? (
                    <li key={card.oracle_id || card.name}>
                      <button
                        type="button"
                        className="w-full flex justify-between gap-2 text-left px-3 py-2 hover:bg-zinc-50"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void addFromSearch(card);
                        }}
                      >
                        <span>{card.name}</span>
                        <span className="text-zinc-400 text-xs">{card.mana_cost}</span>
                      </button>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void searchCards()}
            className="rounded-full bg-[#5b2d8e] hover:bg-[#6d3aa8] text-white px-3 py-2 text-sm disabled:opacity-50"
            title="Search"
          >
            {loading ? '…' : '🔍'}
          </button>
          <div className="w-full text-xs text-zinc-500 flex gap-3 pl-1">
            <span>Advanced Search</span>
            <span>EDHRecs</span>
            <span>Tips</span>
          </div>
        </div>
      </header>

      {!started && !showCreate ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <p className="text-lg text-zinc-600">Zatím nemáš otevřený deck.</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="bg-[#5b2d8e] hover:bg-[#6d3aa8] text-white font-semibold px-5 py-2.5 rounded"
            >
              Create New Deck
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] p-4 pb-20 min-h-0">
            {/* Left preview */}
            <aside className="lg:sticky lg:top-4 lg:self-start space-y-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="mx-auto aspect-[5/7] w-full max-w-[260px] overflow-hidden rounded-lg bg-zinc-100">
                  {preview?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview.imageUrl}
                      alt={preview.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-400 p-4 text-center">
                      {preview?.name || 'Select a card'}
                    </div>
                  )}
                </div>
                {preview && (
                  <div className="mt-3 px-1 space-y-1">
                    <p className="font-semibold text-sm">{preview.name}</p>
                    {preview.manaCost && (
                      <p className="text-xs text-zinc-500">{preview.manaCost}</p>
                    )}
                    {preview.typeLine && (
                      <p className="text-xs text-zinc-500">{preview.typeLine}</p>
                    )}
                    {preview.oracleText && (
                      <p className="text-xs text-zinc-600 mt-2 leading-relaxed whitespace-pre-wrap">
                        {preview.oracleText}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </aside>

            {/* Deck grid */}
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
                <span className="text-zinc-500">View</span>
                <select
                  value={view}
                  onChange={(e) => setView(e.target.value as ViewMode)}
                  className="rounded border border-zinc-300 bg-white px-2 py-1"
                >
                  <option value="grid">Visual Grid</option>
                  <option value="dense">Dense Grid</option>
                  <option value="list">List</option>
                </select>
                <span className="ml-2 text-zinc-500">Group</span>
                <select
                  value={groupBy}
                  disabled
                  className="rounded border border-zinc-300 bg-white px-2 py-1"
                >
                  <option value="type">Type</option>
                </select>
                <span className="ml-2 text-zinc-500">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortMode)}
                  className="rounded border border-zinc-300 bg-white px-2 py-1"
                >
                  <option value="name">Name</option>
                  <option value="cmc">CMC</option>
                </select>
              </div>

              {groups.map((group) => (
                <section key={group.key}>
                  <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-2">
                    <h3 className="text-sm font-semibold text-zinc-700">
                      {group.key}{' '}
                      <span className="font-normal text-zinc-400">({group.count})</span>
                    </h3>
                    {group.key === 'Commander' && (
                      <button
                        type="button"
                        className="text-xs text-[#5b2d8e] hover:underline"
                        onClick={openCreateModal}
                      >
                        Change
                      </button>
                    )}
                  </div>
                  <ul className={gridClass}>
                    {group.cards.map((card) => (
                      <li key={card.id}>
                        <button
                          type="button"
                          className={`group relative w-full rounded-lg text-left transition ${
                            previewId === card.id ? 'ring-2 ring-[#5b2d8e]' : ''
                          }`}
                          onMouseEnter={() => setPreviewId(card.id)}
                          onClick={() => setPreviewId(card.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, card });
                          }}
                        >
                          {view === 'list' ? (
                            <div className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-white border border-transparent hover:border-zinc-200 text-sm bg-white/60">
                              <span>
                                {card.quantity > 1 ? `${card.quantity}× ` : ''}
                                {card.name}
                              </span>
                              <span className="text-zinc-400 text-xs">{card.manaCost}</span>
                            </div>
                          ) : (
                            <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
                              <div className="aspect-[5/7] w-full bg-zinc-100">
                                {card.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={card.imageUrl}
                                    alt={card.name}
                                    className="h-full w-full object-cover object-top"
                                  />
                                ) : (
                                  <div className="flex h-full items-end p-2 text-xs">
                                    {card.name}
                                  </div>
                                )}
                                {card.quantity > 1 && (
                                  <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                    {card.quantity}×
                                  </span>
                                )}
                              </div>
                              <div className="truncate px-2 py-1.5 text-[11px] text-zinc-500">
                                {card.name}
                              </div>
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {cards.length === 0 && (
                <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-zinc-500">
                  Přidej karty přes search nahoře.
                </div>
              )}
            </div>
          </div>

          {/* Bottom status bar */}
          <footer className="fixed bottom-0 inset-x-0 z-30 bg-[#5b2d8e] text-white text-sm px-4 py-2.5 flex flex-wrap items-center gap-4 shadow-lg">
            <span className="font-medium">
              {mainCount} main deck / {sideCount} sideboard
            </span>
            <span className="opacity-90">
              {commander ? `Commander · ${commander.name}` : 'No commander'}
            </span>
            <span className="ml-auto flex items-center gap-2 text-xs tabular-nums opacity-95">
              {curve.map((n, i) => (
                <span key={i} title={`CMC ${i === 7 ? '7+' : i}`}>
                  {i === 7 ? '7+' : i}:{n}
                </span>
              ))}
            </span>
            <button
              type="button"
              className="text-xs underline opacity-90 hover:opacity-100"
              onClick={persist}
            >
              Save
            </button>
          </footer>
        </>
      )}

      {/* Create New Deck modal — Moxfield-like */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => {
            if (started) setShowCreate(false);
          }}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white text-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-xl font-bold">Create New Deck</h2>
              <button
                type="button"
                className="text-zinc-400 hover:text-zinc-700 text-xl leading-none px-1"
                onClick={() => {
                  if (started) setShowCreate(false);
                  else setShowCreate(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Name</span>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded border-2 border-[#5b2d8e] px-3 py-2 text-sm focus:outline-none"
                  autoFocus
                />
                <span className="flex gap-1.5 text-[11px] text-amber-700 leading-snug">
                  <span aria-hidden>⚠</span>
                  Tablebound is family-friendly. Please keep deck names respectful.
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Format</span>
                  <select
                    value={createFormat}
                    disabled
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm bg-zinc-50"
                  >
                    <option>Commander / EDH</option>
                  </select>
                </label>

                <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  <span className="text-sm font-medium">Commander</span>
                  <div className="relative">
                    <input
                      ref={cmdSearchRef}
                      type="text"
                      value={cmdQuery}
                      onChange={(e) => {
                        setCmdQuery(e.target.value);
                        setPickedCommander(null);
                      }}
                      onFocus={() => cmdSuggestions.length && setCmdSuggestOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && cmdSuggestions[0]) {
                          e.preventDefault();
                          void pickCommanderSuggestion(cmdSuggestions[0]);
                        }
                      }}
                      placeholder="Who is your commander?"
                      className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-[#5b2d8e]"
                    />
                    {cmdSuggestOpen && cmdSuggestions.length > 0 && (
                      <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded border border-zinc-200 bg-white shadow-lg text-sm">
                        {cmdSuggestions.map((name) => (
                          <li key={name}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-1.5 hover:bg-purple-50"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                void pickCommanderSuggestion(name);
                              }}
                            >
                              {name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {pickedCommander && (
                    <p className="text-xs text-[#5b2d8e] font-medium">
                      ✓ {pickedCommander.name}
                    </p>
                  )}
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={cmdLegalOnly}
                      onChange={(e) => setCmdLegalOnly(e.target.checked)}
                      className="accent-[#5b2d8e]"
                    />
                    Search only legal cards
                  </label>
                </div>
              </div>

              <div className="border-t border-zinc-200 pt-3 text-sm text-zinc-500">
                ▸ Advanced options
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={createBusy}
                  onClick={() => void submitCreate()}
                  className="bg-[#5b2d8e] hover:bg-[#6d3aa8] text-white font-semibold px-5 py-2 rounded disabled:opacity-50"
                >
                  {createBusy ? '…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-zinc-100"
            onClick={() => {
              setAsCommander(contextMenu.card.id);
              setContextMenu(null);
            }}
          >
            Set as commander
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
            onClick={() => {
              removeCard(contextMenu.card.id);
              setContextMenu(null);
            }}
          >
            Remove from deck
          </button>
        </div>
      )}
    </div>
  );
}
