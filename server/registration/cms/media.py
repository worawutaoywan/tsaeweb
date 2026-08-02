"""Media library — browse and upload files to /uploads/ (not wp-uploads)."""
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
}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
MAX_MEDIA_BYTES = int(os.getenv("MAX_MEDIA_BYTES", str(50 * 1024 * 1024)))

URL_PREFIX = os.getenv("CMS_UPLOADS_URL", "/uploads").rstrip("/")


def uploads_root() -> Path:
    env = os.getenv("CMS_UPLOADS_DIR", "")
    if env:
        p = Path(env)
        p.mkdir(parents=True, exist_ok=True)
        return p
    fallback = Path(os.getenv("DATA_DIR", "/data")) / "media"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def public_url(relative: str) -> str:
    rel = relative.replace("\\", "/").lstrip("/")
    if rel.startswith(f"{URL_PREFIX.strip('/')}/"):
        return rel if rel.startswith("/") else "/" + rel
    return f"{URL_PREFIX}/{rel}"


def _safe_rel(path: str) -> str:
    p = path.replace("\\", "/").strip("/")
    if ".." in p.split("/"):
        raise ValueError("invalid path")
    return p


def list_media(root: Path, subpath: str = "", q: str = "", page: int = 1, per_page: int = 48) -> dict:
    sub = _safe_rel(subpath) if subpath else ""
    base = root / sub if sub else root
    if not base.exists() or not base.is_dir():
        return {"items": [], "dirs": [], "path": sub, "total": 0, "page": page, "pages": 0}

    dirs: list[dict] = []
    files: list[dict] = []

    try:
        entries = sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except OSError:
        return {"items": [], "dirs": [], "path": sub, "total": 0, "page": page, "pages": 0}

    q_lower = q.lower().strip()
    for entry in entries:
        rel = f"{sub}/{entry.name}".strip("/") if sub else entry.name
        if entry.is_dir():
            if not q_lower or q_lower in entry.name.lower():
                dirs.append({"name": entry.name, "path": rel})
        elif entry.is_file() and entry.suffix.lower() in ALLOWED_EXT:
            if q_lower and q_lower not in entry.name.lower():
                continue
            stat = entry.stat()
            ext = entry.suffix.lower()
            files.append({
                "name": entry.name,
                "path": rel,
                "url": public_url(rel),
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                "type": "image" if ext in IMAGE_EXT else ("pdf" if ext == ".pdf" else "file"),
            })

    files.sort(key=lambda f: f["modified"], reverse=True)
    total = len(files)
    pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, pages))
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
    }


def save_upload(root: Path, file_bytes: bytes, filename: str, subdir: str = "cms") -> dict:
    """Save uploaded file. If `subdir` is empty or "cms" with no slash, treat as
    target folder directly (uses it as-is). Otherwise (legacy "cms/YYYY/MM"
    style) keep old behavior. This lets the UI drop files into the folder the
    user is currently viewing.
    """
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise ValueError(f"file type {ext} not allowed")
    if len(file_bytes) > MAX_MEDIA_BYTES:
        raise ValueError("file too large")

    # If the caller passes a real folder path (contains "/" or is non-empty and
    # not the legacy default "cms"), honor it. Otherwise default to cms/YYYY/MM.
    target = subdir.strip("/") if subdir else ""
    if not target or target == "cms":
        now = datetime.now(timezone.utc)
        folder = f"cms/{now.strftime('%Y/%m')}"
    else:
        folder = target

    dest_dir = root / folder
    # Safety: dest_dir must remain inside root
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
        "url": public_url(rel),
        "size": len(file_bytes),
        "mime": mime or "application/octet-stream",
    }


def create_dir(root: Path, rel_path: str) -> dict:
    """Create a subdirectory under root. Returns the new dir info."""
    rel = _safe_rel(rel_path)
    if not rel:
        raise ValueError("folder name required")
    if "/" in rel.split("/")[-1] and rel != rel.strip("/"):
        # Allow nested paths but validate each segment
        pass
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
    """Delete a subdirectory only if empty. Returns the deleted dir info."""
    rel = _safe_rel(rel_path)
    if not rel:
        raise ValueError("cannot delete root")
    target = (root / rel).resolve()
    root_res = root.resolve()
    if not str(target).startswith(str(root_res)):
        raise ValueError("invalid path")
    if not target.is_dir():
        raise FileNotFoundError(rel_path)
    # Must be empty (no files, no subdirs)
    try:
        next(target.iterdir())
        raise ValueError("folder not empty")
    except StopIteration:
        pass
    target.rmdir()
    return {"path": rel}


def move_file(root: Path, src_rel: str, dest_dir_rel: str) -> dict:
    """Move a file into another folder. Returns the new path/url."""
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
    return {"name": dest.name, "path": new_rel, "url": public_url(new_rel)}


def delete_media(root: Path, rel_path: str) -> None:
    rel = _safe_rel(rel_path)
    target = (root / rel).resolve()
    root_res = root.resolve()
    if not str(target).startswith(str(root_res)):
        raise ValueError("invalid path")
    if not target.is_file():
        raise FileNotFoundError(rel_path)
    if not target.suffix.lower() in ALLOWED_EXT:
        raise ValueError("cannot delete this file type")
    target.unlink()
