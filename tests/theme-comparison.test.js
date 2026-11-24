import test from "node:test";
import assert from "node:assert/strict";
import { analyse } from "../src/analysis.js";
import { figureScope } from "../src/figure-edits.js";

function interviews() {
  return {
    kind: "text",
    sources: ["A", "B", "C", "D", "E", "F"],
    metadata: {
      A: { Role: "Nacht" },
      B: { Role: "Nacht" },
      C: { Role: "Dag" },
      D: { Role: "Dag" },
      E: { Role: "Dag" },
    },
    interviews: { established: true },
    coding: {
      book: [
        { label: "Toegang" },
        { label: "Planning" },
        { label: "Approved only" },
      ],
    },
    passages: [
      {
        id: "a",
        source: "A",
        text: "De deur is dicht.",
        codes: [],
        reviewed: true,
        codingIncluded: true,
      },
      {
        id: "aq",
        source: "A",
        text: "deur",
        parent: "a",
        start: 3,
        codes: ["Toegang"],
        reviewed: true,
      },
      {
        id: "aq2",
        source: "A",
        text: "dicht",
        parent: "a",
        start: 11,
        codes: ["Toegang", "Planning"],
      },
      {
        id: "a2",
        source: "A",
        text: "Ik probeer opnieuw.",
        codes: ["Toegang"],
        codingIncluded: true,
      },
      {
        id: "b",
        source: "B",
        text: "Ik plan vooruit.",
        codes: ["Planning"],
        reviewed: true,
        codingIncluded: true,
      },
      {
        id: "d",
        source: "D",
        text: "Consent",
        codes: ["Toegang"],
        codingIncluded: false,
      },
      {
        id: "e",
        source: "E",
        text: "Dat klopt.",
        codes: [],
        codingIncluded: true,
      },
      {
        id: "f",
        source: "F",
        text: "Geen groepscode.",
        codes: ["Toegang"],
        codingIncluded: true,
      },
    ],
  };
}
const v = {
  task: "patterns",
  patternMode: "sources",
  items: ["Toegang", "Planning", "Approved only"],
  chart: "grid",
};
const cell = (a, theme, col) =>
  a.records.find((r) => r.label === theme && r.groupValue === col);
const metrics = (r) => [r.n, r.den, r.value, r.undefinedShare];

test("figure edits remain attached to the original theme denominator", () => {
  for (const groupBy of [null, "Role"]) {
    const base = { ...v, groupBy };
    const setting = groupBy ? "themeUnit" : "sourceMeasure";
    const scopes = (
      groupBy
        ? ["interviews", "passages", "themeShare"]
        : ["count", "percent", "themeShare"]
    ).map((measure) => figureScope({ ...base, [setting]: measure }));
    assert.equal(scopes[0], figureScope(base));
    assert.equal(new Set(scopes).size, 3);
  }
});

test("individual profiles count each eligible original passage once per theme and identify unavailable material", () => {
  const d = interviews();
  const a = analyse(d, v);
  assert.equal(a.themeComparison.unit, "count");
  assert.deepEqual(
    a.groupSizes.map((r) => r.group),
    ["A", "B", "C", "E", "F"],
  );
  assert.deepEqual(metrics(cell(a, "Toegang", "A")), [2, 2, 2, false]);
  assert.deepEqual(metrics(cell(a, "Planning", "A")), [1, 2, 1, false]);
  assert.deepEqual(metrics(cell(a, "Toegang", "E")), [0, 1, 0, false]);
  assert.deepEqual(metrics(cell(a, "Toegang", "C")), [0, 0, 0, true]);
  assert.equal(
    a.records.some((r) => r.group === "D"),
    false,
  );
  assert.equal(cell(a, "Approved only", "E").value, 0);
  assert.equal(a.themeComparison.reviewed, 2);
  const pct = analyse(d, {
    ...v,
    sourceMeasure: "percent",
    filter: "Role",
    value: "Nacht",
  });
  assert.equal(pct.themeComparison.unit, "passageShare");
  assert.deepEqual(metrics(cell(pct, "Planning", "A")), [1, 2, 50, false]);
  assert.equal(
    pct.records.some((r) => r.groupValue === "E"),
    false,
  );
  assert.doesNotMatch(JSON.stringify(a), /De deur|Geen groepscode/);
});
test("group coverage counts an interview once and retains listed empty interviews, while passage shares use included originals", () => {
  const d = interviews();
  const group = { ...v, groupBy: "Role" };
  const a = analyse(d, group);
  assert.deepEqual(metrics(cell(a, "Toegang", "Nacht")), [1, 2, 50, false]);
  assert.deepEqual(metrics(cell(a, "Planning", "Nacht")), [2, 2, 100, false]);
  assert.deepEqual(metrics(cell(a, "Toegang", "Dag")), [0, 2, 0, false]);
  assert.deepEqual(a.themeComparison, {
    grouped: true,
    unit: "interviewShare",
    written: false,
    sources: 4,
    omitted: 1,
    passages: 4,
    reviewed: 2,
    sourcesWithoutPassages: 1,
  });
  assert.equal(a.largestDisplayedDifference.percentagePoints, 100);
  const p = analyse(d, { ...group, themeUnit: "passages" });
  assert.deepEqual(metrics(cell(p, "Toegang", "Nacht")), [
    2,
    3,
    200 / 3,
    false,
  ]);
  assert.equal(cell(p, "Toegang", "Dag").den, 1);
  const filtered = analyse(d, {
    ...group,
    themeUnit: "passages",
    filter: "source",
    value: "C",
  });
  assert.deepEqual(metrics(cell(filtered, "Toegang", "Dag")), [0, 0, 0, true]);
  assert.ok(!filtered.largestDisplayedDifference);
});
test("explicitly non-interview corpora retain their existing source views", () => {
  for (const dataset of [
    { ...interviews(), openAnswers: true },
    { ...interviews(), textPurpose: "documents" },
  ])
    assert.equal(analyse(dataset, v).themeComparison, undefined);
});

test("theme contribution bars pool matching originals across the displayed sources or groups only", () => {
  const data = interviews();
  const individual = analyse(data, {
    ...v,
    sourceMeasure: "themeShare",
    chart: "stack",
  });
  assert.equal(individual.themeComparison.unit, "themePassageShare");
  assert.deepEqual(metrics(cell(individual, "Toegang", "A")), [
    2,
    3,
    200 / 3,
    false,
  ]);
  assert.deepEqual(metrics(cell(individual, "Toegang", "C")), [0, 3, 0, false]);
  assert.deepEqual(metrics(cell(individual, "Approved only", "C")), [
    0,
    0,
    0,
    true,
  ]);
  const groupView = {
    ...v,
    groupBy: "Role",
    themeUnit: "themeShare",
    chart: "stack",
  };
  const grouped = analyse(data, groupView);
  assert.deepEqual(metrics(cell(grouped, "Toegang", "Nacht")), [
    2,
    2,
    100,
    false,
  ]);
  assert.deepEqual(metrics(cell(grouped, "Toegang", "Dag")), [0, 2, 0, false]);
  assert.equal(grouped.largestDisplayedDifference, undefined);
  assert.equal(grouped.themeComparison.omitted, 1);
  const filtered = analyse(data, {
    ...groupView,
    filter: "source",
    value: "E",
  });
  assert.deepEqual(metrics(cell(filtered, "Toegang", "Dag")), [0, 0, 0, true]);
  assert.equal(
    filtered.groupSizes[0].colourIndex,
    grouped.groupSizes[1].colourIndex,
  );
  assert.throws(
    () => analyse(data, { ...groupView, themeUnit: "passages" }),
    /100% contribution/,
  );
});
