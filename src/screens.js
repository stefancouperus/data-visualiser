import { esc } from "./chart.js";
import { button as b, opts, select, input, table, icon, pict } from "./ui.js";
import { kinds, allCodes } from "./analysis.js";
import { dataCount } from "./project.js";
export function landing(local) {
  return `<div class="hero"><h1>Data visualiser</h1><p>visualising and interpreting your survey or interview data</p></div><div class="choices">${b("upload", pict("survey") + "<strong>I have a Qualtrics export</strong><small>Read survey questions, scales and responses.</small>", "choice", 'data-route="survey"')}${b("upload", pict("text") + "<strong>I have coded interviews</strong><small>Import Word, Excel or Taguette highlights.</small>", "choice", 'data-route="coded"')}</div><h2 class="section">Other ways to start</h2><div class="list">${[
    ["table", "table", "Table or spreadsheet", "CSV, TSV or Excel"],
    [
      "coded",
      "check",
      "Coded or annotated text",
      "Documents and spreadsheets with your own labels",
    ],
    [
      "text",
      "text",
      "Written responses or documents",
      "Uncoded text, Word documents or a column of answers",
    ],
  ]
    .map(([r, i, t, s]) =>
      b(
        "upload",
        icon(i) +
          "<span><strong>" +
          t +
          "</strong><small>" +
          s +
          "</small></span>",
        "",
        'data-route="' + r + '"',
      ),
    )
    .join(
      "",
    )}</div><div class="bar">${b("open", icon("project") + " Reopen a project")}${local ? b("deviceOpen", "Resume on this device") : ""}</div>`;
}
export function datasetSelect(p) {
  if (p.datasets.length === 1) return "";
  return `<label>Current dataset<select id="dataset">${opts(
    p.datasets.map((d) => [d.id, d.name + " · " + dataCount(d)]),
    p.active,
  )}</select></label>`;
}
export function check(d) {
  if (d.kind === "text")
    return `<section class="card"><h2>Have we matched your codes to the right passages?</h2><p>${d.sources.length} listed sources · ${d.passages.length} passages · ${allCodes(d).length} codes</p>${table(
      ["Source", "Original passage", "Codes"],
      d.passages
        .slice(0, 150)
        .map((p) => [p.source, p.text, p.codes.join("; ")]),
    )}<div class="bar">${b("sources", "Check source list")}${d.originals ? b("original", "Read original transcript") : ""}${b("renamecode", "Rename or merge a code")}${b("link", "Link source information")}</div></section>`;
  return `<section class="card"><div class="topline"><h2>${d.qual ? "Review your questionnaire" : "Review your table"}</h2>${b("unit", "Change record unit")}</div><p>${d.rows.length} ${esc(d.unit)} records · ${d.fields.length} columns. Check a few questions below, then continue.</p>${table(
    ["Question", "Sample answers"],
    d.fields
      .filter((f) => f.type !== "metadata" && f.levels.length > 0)
      .slice(0, 3)
      .map((f) => [f.label, f.levels.slice(0, 3).join(" · ")]),
  )}<details><summary>Review fields and import settings</summary>${d.fields.map((f) => `<details class="check-item"><summary>${esc(f.label)} <small> · ${esc(f.type)}</small></summary><p>Original column: ${esc(f.raw)}. Example values: ${esc(f.levels.slice(0, 5).join(" · "))}</p>${b("field", "Edit field", "", 'data-field="' + f.id + '"')}</details>`).join("")}<div class="bar">${b("combinetables", "Combine with another table")}${b("exclude", "Exclude records by value")}${b("multi", "Group multiple-answer columns")}${b("tocorpus", "Use a column as written responses")}</div>${d.rules.map((r, i) => `<p>Exclude ${esc(d.fields.find((f) => f.id === r.field)?.label)} = ${esc(r.value)} ${b("delrule", "Remove", "plain", 'data-i="' + i + '"')}</p>`).join("")}</details></section>`;
}
export function available(d, v) {
  if (v.task === "model") return ["model"];
  if (d.kind === "text") {
    if (v.task === "group") return ["presence", "grid", "table"];
    if (v.task === "two") return ["bars", "dots", "table"];
    return ["bars", "dots", "table", "excerpts"];
  }
  const x = d.fields.find((f) => f.id === v.x),
    y = d.fields.find((f) => f.id === v.y);
  if (!x) return ["table"];
  if (x.type === "text") return ["excerpts"];
  if (v.task === "one" && x.type === "number")
    return ["hist", "bars", "dots", "table"];
  const c = ["bars", "dots", "table"];
  if (x.type !== "multiple") c.push("stack");
  if (y && v.task !== "one") c.push("grid", "small");
  if (y?.type === "number" && ["number", "date"].includes(x.type))
    c.push("scatter", "line");
  return c;
}
export function panel(d, v, i) {
  const text = d.kind === "text",
    fields = text ? [] : d.fields.filter((f) => f.type !== "metadata"),
    choices = fields.map((f) => [f.id, f.label]),
    codes = text ? allCodes(d) : [];
  const headline =
    v.task === "model"
      ? "Fit a model"
      : v.task === "group"
        ? text
          ? "Compare codes across sources"
          : "Compare groups"
        : v.task === "two"
          ? text
            ? "Explore code overlap"
            : "Explore two questions"
          : text
            ? "Explore one code"
            : "Explore one variable";
  const options = available(d, v);
  if (!options.includes(v.chart)) v.chart = options[0];
  const meta = text
    ? [...new Set(Object.values(d.metadata || {}).flatMap(Object.keys))]
    : [];
  const fv = v.filter
    ? text
      ? v.filter === "source"
        ? d.sources
        : Object.values(d.metadata || {}).map((m) => m[v.filter])
      : d.fields.find((f) => f.id === v.filter)?.levels || []
    : [];
  return `<section class="plotcard" data-panel="${i}"><h2>${esc(headline)}</h2><div class="bar">${v.task === "model" ? select("outcome", "Outcome", choices, v.outcome) : text ? select("x", "Code", [["", "All passages"], ...codes], v.x) : select("x", "Variable", choices, v.x)}</div><div class="graphic" id="graphic${i}"></div><div id="modeldetails${i}"></div><details data-chart-options="${i}"><summary>Change chart or compare variables</summary><div class="formgrid">${select(
    "task",
    "What would you like to explore?",
    text
      ? [
          ["one", "One code or source text"],
          ["group", "Codes across sources"],
          ["two", "Overlap between codes"],
        ]
      : [
          ["one", "One variable"],
          ["group", "Compare groups"],
          ["two", "Two questions together"],
          ["model", "Fit a guided model"],
        ],
    v.task,
  )}

 ${
   v.task === "model"
     ? `<fieldset class="wide"><legend>Potential explanations</legend>${fields
         .filter((f) => f.id !== v.outcome && f.type !== "text")
         .map(
           (f) =>
             `<label class="tick"><input type="checkbox" data-predictor="${f.id}" ${(v.predictors || []).includes(f.id) ? "checked" : ""}>${esc(f.label)}</label>`,
         )
         .join(
           "",
         )}</fieldset>${d.fields.find((f) => f.id === v.outcome)?.type !== "number" ? select("positive", "Event to predict", d.fields.find((f) => f.id === v.outcome)?.levels || [], v.positive) : ""}<details class="wide"><summary>More model options</summary><label class="tick"><input type="checkbox" data-interaction ${v.interaction ? "checked" : ""}>Interaction between first two selected predictors</label><small>Use Compare to fit and inspect a second specification.</small></details>`
     : `${v.task !== "one" && (!text || v.task === "two") ? select("y", text ? "Second code" : "Grouping variable", text ? codes.filter((c) => c !== v.x) : choices.filter(([k]) => k !== v.x), v.y) : ""}${select(
         "chart",
         "View",
         options.map((k) => [k, kinds[k]]),
         v.chart,
       )}
 ${
   !text
     ? select(
         "measure",
         "Show",
         [
           ["count", "Counts"],
           ["percent", "Percent within each group"],
         ],
         v.measure,
       )
     : v.task !== "group"
       ? select(
           "measure",
           "Count",
           [
             ["passages", "Coded passages"],
             ["sources", "Sources containing the code"],
           ],
           v.measure,
         )
       : ""
 }
 ${v.chart === "scatter" || v.chart === "line" ? select("z", "Colour by", [["", "One series"], ...choices.filter(([k]) => k !== v.x && k !== v.y)], v.z) : ""}`
 }
 </div><details><summary>Filters and appearance</summary><div class="formgrid">${select("filter", "Keep a subset", [["", "All records"], ...(text ? [["source", "Source"], ...meta] : choices)], v.filter)}${
   v.filter
     ? select(
         "value",
         "Keep this value",
         [...new Set(fv)].filter((x) => x != null),
         v.value,
       )
     : ""
 }${input("title", "Figure title", v.title)}${input("annotation", "Caption or annotation", v.annotation)}${select(
   "palette",
   "Palette",
   [
     ["colour", "Colour"],
     ["grey", "Greyscale"],
   ],
   v.palette,
 )}${v.chart === "excerpts" ? input("query", "Find text", v.query) : ""}</div>${b("resetview", "Reset this view", "plain", 'data-i="' + i + '"')}</details>
 </details>
 <div class="bar">${b("askview", "Explain this view", "", 'data-i="' + i + '"')}${text ? b("passages", "Read and code passages", "", 'data-i="' + i + '"') : b("answers", "Read underlying responses", "", 'data-i="' + i + '"')}</div></section>`;
}
export function saveScreen(p) {
  return `<div class="card"><h2>Save an editable project</h2><p>Include data to reopen your work on another laptop. A settings-only file requires the original datasets to be reimported first.</p><div class="bar">${b("download", "Download project with data", "primary")}${b("device", "Save on this device")}${b("settings", "Download settings only")}</div></div><div class="card"><h2>Saved comparisons</h2><div class="bar">${b("savecompare", "Save current comparison")}</div>${p.saved.length ? p.saved.map((s, i) => `<div class="topline check-item"><div><strong>${esc(s.name)}</strong><p>${esc(s.note)}</p></div><div>${b("loadcomp", "Open", "", 'data-i="' + i + '"')} ${b("dupcomp", "Duplicate", "", 'data-i="' + i + '"')}</div></div>`).join("") : "<p>Your saved comparisons will appear here.</p>"}</div><div class="card"><h2>Export a figure</h2><div class="formgrid">${form(
    "panels",
    "Panels",
    [
      ["both", "Both views"],
      ["left", "Left view"],
      ["right", "Right view"],
    ],
  )}${form("layout", "Arrangement", [
    ["horizontal", "Side by side"],
    ["vertical", "Stacked"],
  ])}${form("preset", "Figure size", [
    ["700", "Report"],
    ["940", "Presentation"],
  ])}</div><div class="bar">${b("previewexport", "Preview figure")}${b("svg", "Download SVG")}${b("png", "Download PNG")}${b("copyfig", "Copy figure")}${b("caption", "Help me caption this")}</div></div>`;
}
function form(id, title, values) {
  return `<label>${title}<select id="${id}">${opts(values, values[0][0])}</select></label>`;
}
