"""JSON storage helpers for TSAE CMS."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import unicodedata
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

CMS_DIR_NAME = "cms"
NEWS_FILE = "news.json"  # legacy fallback only
NEWS_DIR_NAME = "news"
EVENTS_FILE = "events.json"
HERO_FILE = "hero.json"
PAGES_FILE = "pages.json"
CAMPAIGNS_FILE = "campaigns.json"
HOME_CONFERENCES_FILE = "home-conferences.json"
HOMEPAGE_FILE = "homepage.json"
HOME_VIDEOS_FILE = "home-videos.json"

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
    """Load news from data/cms/news/*.json (same source Astro uses)."""
    news_dir = cms_dir(data_dir) / NEWS_DIR_NAME
    items: list[dict] = []
    if news_dir.is_dir():
        for path in sorted(news_dir.glob("*.json")):
            try:
                item = read_json(path, None)
            except Exception:
                continue
            if isinstance(item, dict) and item.get("id"):
                items.append(item)
    if items:
        return items
    # Legacy single-file fallback (old CMS installs)
    legacy = read_json(cms_dir(data_dir) / NEWS_FILE, [])
    return legacy if isinstance(legacy, list) else []


def save_news(data_dir: Path, items: list[dict]) -> None:
    """Rewrite the news collection directory to match Astro's loader."""
    news_dir = cms_dir(data_dir) / NEWS_DIR_NAME
    news_dir.mkdir(parents=True, exist_ok=True)
    keep_ids = set()
    for item in items:
        item_id = item.get("id")
        if not item_id:
            continue
        keep_ids.add(item_id)
        write_json(news_dir / f"{item_id}.json", item)
    for path in news_dir.glob("*.json"):
        if path.stem not in keep_ids:
            path.unlink(missing_ok=True)


def save_news_item(data_dir: Path, item: dict) -> dict:
    news_dir = cms_dir(data_dir) / NEWS_DIR_NAME
    news_dir.mkdir(parents=True, exist_ok=True)
    item_id = item.get("id") or unique_id(load_news(data_dir), slugify(item.get("title") or "news"))
    item["id"] = item_id
    write_json(news_dir / f"{item_id}.json", item)
    return item


def delete_news_item(data_dir: Path, item_id: str) -> bool:
    path = cms_dir(data_dir) / NEWS_DIR_NAME / f"{item_id}.json"
    if not path.is_file():
        return False
    path.unlink()
    return True


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


def load_campaigns(data_dir: Path) -> list[dict]:
    return read_json(cms_dir(data_dir) / CAMPAIGNS_FILE, [])


def save_campaigns(data_dir: Path, items: list[dict]) -> None:
    write_json(cms_dir(data_dir) / CAMPAIGNS_FILE, items)


def load_home_conferences(data_dir: Path) -> list[dict]:
    return read_json(cms_dir(data_dir) / HOME_CONFERENCES_FILE, [])


def save_home_conferences(data_dir: Path, items: list[dict]) -> None:
    write_json(cms_dir(data_dir) / HOME_CONFERENCES_FILE, items)


def load_homepage(data_dir: Path) -> dict:
    return read_json(cms_dir(data_dir) / HOMEPAGE_FILE, {})


def save_homepage(data_dir: Path, item: dict) -> None:
    write_json(cms_dir(data_dir) / HOMEPAGE_FILE, item)


def load_home_videos(data_dir: Path) -> list[dict]:
    return read_json(cms_dir(data_dir) / HOME_VIDEOS_FILE, [])


def save_home_videos(data_dir: Path, items: list[dict]) -> None:
    write_json(cms_dir(data_dir) / HOME_VIDEOS_FILE, items)


def campaign_event_id(slug: str) -> str:
    return f"campaign-{slug}"


def campaign_hero_id(slug: str) -> str:
    return f"campaign-hero-{slug}"


def campaign_public_path(slug: str) -> str:
    return f"/c/{slug}/"


def normalize_campaign(body: dict, existing: dict | None = None) -> dict:
    item = dict(existing or {})
    item.update(body or {})
    slug = (item.get("slug") or "").strip().strip("/")
    if not slug and item.get("titleEN"):
        slug = slugify(item["titleEN"])
    elif not slug and item.get("titleTH"):
        slug = slugify(item["titleTH"])
    item["slug"] = slug or "campaign"
    item["id"] = item.get("id") or item["slug"]
    item["enabled"] = bool(item.get("enabled", True))
    item["sortOrder"] = int(item.get("sortOrder") or 0)
    item["showOnHome"] = bool(item.get("showOnHome", True))
    item["showInHero"] = bool(item.get("showInHero", False))
    item["createEvent"] = bool(item.get("createEvent", True))
    for key in (
        "titleTH", "titleEN", "themeTH", "themeEN", "badgeTH", "badgeEN",
        "dateTH", "dateEN", "venueTH", "venueEN", "target",
        "registerUrl", "contactEmail", "posterImage", "posterPdf", "posterHtmlUrl",
        "excerptTH", "excerptEN", "descriptionTH", "descriptionEN",
        "ctaTH", "ctaEN",
    ):
        item[key] = item.get(key) or ""
    kind = (item.get("homeKind") or "").strip().lower()
    if kind not in ("conference", "call"):
        # Awards / nomination packs usually have no fees table
        kind = "call" if not item.get("fees") else "conference"
    item["homeKind"] = kind
    item["facts"] = item["facts"] if isinstance(item.get("facts"), list) else []
    item["fees"] = item["fees"] if isinstance(item.get("fees"), list) else []
    item["extraLinks"] = item["extraLinks"] if isinstance(item.get("extraLinks"), list) else []
    item["updatedAt"] = now_iso()
    return item


def sync_campaign_relations(data_dir: Path, campaign: dict) -> None:
    """Upsert or remove linked event / home card / hero slide for a campaign."""
    slug = campaign.get("slug") or ""
    if not slug:
        return
    href = campaign_public_path(slug)
    event_id = campaign_event_id(slug)
    hero_id = campaign_hero_id(slug)
    title_en = campaign.get("titleEN") or campaign.get("titleTH") or slug
    title_th = campaign.get("titleTH") or title_en
    theme_en = campaign.get("themeEN") or ""
    theme_th = campaign.get("themeTH") or theme_en
    image = campaign.get("posterImage") or ""
    register = campaign.get("registerUrl") or ""
    enabled = bool(campaign.get("enabled", True))

    # ── Event ────────────────────────────────────────────────────────────
    events = load_events(data_dir)
    events = [e for e in events if e.get("id") != event_id and e.get("id") != slug]
    # Keep legacy iaec-2026 id in sync when slug is iaec2026
    legacy_ids = {event_id}
    if slug == "iaec2026":
        legacy_ids.add("iaec-2026")
        events = [e for e in events if e.get("id") not in legacy_ids]

    if enabled and campaign.get("createEvent", True):
        start = campaign.get("target") or now_iso()
        links = [
            f'<li><a href="{href}">หน้ารายละเอียดบนเว็บ TSAE</a></li>',
        ]
        if campaign.get("posterHtmlUrl"):
            links.append(
                f'<li><a href="{campaign["posterHtmlUrl"]}">โปสเตอร์แบบ interactive (HTML)</a></li>'
            )
        if campaign.get("posterPdf"):
            links.append(
                f'<li><a href="{campaign["posterPdf"]}" target="_blank" rel="noopener">ดาวน์โหลดโปสเตอร์ PDF</a></li>'
            )
        if register:
            links.append(
                f'<li><a href="{register}" target="_blank" rel="noopener">ลงทะเบียน / ส่งบทคัดย่อ</a></li>'
            )
        html = (
            f"<p>{title_th}"
            + (f" — <strong>{theme_th}</strong>" if theme_th else "")
            + "</p><ul>"
            + "".join(links)
            + "</ul>"
        )
        event = {
            "id": "iaec-2026" if slug == "iaec2026" else event_id,
            "title": title_en,
            "titleTH": title_th,
            "startDate": start,
            "endDate": campaign.get("endDate") or None,
            "location": campaign.get("venueEN") or "",
            "locationTH": campaign.get("venueTH") or campaign.get("venueEN") or "",
            "type": "international",
            "status": campaign.get("eventStatus") or "upcoming",
            "registrationUrl": register or href,
            "image": image,
            "excerpt": campaign.get("excerptEN") or theme_en or title_en,
            "excerptTH": campaign.get("excerptTH") or theme_th or title_th,
            "featured": True,
            "html": html,
        }
        events.insert(0, event)
    save_events(data_dir, events)

    # ── Home conferences ─────────────────────────────────────────────────
    home = load_home_conferences(data_dir)
    home = [h for h in home if h.get("href") != href and h.get("campaignId") != campaign.get("id")]
    # Also remove prior IAEC card keyed by old href
    if slug == "iaec2026":
        home = [h for h in home if h.get("href") not in ("/iaec2026/", href)]
    if enabled and campaign.get("showOnHome", True):
        home.append({
            "campaignId": campaign.get("id"),
            "enabled": True,
            "kind": campaign.get("homeKind") or "conference",
            "sortOrder": int(campaign.get("sortOrder") if campaign.get("sortOrder") is not None else 99),
            "href": href,
            "image": image,
            "badgeTH": campaign.get("badgeTH") or "",
            "badgeEN": campaign.get("badgeEN") or "",
            "titleTH": title_th,
            "titleEN": title_en,
            "themeTH": theme_th,
            "themeEN": theme_en,
            "dateTH": campaign.get("dateTH") or "",
            "dateEN": campaign.get("dateEN") or "",
            "venueTH": campaign.get("venueTH") or "",
            "venueEN": campaign.get("venueEN") or "",
            "target": campaign.get("target") or "",
            "submitUrl": register or href,
            "ctaTH": campaign.get("ctaTH") or "",
            "ctaEN": campaign.get("ctaEN") or "",
        })
        home.sort(key=lambda x: int(x.get("sortOrder") or 0))
    save_home_conferences(data_dir, home)

    # ── Hero ─────────────────────────────────────────────────────────────
    heroes = load_hero(data_dir)
    heroes = [h for h in heroes if h.get("id") != hero_id]
    if enabled and campaign.get("showInHero", False):
        heroes.append({
            "id": hero_id,
            "enabled": True,
            "sortOrder": int(campaign.get("sortOrder") if campaign.get("sortOrder") is not None else 0),
            "fullImage": True,
            "endsAt": campaign.get("endDate") or campaign.get("target") or "",
            "badgeTH": campaign.get("badgeTH") or title_th,
            "badgeEN": campaign.get("badgeEN") or title_en,
            "image": image,
            "href": href,
            "registerHref": register or "",
            "bg": campaign.get("heroBg")
            or "linear-gradient(125deg,#1F3B2C 0%,#2F5B41 55%,#35667A 100%)",
            "overlay": campaign.get("heroOverlay")
            or "linear-gradient(90deg, rgba(31,59,44,0.35) 0%, rgba(47,91,65,0.20) 100%)",
            "glow": campaign.get("heroGlow") or "rgba(199,154,61,0.4)",
        })
        heroes.sort(key=lambda x: int(x.get("sortOrder") or 0))
    save_hero(data_dir, heroes)


def remove_campaign_relations(data_dir: Path, campaign: dict) -> None:
    slug = campaign.get("slug") or ""
    href = campaign_public_path(slug)
    event_id = campaign_event_id(slug)
    hero_id = campaign_hero_id(slug)
    events = load_events(data_dir)
    drop_ids = {event_id}
    if slug == "iaec2026":
        drop_ids.add("iaec-2026")
    save_events(data_dir, [e for e in events if e.get("id") not in drop_ids])
    home = load_home_conferences(data_dir)
    save_home_conferences(
        data_dir,
        [
            h for h in home
            if h.get("campaignId") != campaign.get("id")
            and h.get("href") not in (href, "/iaec2026/" if slug == "iaec2026" else href)
        ],
    )
    heroes = load_hero(data_dir)
    save_hero(data_dir, [h for h in heroes if h.get("id") != hero_id])


def campaign_assets_dir(data_dir: Path, slug: str) -> Path:
    d = cms_dir(data_dir) / "campaign-assets" / slug / "poster"
    d.mkdir(parents=True, exist_ok=True)
    return d


def public_campaign_poster_dir(slug: str) -> Path | None:
    """Optional live public dir for interactive posters (served without rebuild)."""
    root = os.getenv("CMS_PUBLIC_DIR", "").strip()
    if not root:
        # Prefer repo public/ when running beside the Astro project
        here = Path(__file__).resolve()
        for parent in here.parents:
            candidate = parent / "public"
            if candidate.is_dir() and (parent / "astro.config.mjs").exists():
                root = str(candidate)
                break
    if not root:
        return None
    dest = Path(root) / "c" / slug / "poster"
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def install_campaign_poster_html(
    data_dir: Path,
    slug: str,
    file_bytes: bytes,
    filename: str,
) -> str:
    """Save interactive poster HTML/ZIP under campaign-assets and public/c/{slug}/poster/."""
    slug = slugify(slug) or "campaign"
    ext = Path(filename).suffix.lower()
    asset_dir = campaign_assets_dir(data_dir, slug)
    # clear previous
    for child in asset_dir.iterdir():
        if child.is_file():
            child.unlink()
        elif child.is_dir():
            shutil.rmtree(child)

    if ext == ".zip":
        with zipfile.ZipFile(BytesIO(file_bytes)) as zf:
            for info in zf.infolist():
                name = info.filename
                if name.startswith("__MACOSX") or "/." in f"/{name}":
                    continue
                # flatten single top-level folder
                parts = Path(name).parts
                if len(parts) > 1 and parts[0].lower().endswith((".html",)) is False:
                    # keep structure but strip zip-root if only one root folder
                    pass
                target = asset_dir / name
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(zf.read(info))
        # If zip extracted a single top-level directory, hoist its contents
        kids = [p for p in asset_dir.iterdir() if p.name != "__MACOSX"]
        if len(kids) == 1 and kids[0].is_dir():
            nested = kids[0]
            for p in nested.iterdir():
                dest = asset_dir / p.name
                if dest.exists():
                    if dest.is_dir():
                        shutil.rmtree(dest)
                    else:
                        dest.unlink()
                shutil.move(str(p), str(dest))
            shutil.rmtree(nested)
    elif ext in (".html", ".htm"):
        (asset_dir / "index.html").write_bytes(file_bytes)
    else:
        raise ValueError("poster must be .html or .zip")

    # Ensure index.html exists
    index = asset_dir / "index.html"
    if not index.exists():
        htmls = list(asset_dir.rglob("*.html")) + list(asset_dir.rglob("*.htm"))
        if not htmls:
            raise ValueError("no HTML file found in upload")
        # prefer root-level html
        htmls.sort(key=lambda p: (len(p.relative_to(asset_dir).parts), p.name.lower() != "index.html"))
        shutil.copy2(htmls[0], index)

    pub = public_campaign_poster_dir(slug)
    if pub is not None:
        if pub.exists():
            shutil.rmtree(pub)
        shutil.copytree(asset_dir, pub)

    return f"/c/{slug}/poster/"
