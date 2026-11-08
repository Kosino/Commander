# MTG Commander Client

Webový herní klient pro Magic: The Gathering zaměřený na formát **Commander (EDH)**.

## Cíle
- Hraní zápasů proti AI
- Online multiplayer
- Deck builder (MVP ve stylu Moxfield)
- Správa sbírky
**Pravidla:** Aktuální Comprehensive Rules (efektivní od 6. listopadu 2026) v `docs/MagicCompRules_20261106.txt` + `docs/rulebook.md` (nadřazený zdroj).

## Tech Stack (doporučený)
- **Frontend**: Next.js (React) + TypeScript + Tailwind CSS
- **Backend**: Node.js / Next.js API routes nebo samostatný NestJS / Fastify
- **Realtime**: Socket.io nebo WebSockets pro multiplayer a herní stav
- **Databáze**: PostgreSQL (decky, sbírky, uživatelé) + lokální Scryfall data (JSONL)
- **Rules Engine**: Vlastní implementace v TypeScript (nebo později Rust), inspirovaná MTG Arena GRE
- **Data karet**: Scryfall bulk `oracle_cards` (lokálně v `data/oracle-cards.jsonl.gz`)

## Struktura
```
docs/rulebook.md                  ← nadřazená pravidla (CR 2026)
docs/MagicCompRules_20261106.txt  ← oficiální Comprehensive Rules
data/oracle-cards.jsonl.gz        ← Scryfall data
search_cards.py                   ← lokální vyhledávání
web/                              ← Next.js frontend (deck builder)
```

## První kroky
1. ✅ Stáhnout Scryfall oracle_cards
2. ✅ Vytvořit rulebook.md (aktuální CR 2026)
3. ✅ Nastavit Next.js projekt + základní deck builder
4. ✅ Jednoduché vyhledávání a zobrazení karet z lokálních dat (API hotové)
5. ✅ MVP deck builder (přidávání karet, validace color identity + singleton + 100 karet)
6. ✅ Mana curve + statistiky typů
7. ✅ Export/import decku (JSON + text)
8. ✅ createInitialGameState (shuffle, draw 7, command zone, life 40)
9. ✅ Priority loop + state-based actions v rules engine
10. ✅ Základní herní plátno (`/play`)
11. ✅ Casting + mana payment (stack resolve)
12. Oracle efekty / targeting

## Commander specifika
Viz `docs/rulebook.md` – 100 karet, color identity, commander damage 21, command zone, starting life 40.
