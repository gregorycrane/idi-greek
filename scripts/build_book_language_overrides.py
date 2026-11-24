#!/usr/bin/env python3
"""Build compact catalog-language corrections for quoting books.

Passim's track export stores its generated language as ``lang``.  The IDI
metadata also preserves the cataloged source language, which is more reliable
for historical-language distinctions such as Ancient Greek (grc) versus
Modern Greek (ell).  Only disagreements are emitted to keep the browser asset
small; missing source languages continue to use the generated value.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "assets" / "book-language-overrides.js"
ASSIGNMENT = re.compile(r"Object\.freeze\((\{.*\})\);", re.S)


def track_ids() -> set[str]:
    result = subprocess.run(
        ["rg", "--no-filename", "-o", r'"id"\s*:\s*"[^"]+"', "docs/quotes", "--glob", "tracks*.js"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return {
        match.group(1).upper()
        for match in re.finditer(r'"id"\s*:\s*"([^"]+)"', result.stdout)
    }


def load_overrides(metadata: Path) -> dict[str, str]:
    ids = track_ids()
    overrides = {}
    with gzip.open(metadata, "rt", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            book = (row.get("book") or "").upper()
            source_language = (row.get("language_src") or "").strip()
            generated_language = (row.get("language_gen") or "").strip()
            if book in ids and source_language and source_language != generated_language:
                overrides[book] = source_language
    return dict(sorted(overrides.items()))


def write_asset(overrides: dict[str, str]) -> None:
    payload = json.dumps(overrides, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(
        '(function () {\n  "use strict";\n'
        f"  window.PERSEUS_BOOK_LANGUAGE_OVERRIDES = Object.freeze({payload});\n"
        "}());\n",
        encoding="utf-8",
    )


def read_asset(path: Path = OUTPUT) -> dict[str, str]:
    match = ASSIGNMENT.search(path.read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"Could not read language overrides from {path}")
    return json.loads(match.group(1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "metadata",
        nargs="?",
        type=Path,
        default=Path("/Users/gcrane/github/idi-cites/idi-meta.csv.gz"),
    )
    args = parser.parse_args()
    overrides = load_overrides(args.metadata)
    write_asset(overrides)
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(overrides):,} catalog-language corrections")


if __name__ == "__main__":
    main()
