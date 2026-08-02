#!/usr/bin/env python3
"""Normalize WordPress percent-encoded Thai slugs to stable ASCII ids."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
NEWS_PATH = ROOT / "data" / "cms" / "news.json"

ASCII_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$", re.I)


def needs_fix(slug: str) -> bool:
    return "%" in slug or bool(re.search(r"[^\x00-\x7F]", slug))


def make_slug(item: dict, used: set[str]) -> str:
    orig = item["id"]
    if not needs_fix(orig) and orig not in used:
        used.add(orig)
        return orig

    # Prefer existing ASCII prefix (WP sometimes keeps trailing ascii)
    ascii_bits = re.findall(r"[a-z0-9-]{4,}", orig.lower())
    if ascii_bits:
        candidate = max(ascii_bits, key=len)[:60].strip("-")
        if candidate and candidate not in used:
            used.add(candidate)
            return candidate

    digest = hashlib.sha1(f"{orig}|{item.get('title', '')}".encode()).hexdigest()[:10]
    slug = f"post-{digest}"
    n = 2
    while slug in used:
        slug = f"post-{digest}-{n}"
        n += 1
    used.add(slug)
    return slug


def main() -> None:
    items = json.loads(NEWS_PATH.read_text(encoding="utf-8"))
    used: set[str] = set()
    changed = 0
    for item in items:
        new_id = make_slug(item, used)
        if new_id != item["id"]:
            item["legacySlug"] = unquote(item["id"])
            item["id"] = new_id
            changed += 1
    NEWS_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"fixed {changed} slugs, {len(items)} total")


if __name__ == "__main__":
    main()
