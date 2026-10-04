"""Media library — browse site media folders; write new files to /uploads/."""
from __future__ import annotations

import mimetypes
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

ALLOWED_EXT = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".mp4", ".webm", ".mp3",
    ".html", ".htm", ".zip",
}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
MAX_MEDIA_BYTES = int(os.getenv("MAX_MEDIA_BYTES", str(50 * 1024 * 1024)))

URL_PREFIX = os.getenv("CMS_UPLOADS_URL", "/uploads").rstrip("/")
WEB_ROOT = Path(os.getenv("CMS_WEB_ROOT", "/var/www/tsae_web"))


def uploads_root() -> Path:
    env = os.getenv("CMS_UPLOADS_DIR", "")
    if env:
        p = Path(env)
        p.mkdir(parents=True, exist_ok=True)
        return p
    fallback = Path(os.getenv("DATA_DIR", "/data")) / "media"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def libraries() -> dict[str, dict]:
    """Named media roots. Only `uploads` is writable for new CMS files."""
    return {
        "uploads": {
            "id": "uploads",
            "label": "อัปโหลดใหม่",
            "hint": "ไฟล์ใหม่จาก CMS — ใช้กับเนื้อหาใหม่",
            "urlPrefix": "/uploads",
            "writable": True,
            "path": uploads_root(),
        },
        "images": {
            "id": "images",
            "label": "รูปเว็บไซต์",
            "hint": "โลโก้ / Hero / โปสเตอร์ใน /images",
            "urlPrefix": "/images",
            "writable": False,
            "path": WEB_ROOT / "images",
        },
        "wp-uploads": {
            "id": "wp-uploads",
            "label": "สื่อเก่า (WP)",
            "hint": "รูปข่าวเก่าจาก WordPress — อ่านอย่างเดียว",
            "urlPrefix": "/wp-uploads",
            "writable": False,
            "path": WEB_ROOT / "wp-uploads",
        },
        "downloads": {
            "id": "downloads",
            "label": "ดาวน์โหลด",
            "hint": "PDF / เอกสารใน /downloads",
            "urlPrefix": "/downloads",
            "writable": False,
            "path": WEB_ROOT / "downloads",
        },
    }


def get_library(library_id: str | None = None) -> dict:
    libs = libraries()
    key = (library_id or "uploads").strip() or "uploads"
    if key not in libs:
        raise ValueError(f"unknown library: {key}")
    return libs[key]


def public_url(relative: str, url_prefix: str | None = None) -> str:
    prefix = (url_prefix or URL_PREFIX).rstrip("/")
    if not prefix.startswith("/"):
        prefix = "/" + prefix
    rel = relative.replace("\\", "/").lstrip("/")
    if rel.startswith(prefix.strip("/") + "/"):
        return "/" + rel if not rel.startswith("/") else rel
    return f"{prefix}/{rel}" if rel else prefix


def _safe_rel(path: str) -> str:
    p = path.replace("\\", "/").strip("/")
    if ".." in p.split("/"):
        raise ValueError("invalid path")
    return p


def _count_files(root: Path, limit: int = 5000) -> int:
    if not root.exists() or not root.is_dir():
        return 0
    n = 0
    try:
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in ALLOWED_EXT:
                n += 1
                if n >= limit:
                    return n
    except OSError:
        return n
    return n


def list_libraries() -> dict:
    items = []
    for lib in libraries().values():
        root: Path = lib["path"]
        items.append({
            "id": lib["id"],
            "label": lib["label"],
            "hint": lib["hint"],
            "urlPrefix": lib["urlPrefix"],
            "writable": lib["writable"],
            "exists": root.exists() and root.is_dir(),
            "fileCount": _count_files(root) if root.exists() else 0,
        })
    return {"items": items}


def _file_entry(entry: Path, rel: str, url_prefix: str | None) -> dict | None:
    if not entry.is_file() or entry.suffix.lower() not in ALLOWED_EXT:
        return None
    try:
        stat = entry.stat()
    except OSError:
        return None
    ext = entry.suffix.lower()
    return {
        "name": entry.name,
        "path": rel,
        "url": public_url(rel, url_prefix),
        "size": stat.st_size,
        "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "type": "image" if ext in IMAGE_EXT else ("pdf" if ext == ".pdf" else "file"),
    }


def list_media(
    root: Path,
    subpath: str = "",
    q: str = "",
    page: int = 1,
    per_page: int = 48,
    url_prefix: str | None = None,
    library_id: str = "uploads",
    writable: bool = True,
    recursive: bool = False,
) -> dict:
    sub = _safe_rel(subpath) if subpath else ""
    base = root / sub if sub else root
    empty = {
        "items": [], "dirs": [], "path": sub, "total": 0, "page": page, "pages": 0,
        "library": library_id, "writable": writable, "urlPrefix": url_prefix or URL_PREFIX,
        "root": str(root), "recursive": recursive,
    }
    if not base.exists() or not base.is_dir():
        return empty

    dirs: list[dict] = []
    files: list[dict] = []
    q_lower = q.lower().strip()

    try:
        entries = sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError:
        return empty

    for entry in entries:
        if entry.name.startswith("."):
            continue
        rel = f"{sub}/{entry.name}".strip("/") if sub else entry.name
        if entry.is_dir():
            if q_lower and q_lower not in entry.name.lower() and not recursive:
                continue
            dirs.append({
                "name": entry.name,
                "path": rel,
                "fileCount": _count_files(entry, limit=2000),
            })
        else:
            if recursive:
                continue  # files gathered below when recursive
            if q_lower and q_lower not in entry.name.lower():
                continue
            item = _file_entry(entry, rel, url_prefix)
            if item:
                files.append(item)

    if recursive:
        try:
            for entry in base.rglob("*"):
                if not entry.is_file() or entry.name.startswith("."):
                    continue
                try:
                    rel = str(entry.relative_to(root)).replace("\\", "/")
                except ValueError:
                    continue
                if q_lower and q_lower not in entry.name.lower() and q_lower not in rel.lower():
                    continue
                item = _file_entry(entry, rel, url_prefix)
                if item:
                    files.append(item)
        except OSError:
            pass
        # When searching recursively, hide dirs that don't match unless we keep them for nav
        if q_lower:
            dirs = [d for d in dirs if q_lower in d["name"].lower()]

    files.sort(key=lambda f: f["modified"], reverse=True)
    total = len(files)
    pages = max(1, (total + per_page - 1) // per_page) if total else 0
    page = max(1, min(page, pages)) if pages else 1
    start = (page - 1) * per_page
    items = files[start : start + per_page]

    return {
        "items": items,
        "dirs": dirs,
        "path": sub,
        "total": total,
        "page": page,
        "pages": pages,
        "root": str(root),
        "library": library_id,
        "writable": writable,
        "urlPrefix": url_prefix or URL_PREFIX,
        "recursive": recursive,
    }


def save_upload(root: Path, file_bytes: bytes, filename: str, subdir: str = "cms", url_prefix: str | None = None) -> dict:
    """Save uploaded file into the writable uploads root."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise ValueError(f"file type {ext} not allowed")
    if len(file_bytes) > MAX_MEDIA_BYTES:
        raise ValueError("file too large")

    target = subdir.strip("/") if subdir else ""
    if not target or target == "cms":
        now = datetime.now(timezone.utc)
        folder = f"cms/{now.strftime('%Y/%m')}"
    else:
        folder = target

    dest_dir = root / folder
    if not str(dest_dir.resolve()).startswith(str(root.resolve())):
        raise ValueError("invalid upload path")
    dest_dir.mkdir(parents=True, exist_ok=True)

    stem = re.sub(r"[^a-zA-Z0-9._-]+", "-", Path(filename).stem)[:80] or "file"
    name = f"{stem}-{uuid.uuid4().hex[:8]}{ext}"
    dest = dest_dir / name
    dest.write_bytes(file_bytes)

    rel = f"{folder}/{name}"
    mime, _ = mimetypes.guess_type(name)
    return {
        "name": name,
        "path": rel,
        "url": public_url(rel, url_prefix),
        "size": len(file_bytes),
        "mime": mime or "application/octet-stream",
    }


def create_dir(root: Path, rel_path: str) -> dict:
    rel = _safe_rel(rel_path)
    if not rel:
        raise ValueError("folder name required")
    target = root / rel
    if not str(target.resolve()).startswith(str(root.resolve())):
        raise ValueError("invalid folder path")
    if target.exists():
        if target.is_dir():
            raise ValueError("folder already exists")
        raise ValueError("path is a file")
    target.mkdir(parents=True, exist_ok=False)
    return {"name": target.name, "path": rel}


def delete_dir(root: Path, rel_path: str) -> dict:
    rel = _safe_rel(rel_path)
    if not rel:
        raise ValueError("cannot delete root")
    target = (root / rel).resolve()
    root_res = root.resolve()
    if not str(target).startswith(str(root_res)):
        raise ValueError("invalid path")
    if not target.is_dir():
        raise FileNotFoundError(rel_path)
    try:
        next(target.iterdir())
        raise ValueError("folder not empty")
    except StopIteration:
        pass
    target.rmdir()
    return {"path": rel}


def move_file(root: Path, src_rel: str, dest_dir_rel: str, url_prefix: str | None = None) -> dict:
    src_rel = _safe_rel(src_rel)
    dest_dir_rel = _safe_rel(dest_dir_rel) if dest_dir_rel else ""
    if not src_rel:
        raise ValueError("source required")
    src = (root / src_rel).resolve()
    root_res = root.resolve()
    if not str(src).startswith(str(root_res)):
        raise ValueError("invalid source")
    if not src.is_file():
        raise FileNotFoundError(src_rel)
    dest_dir = (root / dest_dir_rel).resolve() if dest_dir_rel else root_res
    if not str(dest_dir).startswith(str(root_res)) or not dest_dir.is_dir():
        raise ValueError("invalid destination folder")
    dest = dest_dir / Path(src_rel).name
    if dest.exists():
        raise ValueError("file already exists in destination")
    src.rename(dest)
    new_rel = f"{dest_dir_rel}/{dest.name}".strip("/") if dest_dir_rel else dest.name
    return {"name": dest.name, "path": new_rel, "url": public_url(new_rel, url_prefix)}


def delete_media(root: Path, rel_path: str) -> None:
    rel = _safe_rel(rel_path)
    target = (root / rel).resolve()
    root_res = root.resolve()
    if not str(target).startswith(str(root_res)):
        raise ValueError("invalid path")
    if not target.is_file():
        raise FileNotFoundError(rel_path)
    if target.suffix.lower() not in ALLOWED_EXT:
        raise ValueError("cannot delete this file type")
    target.unlink()
