import { esc } from "./chart.js";
import { button as b, opts, select, input, table, icon, pict } from "./ui.js";
import { kinds, allCodes } from "./analysis.js";
import { dataCount } from "./project.js";
export function landing(local) {
  return `<div class="hero"><h1>Data visualiser</h1><p>visualising and interpreting your survey or interview data</p></div><section class="project-open" id="project-drop" aria-label="Open a saved project"><div>${b("open", icon("project") + " Open a saved project")} ${local ? b("deviceOpen", "Resume on this device", "plain") : ""}</div><small>Choose your downloaded project (.json), or drop it here.</small></section><div class="choices">${b("upload", pict("survey") + "<strong>I have a Qualtrics export</strong><small>Read survey questions, scales and responses.</small>", "choice", 'data-route="survey"')}${b("upload", pict("text") + "<strong>I have coded interviews</strong><small>Import Word, Excel or Taguette highlights.</small>", "choice", 'data-route="coded"')}</div><h2 class="section">Other ways to start</h2><div class="list">${[
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
    .join("")}</div>`;
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
  )}${"<details><summary>Seeing question codes or numbers instead of answer text?</summary><p>Use a Qualtrics export with choice text, or add the questionnaire (.qsf) that belongs to this export. Measurements such as age stay numerical.</p>" + b("surveylabels", "Add questionnaire labels") + "</details>"}<details><summary>Review fields and import settings</summary>${d.fields.map((f) => `<details class="check-item"><summary>${esc(f.label)} <small> · ${esc(f.type)}</small></summary><p>Original column: ${esc(f.raw)}. Example values: ${esc(f.levels.slice(0, 5).join(" · "))}</p>${b("field", "Edit field", "", 'data-field="' + f.id + '"')}</details>`).join("")}<div class="bar">${b("combinetables", "Combine with another table")}${b("exclude", "Exclude records by value")}${b("multi", "Group multiple-answer columns")}${b("tocorpus", "Use a column as written responses")}</div>${d.rules.map((r, i) => `<p>Exclude ${esc(d.fields.find((f) => f.id === r.field)?.label)} = ${esc(r.value)} ${b("delrule", "Remove", "plain", 'data-i="' + i + '"')}</p>`).join("")}</details></section>`;
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
    fields = text
      ? []
      : d.fields.filter(
          (f) =>
            f.type !== "metadata" &&
            (f.levels.length || [v.x, v.y, v.outcome].includes(f.id)),
        ),
    choices = fields.map((f) => [f.id, f.label]),
    codes = text ? allCodes(d) : [];
  const modelFields = fields.filter(
    (f) =>
      f.type === "number" ||
      (["category", "ordered"].includes(f.type) && f.levels.length === 2),
  );
  const tasks = text
    ? [
        ["one", "Where does a theme appear?"],
        ["group", "Which themes appear in each interview?"],
        ...(codes.length > 1 ? [["two", "Which themes appear together?"]] : []),
      ]
    : [
        ["one", "How did people answer one question?"],
        ...(choices.length > 1
          ? [
              ["group", "How do answers differ between groups?"],
              ["two", "How do two answers relate?"],
            ]
          : []),
        ...(modelFields.length && choices.length > 1
          ? [["model", "How do several factors relate to an outcome?"]]
          : []),
      ];
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
  const setup =
    v.task === "model"
      ? select(
          "outcome",
          "Which result do you want to understand?",
          modelFields.map((f) => [f.id, f.label]),
          v.outcome,
        )
      : text
        ? v.task === "group"
          ? ""
          : select(
              "x",
              "Choose a theme or code",
              [...(v.task === "one" ? [["", "All passages"]] : []), ...codes],
              v.x,
            )
        : select("x", "Choose a question or column", choices, v.x);
  const second =
    v.task === "two" || (!text && v.task === "group")
      ? select(
          "y",
          text
            ? "Choose another theme"
            : v.task === "group"
              ? "Which question defines the groups?"
              : "Choose a second question",
          text
            ? codes.filter((c) => c !== v.x)
            : choices.filter(([key]) => key !== v.x),
          v.y,
        )
      : "";
  return `<section class="plotcard" data-panel="${i}">${select("task", "What would you like to find out?", tasks, v.task)}
  <div class="formgrid">${setup}${second}</div>
  ${v.task === "model" ? "<p>Regression estimates how each factor relates to your chosen result while holding the other selected factors constant. For example, does the link between age and voting persist when you account for education?</p>" : ""}
  ${
    v.task === "model"
      ? `<fieldset class="wide"><legend>Which factors might help explain this result?</legend>${fields
          .filter((f) => f.id !== v.outcome && f.type !== "text")
          .map(
            (f) =>
              `<label class="tick"><input type="checkbox" data-predictor="${f.id}" ${(v.predictors || []).includes(f.id) ? "checked" : ""}>${esc(f.label)}</label>`,
          )
          .join(
            "",
          )}</fieldset>${d.fields.find((f) => f.id === v.outcome)?.type !== "number" ? select("positive", "Which answer do you want to predict?", d.fields.find((f) => f.id === v.outcome)?.levels || [], v.positive) : ""}<details class="wide"><summary>Advanced regression settings</summary><label class="tick"><input type="checkbox" data-interaction ${v.interaction ? "checked" : ""}>Interaction between first two selected predictors</label><small>Use Compare to fit and inspect a second specification.</small></details>`
      : select(
          "chart",
          "Show as",
          options.map((k) => [k, kinds[k]]),
          v.chart,
        )
  }
  <div class="graphic" id="graphic${i}"></div><div id="modeldetails${i}"></div>
  <details data-chart-options="${i}"><summary>Chart settings</summary><div class="formgrid">
 ${
   !text && !["model", "scatter", "line", "stack", "excerpts"].includes(v.chart)
     ? select(
         "measure",
         "Show",
         [
           ["count", "Counts"],
           ["percent", "Percent within each group"],
         ],
         v.measure,
       )
     : text && v.task !== "group" && v.chart !== "excerpts"
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
 ${v.chart === "scatter" || v.chart === "line" ? select("z", "Colour by", [["", "One series"], ...choices.filter(([k]) => k !== v.x && k !== v.y)], v.z) : ""}
 </div><details data-chart-options="${i}-appearance"><summary>Filters and appearance</summary><div class="formgrid">${select("filter", "Keep a subset", [["", "All records"], ...(text ? [["source", "Source"], ...meta] : choices)], v.filter)}${
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
  return `<div class="card"><h2>Save your project</h2><p>Keep your data, codes, figures, comparisons and bot activity together in one file. To continue on any laptop, choose <strong>Open a saved project</strong> on the start screen.</p><label class="tick"><input id="includeBotChat" type="checkbox" ${p.includeBotChat ? "checked" : ""}>Include full Data bot conversations</label><small>Includes your questions, replies and any text quoted in them.</small><div class="bar">${b("download", "Download project with data", "primary")}</div><details><summary>Other save options</summary><div class="bar">${b("device", "Save on this device")}${b("settings", "Download settings only")}</div><small>A settings-only file requires matching datasets to be imported first.</small></details></div><div class="card"><h2>Saved comparisons</h2><div class="bar">${b("savecompare", "Save current comparison")}</div>${p.saved.length ? p.saved.map((s, i) => `<div class="topline check-item"><div><strong>${esc(s.name)}</strong><p>${esc(s.note)}</p></div><div>${b("loadcomp", "Open", "", 'data-i="' + i + '"')} ${b("dupcomp", "Duplicate", "", 'data-i="' + i + '"')}</div></div>`).join("") : "<p>Your saved comparisons will appear here.</p>"}</div><div class="card"><h2>Export a figure</h2><div class="formgrid">${form(
    "panels",
    "Panels",
    [
      ["both", "Both views"],
      ["left", "Left view"],
      ["right", "Right view"],
    ],
    p.figurePanels || "left",
  )}${form("layout", "Arrangement", [
    ["horizontal", "Side by side"],
    ["vertical", "Stacked"],
  ])}${form("preset", "Figure size", [
    ["700", "Report"],
    ["940", "Presentation"],
  ])}</div><div class="bar">${b("previewexport", "Preview figure")}${b("svg", "Download SVG")}${b("png", "Download PNG")}${b("copyfig", "Copy figure")}${b("caption", "Help me caption this")}</div></div>`;
}
function form(id, title, values, selected = values[0][0]) {
  return `<label>${title}<select id="${id}">${opts(values, selected)}</select></label>`;
}
