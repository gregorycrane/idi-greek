#!/usr/bin/env python3
"""Build shared card-based reuse viewers for the four Greek dramatists."""

import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUOTES = ROOT / "docs" / "quotes"
CANON = Path("/Users/gcrane/github/canonical-greekLit/data")
AUTHORS = {
    "tlg0085": ("Aeschylus", "Greek tragedy"),
    "tlg0011": ("Sophocles", "Greek tragedy"),
    "tlg0006": ("Euripides", "Greek tragedy"),
    "tlg0019": ("Aristophanes", "Greek comedy"),
}


def load_js_value(path: Path):
    source = path.read_text()
    value = source[source.index("=") + 1 :].strip()
    if value.endswith(";"):
        value = value[:-1]
    return json.loads(value)


def work_title(index_path: Path, author_name: str) -> str:
    source = index_path.read_text()
    raw = re.search(r"<title>(.*?)</title>", source, re.S).group(1)
    raw = raw.replace(" — Text Reuse Viewer", "")
    return re.sub(rf"^{author_name}[.,]\s*", "", raw).strip()


def milestone_numbers(tei_path: Path):
    source = tei_path.read_text()
    milestones = re.findall(
        r"<milestone\b[^>]*\bunit=[\"']card[\"'][^>]*/?>", source
    )
    return [
        match.group(1)
        for milestone in milestones
        if (match := re.search(r"\bn=[\"']([^\"']+)", milestone))
    ]


def numeric_prefix(value: str):
    match = re.match(r"-?\d+", value)
    return int(match.group()) if match else None


def resolve_boundaries(lines, milestones):
    ids = [str(line["id"]) for line in lines]
    boundaries = []
    previous = -1
    for position, card_id in enumerate(milestones):
        if position == 0:
            # The opening card milestone can precede a synthetic speaker line 0.
            index = 0
        else:
            try:
                index = ids.index(card_id, previous + 1)
            except ValueError:
                wanted = numeric_prefix(card_id)
                index = next(
                    (
                        candidate
                        for candidate in range(previous + 1, len(ids))
                        if numeric_prefix(ids[candidate]) is not None
                        and numeric_prefix(ids[candidate]) >= wanted
                    ),
                    -1,
                )
        if index < 0 or index <= previous:
            continue
        boundaries.append((card_id, index))
        previous = index

    chunks = []
    for position, (card_id, first) in enumerate(boundaries):
        last = boundaries[position + 1][1] - 1 if position + 1 < len(boundaries) else len(lines) - 1
        if first <= last:
            chunks.append([card_id, ids[first], ids[last]])
    return chunks


def render_index(author_id, work_id, author_name, genre, title, chunks, lines):
    base_urn = f"urn:cts:greekLit:{author_id}.{work_id}.perseus-grc2"
    tei_url = (
        "https://github.com/PerseusDL/canonical-greekLit/blob/master/data/"
        f"{author_id}/{work_id}/{author_id}.{work_id}.perseus-grc2.xml"
    )
    scripts = "\n".join(f'  <script src="tracks{number}.js"></script>' for number in range(20))
    first_line = html.escape(str(lines[0]["name"]))
    last_line = html.escape(str(lines[-1]["name"]))
    first_chunk = chunks[0]
    first_chunk_last = html.escape(str(first_chunk[2]))
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Explore reuse of {html.escape(author_name)}'s {html.escape(title)} in the Institutional Books corpus.">
  <title>{html.escape(author_name)}, {html.escape(title)} — Text Reuse Viewer</title>
  <link rel="stylesheet" href="../../drama-reuse-viewer.css?v=card-viewer-4">

  <script src="sequence.js"></script>
  <script src="structure.js"></script>
{scripts}
  <script src="groups.js"></script>
  <script src="card-chunks.js"></script>
  <script>
    window.dramaViewerConfig = {{
      authorId: "{author_id}",
      authorName: "{author_name}",
      baseUrn: "{base_urn}",
      workId: "{work_id}"
    }};
  </script>
  <script src="../../drama-reuse-viewer.js?v=card-viewer-4" defer></script>
</head>
<body>
  <header class="site-header">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">Π</span>
      <span class="brand-copy">
        <span>Perseus Text Reuse</span>
        <span class="brand-context">Open Greek and Latin in the Harvard ID1 Million Book Library</span>
      </span>
    </div>
    <div class="header-meta">
      <a href="https://github.com/gregorycrane/idi-greek" rel="noreferrer">Data repository</a>
      <span aria-hidden="true">·</span>
      <a href="{tei_url}" rel="noreferrer">TEI source</a>
    </div>
  </header>

  <main>
    <section class="work-heading" aria-labelledby="work-title">
      <div>
        <p class="eyebrow">{html.escape(author_name)} · {genre}</p>
        <h1 id="work-title">{html.escape(title)}</h1>
        <p class="urn">{base_urn}</p>
      </div>
      <dl class="work-stats" aria-label="Work statistics">
        <div><dt>Default view</dt><dd>Card</dd></div>
        <div><dt>Cards</dt><dd id="scene-count">{len(chunks)}</dd></div>
        <div><dt>Reuse passages</dt><dd id="total-reuse-count">—</dd></div>
      </dl>
    </section>

    <nav class="chunk-nav" aria-label="Passage navigation">
      <button class="nav-button" id="previous-chunk" type="button">Previous card</button>
      <label class="chunk-picker"><span>Passage</span><select id="chunk-select" aria-label="Choose a card"></select></label>
      <button class="nav-button" id="next-chunk" type="button">Next card</button>
    </nav>

    <section class="overview-panel" aria-labelledby="overview-title">
      <div class="overview-heading">
        <div><p class="eyebrow">Whole-work distribution</p><h2 id="overview-title">Reuse overview</h2></div>
        <p><span id="overview-language">All languages</span> · select a region to move between cards</p>
      </div>
      <canvas id="reuse-overview" height="112" aria-label="Reuse density across the complete work"></canvas>
      <div class="overview-scale" aria-hidden="true">
        <span>Line {first_line}</span><strong id="overview-selection">Current card: {html.escape(str(first_chunk[0]))}</strong><span>Line {last_line}</span>
      </div>
    </section>

    <section class="phrase-panel" aria-labelledby="phrase-title">
      <div class="phrase-heading">
        <div><p class="eyebrow">Ranked reuse spans</p><h2 id="phrase-title">Most quoted phrases</h2></div>
        <label class="phrase-scope"><span>Scope</span><select id="phrase-scope"><option value="work">Work</option><option value="card" selected>Card</option></select></label>
      </div>
      <p class="phrase-status" id="phrase-status"></p>
      <div class="phrase-list" id="phrase-list" aria-live="polite"></div>
    </section>

    <section class="workspace">
      <article class="text-panel" aria-labelledby="chunk-title">
        <div class="panel-heading">
          <div><p class="eyebrow" id="chunk-kind">Card {html.escape(str(first_chunk[0]))}</p><h2 id="chunk-title">Lines {html.escape(str(first_chunk[1]))}–{first_chunk_last}</h2></div>
          <div class="passage-actions"><button class="quiet-button" id="copy-citation" type="button">Copy citation</button></div>
        </div>
        <p class="chunk-summary" id="chunk-summary" aria-live="polite"></p>
        <div class="legend" aria-label="Word-level reuse heatmap legend">
          <strong>Word-level heatmap</strong><span><i class="word-swatch heat-0"></i>No match</span><span><i class="word-swatch heat-1"></i>Some reuse</span><span><i class="word-swatch heat-4"></i>Frequent reuse</span><em>Select a word to inspect its passages.</em>
        </div>
        <ol class="greek-text" id="greek-text" aria-label="Greek text"></ol>
      </article>

      <aside class="reuse-panel" aria-labelledby="reuse-title">
        <div class="panel-heading compact"><div><p class="eyebrow">Institutional Books 1.0</p><h2 id="reuse-title">Text reuse</h2></div><span class="count-badge" id="visible-reuse-count">0</span></div>
        <div class="filters">
          <label><span>Source type</span><select id="source-filter"><option value="quotations" selected>Quotations only</option><option value="all">All books</option><option value="editions">Full editions only</option></select></label>
          <label><span>Language</span><select id="language-filter"></select></label>
          <label><span>Sort quotations</span><select id="quotation-sort"><option value="text" selected>Text order</option><option value="oldest">Publication date: oldest</option><option value="newest">Publication date: newest</option></select></label>
          <label><span>Find a book</span><input id="book-filter" type="search" placeholder="Title or date"></label>
        </div>
        <div class="word-selection" id="word-selection" hidden><span>Passages quoting <strong id="selected-word"></strong></span><button id="clear-word" type="button">Show whole card</button></div>
        <div class="reuse-list" id="reuse-list" aria-live="polite"></div>
        <button class="show-more" id="show-more" type="button" hidden>Show more matches</button>
      </aside>
    </section>
  </main>

  <footer><p>Card boundaries follow the canonical Perseus <code>CTS</code> card milestones. Line citations open the card containing the cited line.</p></footer>
</body>
</html>
'''


def main():
    built = []
    for author_id, (author_name, genre) in AUTHORS.items():
        for work_dir in sorted((QUOTES / author_id).iterdir()):
            if not work_dir.is_dir():
                continue
            work_id = work_dir.name
            tei_path = CANON / author_id / work_id / f"{author_id}.{work_id}.perseus-grc2.xml"
            if not tei_path.exists():
                continue
            lines = load_js_value(work_dir / "structure.js")[0]["notes"]
            chunks = resolve_boundaries(lines, milestone_numbers(tei_path))
            if not chunks:
                continue
            title = work_title(work_dir / "index.html", author_name)
            (work_dir / "card-chunks.js").write_text(
                "window.cardChunks = " + json.dumps(chunks, ensure_ascii=False, separators=(",", ":")) + ";\n"
            )
            (work_dir / "index.html").write_text(
                render_index(author_id, work_id, author_name, genre, title, chunks, lines)
            )
            built.append((author_id, work_id, len(chunks), title))

    for author_id, work_id, count, title in built:
        print(f"{author_id}.{work_id}: {count:>3} cards · {title}")
    print(f"Built {len(built)} dramatist viewers")


if __name__ == "__main__":
    main()
