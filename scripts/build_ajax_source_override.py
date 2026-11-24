#!/usr/bin/env python3
"""Build the canonical Greek Ajax source used in place of the bad Latin export."""

import json
import re
from pathlib import Path
from xml.etree import ElementTree

from build_drama_viewers import milestone_numbers, resolve_boundaries


ROOT = Path(__file__).resolve().parents[1]
WORK_DIR = ROOT / "docs" / "quotes" / "tlg0011" / "tlg003"
TEI = Path(
    "/Users/gcrane/github/canonical-greekLit/data/tlg0011/tlg003/"
    "tlg0011.tlg003.perseus-grc2.xml"
)
NS = {"tei": "http://www.tei-c.org/ns/1.0"}


def line_text(element):
    return re.sub(r"\s+", " ", "".join(element.itertext())).strip()


def main():
    root = ElementTree.parse(TEI).getroot()
    lines = []
    text_parts = []
    offset = 0
    for element in root.findall(".//tei:l", NS):
        line_id = element.get("n")
        text = line_text(element)
        if not line_id or not text:
            continue
        start = offset
        text_parts.append(text)
        offset += len(text)
        lines.append({"id": line_id, "name": line_id, "start": start, "stop": offset - 1})
        text_parts.append("\n")
        offset += 1

    sequence = {"name": "Sophocles. Ajax", "data": "".join(text_parts).rstrip("\n")}
    structure = [{"id": "lines", "name": "lines", "style": "ac", "notes": lines}]
    (WORK_DIR / "canonical-sequence.js").write_text(
        "var sequence = " + json.dumps(sequence, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    (WORK_DIR / "canonical-structure.js").write_text(
        "var structure = " + json.dumps(structure, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    chunks = resolve_boundaries(lines, milestone_numbers(TEI))
    (WORK_DIR / "card-chunks.js").write_text(
        "window.cardChunks = " + json.dumps(chunks, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote canonical Ajax source with {len(lines):,} lines and {len(chunks)} cards")


if __name__ == "__main__":
    main()
