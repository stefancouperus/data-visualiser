// Keep a chronological record of committed work. The observer is per in-memory
// project; rereading a saved project starts with its already recorded state.
import { kinds } from "./analysis.js";
import {
  figurePresentation,
  figureScope,
  modelDisplayTerm,
} from "./figure-edits.js";
import { pairedStatistics, categoricalPattern } from "./tutor-evidence.js";

const observed = new WeakMap();
const quote = (value) => "“" + value + "”";
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function readWorkLog(log) {
  if (!Array.isArray(log)) return [];
  return log
    .filter(
      (e) =>
        e &&
        typeof e.title === "string" &&
        typeof e.at === "string" &&
        Number.isFinite(Date.parse(e.at)) &&
        Array.isArray(e.details),
    )
    .map((e) => ({
      at: e.at,
      dataset: typeof e.dataset === "string" ? e.dataset : "",
      source: typeof e.source === "string" ? e.source : "",
      title: e.title,
      details: e.details.filter((line) => typeof line === "string"),
      ...(Array.isArray(e.presentedPanels) && {
        presentedPanels: [
          ...new Set(
            e.presentedPanels.filter((index) => index === 0 || index === 1),
          ),
        ],
      }),
    }));
}
export function recordWork(p, d, title, details = []) {
  (p.workLog ||= []).push({
    at: new Date().toISOString(),
    dataset: d?.id || "",
    source: d?.name || "",
    title,
    details: details.filter((s) => typeof s === "string" && s.trim()),
    ...(title.startsWith("Saved comparison ") && { presentedPanels: [0, 1] }),
  });
}
function surveyState(d) {
  return {
    rows: d.rows.length,
    unit: d.unit,
    fields: d.fields.map((f) => [f.label, f.type, ...(f.roles || [])]),
    rules: (d.rules || []).map((r) => [
      d.fields.find((f) => f.id === r.field)?.label || r.field,
      r.value,
    ]),
  };
}
function textState(d) {
  const assigned = [],
    selected = [],
    reviewed = [];
  for (const p of d.passages) {
    if (p.codes.length) assigned.push([p.id, ...p.codes]);
    if (p.codingIncluded !== undefined) selected.push([p.id, p.codingIncluded]);
    if (p.reviewed) reviewed.push(p.id);
  }
  return {
    sources: [...d.sources],
    book: (d.coding?.book || []).map((e) => [
      typeof e === "string" ? e : e.label,
      e.definition || "",
    ]),
    mode: d.coding?.mode,
    styles: (d.coding?.labelStyles || []).map((e) => [
      e.label,
      e.colour,
      e.category,
    ]),
    categories: [...(d.coding?.categories || [])],
    done: [...(d.interviews?.done || [])],
    assigned,
    selected,
    reviewed,
  };
}
const snapshot = (d) => (d.kind === "table" ? surveyState(d) : textState(d));
const count = (n, noun, plural = noun + "s") =>
  n + " " + (n === 1 ? noun : plural);
function dataDescription(d) {
  return d.kind === "table"
    ? count(d.rows.length, "record") +
        " and " +
        count(d.fields.length, "field") +
        "."
    : count(d.sources.length, "source") + " in this collection.";
}
function surveyChanges(p, d, old, next) {
  if (old.rows !== next.rows || old.unit !== next.unit)
    recordWork(p, d, "Updated survey records", [
      count(next.rows, "record") + ". Unit of observation: " + next.unit + ".",
    ]);
  if (!equal(old.fields, next.fields)) {
    const changed = next.fields.filter((f, i) => !equal(f, old.fields[i]));
    const descriptions = changed
      .slice(0, 6)
      .map(
        ([name, type, ...roles]) =>
          quote(name) + " — " + [type, ...roles].join(", "),
      );
    if (changed.length > 6)
      descriptions.push(
        count(changed.length - 6, "other field") + " also changed.",
      );
    recordWork(p, d, "Updated survey fields or question roles", descriptions);
  }
  if (!equal(old.rules, next.rules)) {
    // A rule's value may itself be a name or a verbatim response.
    const fields = [...new Set(next.rules.map((r) => r[0]))].map(quote);
    recordWork(p, d, "Changed survey exclusions", [
      fields.length
        ? count(next.rules.length, "exclusion rule") +
          " using " +
          fields.join(", ") +
          "."
        : "All project exclusion rules were removed.",
    ]);
  }
}
function textChanges(p, d, old, next) {
  if (!equal(old.sources, next.sources))
    recordWork(p, d, "Updated the source list", [
      count(next.sources.length, "source") + " in this collection.",
    ]);
  if (
    !equal(old.book, next.book) ||
    (next.book.length && next.mode !== old.mode)
  ) {
    const labels = next.book.map(([label]) => label);
    const added = labels.filter((l) => !old.book.some(([v]) => v === l));
    const removed = old.book
      .map(([label]) => label)
      .filter((l) => !labels.includes(l));
    recordWork(p, d, "Updated the approved codebook", [
      count(labels.length, "approved label") +
        (next.mode ? " · " + next.mode + " coding." : "."),
      added.length && "Added: " + added.map(quote).join(", ") + ".",
      removed.length && "Removed: " + removed.map(quote).join(", ") + ".",
    ]);
  } else if (
    !equal(old.categories, next.categories) ||
    !equal(old.styles, next.styles)
  ) {
    recordWork(
      p,
      d,
      "Updated label colours or categories",
      next.categories.length
        ? ["Categories: " + next.categories.join(", ") + "."]
        : [],
    );
  }
  if (!equal(old.selected, next.selected))
    recordWork(p, d, "Changed the passages included for coding", [
      count(next.selected.filter(([, v]) => !v).length, "passage") +
        " explicitly excluded.",
    ]);
  if (
    !equal(old.assigned, next.assigned) ||
    !equal(old.reviewed, next.reviewed)
  ) {
    const n = next.assigned.reduce((sum, row) => sum + row.length - 1, 0);
    recordWork(p, d, "Updated passage coding", [
      count(n, "label assignment") +
        " on saved passages and highlighted quotations. This counts each stored label assignment once.",
    ]);
  }
  if (!equal(old.done, next.done)) {
    const checked = next.done.filter((source) => !old.done.includes(source));
    const reopened = old.done.filter((source) => !next.done.includes(source));
    recordWork(p, d, "Updated interview review", [
      checked.length && "Checked: " + checked.map(quote).join(", ") + ".",
      reopened.length &&
        "Reopened for review: " + reopened.map(quote).join(", ") + ".",
      next.done.length +
        " of " +
        next.sources.length +
        " interviews marked as checked.",
    ]);
  }
}
export function startProjectLog(p, summarise) {
  if (summarise && p.workLog?.length) refreshSavedFigureLogs(p, summarise);
  observed.set(p, {
    focus: p.researchFocus || "",
    confirmed: [...(p.confirmed || [])],
    sets: new Map(p.datasets.map((d) => [d.id, snapshot(d)])),
  });
  if (p.datasets.length && !p.workLog?.length)
    recordWork(p, null, "Opened an existing project", [
      "The activity log starts here. Earlier work is reflected in the saved data and figures.",
    ]);
}
export function syncProjectLog(p) {
  let state = observed.get(p);
  if (!state) {
    state = { focus: "", confirmed: [], sets: new Map() };
    observed.set(p, state);
  }
  if (state.focus !== (p.researchFocus || "")) {
    state.focus = p.researchFocus || "";
    recordWork(
      p,
      null,
      state.focus
        ? "Set the research question or puzzle"
        : "Cleared the research focus",
      [state.focus],
    );
  }
  for (const d of p.datasets) {
    const old = state.sets.get(d.id);
    if (old && d.id !== p.active) continue;
    const next = snapshot(d);
    if (!old) recordWork(p, d, "Added a dataset", [dataDescription(d)]);
    else if (d.kind === "table") surveyChanges(p, d, old, next);
    else textChanges(p, d, old, next);
    state.sets.set(d.id, next);
  }
  for (const id of p.confirmed || []) {
    if (!state.confirmed.includes(id)) {
      const d = p.datasets.find((d) => d.id === id);
      if (d)
        recordWork(p, d, "Confirmed data for exploration", [
          dataDescription(d),
        ]);
    }
  }
  state.confirmed = [...(p.confirmed || [])];
  return p.workLog || [];
}
const number = (n) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n);
// Use the same four significant figures as the on-screen coefficient table.
const modelNumber = (n) => Number(n.toPrecision(4)).toString();
// Record aggregate outputs exactly as calculated for this view. In particular
// no chat, individual survey records, point coordinates or excerpts are copied.
export function describeFigure(a, view = {}, legacy = false) {
  if (!a) return [];
  const lines = [];
  const {
    records: rows,
    named,
    field,
  } = figurePresentation(
    a,
    legacy ? { ...view, figureEdits: undefined } : view,
  );
  const coefficient = legacy ? number : modelNumber;
  if (a.themeComparison?.unit === "themePassageShare") {
    for (const r of rows.filter((r) => r.n > 0).slice(0, 3)) {
      const grouped = a.themeComparison.grouped;
      lines.push(
        quote(named(grouped ? "subgroups" : "groups", r.groupValue)) +
          " contributed " +
          r.n +
          " of the " +
          r.den +
          " included passages coded with " +
          quote(named(grouped ? "groups" : "labels", r.label)) +
          " (" +
          number(r.value) +
          "%).",
      );
    }
  } else if (a.themeComparison && !a.themeComparison.grouped) {
    for (const r of rows.filter((r) => !r.undefinedShare).slice(0, 3)) {
      const share =
        a.themeComparison.unit === "passageShare" && r.den
          ? " (" + number(r.value) + "%)"
          : "";
      lines.push(
        quote(named("labels", r.label)) +
          " was coded in " +
          r.n +
          " of " +
          r.den +
          " included passages" +
          share +
          " in " +
          quote(named("groups", r.group)) +
          ".",
      );
    }
  } else if (a.largestDisplayedDifference) {
    const { pattern, high, low, percentagePoints } =
      a.largestDisplayedDifference;
    lines.push(
      quote(named("groups", pattern)) +
        " differed by " +
        number(percentagePoints) +
        " percentage points between " +
        quote(named("subgroups", high.group)) +
        " (" +
        high.n +
        " of " +
        high.den +
        ") and " +
        quote(named("subgroups", low.group)) +
        " (" +
        low.n +
        " of " +
        low.den +
        ").",
    );
  } else if (a.themeCounts) {
    const t = a.themeCounts;
    lines.push(
      quote(named("codes", t.code)) +
        " occurred in " +
        count(t.matchingPassages, "original passage") +
        " across " +
        count(t.interviewsWithCode, "source") +
        ".",
    );
  } else if (a.coefficients) {
    const c = a.coefficients.find(
      (r) => r.term !== "Intercept" && r.term !== "(Intercept)",
    );
    if (c)
      lines.push(
        "Fitted " +
          (a.method || "model").toLowerCase() +
          " coefficient for " +
          quote(legacy ? c.term : modelDisplayTerm(c.term, a, view)) +
          ": " +
          coefficient(c.estimate) +
          " (95% interval " +
          coefficient(c.low) +
          " to " +
          coefficient(c.high) +
          ").",
      );
  } else if (a.points?.length) {
    const paired = pairedStatistics(a.points);
    if (
      view.chart === "scatter" &&
      !a.date &&
      paired.completePairs >= 3 &&
      paired.pearsonR !== null &&
      !view.z
    )
      lines.push(
        "Across " +
          paired.completePairs +
          " paired observations, the linear association between " +
          quote(field("axisX", a.x)) +
          " and " +
          quote(field("axisY", a.y)) +
          " had Pearson’s r = " +
          number(paired.pearsonR) +
          ".",
      );
    else {
      let min = Infinity,
        max = -Infinity;
      for (const point of a.points) {
        min = Math.min(min, point.b);
        max = Math.max(max, point.b);
      }
      lines.push(
        "Across the plotted observations, " +
          quote(field("axisY", a.y)) +
          " ranged from " +
          number(min) +
          " to " +
          number(max) +
          ".",
      );
    }
  } else if (view.chart === "box") {
    for (const r of rows.filter((r) => Number.isFinite(r.median)).slice(0, 3))
      lines.push(
        quote(named("labels", r.label)) +
          " had a median of " +
          number(r.median) +
          " (" +
          count(r.n, "answer") +
          ").",
      );
  } else if (view.task === "words") {
    for (const r of rows.slice(0, 3))
      lines.push(
        quote(r.label) +
          " appeared " +
          count(r.n, "time") +
          " in " +
          count(r.passageCount, "passage") +
          ".",
      );
  } else if (view.chart !== "excerpts" && rows.length) {
    const gap =
      ["two", "group"].includes(view.task) &&
      categoricalPattern(rows)?.largestObservedShareDifference;
    if (gap && gap.percentagePointGap > 0) {
      lines.push(
        "The largest observed gap between group shares was for " +
          quote(named("labels", gap.label)) +
          ": " +
          gap.higher.n +
          " of " +
          gap.higher.den +
          " in " +
          quote(named("groups", gap.higher.group)) +
          " and " +
          gap.lower.n +
          " of " +
          gap.lower.den +
          " in " +
          quote(named("groups", gap.lower.group)) +
          " (" +
          number(gap.percentagePointGap) +
          " percentage points).",
      );
    }
    // Select up to three displayed entries, retaining a group name and the
    // count even when the scale is binary or the result is a percentage.
    for (const r of rows
      .filter((r) => Number.isFinite(r.n) && !r.undefinedShare)
      .slice(0, gap?.percentagePointGap > 0 ? 0 : 3)) {
      const label = [
        (legacy || !a.groupLabel) && named("labels", r.label),
        named("groups", r.group),
        named("subgroups", r.groupValue),
      ]
        .filter(Boolean)
        .map(quote)
        .join(" · ");
      if (!label) continue;
      if (Number.isFinite(r.den) && r.den > 0)
        lines.push(
          label +
            " — " +
            r.n +
            " of " +
            r.den +
            " (" +
            number((100 * r.n) / r.den) +
            "%).",
        );
      else
        lines.push(
          label +
            " — " +
            number(r.value) +
            " " +
            field("unit", a.unit || "observations") +
            ".",
        );
    }
  }
  if (a.note) lines.push((legacy && a.legacyNote) || a.note);
  return lines;
}
const figureEvents = new Set([
  "Edited a visual",
  "Explored a visual",
  "Created a visual with the Data bot",
  "Confirmed the questions or themes for a visual",
  "Changed the chart type",
  "Explored a selection of questions or themes",
]);

// Older entries with changed counts have no underlying result snapshot. For
// a matching figure, an exact quoted label can still be replaced while leaving
// historical numbers intact. An ambiguous label is withheld.
function repairQuotedLabels(details, start, view) {
  const aliases = new Map();
  for (const dim of Object.values(view.figureEdits?.dimensions || {})) {
    for (const [key, label] of dim?.names || []) {
      if (typeof key !== "string" || typeof label !== "string") continue;
      aliases.set(
        key,
        aliases.has(key) && aliases.get(key) !== label
          ? "Label withheld"
          : label,
      );
    }
  }
  if (!aliases.size) return false;
  let changed = false;
  for (let i = start; i < details.length; i++) {
    if (/^(Caption:|Student interpretation:|Left:|Right:)/.test(details[i]))
      break;
    const revised = details[i].replace(/“([^“”]+)”/g, (match, key) =>
      aliases.has(key) ? quote(aliases.get(key)) : match,
    );
    if (revised !== details[i]) {
      details[i] = revised;
      changed = true;
    }
  }
  return changed;
}

// Legacy entries stored prose only. Match the complete original calculation and
// its owner before updating the generated lines. Never rewrite a student's text
// or attribute a later calculation to an earlier set of observations.
function updateFigureEntries(log, dataset, view, analysis, owner, index = 0) {
  const aliases = view.figureEdits?.scope === figureScope(view);
  if (!aliases && !analysis.coefficients) return;
  const original = describeFigure(analysis, view, true);
  const revised = describeFigure(analysis, view);
  if (!original.length || (!aliases && equal(original, revised))) return;
  if (!aliases && !original[0].endsWith(": 0 (95% interval 0 to 0).")) return;
  for (const e of log) {
    if (e.dataset !== dataset) continue;
    let start;
    if (
      owner?.view &&
      e.title === "Saved a visual" &&
      e.details[0] === "Saved as " + quote(owner.name) + "."
    )
      start = 2;
    else if (owner?.views && e.title === "Saved comparison " + owner.name) {
      const panel = e.details.indexOf(
        (index ? "Right: " : "Left: ") + analysis.title,
      );
      if (panel < 0) continue;
      start = panel + 1;
    } else if (
      figureEvents.has(e.title) &&
      e.details[0] ===
        [kinds[view.chart], analysis.title].filter(Boolean).join(" · ")
    )
      start = 1;
    else continue;
    const panel = e.title.startsWith("Saved comparison ") ? index : 0;
    if (e.presentedPanels?.includes(panel)) continue;
    if (!original.every((line, i) => line === e.details[start + i])) {
      if (aliases && repairQuotedLabels(e.details, start, view))
        (e.presentedPanels ||= []).push(panel);
      continue;
    }
    (e.presentedPanels ||= []).push(panel);
    // A legacy coefficient was rounded to hundredths. Its exact historical
    // value cannot be recovered from the logged text alone.
    const details = revised.map((line, i) =>
      analysis.coefficients && i === 0 && line !== original[0]
        ? "This historical model estimate and its interval were saved to only two decimal places. Open the saved model for its current coefficient and interval."
        : line,
    );
    e.details.splice(start, original.length, ...details);
  }
}

function refreshSavedFigureLogs(p, summarise) {
  const items = [
    ...(p.savedVisuals || []),
    ...(p.saved || []),
    { dataset: p.active, views: p.views },
  ];
  for (const item of items) {
    const dataset = p.datasets.find((d) => d.id === item.dataset);
    if (!dataset) continue;
    const views = item.views || [item.view];
    for (const [index, view] of views.entries()) {
      if (!view || (!view.figureEdits && view.task !== "model")) continue;
      try {
        const analysis = summarise(dataset, view, index, views);
        updateFigureEntries(p.workLog, dataset.id, view, analysis, item, index);
      } catch {
        // A historic figure can refer to a removed field or an empty selection.
      }
    }
  }
}

export function recordFigure(p, d, title, view, analysis, name = "") {
  if (view.figureEdits && p.workLog?.length)
    updateFigureEntries(p.workLog, d.id, view, analysis);
  recordWork(p, d, title, [
    name && "Saved as " + quote(name) + ".",
    analysis?.title &&
      [kinds[view.chart], analysis.title].filter(Boolean).join(" · "),
    ...describeFigure(analysis, view),
    view.annotation && "Caption: " + view.annotation,
  ]);
  if (view.figureEdits || analysis?.coefficients)
    p.workLog.at(-1).presentedPanels = [0];
}
