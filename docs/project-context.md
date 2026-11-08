# Project context — MTG client

## Cesty

- Root: `C:\Users\Honza\Documents\AI\MTG client`
- Frontend: `web/` (Next.js, React, Tailwind) — `npm run dev` v `web/`
- Engine: `web/lib/engine/` — triggers/watchers, cast modes, continuous/tribal/changeling, emblems, extra turns; replacement layers; devotion/domain/XP/energy; sagas; explore/fabricate/support/bolster/backup; renown/training/battalion/bloodthirst/devour; combat/PW/ward; `ai.ts` demo P2
- Herní UX konzultovat s MTG Arena; CR = autorita pravidel
- Play UI: `web/app/play` (demo, nebo `?src=deck` z builderu přes sessionStorage)
- Deck helpers: `web/lib/deck.ts`
- Search API: `web/app/api/search/route.ts` → `search_cards.py`
- Card data: `data/oracle-cards.jsonl.gz` (nečíst celý)
- Rules: `docs/rulebook.md` (nadřazené), `docs/MagicCompRules_*.txt` (CR)

## Stack

- Next.js 16 + React 19 + TypeScript + Tailwind 4
- Python pro lokální oracle search
- Multiplayer: `solo-ai` (`/play`) + **online 2P** (`/play/online`, SSE + `.data/rooms.json`)

## Ověření

- Preferuj `tsc` / `lint` / krátký `python search_cards.py <q>`
- Browser / screenshot jen na žádost
- Pokud chybí Node v PATH: nahlásit jednou

## Mimo scope

- Hvězdný Přístav, Expo, GamingRig, EDH-Social
