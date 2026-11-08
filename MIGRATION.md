# Migrace projektu MTG do Cursoru

## Obsah balíčku `mtg-cursor-migration.tar.gz`

- `README.md` – přehled projektu
- `search_cards.py` – lokální vyhledávání karet
- `docs/rulebook.md` – nadřazená pravidla (CR 2026 + Commander)
- `docs/MagicCompRules_20261106.txt` – oficiální Comprehensive Rules
- `data/oracle-cards.jsonl.gz` – Scryfall oracle_cards (~39k karet)
- `web/` – Next.js frontend (deck builder s validací + rules engine skeleton)

## Instrukce pro Cursor

1. Stáhni `mtg-cursor-migration.tar.gz` (odkaz níže).
2. Rozbal do nové složky:
   ```bash
   mkdir mtg-client && cd mtg-client
   tar -xzf ../mtg-cursor-migration.tar.gz
   ```
3. Otevři složku v Cursoru.
4. Nainstaluj závislosti a spusť:
   ```bash
   cd web
   npm install
   npm run dev
   ```
5. Otevři `http://localhost:3000`.

## Co je hotové

- Deck builder s validací (100 karet, singleton, color identity, commander)
- Lokální Scryfall data + vyhledávání
- Aktuální Comprehensive Rules (6. 11. 2026) + živý rulebook
- Základní rules engine struktury v `web/lib/engine/types.ts`

## Doporučené další kroky v Cursoru

1. ✅ Mana curve + statistiky decku
2. ✅ Export/import decku (JSON / text)
3. ✅ `createInitialGameState` (shuffle, draw 7, command zone, life 40)
4. ✅ Priority loop + SBA (704 + commander 21 / relocate)
5. ✅ Základní herní plátno (`/play` — zóny, priority, pass, land/cheat)
6. ✅ Casting + mana (tap land, pay cost, stack resolve → BF/GY)
7. ✅ Targeting (Arena-like) + MVP oracle (damage/draw/life)
8. ✅ Combat MVP (declare attackers/blockers + damage + commander dmg)
9. Lepší blocker UI / first strike / multi-block damage
10. ✅ Deck builder → play (sessionStorage + demo opponent)
11. ✅ First/double strike damage waves + demo AI (P2 auto-pass/combat)
12. ❌ Hotseat zrušen
13. ✅ Online 2P MVP (create/join room, polling, fog of war ruky)
14. ✅ Online: vlastní deck (session / JSON / demo) při create/join
15. ✅ Online: persistence (`.data/rooms.json`) + SSE sync
16. ✅ Oracle efekty rozšířeny + online SBA choices
17. ✅ Damage assignment multi-block, haste, land 1×/tah, pump/mill/discard
18. Redis multi-instance; ještě oracle (counter, tokens…)

---

*Projekt je připravený na pokračování v Cursoru bez omezení sandboxu.*
