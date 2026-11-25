#!/usr/bin/env python3
"""Build compact corpus-wide statistics for the GitHub Pages homepage.

The edition thresholds mirror docs/viewer/universal-reuse-viewer.js. Rankings
therefore describe quotation-like reuse, not books classified as editions.
"""

from __future__ import annotations

import bisect
import heapq
import json
import multiprocessing
import os
import re
import unicodedata
from collections import defaultdict, deque
from pathlib import Path

from language_names import language_name
from build_book_language_overrides import read_asset


ROOT = Path(__file__).resolve().parents[1]
QUOTE_ROOTS = {
    "greek": ROOT / "docs" / "quotes",
    "latin": ROOT.parent / "idi-latin" / "docs" / "quotes",
}
CATALOG = ROOT / "docs" / "catalog.json"
OUTPUT = ROOT / "docs" / "statistics.json"
ASSIGNMENT = re.compile(r"^\s*var\s+\w+\s*=\s*", re.S)
TOKEN = re.compile(r"\S+", re.UNICODE)
MATCH_LENGTHS = (3, 5)
RANK_LIMIT = 12
LANGUAGE_RANK_LIMIT = 100
PHRASE_WORK_FLOOR = 100
RELATIVE_WORK_MIN_WORDS = 1000
RELATIVE_AUTHOR_MIN_WORDS = 5000
NEW_TESTAMENT_AUTHOR = "New Testament"
SOURCE_TOKEN_PATTERNS = {
    "greek": re.compile(r"[\u0370-\u03ff\u1f00-\u1fff]"),
    "latin": re.compile(r"[A-Za-z\u00c0-\u024f\u1e00-\u1eff]"),
}
BOOK_LANGUAGE_OVERRIDES = read_asset()

EDITION_HEURISTICS = {
    "wholeWorkCoverage": 0.6,
    "wholeWorkStart": 0.05,
    "wholeWorkEnd": 0.95,
    "densePartialCoverage": 0.1,
    "densePartialNotes": 250,
    "pageBlockCoverage": 0.05,
    "pageBlockNotes": 50,
    "pageBlockMedianCharacters": 500,
}


def load_assignment(path: Path):
    value = ASSIGNMENT.sub("", path.read_text(encoding="utf-8", errors="replace"), count=1).strip()
    if value.endswith(";"):
        value = value[:-1]
    return json.loads(value)


def track_sort(path: Path):
    match = re.search(r"(\d+)$", path.stem)
    return int(match.group(1)) if match else 0


def is_edition(notes, text_length: int) -> bool:
    spans = sorted((max(0, note["start"]), min(text_length - 1, note["stop"])) for note in notes)
    if not spans or text_length <= 0:
        return False
    covered = 0
    current_start, current_stop = spans[0]
    for start, stop in spans[1:]:
        if start <= current_stop + 1:
            current_stop = max(current_stop, stop)
        else:
            covered += current_stop - current_start + 1
            current_start, current_stop = start, stop
    covered += current_stop - current_start + 1
    coverage = covered / text_length
    first = spans[0][0] / text_length
    last = max(stop for _, stop in spans) / text_length
    lengths = sorted(stop - start + 1 for start, stop in spans)
    median = lengths[len(lengths) // 2]
    whole_work = (
        coverage >= EDITION_HEURISTICS["wholeWorkCoverage"]
        and first <= EDITION_HEURISTICS["wholeWorkStart"]
        and last >= EDITION_HEURISTICS["wholeWorkEnd"]
    )
    dense_partial = (
        coverage >= EDITION_HEURISTICS["densePartialCoverage"]
        and len(spans) >= EDITION_HEURISTICS["densePartialNotes"]
    )
    page_blocks = (
        coverage >= EDITION_HEURISTICS["pageBlockCoverage"]
        and len(spans) >= EDITION_HEURISTICS["pageBlockNotes"]
        and median >= EDITION_HEURISTICS["pageBlockMedianCharacters"]
    )
    return whole_work or dense_partial or page_blocks


def flatten_units(nodes):
    result = []
    for node in nodes:
        children = node.get("children", [])
        if children:
            result.extend(flatten_units(children))
        else:
            result.append(node)
    return result


def citation_for(work_dir: Path, offset: int) -> str:
    try:
        structure = load_assignment(work_dir / "structure.js")
        leaves = flatten_units(structure[0].get("notes", []))
        starts = [unit["start"] for unit in leaves]
        index = max(0, bisect.bisect_right(starts, offset) - 1)
        return str(leaves[index]["id"])
    except (OSError, ValueError, KeyError, IndexError, json.JSONDecodeError):
        return ""


class Fenwick:
    def __init__(self, size: int):
        self.values = [0] * (size + 1)

    def add(self, index: int):
        index += 1
        while index < len(self.values):
            self.values[index] += 1
            index += index & -index

    def prefix(self, end: int) -> int:
        total = 0
        while end:
            total += self.values[end]
            end -= end & -end
        return total


def exact_phrase_support(candidates, notes):
    """Count intervals that fully contain each candidate phrase."""
    if not candidates or not notes:
        return []
    stops = sorted({stop for _, stop in notes})
    ordered_notes = sorted(notes)
    indexed_queries = sorted(enumerate(candidates), key=lambda item: item[1][0])
    tree = Fenwick(len(stops))
    inserted = 0
    answers = [0] * len(candidates)
    for candidate_index, (start, stop, *_rest) in indexed_queries:
        while inserted < len(ordered_notes) and ordered_notes[inserted][0] <= start:
            tree.add(bisect.bisect_left(stops, ordered_notes[inserted][1]))
            inserted += 1
        before_stop = tree.prefix(bisect.bisect_left(stops, stop))
        answers[candidate_index] = inserted - before_stop
    return answers


def strongest_phrase_candidates(tokens, notes, phrase_length: int, source_token):
    if len(tokens) < phrase_length or not notes:
        return []
    starts = [item[1] for item in tokens]
    stops = [item[2] for item in tokens]
    changes = [0] * (len(tokens) + 1)
    for start, stop in notes:
        first = bisect.bisect_left(starts, start)
        after_last = bisect.bisect_left(stops, stop + 1)
        if first < after_last:
            changes[first] += 1
            changes[after_last] -= 1
    coverage = []
    running = 0
    for change in changes[:-1]:
        running += change
        coverage.append(running)

    candidates = {}
    window = deque()
    strongest = []
    for index, value in enumerate(coverage):
        while window and coverage[window[-1]] >= value:
            window.pop()
        window.append(index)
        first = index - phrase_length + 1
        while window and window[0] < first:
            window.popleft()
        if first < 0:
            continue
        if not all(source_token.search(tokens[token_index][0]) for token_index in range(first, first + phrase_length)):
            continue
        support = coverage[window[0]]
        if not support:
            continue
        item = (support, first)
        if len(strongest) < 32:
            heapq.heappush(strongest, item)
        elif item > strongest[0]:
            heapq.heapreplace(strongest, item)
    for support, first in strongest:
        start = tokens[first][1]
        stop = tokens[first + phrase_length - 1][2]
        candidates[(start, stop)] = (start, stop, phrase_length, support)
    return list(candidates.values())


def top_phrases(work, work_dir: Path, text: str, tokens, notes, phrase_length: int, source_token):
    candidates = strongest_phrase_candidates(tokens, notes, phrase_length, source_token)
    support = exact_phrase_support(candidates, notes)
    ranked = []
    for candidate, passages in zip(candidates, support):
        if not passages:
            continue
        start, stop, word_count, _approximate = candidate
        ranked.append({
            "workId": work["id"],
            "corpus": work["corpus"],
            "author": work["author"],
            "title": work["title"],
            "text": unicodedata.normalize("NFC", text[start : stop + 1].strip().replace("\n", " ")),
            "passages": passages,
            "wordCount": word_count,
            "start": start,
            "stop": stop,
            "passage": citation_for(work_dir, start),
        })
    ranked.sort(key=lambda item: (-item["passages"], -item["wordCount"], item["start"]))
    accepted = []
    for candidate in ranked:
        duplicate = False
        for prior in accepted:
            intersection = max(0, min(candidate["stop"], prior["stop"]) - max(candidate["start"], prior["start"]) + 1)
            shorter = min(candidate["stop"] - candidate["start"] + 1, prior["stop"] - prior["start"] + 1)
            if shorter and intersection / shorter >= 0.65:
                duplicate = True
                break
        if not duplicate:
            accepted.append(candidate)
        if len(accepted) >= 4:
            break
    return accepted


def ranked_items(items, relative=False, limit=RANK_LIMIT):
    key = (lambda item: (-item["quotesPerThousandWords"], -item["quotationCount"], item["title"])) if relative else (
        lambda item: (-item["quotationCount"], -item["quotesPerThousandWords"], item["title"])
    )
    ranked = sorted(items, key=key)
    return ranked if limit is None else ranked[:limit]


def quotation_tracks(work, text_length: int):
    work_dir = QUOTE_ROOTS[work["corpus"]] / work["authorId"] / work["workId"]
    merged_tracks = {}
    for path in (work_dir / name for name in work.get("trackFiles", [])):
        for track in load_assignment(path):
            existing = merged_tracks.setdefault(track["id"], {**track, "notes": []})
            existing["notes"].extend(track.get("notes", []))
    quotations = []
    editions = []
    for track in merged_tracks.values():
        (editions if is_edition(track["notes"], text_length) else quotations).append(track)
    return quotations, editions


def analyze_work(work):
    work_dir = QUOTE_ROOTS[work["corpus"]] / work["authorId"] / work["workId"]
    source_token = SOURCE_TOKEN_PATTERNS[work["corpus"]]
    text = load_assignment(work_dir / work.get("sequenceFile", "sequence.js")).get("data", "")
    tokens = [(match.group(0), match.start(), match.end() - 1) for match in TOKEN.finditer(text)]
    quotations, editions = quotation_tracks(work, len(text))
    starts = [token[1] for token in tokens]
    stops = [token[2] for token in tokens]
    source_word_prefix = [0]
    for token, _start, _stop in tokens:
        source_word_prefix.append(source_word_prefix[-1] + int(bool(source_token.search(token))))

    notes_by_length = {length: [] for length in MATCH_LENGTHS}
    book_ids_by_length = {length: [] for length in MATCH_LENGTHS}
    languages_by_length = {
        length: defaultdict(lambda: {"bookIds": set(), "quotationCount": 0, "books": {}})
        for length in MATCH_LENGTHS
    }
    for track in quotations:
        track_counts = {length: 0 for length in MATCH_LENGTHS}
        first_qualifying_note = {}
        for note in track["notes"]:
            start = max(0, note["start"])
            stop = min(len(text) - 1, note["stop"])
            first = bisect.bisect_left(starts, start)
            after_last = bisect.bisect_left(stops, stop + 1)
            source_words = source_word_prefix[after_last] - source_word_prefix[first]
            for length in MATCH_LENGTHS:
                if source_words >= length:
                    notes_by_length[length].append((start, stop))
                    track_counts[length] += 1
                    first_qualifying_note.setdefault(length, note)
        for length in MATCH_LENGTHS:
            if not track_counts[length]:
                continue
            book_id = str(track["id"])
            book_key = book_id.upper()
            book_ids_by_length[length].append(book_id)
            language = BOOK_LANGUAGE_OVERRIDES.get(book_key, track.get("lang") or "und")
            language_values = languages_by_length[length][language]
            language_values["bookIds"].add(book_id)
            language_values["quotationCount"] += track_counts[length]
            first_note = first_qualifying_note[length]
            language_values["books"][book_key] = {
                "id": book_id,
                "title": track.get("name") or book_id,
                "date": track.get("date") or "",
                "url": f'{track.get("base", "")}{first_note.get("url", "")}',
                "quotationCount": track_counts[length],
            }

    word_count = len(tokens)
    modes = {}
    for length in MATCH_LENGTHS:
        quotation_notes = notes_by_length[length]
        word_changes = [0] * (len(tokens) + 1)
        quoted_word_occurrences = 0
        for start, stop in quotation_notes:
            first = bisect.bisect_left(starts, start)
            after_last = bisect.bisect_left(stops, stop + 1)
            if first < after_last:
                quoted_word_occurrences += after_last - first
                word_changes[first] += 1
                word_changes[after_last] -= 1
        running = 0
        distinct_quoted_words = 0
        for change in word_changes[:-1]:
            running += change
            distinct_quoted_words += int(running > 0)

        quotation_count = len(quotation_notes)
        item = {
            "id": work["id"],
            "corpus": work["corpus"],
            "author": work["author"],
            "title": work["title"],
            "wordCount": word_count,
            "quotationCount": quotation_count,
            "quotesPerThousandWords": round(quotation_count / word_count * 1000, 2) if word_count else 0,
        }
        modes[str(length)] = {
            "item": item,
            "bookIds": book_ids_by_length[length],
            "languages": {
                code: {
                    "bookIds": sorted(values["bookIds"]),
                    "quotationCount": values["quotationCount"],
                    "books": list(values["books"].values()),
                }
                for code, values in languages_by_length[length].items()
            },
            "quotedWordOccurrences": quoted_word_occurrences,
            "distinctQuotedWords": distinct_quoted_words,
            "phrases": top_phrases(work, work_dir, text, tokens, quotation_notes, length, source_token)
            if quotation_count >= PHRASE_WORK_FLOOR else [],
        }
    return {
        "corpus": work["corpus"],
        "wordCount": word_count,
        "editionBooks": len(editions),
        "editionPassages": sum(len(track["notes"]) for track in editions),
        "modes": modes,
    }


def new_aggregate():
    return {
        "workStats": {str(length): [] for length in MATCH_LENGTHS},
        "authorTotals": {
            str(length): defaultdict(lambda: {"wordCount": 0, "quotationCount": 0, "workCount": 0})
            for length in MATCH_LENGTHS
        },
        "uniqueBooks": {str(length): set() for length in MATCH_LENGTHS},
        "languageBooks": {str(length): defaultdict(set) for length in MATCH_LENGTHS},
        "languageQuotations": {str(length): defaultdict(int) for length in MATCH_LENGTHS},
        "languageWorks": {str(length): defaultdict(list) for length in MATCH_LENGTHS},
        "languageBookTotals": {str(length): defaultdict(dict) for length in MATCH_LENGTHS},
        "globalPhrases": {str(length): [] for length in MATCH_LENGTHS},
        "modeTotals": {str(length): defaultdict(int) for length in MATCH_LENGTHS},
        "totals": defaultdict(int),
    }


def update_aggregate(aggregate, result):
    totals = aggregate["totals"]
    totals["wordCount"] += result["wordCount"]
    totals["editionBooks"] += result["editionBooks"]
    totals["editionPassages"] += result["editionPassages"]
    for length in MATCH_LENGTHS:
        key = str(length)
        mode = result["modes"][key]
        item = mode["item"]
        aggregate["workStats"][key].append(item)
        author = aggregate["authorTotals"][key][item["author"]]
        author["wordCount"] += item["wordCount"]
        author["quotationCount"] += item["quotationCount"]
        author["workCount"] += 1
        aggregate["modeTotals"][key]["quotationCount"] += item["quotationCount"]
        aggregate["modeTotals"][key]["quotedWordOccurrences"] += mode["quotedWordOccurrences"]
        aggregate["modeTotals"][key]["distinctQuotedWords"] += mode["distinctQuotedWords"]
        aggregate["uniqueBooks"][key].update(mode["bookIds"])
        for code, values in mode["languages"].items():
            aggregate["languageBooks"][key][code].update(values["bookIds"])
            aggregate["languageQuotations"][key][code] += values["quotationCount"]
            aggregate["languageWorks"][key][code].append({
                "id": item["id"],
                "corpus": item["corpus"],
                "author": item["author"],
                "title": item["title"],
                "quotationCount": values["quotationCount"],
                "bookCount": len(values["bookIds"]),
            })
            for book in values["books"]:
                book_key = str(book["id"]).upper()
                book_total = aggregate["languageBookTotals"][key][code].setdefault(book_key, {
                    **book,
                    "quotationCount": 0,
                    "workIds": set(),
                })
                book_total["quotationCount"] += book["quotationCount"]
                book_total["workIds"].add(item["id"])
        aggregate["globalPhrases"][key].extend(mode["phrases"])


def build_modes(aggregate):
    modes = {}
    totals = aggregate["totals"]
    for length in MATCH_LENGTHS:
        key = str(length)
        authors = []
        for name, values in aggregate["authorTotals"][key].items():
            authors.append({
                "author": name,
                **values,
                "quotesPerThousandWords": round(values["quotationCount"] / values["wordCount"] * 1000, 2) if values["wordCount"] else 0,
            })
        aggregate["globalPhrases"][key].sort(
            key=lambda item: (-item["passages"], -item["wordCount"], item["author"], item["title"])
        )
        quoting_languages = []
        for code, book_ids in aggregate["languageBooks"][key].items():
            top_works = sorted(
                aggregate["languageWorks"][key][code],
                key=lambda item: (-item["quotationCount"], -item["bookCount"], item["title"]),
            )[:LANGUAGE_RANK_LIMIT]
            top_books = []
            for book in aggregate["languageBookTotals"][key][code].values():
                book_item = {field: value for field, value in book.items() if field != "workIds"}
                book_item["workCount"] = len(book["workIds"])
                top_books.append(book_item)
            top_books.sort(key=lambda item: (-item["quotationCount"], -item["workCount"], item["title"]))
            quoting_languages.append({
                "code": code,
                "name": language_name(code),
                "bookCount": len(book_ids),
                "quotationCount": aggregate["languageQuotations"][key][code],
                "topWorks": top_works,
                "topBooks": top_books[:LANGUAGE_RANK_LIMIT],
            })
        quoting_languages.sort(key=lambda item: (-item["bookCount"], item["name"]))
        work_stats = aggregate["workStats"][key]
        mode_totals = aggregate["modeTotals"][key]
        modes[key] = {
            "label": "Higher recall" if length == 3 else "Higher precision",
            "matchWords": length,
            "totals": {
                "works": len(work_stats),
                "authors": len(aggregate["authorTotals"][key]),
                "wordCount": totals["wordCount"],
                "quotationCount": mode_totals["quotationCount"],
                "quotedWordOccurrences": mode_totals["quotedWordOccurrences"],
                "distinctQuotedWords": mode_totals["distinctQuotedWords"],
                "uniqueQuotingBooks": len(aggregate["uniqueBooks"][key]),
                "quotingLanguageCount": len(quoting_languages),
                "excludedEditionBooks": totals["editionBooks"],
                "excludedEditionPassages": totals["editionPassages"],
            },
            "worksAbsolute": ranked_items(work_stats, limit=None),
            "worksRelative": ranked_items([
                item for item in work_stats if item["wordCount"] >= RELATIVE_WORK_MIN_WORDS
            ], relative=True, limit=None),
            "worksRelativeWithoutNewTestament": ranked_items([
                item for item in work_stats
                if item["wordCount"] >= RELATIVE_WORK_MIN_WORDS and item["author"] != NEW_TESTAMENT_AUTHOR
            ], relative=True, limit=None),
            "authorsAbsolute": sorted(
                authors, key=lambda item: (-item["quotationCount"], -item["quotesPerThousandWords"], item["author"])
            )[:RANK_LIMIT],
            "authorsRelative": sorted(
                (item for item in authors if item["wordCount"] >= RELATIVE_AUTHOR_MIN_WORDS),
                key=lambda item: (-item["quotesPerThousandWords"], -item["quotationCount"], item["author"]),
            )[:RANK_LIMIT],
            "authorsRelativeWithoutNewTestament": sorted((
                item for item in authors
                if item["wordCount"] >= RELATIVE_AUTHOR_MIN_WORDS and item["author"] != NEW_TESTAMENT_AUTHOR
            ), key=lambda item: (-item["quotesPerThousandWords"], -item["quotationCount"], item["author"]))[:RANK_LIMIT],
            "phrases": aggregate["globalPhrases"][key][:RANK_LIMIT],
            "quotingLanguages": quoting_languages,
        }
    return modes


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    aggregates = {scope: new_aggregate() for scope in ("both", "greek", "latin")}
    workers = min(8, max(1, (os.cpu_count() or 2) - 1))
    with multiprocessing.Pool(workers) as pool:
        results = pool.imap_unordered(analyze_work, catalog["works"], chunksize=1)
        for number, result in enumerate(results, 1):
            update_aggregate(aggregates["both"], result)
            update_aggregate(aggregates[result["corpus"]], result)
            if number % 100 == 0:
                print(f"Processed {number:,}/{len(catalog['works']):,} works", flush=True)

    labels = {"both": "Greek and Latin", "greek": "Greek", "latin": "Latin"}
    views = {}
    for scope, aggregate in aggregates.items():
        works = [work for work in catalog["works"] if scope == "both" or work["corpus"] == scope]
        views[scope] = {
            "label": labels[scope],
            "workCount": len(works),
            "cardWorkCount": sum(work["hasCards"] for work in works),
            "modes": build_modes(aggregate),
        }
    payload = {
        "method": {
            "relativeMinimums": {"workWords": RELATIVE_WORK_MIN_WORDS, "authorWords": RELATIVE_AUTHOR_MIN_WORDS},
            "editionHeuristics": EDITION_HEURISTICS,
        },
        "defaultCorpus": "both",
        "defaultMode": "5",
        "views": views,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
