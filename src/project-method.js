// Written answers belong to the survey that supplied them. Participant tables
// support interview comparisons without becoming a survey workspace.
export function datasetMethod(d, datasets = []) {
  if (d.purpose === "participant-information") return "interview";
  if (d.kind === "table" || d.openAnswers || d.surveySource) return "survey";
  if (d.kind === "text" && d.textPurpose !== "documents") return "interview";
  // Earlier versions named survey-derived text collections with this exact
  // combination before saving the source survey ID explicitly.
  if (
    datasets.some(
      (t) =>
        t.kind === "table" &&
        t.fields?.some((f) => d.name === t.name + " · " + f.label),
    )
  )
    return "survey";
  return "text";
}
export const methodLabels = {
  survey: "Survey",
  interview: "Interview",
  text: "Text",
};
export function projectMethods(p) {
  const methods = new Set(
    (p.datasets || []).map((d) => datasetMethod(d, p.datasets)),
  );
  if (methods.size > 1 && !(methods.has("survey") && methods.has("interview")))
    methods.delete("text");
  return [...methods];
}
export function currentMethod(p) {
  return projectMethods(p)[0] || "";
}
export function workingDatasets(p) {
  return p.datasets.filter((d) => d.purpose !== "participant-information");
}
export function canImport(method, route) {
  if (!method) return route !== "participant-information";
  if (method === "interview")
    return [
      "interview",
      "interview-folder",
      "coded",
      "participant-information",
    ].includes(route);
  if (method === "survey") return ["table", "survey"].includes(route);
  return route === "text";
}

// A historic mixed file remains intact on disk or in browser recovery. Opening
// a method creates a separate working project and retains that method’s charts,
// filters, saved comparisons, conversations and the original dataset IDs.
export function separateMethod(p, method) {
  const methods = projectMethods(p);
  if (!methods.includes(method))
    throw Error("This project uses a different method. Open it from Home.");
  if (methods.length === 1) return p;
  const datasets = p.datasets.filter(
    (d) => datasetMethod(d, p.datasets) === method,
  );
  const ids = new Set(datasets.map((d) => d.id));
  const work = workingDatasets({ datasets });
  const active = work.some((d) => d.id === p.active) ? p.active : work[0]?.id;
  const previous = p.workingViews?.[active];
  const filterById = (entries) =>
    Object.fromEntries(
      Object.entries(entries || {}).filter(([id]) => ids.has(id)),
    );
  const workingViews = filterById(p.workingViews);
  delete workingViews[active];
  return {
    ...p,
    name: p.name + " · " + methodLabels[method],
    datasets,
    active,
    views: active === p.active ? p.views : previous?.views || [],
    linked: active === p.active ? p.linked : (previous?.linked ?? true),
    comparisonStarted:
      active === p.active
        ? p.comparisonStarted
        : previous?.comparisonStarted || false,
    figurePanels:
      active === p.active
        ? p.figurePanels
        : previous?.comparisonStarted
          ? "both"
          : "left",
    workingViews,
    confirmed: (p.confirmed || []).filter((id) => ids.has(id)),
    saved: (p.saved || []).filter((item) => ids.has(item.dataset)),
    savedVisuals: (p.savedVisuals || []).filter((item) =>
      ids.has(item.dataset),
    ),
    tutorHistory: {
      ...(p.tutorHistory?.upload ? { upload: p.tutorHistory.upload } : {}),
      ...filterById(p.tutorHistory),
    },
    ...(p.workLog
      ? {
          workLog: p.workLog.filter(
            (entry) => !entry.dataset || ids.has(entry.dataset),
          ),
        }
      : {}),
  };
}
