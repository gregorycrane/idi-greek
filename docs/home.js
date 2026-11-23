(function () {
  "use strict";
  const PAGE_SIZE = 120;
  const state = { works: [], query: "", filter: "all", limit: PAGE_SIZE, statistics: null, matchMode: "5", excludeNewTestament: false };
  const list = document.querySelector("#work-list");
  const resultCount = document.querySelector("#result-count");
  const showMore = document.querySelector("#show-more");

  const number = (value, maximumFractionDigits = 0) => Number(value).toLocaleString(undefined, { maximumFractionDigits });

  function workLink(work, content) {
    const link = document.createElement("a");
    link.href = `viewer/?work=${encodeURIComponent(work.id)}`;
    link.textContent = content;
    return link;
  }

  function renderWorkRanking(selector, works, relative) {
    const listElement = document.querySelector(selector);
    listElement.replaceChildren(...works.map((work) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.append(workLink(work, work.title));
      const author = document.createElement("small");
      author.textContent = work.author;
      label.append(author);
      const value = document.createElement("strong");
      value.textContent = relative ? number(work.quotesPerThousandWords, 2) : number(work.quotationCount);
      value.title = relative ? `${number(work.quotationCount)} quotations in ${number(work.wordCount)} words` : `${number(work.quotesPerThousandWords, 2)} per 1,000 words`;
      item.append(label, value);
      return item;
    }));
  }

  function renderAuthorRanking(selector, authors, relative) {
    const listElement = document.querySelector(selector);
    listElement.replaceChildren(...authors.map((author) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = author.author;
      const detail = document.createElement("small");
      detail.textContent = `${number(author.workCount)} ${author.workCount === 1 ? "work" : "works"} · ${number(author.wordCount)} words`;
      label.append(detail);
      const value = document.createElement("strong");
      value.textContent = relative ? number(author.quotesPerThousandWords, 2) : number(author.quotationCount);
      value.title = relative ? `${number(author.quotationCount)} quotations` : `${number(author.quotesPerThousandWords, 2)} per 1,000 words`;
      item.append(label, value);
      return item;
    }));
  }

  function renderStatistics(statistics) {
    const mode = statistics.modes[state.matchMode];
    const totals = mode.totals;
    const words = mode.matchWords;
    const wordLabel = words === 1 ? "word" : "words";
    document.querySelector("#word-count").textContent = number(totals.wordCount);
    document.querySelector("#quotation-label").textContent = `Greek quotations (${words}+ ${wordLabel})`;
    document.querySelector("#quotation-count").textContent = number(totals.quotationCount);
    document.querySelector("#book-count").textContent = number(totals.uniqueQuotingBooks);
    document.querySelector("#quoted-word-occurrences").textContent = number(totals.quotedWordOccurrences);
    document.querySelector("#quoted-word-note").textContent = `Words counted once for every qualifying ${words}+ word Greek quotation`;
    document.querySelector("#distinct-quoted-words").textContent = number(totals.distinctQuotedWords);
    document.querySelector("#author-count").textContent = number(totals.authors);
    document.querySelector("#statistics-note").textContent = `${number(totals.works)} works · ${mode.label.toLowerCase()} · likely editions excluded`;
    document.querySelector("#works-absolute-note").textContent = `Greek quotation passages containing ${words}+ words`;
    document.querySelector("#authors-absolute-note").textContent = `Greek quotation passages containing ${words}+ words`;
    const relativeSuffix = state.excludeNewTestament ? " · New Testament excluded" : "";
    document.querySelector("#works-relative-note").textContent = `${words}+ word Greek quotations per 1,000 source words · works with 1,000+ words${relativeSuffix}`;
    document.querySelector("#authors-relative-note").textContent = `${words}+ word Greek quotations per 1,000 source words · authors with 5,000+ words${relativeSuffix}`;
    document.querySelector("#phrases-title").textContent = `Most quoted Greek ${words}-grams`;
    document.querySelector("#phrases-note").textContent = `Passages containing the complete ${words}-word phrase`;
    renderWorkRanking("#works-absolute", mode.worksAbsolute, false);
    renderWorkRanking("#works-relative", state.excludeNewTestament ? mode.worksRelativeWithoutNewTestament : mode.worksRelative, true);
    renderAuthorRanking("#authors-absolute", mode.authorsAbsolute, false);
    renderAuthorRanking("#authors-relative", state.excludeNewTestament ? mode.authorsRelativeWithoutNewTestament : mode.authorsRelative, true);

    document.querySelector("#phrases-ranking").replaceChildren(...mode.phrases.map((phrase) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const params = new URLSearchParams({ work: phrase.workId, phrase: `${phrase.start}-${phrase.stop}`, phraseScope: "work", ngram: String(words) });
      if (phrase.passage) params.set("passage", phrase.passage);
      link.href = `viewer/?${params.toString()}`;
      link.lang = "grc";
      link.textContent = phrase.text.normalize("NFC");
      const meta = document.createElement("span");
      meta.textContent = `${number(phrase.passages)} passages · ${phrase.author}, ${phrase.title}`;
      item.append(link, meta);
      return item;
    }));
    const minimums = statistics.method.relativeMinimums;
    const newTestamentMethod = state.excludeNewTestament ? " New Testament works are excluded from the two relative rankings." : "";
    document.querySelector("#statistics-method").textContent = `${mode.label} counts detected reuse passages containing at least ${words} Greek-script words. Relative rankings report qualifying passages per 1,000 source-text words and require at least ${number(minimums.workWords)} words per work and ${number(minimums.authorWords)} words per author.${newTestamentMethod} Greek ${words}-grams are ranked by passages containing the complete phrase. ${number(totals.excludedEditionBooks)} likely edition records (${number(totals.excludedEditionPassages)} passages) were excluded.`;
  }

  function filteredWorks() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.works.filter((work) => {
      const filterMatches = state.filter === "all" || (state.filter === "cards" ? work.hasCards : !work.hasCards);
      const queryMatches = !query || `${work.author} ${work.title} ${work.urn}`.toLocaleLowerCase().includes(query);
      return filterMatches && queryMatches;
    });
  }

  function render() {
    const works = filteredWorks();
    resultCount.textContent = `${works.length.toLocaleString()} ${works.length === 1 ? "work" : "works"}`;
    list.replaceChildren(...works.slice(0, state.limit).map((work) => {
      const link = document.createElement("a");
      link.className = "work-card";
      link.href = `viewer/?work=${encodeURIComponent(work.id)}`;
      const meta = document.createElement("p");
      meta.textContent = work.author;
      const title = document.createElement("h3");
      title.textContent = work.title;
      const urn = document.createElement("code");
      urn.textContent = work.urn;
      const badge = document.createElement("span");
      badge.textContent = work.hasCards ? "Perseus cards" : "CTS chunks";
      link.append(meta, title, urn, badge);
      return link;
    }));
    showMore.hidden = works.length <= state.limit;
    if (!showMore.hidden) showMore.textContent = `Show ${Math.min(PAGE_SIZE, works.length - state.limit)} more works`;
  }

  fetch("catalog.json").then((response) => response.json()).then((catalog) => {
    state.works = catalog.works;
    document.querySelector("#work-count").textContent = catalog.workCount.toLocaleString();
    document.querySelector("#card-count").textContent = catalog.cardWorkCount.toLocaleString();
    render();
  }).catch(() => { resultCount.textContent = "The work catalog could not be loaded."; });

  fetch("statistics.json").then((response) => response.json()).then((statistics) => {
    state.statistics = statistics;
    state.matchMode = statistics.defaultMode || "5";
    document.querySelector("#statistics-match-mode").value = state.matchMode;
    renderStatistics(statistics);
  }).catch(() => {
    document.querySelector("#statistics-note").textContent = "Corpus statistics could not be loaded.";
  });

  document.querySelector("#work-search").addEventListener("input", (event) => { state.query = event.target.value; state.limit = PAGE_SIZE; render(); });
  document.querySelector("#chunk-filter").addEventListener("change", (event) => { state.filter = event.target.value; state.limit = PAGE_SIZE; render(); });
  document.querySelector("#statistics-match-mode").addEventListener("change", (event) => {
    state.matchMode = event.target.value;
    if (state.statistics) renderStatistics(state.statistics);
  });
  document.querySelector("#exclude-new-testament").addEventListener("change", (event) => {
    state.excludeNewTestament = event.target.checked;
    if (state.statistics) renderStatistics(state.statistics);
  });
  showMore.addEventListener("click", () => { state.limit += PAGE_SIZE; render(); });
}());
