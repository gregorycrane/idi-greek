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


ROOT = Path(__file__).resolve().parents[1]
QUOTES = ROOT / "docs" / "quotes"
CATALOG = ROOT / "docs" / "catalog.json"
OUTPUT = ROOT / "docs" / "statistics.json"
ASSIGNMENT = re.compile(r"^\s*var\s+\w+\s*=\s*", re.S)
TOKEN = re.compile(r"\S+", re.UNICODE)
MATCH_LENGTHS = (3, 5)
RANK_LIMIT = 12
PHRASE_WORK_FLOOR = 100
RELATIVE_WORK_MIN_WORDS = 1000
RELATIVE_AUTHOR_MIN_WORDS = 5000
NEW_TESTAMENT_AUTHOR = "New Testament"
GREEK = re.compile(r"[\u0370-\u03ff\u1f00-\u1fff]")

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


def strongest_phrase_candidates(tokens, notes, phrase_length: int):
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
        if not all(GREEK.search(tokens[token_index][0]) for token_index in range(first, first + phrase_length)):
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


def top_phrases(work, work_dir: Path, text: str, tokens, notes, phrase_length: int):
    candidates = strongest_phrase_candidates(tokens, notes, phrase_length)
    support = exact_phrase_support(candidates, notes)
    ranked = []
    for candidate, passages in zip(candidates, support):
        if not passages:
            continue
        start, stop, word_count, _approximate = candidate
        ranked.append({
            "workId": work["id"],
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


def ranked_items(items, relative=False):
    key = (lambda item: (-item["quotesPerThousandWords"], -item["quotationCount"], item["title"])) if relative else (
        lambda item: (-item["quotationCount"], -item["quotesPerThousandWords"], item["title"])
    )
    return sorted(items, key=key)[:RANK_LIMIT]


def quotation_tracks(work, text_length: int):
    work_dir = QUOTES / work["authorId"] / work["workId"]
    merged_tracks = {}
    for path in sorted(work_dir.glob("tracks*.js"), key=track_sort):
        for track in load_assignment(path):
            existing = merged_tracks.setdefault(track["id"], {**track, "notes": []})
            existing["notes"].extend(track.get("notes", []))
    quotations = []
    editions = []
    for track in merged_tracks.values():
        (editions if is_edition(track["notes"], text_length) else quotations).append(track)
    return quotations, editions


def analyze_work(work):
    work_dir = QUOTES / work["authorId"] / work["workId"]
    text = load_assignment(work_dir / "sequence.js").get("data", "")
    tokens = [(match.group(0), match.start(), match.end() - 1) for match in TOKEN.finditer(text)]
    quotations, editions = quotation_tracks(work, len(text))
    starts = [token[1] for token in tokens]
    stops = [token[2] for token in tokens]
    greek_prefix = [0]
    for token, _start, _stop in tokens:
        greek_prefix.append(greek_prefix[-1] + int(bool(GREEK.search(token))))

    notes_by_length = {length: [] for length in MATCH_LENGTHS}
    book_ids_by_length = {length: [] for length in MATCH_LENGTHS}
    for track in quotations:
        track_qualifies = {length: False for length in MATCH_LENGTHS}
        for note in track["notes"]:
            start = max(0, note["start"])
            stop = min(len(text) - 1, note["stop"])
            first = bisect.bisect_left(starts, start)
            after_last = bisect.bisect_left(stops, stop + 1)
            greek_words = greek_prefix[after_last] - greek_prefix[first]
            for length in MATCH_LENGTHS:
                if greek_words >= length:
                    notes_by_length[length].append((start, stop))
                    track_qualifies[length] = True
        for length in MATCH_LENGTHS:
            if track_qualifies[length]:
                book_ids_by_length[length].append(track["id"])

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
            "author": work["author"],
            "title": work["title"],
            "wordCount": word_count,
            "quotationCount": quotation_count,
            "quotesPerThousandWords": round(quotation_count / word_count * 1000, 2) if word_count else 0,
        }
        modes[str(length)] = {
            "item": item,
            "bookIds": book_ids_by_length[length],
            "quotedWordOccurrences": quoted_word_occurrences,
            "distinctQuotedWords": distinct_quoted_words,
            "phrases": top_phrases(work, work_dir, text, tokens, quotation_notes, length)
            if quotation_count >= PHRASE_WORK_FLOOR else [],
        }
    return {
        "wordCount": word_count,
        "editionBooks": len(editions),
        "editionPassages": sum(len(track["notes"]) for track in editions),
        "modes": modes,
    }


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    work_stats = {str(length): [] for length in MATCH_LENGTHS}
    author_totals = {
        str(length): defaultdict(lambda: {"wordCount": 0, "quotationCount": 0, "workCount": 0})
        for length in MATCH_LENGTHS
    }
    unique_books = {str(length): set() for length in MATCH_LENGTHS}
    global_phrases = {str(length): [] for length in MATCH_LENGTHS}
    mode_totals = {str(length): defaultdict(int) for length in MATCH_LENGTHS}
    totals = defaultdict(int)

    workers = min(8, max(1, (os.cpu_count() or 2) - 1))
    with multiprocessing.Pool(workers) as pool:
        results = pool.imap_unordered(analyze_work, catalog["works"], chunksize=1)
        for number, result in enumerate(results, 1):
            totals["wordCount"] += result["wordCount"]
            totals["editionBooks"] += result["editionBooks"]
            totals["editionPassages"] += result["editionPassages"]
            for length in MATCH_LENGTHS:
                key = str(length)
                mode = result["modes"][key]
                item = mode["item"]
                work_stats[key].append(item)
                author = author_totals[key][item["author"]]
                author["wordCount"] += item["wordCount"]
                author["quotationCount"] += item["quotationCount"]
                author["workCount"] += 1
                mode_totals[key]["quotationCount"] += item["quotationCount"]
                mode_totals[key]["quotedWordOccurrences"] += mode["quotedWordOccurrences"]
                mode_totals[key]["distinctQuotedWords"] += mode["distinctQuotedWords"]
                unique_books[key].update(mode["bookIds"])
                global_phrases[key].extend(mode["phrases"])
            if number % 100 == 0:
                print(f"Processed {number:,}/{len(catalog['works']):,} works", flush=True)

    modes = {}
    author_count = len({work["author"] for work in catalog["works"]})
    for length in MATCH_LENGTHS:
        key = str(length)
        authors = []
        for name, values in author_totals[key].items():
            authors.append({
                "author": name,
                **values,
                "quotesPerThousandWords": round(values["quotationCount"] / values["wordCount"] * 1000, 2) if values["wordCount"] else 0,
            })
        global_phrases[key].sort(key=lambda item: (-item["passages"], -item["wordCount"], item["author"], item["title"]))
        if len(global_phrases[key]) < RANK_LIMIT or global_phrases[key][RANK_LIMIT - 1]["passages"] <= PHRASE_WORK_FLOOR:
            raise RuntimeError(f"Phrase work floor is too high to prove the global {length}-gram ranking")
        modes[key] = {
            "label": "Higher recall" if length == 3 else "Higher precision",
            "matchWords": length,
            "totals": {
                "works": len(work_stats[key]),
                "authors": author_count,
                "wordCount": totals["wordCount"],
                "quotationCount": mode_totals[key]["quotationCount"],
                "quotedWordOccurrences": mode_totals[key]["quotedWordOccurrences"],
                "distinctQuotedWords": mode_totals[key]["distinctQuotedWords"],
                "uniqueQuotingBooks": len(unique_books[key]),
                "excludedEditionBooks": totals["editionBooks"],
                "excludedEditionPassages": totals["editionPassages"],
            },
            "worksAbsolute": ranked_items(work_stats[key]),
            "worksRelative": ranked_items([item for item in work_stats[key] if item["wordCount"] >= RELATIVE_WORK_MIN_WORDS], relative=True),
            "worksRelativeWithoutNewTestament": ranked_items([
                item for item in work_stats[key]
                if item["wordCount"] >= RELATIVE_WORK_MIN_WORDS and item["author"] != NEW_TESTAMENT_AUTHOR
            ], relative=True),
            "authorsAbsolute": sorted(authors, key=lambda item: (-item["quotationCount"], -item["quotesPerThousandWords"], item["author"]))[:RANK_LIMIT],
            "authorsRelative": sorted((item for item in authors if item["wordCount"] >= RELATIVE_AUTHOR_MIN_WORDS), key=lambda item: (-item["quotesPerThousandWords"], -item["quotationCount"], item["author"]))[:RANK_LIMIT],
            "authorsRelativeWithoutNewTestament": sorted((
                item for item in authors
                if item["wordCount"] >= RELATIVE_AUTHOR_MIN_WORDS and item["author"] != NEW_TESTAMENT_AUTHOR
            ), key=lambda item: (-item["quotesPerThousandWords"], -item["quotationCount"], item["author"]))[:RANK_LIMIT],
            "phrases": global_phrases[key][:RANK_LIMIT],
        }

    payload = {
        "method": {
            "relativeMinimums": {"workWords": RELATIVE_WORK_MIN_WORDS, "authorWords": RELATIVE_AUTHOR_MIN_WORDS},
            "editionHeuristics": EDITION_HEURISTICS,
        },
        "defaultMode": "5",
        "modes": modes,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
