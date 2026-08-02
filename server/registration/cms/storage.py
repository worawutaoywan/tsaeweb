"""JSON storage helpers for TSAE CMS."""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CMS_DIR_NAME = "cms"
NEWS_FILE = "news.json"
EVENTS_FILE = "events.json"
HERO_FILE = "hero.json"
PAGES_FILE = "pages.json"

NEWS_CATEGORIES = ("announcement", "conference", "training", "journal", "activity")
EVENT_TYPES = ("national", "international", "training", "webinar")
EVENT_STATUSES = ("upcoming", "past", "ongoing")


def cms_dir(data_dir: Path) -> Path:
    d = data_dir / CMS_DIR_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:60] or "item"


def unique_id(items: list[dict], base: str) -> str:
    used = {i.get("id") for i in items}
    if base not in used:
        return base
    n = 2
    while f"{base}-{n}" in used:
        n += 1
    return f"{base}-{n}"


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_news(data_dir: Path) -> list[dict]:
    return read_json(cms_dir(data_dir) / NEWS_FILE, [])


def save_news(data_dir: Path, items: list[dict]) -> None:
    write_json(cms_dir(data_dir) / NEWS_FILE, items)


def load_events(data_dir: Path) -> list[dict]:
    return read_json(cms_dir(data_dir) / EVENTS_FILE, [])


def save_events(data_dir: Path, items: list[dict]) -> None:
    write_json(cms_dir(data_dir) / EVENTS_FILE, items)


def load_hero(data_dir: Path) -> list[dict]:
    return read_json(cms_dir(data_dir) / HERO_FILE, [])


def save_hero(data_dir: Path, items: list[dict]) -> None:
    write_json(cms_dir(data_dir) / HERO_FILE, items)


def load_pages(data_dir: Path) -> list[dict]:
    return read_json(cms_dir(data_dir) / PAGES_FILE, [])


def save_pages(data_dir: Path, items: list[dict]) -> None:
    write_json(cms_dir(data_dir) / PAGES_FILE, items)
