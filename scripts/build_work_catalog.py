#!/usr/bin/env python3
"""Build the GitHub Pages catalog for every work with text-reuse data."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUOTES = ROOT / "docs" / "quotes"
OUTPUT = ROOT / "docs" / "catalog.json"
NAME_PATTERN = re.compile(r'"name"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"data"')


def sequence_name(path: Path) -> str:
    with path.open(encoding="utf-8", errors="replace") as source:
        opening = source.read(8192)
    match = NAME_PATTERN.search(opening)
    return json.loads(match.group(1)) if match else path.parent.name


def split_name(name: str):
    if ". " in name:
        author, title = name.split(". ", 1)
    else:
        author, title = "Greek literature", name
    return author.strip(), title.strip()


def track_sort(path: Path):
    match = re.search(r"(\d+)$", path.stem)
    return int(match.group(1)) if match else 0


def main():
    works = []
    for work_dir in sorted(QUOTES.glob("*/*")):
        if not work_dir.is_dir():
            continue
        override_path = work_dir / "source-override.json"
        override = json.loads(override_path.read_text()) if override_path.exists() else {}
        sequence_file = override.get("sequenceFile", "sequence.js")
        structure_file = override.get("structureFile", "structure.js")
        sequence_path = work_dir / sequence_file
        structure_path = work_dir / structure_file
        track_files = override.get("trackFiles")
        track_paths = (
            [work_dir / name for name in track_files]
            if track_files is not None
            else sorted(work_dir.glob("tracks*.js"), key=track_sort)
        )
        if not sequence_path.exists() or not structure_path.exists() or (not track_paths and not override):
            continue

        author_id = work_dir.parent.name
        work_id = work_dir.name
        name = sequence_name(sequence_path)
        author, title = split_name(name)
        has_cards = (work_dir / "card-chunks.js").exists()
        item = {
            "id": f"{author_id}.{work_id}",
            "authorId": author_id,
            "workId": work_id,
            "author": author,
            "title": title,
            "name": name,
            "urn": f"urn:cts:greekLit:{author_id}.{work_id}",
            "tei": "https://github.com/PerseusDL/canonical-greekLit/tree/master/data/" f"{author_id}/{work_id}",
            "trackFiles": [path.name for path in track_paths],
            "sequenceFile": sequence_file,
            "structureFile": structure_file,
            "hasCards": has_cards,
            "chunkTerm": "card" if has_cards else None,
            "parentTerm": "book" if has_cards and author_id == "tlg0012" else None,
            "unitTerm": "line" if has_cards else None,
        }
        if item["id"] == "tlg0086.tlg034":
            item.update(chunkTerm="subsection", parentTerm="chapter", unitTerm="section")
        if override.get("dataNotice"):
            item["dataNotice"] = override["dataNotice"]
        if override.get("dataVersion"):
            item["dataVersion"] = override["dataVersion"]
        works.append(item)

    works.sort(key=lambda item: (item["author"].casefold(), item["title"].casefold(), item["id"]))
    payload = {"workCount": len(works), "cardWorkCount": sum(item["hasCards"] for item in works), "works": works}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(works)} works ({payload['cardWorkCount']} with cards)")


if __name__ == "__main__":
    main()
