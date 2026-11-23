import assert from "node:assert/strict";
import test from "node:test";
import { figureScope, figurePresentation } from "../src/figure-edits.js";

test("figure-only names and positions follow each original cell without changing analysis records or another question", () => {
  const view = { task: "group", x: "questionA", y: "cohort", chart: "bars" };
  const rows = ["A", "B"].flatMap((group) =>
    ["Yes", "No"].map((label) => ({ group, label, value: 1 })),
  );
  const analysis = { records: rows };
  view.figureEdits = {
    scope: figureScope(view),
    dimensions: {
      labels: { names: [["No", "No support"]], order: ["No", "Yes"] },
      groups: { names: [["B", "Second"]], order: ["B", "A"] },
    },
  };
  const edited = figurePresentation(analysis, view);
  assert.deepEqual(edited.records, [rows[3], rows[2], rows[1], rows[0]]);
  assert.deepEqual(
    analysis.records.map((r) => r.group + r.label),
    ["AYes", "ANo", "BYes", "BNo"],
  );
  assert.equal(edited.named("labels", edited.records[0].label), "No support");
  assert.equal(edited.named("groups", edited.records[0].group), "Second");
  const other = figurePresentation(analysis, { ...view, x: "questionB" });
  assert.equal(other.records, rows);
  assert.equal(other.named("labels", "No"), "No");
});

test("an edited line controls the series legend and leaves numerical points in their original series", () => {
  const view = {
    task: "two",
    chart: "line",
    x: "date",
    y: "count",
    z: "region",
  };
  const points = [
    { a: 3, b: 3, g: "A" },
    { a: 0, b: 1, g: "B" },
    { a: 2, b: 1, g: "A" },
  ];
  const analysis = { points, records: [], date: true };
  view.figureEdits = {
    scope: figureScope(view),
    dimensions: { series: { order: ["B", "A"], names: [["B", "Region two"]] } },
  };
  const presentation = figurePresentation(analysis, view, true);
  assert.deepEqual(
    presentation.dimensions.map((d) => d.key),
    ["series"],
  );
  assert.deepEqual(presentation.order("series", ["A", "B"]), ["B", "A"]);
  assert.deepEqual(analysis.points, points);
});
