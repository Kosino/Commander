import gzip
import json
import sys
from pathlib import Path

DATA_PATH = Path(__file__).parent / "data" / "oracle-cards.jsonl.gz"

def search(query: str, limit: int = 20):
    query = query.lower()
    results = []
    with gzip.open(DATA_PATH, "rt", encoding="utf-8") as f:
        for line in f:
            card = json.loads(line)
            name = card.get("name", "").lower()
            oracle = card.get("oracle_text", "") or ""
            if query in name or query in oracle.lower():
                results.append({
                    "name": card.get("name"),
                    "mana_cost": card.get("mana_cost"),
                    "type_line": card.get("type_line"),
                    "oracle_text": oracle[:200] + "..." if len(oracle) > 200 else oracle,
                    "power": card.get("power"),
                    "toughness": card.get("toughness"),
                    "color_identity": card.get("color_identity"),
                    "oracle_id": card.get("oracle_id"),
                    "keywords": card.get("keywords") or [],
                })
                if len(results) >= limit:
                    break
    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 search_cards.py <query>")
        sys.exit(1)
    q = " ".join(sys.argv[1:])
    results = search(q)
    print(json.dumps(results, ensure_ascii=False))