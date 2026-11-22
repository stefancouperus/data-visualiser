import test from "node:test";
import assert from "node:assert/strict";
import { filteredRows, makeTable } from "../src/import.js";
import { labelledSurvey } from "../src/survey-labels.js";

test("QSF decoding retains exactly the selected records including metadata and recoded exclusions", () => {
  const t = makeTable(
    [
      ["ResponseId", "Status", "Q1"],
      ["A", "Live", "1"],
      ["B", "Preview", "1"],
      ["C", "Live", "2"],
      ["D", "Live", ""],
    ],
    "Survey",
  );
  t.rules = [
    { field: "c1", value: "Preview" },
    { field: "c2", value: "2" },
  ];
  const qsf = {
    SurveyElements: [
      {
        Element: "SQ",
        Payload: {
          QuestionID: "QID1",
          DataExportTag: "Q1",
          QuestionType: "MC",
          Selector: "SAVR",
          QuestionText: "Would you return?",
          Choices: { 1: { Display: "Yes" }, 2: { Display: "No" } },
        },
      },
    ],
  };
  const { copy } = labelledSurvey(t, qsf);
  const selected = (d) => filteredRows(d).map((r) => r.c0);
  assert.deepEqual(selected(copy), ["A", "D"]);
  assert.deepEqual(selected(t), selected(copy));
  assert.equal(copy.rules[1].value, "No");
  assert.equal(t.rules[1].value, "2");
  assert.deepEqual(labelledSurvey(copy, qsf).copy.rules, copy.rules);
});
