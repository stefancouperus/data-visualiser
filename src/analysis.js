import { patternSummary } from "./patterns.js";
import { bin } from "d3";
import { filteredRows } from "./import.js";
export const kinds = {
  bars: "Bar chart",
  dots: "Dot plot",
  stack: "100% stacked bars",
  grid: "Heatmap",
  table: "Data table",
  hist: "Histogram",
  scatter: "Scatterplot",
  line: "Line chart",
  small: "Small multiples",
  presence: "Presence grid",
  excerpts: "Read excerpts",
  model: "Fitted model",
};
export const allCodes = (d) => [...new Set(d.passages.flatMap((p) => p.codes))];
export function newView(d) {
  if (d.kind === "text")
    return {
      x: allCodes(d)[0] || "",
      y: "",
      chart: allCodes(d).length ? "bars" : "excerpts",
      task: "one",
      measure: "passages",
      title: "",
      style: "workshop",
      palette: "colour",
    };
  const fields = d.fields.filter((f) => f.type !== "metadata"),
    x =
      (d.qual &&
        fields.find(
          (f) =>
            f.levels.length > 1 &&
            ["category", "ordered", "number"].includes(f.type),
        )) ||
      fields[0] ||
      d.fields[0];
  return {
    x: x.id,
    y: "",
    chart:
      x.type === "number" ? "hist" : x.type === "text" ? "excerpts" : "bars",
    task: "one",
    measure: "count",
    title: "",
    style: "workshop",
    palette: "colour",
  };
}
export function analyse(d, v) {
  if (v.task === "patterns") return patternSummary(d, v);
  if (d.kind === "text") return qualitative(d, v);
  const f = (k) => d.fields.find((a) => a.id === k),
    x = f(v.x),
    y = f(v.y),
    z = f(v.z);
  if (!x) throw Error("Choose a variable.");
  const rows = filteredRows(d).filter(
    (r) => !v.filter || r[v.filter] === v.value,
  );
  const base = {
    title: v.title || x.label + (y ? " by " + y.label : ""),
    series: "",
    x: x.label,
    unit: d.unit === "response" ? "Responses" : d.unit + " records",
    n: rows.length,
    records: [],
    points: [],
    note: "",
    excerpt: [],
  };
  if (v.chart === "excerpts") {
    base.excerpt = rows
      .filter(
        (r) =>
          r[x.id] &&
          (!v.query || r[x.id].toLowerCase().includes(v.query.toLowerCase())),
      )
      .map((r) => ({ source: y ? r[y.id] : d.name, text: r[x.id], codes: [] }));
    base.note = base.excerpt.length + " written answers in this selection.";
    return base;
  }
  if (v.chart === "scatter" || v.chart === "line") {
    const asX = (r) =>
      x.type === "date" ? Date.parse(r[x.id]) : Number(r[x.id]);
    base.points = rows
      .filter(
        (r) =>
          r[x.id] !== "" &&
          y &&
          r[y.id] !== "" &&
          Number.isFinite(asX(r)) &&
          Number.isFinite(Number(r[y.id])),
      )
      .map((r) => ({ a: asX(r), b: Number(r[y.id]), g: z ? r[z.id] : "" }));
    base.y = y?.label || "";
    base.date = x.type === "date";
    base.note = base.points.length + " paired observations.";
    return base;
  }
  if (v.chart === "hist") {
    const ns = rows
      .filter((r) => r[x.id] !== "" && Number.isFinite(+r[x.id]))
      .map((r) => +r[x.id]);
    if (ns.length)
      base.records = bin()
        .thresholds(Math.min(12, Math.ceil(Math.sqrt(ns.length))))(ns)
        .map((b) => ({
          label: b.x0 === b.x1 ? String(b.x0) : b.x0 + "–" + b.x1,
          group: "",
          lo: b.x0,
          hi: b.x1,
          den: ns.length,
          value:
            v.measure === "percent" ? (100 * b.length) / ns.length : b.length,
          n: b.length,
        }));
    base.unit = v.measure === "percent" ? "% of valid responses" : "Records";
    base.note =
      ns.length +
      " valid numerical answers of " +
      rows.length +
      " selected records.";
    return base;
  }
  const cross = v.task !== "one" && y,
    multi = x.type === "multiple",
    picks = (r) =>
      multi
        ? r[x.id]
            .split(x.separator || ";")
            .map((s) => s.trim())
            .filter(Boolean)
        : [r[x.id]];
  const valid = rows.filter((r) => r[x.id] && (!cross || r[y.id]));
  const tally = new Map(),
    observed = new Set();
  for (const row of valid) {
    const group = cross ? row[y.id] : "";
    if (!tally.has(group)) tally.set(group, { den: 0, counts: new Map() });
    const entry = tally.get(group);
    entry.den++;
    for (const label of new Set(picks(row))) {
      observed.add(label);
      entry.counts.set(label, (entry.counts.get(label) || 0) + 1);
    }
  }
  const labels = [
    ...new Set([
      ...(x.levels || []).filter(
        (s) => !multi && (x.type === "ordered" || observed.has(s)),
      ),
      ...observed,
    ]),
  ];
  if (tally.size * labels.length > 20000)
    throw Error(
      "This comparison has over 20,000 cells. Choose a grouping question with fewer distinct answers or narrow the selection.",
    );
  for (const [group, entry] of tally) {
    for (const label of labels) {
      const n = entry.counts.get(label) || 0;
      base.records.push({
        group,
        label,
        n,
        den: entry.den,
        value:
          (v.measure === "percent" || v.chart === "stack") && entry.den
            ? (100 * n) / entry.den
            : n,
      });
    }
  }
  base.unit =
    v.measure === "percent" || v.chart === "stack"
      ? d.unit === "response"
        ? "% of valid responses"
        : "% of valid " + d.unit + " records"
      : d.unit === "response"
        ? "Responses"
        : d.unit + " records";
  base.note =
    valid.length +
    " valid of " +
    rows.length +
    " selected " +
    d.unit +
    " records." +
    (multi ? " Multiple selections can exceed 100%." : "") +
    (cross ? " Percentages use the valid responses within each group." : "");
  return base;
}
function qualitative(d, v) {
  let sources = d.sources.filter(
    (s) =>
      !v.filter ||
      (v.filter === "source" ? s : d.metadata?.[s]?.[v.filter]) === v.value,
  );
  const bySource = new Map(
    sources.map((source) => [source, { total: 0, codes: new Map() }]),
  );
  const selected = d.passages.filter((p) => bySource.has(p.source));
  for (const p of selected) {
    const row = bySource.get(p.source);
    row.total++;
    for (const code of new Set(p.codes))
      row.codes.set(code, (row.codes.get(code) || 0) + 1);
  }
  const codes = allCodes(d);
  const base = {
    title:
      v.title ||
      (v.task === "two"
        ? "Code overlap"
        : v.task === "group"
          ? "Codes across sources"
          : v.x || "Written passages"),
    unit: v.measure === "sources" ? "Sources" : "Passages",
    n: sources.length,
    records: [],
    points: [],
    excerpt: [],
    note: "",
  };
  if (v.chart === "excerpts") {
    base.excerpt = selected.filter(
      (p) =>
        (!v.x || p.codes.includes(v.x)) &&
        (!v.query || p.text.toLowerCase().includes(v.query.toLowerCase())),
    );
    base.note = base.excerpt.length + " passages shown.";
    return base;
  }
  if (v.task === "two") {
    let units = selected;
    if (v.measure === "sources")
      units = Array.from(bySource.values(), (row) => ({
        codes: [...row.codes.keys()],
      }));
    for (const [label, a, b] of [
      [v.x + " only", true, false],
      ["Both", true, true],
      [v.y + " only", false, true],
    ]) {
      const n = units.filter(
        (p) => p.codes.includes(v.x) === a && p.codes.includes(v.y) === b,
      ).length;
      base.records.push({ label, group: "", value: n, n });
    }
  } else if (v.task === "group") {
    base.unit =
      v.chart === "presence"
        ? "Presence (1 = present, 0 = absent)"
        : "Passages";
    if (sources.length * codes.length > 20000)
      throw Error(
        "This grid has over 20,000 cells. Narrow the selection to fewer sources.",
      );
    for (const source of sources)
      for (const code of codes) {
        const n = bySource.get(source).codes.get(code) || 0;
        base.records.push({
          label: code,
          group: source,
          n,
          value: v.chart === "presence" ? Number(n > 0) : n,
        });
      }
  } else
    for (const source of sources) {
      const row = bySource.get(source);
      const n = v.x ? row.codes.get(v.x) || 0 : row.total;
      base.records.push({
        label: source,
        group: "",
        n,
        value: v.measure === "sources" ? Number(n > 0) : n,
      });
    }
  if (v.x && v.task === "one") {
    base.themeCounts = {
      code: v.x,
      matchingPassages: base.records.reduce((n, r) => n + r.n, 0),
      interviewsWithCode: base.records.filter((r) => r.n > 0).length,
      listedInterviews: sources.length,
    };
  }
  base.note =
    sources.length +
    " listed sources · " +
    selected.filter((p) => p.reviewed).length +
    " of " +
    selected.length +
    " imported passages reviewed. Zero means no matching coded passage.";
  return base;
}
