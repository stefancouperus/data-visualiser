import test from "node:test";
import assert from "node:assert/strict";
import { makeTable } from "../src/import.js";
import {
  suggestGrouping,
  asksForGroupSuggestion,
} from "../src/group-suggestions.js";
const view = { task: "patterns", items: ["c0"], patternMode: "together" };
test("suggestions screen real comparisons, preserve filters and never recommend a selected or copied field", () => {
  const d = makeTable(
    [
      ["Vote", "Study year", "Copy", "Room"],
      ["Yes", "First", "Yes", "A"],
      ["Yes", "First", "Yes", "B"],
      ["No", "Final", "No", "A"],
      ["No", "Final", "No", "B"],
    ],
    "Survey",
  );
  const r = suggestGrouping(d, view);
  assert.equal(r.spec.groupBy, "c1");
  assert.match(r.message, /2 of 2 responses/);
  assert.match(r.message, /100 percentage-point/);
  assert.match(r.message, /checked 2 possible groupings/);
  assert.equal(
    suggestGrouping(d, { ...view, filter: "c1", value: "First" }).spec,
    undefined,
  );
});
test("equal shares and one-person contrasts do not prompt a chart", () => {
  const d = makeTable(
    [
      ["Vote", "Year", "Role"],
      ["Yes", "A", "X"],
      ["No", "A", "X"],
      ["Yes", "B", "X"],
      ["No", "B", "Y"],
    ],
    "Survey",
  );
  const r = suggestGrouping(d, view);
  assert.equal(r.spec, undefined);
  assert.match(r.message, /same shares/);
});

test("recommending another grouping uses within-group rates even after viewing group composition", () => {
  const data = makeTable(
    [
      ["Satisfaction", "Route"],
      ["Good", "East"],
      ["Good", "East"],
      ["Good", "East"],
      ["Good", "East"],
      ["Good", "East"],
      ["Good", "West"],
      ["Poor", "West"],
    ],
    "Survey",
  );
  const result = suggestGrouping(data, {
    ...view,
    patternMode: "separate",
    percentBase: "answer",
  });
  assert.equal(result.spec.percentBase, "group");
  assert.equal(result.spec.chart, "grid");
  assert.match(result.message, /50 percentage-point difference/);
  assert.deepEqual(result.evidence.map((r) => r.den).sort(), [2, 5]);
});
test("interview recommendations count distinct interviews or passages under their selected unit", () => {
  const d = {
    kind: "text",
    sources: ["A", "B", "C", "D"],
    metadata: {
      A: { Cohort: "First" },
      B: { Cohort: "First" },
      C: { Cohort: "Final" },
      D: { Cohort: "Final" },
    },
    passages: ["A", "A", "B", "C", "D"].map((s) => ({
      source: s,
      codes: ["A", "B"].includes(s) ? ["Time"] : [],
      reviewed: true,
    })),
  };
  const v = { task: "patterns", items: ["Time"], patternMode: "sources" };
  assert.match(suggestGrouping(d, v).message, /2 of 2 interviews/);
  assert.match(
    suggestGrouping(d, { ...v, themeUnit: "passages" }).message,
    /3 of 3 passages/,
  );
  assert.match(
    suggestGrouping({ ...d, metadata: {} }, v).message,
    /Add interview groups/,
  );
  assert.ok(asksForGroupSuggestion("Do any groups stand out?"));
  assert.ok(asksForGroupSuggestion("Which groups should I compare?"));
  assert.equal(
    asksForGroupSuggestion("Split these answers by study year"),
    false,
  );
});

test("shortlisting depends on the survey data even when many competing fields have familiar demographic labels", () => {
  const familiar = [
    "Study year",
    "Age group",
    "Education",
    "Occupation",
    "Region",
    "Cohort",
    "Programme",
    "Faculty",
    "Department",
    "Gender",
    "Employment",
    "Year group",
  ];
  const d = makeTable(
    [
      ["Damage reported", "Packing method", ...familiar],
      ...Array.from({ length: 8 }, (_, i) => [
        i < 4 ? "Damaged" : "Intact",
        i < 4 ? "Paper" : "Foam",
        ...familiar.map(() => (i % 2 ? "A" : "B")),
      ]),
    ],
    "Delivery survey",
  );
  const result = suggestGrouping(d, view);
  assert.equal(result.spec?.groupBy, "c1");
  assert.match(result.message, /Packing method/);
  for (const [i, f] of d.fields.entries()) f.label = "Field " + i;
  assert.deepEqual(suggestGrouping(d, view).spec, result.spec);
});

test("interview group suggestions follow the project's own codes and metadata labels", () => {
  const d = {
    kind: "text",
    sources: ["A", "B", "C", "D"],
    metadata: Object.fromEntries(
      ["A", "B", "C", "D"].map((s, i) => [
        s,
        { "Repair setting": i < 2 ? "Workshop" : "On site" },
      ]),
    ),
    passages: ["A", "B", "C", "D"].map((source, i) => ({
      source,
      codes: i < 2 ? ["Parts unavailable"] : ["Stock ready"],
      reviewed: true,
    })),
  };
  const result = suggestGrouping(d, {
    task: "patterns",
    items: ["Parts unavailable"],
    patternMode: "sources",
  });
  assert.equal(result.spec?.groupBy, "Repair setting");
  for (const label of ["Parts unavailable", "Workshop", "On site"])
    assert.ok(result.message.includes(label));
});
