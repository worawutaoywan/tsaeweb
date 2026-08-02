#!/usr/bin/env python3
"""Download /wp-uploads/ files from old.tsae.asia over HTTPS (when SSH rsync unavailable)."""
from __future__ import annotations

import ssl
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "wp-uploads"
OLD_BASE = os.environ.get("TSAE_OLD_UPLOADS_URL", "https://old.tsae.asia/wp-content/uploads")
WORKERS = int(os.environ.get("SYNC_WORKERS", "16"))
SSL_CTX = ssl.create_default_context()
if os.environ.get("TSAE_INSECURE_SSL") == "1":
    SSL_CTX.check_hostname = False
    SSL_CTX.verify_mode = ssl.CERT_NONE


def collect_paths() -> set[str]:
    paths: set[str] = set()

    news_path = ROOT / "data/cms/news.json"
    if news_path.exists():
        items = json.loads(news_path.read_text(encoding="utf-8"))
        for item in items:
            img = item.get("image")
            if img and "/wp-uploads/" in img:
                paths.add(img.split("?")[0])
            html = item.get("html") or ""
            for m in re.findall(r'(/wp-uploads/[^\s"\'<>]+)', html):
                p = m.split("?")[0]
                if len(os.path.basename(p)) < 200:
                    paths.add(p)

    r = subprocess.run(
        ["rg", "-o", r'/wp-uploads/[^"\']+', "src", "public"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    for line in r.stdout.splitlines():
        paths.add(line.split("?")[0])

    return paths


def encode_url_path(sub: str) -> str:
    return "/".join(quote(part, safe="") for part in sub.split("/"))


def download_one(rel: str) -> tuple[str, bool, str]:
    """rel like /wp-uploads/2025/05/foo.png"""
    sub = rel.removeprefix("/wp-uploads/").lstrip("/")
    dest = OUT / sub
    if dest.exists() and dest.stat().st_size > 0:
        return rel, True, "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"{OLD_BASE}/{encode_url_path(sub)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "TSAE-migrate/1.0"})
        with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as resp:
            data = resp.read()
        if len(data) < 50:
            return rel, False, "empty"
        dest.write_bytes(data)
        return rel, True, "ok"
    except urllib.error.HTTPError as e:
        return rel, False, f"HTTP {e.code}"
    except Exception as e:
        return rel, False, str(e)[:80]


def main() -> int:
    paths = sorted(collect_paths())
    print(f"paths to sync: {len(paths)}")
    print(f"destination: {OUT}")
    ok = skip = fail = 0
    failed: list[str] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(download_one, p): p for p in paths}
        for i, fut in enumerate(as_completed(futures), 1):
            rel, success, msg = fut.result()
            if msg == "skip":
                skip += 1
            elif success:
                ok += 1
            else:
                fail += 1
                if fail <= 20:
                    failed.append(f"{rel} ({msg})")
            if i % 50 == 0 or i == len(paths):
                print(f"  {i}/{len(paths)} ok={ok} skip={skip} fail={fail}")

    if failed:
        print("\nfirst failures:")
        for f in failed:
            print(" ", f)
    print(f"\ndone: ok={ok} skip={skip} fail={fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
