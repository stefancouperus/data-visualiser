import test from "node:test";
import assert from "node:assert/strict";
import { analyse } from "../src/analysis.js";
import { makeTable } from "../src/import.js";
import {
  asksForSurveyPatterns,
  canSpotSurveyPatterns,
  surveyPatternSuggestion,
} from "../src/survey-insights.js";

function selection() {
  const data = makeTable(
    [
      ["Group", "First choice", "Second choice", "Include"],
      ...Array.from({ length: 10 }, (_, i) => [
        "West",
        i < 6 ? "A" : "B",
        "B",
        "Yes",
      ]),
      ...Array.from({ length: 8 }, (_, i) => [
        "East",
        i < 4 ? "A" : "B",
        "A",
        "Yes",
      ]),
      ["East", "B", "A", "No"],
      ["North", "A", "", "Yes"],
      ["", "B", "A", "Yes"],
    ],
    "Visitor feedback",
  );
  const [group, one, two, include] = data.fields;
  const view = {
    task: "patterns",
    patternMode: "separate",
    chart: "grid",
    items: [one.id, two.id],
    groupBy: group.id,
    filter: include.id,
    value: "Yes",
  };
  return { data, view };
}

test("a different questionnaire supplies every question, answer and grouping label used by the bot", () => {
  const d = makeTable(
    [
      ["Afhaalpunt", "Bezorgmoment", "Verpakking"],
      ...Array.from({ length: 7 }, () => ["Depot A", "Avond", "Papier"]),
      ...Array.from({ length: 6 }, () => ["Depot B", "Ochtend", "Glas"]),
    ],
    "Klantonderzoek",
  );
  const [location, time, packaging] = d.fields;
  const v = {
    task: "patterns",
    patternMode: "separate",
    items: [time.id, packaging.id],
    groupBy: location.id,
    percentBase: "group",
    chart: "grid",
  };
  const summary = analyse(d, v);
  const suggestion = surveyPatternSuggestion(summary, v.chart, [
    "grid",
    "dots",
  ]);
  assert.equal(summary.groupLabel, "Afhaalpunt");
  assert.deepEqual(summary.selectedLabels, ["Bezorgmoment", "Verpakking"]);
  for (const word of ["Depot A", "Depot B", "Bezorgmoment", "Verpakking"])
    assert.ok(suggestion.message.includes(word));
  assert.match(suggestion.message, /Avond|Ochtend/);
  assert.match(suggestion.message, /Papier|Glas/);
});

test("observations use the current filter, name each question, honour small bases and offer an applicable view", () => {
  const { data, view } = selection();
  const result = surveyPatternSuggestion(analyse(data, view), view.chart, [
    "dots",
    "grid",
    "table",
  ]);
  assert.match(result.message, /“Second choice”.*(10 of 10|8 of 8)/);
  assert.match(
    result.message,
    /“First choice”[,] 6 of 10 in “West”.*4 of 8 in “East”.*10 percentage points/,
  );
  assert.doesNotMatch(result.message, /of 9|in “North”|causes?|significant/);
  assert.equal(result.chart, "dots");
});

test("reversing the base describes group composition among answerers and uses the pooled answer count", () => {
  const { data, view } = selection();
  const result = surveyPatternSuggestion(
    analyse(data, { ...view, percentBase: "answer" }),
    "dots",
    ["dots", "grid", "table"],
  );
  assert.match(
    result.message,
    /Of the 10 who chose “B” for “Second choice” and had a recorded group, 10 were in “West” \(100%\)/,
  );
  assert.match(
    result.message,
    /can reflect how many people from that group took part/,
  );
  assert.equal(result.chart, "grid");
  const mix = surveyPatternSuggestion(
    analyse(data, { ...view, percentBase: "answer" }),
    "grid",
    ["dots", "grid", "stack"],
  );
  assert.equal(mix.chart, "stack");
  assert.match(mix.message, /each answer/i);
});

test("zero denominators and equal percentages never yield an invented difference", () => {
  const { data, view } = selection();
  const question = view.items[0],
    group = view.groupBy;
  for (const r of data.rows) r[question] = r[group] === "North" ? "" : "Same";
  const summary = analyse(data, { ...view, items: [question] });
  const result = surveyPatternSuggestion(summary, "dots", ["dots", "table"]);
  assert.match(result.message, /percentages were identical/);
  assert.doesNotMatch(result.message, /of 0|percentage points apart/);
  for (const r of data.rows) r[question] = "";
  const empty = surveyPatternSuggestion(
    analyse(data, { ...view, items: [question] }),
    "grid",
    ["table", "grid"],
  );
  assert.match(empty.message, /too few groups with usable answers/);
});

test("only grouped survey distributions intercept requests about patterns in the shown selection", () => {
  const { data, view } = selection();
  assert.equal(canSpotSurveyPatterns(data, view), true);
  assert.equal(
    canSpotSurveyPatterns(data, { ...view, patternMode: "together" }),
    false,
  );
  assert.equal(canSpotSurveyPatterns({ kind: "text" }, view), false);
  for (const prompt of [
    "What stands out?",
    "Spot interesting patterns in these answers",
    "Are there any differences between these groups?",
  ])
    assert.equal(asksForSurveyPatterns(prompt), true);
  for (const prompt of [
    "Suggest groups to compare",
    "Draw a heatmap",
    "Which other grouping would work?",
  ])
    assert.equal(asksForSurveyPatterns(prompt), false);
});

test("a shared response combines actual single-answer labels in both percentage directions", () => {
  const data = makeTable(
    [
      ["Depot", "Levering"],
      ["Noord", "Tevreden"],
      ["Noord", "Zeer tevreden"],
      ["Noord", "Ontevreden"],
      ["Zuid", "Tevreden"],
      ["Zuid", "Zeer tevreden"],
      ["Zuid", ""],
      ["", "Ontevreden"],
    ],
    "Vervoer",
  );
  for (const percentBase of ["group", "answer"]) {
    const view = {
      task: "patterns",
      patternMode: "separate",
      items: ["c1"],
      groupBy: "c0",
      chart: "grid",
      percentBase,
    };
    const result = surveyPatternSuggestion(analyse(data, view), "grid", [
      "table",
    ]);
    assert.match(
      result.message,
      /4 of 5 valid responses.*“Tevreden” or “Zeer tevreden”/,
    );
  }
  const view = {
    task: "patterns",
    patternMode: "separate",
    items: ["c1"],
    groupBy: "c0",
    chart: "grid",
  };
  data.fields[1].type = "multiple";
  assert.doesNotMatch(
    surveyPatternSuggestion(analyse(data, view), "grid", ["table"]).message,
    /majority in each/,
  );
  data.fields[1].type = "category";
  data.rows
    .filter((r) => r.c0 === "Zuid")
    .forEach((r) => {
      r.c1 = "Ontevreden";
    });
  assert.doesNotMatch(
    surveyPatternSuggestion(analyse(data, view), "grid", ["table"]).message,
    /majority in each/,
  );
});
