(function () {
  "use strict";

  const loading = document.querySelector("#loading-state");
  const main = document.querySelector("#viewer-main");
  const localData = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  const dataRoot = localData
    ? "../quotes/"
    : "https://raw.githubusercontent.com/gregorycrane/idi-greek/main/docs/quotes/";

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}`));
      document.head.append(script);
    });
  }

  async function loadDataScript(source) {
    if (localData) return loadScript(source);
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not load ${source}`);
    const blob = new Blob([await response.text()], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    try {
      await loadScript(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function multitextUrl(parameters = {}) {
    const url = new URL("https://gregorycrane.github.io/persverscomp/");
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.href;
  }

  async function start() {
    const params = new URLSearchParams(location.search);
    const requested = params.get("work");
    const response = await fetch("../catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error("The work catalog could not be loaded.");
    const catalog = await response.json();
    const work = catalog.works.find((item) => item.id === requested);
    if (!work) throw new Error("Choose a work from the catalog to open the viewer.");

    document.title = `${work.name} — Text Reuse Viewer`;
    document.querySelector("#work-title").textContent = work.title;
    document.querySelector("#work-context").textContent = work.author;
    document.querySelector("#work-urn").textContent = work.urn;
    document.querySelector("#shell-work-name").textContent = work.name;
    document.querySelector("#shell-work-urn").textContent = work.urn;
    const multitextLink = document.querySelector("#multitext-link");
    multitextLink.href = multitextUrl({ w: work.id });
    document.querySelector("#shell-work-name").href = multitextLink.href;
    const browseLinks = [
      { label: "Languages", href: multitextUrl({ home: "languages" }) },
      { label: "Greek", href: multitextUrl({ language: "greek" }) },
      {
        label: "Fragments",
        href: work.authorId === "tlg0011"
          ? multitextUrl({ author: "tlg0011", scope: "fragments" })
          : multitextUrl({ collection: "aeschylus-fragments" })
      },
      { label: `All works of ${work.author}`, href: multitextUrl({ author: work.authorId }) },
      { label: "Tragedy", href: multitextUrl({ genre: "tragedy", language: "greek" }) },
      { label: "All works", href: multitextUrl({ browse: "all" }) }
    ];
    const browseNavigation = PerseusNavigation.renderBrowseNavigation({
      mount: "#reuse-browse-navigation",
      links: browseLinks
    });
    PerseusNavigation.initCollapsibleNavigation({
      button: "#toggle-navigation",
      targets: [browseNavigation, "#reuse-work-context", "#passage-navigation"],
      storageKey: "perseus-text-reuse-navigation-hidden"
    });
    const catalogChunkTerm = work.chunkTerm || (work.hasCards ? "card" : "passage");
    document.querySelector("#default-view").textContent = titleCase(catalogChunkTerm);
    document.querySelector("#chunk-count-label").textContent = `${titleCase(catalogChunkTerm)}s`;
    document.querySelector("#tei-source").href = work.tei;
    document.querySelector("#viewer-note").textContent = work.hasCards
      ? "Canonical Perseus card boundaries are used for this work; CTS citations open the card containing the cited passage."
      : "Navigation follows this work’s CTS citation hierarchy; use View by to move between available prose levels.";

    const base = `${dataRoot}${work.authorId}/${work.workId}/`;
    const dataSuffix = work.dataVersion ? `?v=${encodeURIComponent(work.dataVersion)}` : "";
    await loadDataScript(`${base}${work.sequenceFile || "sequence.js"}${dataSuffix}`);
    await loadDataScript(`${base}${work.structureFile || "structure.js"}${dataSuffix}`);
    for (const file of work.trackFiles) await loadDataScript(`${base}${file}${dataSuffix}`);
    if (work.hasCards) await loadDataScript(`${base}card-chunks.js${dataSuffix}`);

    window.universalViewerConfig = {
      authorId: work.authorId,
      workId: work.workId,
      baseUrn: work.urn,
      trackVariables: work.trackFiles.map((file) => file.replace(/\.js$/, "")),
      chunkTerm: work.chunkTerm,
      parentTerm: work.parentTerm,
      unitTerm: work.unitTerm,
      multitextBase: multitextUrl({ w: work.id })
    };
    if (work.dataNotice) {
      const notice = document.querySelector("#data-notice");
      notice.textContent = work.dataNotice;
      notice.hidden = false;
    }
    main.hidden = false;
    document.querySelector("#passage-navigation").hidden = false;
    loading.remove();
    await loadScript("universal-reuse-viewer.js?v=language-periods-1");
  }

  start().catch((error) => {
    loading.className = "loading-state error-state";
    loading.innerHTML = `<strong>Viewer unavailable</strong><span>${error.message}</span><a href="../">Return to all works</a>`;
  });
}());
