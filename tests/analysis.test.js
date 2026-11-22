import test from "node:test";
import assert from "node:assert/strict";
import {
  makeTable,
  parseCSV,
  codedSheet,
  corpus,
  filteredRows,
} from "../src/import.js";
import { analyse, newView } from "../src/analysis.js";
import { fitModel } from "../src/model.js";
import { fresh, settingsProject, reattach, linkage } from "../src/project.js";
test("Qualtrics headers do not become responses and filters preserve raw records", () => {
  const t = makeTable(
    parseCSV(
      'Status,Q1,Q2\nResponse type,Vote,Group\n"{""ImportId"":""status""}","{""ImportId"":""QID1""}","{""ImportId"":""QID2""}"\nPreview,Yes,A\nNormal,Yes,A\nNormal,No,A\nNormal,,A\nNormal,Yes,B',
    ),
    "Survey",
  );
  assert.equal(t.rows.length, 5);
  assert.equal(t.fields[0].type, "metadata");
  t.rules = [{ field: "c0", value: "Preview" }];
  assert.equal(filteredRows(t).length, 4);
  const a = analyse(t, {
    ...newView(t),
    task: "group",
    y: "c2",
    measure: "percent",
  });
  assert.equal(
    a.records.find((r) => r.group === "A" && r.label === "Yes").value,
    50,
  );
  assert.match(a.note, /3 valid of 4/);
});
test("repeated passage rows preserve multiple labels and distinct sources", () => {
  const t = makeTable(
    [
      ["Interview", "Text", "Code", "ID"],
      ["S", "one passage", "a", "1"],
      ["S", "one passage", "b", "1"],
      ["T", "second", "a", "1"],
    ],
    "book",
  );
  const { passages, sources } = codedSheet(t, {
    source: "c0",
    text: "c1",
    codes: "c2",
    passage: "c3",
  });
  assert.equal(passages.length, 2);
  const d = corpus("text", passages, [...sources, "U"]);
  const a = analyse(d, {
    task: "two",
    x: "a",
    y: "b",
    measure: "sources",
    chart: "bars",
  });
  assert.deepEqual(
    a.records.map((r) => r.n),
    [1, 1, 0],
  );
});
test("OLS recovers known regression and logistic predicts a probability", () => {
  const t = makeTable(
    [
      ["x", "y", "vote"],
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
        i,
        2 + 3 * i,
        ["No", "Yes", "No", "No", "Yes", "No", "Yes", "Yes"][i],
      ]),
    ],
    "reg",
  );
  const m = fitModel(t, t.rows, { outcome: "c1", predictors: ["c0"] });
  assert.ok(Math.abs(m.coefficients[1].estimate - 3) < 1e-8);
  assert.equal(m.n, 8);
  const l = fitModel(t, t.rows, {
    outcome: "c2",
    predictors: ["c0"],
    positive: "Yes",
  });
  assert.ok(l.predictions[3].value > 0 && l.predictions[3].value < 1);
});
test("settings reattach to matching data and duplicate metadata keys are rejected", () => {
  const d = makeTable(
    [
      ["source", "attr"],
      ["one", "x"],
      ["one", "y"],
    ],
    "meta",
  );
  const p = fresh();
  p.datasets = [d];
  const s = settingsProject(p);
  assert.equal(s.datasets[0].rows, undefined);
  assert.equal(reattach(s, [d]).datasets[0].rows.length, 2);
  assert.throws(
    () => linkage(corpus("t", [], ["one"]), d, "c0", { one: "one" }),
    /Repeated/,
  );
});
