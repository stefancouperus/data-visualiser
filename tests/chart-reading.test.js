import assert from "node:assert/strict";
import test from "node:test";
import {
  tutorViewSettings,
  chartReadingOptions,
  renderChartReading,
} from "../src/chart-reading.js";
import {
  chartFields,
  selectedBinaryEvent,
  namedLinearModel,
  namedSurveyComparison,
} from "../src/question-matching.js";
import { researchCatalogue } from "../src/research-focus.js";
import { makeTable } from "../src/import.js";

test("question discovery withholds raw binary values in ordinary and research chat", () => {
  const d = makeTable(
    [
      ["Opinion", "Optional contact"],
      ["Happy", "a@example.invalid"],
      ["Unsure", "b@example.invalid"],
    ],
    "Survey",
  );
  const v = { task: "one", x: d.fields[0].id };
  const q = "Suggest a question about opinion";
  for (const catalogue of [
    chartFields(d.fields, q),
    researchCatalogue(d, v, q, q, false),
  ]) {
    assert.doesNotMatch(JSON.stringify(catalogue), /@example|Happy|Unsure/);
  }
  assert.deepEqual(
    tutorViewSettings({
      ...v,
      chart: "bars",
      positive: "a@example.invalid",
      outcome: "old",
      figureEdits: {},
      value: "b@example.invalid",
    }),
    { task: "one", chart: "bars", measure: undefined, x: v.x },
  );
});

test("binary modelling requires a named event or the active model's chosen event", () => {
  const f = { id: "attitude", levels: ["Approval", "Disapproval"] };
  assert.equal(selectedBinaryEvent(f, "Predict approval by age"), "Approval");
  assert.equal(
    selectedBinaryEvent(f, "Could approval or disapproval be modelled?"),
    null,
  );
  assert.equal(selectedBinaryEvent(f, "Fit a model"), null);
  assert.equal(
    selectedBinaryEvent(f, "Fit a model", {
      task: "model",
      outcome: f.id,
      positive: "Disapproval",
    }),
    "Disapproval",
  );
  assert.equal(
    selectedBinaryEvent(f, "Fit a model", {
      task: "one",
      outcome: f.id,
      positive: "Disapproval",
    }),
    null,
  );
});

test("chart readouts only render calculated observations on the selected panels", () => {
  const views = [
    {
      panel: "left",
      title: "Opinion",
      settings: { task: "one", chart: "bars" },
      categoricalPattern: {
        highestShare: { label: "Yes", n: 3, den: 5, group: "" },
      },
      note: "5 valid responses.",
    },
    {
      panel: "right",
      title: "Overlap",
      settings: { task: "two", chart: "bars", measure: "passages" },
      calculatedForSelection: { codeCounts: [] },
      records: [{ label: "Both", n: 0 }],
      note: "4 passages reviewed.",
    },
  ];
  const prepared = chartReadingOptions(views);
  const text = renderChartReading(prepared, {
    left: 99,
    right: -1,
    explanation: "All 500 agreed",
  });
  assert.match(text, /3 of 5.*Yes/);
  assert.match(text, /Both selected codes appeared in 0 original passages/);
  assert.doesNotMatch(text, /500/);
});

test("a natural request for a dot plot in each group draws the specified axes and percentages", () => {
  const table = makeTable(
    [
      ["Ticket approval", "Fare zone"],
      ["Approve", "Inner"],
      ["Oppose", "Outer"],
    ],
    "Transport",
  );
  const result = namedSurveyComparison(
    table.fields,
    "Could you compare the two fare zones for me? I would like a dot plot of Ticket approval in each Fare zone, with percentages within each zone. Please draw it.",
  );
  assert.deepEqual(result, {
    action: "draw",
    task: "group",
    chart: "dots",
    x: table.fields[0].id,
    y: table.fields[1].id,
    measure: "percent",
  });
});

test("a count request binds the named answer to its actual subgroup denominator", () => {
  const v = {
    panel: "left",
    title: "Vote",
    settings: { task: "group" },
    categoricalPattern: {},
    recordsTotal: 2,
    records: [
      { label: "Yes", group: "East", n: 1, den: 3 },
      { label: "Yes", group: "West", n: 4, den: 4 },
    ],
    note: "7 valid responses.",
  };
  const readings = chartReadingOptions(
    [v],
    "count",
    "What percentage of East said Yes?",
  );
  assert.match(renderChartReading(readings, {}), /East.*1 of 3.*33.33%/);
  assert.doesNotMatch(renderChartReading(readings, {}), /West/);
  const absent = chartReadingOptions([v], "count", "How many said Maybe?");
  assert.match(renderChartReading(absent, {}), /could not verify/);
});

test("an explicitly named linear model preserves the student's outcome and predictor roles", () => {
  const fields = [
    { id: "h", label: "Hours available", type: "number" },
    { id: "s", label: "Shifts taken", type: "number" },
  ];
  const request =
    "Please fit a linear regression with Shifts taken as the outcome and Hours available as the only predictor. Draw it for me.";
  assert.deepEqual(namedLinearModel(fields, request), {
    action: "draw",
    task: "model",
    chart: "model",
    outcome: "s",
    predictors: ["h"],
  });
  assert.equal(namedLinearModel(fields, request + " Exclude weekends."), null);
  assert.equal(
    namedLinearModel([...fields, { ...fields[0], id: "unrelated" }], request),
    null,
  );
});
