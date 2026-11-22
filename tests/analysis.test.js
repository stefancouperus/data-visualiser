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

test("QSF recodes use the instrument and settings-only projects restore the same labels", async () => {
  const { labelledSurvey } = await import("../src/survey-labels.js");
  const original = makeTable(
    [
      ["Q1", "Age"],
      ["10", "19"],
      ["20", "20"],
      ["", "21"],
    ],
    "Survey",
  );
  const definition = {
    SurveyElements: [
      {
        Element: "SQ",
        Payload: {
          QuestionID: "QID1",
          DataExportTag: "Q1",
          QuestionText: "Will you vote?",
          QuestionType: "MC",
          Selector: "SAVR",
          Choices: { 1: { Display: "Yes" }, 2: { Display: "No" } },
          RecodeValues: { 1: "20", 2: "10" },
        },
      },
    ],
  };
  const { copy } = labelledSurvey(original, definition);
  assert.deepEqual(
    copy.rows.map((r) => r.c0),
    ["No", "Yes", ""],
  );
  assert.deepEqual(
    copy.rows.map((r) => r.c1),
    ["19", "20", "21"],
  );
  assert.equal(original.rows[0].c0, "10");
  const restored = reattach(settingsProject({ ...fresh(), datasets: [copy] }), [
    original,
  ]);
  assert.deepEqual(restored.datasets[0].rows, copy.rows);
  const unfamiliar = makeTable(
    [["Q1"], ["10"], ["99"]],
    "Other response codes",
  );
  assert.equal(labelledSurvey(unfamiliar, definition).decoded, 0);
});

test("survey filters, repeated ticks, numerical and text views use their actual denominators", async () => {
  const { analyticalEvidence, pairedStatistics } =
    await import("../src/tutor-evidence.js");
  const t = makeTable(
    [
      ["Group", "Age", "Tags", "Comment"],
      ["A", "18", "Work;Work;Time", "One idea"],
      ["A", "22", "Work", "Another"],
      ["B", "60", "Time", "One more"],
      ["B", "", "", ""],
    ],
    "survey",
  );
  t.fields[2].type = "multiple";
  t.fields[3].type = "text";
  const grouped = analyse(t, {
    x: "c2",
    y: "c0",
    task: "group",
    chart: "grid",
    measure: "percent",
  });
  assert.deepEqual(
    grouped.records.find((r) => r.label === "Work" && r.group === "A"),
    { label: "Work", group: "A", n: 2, den: 2, value: 100 },
  );
  const view = {
    task: "one",
    x: "c1",
    chart: "hist",
    filter: "c0",
    value: "A",
    measure: "percent",
  };
  const bins = analyse(t, view).records;
  assert.equal(
    bins.reduce((n, r) => n + r.value, 0),
    100,
  );
  assert.equal(
    analyticalEvidence(t, view, "What is the average Age?").numericSummaries[0]
      .median,
    20,
  );
  assert.equal(
    analyse(t, { x: "c3", chart: "excerpts", query: "one" }).excerpt.length,
    2,
  );
  assert.equal(
    pairedStatistics([
      { a: 0, b: 4 },
      { a: 1, b: 2 },
      { a: 2, b: 0 },
    ]).pearsonR,
    -1,
  );
});
test("source presence, passage counts, overlap and selected model context agree", async () => {
  const { analyticalEvidence } = await import("../src/tutor-evidence.js");
  const d = corpus(
    "docs",
    [
      { source: "A", codes: ["X", "Y"], reviewed: true },
      { source: "A", codes: ["X"], reviewed: true },
      { source: "B", codes: ["Y"], reviewed: false },
    ],
    ["A", "B", "C"],
  );
  const v = { task: "group", chart: "presence", measure: "sources" };
  const a = analyse(d, v);
  assert.match(a.unit, /Presence/);
  assert.deepEqual(
    a.records.filter((r) => r.label === "X").map((r) => [r.n, r.value]),
    [
      [2, 1],
      [0, 0],
      [0, 0],
    ],
  );
  const e = analyticalEvidence(d, v, "How many interviews mention X?");
  assert.deepEqual(
    e.codeCounts.find((r) => r.code === "X"),
    { code: "X", matchingPassages: 2, distinctSourcesWithCode: 1 },
  );
  const filtered = analyticalEvidence(
    d,
    { ...v, filter: "source", value: "B" },
    "",
  );
  assert.equal(filtered.listedSources, 1);
  assert.equal(
    analyse(d, {
      x: "X",
      y: "Y",
      task: "two",
      chart: "bars",
      measure: "sources",
    }).records[1].n,
    1,
  );
});
test("append and join honour exclusions and preserve the two inputs", async () => {
  const { combineTables } = await import("../src/combine.js");
  const left = makeTable(
    [
      ["ID", "answer"],
      ["a", "yes"],
      ["b", "no"],
    ],
    "responses",
  );
  const meta = makeTable(
    [
      ["ID", "group"],
      ["a", "first"],
      ["a", "omit"],
      ["c", "second"],
    ],
    "attributes",
  );
  meta.rules = [{ field: "c1", value: "omit" }];
  const joined = combineTables(left, meta, "join", "c0", "c0");
  assert.equal(joined.matchCount, 1);
  assert.deepEqual(
    joined.rows.map((r) => r[joined.fields.at(-1).id]),
    ["first", ""],
  );
  const add = makeTable(
    [
      ["answer", "ID"],
      ["yes", "c"],
    ],
    "extra",
  );
  assert.equal(combineTables(left, add, "append").rows[2].c0, "c");
  assert.equal(left.rows.length, 2);
});
