(function () {
  "use strict";

  // Editable policy for separating editions from sources that quote Homer.
  // Patterns are case-insensitive regular expressions. Add exceptional volumes
  // to overrides by work ID and HathiTrust track ID.
  window.sourceClassificationConfig = {
    version: "1.0.0",
    alignmentEdition: {
      minCoverage: 0.40,
      maxFirstPosition: 0.05,
      minLastPosition: 0.95
    },
    anthologyPatterns: [
      "\\bantholog",
      "\\bchrestomath",
      "\\bselections?\\b",
      "\\bgolden treasury\\b",
      "\\bexamination papers?\\b",
      "\\bextracts?\\b"
    ],
    partialEditionPatterns: [
      "\\b(?:books?|libri?|rhapsodi(?:a|ae))\\s+[ivxlcdm0-9]+\\s*[-–—]\\s*[ivxlcdm0-9]+\\b",
      "\\b(?:books?|libri?)\\s+[ivxlcdm0-9]+\\s+(?:and|et)\\s+[ivxlcdm0-9]+\\b"
    ],
    works: {
      tlg001: {
        authorPatterns: ["^homer\\b"],
        titlePatterns: ["\\biliad\\b", "\\bilias\\b", "\\biliade\\b"]
      },
      tlg002: {
        authorPatterns: ["^homer\\b"],
        titlePatterns: ["\\bodyssey\\b", "\\bodyssea\\b", "\\bodyssee\\b", "\\bodysseia\\b"]
      }
    },
    overrides: {
      tlg001: {},
      tlg002: {
        "32044085078111": {
          kind: "anthology",
          reason: "Greek chrestomathy containing selected passages."
        }
      }
    }
  };
}());
