import { ENGINE_LABELS, ENGINES } from "./engines.js";

const UNMEASURED = new Set(["google_ai_overview"]);

function tally(rows) {
  return {
    domain: rows.filter((row) => row.citesDomain).length,
    page: rows.filter((row) => row.citesPage).length,
    creator: rows.filter((row) => row.citesCreator).length,
  };
}

export function dashboardView(measurements, prompts) {
  const countable = measurements.filter((row) => !UNMEASURED.has(row.engine));
  const beforeRows = countable.filter((row) => row.phase === "before");
  const afterRows = countable.filter((row) => row.phase === "after");
  const engines = ENGINES.map((engine) => {
    if (UNMEASURED.has(engine)) {
      return {
        id: engine,
        label: ENGINE_LABELS[engine],
        before: null,
        after: null,
        unmeasured: true,
        note: "sin API oficial: no se mide",
      };
    }
    return {
      id: engine,
      label: ENGINE_LABELS[engine],
      before: measurements.filter((row) => row.phase === "before" && row.engine === engine && row.citesDomain).length,
      after: measurements.filter((row) => row.phase === "after" && row.engine === engine && row.citesDomain).length,
      unmeasured: false,
      note: "",
    };
  });
  const promptRows = prompts.map((prompt) => {
    const citedBy = afterRows
      .filter((row) => row.promptId === prompt.id && row.citesDomain)
      .map((row) => ENGINE_LABELS[row.engine]);
    return { id: prompt.id, text: prompt.text, citedBy: citedBy.join(", ") };
  });
  return {
    slots: prompts.length * ENGINES.length,
    before: tally(beforeRows),
    after: tally(afterRows),
    engines,
    prompts: promptRows,
  };
}
