import assert from "node:assert/strict";
import test from "node:test";
import { makeTable, filteredRows } from "../src/import.js";
import {
  combinedAnswerRequest,
  combinedAnswerTotals,
} from "../src/combined-answers.js";
import {
  qualtricsPreviews,
  setPreviewDecision,
} from "../src/qualtrics-previews.js";
const data = () =>
  makeTable(
    [
      ["StartDate", "Status", "Q1", "Q2", "Q3"],
      ["Start Date", "Response Type", "Lighting", "Transport", "Area"],
      ["1", "0", "Yes", "Yes", "East"],
      ["2", "0", "Yes", "No", "East"],
      ["3", "0", "No", "Yes", "West"],
      ["4", "0", "No", "No", "West"],
      ["5", "0", "Yes", "", "West"],
      ["6", "1", "Yes", "Yes", "East"],
      ["7", "Offline Preview", "Yes", "Yes", "West"],
      ["8", "2", "", "", "East"],
    ],
    "Workshop",
  );
const v = {
  task: "patterns",
  patternMode: "separate",
  items: ["c2", "c3"],
  groupBy: "c4",
  chart: "grid",
};
test("joint counts keep the same complete respondents for all versus any, after exclusions, group and view filters", () => {
  const d = data();
  setPreviewDecision(d, "exclude");
  const ask = (q, view = v) => combinedAnswerRequest(d, view, q);
  for (const question of [
    "How many chose Yes on both selected questions?",
    "How many chose Yes on all of the selected questions?",
    "How many chose Yes for both Lighting and Transport?",
    "How many chose Yes on both?",
    "How many chose Yes on both of them?",
    "How many chose Yes on all 2 selected questions?",
  ]) {
    const result = ask(question);
    assert.deepEqual(
      result.results.map((r) => [r.n, r.den, r.incomplete]),
      [[1, 4, 2]],
      question,
    );
    assert.match(result.message, /2 had a missing answer/);
  }
  for (const question of [
    "How many chose Yes on at least one of the selected questions?",
    "What percentage chose Yes on either question?",
    "How many chose Yes on any of the two questions?",
  ])
    assert.equal(ask(question).results[0].n, 3, question);
  assert.deepEqual(
    ask("How many selected Yes on both questions for each group?").results.map(
      (r) => [r.group, r.n, r.den],
    ),
    [
      ["East", 1, 2],
      ["West", 0, 2],
    ],
  );
  assert.equal(
    ask("How many chose Yes on both questions?", {
      ...v,
      filter: "c4",
      value: "West",
    }).results[0].n,
    0,
  );
  assert.equal(
    ask("How many chose Yes on both questions?", { ...v, items: ["c2"] })
      .results,
    undefined,
  );
  assert.equal(
    ask("How many chose Yes on all three questions?").results,
    undefined,
  );
  d.fields[3].levels = ["Other"];
  assert.equal(ask("How many chose Yes on both questions?").results, undefined);
});
test("manual cross-question counts allow distinct answer sets and count an answered checkbox with no ticks as valid", () => {
  const d = data();
  setPreviewDecision(d, "exclude");
  const f = d.fields[2];
  Object.assign(f, {
    type: "multiple",
    checkboxIndicators: [],
    separator: ";",
    levels: ["A", "B"],
  });
  const values = ["A;B", "", "B", null, "A", "B", "A", null];
  d.rows.forEach((row, i) => (row.c2 = values[i]));
  const sels = [
    { field: "c2", answers: ["A", "B"] },
    { field: "c3", answers: ["Yes"] },
  ];
  assert.deepEqual(
    combinedAnswerTotals(d, v, sels, false, "all").results.map((x) => [
      x.n,
      x.den,
    ]),
    [[2, 3]],
  );
  assert.deepEqual(
    combinedAnswerTotals(d, v, sels, false, "any").results.map((x) => [
      x.n,
      x.den,
    ]),
    [[2, 3]],
  );
});
test("preview decisions recognise Qualtrics labels and numeric status, are reversible, and preserve unrelated rules", () => {
  const d = data();
  assert.equal(qualtricsPreviews(d).count, 2);
  assert.equal(qualtricsPreviews(d).decision, "");
  d.rules = [{ field: "c4", value: "West" }];
  setPreviewDecision(d, "exclude");
  setPreviewDecision(d, "exclude");
  assert.equal(d.rules.length, 3);
  assert.equal(qualtricsPreviews(d).decision, "exclude");
  assert.equal(filteredRows(d).length, 3);
  setPreviewDecision(d, "keep");
  assert.deepEqual(d.rules, [{ field: "c4", value: "West" }]);
  assert.equal(qualtricsPreviews(d).decision, "keep");
  assert.equal(qualtricsPreviews({ ...d, qual: false }), undefined);
});

test("use distribution-channel previews when Status was omitted, but preserve the authoritative status if present", () => {
  const d = data();
  const f = {
    id: "c5",
    raw: "DistributionChannel",
    label: "Distribution channel",
    type: "metadata",
    levels: ["preview", "anonymous"],
  };
  d.fields.push(f);
  d.rows.forEach((r, i) => (r.c5 = i === 0 ? "preview" : "anonymous"));
  assert.equal(qualtricsPreviews(d).count, 2);
  d.fields = d.fields.filter((f) => f.raw !== "Status");
  assert.equal(qualtricsPreviews(d).count, 1);
  setPreviewDecision(d, "exclude");
  assert.deepEqual(d.rules, [{ field: "c5", value: "preview" }]);
});
