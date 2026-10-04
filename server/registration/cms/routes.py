"""REST API + SPA shell for TSAE CMS."""
from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse

from . import media as media_lib
from . import publish as pub
from . import storage as store

router = APIRouter(prefix="/admin/cms")
api = APIRouter(prefix="/admin/cms/api")

STATIC_DIR = Path(__file__).resolve().parent / "static"


def _auth(auth_fn, request: Request) -> None:
    if not auth_fn(request):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _queue_publish(data_dir: Path, reason: str) -> dict:
    try:
        return pub.request_publish(data_dir, reason)
    except Exception as exc:  # noqa: BLE001
        return {"queued": False, "error": str(exc)}


def _news_item(body: dict, existing: dict | None = None) -> dict:
    item = dict(existing or {})
    item.update(body)
    for key in ("title", "category", "html"):
        if key in body:
            item[key] = body[key]
    if "date" not in item or not item["date"]:
        item["date"] = store.now_iso()
    if item.get("category") not in store.NEWS_CATEGORIES:
        item["category"] = "announcement"
    item["featured"] = bool(item.get("featured"))
    item["image"] = item.get("image") or None
    return item


def _event_item(body: dict, existing: dict | None = None) -> dict:
    item = dict(existing or {})
    item.update(body)
    if item.get("type") not in store.EVENT_TYPES:
        item["type"] = "training"
    if item.get("status") not in store.EVENT_STATUSES:
        item["status"] = "upcoming"
    item["featured"] = bool(item.get("featured"))
    item["endDate"] = item.get("endDate") or None
    item["registrationUrl"] = item.get("registrationUrl") or None
    item["image"] = item.get("image") or None
    item["html"] = item.get("html") or ""
    return item


def _page_item(body: dict, existing: dict | None = None) -> dict:
    item = dict(existing or {})
    item.update(body)
    item["enabled"] = bool(item.get("enabled", True))
    item["blocks"] = item.get("blocks") if isinstance(item.get("blocks"), list) else (existing or {}).get("blocks", [])
    item["updatedAt"] = store.now_iso()
    return item


def register_cms_routes(app, data_dir: Path, auth_fn):
    uploads = media_lib.uploads_root()

    @router.get("", include_in_schema=False)
    @router.get("/", include_in_schema=False)
    def cms_app(request: Request):
        if not auth_fn(request):
            return RedirectResponse("/admin/login?next=/admin/cms", status_code=303)
        index = STATIC_DIR / "index.html"
        return FileResponse(index, media_type="text/html; charset=utf-8")

    @router.get("/assets/{path:path}", include_in_schema=False)
    def cms_assets(path: str):
        target = (STATIC_DIR / path).resolve()
        if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.is_file():
            raise HTTPException(404)
        return FileResponse(target)

    # ── News ──────────────────────────────────────────────────────────────

    @api.get("/news")
    def api_news_list(request: Request, q: str = "", category: str = ""):
        _auth(auth_fn, request)
        items = store.load_news(data_dir)
        if category:
            items = [i for i in items if i.get("category") == category]
        if q:
            ql = q.lower()
            items = [i for i in items if ql in (i.get("title") or "").lower() or ql in (i.get("excerpt") or "").lower()]
        items.sort(key=lambda x: x.get("date", ""), reverse=True)
        return {"items": items, "total": len(items)}

    @api.get("/news/{item_id}")
    def api_news_get(item_id: str, request: Request):
        _auth(auth_fn, request)
        item = next((i for i in store.load_news(data_dir) if i.get("id") == item_id), None)
        if not item:
            raise HTTPException(404, "Not found")
        return item

    @api.post("/news")
    async def api_news_create(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_news(data_dir)
        title = (body.get("title") or "").strip()
        if not title:
            raise HTTPException(400, "title required")
        base = store.slugify(title)
        item = _news_item(body)
        item["id"] = store.unique_id(items, base)
        saved = store.save_news_item(data_dir, item)
        _queue_publish(data_dir, f"news-create:{saved.get('id')}")
        return saved

    @api.put("/news/{item_id}")
    async def api_news_update(item_id: str, request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        existing = next((i for i in store.load_news(data_dir) if i.get("id") == item_id), None)
        if not existing:
            raise HTTPException(404, "Not found")
        item = _news_item(body, existing)
        item["id"] = item_id
        saved = store.save_news_item(data_dir, item)
        _queue_publish(data_dir, f"news-update:{item_id}")
        return saved

    @api.delete("/news/{item_id}")
    def api_news_delete(item_id: str, request: Request):
        _auth(auth_fn, request)
        if not store.delete_news_item(data_dir, item_id):
            raise HTTPException(404, "Not found")
        _queue_publish(data_dir, f"news-delete:{item_id}")
        return {"ok": True}

    # ── Events ────────────────────────────────────────────────────────────

    @api.get("/events")
    def api_events_list(request: Request):
        _auth(auth_fn, request)
        items = store.load_events(data_dir)
        items.sort(key=lambda x: x.get("startDate", ""), reverse=True)
        return {"items": items}

    @api.get("/events/{item_id}")
    def api_events_get(item_id: str, request: Request):
        _auth(auth_fn, request)
        item = next((i for i in store.load_events(data_dir) if i.get("id") == item_id), None)
        if not item:
            raise HTTPException(404, "Not found")
        return item

    @api.post("/events")
    async def api_events_create(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_events(data_dir)
        title = (body.get("titleTH") or body.get("title") or "").strip()
        if not title:
            raise HTTPException(400, "title required")
        base = store.slugify(title)
        item = _event_item(body)
        item["id"] = body.get("id") or store.unique_id(items, base)
        items.append(item)
        store.save_events(data_dir, items)
        _queue_publish(data_dir, f"event-create:{item.get('id')}")
        return item

    @api.put("/events/{item_id}")
    async def api_events_update(item_id: str, request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_events(data_dir)
        for idx, item in enumerate(items):
            if item.get("id") == item_id:
                items[idx] = _event_item(body, item)
                items[idx]["id"] = item_id
                store.save_events(data_dir, items)
                _queue_publish(data_dir, f"event-update:{item_id}")
                return items[idx]
        raise HTTPException(404, "Not found")

    @api.delete("/events/{item_id}")
    def api_events_delete(item_id: str, request: Request):
        _auth(auth_fn, request)
        items = store.load_events(data_dir)
        new_items = [i for i in items if i.get("id") != item_id]
        if len(new_items) == len(items):
            raise HTTPException(404, "Not found")
        store.save_events(data_dir, new_items)
        _queue_publish(data_dir, f"event-delete:{item_id}")
        return {"ok": True}

    @api.get("/calendar")
    def api_calendar(request: Request):
        _auth(auth_fn, request)
        events = []
        for item in store.load_events(data_dir):
            title = item.get("titleTH") or item.get("title") or "Event"
            color = {
                "national": "#1a6b3a",
                "international": "#c8102e",
                "training": "#c8a951",
                "webinar": "#0891b2",
            }.get(item.get("type", ""), "#1a6b3a")
            events.append({
                "id": item.get("id"),
                "title": title,
                "start": item.get("startDate"),
                "end": item.get("endDate") or item.get("startDate"),
                "backgroundColor": color,
                "borderColor": color,
                "extendedProps": {
                    "type": item.get("type"),
                    "location": item.get("locationTH") or item.get("location"),
                    "status": item.get("status"),
                },
            })
        return {"events": events}

    # ── Hero ──────────────────────────────────────────────────────────────

    @api.get("/hero")
    def api_hero_list(request: Request):
        _auth(auth_fn, request)
        items = store.load_hero(data_dir)
        items.sort(key=lambda x: x.get("sortOrder", 0))
        return {"items": items}

    @api.post("/hero")
    async def api_hero_create(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_hero(data_dir)
        item = {
            "id": body.get("id") or f"slide-{uuid.uuid4().hex[:8]}",
            "enabled": bool(body.get("enabled", True)),
            "sortOrder": int(body.get("sortOrder", len(items))),
            "fullImage": body.get("fullImage", True) is not False,
            "endsAt": body.get("endsAt") or "",
            "badgeTH": body.get("badgeTH", ""),
            "badgeEN": body.get("badgeEN", ""),
            "titleTH": body.get("titleTH", ""),
            "titleEN": body.get("titleEN", ""),
            "titleAccentTH": body.get("titleAccentTH", ""),
            "titleAccentEN": body.get("titleAccentEN", ""),
            "themeTH": body.get("themeTH", ""),
            "themeEN": body.get("themeEN", ""),
            "dateTH": body.get("dateTH", ""),
            "dateEN": body.get("dateEN", ""),
            "locationTH": body.get("locationTH", ""),
            "locationEN": body.get("locationEN", ""),
            "tagTH": body.get("tagTH", ""),
            "tagEN": body.get("tagEN", ""),
            "image": body.get("image", ""),
            "href": body.get("href", ""),
            "href2": body.get("href2", ""),
            "href2LabelTH": body.get("href2LabelTH", ""),
            "href2LabelEN": body.get("href2LabelEN", ""),
            "registerHref": body.get("registerHref", ""),
            "bg": body.get("bg", "linear-gradient(125deg,#14532d,#1a6b3a,#15803d)"),
            "overlay": body.get("overlay", "linear-gradient(90deg, rgba(20,83,45,0.55) 0%, rgba(20,83,45,0.35) 50%, rgba(21,128,61,0.30) 100%)"),
            "glow": body.get("glow", "rgba(74,222,128,0.4)"),
        }
        items.append(item)
        store.save_hero(data_dir, items)
        _queue_publish(data_dir, f"hero-create:{item.get('id')}")
        return item

    @api.put("/hero/{item_id}")
    async def api_hero_update(item_id: str, request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_hero(data_dir)
        for idx, item in enumerate(items):
            if item.get("id") == item_id:
                item.update(body)
                item["id"] = item_id
                item["enabled"] = bool(item.get("enabled"))
                item["sortOrder"] = int(item.get("sortOrder", 0))
                item["fullImage"] = item.get("fullImage", True) is not False
                items[idx] = item
                store.save_hero(data_dir, items)
                _queue_publish(data_dir, f"hero-update:{item_id}")
                return item
        raise HTTPException(404, "Not found")

    @api.delete("/hero/{item_id}")
    def api_hero_delete(item_id: str, request: Request):
        _auth(auth_fn, request)
        items = store.load_hero(data_dir)
        new_items = [i for i in items if i.get("id") != item_id]
        if len(new_items) == len(items):
            raise HTTPException(404, "Not found")
        store.save_hero(data_dir, new_items)
        _queue_publish(data_dir, f"hero-delete:{item_id}")
        return {"ok": True}

    # ── Homepage copy ─────────────────────────────────────────────────────

    @api.get("/homepage")
    def api_homepage_get(request: Request):
        _auth(auth_fn, request)
        return store.load_homepage(data_dir)

    @api.put("/homepage")
    async def api_homepage_put(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        if not isinstance(body, dict):
            raise HTTPException(400, "object required")
        current = store.load_homepage(data_dir)
        current.update(body)
        for key in (
            "latestNewsEnabled", "aboutEnabled", "journalEnabled", "ctaEnabled",
        ):
            if key in body:
                current[key] = bool(body[key])
        for key in ("journalVolume", "journalIssue", "journalYear"):
            if key in body and body[key] not in (None, ""):
                current[key] = int(body[key])
        store.save_homepage(data_dir, current)
        _queue_publish(data_dir, "homepage")
        return current

    # ── Home conferences cards ────────────────────────────────────────────

    @api.get("/home-conferences")
    def api_home_conf_list(request: Request):
        _auth(auth_fn, request)
        items = store.load_home_conferences(data_dir)
        items.sort(key=lambda x: int(x.get("sortOrder") or 0))
        return {"items": items}

    @api.put("/home-conferences")
    async def api_home_conf_replace(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = body.get("items") if isinstance(body, dict) else body
        if not isinstance(items, list):
            raise HTTPException(400, "items array required")
        cleaned = []
        for i, raw in enumerate(items):
            if not isinstance(raw, dict):
                continue
            item = dict(raw)
            item["enabled"] = item.get("enabled", True) is not False
            item["sortOrder"] = int(item.get("sortOrder", i))
            item["kind"] = item.get("kind") if item.get("kind") in ("call", "conference") else "conference"
            cleaned.append(item)
        store.save_home_conferences(data_dir, cleaned)
        _queue_publish(data_dir, "home-conferences")
        return {"items": cleaned}

    # ── Home videos ───────────────────────────────────────────────────────

    @api.get("/home-videos")
    def api_home_videos_list(request: Request):
        _auth(auth_fn, request)
        items = store.load_home_videos(data_dir)
        return {"items": items}

    @api.put("/home-videos")
    async def api_home_videos_replace(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = body.get("items") if isinstance(body, dict) else body
        if not isinstance(items, list):
            raise HTTPException(400, "items array required")
        cleaned = []
        for raw in items:
            if not isinstance(raw, dict):
                continue
            item = dict(raw)
            if not item.get("id") and not item.get("href"):
                continue
            item["pick"] = bool(item.get("pick"))
            cleaned.append(item)
        store.save_home_videos(data_dir, cleaned)
        _queue_publish(data_dir, "home-videos")
        return {"items": cleaned}

    # ── Media ─────────────────────────────────────────────────────────────

    def _media_lib(library: str | None):
        try:
            return media_lib.get_library(library)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    def _require_writable(lib: dict) -> None:
        if not lib.get("writable"):
            raise HTTPException(403, "คลังนี้เป็นแบบอ่านอย่างเดียว — อัปโหลดใหม่ที่โฟลเดอร์ «อัปโหลดใหม่»")

    @api.get("/media/libraries")
    def api_media_libraries(request: Request):
        _auth(auth_fn, request)
        return media_lib.list_libraries()

    @api.get("/media")
    def api_media_list(
        request: Request,
        path: str = "",
        q: str = "",
        page: int = 1,
        per_page: int = 48,
        library: str = "uploads",
        recursive: int = 0,
    ):
        _auth(auth_fn, request)
        lib = _media_lib(library)
        return media_lib.list_media(
            lib["path"],
            path,
            q,
            page,
            per_page,
            url_prefix=lib["urlPrefix"],
            library_id=lib["id"],
            writable=bool(lib["writable"]),
            recursive=bool(recursive),
        )

    @api.post("/media/upload")
    async def api_media_upload(
        request: Request,
        file: UploadFile = File(...),
        path: str = "",
        library: str = "uploads",
    ):
        _auth(auth_fn, request)
        lib = _media_lib(library)
        _require_writable(lib)
        data = await file.read()
        try:
            sub = path.strip("/") if path else ""
            result = media_lib.save_upload(
                lib["path"], data, file.filename or "upload.bin", sub, url_prefix=lib["urlPrefix"]
            )
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        return result

    @api.post("/media/mkdir")
    def api_media_mkdir(request: Request, body: dict):
        _auth(auth_fn, request)
        b = body or {}
        lib = _media_lib(b.get("library") or "uploads")
        _require_writable(lib)
        try:
            return media_lib.create_dir(lib["path"], b.get("path", ""))
        except FileNotFoundError as e:
            raise HTTPException(404, str(e)) from e
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    @api.post("/media/rmdir")
    def api_media_rmdir(request: Request, body: dict):
        _auth(auth_fn, request)
        b = body or {}
        lib = _media_lib(b.get("library") or "uploads")
        _require_writable(lib)
        try:
            return media_lib.delete_dir(lib["path"], b.get("path", ""))
        except FileNotFoundError as e:
            raise HTTPException(404, str(e)) from e
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    @api.post("/media/move")
    def api_media_move(request: Request, body: dict):
        _auth(auth_fn, request)
        b = body or {}
        lib = _media_lib(b.get("library") or "uploads")
        _require_writable(lib)
        try:
            return media_lib.move_file(
                lib["path"], b.get("src", ""), b.get("dest", ""), url_prefix=lib["urlPrefix"]
            )
        except FileNotFoundError as e:
            raise HTTPException(404, str(e)) from e
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    @api.delete("/media")
    def api_media_delete(request: Request, path: str, library: str = "uploads"):
        _auth(auth_fn, request)
        lib = _media_lib(library)
        _require_writable(lib)
        try:
            media_lib.delete_media(lib["path"], path)
        except FileNotFoundError as e:
            raise HTTPException(404, str(e)) from e
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        return {"ok": True}

    # ── Static pages (page builder) ───────────────────────────────────────

    @api.get("/pages")
    def api_pages_list(request: Request):
        _auth(auth_fn, request)
        items = store.load_pages(data_dir)
        items.sort(key=lambda x: (x.get("slug", ""), x.get("lang", "")))
        return {"items": items}

    @api.get("/pages/resolve")
    def api_pages_resolve(request: Request, path: str = ""):
        _auth(auth_fn, request)
        p = path.strip() or "/"
        items = store.load_pages(data_dir)

        m = re.match(r"^/(?:th/)?p/([^/]+)/?$", p)
        if m:
            slug = m.group(1)
            lang = "th" if p.startswith("/th/") else "en"
            item = next((i for i in items if i.get("slug") == slug and i.get("lang") == lang), None)
            if item:
                return {"type": "page", "id": item["id"], "editHash": f"#/pages/edit/{item['id']}"}

        if p in ("/", "/th", "/th/"):
            return {"type": "hero", "editHash": "#/hero"}

        m = re.match(r"^/(?:th/)?news/([^/]+)/?$", p)
        if m:
            return {"type": "news", "id": m.group(1), "editHash": f"#/news/edit/{m.group(1)}"}

        m = re.match(r"^/(?:th/)?events/([^/]+)/?$", p)
        if m:
            return {"type": "event", "id": m.group(1), "editHash": f"#/events/edit/{m.group(1)}"}

        item = next((i for i in items if i.get("sitePath") == p), None)
        if item:
            return {"type": "page", "id": item["id"], "editHash": f"#/pages/edit/{item['id']}"}

        return {"type": "none", "editHash": "#/pages", "createHash": f"#/pages/new?path={p}"}

    @api.get("/pages/{item_id}")
    def api_pages_get(item_id: str, request: Request):
        _auth(auth_fn, request)
        item = next((i for i in store.load_pages(data_dir) if i.get("id") == item_id), None)
        if not item:
            raise HTTPException(404, "Not found")
        return item

    @api.post("/pages")
    async def api_pages_create(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_pages(data_dir)
        page_id = (body.get("id") or "").strip()
        slug = (body.get("slug") or "").strip()
        lang = (body.get("lang") or "th").strip()
        title = (body.get("title") or "").strip()
        if not slug or not title:
            raise HTTPException(400, "slug and title required")
        if not page_id:
            page_id = store.unique_id(items, f"{slug}-{lang}")
        if any(i.get("id") == page_id for i in items):
            raise HTTPException(400, "id already exists")
        item = _page_item(body)
        item["id"] = page_id
        item["slug"] = slug
        item["lang"] = lang
        item["title"] = title
        item.setdefault("description", "")
        item.setdefault("heroTitle", title)
        item.setdefault("heroSubtitle", "")
        item.setdefault("blocks", [])
        items.append(item)
        store.save_pages(data_dir, items)
        _queue_publish(data_dir, f"page-create:{page_id}")
        return item

    @api.put("/pages/{item_id}")
    async def api_pages_update(item_id: str, request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_pages(data_dir)
        for idx, item in enumerate(items):
            if item.get("id") == item_id:
                items[idx] = _page_item(body, item)
                items[idx]["id"] = item_id
                store.save_pages(data_dir, items)
                _queue_publish(data_dir, f"page-update:{item_id}")
                return items[idx]
        raise HTTPException(404, "Not found")

    @api.delete("/pages/{item_id}")
    def api_pages_delete(item_id: str, request: Request):
        _auth(auth_fn, request)
        items = store.load_pages(data_dir)
        new_items = [i for i in items if i.get("id") != item_id]
        if len(new_items) == len(items):
            raise HTTPException(404, "Not found")
        store.save_pages(data_dir, new_items)
        _queue_publish(data_dir, f"page-delete:{item_id}")
        return {"ok": True}

    # ── Campaigns (poster packs) ──────────────────────────────────────────

    @api.get("/campaigns")
    def api_campaigns_list(request: Request):
        _auth(auth_fn, request)
        items = store.load_campaigns(data_dir)
        items.sort(key=lambda x: int(x.get("sortOrder") or 0))
        return {"items": items, "total": len(items)}

    @api.get("/campaigns/{item_id}")
    def api_campaigns_get(item_id: str, request: Request):
        _auth(auth_fn, request)
        item = next((i for i in store.load_campaigns(data_dir) if i.get("id") == item_id), None)
        if not item:
            raise HTTPException(404, "Not found")
        return item

    @api.post("/campaigns")
    async def api_campaigns_create(request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_campaigns(data_dir)
        item = store.normalize_campaign(body)
        if not (item.get("titleEN") or item.get("titleTH")):
            raise HTTPException(400, "title required")
        item["id"] = store.unique_id(items, item["slug"])
        item["slug"] = item["id"] if not body.get("slug") else item["slug"]
        # ensure unique slug
        used_slugs = {i.get("slug") for i in items}
        if item["slug"] in used_slugs:
            item["slug"] = store.unique_id([{"id": s} for s in used_slugs], item["slug"])
        if not item.get("sortOrder"):
            item["sortOrder"] = (max((int(i.get("sortOrder") or 0) for i in items), default=0) + 1)
        items.append(item)
        store.save_campaigns(data_dir, items)
        store.sync_campaign_relations(data_dir, item)
        _queue_publish(data_dir, f"campaign-create:{item.get('id')}")
        return item

    @api.put("/campaigns/{item_id}")
    async def api_campaigns_update(item_id: str, request: Request):
        _auth(auth_fn, request)
        body = await request.json()
        items = store.load_campaigns(data_dir)
        for idx, existing in enumerate(items):
            if existing.get("id") == item_id:
                old_slug = existing.get("slug")
                item = store.normalize_campaign(body, existing)
                item["id"] = item_id
                # slug uniqueness if changed
                if item["slug"] != old_slug:
                    used = {i.get("slug") for i in items if i.get("id") != item_id}
                    if item["slug"] in used:
                        raise HTTPException(400, "slug already exists")
                items[idx] = item
                store.save_campaigns(data_dir, items)
                store.sync_campaign_relations(data_dir, item)
                _queue_publish(data_dir, f"campaign-update:{item_id}")
                return item
        raise HTTPException(404, "Not found")

    @api.delete("/campaigns/{item_id}")
    def api_campaigns_delete(item_id: str, request: Request):
        _auth(auth_fn, request)
        items = store.load_campaigns(data_dir)
        found = next((i for i in items if i.get("id") == item_id), None)
        if not found:
            raise HTTPException(404, "Not found")
        store.remove_campaign_relations(data_dir, found)
        store.save_campaigns(data_dir, [i for i in items if i.get("id") != item_id])
        _queue_publish(data_dir, f"campaign-delete:{item_id}")
        return {"ok": True}

    @api.post("/campaigns/{item_id}/poster-html")
    async def api_campaigns_poster_html(item_id: str, request: Request, file: UploadFile = File(...)):
        _auth(auth_fn, request)
        items = store.load_campaigns(data_dir)
        item = next((i for i in items if i.get("id") == item_id), None)
        if not item:
            raise HTTPException(404, "Not found")
        data = await file.read()
        try:
            url = store.install_campaign_poster_html(
                data_dir, item.get("slug") or item_id, data, file.filename or "poster.html"
            )
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        item["posterHtmlUrl"] = url
        item["updatedAt"] = store.now_iso()
        for idx, row in enumerate(items):
            if row.get("id") == item_id:
                items[idx] = item
                break
        store.save_campaigns(data_dir, items)
        store.sync_campaign_relations(data_dir, item)
        _queue_publish(data_dir, f"campaign-poster:{item_id}")
        return {"url": url, "item": item}

    @api.get("/me")
    def api_me(request: Request):
        user = auth_fn(request)
        if not user:
            return JSONResponse({"authenticated": False})
        return {"authenticated": True, "user": user}

    @api.get("/stats")
    def api_stats(request: Request):
        _auth(auth_fn, request)
        news = store.load_news(data_dir)
        events = store.load_events(data_dir)
        hero = store.load_hero(data_dir)
        pages = store.load_pages(data_dir)
        campaigns = store.load_campaigns(data_dir)
        videos = store.load_home_videos(data_dir)
        confs = store.load_home_conferences(data_dir)
        libs = media_lib.list_libraries().get("items", [])
        media_total = sum(int(x.get("fileCount") or 0) for x in libs)
        return {
            "news": len(news),
            "events": len(events),
            "hero": len([h for h in hero if h.get("enabled") is not False]),
            "pages": len([p for p in pages if p.get("enabled", True)]),
            "campaigns": len([c for c in campaigns if c.get("enabled", True)]),
            "videos": len(videos),
            "homeConferences": len([c for c in confs if c.get("enabled") is not False]),
            "media": media_total,
            "mediaLibraries": libs,
            "uploadsRoot": str(uploads),
            "publish": pub.publish_status(data_dir),
        }

    @api.post("/publish")
    def api_publish(request: Request):
        """Queue a rebuild of the public Astro site from current CMS data."""
        _auth(auth_fn, request)
        return _queue_publish(data_dir, "manual")

    @api.get("/publish/status")
    def api_publish_status(request: Request):
        _auth(auth_fn, request)
        return pub.publish_status(data_dir)

    app.include_router(router)
    app.include_router(api)
