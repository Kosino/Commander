'use client';

import type { ManaCost } from '../../lib/engine';
import type { ManaColor } from '../../lib/engine';

const ORDER: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];

type Props = {
  cost?: ManaCost | null;
  pool?: Partial<Record<ManaColor, number>> | null;
  className?: string;
};

function Gem({ label, color }: { label: string; color: string }) {
  return (
    <span className="play-mana-gem" style={{ ['--gem' as string]: color }} title={label}>
      {label}
    </span>
  );
}

const COL: Record<string, string> = {
  W: '#f0e6c8',
  U: '#0e68ab',
  B: '#4a3b4a',
  R: '#d3202a',
  G: '#00733e',
  C: '#9a9a9a',
  X: '#8a8a8a',
};

/** Arena-like mana gems for cost and/or floating pool. */
export function ManaGems({ cost, pool, className }: Props) {
  const gems: { key: string; label: string; color: string }[] = [];
  if (cost) {
    if (cost.generic > 0) gems.push({ key: `g${cost.generic}`, label: String(cost.generic), color: COL.C });
    for (const c of ORDER) {
      for (let i = 0; i < (cost[c] || 0); i++) {
        gems.push({ key: `${c}${i}`, label: c === 'C' ? 'C' : c, color: COL[c] });
      }
    }
    for (const h of cost.hybrids || []) {
      gems.push({
        key: `h${h.a}${h.b}${gems.length}`,
        label: `${h.a}/${h.b}`,
        color: COL[h.a] || COL.C,
      });
    }
    for (const p of cost.phyrexian || []) {
      gems.push({ key: `p${p}${gems.length}`, label: `${p}/P`, color: COL[p] || COL.C });
    }
  }
  if (pool) {
    for (const c of ORDER) {
      const n = pool[c] || 0;
      if (n <= 0) continue;
      gems.push({ key: `pool-${c}`, label: `${n}${c}`, color: COL[c] });
    }
  }
  if (!gems.length) return <span className={className || ''}>—</span>;
  return (
    <span className={`play-mana-gems ${className || ''}`}>
      {gems.map((g) => (
        <Gem key={g.key} label={g.label} color={g.color} />
      ))}
    </span>
  );
}
