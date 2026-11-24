import test from "node:test";
import assert from "node:assert/strict";
import { fresh, verifyProject, settingsProject } from "../src/project.js";
import { makeTable, corpus, texts } from "../src/import.js";
import { figureScope } from "../src/figure-edits.js";
import { analyse, newView } from "../src/analysis.js";
import {
  startProjectLog,
  syncProjectLog,
  recordWork,
  recordFigure,
  describeFigure,
} from "../src/work-log.js";

function project(d) {
  const p = fresh();
  p.datasets.push(d);
  p.active = d.id;
  p.views = [newView(d), newView(d)];
  return p;
}
test("saved interview comparisons describe the selected passage denominator without copying transcript text", () => {
  const d = corpus(
    "Repair project",
    [
      { id: "p1", source: "East", text: "private phrase", codes: ["Delay"] },
      { id: "p2", source: "East", text: "other private phrase", codes: [] },
      {
        id: "p3",
        source: "West",
        text: "another private phrase",
        codes: ["Delay"],
      },
      {
        id: "p4",
        source: "West",
        text: "last private phrase",
        codes: ["Delay"],
      },
    ],
    ["East", "West"],
  );
  const view = {
    task: "patterns",
    patternMode: "sources",
    items: ["Delay"],
    sourceMeasure: "percent",
    chart: "table",
  };
  const within = describeFigure(analyse(d, view), view).join(" ");
  assert.match(
    within,
    /“Delay” was coded in 1 of 2 included passages \(50%\) in “East”/,
  );
  const contribution = { ...view, sourceMeasure: "themeShare", chart: "stack" };
  const pooled = describeFigure(analyse(d, contribution), contribution).join(
    " ",
  );
  assert.match(
    pooled,
    /“East” contributed 1 of the 3 included passages coded with “Delay” \(33.33%\)/,
  );
  assert.doesNotMatch(within + pooled, /private phrase/);
});
test("the survey work log records changed decisions and actual values, with no activity on navigation or reload", () => {
  const d = makeTable(
    [
      ["Frequency", "Campus"],
      ["Often", "North"],
      ["Often", "South"],
      ["Rarely", "North"],
    ],
    "Commute",
  );
  const p = project(d);
  syncProjectLog(p);
  p.researchFocus = "How often do respondents travel?";
  d.fields[1].roles = ["grouping"];
  p.confirmed.push(d.id);
  syncProjectLog(p);
  syncProjectLog(p);
  const view = {
    ...p.views[0],
    measure: "percent",
    annotation: "Frequent travel was common in this sample.",
  };
  recordFigure(p, d, "Saved a visual", view, analyse(d, view), "Routes");
  recordWork(p, d, "Student finding or note", [
    "Two respondents reported frequent travel.",
  ]);
  assert.deepEqual(
    p.workLog.map((e) => e.title),
    [
      "Added a dataset",
      "Set the research question or puzzle",
      "Updated survey fields or question roles",
      "Confirmed data for exploration",
      "Saved a visual",
      "Student finding or note",
    ],
  );
  assert.match(p.workLog.at(-2).details.join(" "), /2 of 3 \(66\.67%\)/);
  assert.match(p.workLog.at(-2).details.join(" "), /Frequent travel/);
  const resumed = verifyProject(JSON.parse(JSON.stringify(p)));
  startProjectLog(resumed);
  syncProjectLog(resumed);
  assert.deepEqual(resumed.workLog, p.workLog);
  assert.equal(settingsProject(p).workLog, undefined);
});
test("the log distinguishes approved coding from drafts, selections, and source quotations", () => {
  const d = corpus("Bus", texts("Tess", ["A private interview phrase."]), [
    "Tess",
  ]);
  const p = project(d);
  syncProjectLog(p);
  d.coding = { bookDraft: { entries: [{ label: "unapproved" }] } };
  d.interviews = { done: [] };
  syncProjectLog(p);
  assert.equal(p.workLog.length, 1);
  d.coding.book = [{ label: "Delays", definition: "Late service" }];
  d.coding.mode = "deductive";
  d.passages[0].codes = ["Delays"];
  d.passages[0].reviewed = true;
  d.interviews.done.push("Tess");
  syncProjectLog(p);
  assert.deepEqual(
    p.workLog.slice(1).map((e) => e.title),
    [
      "Updated the approved codebook",
      "Updated passage coding",
      "Updated interview review",
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(p.workLog),
    /unapproved|private interview phrase/,
  );
  assert.match(p.workLog.at(-2).details.join(" "), /1 label assignment/);
  d.passages[0].codingIncluded = false;
  syncProjectLog(p);
  assert.match(
    p.workLog.at(-1).details.join(" "),
    /1 passage explicitly excluded/,
  );
});
test("an older project starts an honest timeline without inventing old events", () => {
  const d = makeTable([["Vote"], ["Yes"], ["No"]], "Survey");
  const p = project(d);
  delete p.workLog;
  startProjectLog(p);
  syncProjectLog(p);
  assert.deepEqual(
    p.workLog.map((e) => e.title),
    ["Opened an existing project"],
  );
  assert.match(p.workLog[0].details[0], /Earlier work/);
});
test("figure log uses quantitative evidence without original answers or excerpts", () => {
  const excerpt = describeFigure(
    {
      note: "1 passage shown.",
      excerpt: [{ text: "private quotation" }],
      records: [],
    },
    { chart: "excerpts" },
  );
  assert.deepEqual(excerpt, ["1 passage shown."]);
  const grouped = describeFigure(
    {
      records: [
        { group: "First", label: "Yes", n: 2, den: 4, value: 50 },
        { group: "Second", label: "Yes", n: 1, den: 4, value: 25 },
      ],
      note: "8 valid of 8 records.",
    },
    { task: "group", chart: "bars" },
  );
  assert.match(grouped.join(" "), /25 percentage points/);
  const quantitative = describeFigure(
    {
      x: "Hours",
      y: "Score",
      points: [
        { a: 1, b: 2 },
        { a: 2, b: 4 },
        { a: 3, b: 6 },
      ],
    },
    { chart: "scatter" },
  );
  assert.match(quantitative.join(" "), /Pearson’s r = 1/);
});

test("small signed model coefficients keep four significant figures in logged findings", () => {
  for (const [estimate, low, high, text] of [
    [
      0.000942857,
      0.000480305,
      0.001405409,
      "0.0009429 (95% interval 0.0004803 to 0.001405)",
    ],
    [-0.0000015, -0.000003, 0, "-0.0000015 (95% interval -0.000003 to 0)"],
    [0, -2e-10, 2e-10, "0 (95% interval -2e-10 to 2e-10)"],
  ]) {
    const a = {
      method: "Linear regression",
      coefficients: [{ term: "Budget in euros", estimate, low, high }],
    };
    const p = fresh();
    recordFigure(p, {}, "Saved a visual", { task: "model", chart: "model" }, a);
    assert.ok(p.workLog[0].details.join(" ").includes(text));
  }
});

test("an edited figure's labels carry through grouped patterns and matching historical entries without rewriting student notes", () => {
  const d = makeTable(
    [
      ["Vote", "Campus"],
      ["Yes", "East"],
      ["Yes", "East"],
      ["No", "West"],
    ],
    "Survey",
  );
  const p = project(d);
  const v = {
    task: "patterns",
    chart: "grid",
    items: ["c0"],
    groupBy: "c1",
    patternMode: "separate",
  };
  const a = analyse(d, v);
  const raw = describeFigure(a, v);
  const scope = figureScope(v);
  const row = a.largestDisplayedDifference.pattern;
  v.figureEdits = {
    scope,
    dimensions: {
      groups: { names: [[row, "Selected answer"]] },
      subgroups: {
        names: [
          ["East", "First site"],
          ["West", "Second site"],
        ],
      },
    },
  };
  const edited = describeFigure(a, v);
  assert.match(edited[0], /Selected answer/);
  assert.doesNotMatch(edited[0], /East|West/);
  p.savedVisuals = [{ dataset: d.id, name: "Workshop figure", view: v }];
  const old = {
    at: new Date().toISOString(),
    dataset: d.id,
    source: d.name,
    title: "Saved a visual",
    details: ["Saved as “Workshop figure”.", "Grid · " + a.title, ...raw],
  };
  p.workLog = [
    old,
    { ...old, title: "Student finding or note", details: [...raw] },
  ];
  startProjectLog(p, (dataset, view) => analyse(dataset, view));
  assert.deepEqual(old.details.slice(2), edited);
  assert.deepEqual(p.workLog[1].details, raw);
  const historical = {
    ...old,
    details: [
      ...old.details.slice(0, 2),
      ...raw.map((line) => line.replace("2 of 2", "18 of 19")),
    ],
  };
  delete historical.presentedPanels;
  p.workLog = [historical];
  startProjectLog(p, (dataset, view) => analyse(dataset, view));
  assert.match(historical.details.join(" "), /18 of 19/);
  assert.doesNotMatch(historical.details.join(" "), /East|West/);
});
