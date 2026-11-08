import Link from 'next/link';
import { Fraunces, Manrope } from 'next/font/google';
import '../landing.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-landing-display',
});

const sans = Manrope({
  subsets: ['latin'],
  variable: '--font-landing-sans',
});

const MODES = [
  {
    href: '/play/online',
    label: 'Play against friend',
    blurb: 'Soukromá místnost 1v1 — pošli kód kamarádovi.',
  },
  {
    href: '/play/ai',
    label: 'Play against AI',
    blurb: 'Solo proti demo soupeři. Deck ze session nebo demo.',
  },
] as const;

export default function PlayModesPage() {
  return (
    <div className={`${display.variable} ${sans.variable} landing`}>
      <div className="landing__glow" aria-hidden />
      <div className="landing__grain" aria-hidden />

      <header className="landing__nav">
        <Link href="/" className="landing__nav-brand">
          Tablebound
        </Link>
        <nav className="landing__menu" aria-label="Moduly">
          <Link href="/builder" className="landing__menu-link">
            Deckbuilder
          </Link>
          <Link href="/play" className="landing__menu-link" aria-current="page">
            Play online
          </Link>
        </nav>
      </header>

      <main className="landing__hero landing__hero--modes">
        <div className="landing__visual" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="landing__art"
            src="https://api.scryfall.com/cards/named?exact=Canopy%20Vista&format=image&version=art_crop"
            alt=""
          />
          <div className="landing__art-veil" />
        </div>

        <div className="landing__copy">
          <p className="landing__brand landing__brand--sm">Play online</p>
          <h1 className="landing__headline">Vyber herní mód</h1>
          <p className="landing__lede">Na začátek stačí přítel nebo AI. Další módy přijdou později.</p>

          <ul className="landing__modes">
            {MODES.map((m) => (
              <li key={m.href}>
                <Link href={m.href} className="landing__mode">
                  <span className="landing__mode-label">{m.label}</span>
                  <span className="landing__mode-blurb">{m.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>

          <Link href="/" className="landing__back">
            ← Zpět na úvod
          </Link>
        </div>
      </main>
    </div>
  );
}
