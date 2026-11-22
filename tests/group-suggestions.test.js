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
