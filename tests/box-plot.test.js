import test from "node:test";
import assert from "node:assert/strict";
import { analyse } from "../src/analysis.js";
import { makeTable } from "../src/import.js";
import { supportsBoxPlot } from "../src/box-plot.js";

function survey() {
  const d = makeTable(
    [
      ["Commute (minutes)", "Campus", "Wave"],
      ["0", "North", "Current"],
      ["10", "North", "Current"],
      ["20", "North", "Current"],
      ["100", "North", "Current"],
      ["8", "South", "Current"],
      ["", "South", "Current"],
      ["-4", "West", "Current"],
      ["-4", "West", "Current"],
      ["", "East", "Current"],
      ["9", "", "Current"],
      ["1000", "North", "Preview"],
    ],
    "Travel study",
  );
  d.rules = [{ field: "c2", value: "Preview" }];
  return d;
}
const grouped = {
  chart: "box",
  task: "group",
  x: "c0",
  y: "c1",
  measure: "percent",
};

test("box plot compares valid numerical measurements on their original scale", () => {
  const a = analyse(survey(), grouped);
  assert.equal(a.title, "Commute (minutes) by Campus");
  assert.deepEqual(a.records[0], {
    group: "North",
    label: "North",
    n: 4,
    value: 15,
    minimum: 0,
    lowerQuartile: 7.5,
    median: 15,
    upperQuartile: 40,
    maximum: 100,
  });
  assert.equal(a.records.find((r) => r.group === "South").median, 8);
  const tied = a.records.find((r) => r.group === "West");
  assert.equal(tied.minimum, -4);
  assert.equal(tied.maximum, -4);
  assert.equal(tied.n, 2);
  const missing = a.records.find((r) => r.group === "East");
  assert.equal(missing.n, 0);
  assert.equal(missing.median, null);
  assert.match(a.note, /7 of 10 selected records/);
});

test("a single question ignores obsolete grouping settings and respects the current filter", () => {
  const d = survey();
  const a = analyse(d, { ...grouped, task: "one" });
  assert.equal(a.title, "Commute (minutes)");
  assert.equal(a.records.length, 1);
  assert.equal(a.records[0].n, 8);
  assert.equal(a.records[0].median, 8.5);
  const filtered = analyse(d, {
    ...grouped,
    task: "two",
    filter: "c1",
    value: "South",
  });
  assert.equal(filtered.records.length, 1);
  assert.equal(filtered.records[0].n, 1);
  assert.equal(filtered.records[0].minimum, filtered.records[0].maximum);
});

test("blank or invalid numbers produce a missing group summary, never a zero median", () => {
  const d = survey();
  d.rows = ["", null, undefined, "  ", "unknown", Infinity].map((v) => ({
    c0: v,
    c1: "North",
  }));
  const a = analyse(d, grouped);
  assert.equal(a.records.length, 1);
  assert.equal(a.records[0].n, 0);
  assert.equal(a.records[0].value, null);
  assert.match(a.note, /0 of 6/);
  assert.deepEqual(
    analyse(d, { ...grouped, filter: "c1", value: "South" }).records,
    [],
  );
});

test("box plots require a numeric field and a single-choice split", () => {
  const d = survey();
  for (const type of ["date", "ordered", "category", "multiple", "text"])
    assert.equal(supportsBoxPlot({ type }, null, "one"), false);
  for (const type of ["number", "multiple", "text", "date", "metadata"])
    assert.equal(supportsBoxPlot(d.fields[0], { type }, "group"), false);
  assert.equal(supportsBoxPlot(d.fields[0], { type: "ordered" }, "two"), true);
  assert.equal(
    supportsBoxPlot(d.fields[0], { ...d.fields[1], roles: ["open"] }, "group"),
    false,
  );
  assert.throws(
    () => analyse(d, { ...grouped, x: "c1" }),
    /numerical question/,
  );
});
