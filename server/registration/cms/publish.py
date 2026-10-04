"""Queue a static-site rebuild after CMS edits (server-side Astro publish)."""
from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

FLAG_NAME = ".needs_publish"
STATUS_NAME = ".publish.status"
LOG_NAME = ".publish.log"


def _cms_root(data_dir: Path) -> Path:
    return Path(data_dir) / "cms"


def request_publish(data_dir: Path, reason: str = "") -> dict:
    """Ask the host publisher to rebuild the public site."""
    root = _cms_root(data_dir)
    root.mkdir(parents=True, exist_ok=True)
    flag = root / FLAG_NAME
    note = reason.strip() or "cms-save"
    flag.write_text(f"{int(time.time())}\n{note}\n", encoding="utf-8")

    # Optional direct command (host script mounted into container)
    cmd = os.getenv("CMS_PUBLISH_CMD", "").strip()
    started = False
    if cmd:
        try:
            subprocess.Popen(  # noqa: S603
                cmd if isinstance(cmd, list) else ["bash", "-lc", cmd],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            started = True
        except OSError:
            started = False

    return {
        "queued": True,
        "started": started,
        "reason": note,
        "hint": "หน้าเว็บจะอัปเดตในไม่กี่วินาทีหลัง build เสร็จ",
    }


def publish_status(data_dir: Path) -> dict:
    root = _cms_root(data_dir)
    flag = root / FLAG_NAME
    status_file = root / STATUS_NAME
    log_file = root / LOG_NAME
    status = "idle"
    if status_file.exists():
        status = status_file.read_text(encoding="utf-8").strip() or "idle"
    if flag.exists() and status not in ("running",):
        status = "queued"
    log_tail = ""
    if log_file.exists():
        try:
            lines = log_file.read_text(encoding="utf-8", errors="replace").splitlines()
            log_tail = "\n".join(lines[-30:])
        except OSError:
            log_tail = ""
    return {
        "status": status,
        "queued": flag.exists(),
        "log": log_tail,
    }
