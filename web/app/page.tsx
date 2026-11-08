import Link from 'next/link';
import { Fraunces, Manrope } from 'next/font/google';
import './landing.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-landing-display',
});

const sans = Manrope({
  subsets: ['latin'],
  variable: '--font-landing-sans',
});

const MODULES = [
  { href: '/builder', label: 'Deckbuilder' },
  { href: '/play', label: 'Play online' },
] as const;

export default function LandingPage() {
  return (
    <div className={`${display.variable} ${sans.variable} landing`}>
      <div className="landing__glow" aria-hidden />
      <div className="landing__grain" aria-hidden />

      <header className="landing__nav">
        <Link href="/" className="landing__nav-brand">
          Tablebound
        </Link>
        <nav className="landing__menu" aria-label="Moduly">
          {MODULES.map((m) => (
            <Link key={m.href} href={m.href} className="landing__menu-link">
              {m.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="landing__hero">
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
          <p className="landing__brand">Tablebound</p>
          <h1 className="landing__headline">Commander u stolu, ne v chaotickém UI.</h1>
          <p className="landing__lede">
            Lokální deckbuilder a hra — proti příteli nebo AI. Pravidla podle CR, flow inspirované Arena.
          </p>
          <div className="landing__cta">
            <Link href="/builder" className="landing__btn landing__btn--primary">
              Deckbuilder
            </Link>
            <Link href="/play" className="landing__btn landing__btn--ghost">
              Play online
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
