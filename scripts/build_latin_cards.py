#!/usr/bin/env python3
"""Build Perseus card boundaries for Latin reuse works from canonical TEI."""

import json
import re
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
LATIN_QUOTES = ROOT.parent / "idi-latin" / "docs" / "quotes"
CANONICAL = ROOT.parent / "canonical-latinLit" / "data"
NS = {"tei": "http://www.tei-c.org/ns/1.0"}


def load_js_value(path: Path):
    source = path.read_text(encoding="utf-8")
    value = source[source.index("=") + 1 :].strip().rstrip(";")
    return json.loads(value)


def numeric_prefix(value):
    match = re.search(r"-?\d+", str(value))
    return int(match.group()) if match else None


def resolve_boundaries(lines, milestones):
    if not lines or not milestones:
        return []
    boundaries = []
    previous = -1
    for position, card_id in enumerate(milestones):
        wanted = numeric_prefix(card_id)
        if position == 0:
            index = 0
        else:
            index = next(
                (
                    candidate
                    for candidate in range(previous + 1, len(lines))
                    if numeric_prefix(lines[candidate]["name"]) is not None
                    and numeric_prefix(lines[candidate]["name"]) >= wanted
                ),
                -1,
            )
        if index < 0 or index <= previous:
            continue
        boundaries.append((str(card_id), index))
        previous = index

    chunks = []
    for position, (card_id, first) in enumerate(boundaries):
        last = boundaries[position + 1][1] - 1 if position + 1 < len(boundaries) else len(lines) - 1
        if first <= last:
            chunks.append((card_id, lines[first], lines[last]))
    return chunks


def milestone_numbers(element):
    return [
        milestone.get("n")
        for milestone in element.findall('.//tei:milestone[@unit="card"]', NS)
        if milestone.get("n")
    ]


def canonical_tei(author_id, work_id):
    candidates = sorted((CANONICAL / author_id / work_id).glob(f"{author_id}.{work_id}.perseus-lat*.xml"))
    scored = []
    for path in candidates:
        source = path.read_text(encoding="utf-8", errors="ignore")
        count = len(re.findall(r'<milestone\b[^>]*\bunit=["\']card["\']', source))
        if count:
            scored.append((count, path))
    return max(scored, default=(0, None))[1]


def build_work(work_dir: Path, tei_path: Path):
    structure = load_js_value(work_dir / "structure.js")[0]["notes"]
    root = ElementTree.parse(tei_path).getroot()
    nested = any(unit.get("children") for unit in structure)
    chunks = []

    if nested:
        divisions = root.findall(".//tei:div", NS)
        for unit in structure:
            lines = unit.get("children") or []
            matching = [
                division for division in divisions
                if str(division.get("n")) == str(unit["id"]) and milestone_numbers(division)
            ]
            if not matching:
                continue
            division = max(matching, key=lambda item: len(item.findall(".//tei:l", NS)))
            for _card, first, last in resolve_boundaries(lines, milestone_numbers(division)):
                chunks.append([unit["id"], first["name"], last["name"]])
    else:
        for card_id, first, last in resolve_boundaries(structure, milestone_numbers(root)):
            chunks.append([card_id, first["id"], last["id"]])

    if not chunks:
        return 0
    output = work_dir / "card-chunks.js"
    output.write_text(
        "// Perseus card boundaries from the canonical Latin TEI.\n"
        "window.cardChunks = " + json.dumps(chunks, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    return len(chunks)


def main():
    built = []
    for structure_path in sorted(LATIN_QUOTES.glob("*/*/structure.js")):
        work_dir = structure_path.parent
        author_id = work_dir.parent.name
        work_id = work_dir.name
        tei_path = canonical_tei(author_id, work_id)
        if not tei_path:
            continue
        count = build_work(work_dir, tei_path)
        if count:
            built.append((author_id, work_id, count))
            print(f"{author_id}.{work_id}: {count:,} cards")
    print(f"Built card boundaries for {len(built)} Latin works ({sum(item[2] for item in built):,} cards)")


if __name__ == "__main__":
    main()
