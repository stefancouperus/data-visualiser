import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canImport,
  projectMethods,
  separateMethod,
  workingDatasets,
} from "../src/project-method.js";

test("survey written answers and interview participant information stay in their original method", () => {
  const s = {
    id: "s",
    kind: "table",
    name: "Travel",
    fields: [{ label: "Why walk?" }],
  };
  const answer = {
    id: "q",
    kind: "text",
    name: "Written answers",
    openAnswers: { survey: "s" },
  };
  const oldAnswer = {
    id: "q2",
    kind: "text",
    name: "Travel · Why walk?",
    textPurpose: "documents",
  };
  const interview = { id: "i", kind: "text" };
  const info = { id: "m", kind: "table", purpose: "participant-information" };
  assert.deepEqual(projectMethods({ datasets: [answer, s] }), ["survey"]);
  assert.deepEqual(projectMethods({ datasets: [interview, info] }), [
    "interview",
  ]);
  assert.deepEqual(workingDatasets({ datasets: [info, interview] }), [
    interview,
  ]);
  for (const [method, permitted, excluded] of [
    ["survey", "survey", "coded"],
    ["interview", "participant-information", "table"],
    ["text", "text", "survey"],
  ]) {
    assert.equal(canImport(method, permitted), true);
    assert.equal(canImport(method, excluded), false);
  }
  const mixed = {
    datasets: [s, interview, answer, oldAnswer, info],
    active: "i",
    name: "Archived",
    views: [{ one: 1 }, { two: 2 }],
    workingViews: { s: { views: [{ x: "a" }, { x: "b" }], linked: false } },
    confirmed: ["s", "i", "q"],
    saved: [{ dataset: "i" }],
    savedVisuals: [{ dataset: "s" }],
    tutorHistory: { i: {}, s: {} },
    workLog: [{ dataset: "s" }, { dataset: "i" }, { dataset: "" }],
  };
  const survey = separateMethod(mixed, "survey");
  assert.deepEqual(
    survey.datasets.map((d) => d.id),
    ["s", "q", "q2"],
  );
  assert.deepEqual(survey.views, [{ x: "a" }, { x: "b" }]);
  assert.equal(survey.linked, false);
  assert.deepEqual(survey.saved, []);
  assert.deepEqual(survey.tutorHistory, { s: {} });
  assert.deepEqual(survey.workLog, [{ dataset: "s" }, { dataset: "" }]);
  const qualitative = separateMethod(mixed, "interview");
  assert.deepEqual(qualitative.datasets, [interview, info]);
  assert.deepEqual(qualitative.views, mixed.views);
  assert.deepEqual(qualitative.savedVisuals, []);
  assert.equal(mixed.datasets.length, 5);
});
