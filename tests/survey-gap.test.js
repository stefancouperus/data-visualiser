import test from "node:test";
import assert from "node:assert/strict";
import { makeTable } from "../src/import.js";
import { gapGroups } from "../src/survey-gap.js";
import { analyse } from "../src/analysis.js";
import { adaptChart } from "../src/screens.js";

function example() {
  const table = makeTable(
    [
      ["Response", "Study route", "Round"],
      ["Yes", "Campus", "Main"],
      ["Yes", "Campus", "Main"],
      ["Maybe", "Campus", "Main"],
      ["No", "Campus", "Main"],
      ["Yes", "Online", "Main"],
      ["Maybe", "Online", "Main"],
      ["", "Other", "Main"],
      ["No", "", "Main"],
      ["Yes", "Other", "Pilot"],
    ],
    "Project",
  );
  table.fields[0].type = "ordered";
  table.fields[0].levels = ["No", "Maybe", "Yes", "Unsure"];
  table.fields[1].levels = ["Online", "Campus", "Other"];
  const view = {
    chart: "gap",
    task: "group",
    x: "c0",
    y: "c1",
    filter: "c2",
    value: "Main",
    measure: "count",
  };
  return { table, view };
}

test("gap plot uses two observed groups, counts valid pairs per group, and preserves the project scale", () => {
  const { table, view } = example();
  assert.deepEqual(gapGroups(table, view), ["Online", "Campus"]);
  const summary = analyse(table, view);
  assert.deepEqual(
    summary.records.map((r) => [r.group, r.label, r.n, r.den, r.value]),
    [
      ["Online", "No", 0, 2, 0],
      ["Online", "Maybe", 1, 2, 50],
      ["Online", "Yes", 1, 2, 50],
      ["Online", "Unsure", 0, 2, 0],
      ["Campus", "No", 1, 4, 25],
      ["Campus", "Maybe", 1, 4, 25],
      ["Campus", "Yes", 2, 4, 50],
      ["Campus", "Unsure", 0, 4, 0],
    ],
  );
  assert.match(summary.note, /6 valid of 8/);
  assert.match(summary.unit, /^%/);
  assert.deepEqual(gapGroups(table, { ...view, filter: "" }), []);
  table.rules = [{ field: "c2", value: "Pilot" }];
  assert.deepEqual(gapGroups(table, { ...view, filter: "" }), [
    "Online",
    "Campus",
  ]);
});

test("a gap plot needs separate single-choice questions and two groups answering both", () => {
  const { table, view } = example();
  for (const patch of [
    { task: "one" },
    { x: "unknown" },
    { x: "c1" },
    { filter: "c1", value: "Online" },
    { filter: "" },
  ]) {
    const selection = { ...view, ...patch };
    assert.deepEqual(gapGroups(table, selection), []);
    assert.throws(() => analyse(table, selection));
  }
  for (const type of ["number", "multiple", "text"]) {
    table.fields[0].type = type;
    assert.deepEqual(gapGroups(table, view), []);
    assert.throws(() => analyse(table, view));
  }
});

test("widening a gap chart to three groups preserves the within-group percentage comparison", () => {
  const { table, view } = example();
  view.filter = "";
  assert.match(adaptChart(table, view), /Stacked bars/);
  assert.equal(view.chart, "stack");
  assert.equal(view.measure, "percent");
  assert.equal(
    analyse(table, view).records.find(
      (r) => r.group === "Other" && r.label === "Yes",
    ).value,
    100,
  );
});
