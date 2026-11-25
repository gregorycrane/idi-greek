(function () {
  "use strict";

  const multitext = "https://gregorycrane.github.io/persverscomp/";
  const link = (parameters) => {
    const url = new URL(multitext);
    Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.href;
  };

  PerseusNavigation.renderBrowseNavigation({
    mount: "#home-browse-navigation",
    links: [
      { label: "Languages", href: link({ home: "languages" }) },
      { label: "Greek", href: link({ language: "greek" }) },
      { label: "Latin", href: link({ language: "latin" }) },
      { label: "Fragments", href: link({ collection: "aeschylus-fragments" }) },
      { label: "Tragedy", href: link({ genre: "tragedy", language: "greek" }) },
      { label: "All works", href: link({ browse: "all" }) }
    ]
  });
}());
