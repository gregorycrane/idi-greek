(function () {
  "use strict";
  const PAGE_SIZE = 120;
  const RANK_PAGE_SIZE = 15;
  const state = {
    works: [],
    query: "",
    filter: "all",
    limit: PAGE_SIZE,
    statistics: null,
    corpus: "both",
    matchMode: "5",
    selectedLanguage: null,
    excludeNewTestament: false,
    rankingLimits: {
      worksAbsolute: RANK_PAGE_SIZE,
      worksRelative: RANK_PAGE_SIZE,
      languages: RANK_PAGE_SIZE,
      languageWorks: RANK_PAGE_SIZE,
      languageBooks: RANK_PAGE_SIZE
    }
  };
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

  function resetWorkRankingLimits() {
    state.rankingLimits.worksAbsolute = RANK_PAGE_SIZE;
    state.rankingLimits.worksRelative = RANK_PAGE_SIZE;
    state.rankingLimits.languages = RANK_PAGE_SIZE;
    state.rankingLimits.languageWorks = RANK_PAGE_SIZE;
    state.rankingLimits.languageBooks = RANK_PAGE_SIZE;
  }

  function renderWorkRanking(selector, works, relative, limitKey, buttonSelector) {
    const listElement = document.querySelector(selector);
    const limit = state.rankingLimits[limitKey];
    listElement.replaceChildren(...works.slice(0, limit).map((work) => {
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
    const button = document.querySelector(buttonSelector);
    const remaining = Math.max(0, works.length - limit);
    button.hidden = remaining === 0;
    if (remaining) button.textContent = `Show ${Math.min(RANK_PAGE_SIZE, remaining)} more works`;
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

  function renderLanguageRanking(languages) {
    const limit = state.rankingLimits.languages;
    const listElement = document.querySelector("#languages-ranking");
    listElement.replaceChildren(...languages.slice(0, limit).map((language) => {
      const item = document.createElement("li");
      const name = document.createElement("button");
      name.className = "language-choice";
      name.type = "button";
      name.dataset.language = language.code;
      name.setAttribute("aria-pressed", String(language.code === state.selectedLanguage));
      name.textContent = language.name;
      const code = document.createElement("small");
      code.textContent = language.code;
      name.append(code);
      const books = document.createElement("strong");
      books.textContent = number(language.bookCount);
      books.title = `${number(language.bookCount)} unique quoting books`;
      const quotations = document.createElement("span");
      quotations.textContent = number(language.quotationCount);
      quotations.title = `${number(language.quotationCount)} qualifying quotation passages`;
      item.append(name, books, quotations);
      name.addEventListener("click", () => {
        state.selectedLanguage = language.code;
        state.rankingLimits.languageWorks = RANK_PAGE_SIZE;
        state.rankingLimits.languageBooks = RANK_PAGE_SIZE;
        renderStatistics(state.statistics);
        document.querySelector("#language-details-title").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return item;
    }));
    const button = document.querySelector("#languages-more");
    const remaining = Math.max(0, languages.length - limit);
    button.hidden = remaining === 0;
    if (remaining) button.textContent = `Show ${Math.min(RANK_PAGE_SIZE, remaining)} more languages`;
  }

  function renderLanguageDetails(languages, words, sourceLabel) {
    if (!languages.some((language) => language.code === state.selectedLanguage)) {
      state.selectedLanguage = languages[0]?.code || null;
    }
    const language = languages.find((item) => item.code === state.selectedLanguage);
    const select = document.querySelector("#language-details-select");
    select.replaceChildren(...languages.map((item) => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = `${item.name} (${number(item.bookCount)} books)`;
      return option;
    }));
    select.value = state.selectedLanguage || "";
    if (!language) return;

    document.querySelector("#language-works-title").textContent = `Most quoted ${sourceLabel} works in ${language.name}`;
    document.querySelector("#language-works-note").textContent = `${words}+ word quotation passages; number of distinct ${language.name} books shown below each work`;
    const workLimit = state.rankingLimits.languageWorks;
    document.querySelector("#language-works-ranking").replaceChildren(...language.topWorks.slice(0, workLimit).map((work) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.append(workLink(work, work.title));
      const detail = document.createElement("small");
      detail.textContent = `${work.author} · ${number(work.bookCount)} quoting ${work.bookCount === 1 ? "book" : "books"}`;
      label.append(detail);
      const value = document.createElement("strong");
      value.textContent = number(work.quotationCount);
      value.title = `${number(work.quotationCount)} qualifying quotation passages`;
      item.append(label, value);
      return item;
    }));
    updateRankingMore("#language-works-more", language.topWorks.length, workLimit, "works");

    document.querySelector("#language-books-title").textContent = `${language.name} books containing the most quotations`;
    document.querySelector("#language-books-note").textContent = `${words}+ word quotation passages across the ${sourceLabel} corpus`;
    const bookLimit = state.rankingLimits.languageBooks;
    document.querySelector("#language-books-ranking").replaceChildren(...language.topBooks.slice(0, bookLimit).map((book) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const title = book.url ? document.createElement("a") : document.createElement("span");
      title.textContent = book.title;
      if (book.url) {
        title.href = book.url;
        title.target = "_blank";
        title.rel = "noreferrer";
      }
      label.append(title);
      const detail = document.createElement("small");
      const date = book.date ? `${book.date} · ` : "";
      detail.textContent = `${date}${number(book.workCount)} ${sourceLabel} ${book.workCount === 1 ? "work" : "works"} quoted`;
      label.append(detail);
      const value = document.createElement("strong");
      value.textContent = number(book.quotationCount);
      value.title = `${number(book.quotationCount)} qualifying quotation passages`;
      item.append(label, value);
      return item;
    }));
    updateRankingMore("#language-books-more", language.topBooks.length, bookLimit, "books");
  }

  function updateRankingMore(selector, total, limit, noun) {
    const button = document.querySelector(selector);
    const remaining = Math.max(0, total - limit);
    button.hidden = remaining === 0;
    if (remaining) button.textContent = `Show ${Math.min(RANK_PAGE_SIZE, remaining)} more ${noun}`;
  }

  function renderStatistics(statistics) {
    const view = statistics.views[state.corpus];
    const mode = view.modes[state.matchMode];
    const sourceLabel = view.label;
    const totals = mode.totals;
    const words = mode.matchWords;
    const wordLabel = words === 1 ? "word" : "words";
    document.querySelector("#corpus-heading").textContent = `${sourceLabel} works in the reuse corpus`;
    document.querySelector("#work-count").textContent = number(view.workCount);
    document.querySelector("#card-count").textContent = number(view.cardWorkCount);
    document.querySelector("#word-count").textContent = number(totals.wordCount);
    document.querySelector("#quotation-label").textContent = `${sourceLabel} quotations (${words}+ ${wordLabel})`;
    document.querySelector("#quotation-count").textContent = number(totals.quotationCount);
    document.querySelector("#book-count").textContent = number(totals.uniqueQuotingBooks);
    const languageCount = document.querySelector("#language-count");
    languageCount.textContent = number(totals.quotingLanguageCount);
    languageCount.title = mode.quotingLanguages
      .map((language) => `${language.name}: ${number(language.bookCount)} quoting books`)
      .join("\n");
    document.querySelector("#quoted-word-occurrences").textContent = number(totals.quotedWordOccurrences);
    document.querySelector("#quoted-word-note").textContent = `Words counted once for every qualifying ${words}+ word ${sourceLabel} quotation`;
    document.querySelector("#distinct-quoted-words").textContent = number(totals.distinctQuotedWords);
    document.querySelector("#author-count").textContent = number(totals.authors);
    document.querySelector("#statistics-note").textContent = `${number(totals.works)} works · ${mode.label.toLowerCase()} · likely editions excluded`;
    document.querySelector("#works-absolute-note").textContent = `${sourceLabel} quotation passages containing ${words}+ words`;
    document.querySelector("#authors-absolute-note").textContent = `${sourceLabel} quotation passages containing ${words}+ words`;
    const relativeSuffix = state.excludeNewTestament ? " · New Testament excluded" : "";
    document.querySelector("#works-relative-note").textContent = `${words}+ word ${sourceLabel} quotations per 1,000 source words · works with 1,000+ words${relativeSuffix}`;
    document.querySelector("#authors-relative-note").textContent = `${words}+ word ${sourceLabel} quotations per 1,000 source words · authors with 5,000+ words${relativeSuffix}`;
    document.querySelector("#phrases-title").textContent = `Most quoted ${sourceLabel} ${words}-grams`;
    document.querySelector("#phrases-note").textContent = `Passages containing the complete ${words}-word phrase`;
    renderWorkRanking("#works-absolute", mode.worksAbsolute, false, "worksAbsolute", "#works-absolute-more");
    renderWorkRanking("#works-relative", state.excludeNewTestament ? mode.worksRelativeWithoutNewTestament : mode.worksRelative, true, "worksRelative", "#works-relative-more");
    renderAuthorRanking("#authors-absolute", mode.authorsAbsolute, false);
    renderAuthorRanking("#authors-relative", state.excludeNewTestament ? mode.authorsRelativeWithoutNewTestament : mode.authorsRelative, true);
    renderLanguageRanking(mode.quotingLanguages);
    document.querySelector("#language-details-intro").textContent = `Compare the ${sourceLabel} works cited and the books doing the quoting.`;
    renderLanguageDetails(mode.quotingLanguages, words, sourceLabel);

    document.querySelector("#phrases-ranking").replaceChildren(...mode.phrases.map((phrase) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const params = new URLSearchParams({ work: phrase.workId, phrase: `${phrase.start}-${phrase.stop}`, phraseScope: "work", ngram: String(words) });
      if (phrase.passage) params.set("passage", phrase.passage);
      link.href = `viewer/?${params.toString()}`;
      link.lang = phrase.corpus === "latin" ? "lat" : "grc";
      link.textContent = phrase.text.normalize("NFC");
      const meta = document.createElement("span");
      meta.textContent = `${number(phrase.passages)} passages · ${phrase.author}, ${phrase.title}`;
      item.append(link, meta);
      return item;
    }));
    const minimums = statistics.method.relativeMinimums;
    const newTestamentMethod = state.excludeNewTestament ? " New Testament works are excluded from the two relative rankings." : "";
    document.querySelector("#statistics-method").textContent = `${mode.label} counts detected reuse passages containing at least ${words} source-language words. The ${number(totals.quotingLanguageCount)} quoting-document languages are counted after likely editions and shorter matches are excluded. Relative rankings report qualifying passages per 1,000 source-text words and require at least ${number(minimums.workWords)} words per work and ${number(minimums.authorWords)} words per author.${newTestamentMethod} ${sourceLabel} ${words}-grams are ranked by passages containing the complete phrase. ${number(totals.excludedEditionBooks)} likely edition records (${number(totals.excludedEditionPassages)} passages) were excluded.`;
    document.querySelector(".relative-exclusion").hidden = state.corpus === "latin";
    document.querySelectorAll("[data-corpus]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.corpus === state.corpus));
    });
  }

  function filteredWorks() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.works.filter((work) => {
      const corpusMatches = state.corpus === "both" || work.corpus === state.corpus;
      const filterMatches = state.filter === "all" || (state.filter === "cards" ? work.hasCards : !work.hasCards);
      const queryMatches = !query || `${work.author} ${work.title} ${work.urn}`.toLocaleLowerCase().includes(query);
      return corpusMatches && filterMatches && queryMatches;
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
      badge.textContent = `${work.sourceLanguageName} · ${work.hasCards ? "Perseus cards" : "CTS chunks"}`;
      link.append(meta, title, urn, badge);
      return link;
    }));
    showMore.hidden = works.length <= state.limit;
    if (!showMore.hidden) showMore.textContent = `Show ${Math.min(PAGE_SIZE, works.length - state.limit)} more works`;
  }

  fetch("catalog.json").then((response) => response.json()).then((catalog) => {
    state.works = catalog.works;
    render();
  }).catch(() => { resultCount.textContent = "The work catalog could not be loaded."; });

  fetch("statistics.json?v=combined-corpora-2").then((response) => response.json()).then((statistics) => {
    state.statistics = statistics;
    state.corpus = statistics.defaultCorpus || "both";
    state.matchMode = statistics.defaultMode || "5";
    document.querySelector("#statistics-match-mode").value = state.matchMode;
    renderStatistics(statistics);
  }).catch(() => {
    document.querySelector("#statistics-note").textContent = "Corpus statistics could not be loaded.";
  });

  document.querySelector("#work-search").addEventListener("input", (event) => { state.query = event.target.value; state.limit = PAGE_SIZE; render(); });
  document.querySelectorAll("[data-corpus]").forEach((button) => {
    button.addEventListener("click", () => {
      state.corpus = button.dataset.corpus;
      state.limit = PAGE_SIZE;
      state.selectedLanguage = null;
      resetWorkRankingLimits();
      render();
      if (state.statistics) renderStatistics(state.statistics);
    });
  });
  document.querySelector("#chunk-filter").addEventListener("change", (event) => { state.filter = event.target.value; state.limit = PAGE_SIZE; render(); });
  document.querySelector("#statistics-match-mode").addEventListener("change", (event) => {
    state.matchMode = event.target.value;
    resetWorkRankingLimits();
    if (state.statistics) renderStatistics(state.statistics);
  });
  document.querySelector("#exclude-new-testament").addEventListener("change", (event) => {
    state.excludeNewTestament = event.target.checked;
    resetWorkRankingLimits();
    if (state.statistics) renderStatistics(state.statistics);
  });
  [["#works-absolute-more", "worksAbsolute"], ["#works-relative-more", "worksRelative"]].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener("click", () => {
      state.rankingLimits[key] += RANK_PAGE_SIZE;
      if (state.statistics) renderStatistics(state.statistics);
    });
  });
  document.querySelector("#languages-more").addEventListener("click", () => {
    state.rankingLimits.languages += RANK_PAGE_SIZE;
    if (state.statistics) renderStatistics(state.statistics);
  });
  document.querySelector("#language-details-select").addEventListener("change", (event) => {
    state.selectedLanguage = event.target.value;
    state.rankingLimits.languageWorks = RANK_PAGE_SIZE;
    state.rankingLimits.languageBooks = RANK_PAGE_SIZE;
    if (state.statistics) renderStatistics(state.statistics);
  });
  [["#language-works-more", "languageWorks"], ["#language-books-more", "languageBooks"]].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener("click", () => {
      state.rankingLimits[key] += RANK_PAGE_SIZE;
      if (state.statistics) renderStatistics(state.statistics);
    });
  });
  showMore.addEventListener("click", () => { state.limit += PAGE_SIZE; render(); });
}());
