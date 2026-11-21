(function () {
  "use strict";

  const BASE_URN = "urn:cts:greekLit:tlg0011.tlg001.perseus-grc2";
  const PAGE_SIZE = 30;
  const languageNames = {
    deu: "German", ell: "Greek", eng: "English", fra: "French",
    ita: "Italian", lat: "Latin"
  };

  const tracks = [
    ...tracks0, ...tracks1, ...tracks2, ...tracks3, ...tracks4,
    ...tracks5, ...tracks6, ...tracks7, ...tracks8, ...tracks9,
    ...tracks10, ...tracks11, ...tracks12, ...tracks13, ...tracks14,
    ...tracks15, ...tracks16, ...tracks17, ...tracks18, ...tracks19
  ];
  const lines = structure[0].notes;
  const state = { chunk: 0, language: "all", query: "", limit: PAGE_SIZE };

  const elements = {
    bookFilter: document.querySelector("#book-filter"),
    chunkKind: document.querySelector("#chunk-kind"),
    chunkSelect: document.querySelector("#chunk-select"),
    chunkSummary: document.querySelector("#chunk-summary"),
    chunkTitle: document.querySelector("#chunk-title"),
    copyCitation: document.querySelector("#copy-citation"),
    greekText: document.querySelector("#greek-text"),
    languageFilter: document.querySelector("#language-filter"),
    nextChunk: document.querySelector("#next-chunk"),
    previousChunk: document.querySelector("#previous-chunk"),
    reuseList: document.querySelector("#reuse-list"),
    sceneCount: document.querySelector("#scene-count"),
    showMore: document.querySelector("#show-more"),
    totalReuseCount: document.querySelector("#total-reuse-count"),
    visibleReuseCount: document.querySelector("#visible-reuse-count")
  };

  function chunkLines(chunk) {
    return lines.filter((line) => {
      const number = Number.parseInt(line.id, 10);
      return number >= chunk.start && number <= chunk.end;
    });
  }

  function chunkBounds(chunk) {
    const selected = chunkLines(chunk);
    return {
      start: selected[0] ? selected[0].start : 0,
      stop: selected[selected.length - 1] ? selected[selected.length - 1].stop : 0
    };
  }

  function overlaps(aStart, aStop, bStart, bStop) {
    return aStart <= bStop && aStop >= bStart;
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

  function densityClass(count, max) {
    if (!count) return "density-0";
    const ratio = count / Math.max(max, 1);
    if (ratio >= 0.66) return "density-3";
    if (ratio >= 0.25) return "density-2";
    return "density-1";
  }

  function passageUrn(chunk) {
    return `${BASE_URN}:${chunk.start}-${chunk.end}`;
  }

  function renderText(chunk, matches) {
    const selected = chunkLines(chunk);
    const counts = selected.map((line) => lineMatchCount(line, matches));
    const max = Math.max(...counts, 1);

    elements.greekText.replaceChildren(
      ...selected.map((line, index) => {
        const item = document.createElement("li");
        item.className = densityClass(counts[index], max);
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
        text.textContent = sequence.data.slice(line.start, line.stop + 1).trim();

        const count = document.createElement("span");
        count.className = "line-count";
        count.textContent = counts[index] ? String(counts[index]) : "";
        count.setAttribute("aria-label", `${counts[index]} matching passages`);

        item.append(number, text, count);
        return item;
      })
    );
  }

  function filteredMatches(matches) {
    const query = state.query.trim().toLocaleLowerCase();
    return matches.filter(({ track }) => {
      const languageMatches = state.language === "all" || track.lang === state.language;
      const queryMatches = !query || `${track.name} ${track.date}`.toLocaleLowerCase().includes(query);
      return languageMatches && queryMatches;
    });
  }

  function lineRangeForNote(note) {
    const first = lines.find((line) => overlaps(line.start, line.stop, note.start, note.stop));
    const last = [...lines].reverse().find((line) => overlaps(line.start, line.stop, note.start, note.stop));
    if (!first) return "Passage";
    return first.id === last.id ? `Line ${first.id}` : `Lines ${first.id}–${last.id}`;
  }

  function renderMatches(matches) {
    const filtered = filteredMatches(matches);
    const visible = filtered.slice(0, state.limit);
    elements.visibleReuseCount.textContent = filtered.length.toLocaleString();

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = "<strong>No matching books</strong><span>Try another language or search term.</span>";
      elements.reuseList.replaceChildren(empty);
    } else {
      elements.reuseList.replaceChildren(
        ...visible.map(({ track, note }) => {
          const card = document.createElement("article");
          card.className = "reuse-card";

          const meta = document.createElement("p");
          meta.className = "reuse-meta";
          meta.textContent = `${lineRangeForNote(note)} · ${languageNames[track.lang] || track.lang} · ${track.date || "Undated"}`;

          const title = document.createElement("h3");
          title.textContent = track.name;

          const link = document.createElement("a");
          link.href = `${track.base}${note.url}`;
          link.target = "_blank";
          link.rel = "noreferrer";
          link.textContent = `Open ${note.sloc || "page"} in HathiTrust`;

          card.append(meta, title, link);
          return card;
        })
      );
    }

    elements.showMore.hidden = filtered.length <= state.limit;
    elements.showMore.textContent = `Show ${Math.min(PAGE_SIZE, filtered.length - state.limit)} more matches`;
  }

  function updateHash() {
    const params = new URLSearchParams();
    params.set("scene", String(state.chunk + 1));
    if (state.language !== "all") params.set("lang", state.language);
    history.replaceState(null, "", `#${params.toString()}`);
  }

  function render() {
    const chunk = sceneChunks[state.chunk];
    const matches = matchesForChunk(chunk);
    elements.chunkSelect.value = String(state.chunk);
    elements.chunkKind.textContent = `Scene ${state.chunk + 1} · ${chunk.type}`;
    elements.chunkTitle.textContent = `Lines ${chunk.start}–${chunk.end}`;
    elements.chunkSummary.textContent = `${matches.length.toLocaleString()} detected reuse passages in ${new Set(matches.map(({ track }) => track.id)).size.toLocaleString()} books overlap this scene.`;
    elements.previousChunk.disabled = state.chunk === 0;
    elements.nextChunk.disabled = state.chunk === sceneChunks.length - 1;
    renderText(chunk, matches);
    renderMatches(matches);
    updateHash();
  }

  function populateControls() {
    elements.sceneCount.textContent = sceneChunks.length;
    elements.chunkSelect.replaceChildren(
      ...sceneChunks.map((chunk, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = `Scene ${index + 1}: ${chunk.start}–${chunk.end} (${chunk.type})`;
        return option;
      })
    );

    const languages = [...new Set(tracks.map((track) => track.lang))].sort();
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

    elements.totalReuseCount.textContent = tracks
      .reduce((total, track) => total + track.notes.length, 0)
      .toLocaleString();
  }

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const requestedScene = Number.parseInt(params.get("scene"), 10);
    const requestedLanguage = params.get("lang");
    if (requestedScene >= 1 && requestedScene <= sceneChunks.length) state.chunk = requestedScene - 1;
    if (requestedLanguage && (requestedLanguage === "all" || tracks.some((track) => track.lang === requestedLanguage))) {
      state.language = requestedLanguage;
      elements.languageFilter.value = requestedLanguage;
    }
  }

  elements.previousChunk.addEventListener("click", () => {
    state.chunk = Math.max(0, state.chunk - 1);
    state.limit = PAGE_SIZE;
    render();
    scrollTo({ top: document.querySelector(".chunk-nav").offsetTop - 12, behavior: "smooth" });
  });

  elements.nextChunk.addEventListener("click", () => {
    state.chunk = Math.min(sceneChunks.length - 1, state.chunk + 1);
    state.limit = PAGE_SIZE;
    render();
    scrollTo({ top: document.querySelector(".chunk-nav").offsetTop - 12, behavior: "smooth" });
  });

  elements.chunkSelect.addEventListener("change", (event) => {
    state.chunk = Number(event.target.value);
    state.limit = PAGE_SIZE;
    render();
  });

  elements.languageFilter.addEventListener("change", (event) => {
    state.language = event.target.value;
    state.limit = PAGE_SIZE;
    render();
  });

  elements.bookFilter.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.limit = PAGE_SIZE;
    renderMatches(matchesForChunk(sceneChunks[state.chunk]));
  });

  elements.showMore.addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderMatches(matchesForChunk(sceneChunks[state.chunk]));
  });

  elements.copyCitation.addEventListener("click", async () => {
    const citation = passageUrn(sceneChunks[state.chunk]);
    try {
      await navigator.clipboard.writeText(citation);
      elements.copyCitation.textContent = "Citation copied";
      window.setTimeout(() => { elements.copyCitation.textContent = "Copy citation"; }, 1600);
    } catch (_) {
      window.prompt("Copy this citation", citation);
    }
  });

  window.addEventListener("hashchange", () => {
    readHash();
    render();
  });

  populateControls();
  readHash();
  render();
})();
