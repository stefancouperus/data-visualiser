import { roleChoices } from "./variable-roles.js";
import { termHelp } from "./term-help.js";
import { figureStyles, styleFor, paletteOptions } from "./figure-styles.js";
import { esc } from "./chart.js";
import { button as b, opts, select, input, table, icon, pict } from "./ui.js";
import { kinds, allCodes } from "./analysis.js";
import { dataCount } from "./project.js";
import {
  groupChoices,
  patternChoices,
  patternModes,
  selectionLimit,
} from "./patterns.js";
export function landing(local) {
  return `<div class="hero"><h1>Data visualiser</h1><p>visualising and interpreting your survey or interview data</p></div><section class="project-open" id="project-drop" aria-label="Open a saved project"><div>${b("open", icon("project") + " Open a saved project")} ${local ? b("deviceOpen", "Resume on this device", "plain") : ""}</div><small>Choose your downloaded project (.json), or drop it here.</small></section><div class="choices">${b("upload", pict("survey") + "<strong>I have a Qualtrics export</strong><small>Read survey questions, scales and responses.</small>", "choice", 'data-route="survey"')}${b("upload", pict("text") + "<strong>I have coded interviews</strong><small>Import Word, Excel or Taguette highlights.</small>", "choice", 'data-route="coded"')}</div><details class="other-files"><summary>Other file types</summary><div class="list">${[
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
    .join("")}</div></details>`;
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
  return `<section class="card"><div class="topline"><h2>${d.qual ? "Review your questionnaire" : "Review your table"}</h2></div><p>${d.rows.length} ${esc(d.unit)} records · ${d.fields.length} columns. Check a few questions below, then continue.</p>${table(
    ["Question", "Sample answers"],
    d.fields
      .filter((f) => f.type !== "metadata" && f.levels.length > 0)
      .slice(0, 3)
      .map((f) => [f.label, f.levels.slice(0, 3).join(" · ")]),
  )}${"<details><summary>Seeing question codes or numbers instead of answer text?</summary><p>Use a Qualtrics export with choice text, or add the questionnaire (.qsf) that belongs to this export.</p>" + b("surveylabels", "Add questionnaire labels") + "</details>"}<details><summary>Review fields and import settings</summary>${b("unit", "Change record unit")}${d.fields.map((f) => `<details class="check-item"><summary>${esc(f.label)} <small> · ${esc(f.type)}</small></summary><p>Original column: ${esc(f.raw)}. Example values: ${esc(f.levels.slice(0, 5).join(" · "))}</p>${b("field", "Edit field", "", 'data-field="' + f.id + '"')}</details>`).join("")}<div class="bar">${b("combinetables", "Combine with another table")}${b("exclude", "Exclude records by value")}${b("multi", "Group multiple-answer columns")}${b("tocorpus", "Use a column as written responses")}</div>${d.rules.map((r, i) => `<p>Exclude ${esc(d.fields.find((f) => f.id === r.field)?.label)} = ${esc(r.value)} ${b("delrule", "Remove", "plain", 'data-i="' + i + '"')}</p>`).join("")}</details></section>`;
}
export function available(d, v) {
  if (d.openAnswers && v.task === "themes") return ["bars", "dots", "table"];
  if (v.task === "patterns")
    return d.kind === "text" && v.patternMode === "sources" && !v.groupBy
      ? ["grid", "bars", "table"]
      : ["bars", "dots", "table"];
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
function patternPicker(d, v, i, staged) {
  const text = d.kind === "text",
    items = v.items || [],
    rawChoices = patternChoices(d);
  const withRoles = (pairs, role) => {
    if (text) return pairs;
    const allowed = new Set(pairs.map(([id]) => id));
    return roleChoices(
      d.fields.filter((f) => allowed.has(f.id)),
      role,
    );
  };
  const choices = withRoles(rawChoices, "outcome");
  const noun = text ? "themes" : "questions";
  const groups = withRoles(groupChoices(d, items), "grouping");
  const grouping = select(
    "groupBy",
    "Compare by group",
    [["", "Everyone together"], ...groups],
    v.groupBy || "",
  );
  const units =
    text && v.groupBy && v.patternMode === "sources"
      ? select(
          "themeUnit",
          "Count a theme once per",
          [
            ["interviews", d.openAnswers ? "Respondent" : "Interview"],
            ["passages", "Passage"],
          ],
          v.themeUnit || "interviews",
        )
      : "";
  return `<div class="pattern-setup"><fieldset class="pick-items"><legend>Tick the ${noun} you want to see together</legend>
    <small>${items.length} of ${selectionLimit} selected. ${items.length === 1 ? "Tick another to see a pattern across them." : staged ? "Apply your selection when ready." : "The figure updates as you tick."}</small>
    ${choices.length > 8 ? `<input type="search" aria-label="Find ${noun}" data-find-items="${i}" placeholder="Find ${noun}…">` : ""}
    <div class="item-list">${choices.map(([id, label]) => `<label class="tick"><input type="checkbox" data-item="${esc(id)}" ${items.includes(id) ? "checked" : items.length >= selectionLimit || (!text && id === v.groupBy) ? "disabled" : ""}>${esc(label)}</label>`).join("")}</div>
    </fieldset>${select(
      "patternMode",
      "What would you like the figure to show?",
      patternModes(text, !!d.openAnswers).map(([mode, label]) => [
        mode,
        text && v.groupBy && mode === "sources"
          ? "How common is each theme in each group?"
          : label,
      ]),
      v.patternMode,
    )}${grouping}<small>${d.openAnswers ? "Respondents who share the selected survey answer form a group." : text ? "Interviews that share the same recorded detail form a group." : "Each answer in the column you choose forms a group."} Choose “Everyone together” to skip this split.</small>${termHelp("group", d, v)}${text ? b("addgroups", d.openAnswers ? "Edit respondent groups" : "Add interview groups", "plain", 'data-i="' + i + '"') : ""}${units}</div>`;
}
const chartLabels = {
  bars: "Bars",
  dots: "Dots",
  table: "Table",
  stack: "Shares",
  grid: "Heatmap",
  hist: "Ranges",
  scatter: "Points",
  line: "Lines",
  small: "Panels",
  presence: "Presence",
  excerpts: "Passages",
};
function chartTools(options, current, i) {
  return `<div class="chart-tools" role="group" aria-label="Change visualisation">${options.map((key) => b("charttype", icon(key) + "<span>" + esc(chartLabels[key]) + "</span>", "", `data-i="${i}" data-chart="${key}" aria-label="${esc(kinds[key])}" title="${esc(kinds[key])}" aria-pressed="${current === key}"`)).join("")}</div>`;
}
function selectionControls(d, v, i, staged) {
  const text = d.kind === "text",
    fields = text
      ? []
      : d.fields.filter(
          (f) =>
            f.type !== "metadata" &&
            (f.levels.length || [v.x, v.y, v.outcome].includes(f.id)),
        ),
    closedFields = fields.filter((f) => !f.roles?.includes("open")),
    choices = roleChoices(
      v.task === "two" || v.task === "group" ? closedFields : fields,
      "outcome",
    ),
    codes = text ? allCodes(d) : [];
  const modelFields = fields.filter(
    (f) =>
      f.type === "number" ||
      (["category", "ordered"].includes(f.type) && f.levels.length === 2),
  );
  const tasks = text
    ? [
        [
          "one",
          codes.length
            ? "Find a theme"
            : d.openAnswers
              ? "Read written answers"
              : "Read interview passages",
        ],
        ...(d.openAnswers && codes.length
          ? [["themes", "Compare themes across answers"]]
          : []),
        ...(codes.length
          ? [
              [
                "patterns",
                codes.length > 1
                  ? "Look across several themes"
                  : "Compare a theme by group",
              ],
            ]
          : []),
        ...(codes.length
          ? [
              [
                "group",
                d.openAnswers ? "Compare respondents" : "Compare interviews",
              ],
            ]
          : []),
        ...(codes.length > 1 ? [["two", "Find overlapping themes"]] : []),
      ]
    : [
        ["one", "Explore one question"],
        ...(patternChoices(d).length > 1
          ? [["patterns", "Look across several questions"]]
          : []),
        ...(closedFields.length > 1
          ? [
              ["group", "Compare groups"],
              ["two", "Connect two questions"],
            ]
          : []),
        ...(modelFields.length && closedFields.length > 1
          ? [["model", "Explore several factors"]]
          : []),
      ];
  const setup =
    v.task === "patterns"
      ? patternPicker(d, v, i, staged)
      : v.task === "model"
        ? select(
            "outcome",
            "Which result do you want to understand?",
            roleChoices(modelFields, "outcome"),
            v.outcome,
          )
        : text
          ? ["group", "themes"].includes(v.task)
            ? ""
            : select(
                "x",
                "Choose a theme or code",
                [...(v.task === "one" ? [["", "All passages"]] : []), ...codes],
                v.x,
              )
          : select(
              "x",
              v.task === "group"
                ? "Which answers do you want to compare?"
                : "Choose a question or column",
              choices,
              v.x,
            );
  const second =
    v.task === "two" || (!text && v.task === "group")
      ? select(
          "y",
          text
            ? "Choose another theme"
            : v.task === "group"
              ? d.unit === "response"
                ? "Which question splits respondents into groups?"
                : "Which column splits the rows into groups?"
              : "Choose a second question",
          text
            ? codes.filter((c) => c !== v.x)
            : roleChoices(
                fields.filter(
                  (f) => f.id !== v.x && !f.roles?.includes("open"),
                ),
                v.task === "group" ? "grouping" : "explanatory",
              ),
          v.y,
        )
      : "";
  return `${tasks.length > 1 ? select("task", "What would you like to find out?", tasks, v.task) : ""}
  <div class="selection-tools"><div class="formgrid">${setup}${second}</div>
  ${!text && v.task === "group" && d.unit === "response" ? "<small>People who gave the same answer to the second question form one group. Compare how those groups answered the first question.</small>" : ""}
  ${["group", "two", "model"].includes(v.task) && (!text || codes.length) ? termHelp("group", d, v) : ""}
  ${text ? termHelp("theme", d, v) : ""}
  ${v.task === "model" ? "<p>Choose the result you want to understand and the factors to compare. Regression estimates how each factor relates to that result while holding the other selected factors constant.</p>" : ""}
  ${
    v.task === "model"
      ? `<fieldset class="wide"><legend>Which factors might help explain this result?</legend>${roleChoices(
          fields.filter((f) => f.id !== v.outcome && f.type !== "text"),
          "explanatory",
        )
          .map(
            ([id, label]) =>
              `<label class="tick"><input type="checkbox" data-predictor="${id}" ${(v.predictors || []).includes(id) ? "checked" : ""}>${esc(label)}</label>`,
          )
          .join(
            "",
          )}</fieldset>${d.fields.find((f) => f.id === v.outcome)?.type !== "number" ? select("positive", "Which answer do you want to predict?", d.fields.find((f) => f.id === v.outcome)?.levels || [], v.positive) : ""}<details class="wide"><summary>Advanced regression settings</summary><label class="tick"><input type="checkbox" data-interaction ${v.interaction ? "checked" : ""}>Interaction between first two selected predictors</label><small>Use Compare to fit and inspect a second specification.</small></details>`
      : ""
  }</div>
  ${staged ? "<small>Apply your selection to update the visual.</small>" : ""}<div class="bar apply-selection">${b("applyselection", staged ? "Apply selection to visual" : "Confirm selection and view visual", "primary", 'data-i="' + i + '"')} ${staged ? b("discardselection", "Discard changes", "plain", 'data-i="' + i + '"') : ""}</div>`;
}
export function panel(
  d,
  v,
  i,
  comparing = false,
  draft = null,
  confirmedName = "",
) {
  const text = d.kind === "text",
    side = i ? "Right" : "Left",
    choices = text
      ? []
      : d.fields
          .filter(
            (f) =>
              f.type !== "metadata" &&
              !f.roles?.includes("open") &&
              f.levels.length,
          )
          .map((f) => [f.id, f.label]);
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
  return `<section class="plotcard ${comparing ? "comparison-card" : "explore-card"}" data-panel="${i}">${comparing ? `<div class="view-heading"><h2>${side} view</h2><span>${esc(kinds[v.chart])}</span></div><details data-chart-options="edit-${i}"><summary>Change ${side.toLowerCase()} view</summary>` : ""}
  ${confirmedName ? `<div class="topline"><p><strong>Confirmed selection</strong><br>${esc(confirmedName)}</p>${b("editselection", "Change selection", "", "data-i=" + i)}</div>` : `<div class="selection-editor">${selectionControls(d, draft || v, i, !!draft)}</div>`}
  ${comparing ? "</details>" : ""}
  <div class="live-figure"><div class="figure-toolbar"><strong tabindex="-1" id="figure-heading${i}">Current visual</strong><div class="figure-actions">${options.length > 1 ? `<details class="chart-picker"><summary aria-label="Chart type · ${esc(kinds[v.chart])}">${icon(v.chart)} Chart type · ${esc(chartLabels[v.chart])}</summary>${chartTools(options, v.chart, i)}</details>` : ""}${b("savevisual", icon("save") + " Save visual", "", 'data-i="' + i + '"')}</div>
  </div><div class="figure-stage"><div class="graphic" id="graphic${i}"></div></div>${v.task === "patterns" && v.items?.length ? `<small>Click a ${v.chart === "grid" ? "cell" : "row"} to read the ${text ? "passages" : "responses"} behind it.</small>` : ""}<div id="modeldetails${i}"></div></div>
  <details data-chart-options="${i}"><summary>Chart settings</summary><div class="selection-mode"><label class="tick"><input type="checkbox" data-stage-selection="${i}" ${draft ? "" : "checked"}>Update the visual as I select</label></div>${b("figurestyle", "Figure style · " + figureStyles[styleFor(v.style)].label, "", 'data-i="' + i + '"')}${!text ? b("variables", d.fields.some((f) => f.roles?.length) ? "Review question roles" : "Choose question roles") : ""}${termHelp("percent", d, v)}<div class="formgrid">
 ${
   v.task !== "patterns" &&
   !text &&
   !["model", "scatter", "line", "stack", "excerpts"].includes(v.chart)
     ? select(
         "measure",
         "Show",
         [
           ["count", "Counts"],
           [
             "percent",
             v.task === "one"
               ? "Percent of valid responses"
               : "Percent within each group",
           ],
         ],
         v.measure,
       )
     : d.openAnswers && v.task === "themes"
       ? select(
           "measure",
           "Show",
           [
             ["sources", "Number of respondents"],
             ["percent", "Percent of respondents who wrote an answer"],
           ],
           v.measure,
         )
       : text &&
           v.task !== "patterns" &&
           v.task !== "group" &&
           v.chart !== "excerpts"
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
 </div><details data-chart-options="${i}-appearance"><summary>Filters and appearance</summary>${termHelp("filter", d, v)}<div class="formgrid">${select("filter", "Keep a subset", [["", "All records"], ...(text ? [["source", "Source"], ...meta] : choices)], v.filter)}${
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
   "Colour palette",
   paletteOptions,
   v.palette,
 )}${v.chart === "excerpts" ? input("query", "Find text", v.query) : ""}</div>${b("resetview", "Reset this view", "plain", 'data-i="' + i + '"')}</details>
 </details>
 <div class="bar">${b("describechart", icon("bot") + " Ask about this visual", "", 'data-i="' + i + '"')}${text ? b("passages", d.openAnswers ? "Read and code written answers" : "Read and code passages", "", 'data-i="' + i + '"') : b("answers", "Read underlying responses", "", 'data-i="' + i + '"')}</div></section>`;
}
export function saveScreen(p) {
  return `<div class="card"><h2>Save your project</h2><p>Download your data and work together. Choose <strong>Open a saved project</strong> to continue later.</p><div class="bar">${b("download", "Download project with data", "primary")}</div><details data-chart-options="save-options"><summary>Other save options</summary><label class="tick"><input id="includeBotChat" type="checkbox" ${p.includeBotChat ? "checked" : ""}>Include full Data bot conversations</label><small>Includes your questions, replies and any text quoted in them.</small><div class="bar">${b("device", "Save on this device")}${b("settings", "Download settings only")}</div><small>A settings-only file requires matching datasets to be imported first.</small></details></div>
  ${p.savedVisuals.length ? `<div class="card"><h2>Saved visuals</h2>${p.savedVisuals.map((s, i) => `<div class="topline check-item"><div><strong>${esc(s.name)}</strong><small>${esc(p.datasets.find((d) => d.id === s.dataset)?.name || "")}</small></div>${b("loadvisual", "Open visual", "", 'data-i="' + i + '"')}</div>`).join("")}</div>` : ""}${p.saved.length ? `<div class="card"><h2>Saved comparisons</h2>${p.saved.map((s, i) => `<div class="topline check-item"><div><strong>${esc(s.name)}</strong><p>${esc(s.note)}</p></div><div>${b("loadcomp", "Open", "", 'data-i="' + i + '"')} ${b("dupcomp", "Duplicate", "", 'data-i="' + i + '"')}</div></div>`).join("")}</div>` : ""}
  <div class="card"><h2>Export a figure</h2><div class="export-main">${form(
    "figure-format",
    "Image format",
    [
      ["png", "PNG image"],
      ["svg", "SVG vector image"],
    ],
  )}${b("downloadfigure", "Download figure", "primary")}</div><details data-chart-options="export-options"><summary>Export options</summary><div class="formgrid">${form(
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
  ])}</div><div class="bar">${b("previewexport", "Preview figure")}${b("copyfig", "Copy figure")}${b("caption", "Help me caption this")}</div></details></div>`;
}
function form(id, title, values, selected = values[0][0]) {
  return `<label>${title}<select id="${id}">${opts(values, selected)}</select></label>`;
}
