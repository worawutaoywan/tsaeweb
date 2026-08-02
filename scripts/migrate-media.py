#!/usr/bin/env python3
"""Rewrite old.tsae.asia media URLs to local /wp-uploads/ paths in CMS JSON."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CMS = ROOT / "data" / "cms"

UPLOAD_PATTERNS = [
    re.compile(r"https?://old\.tsae\.asia/wp-content/uploads/"),
    re.compile(r"https?://www\.tsae\.asia/wp-content/uploads/"),
    re.compile(r"/wp-content/uploads/"),
]

OLD_SITE = re.compile(r"https?://old\.tsae\.asia")


def rewrite_url(url: str | None) -> str | None:
    if not url:
        return url
    for pat in UPLOAD_PATTERNS:
        if pat.search(url):
            return pat.sub("/wp-uploads/", url)
    return url


def rewrite_html(html: str) -> str:
    out = html
    for pat in UPLOAD_PATTERNS:
        out = pat.sub("/wp-uploads/", out)
    # Drop remaining old-site links (gallery permalinks etc.) — keep text only
    out = OLD_SITE.sub("https://www.tsae.asia", out)
    return out


def process_news() -> None:
    path = CMS / "news.json"
    items = json.loads(path.read_text(encoding="utf-8"))
    for item in items:
        item["image"] = rewrite_url(item.get("image"))
        item["html"] = rewrite_html(item.get("html") or "")
        if item.get("excerpt"):
            item["excerpt"] = rewrite_html(item["excerpt"])
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"news: {len(items)} items")


def main() -> None:
    process_news()
    print("done")


if __name__ == "__main__":
    main()
