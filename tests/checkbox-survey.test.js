import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTable, filteredRows } from "../src/import.js";
import { analyse, newView } from "../src/analysis.js";
import { patternSummary } from "../src/patterns.js";
import {
  fresh,
  verifyProject,
  settingsProject,
  reattach,
} from "../src/project.js";
import {
  combineCheckboxes,
  optionLevels,
  restoreLegacyCheckboxes,
} from "../src/survey-answers.js";

function fixture() {
  const table = makeTable(
    [
      ["Support", "Bicycle", "Bus", "Ferry"],
      ["Yes", "1", "1", "0"],
      ["Yes", "1", "0", "0"],
      ["No", "1", "1", "0"],
      ["Yes", "1", "1", "0"],
      ["Yes", "1", "0", "0"],
      ["Yes", "0", "1", "0"],
      ["No", "0", "1", "0"],
      ["No", "0", "1", "0"],
      ["No", "0", "0", "0"],
      ["No", "0", "0", "0"],
      ["No", "", "", ""],
      ["Yes", "", "", ""],
    ],
    "Mobility",
  );
  const field = combineCheckboxes(
    table,
    "m" + crypto.randomUUID(),
    "Travel modes",
    new Map([
      ["c1", new Set(["1"])],
      ["c2", new Set(["1"])],
      ["c3", new Set()],
    ]),
  );
  return { table, field };
}
test("checkbox estimates, missingness and filters preserve explicit negatives, overlapping selections and zero options", () => {
  const { table, field } = fixture();
  const multi = {
    ...newView(table),
    x: field.id,
    measure: "percent",
    chart: "table",
  };
  for (const a of [
    analyse(table, multi),
    patternSummary(table, {
      task: "patterns",
      items: [field.id],
      patternMode: "separate",
    }),
  ]) {
    assert.deepEqual(
      a.records
        .filter((r) => r.label !== "Bus")
        .map((r) => [r.label, r.n, r.den, r.value]),
      [
        ["Bicycle", 5, 10, 50],
        ["Ferry", 0, 10, 0],
      ],
    );
  }
  const together = patternSummary(table, {
    task: "patterns",
    items: [field.id],
    patternMode: "together",
  });
  assert.equal(together.complete, 10);
  assert.equal(
    together.records.find((r) => r.label === "No options selected").n,
    2,
  );
  const selected = { ...multi, x: "c0", filter: field.id, value: "Bicycle" };
  const counts = analyse(table, {
    ...selected,
    task: "group",
    y: "c1",
    measure: "count",
  });
  assert.doesNotMatch(counts.note, /Percentages/);
  const yes = analyse(table, selected).records.find((r) => r.label === "Yes");
  assert.deepEqual([yes.n, yes.den, yes.value], [4, 5, 80]);
  assert.equal(filteredRows(table, selected).length, 5);
  table.rules = [{ field: field.id, value: "Bicycle", mode: "option" }];
  assert.equal(filteredRows(table).length, 7);
  table.rules = [{ field: field.id, value: "Bicycle" }]; // Saved exact-string exclusions retain their meaning.
  assert.equal(filteredRows(table).length, 10);
  assert.deepEqual(
    optionLevels({
      type: "multiple",
      separator: ";",
      levels: ["A;B", "A", "C"],
    }),
    ["A", "B", "C"],
  );
});
test("portable downloads, settings + raw reimport and older grouped projects retain checkbox counts", () => {
  const { table, field } = fixture();
  const p = {
    ...fresh(),
    datasets: [table],
    active: table.id,
    views: [newView(table), newView(table)],
  };
  const project = verifyProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(project.datasets[0].rows, table.rows);
  const raw = structuredClone(table);
  raw.fields.pop();
  for (const row of raw.rows) delete row[field.id];
  assert.deepEqual(
    reattach(settingsProject(p), [raw]).datasets[0].rows,
    table.rows,
  );
  const old = structuredClone(table);
  delete old.fields.at(-1).checkboxIndicators;
  for (const row of old.rows) row[field.id] ||= "";
  restoreLegacyCheckboxes(old);
  assert.deepEqual(old.rows, table.rows);
});
