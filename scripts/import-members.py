#!/usr/bin/env python3
"""Import member registry xlsx -> members.json (+ optional SQLite sync)."""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("pip install openpyxl", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
OUT_PATHS = (
    ROOT / "src" / "data" / "members.json",
    ROOT / "server" / "registration" / "data" / "members.json",
)

TYPE_CODE = {
    "กิตติมศักดิ์": "ก.",
    "นิติบุคคล": "น.",
    "ภาคี": "ภ.",
    "สามัญ 1 ปี": "ส.",
    "สามัญตลอดชีพ": "ส.",
}

TYPE_EN = {
    "กิตติมศักดิ์": "Honorary",
    "นิติบุคคล": "Corporate",
    "ภาคี": "Associate",
    "สามัญ 1 ปี": "Ordinary (1 year)",
    "สามัญตลอดชีพ": "Ordinary (lifetime)",
}


def norm(s) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s).strip())


def is_active(expiry: str) -> bool:
    e = expiry.lower()
    if "สิ้นสมาชิก" in e or "หมดอายุ" in e:
        return False
    return True


def type_code_for(code: str, mtype: str) -> str:
    if code and "." in code:
        return code.split(".", 1)[0] + "."
    return TYPE_CODE.get(mtype, "")


def parse_xlsx(src: Path) -> list[dict]:
    wb = openpyxl.load_workbook(src, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))[1:]
    wb.close()

    members = []
    for row in rows:
        mtype, code, name, contact, email, phone, expiry = (row + (None,) * 7)[:7]
        mtype = norm(mtype)
        code = norm(code)
        name = norm(name)
        if not code and not name:
            continue
        expiry = norm(expiry)
        members.append({
            "code": code,
            "type": mtype,
            "typeCode": type_code_for(code, mtype),
            "typeEN": TYPE_EN.get(mtype, mtype),
            "name": name,
            "contact": norm(contact),
            "email": norm(email).lower() if email else "",
            "phone": norm(phone),
            "expiry": expiry,
            "active": is_active(expiry),
        })
    members.sort(key=lambda m: m["code"])
    return members


def write_json(members: list[dict]) -> None:
    payload = json.dumps(members, ensure_ascii=False, indent=0)
    for out in OUT_PATHS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"wrote {len(members)} members -> {out}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sync_sqlite(members: list[dict], db_path: Path) -> dict:
    """Full sync: upsert all members, remove codes not in file, keep passwords."""
    codes = {m["code"] for m in members if m.get("code")}
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    passwords = {
        r["code"]: r["password_hash"]
        for r in con.execute(
            "SELECT code, password_hash FROM members "
            "WHERE password_hash IS NOT NULL AND password_hash != ''"
        )
    }

    removed = 0
    for row in con.execute("SELECT id, code FROM members"):
        if row["code"] not in codes:
            con.execute("DELETE FROM member_files WHERE member_id=?", (row["id"],))
            con.execute("DELETE FROM members WHERE id=?", (row["id"],))
            removed += 1

    upserted = 0
    now = _now()
    for m in members:
        code = (m.get("code") or "").strip()
        if not code:
            continue
        expiry = m.get("expiry") or ""
        active = 1 if m.get("active", is_active(expiry)) else 0
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
                now,
                now,
            ),
        )
        upserted += 1

    restored = 0
    for code, pwd in passwords.items():
        if code in codes:
            con.execute("UPDATE members SET password_hash=? WHERE code=?", (pwd, code))
            restored += 1

    total = con.execute("SELECT COUNT(*) c FROM members").fetchone()["c"]
    active_n = con.execute("SELECT COUNT(*) c FROM members WHERE active=1").fetchone()["c"]
    con.commit()
    con.close()
    return {
        "upserted": upserted,
        "removed": removed,
        "passwords_restored": restored,
        "total": total,
        "active": active_n,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Import TSAE member xlsx")
    parser.add_argument("xlsx", nargs="?", help="Path to xlsx file")
    parser.add_argument(
        "--sync-db",
        metavar="PATH",
        help="Sync imported data into SQLite (e.g. /data/registrations.db)",
    )
    args = parser.parse_args()

    src = Path(args.xlsx) if args.xlsx else Path.home() / "Downloads" / "รายชื่อสมาชิกสมาคม.xlsx"
    if not src.exists():
        print(f"file not found: {src}", file=sys.stderr)
        sys.exit(1)

    members = parse_xlsx(src)
    write_json(members)

    if args.sync_db:
        stats = sync_sqlite(members, Path(args.sync_db))
        print(
            f"synced db: {stats['upserted']} upserted, {stats['removed']} removed, "
            f"{stats['passwords_restored']} passwords kept, "
            f"{stats['total']} total ({stats['active']} active)"
        )


if __name__ == "__main__":
    main()
