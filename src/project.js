import { readFocus } from "./research-focus.js";
import { readTutorHistory } from "./tutor-history.js";
import { filteredRows } from "./import.js";
import { applyAnswerLabels } from "./survey-labels.js";
export const fresh = () => ({
  tutorHistory: Object.create(null),
  includeBotChat: false,
  researchFocus: "",
  format: "data-visualiser",
  version: 1,
  name: "Untitled project",
  datasets: [],
  active: "",
  views: [],
  saved: [],
  linked: true,
  confirmed: [],
  mode: "hints",
});
export function verifyProject(p) {
  if (
    p?.format !== "data-visualiser" ||
    p.version !== 1 ||
    !Array.isArray(p.datasets) ||
    !Array.isArray(p.views) ||
    !Array.isArray(p.saved)
  )
    throw Error("Choose a Data visualiser project download.");
  const safeID = (id) =>
    typeof id === "string" &&
    /^[a-z0-9_-]+$/i.test(id) &&
    !["__proto__", "constructor", "prototype"].includes(id);
  for (const d of p.datasets) {
    if (
      !safeID(d.id) ||
      d.fields?.some((f) => !safeID(f.id)) ||
      d.passages?.some((p) => !safeID(p.id))
    )
      throw Error("Invalid dataset identifiers.");
  }
  const ids = p.datasets.map((d) => d.id);
  const validViews = (views) =>
    Array.isArray(views) &&
    views.every(
      (v) =>
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        (v.items == null || Array.isArray(v.items)) &&
        (v.predictors == null || Array.isArray(v.predictors)),
    );
  if (
    new Set(ids).size !== ids.length ||
    !validViews(p.views) ||
    (p.confirmed !== undefined && !Array.isArray(p.confirmed)) ||
    p.saved.some(
      (s) =>
        !s ||
        !ids.includes(s.dataset) ||
        !validViews(s.views) ||
        s.views.length !== 2,
    )
  )
    throw Error(
      "The project file contains incomplete views or duplicate datasets. Open another saved copy.",
    );
  if (!p.settingsOnly)
    for (const d of p.datasets) {
      if (!d.id || !["text", "table"].includes(d.kind))
        throw Error("Invalid project dataset.");
      if (
        d.kind === "table" &&
        (!Array.isArray(d.rows) ||
          !Array.isArray(d.fields) ||
          !d.fields.length ||
          d.fields.some((f) => !Array.isArray(f.levels)) ||
          d.rows.some((r) => !r || typeof r !== "object"))
      )
        throw Error("Missing table data.");
      if (
        d.kind === "text" &&
        (!Array.isArray(d.passages) ||
          !Array.isArray(d.sources) ||
          d.passages.some(
            (p) => typeof p.text !== "string" || !Array.isArray(p.codes),
          ))
      )
        throw Error("Missing passage data.");
    }
  return {
    ...fresh(),
    ...p,
    researchFocus: readFocus(p.researchFocus),
    includeBotChat: p.includeBotChat === true,
    tutorHistory: readTutorHistory(
      p.tutorHistory,
      p.datasets.map((d) => d.id),
    ),
  };
}
export function settingsProject(p) {
  const { tutorHistory, includeBotChat, datasets, ...settings } = p;
  const copy = { ...settings };
  copy.settingsOnly = true;
  copy.datasets = datasets.map((d) =>
    d.kind === "table"
      ? {
          id: d.id,
          name: d.name,
          kind: d.kind,
          unit: d.unit,
          rules: d.rules,
          fields: d.fields.map(({ levels, ...f }) => ({
            ...f,
            levels: f.type === "ordered" ? levels : [],
          })),
        }
      : { id: d.id, name: d.name, kind: d.kind, unit: d.unit },
  );
  return structuredClone(copy);
}
export function reattach(settings, actual) {
  if (settings.datasets.length !== actual.length)
    throw Error(
      "Import all original datasets first, then reopen this settings file.",
    );
  const seen = new Set();
  const datasets = settings.datasets.map((saved) => {
    const choices = actual.filter(
      (d) => d.kind === saved.kind && d.name === saved.name && !seen.has(d.id),
    );
    if (choices.length !== 1)
      throw Error(
        "Import matching files first. Could not uniquely match " + saved.name,
      );
    const d = structuredClone(choices[0]);
    seen.add(d.id);
    d.id = saved.id;
    d.unit = saved.unit;
    if (d.kind === "table") {
      if (
        saved.fields.length !== d.fields.length ||
        saved.fields.some((f, i) => f.raw !== d.fields[i].raw)
      )
        throw Error("Columns differ in " + d.name);
      for (const [index, field] of d.fields.entries()) {
        const entries = saved.fields[index].answerLabels;
        if (entries && !field.answerLabels)
          applyAnswerLabels(d, field, entries);
      }
      d.fields = d.fields.map((f, i) => ({
        ...f,
        ...saved.fields[i],
        levels: saved.fields[i].levels.length
          ? saved.fields[i].levels
          : f.levels,
      }));
      d.rules = saved.rules;
    }
    return d;
  });
  return { ...settings, settingsOnly: false, datasets };
}
export function linkage(d, t, key, mapping) {
  if (d.kind !== "text" || t.kind !== "table")
    throw Error("Choose a text collection and a table.");
  const index = new Map();
  for (const row of filteredRows(t)) {
    const k = row[key];
    if (!k) continue;
    if (index.has(k)) throw Error("Repeated identifier in the table: " + k);
    index.set(k, row);
  }
  const attrs = {};
  for (const s of d.sources) {
    const row = index.get(mapping[s]);
    if (row)
      attrs[s] = Object.fromEntries(
        t.fields.filter((f) => f.id !== key).map((f) => [f.label, row[f.id]]),
      );
  }
  return attrs;
}
export function renameTheme(project, d, old, name, undoViews) {
  if (!old || !name) throw Error("Choose an existing code and enter a label.");
  for (const entries of [d.coding?.book, d.coding?.meanings]) {
    if (!entries) continue;
    const from = entries.find((e) => e.label === old);
    const into = entries.find((e) => e.label === name);
    if (from && from !== into) {
      if (into) {
        if (!into.definition) into.definition = from.definition;
        entries.splice(entries.indexOf(from), 1);
      } else from.label = name;
    }
  }
  const rename = (c) => (c === old ? name : c);
  for (const p of d.passages) p.codes = [...new Set(p.codes.map(rename))];
  const views = [
    ...project.views,
    ...undoViews.flat(),
    ...project.saved.filter((s) => s.dataset === d.id).flatMap((s) => s.views),
  ];
  for (const v of views) {
    if (v.x === old) v.x = name;
    if (v.y === old) v.y = name;
    if (v.items) v.items = [...new Set(v.items.map(rename))];
    if (v.task === "two" && v.x === v.y) {
      v.task = "one";
      v.y = "";
      v.chart = "bars";
      v.title = "";
      v.annotation = "";
    }
    if (v.highlight === old && old !== name) delete v.highlight;
  }
}
export function dataCount(d) {
  return d.kind === "text"
    ? d.passages.length + " passages"
    : d.rows.length + " records";
}
