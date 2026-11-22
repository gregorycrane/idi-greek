(function () {
  "use strict";

  const policy = window.sourceClassificationConfig;

  function matches(value, patterns) {
    return patterns.some((pattern) => new RegExp(pattern, "iu").test(value));
  }

  function alignmentMetrics(track, workLength) {
    const spans = track.notes
      .map((note) => [Math.max(0, note.start), Math.min(workLength - 1, note.stop)])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let currentStart = null;
    let currentStop = null;

    spans.forEach(([start, stop]) => {
      if (currentStart === null) {
        currentStart = start;
        currentStop = stop;
      } else if (start <= currentStop + 1) {
        currentStop = Math.max(currentStop, stop);
      } else {
        covered += currentStop - currentStart + 1;
        currentStart = start;
        currentStop = stop;
      }
    });
    if (currentStart !== null) covered += currentStop - currentStart + 1;

    return {
      coverage: covered / workLength,
      firstPosition: spans.length ? spans[0][0] / workLength : 1,
      lastPosition: spans.length
        ? spans.reduce((maximum, span) => Math.max(maximum, span[1]), 0) / workLength
        : 0
    };
  }

  function result(kind, reason, metrics) {
    const labels = {
      edition: "Full edition",
      "partial-edition": "Partial edition",
      anthology: "Anthology",
      quotation: "Quotation"
    };
    return {
      kind,
      label: labels[kind],
      isEdition: kind === "edition" || kind === "partial-edition",
      reason,
      ruleVersion: policy.version,
      metrics
    };
  }

  function classify({ track, workId, workLength }) {
    const metrics = alignmentMetrics(track, workLength);
    const override = policy.overrides[workId] && policy.overrides[workId][track.id];
    if (override) return result(override.kind, `Explicit override: ${override.reason}`, metrics);

    const name = track.name || "";
    if (matches(name, policy.anthologyPatterns)) {
      return result("anthology", "Title identifies a collection of selected passages.", metrics);
    }

    const work = policy.works[workId];
    const isNamedEdition = work
      && matches(name, work.authorPatterns)
      && matches(name, work.titlePatterns);
    if (isNamedEdition && matches(name, policy.partialEditionPatterns)) {
      return result("partial-edition", "Homer edition whose title specifies only part of the work.", metrics);
    }
    if (isNamedEdition) {
      return result("edition", "Homer is the author and the title names this work.", metrics);
    }

    const threshold = policy.alignmentEdition;
    if (
      metrics.coverage >= threshold.minCoverage
      && metrics.firstPosition <= threshold.maxFirstPosition
      && metrics.lastPosition >= threshold.minLastPosition
    ) {
      return result("edition", "Alignment spans most of the work from beginning to end.", metrics);
    }

    return result("quotation", "No edition rule matched.", metrics);
  }

  window.sourceClassifier = { classify, policy };
}());
