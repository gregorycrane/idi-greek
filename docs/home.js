(function () {
  "use strict";
  const PAGE_SIZE = 120;
  const state = { works: [], query: "", filter: "all", limit: PAGE_SIZE };
  const list = document.querySelector("#work-list");
  const resultCount = document.querySelector("#result-count");
  const showMore = document.querySelector("#show-more");

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

  document.querySelector("#work-search").addEventListener("input", (event) => { state.query = event.target.value; state.limit = PAGE_SIZE; render(); });
  document.querySelector("#chunk-filter").addEventListener("change", (event) => { state.filter = event.target.value; state.limit = PAGE_SIZE; render(); });
  showMore.addEventListener("click", () => { state.limit += PAGE_SIZE; render(); });
}());
