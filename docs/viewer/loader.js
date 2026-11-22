(function () {
  "use strict";

  const loading = document.querySelector("#loading-state");
  const main = document.querySelector("#viewer-main");

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}`));
      document.head.append(script);
    });
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  async function start() {
    const params = new URLSearchParams(location.search);
    const requested = params.get("work");
    const response = await fetch("../catalog.json");
    if (!response.ok) throw new Error("The work catalog could not be loaded.");
    const catalog = await response.json();
    const work = catalog.works.find((item) => item.id === requested);
    if (!work) throw new Error("Choose a work from the catalog to open the viewer.");

    document.title = `${work.name} — Text Reuse Viewer`;
    document.querySelector("#work-title").textContent = work.title;
    document.querySelector("#work-context").textContent = work.author;
    document.querySelector("#work-urn").textContent = work.urn;
    const catalogChunkTerm = work.chunkTerm || (work.hasCards ? "card" : "passage");
    document.querySelector("#default-view").textContent = titleCase(catalogChunkTerm);
    document.querySelector("#chunk-count-label").textContent = `${titleCase(catalogChunkTerm)}s`;
    document.querySelector("#tei-source").href = work.tei;
    document.querySelector("#viewer-note").textContent = work.hasCards
      ? "Canonical Perseus card boundaries are used for this work; CTS citations open the card containing the cited passage."
      : "Navigation follows this work’s CTS citation structure; compact line-level works are grouped into readable passages.";

    const base = `../quotes/${work.authorId}/${work.workId}/`;
    await loadScript(`${base}sequence.js`);
    await loadScript(`${base}structure.js`);
    for (const file of work.trackFiles) await loadScript(`${base}${file}`);
    if (work.hasCards) await loadScript(`${base}card-chunks.js`);

    window.universalViewerConfig = {
      authorId: work.authorId,
      workId: work.workId,
      baseUrn: work.urn,
      trackVariables: work.trackFiles.map((file) => file.replace(/\.js$/, "")),
      chunkTerm: work.chunkTerm,
      parentTerm: work.parentTerm,
      unitTerm: work.unitTerm
    };
    main.hidden = false;
    loading.remove();
    await loadScript("universal-reuse-viewer.js?v=universal-1");
  }

  start().catch((error) => {
    loading.className = "loading-state error-state";
    loading.innerHTML = `<strong>Viewer unavailable</strong><span>${error.message}</span><a href="../">Return to all works</a>`;
  });
}());
