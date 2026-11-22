export const fresh = () => ({
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
  if (!p.settingsOnly)
    for (const d of p.datasets) {
      if (!d.id || !["text", "table"].includes(d.kind))
        throw Error("Invalid project dataset.");
      if (
        d.kind === "table" &&
        (!Array.isArray(d.rows) || !Array.isArray(d.fields))
      )
        throw Error("Missing table data.");
      if (
        d.kind === "text" &&
        (!Array.isArray(d.passages) || !Array.isArray(d.sources))
      )
        throw Error("Missing passage data.");
    }
  return { ...fresh(), ...p };
}
export function settingsProject(p) {
  const copy = structuredClone(p);
  copy.settingsOnly = true;
  copy.datasets = copy.datasets.map((d) =>
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
  return copy;
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
  for (const row of t.rows) {
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
export function dataCount(d) {
  return d.kind === "text"
    ? d.passages.length + " passages"
    : d.rows.length + " records";
}
