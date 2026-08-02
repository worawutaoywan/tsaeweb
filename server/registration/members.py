"""TSAE member registry — SQLite storage, admin UI, member self-service, public search."""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import smtplib
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from email_templates import (
    EMAIL_TEMPLATES,
    render_member_email,
    render_membership_application_notify,
    render_password_reset_email,
)

router = APIRouter()

_db: Callable[[], sqlite3.Connection] | None = None
_esc: Callable[[Any], str] | None = None
_page_css: str = ""
_admin_nav: Callable[[str], str] | None = None
_admin_shell: Callable[..., tuple[str, str]] | None = None
_current_user: Callable[[Any], str | None] | None = None
_current_admin: Callable[[Request], str | None] | None = None
_require_admin: Callable[..., str] | None = None
_data_dir: Path = Path("/data")
_upload_dir: Path = Path("/data/uploads")
_secret_key: str = ""
_member_signer: URLSafeTimedSerializer | None = None

MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(45 * 1024 * 1024)))
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".doc", ".docx"}
FILE_CATEGORY_LABEL = {
    "payment": "หลักฐานการชำระเงิน",
    "document": "เอกสารแนบ",
    "association": "เอกสารจากสมาคม",
}

MEMBER_COOKIE = "tsae_member"
MEMBER_SESSION_MAX = 60 * 60 * 24 * 7  # 7 days
PWD_ITERATIONS = 120_000
PWD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"

SMTP_HOST = os.getenv("SMTP_HOST", "smtpout.secureserver.net")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "center@tsae.asia")
NOTIFY_EMAIL = os.getenv("NOTIFY_EMAIL", "center@tsae.asia")
SITE_URL = os.getenv("SITE_URL", "https://www.tsae.asia")

MEMBERSHIP_TYPE_MAP = {
    # Thai labels (admin / legacy / form display names)
    "สมาชิกสามัญ": ("ส.", "สามัญ 1 ปี", True),
    "สมาชิกภาคี": ("ภ.", "ภาคี", True),
    "สมาชิกสามัญตลอดชีพ": ("สช.", "สามัญตลอดชีพ", False),
    "สมาชิกนิติบุคคล": ("น.", "นิติบุคคล", True),
    # Stored type labels (after approve / subject rewrite)
    "สามัญ 1 ปี": ("ส.", "สามัญ 1 ปี", True),
    "สามัญตลอดชีพ": ("สช.", "สามัญตลอดชีพ", False),
    "ภาคี": ("ภ.", "ภาคี", True),
    "นิติบุคคล": ("น.", "นิติบุคคล", True),
    # English slugs from website form (option values)
    "regular-member": ("ส.", "สามัญ 1 ปี", True),
    "associate-member": ("ภ.", "ภาคี", True),
    "life-member": ("สช.", "สามัญตลอดชีพ", False),
    "corporate-member": ("น.", "นิติบุคคล", True),
}

_THAI_MONTHS = (
    "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
)


def configure(
    *,
    db: Callable[[], sqlite3.Connection],
    esc: Callable[[Any], str],
    page_css: str,
    admin_nav: Callable[[str], str],
    current_admin: Callable[[Request], str | None],
    require_admin: Callable[..., str],
    secret_key: str,
    data_dir: Path,
    upload_dir: Path | None = None,
    admin_shell: Callable[..., tuple[str, str]] | None = None,
) -> None:
    global _db, _esc, _page_css, _admin_nav, _admin_shell, _current_admin, _current_user, _require_admin
    global _data_dir, _secret_key, _member_signer, _upload_dir
    _db = db
    _esc = esc
    _page_css = page_css
    _admin_nav = admin_nav
    _admin_shell = admin_shell
    _current_admin = current_admin
    _current_user = current_admin
    _require_admin = require_admin
    _data_dir = data_dir
    _upload_dir = upload_dir or (data_dir / "uploads")
    _upload_dir.mkdir(parents=True, exist_ok=True)
    _secret_key = secret_key
    _member_signer = URLSafeTimedSerializer(secret_key, salt="tsae-member-session")


def init_members_table(con: sqlite3.Connection) -> None:
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS members (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            code          TEXT NOT NULL UNIQUE,
            type          TEXT NOT NULL,
            name          TEXT NOT NULL,
            contact       TEXT,
            email         TEXT,
            phone         TEXT,
            expiry        TEXT,
            active        INTEGER NOT NULL DEFAULT 1,
            profile_token TEXT,
            token_expires TEXT,
            password_hash TEXT,
            notes         TEXT,
            updated_at    TEXT,
            created_at    TEXT NOT NULL
        )
        """
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_members_name ON members(name)")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS member_files (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            member_id     INTEGER NOT NULL,
            category      TEXT NOT NULL,
            original_name TEXT NOT NULL,
            stored_path   TEXT NOT NULL,
            uploaded_at   TEXT NOT NULL,
            uploaded_by   TEXT NOT NULL DEFAULT 'member',
            note          TEXT
        )
        """
    )
    con.execute("CREATE INDEX IF NOT EXISTS idx_member_files_member ON member_files(member_id)")
    for col, definition in [
        ("uploaded_by", "TEXT NOT NULL DEFAULT 'member'"),
        ("note", "TEXT"),
    ]:
        try:
            con.execute(f"ALTER TABLE member_files ADD COLUMN {col} {definition}")
        except sqlite3.OperationalError:
            pass
    try:
        con.execute("ALTER TABLE members ADD COLUMN password_hash TEXT")
    except sqlite3.OperationalError:
        pass


def _row_val(row: sqlite3.Row, key: str, default: Any = None) -> Any:
    try:
        return row[key]
    except (KeyError, IndexError):
        return default


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def content_disposition(filename: str, *, inline: bool = False) -> str:
    disposition = "inline" if inline else "attachment"
    ascii_fallback = re.sub(r"[^\x20-\x7E]", "_", filename) or "download"
    utf8 = quote(filename, safe="")
    return f'{disposition}; filename="{ascii_fallback}"; filename*=UTF-8\'\'{utf8}'


def _file_media_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".heic": "image/heic",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(ext, "application/octet-stream")


def file_download_response(path: Path, filename: str, *, inline: bool = False) -> Response:
    return Response(
        content=path.read_bytes(),
        media_type=_file_media_type(filename),
        headers={"Content-Disposition": content_disposition(filename, inline=inline)},
    )


def _generate_member_password(length: int = 10) -> str:
    return "".join(secrets.choice(PWD_ALPHABET) for _ in range(length))


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PWD_ITERATIONS)
    return f"{salt}${digest.hex()}"


def _verify_password(password: str, stored: str | None) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, expected = stored.split("$", 1)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PWD_ITERATIONS)
    return secrets.compare_digest(digest.hex(), expected)


def _normalize_member_code(code: str) -> str:
    """Strip spaces so สช. 0270 → สช.0270 (sorts with other สช. codes)."""
    return re.sub(r"\s+", "", (code or "").strip())


def _code_digits(code: str) -> str:
    return re.sub(r"\D", "", code or "")


def _next_member_code(con: sqlite3.Connection, prefix: str) -> str:
    """Next code for prefix. Note: ส. must not match สช. codes."""
    rows = con.execute("SELECT code FROM members").fetchall()
    max_n = 0
    for r in rows:
        code = _normalize_member_code(r["code"])
        if not code.startswith(prefix):
            continue
        if prefix == "ส." and code.startswith("สช."):
            continue
        try:
            max_n = max(max_n, int(_code_digits(code)))
        except ValueError:
            pass
    return f"{prefix}{max_n + 1:04d}"


def _thai_expiry_one_year() -> str:
    d = datetime.now().date() + timedelta(days=365)
    return f"{d.day} {_THAI_MONTHS[d.month]} {d.year + 543}"


def _map_membership_subject(subject: str) -> tuple[str, str, bool]:
    """Return (code_prefix, type_label, is_annual)."""
    raw = (subject or "").strip()
    if not raw:
        return ("ส.", "สามัญ 1 ปี", True)
    # Exact key (Thai or English slug)
    if raw in MEMBERSHIP_TYPE_MAP:
        return MEMBERSHIP_TYPE_MAP[raw]
    low = raw.lower()
    for key, val in MEMBERSHIP_TYPE_MAP.items():
        if key.lower() == low:
            return val
    # Substring — longest keys first so "สามัญตลอดชีพ" wins over "สามัญ"
    for key, val in sorted(MEMBERSHIP_TYPE_MAP.items(), key=lambda kv: -len(kv[0])):
        if key in raw or key.lower() in low:
            return val
    return ("ส.", "สามัญ 1 ปี", True)


def _submission_status(r: sqlite3.Row) -> str:
    try:
        status = r["status"]
        if status:
            return status
    except (KeyError, IndexError):
        pass
    try:
        extra = json.loads(r["extra"] or "{}")
        return extra.get("status") or "pending"
    except Exception:
        return "pending"


def _submission_member_id(r: sqlite3.Row) -> int | None:
    try:
        mid = r["approved_member_id"]
        if mid:
            return int(mid)
    except (KeyError, IndexError, TypeError, ValueError):
        pass
    try:
        extra = json.loads(r["extra"] or "{}")
        mid = extra.get("member_id")
        return int(mid) if mid else None
    except Exception:
        return None


def _digits_match(a: str, b: str) -> bool:
    aa = _code_digits(a).lstrip("0") or "0"
    bb = _code_digits(b).lstrip("0") or "0"
    return aa == bb


def _member_login_number(code: str) -> str:
    """Numeric part for login hint, e.g. ส.0433 → 433."""
    d = _code_digits(code)
    return d.lstrip("0") or d


def _find_member_for_login(identifier: str) -> sqlite3.Row | None:
    """Look up member by email, full code (ส.0466), or digits-only (466)."""
    assert _db is not None
    identifier = identifier.strip()
    if not identifier:
        return None
    con = _db()
    if "@" in identifier:
        row = con.execute(
            "SELECT * FROM members WHERE LOWER(email)=? AND email!=''",
            (identifier.lower(),),
        ).fetchone()
        con.close()
        return row
    norm = re.sub(r"\s+", "", identifier)
    row = con.execute("SELECT * FROM members WHERE code=?", (norm,)).fetchone()
    if row:
        con.close()
        return row
    rows = con.execute("SELECT * FROM members").fetchall()
    con.close()
    matches = [r for r in rows if _digits_match(identifier, r["code"])]
    if len(matches) == 1:
        return matches[0]
    return None


def _set_member_password(con: sqlite3.Connection, member_id: int, password: str) -> None:
    con.execute(
        "UPDATE members SET password_hash=?, updated_at=? WHERE id=?",
        (_hash_password(password), _now(), member_id),
    )


def _issue_member_password(con: sqlite3.Connection, member_id: int) -> str:
    password = _generate_member_password()
    _set_member_password(con, member_id, password)
    return password


def _list_member_files(member_id: int) -> list[sqlite3.Row]:
    assert _db is not None
    con = _db()
    rows = con.execute(
        "SELECT * FROM member_files WHERE member_id=? ORDER BY uploaded_at DESC",
        (member_id,),
    ).fetchall()
    con.close()
    return rows


def _group_all_member_files() -> dict[int, list[sqlite3.Row]]:
    assert _db is not None
    con = _db()
    rows = con.execute(
        "SELECT * FROM member_files ORDER BY uploaded_at DESC"
    ).fetchall()
    con.close()
    out: dict[int, list[sqlite3.Row]] = {}
    for r in rows:
        out.setdefault(r["member_id"], []).append(r)
    return out


def _file_counts_by_member() -> dict[int, dict[str, int]]:
    assert _db is not None
    con = _db()
    rows = con.execute(
        """SELECT member_id, category, COUNT(*) c FROM member_files
           GROUP BY member_id, category"""
    ).fetchall()
    con.close()
    out: dict[int, dict[str, int]] = {}
    for r in rows:
        mid = r["member_id"]
        out.setdefault(mid, {"total": 0, "payment": 0, "document": 0, "association": 0})
        out[mid]["total"] += r["c"]
        if r["category"] in out[mid]:
            out[mid][r["category"]] = r["c"]
    return out


async def _save_member_file(
    member_id: int,
    category: str,
    upload: UploadFile | None,
    *,
    uploaded_by: str = "member",
    note: str = "",
) -> str | None:
    if upload is None or not upload.filename:
        return None
    if category not in FILE_CATEGORY_LABEL:
        return "invalid category"
    ext = Path(upload.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return f"ไม่รองรับไฟล์ {ext}"
    blob = await upload.read()
    if len(blob) > MAX_FILE_BYTES:
        mb = MAX_FILE_BYTES // (1024 * 1024)
        return f"ไฟล์ใหญ่เกิน {mb} MB"
    member_dir = _upload_dir / "members" / str(member_id)
    member_dir.mkdir(parents=True, exist_ok=True)
    stored = f"members/{member_id}/{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:10]}{ext}"
    (_upload_dir / stored).write_bytes(blob)
    assert _db is not None
    con = _db()
    con.execute(
        """INSERT INTO member_files
           (member_id, category, original_name, stored_path, uploaded_at, uploaded_by, note)
           VALUES (?,?,?,?,?,?,?)""",
        (member_id, category, upload.filename, stored, _now(), uploaded_by, note.strip()),
    )
    con.commit()
    con.close()
    return None


def _file_source(f: sqlite3.Row) -> str:
    try:
        return f["uploaded_by"] or "member"
    except (KeyError, IndexError):
        return "member"


def _file_note(f: sqlite3.Row) -> str:
    try:
        return (f["note"] or "").strip()
    except (KeyError, IndexError):
        return ""


def _category_badge_class(category: str) -> str:
    return {"payment": "nat", "document": "int", "association": "mb"}.get(category, "int")


def _resolve_member_file(fid: int) -> sqlite3.Row | None:
    assert _db is not None
    con = _db()
    row = con.execute("SELECT * FROM member_files WHERE id=?", (fid,)).fetchone()
    con.close()
    return row


def _delete_member_file_row(row: sqlite3.Row) -> None:
    rel = (row["stored_path"] or "").lstrip("/")
    target = (_upload_dir / rel).resolve()
    if str(target).startswith(str(_upload_dir.resolve())) and target.exists():
        try:
            target.unlink()
        except OSError:
            pass
    assert _db is not None
    con = _db()
    con.execute("DELETE FROM member_files WHERE id=?", (row["id"],))
    con.commit()
    con.close()


def _files_html(
    files: list,
    *,
    admin: bool = False,
    allow_member_delete: bool = True,
) -> str:
    e = _esc
    assert e is not None
    if not files:
        return '<p class="muted" style="margin:0">ยังไม่มีไฟล์</p>'
    parts = ['<ul class="filelist" style="margin:0;padding:0;list-style:none">']
    for f in files:
        label = FILE_CATEGORY_LABEL.get(f["category"], f["category"])
        source = _file_source(f)
        note = _file_note(f)
        try:
            dt = datetime.fromisoformat(f["uploaded_at"]).strftime("%d/%m/%Y %H:%M")
        except Exception:
            dt = e(f["uploaded_at"])
        href = f"/api/admin/members/file/{f['id']}" if admin else f"/api/member/file/{f['id']}"
        del_form = ""
        if admin:
            del_form = (
                f'<form method="post" action="/api/admin/members/files/{f["id"]}/delete" style="display:inline;margin-left:8px">'
                f'<button type="submit" class="del-btn" onclick="event.stopPropagation()">ลบ</button></form>'
            )
        elif allow_member_delete and source == "member":
            del_form = (
                f'<form method="post" action="/api/member/files/{f["id"]}/delete" style="display:inline;margin-left:8px">'
                f'<button type="submit" class="del-btn" onclick="event.stopPropagation()">ลบ</button></form>'
            )
        source_badge = (
            '<span class="badge mb" style="margin-right:6px">สมาคม</span>'
            if source == "admin"
            else '<span class="badge nat" style="margin-right:6px;opacity:.85">สมาชิก</span>'
        )
        note_html = f'<span class="sub" style="display:block;margin-top:2px">{e(note)}</span>' if note else ""
        parts.append(
            f'<li style="padding:10px 0;border-bottom:1px solid #f0f4f1">'
            f'{source_badge}'
            f'<span class="badge {_category_badge_class(f["category"])}" style="margin-right:8px">{e(label)}</span>'
            f'<a class="dl" href="{href}" onclick="event.stopPropagation()">{e(f["original_name"])}</a>'
            f'<span class="sub" style="margin-left:8px">{dt}</span>'
            f'{note_html}{del_form}</li>'
        )
    parts.append("</ul>")
    return "".join(parts)


def _admin_files_panel(mid: int, files: list) -> str:
    e = _esc
    assert e is not None
    member_files = [f for f in files if _file_source(f) == "member"]
    admin_files = [f for f in files if _file_source(f) == "admin"]
    accept = ",".join(ALLOWED_EXT)
    cat_opts = "".join(
        f'<option value="{k}"{" selected" if k == "association" else ""}>{e(v)}</option>'
        for k, v in FILE_CATEGORY_LABEL.items()
    )
    return f"""
  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e7ede9">
    <h3 style="margin:0 0 6px;font-size:15px;color:#0f5a30">เอกสารและไฟล์แนบ</h3>
    <p class="sub" style="margin:0 0 16px">จัดเก็บเอกสารให้สมาชิก — สมาชิกดาวน์โหลดได้จากหน้าเข้าสู่ระบบ</p>
    <div class="fgrid" style="margin-bottom:20px">
      <div class="fld full" style="background:#f8faf9;border-radius:12px;padding:14px 16px">
        <label style="color:#0f5a30">📤 อัปโหลดไฟล์ให้สมาชิก (จากสมาคม)</label>
        <form method="post" action="/api/admin/members/{mid}/files/upload" enctype="multipart/form-data" style="margin-top:10px">
          <div class="fgrid">
            <div class="fld">
              <label>ประเภทเอกสาร</label>
              <select name="category">
                {cat_opts}
              </select>
            </div>
            <div class="fld">
              <label>คำอธิบาย (ไม่บังคับ)</label>
              <input name="note" placeholder="เช่น บัตรสมาชิก 2569, ใบเสร็จค่าบำรุง">
            </div>
            <div class="fld full">
              <label>เลือกไฟล์</label>
              <input type="file" name="file" accept="{accept}" required>
            </div>
          </div>
          <div class="factions" style="margin-top:12px">
            <button type="submit" class="btn btn-save">อัปโหลดไฟล์</button>
          </div>
        </form>
      </div>
    </div>
    <h4 style="margin:0 0 8px;font-size:13px;color:#42514a">เอกสารจากสมาคม ({len(admin_files)})</h4>
    {_files_html(admin_files, admin=True)}
    <h4 style="margin:18px 0 8px;font-size:13px;color:#42514a">ไฟล์ที่สมาชิกอัปโหลด ({len(member_files)})</h4>
    {_files_html(member_files, admin=True)}
    <p class="sub" style="margin-top:12px">สมาชิกอัปโหลดเพิ่มได้ที่ <a href="{SITE_URL}/api/member/login">เข้าสู่ระบบสมาชิก</a></p>
  </div>"""


def _admin_email_panel(mid: int, email_addr: str) -> str:
    e = _esc
    assert e is not None
    if not email_addr:
        return '<p class="muted" style="margin-top:12px">ไม่มีอีเมล — ไม่สามารถส่งอีเมลได้</p>'
    tpl_opts = "".join(
        f'<option value="{k}">{e(v["label"])}</option>'
        for k, v in EMAIL_TEMPLATES.items()
    )
    return f"""
  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e7ede9">
    <h3 style="margin:0 0 6px;font-size:15px;color:#0f5a30">📧 ส่งอีเมลถึงสมาชิก</h3>
    <p class="sub" style="margin:0 0 16px">เทมเพลตแบรนด์ TSAE · ส่งไปที่ {e(email_addr)} · เทมเพลตเชิญจะสร้างรหัสผ่านใหม่และแนบในอีเมล</p>
    <form method="post" action="/api/admin/members/{mid}/email" id="emailForm">
      <div class="fgrid">
        <div class="fld">
          <label>เทมเพลต</label>
          <select name="template" id="emailTpl" onchange="toggleCustomBody()">
            {tpl_opts}
          </select>
        </div>
        <div class="fld">
          <label>หัวข้ออีเมล (ไม่บังคับ)</label>
          <input name="subject" placeholder="เว้นว่างเพื่อใช้หัวข้อมาตรฐาน">
        </div>
        <div class="fld full" id="customBodyFld" style="display:none">
          <label>ข้อความ (สำหรับเทมเพลตกำหนดเอง)</label>
          <textarea name="body" rows="4" style="width:100%;padding:10px 12px;border:1px solid #d6e3db;
            border-radius:10px;font-size:14px;font-family:inherit;resize:vertical"
            placeholder="พิมพ์ข้อความถึงสมาชิก…"></textarea>
        </div>
      </div>
      <div class="factions" style="margin-top:12px">
        <button type="submit" class="btn btn-gold">ส่งอีเมล</button>
      </div>
    </form>
  </div>
  <script>
  function toggleCustomBody() {{
    var show = document.getElementById('emailTpl').value === 'custom';
    document.getElementById('customBodyFld').style.display = show ? '' : 'none';
  }}
  </script>"""


def _is_active(expiry: str) -> bool:
    e = (expiry or "").lower()
    return "สิ้นสมาชิก" not in e and "หมดอายุ" not in e


def import_members_json(path: Path | None = None, *, replace: bool = False) -> int:
    assert _db is not None
    src = path or (_data_dir / "members.json")
    if not src.exists():
        return 0
    items = json.loads(src.read_text(encoding="utf-8"))
    con = _db()
    if replace:
        con.execute("DELETE FROM members")
    n = 0
    for m in items:
        code = (m.get("code") or "").strip()
        if not code:
            continue
        expiry = m.get("expiry") or ""
        active = 1 if m.get("active", _is_active(expiry)) else 0
        try:
            con.execute(
                """INSERT INTO members
                   (code, type, name, contact, email, phone, expiry, active, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(code) DO UPDATE SET
                     type=excluded.type, name=excluded.name, contact=excluded.contact,
                     email=excluded.email, phone=excluded.phone, expiry=excluded.expiry,
                     active=excluded.active, updated_at=excluded.updated_at""",
                (
                    code,
                    m.get("type") or "",
                    m.get("name") or "",
                    m.get("contact") or "",
                    (m.get("email") or "").strip().lower(),
                    m.get("phone") or "",
                    expiry,
                    active,
                    _now(),
                    _now(),
                ),
            )
            n += 1
        except sqlite3.Error:
            pass
    con.commit()
    con.close()
    return n


def maybe_auto_import() -> int:
    assert _db is not None
    con = _db()
    count = con.execute("SELECT COUNT(*) c FROM members").fetchone()["c"]
    con.close()
    if count == 0:
        return import_members_json()
    return 0


def _send_email(to: str, subject: str, body_html: str, body_text: str = "") -> tuple[bool, str]:
    if not SMTP_USER or not SMTP_PASS:
        return False, "SMTP not configured (set SMTP_USER / SMTP_PASS in .env)"
    if not to or "@" not in to:
        return False, "no recipient email"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"TSAE <{SMTP_FROM}>"
    msg["To"] = to
    if body_text:
        msg.attach(MIMEText(body_text, "plain", "utf-8"))
    msg.attach(MIMEText(body_html, "html", "utf-8"))
    try:
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(SMTP_FROM, [to], msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(SMTP_FROM, [to], msg.as_string())
        return True, "sent"
    except Exception as e:
        return False, str(e)[:200]


def notify_membership_application(
    *,
    submission_id: int,
    name: str,
    email: str,
    phone: str = "",
    organization: str = "",
    membership_type: str = "",
    message: str = "",
) -> tuple[bool, str]:
    subj, html, plain = render_membership_application_notify(
        name=name,
        email=email,
        phone=phone,
        organization=organization,
        membership_type=membership_type,
        message=message,
        submission_id=submission_id,
        site_url=SITE_URL,
    )
    return _send_email(NOTIFY_EMAIL, subj, html, plain)


def _attach_submission_files(con: sqlite3.Connection, member_id: int, extra_json: str) -> None:
    try:
        files = (json.loads(extra_json or "{}").get("files") or [])
    except Exception:
        files = []
    for f in files:
        label = f.get("label") or ""
        category = "payment" if "ชำระ" in label else "document"
        stored = f.get("stored_path") or ""
        if not stored:
            continue
        con.execute(
            """INSERT INTO member_files
               (member_id, category, original_name, stored_path, uploaded_at, uploaded_by, note)
               VALUES (?,?,?,?,?,?,?)""",
            (
                member_id,
                category,
                f.get("original_name") or Path(stored).name,
                stored,
                f.get("uploaded_at") or _now(),
                "admin",
                label,
            ),
        )


def _approve_membership_submission(con: sqlite3.Connection, sid: int) -> tuple[int, str]:
    row = con.execute(
        "SELECT * FROM submissions WHERE id=? AND kind='membership' AND is_spam=0",
        (sid,),
    ).fetchone()
    if not row:
        raise ValueError("ไม่พบใบสมัคร")
    if _submission_status(row) == "approved":
        mid = _submission_member_id(row)
        if mid:
            return mid, "อนุมัติแล้ว"
        raise ValueError("ใบสมัครนี้อนุมัติแล้ว")

    email = (row["email"] or "").strip().lower()
    if email:
        dup = con.execute(
            "SELECT id FROM members WHERE LOWER(email)=? AND email!=''",
            (email,),
        ).fetchone()
        if dup:
            raise ValueError(f"มีสมาชิกที่ใช้อีเมล {email} อยู่แล้ว")

    subject = row["subject"] or ""
    try:
        extra0 = json.loads(row["extra"] or "{}")
        subject = extra0.get("membershipType") or subject
    except Exception:
        pass
    prefix, member_type, annual = _map_membership_subject(subject)
    code = _next_member_code(con, prefix)
    expiry = _thai_expiry_one_year() if annual else "ตลอดชีพ"
    now = _now()

    cur = con.execute(
        """INSERT INTO members
           (code, type, name, contact, email, phone, expiry, active, notes, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            code,
            member_type,
            row["name"] or "",
            row["organization"] or "",
            email,
            row["phone"] or "",
            expiry,
            1,
            f"อนุมัติจากใบสมัคร #{sid}",
            now,
            now,
        ),
    )
    member_id = cur.lastrowid or 0
    if not member_id:
        raise ValueError("ไม่สามารถสร้างสมาชิกได้")

    _attach_submission_files(con, member_id, row["extra"] or "")
    password = _issue_member_password(con, member_id)

    extra = {}
    try:
        extra = json.loads(row["extra"] or "{}")
    except Exception:
        pass
    extra["status"] = "approved"
    extra["member_id"] = member_id
    extra["member_code"] = code
    extra["approved_at"] = now

    con.execute(
        """UPDATE submissions SET status='approved', approved_member_id=?, extra=?
           WHERE id=?""",
        (member_id, json.dumps(extra, ensure_ascii=False), sid),
    )

    if email:
        login_url = f"{SITE_URL}/api/member/login"
        subj, html, plain = render_member_email(
            "invite",
            name=row["name"] or "",
            code=code,
            email=email,
            login_url=login_url,
            site_url=SITE_URL,
            password=password,
        )
        _send_email(email, subj, html, plain)

    return member_id, code


def _member_session(request: Request) -> dict | None:
    if not _member_signer:
        return None
    token = request.cookies.get(MEMBER_COOKIE)
    if not token:
        return None
    try:
        return _member_signer.loads(token, max_age=MEMBER_SESSION_MAX)
    except (BadSignature, SignatureExpired):
        return None


def _set_member_cookie(response: RedirectResponse, payload: dict) -> None:
    assert _member_signer is not None
    tok = _member_signer.dumps(payload)
    response.set_cookie(
        MEMBER_COOKIE, tok, httponly=True, samesite="lax",
        max_age=MEMBER_SESSION_MAX, path="/api",
    )


def _public_member_dict(r: sqlite3.Row) -> dict:
    return {
        "code": r["code"],
        "name": r["name"],
    }


# ── Public API (read-only search) ───────────────────────────────────────────

@router.get("/members/search")
def public_search(q: str = "", type: str = "", status: str = "", limit: int = 50):
    assert _db is not None
    limit = max(1, min(limit, 100))
    q = q.strip()
    if len(q) < 2:
        return {"items": [], "total": 0}
    con = _db()
    sql = "SELECT code, name FROM members WHERE active=1"
    params: list[Any] = []
    ql = f"%{q.lower()}%"
    sql += " AND (LOWER(code) LIKE ? OR LOWER(name) LIKE ?)"
    params.extend([ql, ql])
    sql += " ORDER BY code LIMIT ?"
    params.append(limit)
    rows = con.execute(sql, params).fetchall()
    con.close()
    items = [_public_member_dict(r) for r in rows]
    return {"items": items, "total": len(items)}


# ── Member self-service ───────────────────────────────────────────────────────

def _member_login_page(error: str = "", info: str = "") -> str:
    e = _esc
    err = f'<p class="ferr">{e(error)}</p>' if error else ""
    inf = f'<p style="background:#ecfdf3;color:#166534;padding:10px;border-radius:10px;font-size:13px">{e(info)}</p>' if info else ""
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSAE · เข้าสู่ระบบสมาชิก</title>
<style>{_page_css}</style></head><body>
<div class="formwrap"><div class="fcard">
  <h2>เข้าสู่ระบบสมาชิก TSAE</h2>
  <p class="s">กรอก<strong>เลขสมาชิก</strong> (เช่น <code>466</code> หรือ <code>ส.0466</code>) หรือ<strong>อีเมล</strong> อย่างใดอย่างหนึ่ง พร้อมรหัสผ่าน</p>
  {err}{inf}
  <form method="post" action="/api/member/login">
    <div class="fgrid">
      <div class="fld full"><label>เลขสมาชิก หรือ อีเมล</label>
        <input name="login" placeholder="466 / ส.0466 / email@example.com" required autocomplete="username"></div>
      <div class="fld full"><label>รหัสผ่าน</label><input name="password" type="password" required autocomplete="current-password"></div>
    </div>
    <div class="factions"><button type="submit" class="btn btn-save">เข้าสู่ระบบ</button>
      <a class="btn btn-ghost" href="{SITE_URL}/th/about/members/">กลับหน้าสมาชิก</a></div>
    <p class="sub" style="margin-top:14px;text-align:center">
      <a href="/api/member/forgot-password">ลืมรหัสผ่าน? ขอรหัสผ่านใหม่ทางอีเมล</a>
    </p>
  </form>
</div></div></body></html>"""


def _member_forgot_page(error: str = "", info: str = "") -> str:
    e = _esc
    err = f'<p class="ferr">{e(error)}</p>' if error else ""
    inf = f'<p style="background:#ecfdf3;color:#166534;padding:10px;border-radius:10px;font-size:13px">{e(info)}</p>' if info else ""
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSAE · ลืมรหัสผ่าน</title>
<style>{_page_css}</style></head><body>
<div class="formwrap"><div class="fcard">
  <h2>ลืมรหัสผ่าน</h2>
  <p class="s">กรอก<strong>เลขสมาชิก</strong> (เช่น <code>466</code> หรือ <code>ส.0466</code>) หรือ<strong>อีเมล</strong> ที่ลงทะเบียน</p>
  {err}{inf}
  <form method="post" action="/api/member/forgot-password">
    <div class="fgrid">
      <div class="fld full"><label>เลขสมาชิก หรือ อีเมล</label>
        <input name="login" placeholder="466 / ส.0466 / email@example.com" required autocomplete="username"></div>
    </div>
    <div class="factions">
      <button type="submit" class="btn btn-save">ส่งรหัสผ่านใหม่ทางอีเมล</button>
      <a class="btn btn-line" href="/api/member/login">กลับหน้าเข้าสู่ระบบ</a>
    </div>
  </form>
</div></div></body></html>"""


@router.get("/member/login", response_class=HTMLResponse)
def member_login_get(request: Request, msg: str = ""):
    if _member_session(request):
        return RedirectResponse("/api/member/profile", status_code=303)
    info = ""
    if msg == "saved":
        info = "อัปเดตข้อมูลสำเร็จ"
    elif msg == "password_changed":
        info = "เปลี่ยนรหัสผ่านสำเร็จ"
    return HTMLResponse(_member_login_page(info=info))


@router.post("/member/login")
def member_login_post(login: str = Form(...), password: str = Form(...)):
    row = _find_member_for_login(login)
    if not row:
        return HTMLResponse(
            _member_login_page(error="ไม่พบเลขสมาชิกหรืออีเมลนี้ — ติดต่อ center@tsae.asia"),
            status_code=401,
        )
    if not _row_val(row, "password_hash"):
        return HTMLResponse(
            _member_login_page(
                error="ยังไม่มีรหัสผ่านในระบบ — กด 「ลืมรหัสผ่าน」 เพื่อรับรหัสผ่านทางอีเมล หรือติดต่อ center@tsae.asia"
            ),
            status_code=401,
        )
    if not _verify_password(password, _row_val(row, "password_hash")):
        return HTMLResponse(_member_login_page(error="รหัสผ่านไม่ถูกต้อง"), status_code=401)
    resp = RedirectResponse("/api/member/profile", status_code=303)
    _set_member_cookie(resp, {"id": row["id"], "code": row["code"]})
    return resp


@router.get("/member/forgot-password", response_class=HTMLResponse)
def member_forgot_get(request: Request, msg: str = ""):
    if _member_session(request):
        return RedirectResponse("/api/member/profile", status_code=303)
    info = "ส่งรหัสผ่านใหม่ไปที่อีเมลของท่านแล้ว กรุณาตรวจสอบกล่องจดหมาย" if msg == "sent" else ""
    return HTMLResponse(_member_forgot_page(info=info))


@router.post("/member/forgot-password")
def member_forgot_post(login: str = Form(...)):
    assert _db is not None
    row = _find_member_for_login(login)
    con = _db()
    if row and row["email"]:
        password = _issue_member_password(con, row["id"])
        con.commit()
        login_url = f"{SITE_URL}/api/member/login"
        subj, html, plain = render_password_reset_email(
            name=row["name"],
            code=row["code"],
            email=row["email"],
            password=password,
            login_url=login_url,
            site_url=SITE_URL,
        )
        _send_email(row["email"], subj, html, plain)
    else:
        con.commit()
    con.close()
    return RedirectResponse("/api/member/forgot-password?msg=sent", status_code=303)


@router.get("/member/logout")
def member_logout():
    resp = RedirectResponse("/api/member/login", status_code=303)
    resp.delete_cookie(MEMBER_COOKIE, path="/api")
    return resp


@router.get("/member/profile", response_class=HTMLResponse)
def member_profile_get(request: Request, msg: str = "", err: str = ""):
    sess = _member_session(request)
    if not sess:
        return RedirectResponse("/api/member/login", status_code=303)
    assert _db is not None
    con = _db()
    row = con.execute("SELECT * FROM members WHERE id=?", (sess["id"],)).fetchone()
    con.close()
    if not row:
        return RedirectResponse("/api/member/login", status_code=303)
    files = _list_member_files(sess["id"])
    admin_files = [f for f in files if _file_source(f) == "admin"]
    member_files = [f for f in files if _file_source(f) == "member"]
    e = _esc
    assert e is not None
    banner = ""
    if msg == "saved":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">บันทึกข้อมูลสำเร็จ</p>'
    elif msg == "uploaded":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">อัปโหลดไฟล์สำเร็จ</p>'
    elif msg == "deleted":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">ลบไฟล์แล้ว</p>'
    elif msg == "password_changed":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">เปลี่ยนรหัสผ่านสำเร็จ</p>'
    if err:
        banner = f'<p class="ferr">{e(err)}</p>'
    accept = ",".join(ALLOWED_EXT)
    return HTMLResponse(f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ข้อมูลสมาชิก · {e(row['code'])}</title>
<style>{_page_css}
.uploadbox{{border:1px dashed #c5d6cc;border-radius:12px;padding:14px;background:#fafdfb}}
.uploadbox label{{display:block;font-size:12px;font-weight:600;color:#42514a;margin:0 0 6px}}
.uploadbox input[type=file]{{width:100%;font-size:13px}}
.filelist li:last-child{{border-bottom:0!important}}
</style></head><body>
<div class="formwrap">{banner}<div class="fcard">
  <h2>ข้อมูลสมาชิกของท่าน</h2>
  <p class="s">รหัส {e(row['code'])} · {e(row['type'])} · สถานะ: {'สมาชิกอยู่' if row['active'] else 'สิ้นสภาพแล้ว'}</p>
  <form method="post" action="/api/member/profile" enctype="multipart/form-data">
    <div class="fgrid">
      <div class="fld full"><label>ชื่อ-นามสกุล (ไม่สามารถแก้ได้)</label>
        <input value="{e(row['name'])}" disabled></div>
      <div class="fld"><label>อีเมล</label><input name="email" type="email" value="{e(row['email'])}" required></div>
      <div class="fld"><label>โทรศัพท์</label><input name="phone" value="{e(row['phone'])}"></div>
      <div class="fld full"><label>ที่อยู่ / หน่วยงานติดต่อ</label>
        <input name="contact" value="{e(row['contact'])}"></div>
    </div>
    <h3 style="margin:24px 0 10px;font-size:15px;color:#0f5a30">เอกสารจากสมาคม</h3>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;margin-bottom:18px">
      {_files_html(admin_files, allow_member_delete=False) if admin_files else '<p class="muted" style="margin:0">ยังไม่มีเอกสารจากสมาคม</p>'}
    </div>
    <h3 style="margin:0 0 10px;font-size:15px;color:#0f5a30">ไฟล์ที่ท่านอัปโหลด</h3>
    {_files_html(member_files)}
    <div class="fgrid" style="margin-top:18px">
      <div class="fld full uploadbox">
        <label>อัปโหลดหลักฐานการชำระเงิน (สลิปโอนเงิน ฯลฯ)</label>
        <input type="file" name="payment_file" accept="{accept}">
        <p class="sub" style="margin:6px 0 0">PDF, JPG, PNG · สูงสุด {MAX_FILE_BYTES // (1024*1024)} MB</p>
      </div>
      <div class="fld full uploadbox">
        <label>อัปโหลดเอกสารแนบ (ใบสมัคร บัตรประชาชน ฯลฯ)</label>
        <input type="file" name="document_file" accept="{accept}">
      </div>
    </div>
    <div class="factions">
      <button type="submit" class="btn btn-save">บันทึกข้อมูล / อัปโหลดไฟล์</button>
      <a class="btn btn-line" href="/api/member/logout">ออกจากระบบ</a>
    </div>
  </form>

  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e7ede9">
    <h3 style="margin:0 0 10px;font-size:15px;color:#0f5a30">เปลี่ยนรหัสผ่าน</h3>
    <p class="sub" style="margin:0 0 14px">เปลี่ยนรหัสผ่านได้ตลอดเวลา · หากลืมรหัสผ่าน ใช้เมนูด้านล่าง</p>
    <form method="post" action="/api/member/password">
      <div class="fgrid">
        <div class="fld full"><label>รหัสผ่านปัจจุบัน</label>
          <input name="current_password" type="password" required autocomplete="current-password"></div>
        <div class="fld"><label>รหัสผ่านใหม่</label>
          <input name="new_password" type="password" required minlength="8" autocomplete="new-password"></div>
        <div class="fld"><label>ยืนยันรหัสผ่านใหม่</label>
          <input name="confirm_password" type="password" required minlength="8" autocomplete="new-password"></div>
      </div>
      <div class="factions" style="margin-top:12px">
        <button type="submit" class="btn btn-gold">เปลี่ยนรหัสผ่าน</button>
      </div>
    </form>
    <p class="sub" style="margin-top:10px">
      ลืมรหัสผ่าน? <a href="/api/member/forgot-password">ขอรหัสผ่านใหม่ทางอีเมล</a>
    </p>
  </div>

  <p class="sub" style="margin-top:16px">หากต้องการความช่วยเหลือ ติดต่อ <a href="mailto:center@tsae.asia">center@tsae.asia</a></p>
</div></div></body></html>""")


@router.post("/member/profile")
async def member_profile_post(
    request: Request,
    email: str = Form(...),
    phone: str = Form(""),
    contact: str = Form(""),
    payment_file: UploadFile | None = File(None),
    document_file: UploadFile | None = File(None),
):
    sess = _member_session(request)
    if not sess:
        return RedirectResponse("/api/member/login", status_code=303)
    assert _db is not None
    email = email.strip().lower()
    upload_errs: list[str] = []
    for cat, up in (("payment", payment_file), ("document", document_file)):
        err = await _save_member_file(sess["id"], cat, up)
        if err:
            upload_errs.append(err)
    con = _db()
    con.execute(
        "UPDATE members SET email=?, phone=?, contact=?, updated_at=? WHERE id=?",
        (email, phone.strip(), contact.strip(), _now(), sess["id"]),
    )
    con.commit()
    con.close()
    if upload_errs:
        return RedirectResponse(
            f"/api/member/profile?err={upload_errs[0]}",
            status_code=303,
        )
    has_upload = (
        (payment_file and payment_file.filename)
        or (document_file and document_file.filename)
    )
    msg = "uploaded" if has_upload else "saved"
    return RedirectResponse(f"/api/member/profile?msg={msg}", status_code=303)


@router.post("/member/password")
def member_change_password(
    request: Request,
    current_password: str = Form(...),
    new_password: str = Form(...),
    confirm_password: str = Form(...),
):
    sess = _member_session(request)
    if not sess:
        return RedirectResponse("/api/member/login", status_code=303)
    if len(new_password) < 8:
        return RedirectResponse("/api/member/profile?err=รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร", status_code=303)
    if new_password != confirm_password:
        return RedirectResponse("/api/member/profile?err=รหัสผ่านใหม่ไม่ตรงกัน", status_code=303)
    assert _db is not None
    con = _db()
    row = con.execute("SELECT password_hash FROM members WHERE id=?", (sess["id"],)).fetchone()
    if not row or not _verify_password(current_password, _row_val(row, "password_hash")):
        con.close()
        return RedirectResponse("/api/member/profile?err=รหัสผ่านปัจจุบันไม่ถูกต้อง", status_code=303)
    _set_member_password(con, sess["id"], new_password)
    con.commit()
    con.close()
    return RedirectResponse("/api/member/profile?msg=password_changed", status_code=303)


@router.post("/member/files/{fid}/delete")
def member_file_delete(request: Request, fid: int):
    sess = _member_session(request)
    if not sess:
        return RedirectResponse("/api/member/login", status_code=303)
    row = _resolve_member_file(fid)
    if not row or row["member_id"] != sess["id"] or _file_source(row) != "member":
        raise HTTPException(404)
    _delete_member_file_row(row)
    return RedirectResponse("/api/member/profile?msg=deleted", status_code=303)


@router.get("/member/file/{fid}")
def member_file_download(request: Request, fid: int):
    sess = _member_session(request)
    if not sess:
        return RedirectResponse("/api/member/login", status_code=303)
    row = _resolve_member_file(fid)
    if not row or row["member_id"] != sess["id"]:
        raise HTTPException(404)
    rel = row["stored_path"].lstrip("/")
    target = (_upload_dir / rel).resolve()
    if not str(target).startswith(str(_upload_dir.resolve())) or not target.exists():
        raise HTTPException(404)
    return file_download_response(target, row["original_name"], inline=True)


# ── Admin: member registry ────────────────────────────────────────────────────

def _brandbar(title: str, subtitle: str, *, breadcrumb: tuple[tuple[str, str], ...] = (),
              actions: str = "") -> tuple[str, str]:
    """Return (shell_top, shell_bottom) for members pages — uses new admin shell if configured."""
    def _norm(crumbs):
        out = []
        for c in crumbs:
            if len(c) == 1:
                out.append(("#", c[0]))
            else:
                out.append((c[0], c[1]))
        return tuple(out)
    if _admin_shell is not None:
        user = ""
        try:
            if _current_user is not None:
                from fastapi import Request  # type: ignore
                user = _current_user() or "admin"
        except Exception:
            user = "admin"
        return _admin_shell(
            "members", title,
            breadcrumb=_norm(breadcrumb or (("/api/admin", "หน้าหลัก"), (title,))),
            desc=subtitle, actions=actions, user=user or "admin",
        )
    nav = _admin_nav("members") if _admin_nav else ""
    return (
        f'<div class="brandbar"><div class="l"><div class="logo">TSAE</div>'
        f'<div><h1>{_esc(title)}<small>{_esc(subtitle)}</small></h1></div></div>'
        f'<div style="display:flex;gap:10px">{nav}</div></div>',
        "</body></html>",
    )


def _submission_files_html(r: sqlite3.Row, e: Callable) -> str:
    try:
        files = (json.loads(r["extra"] or "{}").get("files") or [])
    except Exception:
        files = []
    if not files:
        return '<span class="muted">—</span>'
    items = []
    for i, f in enumerate(files):
        label = f.get("label") or "ไฟล์แนบ"
        name = f.get("original_name") or "download"
        items.append(
            f'<a class="dl" href="/api/admin/submissions/file/{r["id"]}/{i}" '
            f'onclick="event.stopPropagation()">{e(label)}: {e(name)}</a>'
        )
    return "<br>".join(items)


def _app_row_html(r: sqlite3.Row, e: Callable) -> str:
    msg = (r["message"] or "").strip()
    msg_short = (msg[:90] + "…") if len(msg) > 90 else (msg or "—")
    try:
        dt = datetime.fromisoformat(r["created_at"]).strftime("%d/%m/%Y %H:%M")
    except Exception:
        dt = e(r["created_at"])
    files_html = _submission_files_html(r, e)
    search = e(((r["name"] or "") + " " + (r["email"] or "") + " " + (r["organization"] or "") + " " + (r["subject"] or "") + " " + msg).lower())
    status = _submission_status(r)
    member_id = _submission_member_id(r)
    if status == "approved" and member_id:
        status_badge = f'<span class="badge nat">อนุมัติแล้ว</span>'
        approve_btn = (
            f'<a class="del-btn ok" href="/api/admin/members/edit/{member_id}">ดูสมาชิก</a>'
        )
    else:
        status_badge = '<span class="badge mb">รอตรวจ</span>'
        approve_btn = (
            f'<form method="post" action="/api/admin/submissions/{r["id"]}/approve" '
            f"onsubmit=\"return confirm('อนุมัติใบสมัคร #{r['id']} และสร้างสมาชิกใหม่?')\">"
            f'<button type="submit" class="del-btn ok">อนุมัติ</button></form>'
        )
    return (
        f'<tr class="main" data-search="{search}" onclick="tog({r["id"]})">'
        f'<td class="muted nw">#{r["id"]}</td>'
        f'<td class="date">{dt}</td>'
        f'<td class="name"><span class="nm">{e(r["name"]) or "—"}</span>'
        f'{status_badge}'
        f'<span class="sub expand">รายละเอียด ▾</span></td>'
        f'<td class="contact">{e(r["email"]) or "—"}<br><span class="sub">{e(r["phone"]) or ""}</span></td>'
        f'<td class="type">{e(r["subject"]) or "—"}</td>'
        f'<td class="msg">{e(msg_short)}</td>'
        f'<td class="files">{files_html or '<span class="muted">—</span>'}</td>'
        f'<td class="act" onclick="event.stopPropagation()"><div class="act-btns">'
        f'{approve_btn}'
        f'<form method="post" action="/api/admin/submissions/markspam/{r["id"]}">'
        f'<button type="submit" class="del-btn warn">สแปม</button></form>'
        f'<form method="post" action="/api/admin/submissions/delete/{r["id"]}" '
        f"onsubmit=\"return confirm('ลบรายการ #{r['id']} ถาวร?')\">"
        f'<button type="submit" class="del-btn">ลบ</button></form>'
        f'</div></td></tr>'
        f'<tr class="detail" id="d{r["id"]}" style="display:none"><td colspan="8"><div class="inner">'
        f'<div><span>ชื่อ</span>{e(r["name"]) or "—"}</div>'
        f'<div><span>อีเมล</span>{e(r["email"]) or "—"}</div>'
        f'<div><span>โทรศัพท์</span>{e(r["phone"]) or "—"}</div>'
        f'<div><span>หน่วยงาน</span>{e(r["organization"]) or "—"}</div>'
        f'<div><span>ประเภทสมาชิก</span>{e(r["subject"]) or "—"}</div>'
        f'<div><span>สถานะ</span>{status_badge}</div>'
        f'<div><span>IP</span>{e(r["ip"]) or "—"}</div>'
        f'<div style="grid-column:1/-1"><span>ไฟล์แนบ</span>{files_html}</div>'
        f'<div style="grid-column:1/-1"><span>ข้อความ</span>{e(msg) or "—"}</div>'
        f'</div></td></tr>'
    )


def _admin_members_page(
    rows: list,
    *,
    tab: str = "registry",
    app_rows: list | None = None,
    file_counts: dict | None = None,
    files_by_member: dict | None = None,
    q: str = "",
    msg: str = "",
    err: str = "",
    counts: dict | None = None,
) -> str:
    e = _esc
    assert e is not None
    counts = counts or {}
    file_counts = file_counts or {}
    files_by_member = files_by_member or {}
    tab = tab if tab in ("registry", "applications") else "registry"
    app_rows = app_rows or []

    banner = ""
    if msg:
        banner = f'<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">{e(msg.replace("+", " "))}</p>'
    if err:
        banner = f'<p style="background:#fef2f2;color:#b91c1c;padding:10px 14px;border-radius:10px;margin-bottom:14px">{e(err.replace("+", " "))}</p>'

    def seg(label: str, key: str) -> str:
        on = "on" if key == tab else ""
        return f'<a class="{on}" href="/api/admin/members?tab={key}">{label}</a>'

    apps_n = sum(1 for r in app_rows if _submission_status(r) == "pending")
    apps_label = f"ใบสมัครใหม่ ({apps_n})" if apps_n else "ใบสมัครใหม่"

    if tab == "applications":
        app_body = [_app_row_html(r, e) for r in app_rows]
        table_html = (
            "".join(app_body)
            if app_body
            else '<tr><td colspan="8"><div class="empty">ยังไม่มีใบสมัครสมาชิก</div></td></tr>'
        )
        toolbar_extra = (
            f'<a class="btn btn-gold" href="/api/admin/submissions/export.csv?kind=membership">'
            f'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
            f'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
            f'<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
            f' Export CSV</a>'
        )
        table_head = (
            "<thead><tr>"
            "<th>#</th><th>วันที่</th><th>ชื่อ</th>"
            "<th>อีเมล / โทร</th><th>ประเภทสมาชิก</th><th>ข้อความ</th><th>ไฟล์</th><th>จัดการ</th>"
            "</tr></thead>"
        )
    else:
        body = []
        for r in rows:
            active_badge = '<span class="badge nat">อยู่</span>' if r["active"] else '<span class="badge sp">สิ้นสภาพ</span>'
            email_cell = e(r["email"]) or '<span class="muted">—</span>'
            fc = file_counts.get(r["id"], {})
            file_badge = ""
            if fc.get("total"):
                pay = fc.get("payment", 0)
                doc = fc.get("document", 0)
                assoc = fc.get("association", 0)
                file_badge = (
                    f'<span class="badge mb" title="ชำระ {pay} · เอกสาร {doc} · สมาคม {assoc}">'
                    f'📎 {fc["total"]}</span>'
                )
            else:
                file_badge = '<span class="muted">—</span>'
            member_files = files_by_member.get(r["id"], [])
            files_detail = _files_html(member_files, admin=True)
            send_btn = ""
            if r["email"]:
                send_btn = (
                    f'<form method="post" action="/api/admin/members/{r["id"]}/email">'
                    f'<input type="hidden" name="template" value="invite">'
                    f'<button type="submit" class="del-btn ok">ส่งอีเมล</button></form>'
                )
            body.append(
                f'<tr class="main" data-search="{e(((r["code"] or "")+" "+(r["name"] or "")+" "+(r["email"] or "")).lower())}" onclick="togM({r["id"]})">'
                f'<td class="code">{e(r["code"])}</td>'
                f'<td class="name"><span class="nm">{e(r["name"])}</span>'
                f'<span class="sub expand">รายละเอียด ▾</span></td>'
                f'<td class="type">{e(r["type"])}</td>'
                f'<td class="status">{active_badge}<br><span class="sub">{e(r["expiry"])}</span></td>'
                f'<td class="contact">{email_cell}<br><span class="sub">{e(r["phone"])}</span></td>'
                f'<td class="files">{file_badge}</td>'
                f'<td class="act" onclick="event.stopPropagation()"><div class="act-btns">'
                f'<a class="dl" href="/api/admin/members/edit/{r["id"]}">แก้ไข</a>'
                f'{send_btn}'
                f'</div></td></tr>'
                f'<tr class="detail" id="dm{r["id"]}" style="display:none"><td colspan="7"><div class="inner">'
                f'<div><span>รหัส</span>{e(r["code"])}</div>'
                f'<div><span>ประเภท</span>{e(r["type"])}</div>'
                f'<div><span>สถานะ</span>{"สมาชิกอยู่" if r["active"] else "สิ้นสภาพแล้ว"}</div>'
                f'<div><span>อีเมล</span>{e(r["email"]) or "—"}</div>'
                f'<div><span>โทรศัพท์</span>{e(r["phone"]) or "—"}</div>'
                f'<div><span>วันสิ้นสภาพ</span>{e(r["expiry"]) or "—"}</div>'
                f'<div style="grid-column:1/-1"><span>ที่อยู่ติดต่อ</span>{e(r["contact"]) or "—"}</div>'
                f'<div style="grid-column:1/-1"><span>ไฟล์แนบ</span>{files_detail}</div>'
                f'</div></td></tr>'
            )
        table_html = (
            "\n".join(body)
            if body
            else '<tr><td colspan="7"><div class="empty">ไม่พบข้อมูล</div></td></tr>'
        )
        toolbar_extra = (
            f'<a class="btn btn-gold" href="/api/admin/members/export.csv">'
            f'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
            f'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
            f'<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
            f' Export CSV</a>'
            f'<form method="post" action="/api/admin/members/import" style="display:inline">'
            f'<button type="submit" class="btn btn-line">นำเข้า JSON</button></form>'
            f'<a class="btn btn-line" href="{SITE_URL}/th/about/members/" target="_blank">ดูหน้าเว็บ</a>'
        )
        table_head = (
            "<thead><tr>"
            "<th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ประเภท</th>"
            "<th>สถานะ</th><th>ติดต่อ</th><th>ไฟล์</th><th>จัดการ</th>"
            "</tr></thead>"
        )

    shell_top, shell_bottom = _brandbar(
        "สมาชิก TSAE", "ทะเบียนสมาชิก · ใบสมัครใหม่",
        breadcrumb=(("/api/admin", "หน้าหลัก"), ("สมาชิก",)),
        actions=toolbar_extra,
    )
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSAE Admin · สมาชิก</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{_page_css}
.badge.sp{{background:#fdecea;color:#c0392b}}
.badge.mb{{background:#fdf3e0;color:#b08d2e}}
</style>
<script>
function tog(id){{var d=document.getElementById('d'+id);if(d)d.style.display=d.style.display==='none'?'table-row':'none';}}
function togM(id){{var d=document.getElementById('dm'+id);if(d)d.style.display=d.style.display==='none'?'table-row':'none';}}
function flt(){{var q=(document.getElementById('mq').value||'').toLowerCase();
  document.querySelectorAll('#tb tr.main').forEach(function(tr){{
    tr.style.display=!q||(tr.dataset.search||'').includes(q)?'table-row':'none';
  }});}}
</script></head><body>
{shell_top}
  {banner}
  <div class="stats">
    <div class="stat green"><div class="top"><span class="k">ทะเบียนทั้งหมด</span><span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z"/></svg></span></div><div class="v">{counts.get('total', 0)}</div><div class="trend flat">สมาชิกทั้งหมด</div></div>
    <div class="stat blue"><div class="top"><span class="k">สมาชิกอยู่</span><span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></span></div><div class="v">{counts.get('active', 0)}</div><div class="trend flat">ยังไม่สิ้นสภาพ</div></div>
    <div class="stat gold"><div class="top"><span class="k">ใบสมัครใหม่</span><span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg></span></div><div class="v">{counts.get('applications', 0)}</div><div class="trend flat">รอตรวจ · อนุมัติแล้ว</div></div>
    <div class="stat blue"><div class="top"><span class="k">มีอีเมล</span><span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></span></div><div class="v">{counts.get('email', 0)}</div><div class="trend flat">ใช้เข้าสู่ระบบได้</div></div>
    <div class="stat blue"><div class="top"><span class="k">มีไฟล์แนบ</span><span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 100 2.828l7.414-7.414a4 4 0 00-5.656-5.656l-7.414 7.414a6 6 0 108.485 8.485"/></svg></span></div><div class="v">{counts.get('with_files', 0)}</div><div class="trend flat">เอกสารแนบ</div></div>
  </div>
  <div class="toolbar">
    <div class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="mq" placeholder="ค้นหา รหัส / ชื่อ / อีเมล…" oninput="flt()" value="{e(q)}">
    </div>
    <div class="seg">
      {seg('ทะเบียนสมาชิก', 'registry')}
      {seg(apps_label, 'applications')}
    </div>
  </div>
  <div class="tablecard"><div class="table-wrap"><table>
    {table_head}
    <tbody id="tb">{table_html}</tbody>
  </table></div></div>
{shell_bottom}"""


@router.get("/admin/members", response_class=HTMLResponse)
def admin_members_list(request: Request, tab: str = "registry", q: str = "", msg: str = "", err: str = ""):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login?next=/api/admin/members", status_code=303)
    assert _db is not None
    tab = tab if tab in ("registry", "applications") else "registry"
    con = _db()
    app_rows = con.execute(
        "SELECT * FROM submissions WHERE kind='membership' AND is_spam=0 ORDER BY id DESC"
    ).fetchall()
    if tab == "applications":
        rows = []
    elif q and len(q.strip()) >= 2:
        ql = f"%{q.strip().lower()}%"
        rows = con.execute(
            """SELECT * FROM members WHERE LOWER(code) LIKE ? OR LOWER(name) LIKE ? OR LOWER(email) LIKE ?
               ORDER BY code""",
            (ql, ql, ql),
        ).fetchall()
    else:
        rows = con.execute("SELECT * FROM members").fetchall()
    # Sort by type group then numeric code (สช. before ส.; ignore spaces in code)
    def _member_sort_key(r: sqlite3.Row) -> tuple:
        code = _normalize_member_code(r["code"] or "")
        if code.startswith("ก."):
            group = 0
        elif code.startswith("น."):
            group = 1
        elif code.startswith("สช."):
            group = 2
        elif code.startswith("ส."):
            group = 3
        elif code.startswith("ภ."):
            group = 4
        else:
            group = 9
        try:
            num = int(_code_digits(code))
        except ValueError:
            num = 0
        return (group, num, code)

    rows = sorted(rows, key=_member_sort_key)
    counts = {
        "total": con.execute("SELECT COUNT(*) c FROM members").fetchone()["c"],
        "active": con.execute("SELECT COUNT(*) c FROM members WHERE active=1").fetchone()["c"],
        "email": con.execute("SELECT COUNT(*) c FROM members WHERE email!=''").fetchone()["c"],
        "no_email": con.execute("SELECT COUNT(*) c FROM members WHERE email='' OR email IS NULL").fetchone()["c"],
        "applications": sum(1 for r in app_rows if _submission_status(r) == "pending"),
        "with_files": con.execute(
            "SELECT COUNT(DISTINCT member_id) c FROM member_files"
        ).fetchone()["c"],
    }
    file_counts = _file_counts_by_member()
    files_by_member = _group_all_member_files() if tab == "registry" else {}
    con.close()
    return HTMLResponse(_admin_members_page(
        rows, tab=tab, app_rows=app_rows, file_counts=file_counts,
        files_by_member=files_by_member, q=q, msg=msg, err=err, counts=counts,
    ))


@router.post("/admin/submissions/{sid}/approve")
def admin_approve_membership(request: Request, sid: int):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    assert _db is not None
    con = _db()
    try:
        member_id, detail = _approve_membership_submission(con, sid)
        con.commit()
        con.close()
        return RedirectResponse(
            f"/api/admin/members/edit/{member_id}?msg=approved+{detail.replace(' ', '+')}",
            status_code=303,
        )
    except ValueError as exc:
        con.rollback()
        con.close()
        err = str(exc).replace(" ", "+")
        return RedirectResponse(f"/api/admin/members?tab=applications&err={err}", status_code=303)
    except Exception as exc:
        con.rollback()
        con.close()
        err = str(exc)[:120].replace(" ", "+")
        return RedirectResponse(f"/api/admin/members?tab=applications&err={err}", status_code=303)


@router.get("/admin/members/edit/{mid}", response_class=HTMLResponse)
def admin_member_edit(request: Request, mid: int, msg: str = "", err: str = ""):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    assert _db is not None
    con = _db()
    row = con.execute("SELECT * FROM members WHERE id=?", (mid,)).fetchone()
    con.close()
    if not row:
        raise HTTPException(404)
    files = _list_member_files(mid)
    e = _esc
    assert e is not None
    banner = f'<p class="ferr">{e(err)}</p>' if err else ""
    if msg == "saved":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">บันทึกข้อมูลสำเร็จ</p>'
    elif msg == "uploaded":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">อัปโหลดไฟล์สำเร็จ</p>'
    elif msg == "deleted":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">ลบไฟล์แล้ว</p>'
    elif msg.replace("+", " ") == "email sent":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">ส่งอีเมลสำเร็จ</p>'
    elif msg.replace("+", " ") == "password reset":
        banner = '<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">รีเซ็ตรหัสผ่านและส่งอีเมลแล้ว</p>'
    elif msg.startswith("approved"):
        code = msg.replace("approved+", "").replace("+", " ")
        banner = f'<p style="background:#ecfdf3;color:#166534;padding:10px 14px;border-radius:10px;margin-bottom:14px">อนุมัติใบสมัครและสร้างสมาชิก {e(code)} แล้ว · ส่งอีเมลเชิญเข้าระบบแล้ว (ถ้ามีอีเมล)</p>'
    files_panel = _admin_files_panel(mid, files)
    email_panel = _admin_email_panel(mid, row["email"] or "")
    pwd_status = "ตั้งรหัสผ่านแล้ว" if _row_val(row, "password_hash") else "ยังไม่มีรหัสผ่าน"
    shell_top, shell_bottom = _brandbar(
        "แก้ไขสมาชิก",
        e(row['code']),
        breadcrumb=(("/api/admin", "หน้าหลัก"), ("/api/admin/members", "สมาชิก"), (e(row['code']),)),
        actions='<a class="btn btn-line" href="/api/admin/members">กลับ</a>',
    )
    return HTMLResponse(f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>แก้ไขสมาชิก · {e(row['code'])}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{_page_css}
.badge.mb{{background:#fdf3e0;color:#b08d2e}}
.filelist li:last-child{{border-bottom:0!important}}
</style></head><body>
{shell_top}
<div class="formwrap">{banner}<div class="fcard">
  <p class="sub" style="margin:0 0 16px">เข้าสู่ระบบ: เลขสมาชิก (ตัวเลข) หรืออีเมล + รหัสผ่าน · สถานะ: <strong>{e(pwd_status)}</strong></p>
  <form method="post" action="/api/admin/members/edit/{mid}">
    <div class="fgrid">
      <div class="fld"><label>รหัสสมาชิก</label><input name="code" value="{e(_normalize_member_code(row['code'] or ''))}" required></div>
      <div class="fld"><label>ประเภท</label>
        <select name="type" required>
          {''.join(
            f'<option value="{e(t)}"{" selected" if (row["type"] or "") == t else ""}>{e(t)}</option>'
            for t in list(dict.fromkeys([
                "กิตติมศักดิ์", "นิติบุคคล", "สามัญตลอดชีพ", "สามัญ 1 ปี", "ภาคี",
                row["type"] or "",
            ])) if t
          )}
        </select>
      </div>
      <div class="fld full"><label>ชื่อ-นามสกุล</label><input name="name" value="{e(row['name'])}" required></div>
      <div class="fld"><label>อีเมล</label><input name="email" type="email" value="{e(row['email'])}"></div>
      <div class="fld"><label>โทรศัพท์</label><input name="phone" value="{e(row['phone'])}"></div>
      <div class="fld full"><label>ที่อยู่ติดต่อ</label><input name="contact" value="{e(row['contact'])}"></div>
      <div class="fld"><label>วันสิ้นสภาพ</label><input name="expiry" value="{e(row['expiry'])}"></div>
      <div class="fld"><label>สถานะ</label>
        <select name="active">
          <option value="1" {'selected' if row['active'] else ''}>สมาชิกอยู่</option>
          <option value="0" {'selected' if not row['active'] else ''}>สิ้นสภาพแล้ว</option>
        </select></div>
      <div class="fld full"><label>หมายเหตุ (admin)</label><input name="notes" value="{e(row['notes'])}"></div>
    </div>
    <div class="factions">
      <button type="submit" class="btn btn-save">บันทึก</button>
      <a class="btn btn-line" href="/api/admin/members">กลับ</a>
    </div>
  </form>
  {files_panel}
  {email_panel}
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e7ede9">
    <form method="post" action="/api/admin/members/{mid}/reset-password" onsubmit="return confirm('รีเซ็ตรหัสผ่านและส่งอีเมลไปที่สมาชิก?')">
      <button type="submit" class="btn btn-line">รีเซ็ตรหัสผ่านและส่งอีเมล</button>
    </form>
  </div>
</div></div>
{shell_bottom}""")


@router.post("/admin/members/edit/{mid}")
def admin_member_save(
    request: Request,
    mid: int,
    code: str = Form(...),
    type: str = Form(...),
    name: str = Form(...),
    email: str = Form(""),
    phone: str = Form(""),
    contact: str = Form(""),
    expiry: str = Form(""),
    active: str = Form("1"),
    notes: str = Form(""),
):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    assert _db is not None
    con = _db()
    con.execute(
        """UPDATE members SET code=?, type=?, name=?, email=?, phone=?, contact=?,
           expiry=?, active=?, notes=?, updated_at=? WHERE id=?""",
        (
            _normalize_member_code(code), type.strip(), name.strip(), email.strip().lower(),
            phone.strip(), contact.strip(), expiry.strip(),
            1 if active == "1" else 0, notes.strip(), _now(), mid,
        ),
    )
    con.commit()
    con.close()
    return RedirectResponse(f"/api/admin/members/edit/{mid}?msg=saved", status_code=303)


@router.post("/admin/members/{mid}/files/upload")
async def admin_member_file_upload(
    request: Request,
    mid: int,
    category: str = Form("association"),
    note: str = Form(""),
    file: UploadFile = File(...),
):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    assert _db is not None
    con = _db()
    row = con.execute("SELECT id FROM members WHERE id=?", (mid,)).fetchone()
    con.close()
    if not row:
        raise HTTPException(404)
    err = await _save_member_file(
        mid, category, file, uploaded_by="admin", note=note,
    )
    if err:
        return RedirectResponse(f"/api/admin/members/edit/{mid}?err={err}", status_code=303)
    return RedirectResponse(f"/api/admin/members/edit/{mid}?msg=uploaded", status_code=303)


@router.post("/admin/members/files/{fid}/delete")
def admin_member_file_delete(request: Request, fid: int):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    row = _resolve_member_file(fid)
    if not row:
        raise HTTPException(404)
    mid = row["member_id"]
    _delete_member_file_row(row)
    return RedirectResponse(f"/api/admin/members/edit/{mid}?msg=deleted", status_code=303)


@router.post("/admin/members/import")
def admin_members_import(request: Request):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    n = import_members_json(replace=False)
    return RedirectResponse(f"/api/admin/members?msg=imported+{n}+records", status_code=303)


@router.post("/admin/members/{mid}/email")
def admin_send_member_email(
    request: Request,
    mid: int,
    template: str = Form("invite"),
    subject: str = Form(""),
    body: str = Form(""),
):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    assert _db is not None
    con = _db()
    row = con.execute("SELECT * FROM members WHERE id=?", (mid,)).fetchone()
    if not row or not row["email"]:
        con.close()
        return RedirectResponse("/api/admin/members?err=no+email", status_code=303)

    tpl = template if template in EMAIL_TEMPLATES else "invite"
    password = ""
    if tpl == "invite" or not _row_val(row, "password_hash"):
        password = _issue_member_password(con, mid)
        con.commit()

    login_url = f"{SITE_URL}/api/member/login"
    subj, html, plain = render_member_email(
        tpl,
        name=row["name"],
        code=row["code"],
        email=row["email"],
        login_url=login_url,
        site_url=SITE_URL,
        custom_body=body,
        custom_subject=subject,
        password=password,
    )

    ok, detail = _send_email(row["email"], subj, html, plain)
    con.close()
    if ok:
        return RedirectResponse(f"/api/admin/members/edit/{mid}?msg=email+sent", status_code=303)
    return RedirectResponse(f"/api/admin/members/edit/{mid}?err={detail}", status_code=303)


@router.post("/admin/members/{mid}/reset-password")
def admin_reset_member_password(request: Request, mid: int):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    assert _db is not None
    con = _db()
    row = con.execute("SELECT * FROM members WHERE id=?", (mid,)).fetchone()
    if not row or not row["email"]:
        con.close()
        return RedirectResponse(f"/api/admin/members/edit/{mid}?err=no+email", status_code=303)

    password = _issue_member_password(con, mid)
    con.commit()
    con.close()

    login_url = f"{SITE_URL}/api/member/login"
    subj, html, plain = render_password_reset_email(
        name=row["name"],
        code=row["code"],
        email=row["email"],
        password=password,
        login_url=login_url,
        site_url=SITE_URL,
    )
    ok, detail = _send_email(row["email"], subj, html, plain)
    if ok:
        return RedirectResponse(f"/api/admin/members/edit/{mid}?msg=password+reset", status_code=303)
    return RedirectResponse(f"/api/admin/members/edit/{mid}?err={detail}", status_code=303)


@router.get("/admin/members/file/{fid}")
def admin_member_file_download(request: Request, fid: int):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    row = _resolve_member_file(fid)
    if not row:
        raise HTTPException(404)
    rel = row["stored_path"].lstrip("/")
    target = (_upload_dir / rel).resolve()
    if not str(target).startswith(str(_upload_dir.resolve())) or not target.exists():
        raise HTTPException(404)
    return file_download_response(target, row["original_name"], inline=True)


@router.get("/admin/members/export.csv")
def admin_members_export(request: Request):
    if not _current_admin or not _current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    assert _db is not None
    import csv
    import io

    con = _db()
    rows = con.execute("SELECT * FROM members ORDER BY code").fetchall()
    con.close()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["code", "type", "name", "email", "phone", "contact", "expiry", "active", "updated_at"])
    for r in rows:
        w.writerow([r["code"], r["type"], r["name"], r["email"], r["phone"], r["contact"], r["expiry"], r["active"], r["updated_at"]])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tsae-members.csv"},
    )
