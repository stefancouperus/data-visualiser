import test from "node:test";
import assert from "node:assert/strict";
import { makeTable } from "../src/import.js";
import {
  fresh,
  renameTheme,
  settingsProject,
  verifyProject,
} from "../src/project.js";
import { labelledSurvey } from "../src/survey-labels.js";
import {
  writtenAnswerSet,
  refreshWrittenAnswers,
  setQuestionRoles,
  copyWrittenAnswers,
} from "../src/open-answers.js";

function setup() {
  const survey = makeTable(
    [
      ["Why", "Q2"],
      ["Fewer barriers", "1"],
      ["Fewer barriers", "2"],
      ["", "1"],
    ],
    "Class",
  );
  setQuestionRoles(survey.fields[0], ["open"]);
  const project = { ...fresh(), datasets: [survey] };
  const answers = writtenAnswerSet(project, survey, "c0", "", true);
  answers.passages[0].codes = ["Access"];
  answers.passages[0].reviewed = true;
  const other = answers.passages[1];
  answers.passages.push({
    ...other,
    id: "quote",
    parent: other.id,
    start: 6,
    text: "barriers",
    codes: ["Obstacle"],
    codingEvidence: [{ code: "Obstacle", quote: "barriers" }],
  });
  const qsf = {
    SurveyElements: [
      {
        Element: "SQ",
        Payload: {
          DataExportTag: "Q2",
          QuestionID: "QID2",
          QuestionText: "Study year",
          QuestionType: "MC",
          Selector: "SAVR",
          Choices: { 1: { Display: "First" }, 2: { Display: "Second" } },
        },
      },
    ],
  };
  return { project, survey, answers, qsf };
}

test("a question keeps its respondent IDs, accepted quotations and coding as respondents leave and return", () => {
  const { project, survey, answers, qsf } = setup();
  const original = structuredClone(answers.passages);
  const right = { filter: "Q2", value: "1", groupBy: "Q2" };
  project.workingViews = { [answers.id]: { views: [{}, right] } };
  project.savedVisuals.push({
    dataset: answers.id,
    name: "Filtered",
    view: { ...right },
  });
  answers.metadata["Record 2"].Cohort = "Pilot";
  survey.rules = [{ field: "c1", value: "2" }];
  refreshWrittenAnswers(project, survey);
  assert.deepEqual(answers.sources, ["Record 1"]);
  assert.deepEqual(answers.passages[0], original[0]);
  assert.deepEqual(
    answers.excludedWrittenPassages.map((p) => p.id),
    [original[1].id, "quote"],
  );
  assert.equal(answers.openAnswers.eligible, 2);
  assert.equal(answers.metadata["Record 2"], undefined);
  assert(!JSON.stringify(settingsProject(project)).includes("barriers"));
  const restored = verifyProject(JSON.parse(JSON.stringify(project)));
  const [table, data] = restored.datasets;
  renameTheme(restored, data, "Obstacle", "Barriers");
  const labelled = labelledSurvey(table, qsf).copy;
  restored.datasets[0] = labelled;
  refreshWrittenAnswers(restored, labelled);
  assert.deepEqual(restored.workingViews[data.id].views[1], {
    filter: "Study year",
    value: "First",
    groupBy: "Study year",
  });
  assert.equal(restored.savedVisuals[0].view.filter, "Study year");
  assert.deepEqual(data.metadata["Record 1"], { "Study year": "First" });
  labelled.rules = [];
  assert.equal(writtenAnswerSet(restored, labelled, "c0", "", true), data);
  assert.equal(restored.datasets.length, 2);
  assert.deepEqual(
    data.passages.map((p) => p.id),
    original.map((p) => p.id),
  );
  assert.deepEqual(data.passages[1].codes, []);
  assert.deepEqual(data.passages[2].codingEvidence, [
    { code: "Barriers", quote: "barriers" },
  ]);
  assert.deepEqual(data.metadata["Record 2"], {
    "Study year": "Second",
    Cohort: "Pilot",
  });
  labelled.rules = [
    { field: "c1", value: "First" },
    { field: "c1", value: "Second" },
  ];
  refreshWrittenAnswers(restored, labelled);
  assert.equal(data.openAnswers.answered, 0);
  assert.equal(data.passages.length, 0);
  assert.throws(
    () => writtenAnswerSet(restored, labelled, "c0", "", true),
    /no written answers/,
  );
  labelled.rules = [];
  refreshWrittenAnswers(restored, labelled);
  assert.equal(data.passages.length, 3);
});

test("earlier scoped collections keep both saved reviews and seed the live coding", () => {
  const { project, survey, answers } = setup();
  const earlier = structuredClone(answers);
  earlier.id = "earlier";
  earlier.openAnswers.scope = '[["c1","2"]]';
  earlier.passages = [{ ...earlier.passages[0], codes: [], reviewed: false }];
  earlier.sources = ["Record 1"];
  project.datasets.push(earlier);
  survey.rules = [{ field: "c1", value: "2" }];
  const live = writtenAnswerSet(project, survey, "c0", "", true);
  assert.notEqual(live.id, earlier.id);
  assert.notEqual(live.id, answers.id);
  assert.equal(earlier.passages[0].codes.length, 0);
  assert.equal(answers.passages.length, 3);
  assert(earlier.openAnswers.snapshot);
  assert.deepEqual(live.passages[0].codes, ["Access"]);
  survey.rules = [];
  refreshWrittenAnswers(project, survey);
  assert.equal(live.passages.at(-1).id, "quote");
  assert.equal(project.datasets.length, 4);
});

test("a QSF copy of a confirmed survey retains coding without sharing mutable answers", () => {
  const { project, survey, answers, qsf } = setup();
  project.confirmed.push(answers.id);
  const labelled = labelledSurvey(survey, qsf).copy;
  labelled.id = "labelled";
  labelled.name = "Class (labelled)";
  project.datasets.push(labelled);
  copyWrittenAnswers(project, survey, labelled);
  const newSet = writtenAnswerSet(project, labelled, "c0", "", true);
  assert.equal(project.confirmed.includes(newSet.id), true);
  assert.deepEqual(newSet.metadata["Record 1"], { "Study year": "First" });
  assert.deepEqual(newSet.passages, answers.passages);
  newSet.passages[0].codes.push("Different");
  assert.deepEqual(answers.passages[0].codes, ["Access"]);
});
