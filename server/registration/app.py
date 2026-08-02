"""TSAE conference registration backend.

Receives non-presenting participant registrations for the national and
international 2026 conferences, stores them in SQLite, and saves the
uploaded proof-of-payment file to disk. Includes a cookie-session admin
dashboard for listing / downloading submissions and exporting CSV.

Front-end (Astro static) posts multipart/form-data to /register.
nginx reverse-proxies https://www.tsae.asia/api/ -> this app, so all admin
links/redirects are prefixed with /api/.
"""

from __future__ import annotations

import csv
import io
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "registrations.db"

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "change-me")
SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)

MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(45 * 1024 * 1024)))  # 45 MB
ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic"}
ALLOWED_CONF = {"national": "TSAE 2026 National", "intl": "TSAE 2026 International"}
SUBMISSION_KINDS = {
    "training": "แจ้งความสนใจฝึกอบรม",
    "membership": "สมัครสมาชิก",
    "contact": "ข้อความติดต่อ",
}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# --------------------------------------------------------------------------- #
# spam protection
# --------------------------------------------------------------------------- #
_RATE_LIMIT: dict[str, list[float]] = defaultdict(list)   # ip -> [timestamps]
RATE_WINDOW  = int(os.getenv("RATE_WINDOW",  "3600"))   # seconds
RATE_MAX     = int(os.getenv("RATE_MAX",     "5"))       # max submissions per window
MIN_FORM_SEC = float(os.getenv("MIN_FORM_SEC", "4"))    # min seconds to fill form

_SPAM_URLS      = re.compile(r'https?://', re.I)
_SPAM_CYRILLIC  = re.compile(r'[\u0400-\u04FF\u0500-\u052F]')  # Cyrillic (+ supplement)
_SPAM_ARABIC    = re.compile(r'[\u0600-\u06FF]')
_SPAM_CJK       = re.compile(r'[\u4E00-\u9FFF\u3040-\u30FF]')
_SPAM_GREEK     = re.compile(r'[\u0370-\u03FF]')
_SPAM_KEYWORDS  = re.compile(
    r'\b(casino|poker|loan|credit|viagra|cialis|bitcoin|crypto|forex|seo|'
    r'backlink|essay|dissertation|assignment|weight\s*loss|make\s*money|'
    r'click\s*here|free\s*gift|winner|congratulation|prize|bonus|'
    r'price|pricing|pricelist|cost\s*list)\b', re.I)
_SPAM_PRICE_CY  = re.compile(r'(прайс|цен[аы]|стоимость|сколько\s*стоит|предложени)', re.I)
_SPAM_PATTERNS  = re.compile(r'\[url=|\[/url\]|<a\s+href|\$\$|\[b\]', re.I)
_SPAM_GIB_NAME  = re.compile(r'^[A-Z][a-z]{3,}[A-Z][a-z]{2,}\d*$')  # RobertEmefs
_DISPOSABLE_MAIL = re.compile(
    r'@(mailinator|guerrillamail|tempmail|yopmail|10minutemail|discard|'
    r'getnada|sharklasers|grr\.la)\.', re.I)


def _is_spam_content(text: str) -> tuple[bool, str]:
    """Return (is_spam, reason). Checks message/name for spam signals."""
    if not text or not text.strip():
        return False, ""
    url_count = len(_SPAM_URLS.findall(text))
    if url_count >= 2:
        return True, f"multiple_urls({url_count})"
    if _SPAM_CYRILLIC.search(text):
        return True, "cyrillic_text"
    if _SPAM_ARABIC.search(text):
        return True, "arabic_text"
    if _SPAM_CJK.search(text):
        return True, "cjk_text"
    if _SPAM_GREEK.search(text):
        return True, "greek_text"
    if _SPAM_PRICE_CY.search(text):
        return True, "cyrillic_price_inquiry"
    if _SPAM_PATTERNS.search(text):
        return True, "bbcode_or_html"
    kw = _SPAM_KEYWORDS.findall(text)
    if len(kw) >= 2:
        return True, f"spam_keywords({','.join(kw[:3])})"
    if len(kw) == 1 and _SPAM_CYRILLIC.search(text):
        return True, f"spam_keywords({kw[0]})"
    return False, ""


def _is_spam_identity(*, name: str, email: str, organization: str = "") -> tuple[bool, str]:
    name = (name or "").strip()
    org = (organization or "").strip()
    email = (email or "").strip()
    if _SPAM_GIB_NAME.match(name):
        return True, "gibberish_name"
    if org and name and org.lower() == name.lower() and " " not in name:
        return True, "org_equals_name"
    if _DISPOSABLE_MAIL.search(email):
        return True, "disposable_email"
    # Long digit-only phone-like strings in name field
    if re.fullmatch(r'\d{10,}', name):
        return True, "numeric_name"
    return False, ""


def _spam_signals(*, name: str, email: str, message: str, organization: str = "") -> str:
    combined = f"{name} {email} {message} {organization}"
    spam, reason = _is_spam_content(combined)
    if spam:
        return reason
    spam, reason = _is_spam_identity(name=name, email=email, organization=organization)
    if spam:
        return reason
    return ""


def _rescan_spam_db() -> int:
    """Re-classify existing submissions; returns count newly marked spam."""
    con = db()
    rows = con.execute(
        "SELECT id, name, email, message, organization FROM submissions WHERE is_spam=0"
    ).fetchall()
    marked = 0
    for r in rows:
        reason = _spam_signals(
            name=r["name"] or "",
            email=r["email"] or "",
            message=r["message"] or "",
            organization=r["organization"] or "",
        )
        if reason:
            con.execute(
                "UPDATE submissions SET is_spam=1, spam_reason=? WHERE id=?",
                (reason, r["id"]),
            )
            marked += 1
    con.commit()
    con.close()
    return marked


def _check_rate_limit(ip: str) -> bool:
    """Return True if IP is within allowed rate, False if over limit."""
    now = time.time()
    hits = [t for t in _RATE_LIMIT[ip] if now - t < RATE_WINDOW]
    if len(hits) >= RATE_MAX:
        return False
    hits.append(now)
    _RATE_LIMIT[ip] = hits
    return True


def _spam_reason(*, company_url: str, form_token: str, name: str,
                 email: str, message: str, organization: str = "") -> str:
    """Return non-empty reason string if spam detected, else empty string."""
    if company_url.strip():
        return "honeypot"
    try:
        elapsed = time.time() - float(form_token)
        if elapsed < MIN_FORM_SEC:
            return f"too_fast({elapsed:.1f}s)"
    except (ValueError, TypeError):
        return "invalid_token"
    return _spam_signals(name=name, email=email, message=message, organization=organization)

COOKIE_NAME = "tsae_admin"
SESSION_MAX_AGE = 60 * 60 * 8  # 8 hours
_signer = URLSafeTimedSerializer(SECRET_KEY, salt="tsae-admin-session")

app = FastAPI(title="TSAE Registration", docs_url=None, redoc_url=None)


# --------------------------------------------------------------------------- #
# storage helpers
# --------------------------------------------------------------------------- #
def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS registrations (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at   TEXT NOT NULL,
            conf         TEXT NOT NULL,
            name         TEXT NOT NULL,
            surname      TEXT NOT NULL,
            email        TEXT NOT NULL,
            phone        TEXT NOT NULL,
            organization TEXT,
            job_title    TEXT,
            street       TEXT,
            apartment    TEXT,
            city         TEXT,
            state        TEXT,
            zip          TEXT,
            country      TEXT,
            file_name    TEXT,
            ip           TEXT
        )
        """
    )
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS submissions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at   TEXT NOT NULL,
            kind         TEXT NOT NULL,
            name         TEXT,
            email        TEXT,
            phone        TEXT,
            organization TEXT,
            subject      TEXT,
            message      TEXT,
            extra        TEXT,
            ip           TEXT,
            is_spam      INTEGER NOT NULL DEFAULT 0,
            spam_reason  TEXT
        )
        """
    )
    # migrate existing DB: add columns if absent
    for col, definition in [
        ("is_spam",     "INTEGER NOT NULL DEFAULT 0"),
        ("spam_reason", "TEXT"),
        ("status",      "TEXT NOT NULL DEFAULT 'pending'"),
        ("approved_member_id", "INTEGER"),
    ]:
        try:
            con.execute(f"ALTER TABLE submissions ADD COLUMN {col} {definition}")
        except sqlite3.OperationalError:
            pass
    con.commit()
    con.close()

    from members import init_members_table
    con2 = sqlite3.connect(DB_PATH)
    init_members_table(con2)
    con2.commit()
    con2.close()


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


@app.on_event("startup")
def _startup() -> None:
    init_db()
    n = _rescan_spam_db()
    if n:
        print(f"[spam] reclassified {n} submission(s) as spam")
    from members import maybe_auto_import
    imported = maybe_auto_import()
    if imported:
        print(f"[members] imported {imported} member(s) from JSON")


# --------------------------------------------------------------------------- #
# public: registration
# --------------------------------------------------------------------------- #
@app.post("/register")
async def register(
    request: Request,
    conf: str = Form(...),
    name: str = Form(...),
    surname: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    organization: str = Form(""),
    job_title: str = Form(""),
    street: str = Form(""),
    apartment: str = Form(""),
    city: str = Form(""),
    state: str = Form(""),
    zip: str = Form(""),
    country: str = Form(""),
    consent: str = Form(""),
    # honeypot — real users never fill this hidden field
    company_url: str = Form(""),
    form_token: str = Form(""),
    file: UploadFile | None = File(None),
):
    if company_url.strip():
        # silently accept to not tip off bots
        return JSONResponse({"ok": True})
    try:
        elapsed = time.time() - float(form_token)
        if elapsed < MIN_FORM_SEC:
            return JSONResponse({"ok": True})  # silently drop too-fast bots
    except (ValueError, TypeError):
        pass  # token missing/invalid – allow through (legacy clients)

    ip = request.client.host if request.client else ""
    if not _check_rate_limit(ip):
        return JSONResponse({"ok": True})

    conf = conf.strip().lower()
    if conf not in ALLOWED_CONF:
        raise HTTPException(status_code=400, detail="invalid conference")

    name, surname = name.strip(), surname.strip()
    email, phone = email.strip(), phone.strip()
    if not (name and surname and email and phone):
        raise HTTPException(status_code=400, detail="missing required fields")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="invalid email")
    if consent.strip().lower() not in {"1", "true", "on", "yes"}:
        raise HTTPException(status_code=400, detail="consent required")

    saved_name: str | None = None
    if file is not None and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail="file type not allowed")
        blob = await file.read()
        if len(blob) > MAX_FILE_BYTES:
            mb = MAX_FILE_BYTES // (1024 * 1024)
            raise HTTPException(status_code=413, detail=f"file too large (max {mb}MB)")
        conf_dir = UPLOAD_DIR / conf
        conf_dir.mkdir(parents=True, exist_ok=True)
        saved_name = f"{conf}/{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:10]}{ext}"
        (UPLOAD_DIR / saved_name).write_bytes(blob)

    con = db()
    con.execute(
        """INSERT INTO registrations
           (created_at, conf, name, surname, email, phone, organization, job_title,
            street, apartment, city, state, zip, country, file_name, ip)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
            conf, name, surname, email, phone, organization.strip(), job_title.strip(),
            street.strip(), apartment.strip(), city.strip(), state.strip(),
            zip.strip(), country.strip(), saved_name,
            (request.client.host if request.client else ""),
        ),
    )
    con.commit()
    con.close()
    return JSONResponse({"ok": True})


def _save_submission(
    request: Request,
    kind: str,
    *,
    name: str,
    email: str,
    phone: str = "",
    organization: str = "",
    subject: str = "",
    message: str = "",
    extra: dict | None = None,
    is_spam: int = 0,
    spam_reason: str = "",
) -> int:
    con = db()
    cur = con.execute(
        """INSERT INTO submissions
           (created_at, kind, name, email, phone, organization, subject, message, extra, ip, is_spam, spam_reason)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
            kind, name.strip(), email.strip(), phone.strip(), organization.strip(),
            subject.strip(), message.strip(),
            json.dumps(extra, ensure_ascii=False) if extra else "",
            (request.client.host if request.client else ""),
            is_spam, spam_reason,
        ),
    )
    sid = cur.lastrowid or 0
    con.commit()
    con.close()
    return sid


async def _save_submission_upload(
    file: UploadFile | None,
    *,
    kind: str,
    label: str,
) -> dict | None:
    if file is None or not file.filename:
        return None
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT and ext not in {".doc", ".docx"}:
        raise HTTPException(status_code=400, detail=f"{label}: file type not allowed")
    blob = await file.read()
    if len(blob) > MAX_FILE_BYTES:
        mb = MAX_FILE_BYTES // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"{label}: file too large (max {mb}MB)")
    safe_kind = re.sub(r"[^a-z0-9_-]+", "-", kind.lower()).strip("-") or "submission"
    dest_dir = UPLOAD_DIR / "submissions" / safe_kind
    dest_dir.mkdir(parents=True, exist_ok=True)
    stored = f"submissions/{safe_kind}/{datetime.now():%Y%m%d}-{uuid.uuid4().hex[:10]}{ext}"
    (UPLOAD_DIR / stored).write_bytes(blob)
    return {
        "label": label,
        "original_name": file.filename,
        "stored_path": stored,
        "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


@app.post("/submit/training")
async def submit_training(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    course: str = Form(""),
    message: str = Form(""),
    company_url: str = Form(""),
    form_token: str = Form(""),
):
    if not name.strip() or not EMAIL_RE.match(email.strip()):
        raise HTTPException(status_code=400, detail="missing or invalid fields")
    ip = request.client.host if request.client else ""
    if not _check_rate_limit(ip):
        return JSONResponse({"ok": True})  # silently accept to not tip off bots
    reason = _spam_reason(
        company_url=company_url, form_token=form_token,
        name=name, email=email, message=message,
    )
    _save_submission(
        request, "training", name=name, email=email, subject=course, message=message,
        is_spam=1 if reason else 0, spam_reason=reason,
    )
    return JSONResponse({"ok": True})


@app.post("/submit/membership")
async def submit_membership(
    request: Request,
    firstName: str = Form(...),
    lastName: str = Form(...),
    email: str = Form(...),
    prefix: str = Form(""),
    membershipType: str = Form(""),
    phone: str = Form(""),
    organization: str = Form(""),
    message: str = Form(""),
    company_url: str = Form(""),
    form_token: str = Form(""),
    application_file: UploadFile | None = File(None),
    payment_file: UploadFile | None = File(None),
):
    if not prefix.strip():
        raise HTTPException(status_code=400, detail="prefix required")
    if not membershipType.strip():
        raise HTTPException(status_code=400, detail="membership type required")
    if not (firstName.strip() and lastName.strip()) or not EMAIL_RE.match(email.strip()):
        raise HTTPException(status_code=400, detail="missing or invalid fields")
    if not phone.strip():
        raise HTTPException(status_code=400, detail="phone required")
    if not organization.strip():
        raise HTTPException(status_code=400, detail="organization required")
    if payment_file is None or not (payment_file.filename or "").strip():
        raise HTTPException(status_code=400, detail="payment slip required")
    ip = request.client.host if request.client else ""
    if not _check_rate_limit(ip):
        return JSONResponse({"ok": True})
    full = " ".join(p for p in [prefix.strip(), firstName.strip(), lastName.strip()] if p)
    reason = _spam_reason(
        company_url=company_url, form_token=form_token,
        name=full, email=email, message=message, organization=organization,
    )
    files = []
    # Paper application optional (online form is the application); payment slip required
    for saved in [
        await _save_submission_upload(application_file, kind="membership", label="ใบสมัครสมาชิก"),
        await _save_submission_upload(payment_file, kind="membership", label="หลักฐานการชำระเงิน"),
    ]:
        if saved:
            files.append(saved)
    # Map slug → Thai label for admin readability
    try:
        from members import _map_membership_subject
        _, type_label, _ = _map_membership_subject(membershipType)
        subject_label = type_label
    except Exception:
        subject_label = membershipType.strip()
    sid = _save_submission(
        request, "membership", name=full, email=email, phone=phone,
        organization=organization, subject=subject_label, message=message,
        extra={"prefix": prefix.strip(), "firstName": firstName.strip(),
               "lastName": lastName.strip(), "membershipType": membershipType.strip(),
               "files": files},
        is_spam=1 if reason else 0, spam_reason=reason,
    )
    if not reason and sid:
        try:
            from members import notify_membership_application
            notify_membership_application(
                submission_id=sid,
                name=full,
                email=email.strip(),
                phone=phone.strip(),
                organization=organization.strip(),
                membership_type=subject_label,
                message=message.strip(),
            )
        except Exception as exc:
            print(f"[membership] notify failed: {exc}")
    return JSONResponse({"ok": True})


@app.post("/submit/contact")
async def submit_contact(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(""),
    organization: str = Form(""),
    topic: str = Form(""),
    message: str = Form(...),
    consent: str = Form(""),
    company_url: str = Form(""),
    form_token: str = Form(""),
):
    if not name.strip() or not EMAIL_RE.match(email.strip()) or not message.strip():
        raise HTTPException(status_code=400, detail="missing or invalid fields")
    ip = request.client.host if request.client else ""
    if not _check_rate_limit(ip):
        return JSONResponse({"ok": True})
    reason = _spam_reason(
        company_url=company_url, form_token=form_token,
        name=name, email=email, message=message, organization=organization,
    )
    _save_submission(
        request, "contact", name=name, email=email, phone=phone,
        organization=organization, subject=topic, message=message,
        is_spam=1 if reason else 0, spam_reason=reason,
    )
    return JSONResponse({"ok": True})


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# --------------------------------------------------------------------------- #
# auth (signed cookie session)
# --------------------------------------------------------------------------- #
def _make_token(user: str) -> str:
    return _signer.dumps({"u": user})


def _read_token(tok: str) -> str | None:
    try:
        data = _signer.loads(tok, max_age=SESSION_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("u") if isinstance(data, dict) else None


def current_admin(request: Request) -> str | None:
    tok = request.cookies.get(COOKIE_NAME)
    return _read_token(tok) if tok else None


def require_admin(request: Request) -> str:
    """For API-style endpoints (json/file/csv): 401 when unauthenticated."""
    user = current_admin(request)
    if not user:
        raise HTTPException(status_code=401, detail="unauthorized")
    return user


def _esc(v) -> str:
    s = "" if v is None else str(v)
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# --------------------------------------------------------------------------- #
# admin UI
# --------------------------------------------------------------------------- #
PAGE_CSS = """
:root{
  --green-900:#0a3d1f; --green-800:#0f5a30; --green-700:#1a7a42; --green-600:#218a4d;
  --green-100:#e7f3ec; --green-50:#f3f8f4;
  --gold-600:#b08d2e; --gold-500:#c8a951; --gold-100:#fdf3e0;
  --ink-900:#0f1f17; --ink-700:#2a3a30; --ink-600:#4a5a51; --ink-500:#6b7c73;
  --ink-400:#9aa8a0; --ink-300:#c5cfc7;
  --line:#e3eae5; --line-soft:#eef3f0;
  --bg:#f5f7f6; --surface:#ffffff;
  --danger:#b91c1c; --danger-bg:#fef2f2;
  --shadow-sm:0 1px 2px rgba(15,40,28,.04);
  --shadow-md:0 4px 16px -4px rgba(15,40,28,.08);
  --shadow-lg:0 12px 32px -8px rgba(15,40,28,.12);
  --radius-sm:8px; --radius:12px; --radius-lg:16px;
}
*{box-sizing:border-box}
body{margin:0;font-family:'Inter','Plus Jakarta Sans','Noto Sans Thai','Segoe UI',system-ui,-apple-system,sans-serif;
  background:var(--bg);color:var(--ink-900);font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
svg{flex-shrink:0}

/* ── Sidebar + topbar shell ───────────────────────────────────────────── */
.shell{display:grid;grid-template-columns:248px 1fr;min-height:100vh;transition:grid-template-columns .2s ease}
.sidebar{background:var(--green-900);color:#fff;display:flex;flex-direction:column;
  position:sticky;top:0;min-height:100vh;overflow-y:auto;padding:0;transition:width .2s ease}
.sidebar .brand{display:flex;align-items:center;gap:11px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08);position:relative}
.sidebar .brand .logo{width:34px;height:34px;border-radius:10px;background:#fff;color:var(--green-800);
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;letter-spacing:.5px;
  box-shadow:0 4px 12px rgba(0,0,0,.18);flex-shrink:0}
.sidebar .brand .name{font-size:13.5px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;flex:1;min-width:0}
.sidebar .brand .name small{display:block;font-weight:400;opacity:.65;font-size:10.5px;margin-top:1px}
.sidebar .collapse-btn{width:26px;height:26px;border-radius:8px;
  background:rgba(255,255,255,.10);color:#fff;border:1px solid rgba(255,255,255,.18);cursor:pointer;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:auto;
  transition:transform .2s ease, background .15s}
.sidebar .collapse-btn:hover{background:rgba(255,255,255,.22)}
.sidebar .collapse-btn svg{width:14px;height:14px;transition:transform .2s ease}
.sidebar.collapsed .collapse-btn svg{transform:rotate(180deg)}
.sidebar.collapsed .brand{padding:14px 0 14px 15px;justify-content:center}
.sidebar.collapsed .collapse-btn{margin-left:0;position:absolute;right:8px;top:14px}
.sidebar .nav{padding:10px 12px 14px;display:flex;flex-direction:column;gap:1px}
.sidebar .nav .nav-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;font-weight:700;
  color:rgba(255,255,255,.4);padding:10px 12px 6px;white-space:nowrap;overflow:hidden}
.sidebar .nav .nav-label-sub{padding-top:12px;margin-top:2px}
.sidebar .nav a{display:flex;flex-direction:row;align-items:center;gap:11px;padding:8px 12px;border-radius:10px;
  font-size:13px;font-weight:500;color:rgba(255,255,255,.78);transition:.15s;flex-wrap:nowrap;white-space:nowrap;position:relative}
.sidebar .nav a:hover{background:rgba(255,255,255,.08);color:#fff}
.sidebar .nav a.on{background:rgba(255,255,255,.14);color:#fff;font-weight:600;
  box-shadow:inset 3px 0 0 var(--gold-500)}
.sidebar .nav a svg{width:18px;height:18px;opacity:.85;flex-shrink:0}
.sidebar .nav .nav-sub{margin:4px 0 0 4px;padding-left:10px;border-left:1px solid rgba(255,255,255,.10);display:flex;flex-direction:column;gap:1px}
.sidebar .nav .nav-sub a{display:flex;align-items:center;gap:9px;padding:6px 12px;font-size:12.5px;font-weight:500;color:rgba(255,255,255,.65);border-radius:8px;text-decoration:none;transition:.15s;flex-wrap:nowrap;white-space:nowrap}
.sidebar .nav .nav-sub a:hover{background:rgba(255,255,255,.08);color:#fff}
.sidebar .nav .nav-sub a.on{background:rgba(255,255,255,.10);color:#fff;font-weight:600;box-shadow:inset 2px 0 0 var(--gold-500)}
.sidebar .nav .nav-sub a svg{width:15px;height:15px;opacity:.75;flex-shrink:0}
.sidebar .nav .sep{height:1px;background:rgba(255,255,255,.08);margin:8px 12px}
.sidebar .nav .logout{color:rgba(255,255,255,.7);margin-top:6px}
.sidebar .nav .logout:hover{background:rgba(255,99,99,.18);color:#fff}

/* ── Collapsed (icon-only) state ─────────────────────────────────────── */
.sidebar.collapsed{width:64px}
.sidebar.collapsed .brand{padding:14px 0 14px 15px}
.sidebar.collapsed .brand .name{display:none}
.sidebar.collapsed .nav{padding:10px 8px 14px}
.sidebar.collapsed .nav .nav-label{display:none}
.sidebar.collapsed .nav a{justify-content:center;padding:9px 0;gap:0}
.sidebar.collapsed .nav a span{display:none}
.sidebar.collapsed .nav .nav-sub{display:none}
.sidebar.collapsed .nav .sep{margin:8px 4px}
/* Tooltip when collapsed */
.sidebar.collapsed .nav a:hover::after,
.sidebar.collapsed .nav .logout:hover::after{
  content:attr(data-tip);position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);
  background:#0f172a;color:#fff;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:500;
  white-space:nowrap;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,.25);pointer-events:none}
@media(min-width:1025px){.shell:has(.sidebar.collapsed){grid-template-columns:64px 1fr}}

.workspace{display:flex;flex-direction:column;min-width:0}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:14px 28px;background:var(--surface);border-bottom:1px solid var(--line);
  position:sticky;top:0;z-index:10;box-shadow:var(--shadow-sm)}
.topbar .crumb{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-500);font-weight:500}
.topbar .crumb .sep{color:var(--ink-300)}
.topbar .crumb .here{color:var(--ink-900);font-weight:600}
.topbar .user{display:flex;align-items:center;gap:10px;font-size:13px}
.topbar .user .meta{display:flex;flex-direction:column;align-items:flex-end;line-height:1.2}
.topbar .user .meta strong{font-size:13px;font-weight:600;color:var(--ink-900)}
.topbar .user .meta small{font-size:11px;color:var(--ink-500)}
.topbar .user .avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--green-700),var(--green-800));
  color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;
  box-shadow:var(--shadow-sm)}
.topbar .iconbtn{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  color:var(--ink-600);cursor:pointer;border:1px solid transparent;transition:.15s;position:relative}
.topbar .iconbtn:hover{background:var(--green-50);color:var(--green-800);border-color:var(--line)}
.topbar .iconbtn .dot{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;
  background:#dc2626;border:2px solid #fff}

.content{padding:28px 32px 48px;width:100%}
.pagehead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
  margin-bottom:24px;flex-wrap:wrap}
.pagehead .title{font-size:22px;font-weight:700;color:var(--ink-900);margin:0;line-height:1.2}
.pagehead .desc{font-size:13px;color:var(--ink-500);margin:4px 0 0;font-weight:400}
.pagehead .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

/* ── Cards / stats ────────────────────────────────────────────────────── */
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);
  padding:18px 20px;box-shadow:var(--shadow-sm);position:relative;overflow:hidden}
.stat .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.stat .k{font-size:11.5px;color:var(--ink-500);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.stat .ico{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center}
.stat .ico svg{width:16px;height:16px}
.stat .v{font-size:28px;font-weight:800;color:var(--green-800);line-height:1.1;letter-spacing:-.5px}
.stat .trend{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;margin-top:8px}
.stat .trend.up{color:var(--green-700)}
.stat .trend.down{color:var(--danger)}
.stat .trend.flat{color:var(--ink-500)}
.stat.gold .v{color:var(--gold-600)}
.stat.gold .ico{background:var(--gold-100);color:var(--gold-600)}
.stat.green .ico{background:var(--green-100);color:var(--green-800)}
.stat.blue .ico{background:#eef0fb;color:#3d4db0}
.stat.red .ico{background:#fee2e2;color:#b91c1c}
.stat.red .v{color:#b91c1c}
.stat.red{border-color:#fecaca}

/* ── Toolbar / search / segment ───────────────────────────────────────── */
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
.search{flex:1;min-width:240px;position:relative}
.search input{width:100%;padding:11px 14px 11px 40px;border:1px solid var(--line);border-radius:var(--radius);
  font-size:13.5px;background:var(--surface);font-family:inherit;transition:.15s}
.search input:focus{outline:none;border-color:var(--green-700);box-shadow:0 0 0 3px rgba(26,122,66,.12)}
.search svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--ink-400)}
.seg{display:inline-flex;background:#eaf0ec;border-radius:11px;padding:3px;gap:2px}
.seg a{padding:8px 14px;border-radius:9px;font-size:13px;font-weight:600;text-decoration:none;color:var(--ink-600);
  display:inline-flex;align-items:center;gap:6px}
.seg a:hover{color:var(--green-800)}
.seg a.on{background:var(--surface);color:var(--green-800);box-shadow:0 1px 3px rgba(16,40,28,.12)}
.seg a .ct{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;
  padding:0 6px;border-radius:999px;background:rgba(15,90,48,.1);font-size:11px;font-weight:700}
.seg a.on .ct{background:var(--green-800);color:#fff}

/* ── Buttons ──────────────────────────────────────────────────────────── */
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:10px;
  font-size:13px;font-weight:600;text-decoration:none;border:1px solid transparent;
  cursor:pointer;transition:.15s;background:var(--surface);color:var(--green-800);font-family:inherit}
.btn:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}
.btn-ghost{background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.3)}
.btn-ghost:hover{background:rgba(255,255,255,.24);box-shadow:none}
.btn-gold{background:var(--gold-500);color:#fff;border-color:transparent}
.btn-gold:hover{background:var(--gold-600);box-shadow:var(--shadow-md)}
.btn-line{background:var(--surface);border-color:var(--line);color:var(--green-800)}
.btn-save{background:var(--green-800);color:#fff}
.btn-save:hover{background:var(--green-900);box-shadow:var(--shadow-md)}
.btn-sm{padding:6px 12px;font-size:12px;border-radius:8px}

/* ── Table ────────────────────────────────────────────────────────────── */
.tablecard{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);
  overflow:hidden;box-shadow:var(--shadow-sm);max-width:100%}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
.tablecard table,.table-wrap>table{border-collapse:collapse;width:100%;font-size:13px;
  min-width:880px;table-layout:fixed}
th,td{padding:10px 12px;text-align:left;vertical-align:middle;white-space:normal;word-break:break-word}
th{white-space:nowrap}
td.wrap{white-space:normal;min-width:160px;max-width:280px}
td.num{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
td.nw{white-space:nowrap}
td.code{width:72px;font-variant-numeric:tabular-nums;font-weight:600;color:var(--ink-600);white-space:nowrap}
td.name{min-width:160px}
td.type{width:110px}
td.status{width:100px}
td.contact{min-width:140px;max-width:200px}
td.files{width:64px;text-align:center}
td.date{width:120px;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--ink-600);font-size:12.5px}
td.conf{width:110px}
td.country{width:100px}
td.msg{max-width:220px;color:var(--ink-600);font-size:12.5px}
thead th{background:#f7faf8;color:var(--ink-600);font-size:11px;text-transform:uppercase;
  letter-spacing:.5px;font-weight:700;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:1}
tbody tr{border-bottom:1px solid var(--line-soft)}
tbody tr:last-child{border-bottom:0}
tbody tr.main{display:table-row;cursor:pointer;transition:background .12s}
tbody tr.main:hover{background:var(--green-50)}
tbody tr.main>td{display:table-cell}
tbody tr.detail:hover{background:var(--green-50)}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:999px;
  font-size:11.5px;font-weight:700;letter-spacing:.2px}
.badge.nat{background:var(--green-100);color:var(--green-700)}
.badge.int{background:#eef0fb;color:#3d4db0}
.badge.tr{background:var(--green-100);color:var(--green-700)}
.badge.mb{background:var(--gold-100);color:var(--gold-600)}
.badge.ct{background:#eef0fb;color:#3d4db0}
.badge.sp{background:#fdecea;color:var(--danger)}
.nm{font-weight:700;color:var(--ink-900);display:block;line-height:1.35}
.sub{color:var(--ink-500);font-size:12px;line-height:1.35}
.name .badge{margin:4px 0;display:inline-flex}
.dl{display:inline-flex;align-items:center;gap:5px;color:var(--green-800);font-weight:600;
  text-decoration:none;font-size:12.5px}
.dl:hover{text-decoration:underline}
.muted{color:var(--ink-400)}
.expand{cursor:pointer;user-select:none;color:var(--green-700);font-weight:600;display:inline-flex;align-items:center;gap:4px;font-size:11.5px;margin-top:2px}
.expand svg{width:12px;height:12px;transition:transform .15s}
tr.detail td{background:#f8faf9;font-size:12.5px;color:var(--ink-700);padding:0}
tr.detail .inner{padding:14px 18px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px 26px}
tr.detail .inner div span{color:var(--ink-400);display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-bottom:2px}
.empty{text-align:center;padding:60px 24px;color:var(--ink-400)}
.empty svg{width:48px;height:48px;opacity:.4;margin:0 auto 12px;display:block}
.empty .title{font-size:14px;font-weight:600;color:var(--ink-600);margin-bottom:4px}
.empty .desc{font-size:12.5px;color:var(--ink-400);margin:0}
/* IMPORTANT: never set display:flex on <td> — it breaks table column layout */
td.act{width:150px;white-space:nowrap;vertical-align:middle}
.act-btns{display:inline-flex;flex-wrap:wrap;gap:6px;align-items:center}
.act-btns form{display:inline-flex;margin:0}
.del-btn,.act-btns .dl{display:inline-flex;align-items:center;justify-content:center;
  min-height:30px;padding:5px 11px;border-radius:8px;font-size:12px;font-weight:600;
  font-family:inherit;text-decoration:none;cursor:pointer;border:1px solid transparent;
  white-space:nowrap;line-height:1.2;transition:background .15s,border-color .15s,transform .1s;
  background:#fef2f2;color:var(--danger);border-color:#fecaca}
.del-btn:hover,.act-btns .dl:hover{text-decoration:none;background:#fee2e2;transform:translateY(-1px)}
.del-btn.ok,.act-btns .dl{background:#ecfdf3;color:var(--green-800);border-color:#bbf7d0}
.del-btn.ok:hover,.act-btns .dl:hover{background:#d1fae5}
.del-btn.warn{background:var(--gold-100);color:var(--gold-600);border-color:#fde68a}
.del-btn.warn:hover{background:#fde68a}

/* ── Pagination ───────────────────────────────────────────────────────── */
.pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:14px 20px;border-top:1px solid var(--line);flex-wrap:wrap}
.pagination .info{font-size:12.5px;color:var(--ink-500)}
.pagination .pages{display:flex;gap:4px;align-items:center}
.pagination .pages a,.pagination .pages span{
  min-width:32px;height:32px;padding:0 10px;border-radius:8px;display:inline-flex;align-items:center;
  justify-content:center;font-size:13px;font-weight:600;text-decoration:none;color:var(--ink-600);
  border:1px solid transparent;cursor:pointer;transition:.15s}
.pagination .pages a:hover{background:var(--green-50);color:var(--green-800);border-color:var(--line)}
.pagination .pages .on{background:var(--green-800);color:#fff}
.pagination .pages .gap{color:var(--ink-300);cursor:default}

/* ── Forms ────────────────────────────────────────────────────────────── */
.formwrap{max-width:880px;margin:0 auto;padding:28px 32px 60px}
.fcard{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);
  padding:28px 32px;box-shadow:var(--shadow-md)}
.fcard h2{margin:0 0 4px;font-size:20px;color:var(--ink-900);font-weight:700}
.fcard p.s{margin:0 0 22px;color:var(--ink-500);font-size:13px}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px 20px}
.fgrid .full{grid-column:1/-1}
.fld label{display:block;font-size:12px;font-weight:600;color:var(--ink-700);margin:0 0 6px}
.fld .help{font-size:11.5px;color:var(--ink-400);margin-top:4px;font-weight:400}
.fld input,.fld select,.fld textarea{width:100%;padding:10px 12px;border:1px solid var(--line);
  border-radius:10px;font-size:14px;font-family:inherit;background:var(--surface);transition:.15s}
.fld input:focus,.fld select:focus,.fld textarea:focus{outline:none;border-color:var(--green-700);
  box-shadow:0 0 0 3px rgba(26,122,66,.12)}
.ferr{background:var(--danger-bg);border:1px solid #fecaca;color:var(--danger);padding:11px 14px;
  border-radius:10px;font-size:13px;margin-bottom:16px}
.factions{display:flex;gap:10px;margin-top:24px}

/* ── Login ────────────────────────────────────────────────────────────── */
.loginwrap{min-height:100vh;display:grid;grid-template-columns:1fr 1fr}
.loginart{background:linear-gradient(140deg,#0a3d1f 0%,#0f5a30 45%,#1a7a42 100%);
  color:#fff;padding:60px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.loginart::before{content:"";position:absolute;inset:0;
  background:radial-gradient(800px 400px at 80% 10%,rgba(255,255,255,.12),transparent 60%),
             radial-gradient(600px 500px at -10% 90%,rgba(200,169,81,.18),transparent 60%);pointer-events:none}
.loginart .logo{display:flex;align-items:center;gap:12px;position:relative}
.loginart .logo .mark{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.14);
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;letter-spacing:.5px;
  border:1px solid rgba(255,255,255,.2)}
.loginart .logo .name{font-size:15px;font-weight:700;line-height:1.2}
.loginart .logo .name small{display:block;font-weight:400;opacity:.75;font-size:11.5px;margin-top:2px}
.loginart .quote h2{font-size:26px;line-height:1.3;margin:0 0 14px;font-weight:700;max-width:420px}
.loginart .quote p{font-size:13.5px;opacity:.8;max-width:380px;margin:0;line-height:1.6}
.loginart .ft{font-size:11.5px;opacity:.6;position:relative}
.loginform{display:flex;align-items:center;justify-content:center;padding:40px 28px}
.loginbox{width:100%;max-width:380px}
.loginbox .lbl{font-size:11px;font-weight:700;color:var(--ink-500);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px}
.loginbox h1{font-size:24px;font-weight:700;color:var(--ink-900);margin:0 0 6px}
.loginbox p.lead{color:var(--ink-500);font-size:13.5px;margin:0 0 26px}
.loginbox label{display:block;font-size:12.5px;font-weight:600;color:var(--ink-700);margin:14px 0 6px}
.loginbox input{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:11px;
  font-size:14px;font-family:inherit;background:var(--surface);transition:.15s}
.loginbox input:focus{outline:none;border-color:var(--green-700);box-shadow:0 0 0 3px rgba(26,122,66,.12)}
.loginbox .row{display:flex;justify-content:space-between;align-items:center;margin:10px 0 0;font-size:12.5px}
.loginbox .row label{display:inline-flex;align-items:center;gap:6px;margin:0;color:var(--ink-600);font-weight:500}
.loginbox .row input[type=checkbox]{width:auto;padding:0}
.loginbox .row a{color:var(--green-700);font-weight:600}
.loginbox button{width:100%;margin-top:24px;padding:13px;border:0;border-radius:12px;
  background:var(--green-800);color:#fff;font-weight:700;font-size:15px;cursor:pointer;
  transition:.15s;box-shadow:0 6px 16px -4px rgba(15,90,48,.4)}
.loginbox button:hover{background:var(--green-900);transform:translateY(-1px)}
.err{background:var(--danger-bg);border:1px solid #fecaca;color:var(--danger);padding:10px 12px;
  border-radius:10px;font-size:13px;margin:18px 0 0;text-align:center}
.loginmobile{display:none}

/* ── Responsive ──────────────────────────────────────────────────────── */
@media(max-width:1024px){.shell{grid-template-columns:1fr}.sidebar{position:fixed;top:0;left:0;width:248px;
  z-index:50;transform:translateX(-100%);transition:transform .25s}
  .sidebar.open{transform:none;box-shadow:var(--shadow-lg)}
  .sidebar .toggle{display:flex}
  .topbar .menubtn{display:flex}
  .content{padding:20px 18px 40px}
  .formwrap{padding:20px 16px 40px}
  .stats{grid-template-columns:repeat(2,1fr)}
  .loginwrap{grid-template-columns:1fr}
  .loginart{display:none}
  .loginmobile{display:flex}}
@media(max-width:780px){.stats{grid-template-columns:repeat(2,1fr)}tr.detail .inner{grid-template-columns:1fr 1fr}}
@media(max-width:600px){.fgrid{grid-template-columns:1fr}.topbar .crumb{display:none}}

.sidebar .toggle,.topbar .menubtn{display:none;width:36px;height:36px;border-radius:10px;
  align-items:center;justify-content:center;border:1px solid transparent;cursor:pointer;color:inherit}
@media(min-width:1025px){.sidebar .toggle{display:none !important}}
.sidebar .toggle{margin:14px 12px 0;background:rgba(255,255,255,.1);color:#fff}
.sidebar .toggle:hover{background:rgba(255,255,255,.2)}
.topbar .menubtn{background:var(--surface);color:var(--ink-700);border-color:var(--line)}
.topbar .menubtn:hover{background:var(--green-50)}
"""


def _admin_nav(active: str) -> str:
    """Render sidebar nav items — used by all admin pages (legacy + new shell)."""
    items = (
        ("reg", "ลงทะเบียนประชุม", "/api/admin", "M4 4h16v4H4V4zm0 8h16v8H4v-8z"),
        ("forms", "แบบฟอร์มอื่น ๆ", "/api/admin/submissions", "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"),
        ("members", "สมาชิก", "/api/admin/members", "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z"),
        ("content", "จัดการเนื้อหา ↗", "https://cms.tsae.asia", "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"),
    )
    parts = []
    for key, label, href, icon in items:
        on = " on" if key == active else ""
        external = ' target="_blank" rel="noopener noreferrer"' if href.startswith("https://") else ""
        parts.append(
            f'<a class="nav{on}" href="{href}"{external} data-nav="{key}" data-tip="{_esc(label)}">'
            f'<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">'
            f'<path stroke-linecap="round" stroke-linejoin="round" d="{icon}"/></svg>'
            f'<span>{label}</span></a>'
        )
    return "".join(parts)


def _admin_shell(active: str, title: str, breadcrumb: tuple[tuple[str, str], ...] = (),
                 desc: str = "", actions: str = "", user: str = "admin") -> tuple[str, str]:
    """Return (head_html, body_top_html) wrapping every admin page.

    Usage in a page:
        head, top = _admin_shell("reg", "title",
            breadcrumb=(("/api/admin", "home"),), desc="...", actions="<a>...</a>")
        return f-string with {PAGE_CSS} in head and {top} in body.
    """
    crumb_parts = []
    for i, (href, label) in enumerate(breadcrumb):
        is_last = i == len(breadcrumb) - 1
        crumb_parts.append(
            f'<a href="{href}" class="{"here" if is_last else ""}">{_esc(label)}</a>'
        )
        if not is_last:
            crumb_parts.append('<span class="sep">/</span>')
    crumb_html = "".join(crumb_parts) or f'<span class="here">{_esc(title)}</span>'

    initials = (user[:2] if user else "AD").upper()

    body_top = f"""
<div class="shell">
  <aside class="sidebar" id="sidebar">
    <button class="toggle" type="button" aria-label="ปิดเมนู" onclick="document.getElementById('sidebar').classList.remove('open')">
      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M6 18L18 6"/></svg>
    </button>
    <div class="brand">
      <div class="logo">TSAE</div>
      <div class="name">สมาคมวิศวกรรมเกษตร<small>Thai Society of Ag. Eng.</small></div>
      <button class="collapse-btn" type="button" aria-label="ย่อ/ขยายเมนู" onclick="document.getElementById('sidebar').classList.toggle('collapsed');try{{localStorage.setItem('tsae_admin_sidebar',document.getElementById('sidebar').classList.contains('collapsed')?'collapsed':'')}}catch(e){{}}">
        <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 6l-6 6 6 6"/></svg>
      </button>
    </div>
    <nav class="nav">
      <div class="nav-label">เมนูหลัก</div>
      {_admin_nav(active)}
      <div class="sep"></div>
      <a class="logout" href="/api/admin/logout" data-tip="ออกจากระบบ">
        <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h6a2 2 0 012 2v1"/></svg>
        <span>ออกจากระบบ</span></a>
    </nav>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <button class="menubtn" type="button" aria-label="เปิดเมนู" onclick="document.getElementById('sidebar').classList.add('open')">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div class="crumb">{''.join(crumb_parts)}</div>
      <div class="user">
        <div class="meta"><strong>{_esc(user)}</strong><small>ผู้ดูแลระบบ</small></div>
        <div class="avatar">{initials}</div>
      </div>
    </header>
    <main class="content">
      <div class="pagehead">
        <div><h1 class="title">{_esc(title)}</h1>{f'<p class="desc">{_esc(desc)}</p>' if desc else ''}</div>
        {f'<div class="actions">{actions}</div>' if actions else ''}
      </div>
"""
    body_bottom = """
    </main>
  </div>
</div>
<script>
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('sidebar').classList.remove('open')});
(function(){try{if(localStorage.getItem('tsae_admin_sidebar')==='collapsed'&&matchMedia('(min-width:1025px)').matches)document.getElementById('sidebar').classList.add('collapsed')}catch(e){}})();
</script>
</body></html>"""
    return body_top, body_bottom


def _safe_next(url: str | None) -> str:
    if url and url.startswith("/api/admin") and "://" not in url:
        return url
    return "/api/admin"


def _login_page(error: str = "", next_url: str = "/api/admin") -> str:
    err_html = (
        f'<p class="err">{_esc(error)}</p>' if error else ""
    )
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSAE Admin · เข้าสู่ระบบ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{PAGE_CSS}
.loginmobile{{background:linear-gradient(140deg,#0a3d1f 0%,#0f5a30 45%,#1a7a42 100%);
  padding:24px 20px;color:#fff;flex-direction:column;align-items:flex-start;gap:14px}}
.loginmobile .logo{{display:flex;align-items:center;gap:12px}}
.loginmobile .logo .mark{{width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,.14);
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;
  border:1px solid rgba(255,255,255,.2)}}
.loginmobile .logo .name{{font-size:14px;font-weight:700;line-height:1.2}}
.loginmobile .logo .name small{{display:block;font-weight:400;opacity:.75;font-size:11px;margin-top:1px}}
</style></head><body>
<div class="loginwrap">
  <div class="loginart">
    <div class="logo">
      <div class="mark">TSAE</div>
      <div class="name">สมาคมวิศวกรรมเกษตรแห่งประเทศไทย<small>Thai Society of Agricultural Engineering</small></div>
    </div>
    <div class="quote">
      <h2>ระบบจัดการเว็บไซต์และสมาชิก<br>อย่างเป็นทางการ</h2>
      <p>ศูนย์กลางการบริหารการลงทะเบียนประชุม แบบฟอร์ม และข้อมูลสมาชิกของสมาคมฯ</p>
    </div>
    <div class="ft">© 2026 Thai Society of Agricultural Engineering · ก่อตั้ง พ.ศ. 2527</div>
  </div>
  <div class="loginform">
    <div class="loginmobile">
      <div class="logo">
        <div class="mark">TSAE</div>
        <div class="name">สมาคมวิศวกรรมเกษตร<small>Thai Society of Ag. Eng.</small></div>
      </div>
    </div>
    <div class="loginbox">
      <div class="lbl">ระบบผู้ดูแล</div>
      <h1>เข้าสู่ระบบ</h1>
      <p class="lead">ลงชื่อเข้าใช้เพื่อจัดการการลงทะเบียน แบบฟอร์ม และข้อมูลสมาชิก</p>
      <form method="post" action="/api/admin/login">
        <input type="hidden" name="next" value="{_esc(next_url)}">
        <label>ชื่อผู้ใช้</label>
        <input name="username" autocomplete="username" autofocus required>
        <label>รหัสผ่าน</label>
        <input name="password" type="password" autocomplete="current-password" required>
        <div class="row">
          <label><input type="checkbox" name="remember"> จดจำการเข้าสู่ระบบ</label>
        </div>
        <button type="submit">เข้าสู่ระบบ</button>
      </form>
      {err_html}
    </div>
  </div>
</div></body></html>"""


@app.get("/admin/login", response_class=HTMLResponse)
def admin_login_page(request: Request, next: str = "/api/admin"):
    nxt = _safe_next(next)
    if current_admin(request):
        return RedirectResponse(nxt if nxt != "/api/admin" else "/api/admin", status_code=303)
    return HTMLResponse(_login_page(next_url=nxt))


@app.post("/admin/login")
def admin_login(
    username: str = Form(...),
    password: str = Form(...),
    next: str = Form("/api/admin"),
):
    nxt = _safe_next(next)
    ok_user = secrets.compare_digest(username, ADMIN_USER)
    ok_pass = secrets.compare_digest(password, ADMIN_PASS)
    if not (ok_user and ok_pass):
        return HTMLResponse(_login_page("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", next_url=nxt), status_code=401)
    resp = RedirectResponse(nxt, status_code=303)
    resp.set_cookie(
        COOKIE_NAME, _make_token(username),
        max_age=SESSION_MAX_AGE, httponly=True, secure=True, samesite="lax", path="/",
    )
    return resp


@app.get("/admin/logout")
def admin_logout():
    resp = RedirectResponse("/api/admin/login", status_code=303)
    resp.delete_cookie(COOKIE_NAME, path="/")
    return resp


@app.get("/admin", response_class=HTMLResponse)
def admin(request: Request, conf: str = ""):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)

    con = db()
    if conf in ALLOWED_CONF:
        rows = con.execute(
            "SELECT * FROM registrations WHERE conf=? ORDER BY id DESC", (conf,)
        ).fetchall()
    else:
        rows = con.execute("SELECT * FROM registrations ORDER BY id DESC").fetchall()
    counts = {
        "all": con.execute("SELECT COUNT(*) c FROM registrations").fetchone()["c"],
        "national": con.execute(
            "SELECT COUNT(*) c FROM registrations WHERE conf='national'"
        ).fetchone()["c"],
        "intl": con.execute(
            "SELECT COUNT(*) c FROM registrations WHERE conf='intl'"
        ).fetchone()["c"],
        "files": con.execute(
            "SELECT COUNT(*) c FROM registrations WHERE file_name IS NOT NULL AND file_name<>''"
        ).fetchone()["c"],
    }
    con.close()

    body = []
    for r in rows:
        cls = "nat" if r["conf"] == "national" else "int"
        conf_label = "National" if r["conf"] == "national" else "International"
        if r["file_name"]:
            file_cell = (
                f'<a class="dl" href="/api/admin/file/{r["id"]}">'
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                'stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
                '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
                'ดาวน์โหลด</a>'
            )
        else:
            file_cell = '<span class="muted">—</span>'
        try:
            dt = datetime.fromisoformat(r["created_at"]).strftime("%d/%m/%Y %H:%M")
        except Exception:
            dt = _esc(r["created_at"])
        addr = ", ".join(
            x for x in [
                _esc(r["street"]), _esc(r["apartment"]), _esc(r["city"]),
                _esc(r["state"]), _esc(r["zip"]), _esc(r["country"]),
            ] if x
        ) or "—"
        body.append(
            f'<tr class="main" data-search="{_esc((r["name"] or "")+" "+(r["surname"] or "")+" "+(r["email"] or "")+" "+(r["organization"] or "")+" "+(r["country"] or "")).lower()}" onclick="tog({r["id"]})">'
            f'<td class="muted nw">#{r["id"]}</td>'
            f'<td class="date">{dt}</td>'
            f'<td class="conf"><span class="badge {cls}">{conf_label}</span></td>'
            f'<td class="name"><span class="nm">{_esc(r["name"])} {_esc(r["surname"])}</span>'
            f'<span class="sub expand">รายละเอียด ▾</span></td>'
            f'<td class="contact">{_esc(r["email"])}<br><span class="sub">{_esc(r["phone"])}</span></td>'
            f'<td class="wrap">{_esc(r["organization"]) or "—"}<br><span class="sub">{_esc(r["job_title"])}</span></td>'
            f'<td class="country">{_esc(r["country"]) or "—"}</td>'
            f'<td class="nw" onclick="event.stopPropagation()">{file_cell}</td>'
            f'<td class="act" onclick="event.stopPropagation()"><div class="act-btns">'
            f'<a class="dl" href="/api/admin/edit/{r["id"]}">แก้ไข</a>'
            f'<form method="post" action="/api/admin/delete/{r["id"]}" '
            f"onsubmit=\"return confirm('ลบรายการ #{r['id']} ถาวร? ข้อมูลและไฟล์แนบจะถูกลบและกู้คืนไม่ได้')\">"
            f'<button type="submit" class="del-btn">ลบ</button></form>'
            f'</div></td>'
            "</tr>"
        )
        body.append(
            f'<tr class="detail" id="d{r["id"]}" style="display:none"><td colspan="9"><div class="inner">'
            f'<div><span>ที่อยู่</span>{addr}</div>'
            f'<div><span>หน่วยงาน</span>{_esc(r["organization"]) or "—"}</div>'
            f'<div><span>ตำแหน่ง</span>{_esc(r["job_title"]) or "—"}</div>'
            f'<div><span>อีเมล</span>{_esc(r["email"])}</div>'
            f'<div><span>โทรศัพท์</span>{_esc(r["phone"])}</div>'
            f'<div><span>IP</span>{_esc(r["ip"]) or "—"}</div>'
            "</div></td></tr>"
        )

    def seg(label, key, href):
        on = "on" if (key == (conf if conf in ALLOWED_CONF else "all")) else ""
        return f'<a class="{on}" href="{href}">{label}</a>'

    export_q = ("?conf=" + conf) if conf in ALLOWED_CONF else ""
    table = (
        "".join(body)
        if body
        else '<tr><td colspan="9"><div class="empty">ยังไม่มีการลงทะเบียน</div></td></tr>'
    )

    export_actions = (
        f'<a class="btn btn-gold" href="/api/admin/export.csv{export_q}">'
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>'
        '<line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV</a>'
    )
    top, bottom = _admin_shell(
        "reg", "การลงทะเบียนประชุม",
        breadcrumb=(("/api/admin", "หน้าหลัก"), ("/api/admin", "การลงทะเบียนประชุม")),
        desc="รายการผู้ลงทะเบียนเข้าร่วมการประชุม TSAE 2026 (ระดับชาติและนานาชาติ)",
        actions=export_actions,
    )
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSAE Admin · การลงทะเบียน</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{PAGE_CSS}</style></head><body>
{top}
  <div class="stats">
    <div class="stat green">
      <div class="top"><span class="k">ทั้งหมด</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z"/></svg></span></div>
      <div class="v">{counts['all']}</div>
      <div class="trend flat"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14"/></svg> รวมทุกงาน</div>
    </div>
    <div class="stat blue">
      <div class="top"><span class="k">ระดับชาติ</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg></span></div>
      <div class="v">{counts['national']}</div>
      <div class="trend flat">TSAE 2026 National</div>
    </div>
    <div class="stat blue">
      <div class="top"><span class="k">นานาชาติ</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s-8-4.5-8-11a8 8 0 1116 0c0 6.5-8 11-8 11zm0-8a3 3 0 100-6 3 3 0 000 6z"/></svg></span></div>
      <div class="v">{counts['intl']}</div>
      <div class="trend flat">TSAE 2026 International</div>
    </div>
    <div class="stat gold">
      <div class="top"><span class="k">มีหลักฐานโอน</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></span></div>
      <div class="v">{counts['files']}</div>
      <div class="trend flat">{round(counts['files']*100/counts['all'],0) if counts['all'] else 0:.0f}% ของทั้งหมด</div>
    </div>
  </div>
  <div class="toolbar">
    <div class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="q" placeholder="ค้นหา ชื่อ / อีเมล / หน่วยงาน / ประเทศ…" oninput="flt()">
    </div>
    <div class="seg">
      {seg('ทั้งหมด','all','/api/admin')}
      {seg('ระดับชาติ','national','/api/admin?conf=national')}
      {seg('นานาชาติ','intl','/api/admin?conf=intl')}
    </div>
  </div>
  <div class="tablecard"><div class="table-wrap"><table>
    <thead><tr><th>#</th><th>วันที่</th><th>งาน</th><th>ชื่อ-สกุล</th>
    <th>อีเมล / โทร</th><th>หน่วยงาน / ตำแหน่ง</th><th>ประเทศ</th><th>หลักฐาน</th><th>จัดการ</th></tr></thead>
    <tbody id="tb">{table}</tbody>
  </table></div></div>
{bottom}
<script>
function tog(id){{var d=document.getElementById('d'+id);if(d)d.style.display=d.style.display==='none'?'table-row':'none';}}
function flt(){{var q=document.getElementById('q').value.toLowerCase().trim();
  document.querySelectorAll('#tb tr.main').forEach(function(tr){{
    var hit=!q||(tr.getAttribute('data-search')||'').indexOf(q)>-1;
    tr.style.display=hit?'table-row':'none';
    var d=document.getElementById('d'+tr.querySelector('td').textContent.replace('#',''));
    if(d&&!hit)d.style.display='none';
  }});}}
</script>
</body></html>"""


@app.get("/admin/export.csv")
def export_csv(_: str = Depends(require_admin), conf: str = "") -> StreamingResponse:
    con = db()
    if conf in ALLOWED_CONF:
        rows = con.execute(
            "SELECT * FROM registrations WHERE conf=? ORDER BY id", (conf,)
        ).fetchall()
    else:
        rows = con.execute("SELECT * FROM registrations ORDER BY id").fetchall()
    con.close()

    buf = io.StringIO()
    buf.write("\ufeff")  # BOM so Excel reads UTF-8 (Thai) correctly
    cols = [
        "id", "created_at", "conf", "name", "surname", "email", "phone",
        "organization", "job_title", "street", "apartment", "city", "state",
        "zip", "country", "file_name", "ip",
    ]
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([r[c] for c in cols])
    buf.seek(0)
    fname = f"tsae-registrations-{conf or 'all'}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/admin/file/{rid}")
def admin_file(rid: int, _: str = Depends(require_admin)) -> Response:
    con = db()
    row = con.execute(
        "SELECT file_name FROM registrations WHERE id=?", (rid,)
    ).fetchone()
    con.close()
    if not row or not row["file_name"]:
        raise HTTPException(status_code=404, detail="no file")
    # guard against path traversal
    rel = row["file_name"].lstrip("/")
    target = (UPLOAD_DIR / rel).resolve()
    if not str(target).startswith(str(UPLOAD_DIR.resolve())) or not target.exists():
        raise HTTPException(status_code=404, detail="file missing")
    data = target.read_bytes()
    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{target.name}"'},
    )


# --------------------------------------------------------------------------- #
# admin: edit / delete
# --------------------------------------------------------------------------- #
EDIT_FIELDS = [
    ("name", "ชื่อ *"), ("surname", "นามสกุล *"),
    ("email", "อีเมล *"), ("phone", "โทรศัพท์ *"),
    ("organization", "หน่วยงาน / บริษัท"), ("job_title", "ตำแหน่ง"),
    ("street", "ที่อยู่"), ("apartment", "อาคาร / ห้อง"),
    ("city", "เมือง / อำเภอ"), ("state", "จังหวัด / รัฐ"),
    ("zip", "รหัสไปรษณีย์"), ("country", "ประเทศ"),
]


def _delete_upload(file_name: str | None) -> None:
    if not file_name:
        return
    rel = file_name.lstrip("/")
    target = (UPLOAD_DIR / rel).resolve()
    if str(target).startswith(str(UPLOAD_DIR.resolve())) and target.exists():
        try:
            target.unlink()
        except OSError:
            pass


def _delete_submission_uploads(extra_raw: str | None) -> None:
    if not extra_raw:
        return
    try:
        files = (json.loads(extra_raw).get("files") or [])
    except Exception:
        return
    for item in files:
        rel = (item.get("stored_path") or "").lstrip("/")
        target = (UPLOAD_DIR / rel).resolve()
        if str(target).startswith(str(UPLOAD_DIR.resolve())) and target.exists():
            try:
                target.unlink()
            except OSError:
                pass


def _edit_page(d: dict, error: str = "") -> str:
    rid = d["id"]
    conf = (d.get("conf") or "").lower()
    nat_sel = "selected" if conf == "national" else ""
    int_sel = "selected" if conf == "intl" else ""
    err_html = f'<div class="ferr">{_esc(error)}</div>' if error else ""
    file_html = (
        f'<a class="dl" href="/api/admin/file/{rid}">ดาวน์โหลดไฟล์แนบปัจจุบัน</a>'
        if d.get("file_name")
        else '<span class="muted">ไม่มีไฟล์แนบ</span>'
    )
    fields_html = "".join(
        f'<div class="fld"><label>{label}</label>'
        f'<input name="{key}" value="{_esc(d.get(key))}"></div>'
        for key, label in EDIT_FIELDS
    )
    top, bottom = _admin_shell(
        "reg", f"แก้ไขการลงทะเบียน #{rid}",
        breadcrumb=(("/api/admin", "หน้าหลัก"), ("/api/admin", "การลงทะเบียนประชุม"), ("/api/admin", f"แก้ไข #{rid}")),
        desc=f"Registration #{rid} · แก้ไขข้อมูลผู้ลงทะเบียนแล้วกดบันทึก",
        actions='<a class="btn btn-line" href="/api/admin">&larr; กลับ</a>',
    )
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSAE Admin · แก้ไข #{rid}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{PAGE_CSS}</style></head><body>
{top}
<div class="formwrap">
  <div class="fcard">
    <h2>แก้ไขข้อมูล #{rid}</h2>
    <p class="s">แก้ไขข้อมูลผู้ลงทะเบียนแล้วกดบันทึก</p>
    {err_html}
    <form method="post" action="/api/admin/edit/{rid}">
      <div class="fgrid">
        <div class="fld full"><label>งานประชุม *</label>
          <select name="conf">
            <option value="national" {nat_sel}>TSAE 2026 ระดับชาติ</option>
            <option value="intl" {int_sel}>TSAE 2026 นานาชาติ</option>
          </select>
        </div>
        {fields_html}
        <div class="fld full"><label>หลักฐานการโอน</label><div>{file_html}</div></div>
      </div>
      <div class="factions">
        <button type="submit" class="btn btn-save">บันทึกการแก้ไข</button>
        <a class="btn btn-line" href="/api/admin">ยกเลิก</a>
      </div>
    </form>
  </div>
</div>
{bottom}
"""


@app.get("/admin/edit/{rid}", response_class=HTMLResponse)
def admin_edit_page(rid: int, request: Request):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    con = db()
    row = con.execute("SELECT * FROM registrations WHERE id=?", (rid,)).fetchone()
    con.close()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    return HTMLResponse(_edit_page(dict(row)))


@app.post("/admin/edit/{rid}")
def admin_edit(
    rid: int,
    request: Request,
    conf: str = Form(...),
    name: str = Form(...),
    surname: str = Form(...),
    email: str = Form(...),
    phone: str = Form(...),
    organization: str = Form(""),
    job_title: str = Form(""),
    street: str = Form(""),
    apartment: str = Form(""),
    city: str = Form(""),
    state: str = Form(""),
    zip: str = Form(""),
    country: str = Form(""),
):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    con = db()
    row = con.execute("SELECT * FROM registrations WHERE id=?", (rid,)).fetchone()
    if not row:
        con.close()
        raise HTTPException(status_code=404, detail="not found")

    conf = conf.strip().lower()
    name, surname = name.strip(), surname.strip()
    email, phone = email.strip(), phone.strip()
    values = {
        "conf": conf, "name": name, "surname": surname, "email": email,
        "phone": phone, "organization": organization.strip(),
        "job_title": job_title.strip(), "street": street.strip(),
        "apartment": apartment.strip(), "city": city.strip(),
        "state": state.strip(), "zip": zip.strip(), "country": country.strip(),
    }

    err = ""
    if conf not in ALLOWED_CONF:
        err = "งานประชุมไม่ถูกต้อง"
    elif not (name and surname and email and phone):
        err = "กรุณากรอกข้อมูลที่จำเป็น (ชื่อ นามสกุล อีเมล โทรศัพท์) ให้ครบ"
    elif not EMAIL_RE.match(email):
        err = "รูปแบบอีเมลไม่ถูกต้อง"
    if err:
        merged = dict(row)
        merged.update(values)
        con.close()
        return HTMLResponse(_edit_page(merged, err), status_code=400)

    con.execute(
        """UPDATE registrations SET conf=?, name=?, surname=?, email=?, phone=?,
           organization=?, job_title=?, street=?, apartment=?, city=?, state=?,
           zip=?, country=? WHERE id=?""",
        (
            values["conf"], values["name"], values["surname"], values["email"],
            values["phone"], values["organization"], values["job_title"],
            values["street"], values["apartment"], values["city"],
            values["state"], values["zip"], values["country"], rid,
        ),
    )
    con.commit()
    con.close()
    return RedirectResponse("/api/admin", status_code=303)


@app.post("/admin/delete/{rid}")
def admin_delete(rid: int, request: Request):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    con = db()
    row = con.execute(
        "SELECT file_name FROM registrations WHERE id=?", (rid,)
    ).fetchone()
    if row:
        _delete_upload(row["file_name"])
        con.execute("DELETE FROM registrations WHERE id=?", (rid,))
        con.commit()
    con.close()
    return RedirectResponse("/api/admin", status_code=303)


# --------------------------------------------------------------------------- #
# admin: other form submissions (training / membership / contact)
# --------------------------------------------------------------------------- #
_KIND_BADGE = {"training": "tr", "membership": "mb", "contact": "ct"}
_KIND_LABEL = {"training": "ฝึกอบรม", "membership": "สมัครสมาชิก", "contact": "ติดต่อ"}


def _submissions_back_url(kind: str = "") -> str:
    if kind == "membership":
        return "/api/admin/members?tab=applications"
    if kind == "spam":
        return "/api/admin/submissions?kind=spam"
    if kind in SUBMISSION_KINDS:
        return f"/api/admin/submissions?kind={kind}"
    return "/api/admin/submissions"


@app.get("/admin/submissions", response_class=HTMLResponse)
def admin_submissions(request: Request, kind: str = ""):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)

    if kind == "membership":
        return RedirectResponse("/api/admin/members?tab=applications", status_code=303)

    con = db()
    if kind == "spam":
        rows = con.execute(
            "SELECT * FROM submissions WHERE is_spam=1 ORDER BY id DESC"
        ).fetchall()
    elif kind in SUBMISSION_KINDS:
        rows = con.execute(
            "SELECT * FROM submissions WHERE kind=? AND is_spam=0 ORDER BY id DESC", (kind,)
        ).fetchall()
    else:
        rows = con.execute("SELECT * FROM submissions WHERE is_spam=0 ORDER BY id DESC").fetchall()
    counts = {
        "all": con.execute("SELECT COUNT(*) c FROM submissions WHERE is_spam=0").fetchone()["c"],
        "training": con.execute(
            "SELECT COUNT(*) c FROM submissions WHERE kind='training' AND is_spam=0"
        ).fetchone()["c"],
        "contact": con.execute(
            "SELECT COUNT(*) c FROM submissions WHERE kind='contact' AND is_spam=0"
        ).fetchone()["c"],
        "membership": con.execute(
            "SELECT COUNT(*) c FROM submissions WHERE kind='membership' AND is_spam=0"
        ).fetchone()["c"],
        "spam": con.execute("SELECT COUNT(*) c FROM submissions WHERE is_spam=1").fetchone()["c"],
    }
    con.close()

    body = []
    for r in rows:
        k = r["kind"]
        is_spam = r["is_spam"] if "is_spam" in r.keys() else 0
        spam_reason_val = (r["spam_reason"] or "") if "spam_reason" in r.keys() else ""
        badge_cls = _KIND_BADGE.get(k, "ct")
        klabel = _KIND_LABEL.get(k, k)
        try:
            dt = datetime.fromisoformat(r["created_at"]).strftime("%d/%m/%Y %H:%M")
        except Exception:
            dt = _esc(r["created_at"])
        msg = (r["message"] or "").strip()
        msg_short = (msg[:90] + "…") if len(msg) > 90 else (msg or "—")
        row_style = ' style="background:#fff5f5;"' if is_spam else ""
        spam_badge = f' <span class="badge sp" title="{_esc(spam_reason_val)}">spam</span>' if is_spam else ""
        mark_spam_btn = (
            f'<form method="post" action="/api/admin/submissions/unspam/{r["id"]}">'
            f'<button type="submit" class="del-btn ok">ยกเลิกสแปม</button></form>'
        ) if is_spam else (
            f'<form method="post" action="/api/admin/submissions/markspam/{r["id"]}">'
            f'<button type="submit" class="del-btn warn">สแปม</button></form>'
        )
        spam_reason_row = f'<div><span>Spam reason</span>{_esc(spam_reason_val) or "—"}</div>' if spam_reason_val else ""
        body.append(
            f'<tr class="main"{row_style} data-search="{_esc(((r["name"] or "")+" "+(r["email"] or "")+" "+(r["organization"] or "")+" "+(r["subject"] or "")+" "+msg).lower())}" onclick="tog({r["id"]})">'
            f'<td class="muted nw">#{r["id"]}</td>'
            f'<td class="date">{dt}</td>'
            f'<td class="conf"><span class="badge {badge_cls}">{klabel}</span></td>'
            f'<td class="name"><span class="nm">{_esc(r["name"]) or "—"}</span>{spam_badge}'
            f'<span class="sub expand">รายละเอียด ▾</span></td>'
            f'<td class="contact">{_esc(r["email"]) or "—"}<br><span class="sub">{_esc(r["phone"]) or ""}</span></td>'
            f'<td class="wrap">{_esc(r["subject"]) or "—"}</td>'
            f'<td class="msg">{_esc(msg_short)}</td>'
            f'<td class="act" onclick="event.stopPropagation()"><div class="act-btns">'
            f'{mark_spam_btn}'
            f'<form method="post" action="/api/admin/submissions/delete/{r["id"]}" '
            f"onsubmit=\"return confirm('ลบรายการ #{r['id']} ถาวร?')\">"
            f'<button type="submit" class="del-btn">ลบ</button></form>'
            f'</div></td>'
            "</tr>"
            f'<tr class="detail" id="d{r["id"]}" style="display:none"><td colspan="8"><div class="inner">'
            f'<div><span>ชื่อ</span>{_esc(r["name"]) or "—"}</div>'
            f'<div><span>อีเมล</span>{_esc(r["email"]) or "—"}</div>'
            f'<div><span>โทรศัพท์</span>{_esc(r["phone"]) or "—"}</div>'
            f'<div><span>หน่วยงาน</span>{_esc(r["organization"]) or "—"}</div>'
            f'<div><span>หัวข้อ/ประเภท</span>{_esc(r["subject"]) or "—"}</div>'
            f'<div><span>IP</span>{_esc(r["ip"]) or "—"}</div>'
            + spam_reason_row
            + f'<div style="grid-column:1/-1"><span>ข้อความ</span>{_esc(msg) or "—"}</div>'
            "</div></td></tr>"
        )

    def seg(label, key, href):
        active_key = kind if (kind in SUBMISSION_KINDS or kind == "spam") else "all"
        on = "on" if (key == active_key) else ""
        return f'<a class="{on}" href="{href}">{label}</a>'

    export_q = ("?kind=" + kind) if kind in SUBMISSION_KINDS else ""
    table = (
        "".join(body)
        if body
        else '<tr><td colspan="8"><div class="empty">ยังไม่มีข้อมูล</div></td></tr>'
    )

    purge_btn = (
        f'<form method="post" action="/api/admin/submissions/rescan" style="display:inline">'
        f'<button type="submit" class="btn btn-ghost">🔍 สแกนสแปมใหม่</button></form>'
        f'<form method="post" action="/api/admin/submissions/purgespam" style="display:inline"'
        f" onsubmit=\"return confirm('ลบสแปมทั้งหมด ({counts['spam']} รายการ) ถาวร?')\">"
        f'<button type="submit" class="btn" style="background:#c0392b;color:#fff;border:0">'
        f'🗑 ลบสแปมทั้งหมด ({counts["spam"]})</button></form>'
    ) if counts["spam"] > 0 else (
        f'<form method="post" action="/api/admin/submissions/rescan" style="display:inline">'
        f'<button type="submit" class="btn btn-ghost">🔍 สแกนสแปมใหม่</button></form>'
    )

    registry_banner = ""

    actions = (
        f'{purge_btn}'
        f'<a class="btn btn-gold" href="/api/admin/submissions/export.csv{export_q}">'
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/>'
        '<line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV</a>'
    )
    top, bottom = _admin_shell(
        "forms", "แบบฟอร์มอื่น ๆ",
        breadcrumb=(("/api/admin", "หน้าหลัก"), ("/api/admin/submissions", "แบบฟอร์มอื่น ๆ")),
        desc="คำขอฝึกอบรม · ข้อความติดต่อ · ใบสมัครสมาชิก · สแปม",
        actions=actions,
    )
    return f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TSAE Admin · แบบฟอร์มอื่น ๆ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{PAGE_CSS}</style></head><body>
{top}
  <div class="stats">
    <div class="stat green">
      <div class="top"><span class="k">ทั้งหมด</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2m-6 9l2 2 4-4"/></svg></span></div>
      <div class="v">{counts['all']}</div>
      <div class="trend flat">รวมทุกแบบฟอร์ม</div>
    </div>
    <div class="stat blue">
      <div class="top"><span class="k">ฝึกอบรม</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0v6m-9-5l9 5 9-5"/></svg></span></div>
      <div class="v">{counts['training']}</div>
      <div class="trend flat">แจ้งความสนใจ</div>
    </div>
    <div class="stat blue">
      <div class="top"><span class="k">ติดต่อ</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></span></div>
      <div class="v">{counts['contact']}</div>
      <div class="trend flat">ข้อความติดต่อ</div>
    </div>
    <div class="stat gold">
      <div class="top"><span class="k">ใบสมัครสมาชิก</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg></span></div>
      <div class="v"><a href="/api/admin/members?tab=applications" style="color:inherit;text-decoration:none">{counts['membership']}</a></div>
      <div class="trend flat">รอตรวจ · อนุมัติแล้ว</div>
    </div>
    <div class="stat red">
      <div class="top"><span class="k">สแปม</span>
        <span class="ico"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 015.636 5.636"/></svg></span></div>
      <div class="v">{counts['spam']}</div>
      <div class="trend flat">ถูก flag แล้ว</div>
    </div>
  </div>
  <div class="toolbar">
    <div class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="q" placeholder="ค้นหา ชื่อ / อีเมล / หน่วยงาน / หัวข้อ / ข้อความ…" oninput="flt()">
    </div>
    <div class="seg">
      {seg('ทั้งหมด','all','/api/admin/submissions')}
      {seg('ฝึกอบรม','training','/api/admin/submissions?kind=training')}
      {seg('ติดต่อ','contact','/api/admin/submissions?kind=contact')}
      {seg('สแปม','spam','/api/admin/submissions?kind=spam')}
    </div>
  </div>
  <div class="tablecard"><div class="table-wrap"><table>
    <thead><tr><th>#</th><th>วันที่</th><th>ประเภท</th><th>ชื่อ</th>
    <th>อีเมล / โทร</th><th>หัวข้อ/ประเภท</th><th>ข้อความ</th><th>จัดการ</th></tr></thead>
    <tbody id="tb">{table}</tbody>
  </table></div></div>
{bottom}
<script>
function tog(id){{var d=document.getElementById('d'+id);if(d)d.style.display=d.style.display==='none'?'table-row':'none';}}
function flt(){{var q=document.getElementById('q').value.toLowerCase().trim();
  document.querySelectorAll('#tb tr.main').forEach(function(tr){{
    var hit=!q||(tr.getAttribute('data-search')||'').indexOf(q)>-1;
    tr.style.display=hit?'table-row':'none';
    var d=document.getElementById('d'+tr.querySelector('td').textContent.replace('#',''));
    if(d&&!hit)d.style.display='none';
  }});}}
</script>
</body></html>"""


@app.get("/admin/submissions/export.csv")
def export_submissions_csv(_: str = Depends(require_admin), kind: str = "") -> StreamingResponse:
    con = db()
    if kind in SUBMISSION_KINDS:
        rows = con.execute(
            "SELECT * FROM submissions WHERE kind=? AND is_spam=0 ORDER BY id", (kind,)
        ).fetchall()
    else:
        rows = con.execute(
            "SELECT * FROM submissions WHERE is_spam=0 ORDER BY id"
        ).fetchall()
    con.close()

    buf = io.StringIO()
    buf.write("\ufeff")
    cols = [
        "id", "created_at", "kind", "name", "email", "phone",
        "organization", "subject", "message", "extra", "ip",
    ]
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([r[c] for c in cols])
    buf.seek(0)
    fname = f"tsae-submissions-{kind or 'all'}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/admin/submissions/file/{sid}/{idx}")
def admin_submission_file(sid: int, idx: int, _: str = Depends(require_admin)) -> Response:
    con = db()
    row = con.execute("SELECT extra FROM submissions WHERE id=?", (sid,)).fetchone()
    con.close()
    if not row or not row["extra"]:
        raise HTTPException(status_code=404, detail="no file")
    try:
        extra = json.loads(row["extra"])
        files = extra.get("files") or []
        item = files[idx]
    except Exception:
        raise HTTPException(status_code=404, detail="no file")

    rel = (item.get("stored_path") or "").lstrip("/")
    target = (UPLOAD_DIR / rel).resolve()
    if not str(target).startswith(str(UPLOAD_DIR.resolve())) or not target.exists():
        raise HTTPException(status_code=404, detail="file missing")
    filename = item.get("original_name") or target.name
    from members import file_download_response
    return file_download_response(target, filename, inline=True)


@app.post("/admin/submissions/delete/{sid}")
def admin_submission_delete(sid: int, request: Request):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    con = db()
    row = con.execute("SELECT kind, extra FROM submissions WHERE id=?", (sid,)).fetchone()
    kind = row["kind"] if row else ""
    _delete_submission_uploads(row["extra"] if row else "")
    con.execute("DELETE FROM submissions WHERE id=?", (sid,))
    con.commit()
    con.close()
    return RedirectResponse(_submissions_back_url(kind), status_code=303)


@app.post("/admin/submissions/markspam/{sid}")
def admin_mark_spam(sid: int, request: Request):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    con = db()
    row = con.execute("SELECT kind FROM submissions WHERE id=?", (sid,)).fetchone()
    kind = row["kind"] if row else ""
    con.execute(
        "UPDATE submissions SET is_spam=1, spam_reason=? WHERE id=?",
        ("manual", sid),
    )
    con.commit()
    con.close()
    return RedirectResponse(_submissions_back_url(kind), status_code=303)


@app.post("/admin/submissions/unspam/{sid}")
def admin_unspam(sid: int, request: Request):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    con = db()
    con.execute(
        "UPDATE submissions SET is_spam=0, spam_reason='' WHERE id=?",
        (sid,),
    )
    con.commit()
    con.close()
    return RedirectResponse("/api/admin/submissions?kind=spam", status_code=303)


@app.post("/admin/submissions/purgespam")
def admin_purge_spam(request: Request):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    con = db()
    con.execute("DELETE FROM submissions WHERE is_spam=1")
    con.commit()
    con.close()
    return RedirectResponse("/api/admin/submissions", status_code=303)


@app.post("/admin/submissions/rescan")
def admin_rescan_spam(request: Request):
    if not current_admin(request):
        return RedirectResponse("/api/admin/login", status_code=303)
    n = _rescan_spam_db()
    return RedirectResponse(f"/api/admin/submissions?kind=spam&rescanned={n}", status_code=303)


from members import configure as configure_members, router as members_router


@app.get("/admin/cms", include_in_schema=False)
@app.get("/admin/cms/", include_in_schema=False)
@app.get("/admin/cms/{legacy_path:path}", include_in_schema=False)
def legacy_cms_redirect(legacy_path: str = ""):
    """Send old CMS bookmarks to the single Pages CMS content system."""
    return RedirectResponse("https://cms.tsae.asia", status_code=308)


configure_members(
    db=db,
    esc=_esc,
    page_css=PAGE_CSS,
    admin_nav=_admin_nav,
    admin_shell=_admin_shell,
    current_admin=current_admin,
    require_admin=require_admin,
    secret_key=SECRET_KEY,
    data_dir=DATA_DIR,
    upload_dir=UPLOAD_DIR,
)
app.include_router(members_router)
