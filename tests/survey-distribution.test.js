import test from "node:test";
import assert from "node:assert/strict";
import { analyse } from "../src/analysis.js";
import { makeTable } from "../src/import.js";
import { groupChoices, groupValue, patternChoices } from "../src/patterns.js";
import {
  tutorViewSettings,
  chartReadingOptions,
} from "../src/chart-reading.js";

const survey = makeTable(
  [
    ["Street lighting", "Open spaces", "Group"],
    ["Yes", "Yes", "21"],
    ["No", "", "19"],
    ["Yes", "No", "19"],
    ["Yes", "", "19"],
    ["No", "", "20"],
    ["Yes", "Yes", ""],
  ],
  "Local places",
);
const view = {
  task: "patterns",
  patternMode: "separate",
  groupBy: "c2",
  items: ["c0", "c1"],
  chart: "grid",
};
const lookup = (a, q, answer, group) =>
  a.records.find(
    (r) => r.fieldId === q && r.label === answer && r.groupValue === group,
  );

test("the two reading directions use the right base for each question and distinguish zero from unanswered", () => {
  const within = analyse(survey, view);
  assert.equal(within.surveyDistribution, true);
  assert.deepEqual(
    within.groupSizes.map((g) => g.group),
    ["19", "20", "21"],
  );
  const counts = (r) => [r.n, r.den, r.undefinedShare];
  assert.deepEqual(counts(lookup(within, "c0", "Yes", "19")), [2, 3, false]);
  assert.deepEqual(counts(lookup(within, "c1", "Yes", "19")), [0, 1, false]);
  assert.deepEqual(counts(lookup(within, "c1", "Yes", "20")), [0, 0, true]);
  assert.match(within.note, /1 record omitted/);
  const across = analyse(survey, { ...view, percentBase: "answer" });
  assert.deepEqual(counts(lookup(across, "c0", "Yes", "19")), [2, 3, false]);
  assert.deepEqual(counts(lookup(across, "c0", "Yes", "20")), [0, 3, false]);
  assert.deepEqual(counts(lookup(across, "c1", "Yes", "20")), [0, 1, false]);
  assert.equal(across.largestDisplayedDifference, undefined);
  assert.equal(
    tutorViewSettings({ ...view, percentBase: "answer" }).percentBase,
    "answer",
  );
  assert.match(
    chartReadingOptions(
      [
        {
          settings: view,
          surveyInsights: { facts: ["Verified observation."] },
        },
      ],
      "explain",
      "",
    )[0].options[0],
    /Verified observation/,
  );
});

test("known unselected options, multiple answers and group filters use respondent denominators", () => {
  const d = makeTable(
    [
      ["Aims", "Group"],
      ["Time;Cost", "Night"],
      ["Time", "Night"],
      ["Cost", "Day"],
      ["", "Day"],
    ],
    "Example",
  );
  Object.assign(d.fields[0], {
    type: "multiple",
    separator: ";",
    levels: ["Time", "Cost", "Safety"],
  });
  const v = { ...view, items: ["c0"], groupBy: "c1" };
  assert.deepEqual(lookup(analyse(d, v), "c0", "Cost", "Night").value, 50);
  const across = analyse(d, { ...v, percentBase: "answer" });
  assert.deepEqual(lookup(across, "c0", "Safety", "Day").undefinedShare, true);
  assert.deepEqual(lookup(across, "c0", "Time", "Night").den, 2);
  assert.throws(
    () => analyse(d, { ...v, chart: "stack" }),
    /one answer per person/,
  );
  const stack = analyse(d, { ...v, chart: "stack", percentBase: "answer" });
  for (const [answer, total] of [
    ["Time", 100],
    ["Cost", 100],
    ["Safety", 0],
  ]) {
    const cells = stack.records.filter((r) => r.label === answer);
    assert.equal(
      cells.reduce((sum, r) => sum + r.value, 0),
      total,
    );
    assert.ok(cells.every((r) => r.undefinedShare === (total === 0)));
  }
  const filtered = analyse(d, {
    ...v,
    percentBase: "answer",
    filter: "c1",
    value: "Day",
  });
  assert.deepEqual(
    filtered.groupSizes.map((g) => g.group),
    ["Day"],
  );
  assert.equal(
    filtered.groupSizes[0].colourIndex,
    stack.groupSizes.find((g) => g.group === "Day").colourIndex,
  );
  assert.equal(lookup(filtered, "c0", "Cost", "Day").den, 1);
  assert.equal(lookup(filtered, "c0", "Time", "Day").undefinedShare, true);
});

test("numerical group bands stay stable through filtering and resolve to exactly the records behind each cell", () => {
  const d = makeTable(
    [
      ["Trip", "Distance", "Copy"],
      ...Array.from({ length: 62 }, (_, i) => [
        i % 2 ? "Local" : "Long",
        String(10.5 + i / 5),
        i % 3 ? "yes" : "no",
      ]),
    ],
    "Trips",
  );
  d.fields[2].roles = ["open"];
  assert.deepEqual(
    groupChoices(d, ["c0"]).map(([id]) => id),
    ["c1"],
  );
  assert.ok(!patternChoices(d).some(([id]) => id === "c2"));
  const v = { ...view, items: ["c0"], groupBy: "c1" };
  const a = analyse(d, v);
  assert.ok(a.groupSizes.length >= 4 && a.groupSizes.length <= 10);
  for (const r of a.records) {
    const rows = d.rows.filter(
      (row) => groupValue(d, "c1", row) === r.groupValue,
    );
    assert.equal(rows.length, r.den);
    assert.equal(rows.filter((row) => row.c0 === r.label).length, r.n);
  }
  const filtered = analyse(d, { ...v, filter: "c0", value: "Local" });
  assert.deepEqual(
    filtered.groupSizes.map((g) => g.group),
    a.groupSizes.map((g) => g.group),
  );
  assert.match(
    filtered.note,
    /Numerical groups use ranges based on the full data/,
  );
});

test("plain-language counts name the requested question, subgroup and the correct denominator", () => {
  for (const percentBase of ["group", "answer"]) {
    const v = { ...view, percentBase };
    const a = { ...analyse(survey, v), settings: tutorViewSettings(v) };
    const query = "How many people in group 19 chose Yes for Street lighting?";
    const result = chartReadingOptions([a], "count", query)[0].options[0];
    assert.match(
      result,
      percentBase === "answer"
        ? /3 people with a recorded group.*2 belonged to “19”/
        : /group “19”, 2 of 3/,
    );
    assert.doesNotMatch(result, /Open spaces/);
  }
});
