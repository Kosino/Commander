# AGENTS — MTG client

Krátký entrypoint. Detaily: `.cursor/rules/` + `docs/project-context.md`.

## Priorita

1. Úspora tokenů (krátké odpovědi, cílené čtení, diff-first, žádná media bez žádosti).
2. Rulebook/CR je autorita pro herní logiku; **MTG Arena** inspiruje UX / herní flow (targeting, combat declare, stack, prompty).
3. Todos místo `notes.md`.
4. Inline plan OK; plný Plan mode na žádost.
5. Explore/parallel OK při neznámém povrchu; jinak 1 worker + resume.
6. Cloud agent povolen; lokální default.

## Stack (zkratka)

- `web/` — Next.js deck builder + engine (`web/lib/engine/`)
- `search_cards.py` + `data/oracle-cards.jsonl.gz` — lokální Scryfall
- `docs/rulebook.md` + CR txt — pravidla hry
