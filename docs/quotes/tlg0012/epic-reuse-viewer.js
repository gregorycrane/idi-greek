(function () {
  "use strict";

  // Chunking policy: works cited only by line or book/line display canonical
  // Perseus cards while their public CTS routes retain the native citation.

  const config = window.epicViewerConfig;
  const BASE_URN = config.baseUrn;
  const AUTHOR_ID = "tlg0012";
  const WORK_ID = config.workId;
  const PAGE_SIZE = 30;
  const languageNames = {
    deu: "German", grc: "Greek", eng: "English", fra: "French",
    ita: "Italian", lat: "Latin"
  };

  const tracks = [
    ...tracks0, ...tracks1, ...tracks2, ...tracks3, ...tracks4,
    ...tracks5, ...tracks6, ...tracks7, ...tracks8, ...tracks9,
    ...tracks10, ...tracks11, ...tracks12, ...tracks13, ...tracks14,
    ...tracks15, ...tracks16, ...tracks17, ...tracks18, ...tracks19
  ];
  const books = structure[0].notes.map((book) => ({
    id: book.id,
    start: book.start,
    stop: book.stop,
    lines: book.children || []
  }));
  const lines = books.flatMap((book) => book.lines);
  const cardChunks = window.cardChunks.map(([bookNumber, firstLine, lastLine]) => {
    const book = books.find((item) => item.id === String(bookNumber));
    const selectedLines = book.lines.filter((line) => {
      const number = Number(line.name);
      return number >= firstLine && number <= lastLine;
    });
    return {
      id: `${bookNumber}.${firstLine}`,
      book: String(bookNumber),
      card: String(firstLine),
      start: selectedLines[0].start,
      stop: selectedLines[selectedLines.length - 1].stop,
      lines: selectedLines
    };
  });
  const sourceTokens = [...sequence.data.matchAll(/\S+/gu)].map((match) => ({
    text: match[0],
    start: match.index,
    stop: match.index + match[0].length - 1
  }));
  const phraseCache = new Map();
  const state = {
    chunk: 0, citation: null, language: "all", source: "quotations", query: "",
    word: null, phrase: null, phraseScope: "card", limit: PAGE_SIZE
  };

  const elements = {
    bookFilter: document.querySelector("#book-filter"),
    chunkKind: document.querySelector("#chunk-kind"),
    chunkSelect: document.querySelector("#chunk-select"),
    chunkSummary: document.querySelector("#chunk-summary"),
    chunkTitle: document.querySelector("#chunk-title"),
    clearWord: document.querySelector("#clear-word"),
    copyCitation: document.querySelector("#copy-citation"),
    greekText: document.querySelector("#greek-text"),
    languageFilter: document.querySelector("#language-filter"),
    nextChunk: document.querySelector("#next-chunk"),
    overview: document.querySelector("#reuse-overview"),
    overviewLanguage: document.querySelector("#overview-language"),
    overviewSelection: document.querySelector("#overview-selection"),
    phraseList: document.querySelector("#phrase-list"),
    phraseScope: document.querySelector("#phrase-scope"),
    phraseStatus: document.querySelector("#phrase-status"),
    previousChunk: document.querySelector("#previous-chunk"),
    reuseList: document.querySelector("#reuse-list"),
    sceneCount: document.querySelector("#scene-count"),
    selectedWord: document.querySelector("#selected-word"),
    showMore: document.querySelector("#show-more"),
    sourceFilter: document.querySelector("#source-filter"),
    totalReuseCount: document.querySelector("#total-reuse-count"),
    visibleReuseCount: document.querySelector("#visible-reuse-count"),
    wordSelection: document.querySelector("#word-selection")
  };

  function chunkLines(chunk) {
    return chunk.lines;
  }

  function chunkBounds(chunk) {
    return { start: chunk.start, stop: chunk.stop };
  }

  function overlaps(aStart, aStop, bStart, bStop) {
    return aStart <= bStop && aStop >= bStart;
  }

  function displayGreek(value) {
    return value.normalize("NFC");
  }

  function publicLanguage(language) {
    return language === "ell" ? "grc" : language;
  }

  function languageMatches(track) {
    return state.language === "all" || publicLanguage(track.lang) === state.language;
  }

  function viewerBasePath() {
    const match = location.pathname.match(/^(.*\/quotes\/)/);
    return `${match ? match[1] : "/quotes/"}${BASE_URN}`;
  }

  function chunkIndexForPassage(passage) {
    const [bookId, requestedLine = "1"] = String(passage).split(".");
    const lineNumber = Number(requestedLine);
    return cardChunks.findIndex((chunk) => {
      const firstLine = Number(chunk.lines[0].name);
      const lastLine = Number(chunk.lines[chunk.lines.length - 1].name);
      return chunk.book === bookId && lineNumber >= firstLine && lineNumber <= lastLine;
    });
  }

  tracks.forEach((track) => {
    track.sourceClassification = window.sourceClassifier.classify({
      track,
      workId: WORK_ID,
      workLength: sequence.data.length
    });
    track.coverage = track.sourceClassification.metrics.coverage;
    track.isEdition = track.sourceClassification.isEdition;
  });

  function sourceMatches(track) {
    if (state.source === "all") return true;
    return state.source === "editions" ? track.isEdition : !track.isEdition;
  }

  function scopeLabel() {
    if (state.source === "editions") return "editions";
    if (state.source === "all") return "all books";
    return "non-edition sources";
  }

  function phraseScopeDetails() {
    const chunk = cardChunks[state.chunk];
    if (state.phraseScope === "work") {
      return { start: 0, stop: sequence.data.length - 1, label: "the complete work" };
    }
    if (state.phraseScope === "book") {
      const book = books.find((item) => item.id === chunk.book);
      return { start: book.start, stop: book.stop, label: `Book ${book.id}` };
    }
    return { start: chunk.start, stop: chunk.stop, label: `Book ${chunk.book}, card ${chunk.card}` };
  }

  function lowerBound(items, value, key) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (items[middle][key] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function rankedPhrases() {
    const scope = phraseScopeDetails();
    const cacheKey = [state.phraseScope, scope.start, scope.stop, state.source, state.language].join(":");
    if (phraseCache.has(cacheKey)) return phraseCache.get(cacheKey);

    const tokens = sourceTokens.filter((token) => token.start >= scope.start && token.stop <= scope.stop);
    const notes = [];
    tracks.forEach((track) => {
      if (!sourceMatches(track) || !languageMatches(track)) return;
      track.notes.forEach((note) => {
        if (overlaps(note.start, note.stop, scope.start, scope.stop)) notes.push({ track, note });
      });
    });
    if (tokens.length < 3 || !notes.length) {
      const result = { scope, phrases: [], passageCount: notes.length };
      phraseCache.set(cacheKey, result);
      return result;
    }

    const changes = new Int32Array(tokens.length + 1);
    notes.forEach(({ note }) => {
      const first = lowerBound(tokens, note.start, "start");
      const afterLast = lowerBound(tokens, note.stop + 1, "stop");
      if (first < afterLast) {
        changes[first] += 1;
        changes[afterLast] -= 1;
      }
    });
    const coverage = new Uint32Array(tokens.length);
    let running = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      running += changes[index];
      coverage[index] = running;
    }

    const candidates = [];
    [3, 4, 5, 6, 8, 10, 12].forEach((length) => {
      const strongest = [];
      for (let start = 0; start + length <= tokens.length; start += 1) {
        let support = Infinity;
        for (let offset = 0; offset < length; offset += 1) {
          support = Math.min(support, coverage[start + offset]);
        }
        if (!support) continue;
        strongest.push({ start, length, support });
        if (strongest.length > 96) {
          strongest.sort((a, b) => b.support - a.support || b.length - a.length);
          strongest.length = 48;
        }
      }
      strongest.sort((a, b) => b.support - a.support || b.length - a.length);
      candidates.push(...strongest.slice(0, 48));
    });

    const exact = candidates.map((candidate) => {
      const first = tokens[candidate.start];
      const last = tokens[candidate.start + candidate.length - 1];
      const covering = notes.filter(({ note }) => note.start <= first.start && note.stop >= last.stop);
      return {
        start: first.start,
        stop: last.stop,
        text: displayGreek(sequence.data.slice(first.start, last.stop + 1)),
        passages: covering.length,
        sources: new Set(covering.map(({ track }) => track.id)).size,
        citation: lineRangeForNote({ start: first.start, stop: last.stop })
      };
    }).filter((phrase) => phrase.passages > 0)
      .sort((a, b) => b.passages - a.passages || (b.stop - b.start) - (a.stop - a.start));

    const phrases = [];
    exact.forEach((candidate) => {
      const duplicate = phrases.some((accepted) => {
        const intersection = Math.max(0, Math.min(candidate.stop, accepted.stop) - Math.max(candidate.start, accepted.start) + 1);
        const shorter = Math.min(candidate.stop - candidate.start + 1, accepted.stop - accepted.start + 1);
        return intersection / shorter >= 0.65;
      });
      if (!duplicate && phrases.length < 8) phrases.push(candidate);
    });
    const result = { scope, phrases, passageCount: notes.length };
    phraseCache.set(cacheKey, result);
    return result;
  }

  function renderPhrases() {
    const result = rankedPhrases();
    elements.phraseScope.value = state.phraseScope;
    elements.phraseStatus.textContent = `Ranked by passages that contain the complete phrase in ${result.scope.label}; ${result.passageCount.toLocaleString()} filtered reuse passages considered.`;
    if (!result.phrases.length) {
      const empty = document.createElement("p");
      empty.className = "phrase-empty";
      empty.textContent = "No multiword quotation spans were found for this scope and filter.";
      elements.phraseList.replaceChildren(empty);
      return;
    }
    elements.phraseList.replaceChildren(...result.phrases.map((phrase) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "phrase-item";
      if (state.phrase && state.phrase.start === phrase.start && state.phrase.stop === phrase.stop) button.classList.add("is-selected");
      button.dataset.start = String(phrase.start);
      button.dataset.stop = String(phrase.stop);
      button.dataset.text = phrase.text;
      const text = document.createElement("span");
      text.className = "phrase-text";
      text.lang = "grc";
      text.textContent = phrase.text;
      const meta = document.createElement("span");
      meta.className = "phrase-meta";
      meta.textContent = `${phrase.passages.toLocaleString()} passages · ${phrase.sources.toLocaleString()} sources · ${phrase.citation}`;
      button.append(text, meta);
      return button;
    }));
  }

  function matchesForChunk(chunk) {
    const bounds = chunkBounds(chunk);
    const matches = [];
    tracks.forEach((track) => {
      track.notes.forEach((note) => {
        if (overlaps(note.start, note.stop, bounds.start, bounds.stop)) {
          matches.push({ track, note });
        }
      });
    });
    return matches.sort((a, b) => {
      const lineDelta = a.note.start - b.note.start;
      return lineDelta || Number(a.track.date || 0) - Number(b.track.date || 0);
    });
  }

  function lineMatchCount(line, matches) {
    return matches.reduce(
      (count, match) => count + (overlaps(line.start, line.stop, match.note.start, match.note.stop) ? 1 : 0),
      0
    );
  }

  function heatClass(count, thresholds) {
    if (!count) return "heat-0";
    if (count >= thresholds[2]) return "heat-4";
    if (count >= thresholds[1]) return "heat-3";
    if (count >= thresholds[0]) return "heat-2";
    return "heat-1";
  }

  function heatThresholds(tokenized) {
    const counts = tokenized
      .flatMap(({ tokens }) => tokens.map(({ count }) => count))
      .filter(Boolean)
      .sort((a, b) => a - b);
    if (!counts.length) return [1, 1, 1];
    return [0.25, 0.5, 0.75].map((quantile) =>
      counts[Math.min(counts.length - 1, Math.floor((counts.length - 1) * quantile))]
    );
  }

  function passageUrn() {
    return `${BASE_URN}:${state.citation || cardChunks[state.chunk].id}`;
  }

  function renderText(chunk, matches) {
    const selected = chunkLines(chunk);
    const counts = selected.map((line) => lineMatchCount(line, matches));
    const tokenized = selected.map((line) => {
      const raw = sequence.data.slice(line.start, line.stop + 1);
      const tokens = [...raw.matchAll(/\S+/gu)].map((match) => {
        const start = line.start + match.index;
        const stop = start + match[0].length - 1;
        const count = matches.reduce(
          (total, item) => total + (overlaps(start, stop, item.note.start, item.note.stop) ? 1 : 0),
          0
        );
        return { text: match[0], start: match.index, stop: match.index + match[0].length, count };
      });
      return { raw, tokens };
    });
    const thresholds = heatThresholds(tokenized);

    elements.greekText.replaceChildren(
      ...selected.map((line, index) => {
        const item = document.createElement("li");
        item.dataset.line = line.id;
        item.dataset.matches = String(counts[index]);
        item.title = counts[index]
          ? `${counts[index]} reuse ${counts[index] === 1 ? "passage" : "passages"} overlap this line`
          : "No detected reuse overlaps this line";

        const number = document.createElement("span");
        number.className = "line-number";
        number.textContent = line.name;

        const text = document.createElement("span");
        text.className = "line-text";
        text.lang = "grc";
        let cursor = 0;
        tokenized[index].tokens.forEach((token) => {
          const wordStart = line.start + token.start;
          const wordStop = line.start + token.stop - 1;
          if (token.start > cursor) {
            text.append(document.createTextNode(tokenized[index].raw.slice(cursor, token.start)));
          }
          const word = document.createElement("button");
          word.type = "button";
          word.className = `word-heat ${heatClass(token.count, thresholds)}`;
          if (state.word && state.word.start === wordStart && state.word.stop === wordStop) {
            word.classList.add("is-selected");
          }
          word.textContent = displayGreek(token.text);
          word.title = token.count
            ? `${token.count} reuse ${token.count === 1 ? "passage overlaps" : "passages overlap"} this word; select to inspect`
            : "No detected reuse overlaps this word; select to confirm";
          word.dataset.matches = String(token.count);
          word.dataset.start = String(wordStart);
          word.dataset.stop = String(wordStop);
          word.dataset.line = line.id;
          word.setAttribute("aria-pressed", String(Boolean(state.word && state.word.start === wordStart && state.word.stop === wordStop)));
          word.setAttribute("aria-label", `${displayGreek(token.text)}, ${token.count} matching ${token.count === 1 ? "passage" : "passages"}; show passages`);
          text.append(word);
          cursor = token.stop;
        });
        if (cursor < tokenized[index].raw.length) {
          text.append(document.createTextNode(tokenized[index].raw.slice(cursor)));
        }

        const count = document.createElement("span");
        count.className = "line-count";
        count.textContent = counts[index] ? String(counts[index]) : "";
        count.setAttribute("aria-label", `${counts[index]} matching passages`);

        item.append(number, text, count);
        return item;
      })
    );
  }

  function matchesInScope(matches) {
    return matches.filter(({ track }) =>
      sourceMatches(track) && languageMatches(track)
    );
  }

  function renderOverview() {
    const canvas = elements.overview;
    const width = Math.max(canvas.clientWidth, 320);
    const height = 112;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);

    const bins = Math.max(160, Math.floor(width / 3));
    const changes = new Int32Array(bins + 1);
    const textLength = sequence.data.length;
    tracks.forEach((track) => {
      if (!sourceMatches(track)) return;
      if (!languageMatches(track)) return;
      track.notes.forEach((note) => {
        const start = Math.max(0, Math.min(bins - 1, Math.floor(note.start / textLength * bins)));
        const end = Math.max(start, Math.min(bins - 1, Math.floor(note.stop / textLength * bins)));
        changes[start] += 1;
        changes[end + 1] -= 1;
      });
    });

    const values = new Uint32Array(bins);
    let running = 0;
    let maximum = 1;
    for (let index = 0; index < bins; index += 1) {
      running += changes[index];
      values[index] = running;
      maximum = Math.max(maximum, running);
    }

    const bandHeight = 21;
    books.forEach((chunk, index) => {
      const bounds = chunkBounds(chunk);
      const left = bounds.start / textLength * width;
      const right = (bounds.stop + 1) / textLength * width;
      context.fillStyle = index % 2 ? "#dce5e9" : "#c7d7dc";
      context.fillRect(left, 0, Math.max(1, right - left), bandHeight);
      if (right - left > 23) {
        context.fillStyle = "#40515d";
        context.font = "700 10px system-ui";
        context.textAlign = "center";
        context.fillText(String(index + 1), (left + right) / 2, 14);
      }
    });

    const selectedBounds = chunkBounds(cardChunks[state.chunk]);
    const selectionLeft = selectedBounds.start / textLength * width;
    const selectionRight = (selectedBounds.stop + 1) / textLength * width;
    context.fillStyle = "rgba(47, 111, 145, 0.2)";
    context.fillRect(selectionLeft, 0, Math.max(2, selectionRight - selectionLeft), height);

    const chartTop = 31;
    const chartBottom = height - 8;
    const chartHeight = chartBottom - chartTop;
    context.beginPath();
    context.moveTo(0, chartBottom);
    values.forEach((value, index) => {
      const x = index / (bins - 1) * width;
      const normalized = value / maximum;
      context.lineTo(x, chartBottom - normalized * chartHeight);
    });
    context.lineTo(width, chartBottom);
    context.closePath();
    const gradient = context.createLinearGradient(0, chartTop, 0, chartBottom);
    gradient.addColorStop(0, "#14827a");
    gradient.addColorStop(1, "#55aaa1");
    context.fillStyle = gradient;
    context.fill();

    context.strokeStyle = "#0e625d";
    context.lineWidth = 1;
    context.stroke();
    context.strokeStyle = "#2f6f91";
    context.lineWidth = 2;
    context.strokeRect(selectionLeft, 1, Math.max(2, selectionRight - selectionLeft), height - 2);

    const language = state.language === "all"
      ? "All languages"
      : (languageNames[state.language] || state.language);
    elements.overviewLanguage.textContent = `${language} · ${scopeLabel()}`;
    const chunk = cardChunks[state.chunk];
    elements.overviewSelection.textContent = `Book ${chunk.book} · Card ${chunk.card}`;
  }

  function filteredMatches(matches) {
    const query = state.query.trim().toLocaleLowerCase();
    return matches.filter(({ track, note }) => {
      const trackLanguageMatches = languageMatches(track);
      const sourceTypeMatches = sourceMatches(track);
      const wordMatches = !state.word || overlaps(note.start, note.stop, state.word.start, state.word.stop);
      const phraseMatches = !state.phrase || (note.start <= state.phrase.start && note.stop >= state.phrase.stop);
      const queryMatches = !query || `${track.name} ${track.date}`.toLocaleLowerCase().includes(query);
      return sourceTypeMatches && trackLanguageMatches && wordMatches && phraseMatches && queryMatches;
    });
  }

  function lineRangeForNote(note) {
    const first = lines.find((line) => overlaps(line.start, line.stop, note.start, note.stop));
    const last = [...lines].reverse().find((line) => overlaps(line.start, line.stop, note.start, note.stop));
    if (!first) return "Passage";
    return first.id === last.id ? `Line ${first.id}` : `Lines ${first.id}–${last.id}`;
  }

  function renderReuseQuote(note) {
    const quote = document.createElement("blockquote");
    quote.className = "reuse-quote";
    quote.lang = "grc";
    quote.setAttribute("aria-label", "Matched Greek quotation");

    const selection = state.phrase || state.word;
    const passage = sequence.data.slice(note.start, note.stop + 1);
    if (!selection || !overlaps(note.start, note.stop, selection.start, selection.stop)) {
      quote.textContent = passage;
      return quote;
    }

    const highlightStart = Math.max(note.start, selection.start);
    const highlightStop = Math.min(note.stop, selection.stop);
    quote.append(document.createTextNode(sequence.data.slice(note.start, highlightStart)));
    const selected = document.createElement("mark");
    selected.textContent = sequence.data.slice(highlightStart, highlightStop + 1);
    quote.append(selected, document.createTextNode(sequence.data.slice(highlightStop + 1, note.stop + 1)));
    return quote;
  }

  function renderMatches(matches) {
    const filtered = filteredMatches(matches);
    const visible = filtered.slice(0, state.limit);
    elements.visibleReuseCount.textContent = filtered.length.toLocaleString();
    elements.wordSelection.hidden = !state.word && !state.phrase;
    if (state.phrase) {
      elements.selectedWord.textContent = `Complete phrase: “${state.phrase.text}”`;
    } else if (state.word) {
      elements.selectedWord.textContent = `“${state.word.text}” (line ${state.word.line})`;
    }

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<strong>No matching books</strong><span>Try another source type, language, or search term.</span>";
      elements.reuseList.replaceChildren(empty);
    } else {
      elements.reuseList.replaceChildren(
        ...visible.map(({ track, note }) => {
          const card = document.createElement("article");
          card.className = "reuse-card";

          const meta = document.createElement("p");
          meta.className = "reuse-meta";
          const sourceType = track.sourceClassification.label;
          const language = publicLanguage(track.lang);
          meta.textContent = `${lineRangeForNote(note)} · ${sourceType} · ${languageNames[language] || language} · ${track.date || "Undated"}`;
          meta.title = `${track.sourceClassification.reason} (classification rules ${track.sourceClassification.ruleVersion})`;

          const title = document.createElement("h3");
          title.textContent = track.name;

          const quote = renderReuseQuote(note);

          const link = document.createElement("a");
          link.href = `${track.base}${note.url}`;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = `Open ${note.sloc || "page"} in HathiTrust`;

          card.append(meta, title, quote, link);
          return card;
        })
      );
    }

    elements.showMore.hidden = filtered.length <= state.limit;
    elements.showMore.textContent = `Show ${Math.min(PAGE_SIZE, filtered.length - state.limit)} more matches`;
  }

  function updateRoute() {
    const params = new URLSearchParams();
    if (state.language !== "all") params.set("lang", state.language);
    if (state.source !== "quotations") params.set("source", state.source);
    if (state.word) params.set("word", `${state.word.start}-${state.word.stop}`);
    if (state.phrase) params.set("phrase", `${state.phrase.start}-${state.phrase.stop}`);
    if (state.phraseScope !== "card") params.set("phraseScope", state.phraseScope);
    const suffix = params.toString();
    const passage = state.citation || cardChunks[state.chunk].id;
    history.replaceState(null, "", `${viewerBasePath()}:${passage}${suffix ? `&${suffix}` : ""}`);
  }

  function render() {
    const chunk = cardChunks[state.chunk];
    const matches = matchesForChunk(chunk);
    const heatMatches = matchesInScope(matches);
    const selectedLines = chunkLines(chunk);
    const firstLine = selectedLines[0] ? selectedLines[0].name : "1";
    const lastLine = selectedLines[selectedLines.length - 1] ? selectedLines[selectedLines.length - 1].name : "—";
    elements.chunkSelect.value = String(state.chunk);
    elements.chunkKind.textContent = `Book ${chunk.book} · Card ${chunk.card}`;
    elements.chunkTitle.textContent = `Lines ${firstLine}–${lastLine}`;
    elements.chunkSummary.textContent = `${heatMatches.length.toLocaleString()} detected reuse passages in ${new Set(heatMatches.map(({ track }) => track.id)).size.toLocaleString()} ${scopeLabel()} overlap this card${state.language === "all" ? "" : ` in ${languageNames[state.language] || state.language}`}.`;
    elements.totalReuseCount.textContent = tracks
      .filter((track) => sourceMatches(track) && languageMatches(track))
      .reduce((total, track) => total + track.notes.length, 0)
      .toLocaleString();
    elements.previousChunk.disabled = state.chunk === 0;
    elements.nextChunk.disabled = state.chunk === cardChunks.length - 1;
    renderOverview();
    renderPhrases();
    renderText(chunk, heatMatches);
    renderMatches(matches);
    updateRoute();
  }

  function populateControls() {
    elements.sceneCount.textContent = cardChunks.length;
    elements.chunkSelect.replaceChildren(
      ...cardChunks.map((chunk, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        const selectedLines = chunkLines(chunk);
        option.textContent = `Book ${chunk.book} · Card ${chunk.card}: lines ${selectedLines[0].name}–${selectedLines[selectedLines.length - 1].name}`;
        return option;
      })
    );

    const languages = [...new Set(tracks.map((track) => publicLanguage(track.lang)).filter(Boolean))].sort();
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All languages";
    elements.languageFilter.replaceChildren(
      all,
      ...languages.map((language) => {
        const option = document.createElement("option");
        option.value = language;
        option.textContent = languageNames[language] || language;
        return option;
      })
    );

  }

  function readRoute() {
    const escapedUrn = BASE_URN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pathRoute = location.pathname.match(new RegExp(`/${escapedUrn}:([^&/]+)(?:&(.*))?$`))
      || location.pathname.match(new RegExp(`/${WORK_ID}\\.([^&/]+)(?:&(.*))?$`));
    let requestedPassage = pathRoute ? decodeURIComponent(pathRoute[1]) : null;
    let params = pathRoute
      ? new URLSearchParams(pathRoute[2] || "")
      : new URLSearchParams(location.hash.slice(1));
    if (!requestedPassage) requestedPassage = params.get("line") || params.get("book");

    if (!requestedPassage) {
      const savedRoute = sessionStorage.getItem("idi-greek-route");
      if (savedRoute) {
        const saved = JSON.parse(savedRoute);
        if (saved.work === WORK_ID && (!saved.author || saved.author === AUTHOR_ID)) {
          requestedPassage = saved.passage;
          params = new URLSearchParams(saved.query || "");
          sessionStorage.removeItem("idi-greek-route");
        }
      }
    }

    const requestedBook = Number.parseInt(params.get("book"), 10);
    const requestedLanguage = publicLanguage(params.get("lang"));
    const requestedSource = params.get("source");
    const requestedWord = params.get("word");
    const requestedPhrase = params.get("phrase");
    const requestedPhraseScope = params.get("phraseScope");
    const requestedChunk = requestedPassage ? chunkIndexForPassage(requestedPassage) : -1;
    if (requestedChunk >= 0) {
      state.chunk = requestedChunk;
      state.citation = String(requestedPassage);
    } else if (requestedBook >= 1 && requestedBook <= books.length) {
      state.chunk = cardChunks.findIndex((chunk) => chunk.book === String(requestedBook));
      state.citation = cardChunks[state.chunk].id;
    }
    if (requestedLanguage && (requestedLanguage === "all" || tracks.some((track) => publicLanguage(track.lang) === requestedLanguage))) {
      state.language = requestedLanguage;
      elements.languageFilter.value = requestedLanguage;
    }
    if (["quotations", "all", "editions"].includes(requestedSource)) {
      state.source = requestedSource;
      elements.sourceFilter.value = requestedSource;
    }
    if (["work", "book", "card"].includes(requestedPhraseScope)) state.phraseScope = requestedPhraseScope;
    const wordBounds = requestedWord && requestedWord.match(/^(\d+)-(\d+)$/);
    if (wordBounds) {
      const start = Number(wordBounds[1]);
      const stop = Number(wordBounds[2]);
      const line = lines.find((item) => overlaps(item.start, item.stop, start, stop));
      if (line && start <= stop && stop < sequence.data.length) {
        state.word = { start, stop, text: displayGreek(sequence.data.slice(start, stop + 1)), line: line.id };
      }
    }
    const phraseBounds = requestedPhrase && requestedPhrase.match(/^(\d+)-(\d+)$/);
    if (phraseBounds) {
      const start = Number(phraseBounds[1]);
      const stop = Number(phraseBounds[2]);
      if (start <= stop && stop < sequence.data.length) {
        state.phrase = { start, stop, text: displayGreek(sequence.data.slice(start, stop + 1)) };
        state.word = null;
      }
    }
  }

  elements.previousChunk.addEventListener("click", () => {
    state.chunk = Math.max(0, state.chunk - 1);
    state.citation = cardChunks[state.chunk].id;
    state.word = null;
    state.phrase = null;
    state.limit = PAGE_SIZE;
    render();
    scrollTo({ top: document.querySelector(".chunk-nav").offsetTop - 12, behavior: "smooth" });
  });

  elements.nextChunk.addEventListener("click", () => {
    state.chunk = Math.min(cardChunks.length - 1, state.chunk + 1);
    state.citation = cardChunks[state.chunk].id;
    state.word = null;
    state.phrase = null;
    state.limit = PAGE_SIZE;
    render();
    scrollTo({ top: document.querySelector(".chunk-nav").offsetTop - 12, behavior: "smooth" });
  });

  elements.chunkSelect.addEventListener("change", (event) => {
    state.chunk = Number(event.target.value);
    state.citation = cardChunks[state.chunk].id;
    state.word = null;
    state.phrase = null;
    state.limit = PAGE_SIZE;
    render();
  });

  elements.languageFilter.addEventListener("change", (event) => {
    state.language = event.target.value;
    state.phrase = null;
    state.limit = PAGE_SIZE;
    render();
  });

  elements.sourceFilter.addEventListener("change", (event) => {
    state.source = event.target.value;
    state.phrase = null;
    state.limit = PAGE_SIZE;
    render();
  });

  elements.bookFilter.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.limit = PAGE_SIZE;
    renderMatches(matchesForChunk(cardChunks[state.chunk]));
  });

  elements.showMore.addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderMatches(matchesForChunk(cardChunks[state.chunk]));
  });

  elements.greekText.addEventListener("click", (event) => {
    const target = event.target.closest(".word-heat");
    if (!target) return;
    const start = Number(target.dataset.start);
    const stop = Number(target.dataset.stop);
    const alreadySelected = state.word && state.word.start === start && state.word.stop === stop;
    state.word = alreadySelected
      ? null
      : { start, stop, text: target.textContent, line: target.dataset.line };
    state.phrase = null;
    if (state.word) state.citation = target.dataset.line;
    state.limit = PAGE_SIZE;
    render();
  });

  elements.clearWord.addEventListener("click", () => {
    state.word = null;
    state.phrase = null;
    state.limit = PAGE_SIZE;
    render();
  });

  elements.overview.addEventListener("click", (event) => {
    const rect = elements.overview.getBoundingClientRect();
    const character = Math.round((event.clientX - rect.left) / rect.width * sequence.data.length);
    const nextChunk = cardChunks.findIndex((chunk) => {
      const bounds = chunkBounds(chunk);
      return character >= bounds.start && character <= bounds.stop;
    });
    if (nextChunk >= 0) {
      state.chunk = nextChunk;
      state.citation = cardChunks[state.chunk].id;
      state.word = null;
      state.phrase = null;
      state.limit = PAGE_SIZE;
      render();
    }
  });

  elements.phraseScope.addEventListener("change", (event) => {
    state.phraseScope = event.target.value;
    state.phrase = null;
    state.word = null;
    state.limit = PAGE_SIZE;
    render();
  });

  elements.phraseList.addEventListener("click", (event) => {
    const target = event.target.closest(".phrase-item");
    if (!target) return;
    const start = Number(target.dataset.start);
    const stop = Number(target.dataset.stop);
    const nextChunk = cardChunks.findIndex((chunk) => start >= chunk.start && start <= chunk.stop);
    if (nextChunk >= 0) {
      state.chunk = nextChunk;
      state.citation = cardChunks[nextChunk].id;
    }
    state.word = null;
    state.phrase = { start, stop, text: target.dataset.text };
    state.limit = PAGE_SIZE;
    render();
    document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  elements.copyCitation.addEventListener("click", async () => {
    const citation = passageUrn();
    try {
      await navigator.clipboard.writeText(citation);
      elements.copyCitation.textContent = "Citation copied";
      window.setTimeout(() => { elements.copyCitation.textContent = "Copy citation"; }, 1600);
    } catch (_) {
      window.prompt("Copy this citation", citation);
    }
  });

  window.addEventListener("popstate", () => {
    readRoute();
    render();
  });

  new ResizeObserver(() => renderOverview()).observe(elements.overview);

  populateControls();
  readRoute();
  if (!state.citation) state.citation = cardChunks[state.chunk].id;
  render();
})();
