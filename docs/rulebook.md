# MTG Rulebook

**Status:** Nadřazený zdroj pravdy pro celou aplikaci a rules engine.  
**Verze:** Comprehensive Rules effective as of **November 6, 2026**.  
**Zdroj:** `docs/MagicCompRules_20261106.txt` (oficiální text od Wizards of the Coast).

Tento dokument a oficiální Comprehensive Rules mají přednost před jakoukoli implementací v kódu. Rules engine musí odpovídat aktuálním pravidlům.

## Proces aktualizace pravidel

Pravidla se aktualizují typicky s novými edicemi (nové mechaniky, keywordy, typy karet…).

**Když vyjde nová verze:**
1. Stáhni nový oficiální Comprehensive Rules text.
2. Nahraď soubor `docs/MagicCompRules_YYYYMMDD.txt`.
3. Aktualizuj verzi a datum v tomto souboru (`docs/rulebook.md`).
4. Doplň nové sekce / mechaniky do „Klíčových konceptů pro engine“ níže.
5. Aktualizuj rules engine (nové keywordy, card types, state-based actions, atd.).
6. Otestuj Commander-specifické pravidla a základní interakce.

## Formát Commander (EDH)

Projekt je zaměřen výhradně na formát **Commander**.  
Oficiální pravidla formátu jsou v Comprehensive Rules jako **rule 903** a doplňující text na [mtgcommander.net](https://mtgcommander.net/index.php/rules/).

### Deck Construction (shrnutí z CR 903 + oficiálních Commander rules)
- Legendary creature jako **commander**.
- Deck má **přesně 100 karet** (včetně commandera).
- **Singleton**: kromě basic lands žádné dvě karty se stejným English name (výjimky podle textu karty).
- **Color identity**: barva karty + mana symboly v textu. Musí být subset color identity commandera. Fixní před začátkem hry.
- Companion je povolen, pokud splňuje color identity a singleton (efektivně 101. karta mimo deck).

### Play Rules (shrnutí)
- Starting life: **40**.
- Commander začíná v **command zone**.
- Cast z command zone má dodatečný cost {2} za každý předchozí cast z command zone.
- Replacement: pokud by commander šel do graveyardu, exile, hand nebo library, owner může místo toho dát do command zone.
- **Commander damage**: 21 combat damage od stejného commandera = loss (state-based action).
- Wish efekty (karty z outside the game) v Commanderu nefungují.

## Klíčové koncepty pro rules engine (z CR 2026)

### Zóny (section 4)
- Library, Hand, Battlefield, Graveyard, Stack, Exile, Command.
- Commander žije v Command zone.

### Objekty a charakteristiky (109)
- Characteristics: name, mana cost, color, type line, abilities, power/toughness, loyalty, defense, …
- Permanent types: Artifact, Battle, Creature, Enchantment, Land, Planeswalker.
- Novější typy: Kindred (dříve Tribal), Dungeon, Battle, atd.

### Priority, Stack, Timing (117, 405)
- Priorita, instant vs sorcery speed.
- Stack pro spells a abilities.

### Turn Structure (section 5)
- Beginning Phase (Untap → Upkeep → Draw)
- Main Phase
- Combat Phase (Begin Combat → Declare Attackers → Declare Blockers → Combat Damage → End of Combat)
- Ending Phase (End Step → Cleanup)

### State-Based Actions (704)
- Dying creatures, life ≤ 0, empty library, poison ≥ 10, legend rule, commander damage 21, world rule, atd.
- Kontrolují se vždy před prioritou.

### Mana (106)
- 5 barev + colorless.
- Mana pool se vyprazdňuje na konci kroku/fáze.
- Mana abilities (605).

### Tokens, Emblems, Counters
- Tokens nejsou karty (111).
- Emblems v command zone (114).
- Různé typy counters (122).

### Novější mechaniky (které engine musí umět)
- Double-faced cards, Meld, Saga, Class, Case, Station, Omen, Preparation, Prototype, Adventurer, …
- Day/Night, Monarch, Initiative, Rad counters, Stickers, Battles, Dungeons, …
- Keywordy: Flying, Trample, Haste, Lifelink, Deathtouch, Ward, Flash, Cascade, Mutate, Companion, Partner, …

## Rules Engine – rozhodnutí

**Rules engine je to, co primárně tvoří hru v herním modulu.**

Inspirace z MTG Arena (průběžně konzultovat při herním UX):
- **Game Rules Engine (GRE)** – jádro (priority, fáze, SBA, casting, combat, damage, zóny…).
- **Klientské prompty** – targeting highlight, cast cancel, combat declare→Confirm, stack.
- **Parser Oracle textu** – `oracle_text` → vykonatelné efekty (MVP regex; později bohatší).

**Architektura:**
1. Core Rules Engine (TypeScript) implementuje Comprehensive Rules.
2. Card effects vrstva používá Scryfall `oracle_text` + `type_line` + `mana_cost` + `color_identity`.
3. Rulebook + oficiální CR soubor jsou nadřazené – každá změna v kódu se ověřuje proti nim.

Herní modul musí:
- Rozpoznávat typy karet a vytvářet tokeny / counters / emblems.
- Správně řešit targeting, stack, priority, state-based actions.
- Respektovat Commander-specifická pravidla (command zone, tax, commander damage tracking, color identity při deck buildu).

## Další kroky pro engine
- [x] Datové struktury: `GameState`, `Player`, zóny, `CardInstance`, stack stub.
- [x] Priority loop + turn structure (`priority.ts`, `turn.ts`).
- [x] State-based actions checker (704.5 základní + 704.6c/d commander).
- [x] Casting / mana / stack resolve.
- [x] Targeting (Arena-like pendingCast) + MVP oracle efekty (damage, draw, gain life).
- [x] Combat MVP (declare attackers/blockers, damage, commander damage).
- [x] Integrace deck builder → play (vs demo opponent).
- [x] First/double strike (2× combat damage step) + demo AI P2.
- [x] Solo vs AI; online 2P (SSE + persistence + decky).
- [x] Oracle: damage/destroy/exile/bounce/tap/pump/mill/discard/draw/life.
- [x] Combat: FS/DS, multi-block assignment, deathtouch, haste; land 1×/tah.
- [x] Trigger stack (ETB/dies/attack/landfall/prowess na stack).
- [x] Prevention shields + modal / X / kicker cast announcement.
- [x] Mana: X, hybrid, phyrexian (2 life); continuous anthems (MVP).
- [x] Targeted ETB; delayed EOT/EoC; convoke/delve; attack PW; flicker/copy/control.
- [x] Step triggers (upkeep/draw/end); ETB tapped; affinity/improvise/overload/evoke; cleanup discard; combat-dmg triggers on stack.
- [x] Buyback/rebound; ETB counters; continuous keyword grants; split second; can't be countered; additional costs; cast-a-spell triggers.
- [x] Temp keywords UEOT; regenerate; mass wipe/bounce/exile; each-player sac; pump/untap all; copy spell.
- [x] Dies/ETB watchers; equal-to draw/life/damage; emblems; extra turn; tribal/artifact anthems; land from hand.
- [x] Replacement layers MVP: fog / all-damage prevent, redirect, GY→exile, draw doubling; devotion/domain; experience/energy; look-at / put top-bottom / exile GY.
- [x] Sagas (lore + chapters); explore; fabricate/support/bolster/backup; renown/training/battalion/bloodthirst/devour; changeling tribal.
- [ ] Redis multi-instance (online rooms).

---

*Tento rulebook je živý dokument. Při každém update Comprehensive Rules aktualizuj zdrojový soubor a klíčové sekce výše.*
