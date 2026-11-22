import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, newView } from "../src/analysis.js";
import { codedSheet, makeTable } from "../src/import.js";
import { analyticalEvidence } from "../src/tutor-evidence.js";
import { patternChoices, patternSummary } from "../src/patterns.js";
import { projectPackage } from "../src/tutor-history.js";
import { fresh, verifyProject, switchDataset } from "../src/project.js";
import { setQuestionRoles } from "../src/open-answers.js";

test("unused approved labels have zero evidence in pickers, grids and bot summaries", () => {
  const d = {
    kind: "text",
    sources: ["Interview A"],
    passages: [{ source: "Interview A", text: "Evidence", codes: ["A"] }],
    coding: { book: [{ label: "A" }, { label: "B" }] },
    interviews: { established: true },
  };
  assert.deepEqual(patternChoices(d), [
    ["A", "A"],
    ["B", "B"],
  ]);
  assert.equal(
    analyse(d, { task: "group", chart: "presence" }).records[1].value,
    0,
  );
  assert.deepEqual(
    analyticalEvidence(d, {}, "B").codeCounts.find((r) => r.code === "B"),
    { code: "B", matchingPassages: 0, distinctSourcesWithCode: 0 },
  );
});
test("grouped figures keep the student title; a reclassified open answer can only be read as text", () => {
  const d = makeTable(
    [
      ["Transport", "Stage"],
      ["Bus", "A"],
      ["Walk", "B"],
    ],
    "survey",
  );
  assert.equal(
    patternSummary(d, {
      task: "patterns",
      items: ["c0"],
      groupBy: "c1",
      patternMode: "separate",
      title: "Student figure",
    }).title,
    "Student figure",
  );
  setQuestionRoles(d.fields[0], ["open"]);
  assert.throws(
    () => analyse(d, { task: "one", x: "c0", chart: "bars" }),
    /written answers/,
  );
  assert.equal(
    analyse(d, { task: "one", x: "c0", chart: "excerpts" }).excerpt.length,
    2,
  );
});
test("inactive survey and interview views survive project packaging and dataset switches", () => {
  const a = makeTable(
      [
        ["A", "B"],
        ["yes", "high"],
      ],
      "Survey",
    ),
    b = {
      id: "interviews",
      kind: "text",
      sources: ["One"],
      passages: [{ id: "p", source: "One", codes: ["One"], text: "sample" }],
      unit: "source",
    };
  const p = { ...fresh(), datasets: [a, b] };
  switchDataset(p, a.id, newView);
  p.views[0].x = "c1";
  p.views[1].title = "Another view";
  p.linked = false;
  p.comparisonStarted = true;
  switchDataset(p, b.id, newView);
  p.views[0].title = "Theme";
  const saved = verifyProject(JSON.parse(JSON.stringify(projectPackage(p))));
  switchDataset(saved, a.id, newView);
  assert.deepEqual(
    [
      saved.views[0].x,
      saved.views[1].title,
      saved.linked,
      saved.comparisonStarted,
    ],
    ["c1", "Another view", false, true],
  );
  switchDataset(saved, b.id, newView);
  assert.equal(saved.views[0].title, "Theme");
});
test("a selected interview ID column cannot silently turn a missing ID into a new interview", () => {
  const d = makeTable(
    [
      ["Interview", "Passage", "Code"],
      ["", "A reply", "Travel"],
    ],
    "interviews",
  );
  assert.throws(
    () => codedSheet(d, { source: "c0", text: "c1", codes: "c2" }),
    /missing its interview/,
  );
  assert.deepEqual(codedSheet(d, { text: "c1", codes: "c2" }).sources, [
    "interviews",
  ]);
});

test("whole-interview coding sends original passages once and respects an already labelled quotation", async () => {
  const { coveredByQuotation, interviewBatches } =
    await import("../src/interviews.js");
  const parent = {
    id: "a",
    source: "One",
    text: "A bus ticket is costly.",
    codes: [],
  };
  const child = {
    id: "b",
    source: "One",
    text: "ticket is costly",
    start: 6,
    parent: "a",
    codes: ["Cost"],
  };
  const match = { code: "Cost", quote: "costly" };
  assert.equal(
    interviewBatches({ passages: [parent, child] }, "One", null, true).flat()
      .length,
    1,
  );
  assert.equal(coveredByQuotation(match, parent, [child]), true);
  assert.equal(
    coveredByQuotation(
      match,
      { ...parent, text: parent.text + " Fuel is costly." },
      [child],
    ),
    false,
  );
});

test("one model instruction survives Markdown and an explanation; competing instructions are rejected", async () => {
  const { structuredAnswer } = await import("../src/bot-response.js");
  const action = { action: "draw", task: "model" },
    json = JSON.stringify(action),
    block = "```json\n" + json + "\n```";
  assert.deepEqual(
    structuredAnswer(block + "\nHere is the regression."),
    action,
  );
  assert.deepEqual(
    structuredAnswer(json + "\nHere is the regression."),
    action,
  );
  assert.throws(() => structuredAnswer(block + "\n" + block));
  assert.throws(() => structuredAnswer("For example: " + block, false));
});
