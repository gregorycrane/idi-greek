#!/usr/bin/env python3
"""Build the GitHub Pages catalog for every Greek and Latin reuse work."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "catalog.json"
NAME_PATTERN = re.compile(r'"name"\s*:\s*("(?:[^"\\]|\\.)*")\s*,\s*"data"')
CORPORA = (
    {
        "id": "greek",
        "quotes": ROOT / "docs" / "quotes",
        "namespace": "greekLit",
        "language": "grc",
        "languageName": "Greek",
        "teiRepository": "canonical-greekLit",
        "dataRepository": "idi-greek",
    },
    {
        "id": "latin",
        "quotes": ROOT.parent / "idi-latin" / "docs" / "quotes",
        "namespace": "latinLit",
        "language": "lat",
        "languageName": "Latin",
        "teiRepository": "canonical-latinLit",
        "dataRepository": "idi-latin",
    },
)


def sequence_name(path: Path) -> str:
    with path.open(encoding="utf-8", errors="replace") as source:
        opening = source.read(8192)
    match = NAME_PATTERN.search(opening)
    return json.loads(match.group(1)) if match else path.parent.name


def split_name(name: str, corpus_name: str):
    if ". " in name:
        author, title = name.split(". ", 1)
    else:
        author, title = f"{corpus_name} literature", name
    return author.strip(), title.strip()


def track_sort(path: Path):
    match = re.search(r"(\d+)$", path.stem)
    return int(match.group(1)) if match else 0


def has_nested_structure(path: Path) -> bool:
    source = path.read_text(encoding="utf-8", errors="replace")
    value = source[source.index("=") + 1 :].strip().rstrip(";")
    structure = json.loads(value)
    return bool(structure and any(note.get("children") for note in structure[0].get("notes", [])))


def main():
    works = []
    corpus_counts = {}
    for corpus in CORPORA:
        if not corpus["quotes"].exists():
            raise FileNotFoundError(f'Missing {corpus["languageName"]} reuse data: {corpus["quotes"]}')
        corpus_start = len(works)
        for work_dir in sorted(corpus["quotes"].glob("*/*")):
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
            author, title = split_name(name, corpus["languageName"])
            has_cards = (work_dir / "card-chunks.js").exists()
            nested_structure = has_nested_structure(structure_path)
            item = {
                "id": f"{author_id}.{work_id}",
                "corpus": corpus["id"],
                "sourceLanguage": corpus["language"],
                "sourceLanguageName": corpus["languageName"],
                "dataRepository": corpus["dataRepository"],
                "authorId": author_id,
                "workId": work_id,
                "author": author,
                "title": title,
                "name": name,
                "urn": f'urn:cts:{corpus["namespace"]}:{author_id}.{work_id}',
                "tei": f'https://github.com/PerseusDL/{corpus["teiRepository"]}/tree/master/data/{author_id}/{work_id}',
                "trackFiles": [path.name for path in track_paths],
                "sequenceFile": sequence_file,
                "structureFile": structure_file,
                "hasCards": has_cards,
                "chunkTerm": "card" if has_cards else None,
                "parentTerm": "book" if has_cards and nested_structure else None,
                "unitTerm": "line" if has_cards else None,
            }
            if item["id"] == "tlg0086.tlg034":
                item.update(chunkTerm="subsection", parentTerm="chapter", unitTerm="section")
            if override.get("dataNotice"):
                item["dataNotice"] = override["dataNotice"]
            if override.get("dataVersion"):
                item["dataVersion"] = override["dataVersion"]
            works.append(item)
        corpus_counts[corpus["id"]] = len(works) - corpus_start

    works.sort(key=lambda item: (item["author"].casefold(), item["title"].casefold(), item["id"]))
    payload = {
        "workCount": len(works),
        "cardWorkCount": sum(item["hasCards"] for item in works),
        "corpusCounts": corpus_counts,
        "works": works,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(works)} works ({payload['cardWorkCount']} with cards)")


if __name__ == "__main__":
    main()
