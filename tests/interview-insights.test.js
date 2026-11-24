import assert from "node:assert/strict";
import test from "node:test";
import { analyse } from "../src/analysis.js";
import {
  chartReadingOptions,
  tutorViewSettings,
} from "../src/chart-reading.js";
import { interviewContributionRequest } from "../src/question-matching.js";
import { suggestGrouping } from "../src/group-suggestions.js";
import {
  asksForThemePatterns,
  interviewComparisonPick,
  interviewInsights,
  interviewPatternSuggestion,
} from "../src/interview-insights.js";

function project() {
  const passages = [
    ["Iris", ["Reistijd", "Halte"]],
    ["Iris", ["Reistijd", "Halte"]],
    ["Noor", ["Halte"]],
    ["Mo", ["Halte"]],
    ["Mo", []],
    ["Fien", ["Halte"]],
    ["Fien", []],
    ["Rae", ["Reistijd"]],
  ].map(([source, codes], i) => ({
    source,
    codes,
    id: "p" + i,
    text: "Private transcript text " + i,
    reviewed: i !== 4,
  }));
  return {
    kind: "text",
    sources: ["Iris", "Noor", "Mo", "Fien", "Rae"],
    passages,
    metadata: {
      Iris: { Dienst: "Dag" },
      Noor: { Dienst: "Dag" },
      Mo: { Dienst: "Nacht" },
      Fien: { Dienst: "Nacht" },
    },
  };
}
const view = {
  task: "patterns",
  patternMode: "sources",
  items: ["Reistijd", "Halte"],
  chart: "grid",
};
const options = ["grid", "dots", "table", "bars"];

test("individual readings use the selected original passages and report the current measure", () => {
  const d = project();
  const settings = { ...view, filter: "Dienst", value: "Dag" };
  const counts = interviewPatternSuggestion(
    analyse(d, settings),
    "grid",
    options,
  );
  assert.match(
    counts.message,
    /“Reistijd” was coded in 2 of 2 included passages in “Iris” and 0 of 1 included passage in “Noor”/,
  );
  assert.match(counts.message, /Longer interviews/);
  assert.doesNotMatch(counts.message, /Private transcript text|Fien|Rae/);
  assert.equal(counts.chart, "table");
  const percentages = interviewInsights(
    analyse(d, { ...settings, sourceMeasure: "percent" }),
  );
  assert.match(percentages.facts[0], /100%.*0%/);
  assert.match(percentages.facts[1], /“Halte”.*all 2 interviews/);
  assert.equal(
    tutorViewSettings({ ...settings, sourceMeasure: "percent" }).sourceMeasure,
    "percent",
  );
});

test("grouped readings count interviews once and distinguish the pooled passage share", () => {
  const d = project();
  const v = { ...view, groupBy: "Dienst", themeUnit: "interviews" };
  const coverage = analyse(d, v);
  const different = interviewPatternSuggestion(coverage, "grid", options);
  assert.match(
    different.message,
    /“Reistijd” appeared in 1 of 2 interviews \(50%\) in “Dag” and 0 of 2 interviews \(0%\) in “Nacht”/,
  );
  assert.match(different.message, /fewer than five interviews/);
  assert.match(different.message, /review/i);
  assert.doesNotMatch(different.message, /Private transcript text|Rae/);
  const passages = analyse(d, { ...v, themeUnit: "passages" });
  const observation = interviewPatternSuggestion(passages, "grid", options);
  assert.match(
    observation.message,
    /2 of 3 included passages \(66.7%\) in “Dag” and 0 of 4 included passages \(0%\) in “Nacht”/,
  );
  assert.match(observation.message, /more included passages contribute more/);
  const answers = chartReadingOptions(
    [
      {
        ...coverage,
        settings: tutorViewSettings(v),
        recordsTotal: coverage.records.length,
      },
    ],
    "count",
    "How many of the interviews in Dag contained Reistijd?",
  );
  assert.match(answers[0].options[0], /1 of 2 interviews.*Dag/);
  assert.doesNotMatch(answers[0].options[0], /in “Nacht”/);
});

test("a theme with no matches, equal shares or a single remaining source does not generate a false difference", () => {
  const d = project();
  for (const p of d.passages)
    p.codes = p.source === "Rae" ? ["Reistijd"] : ["Halte"];
  const settings = {
    ...view,
    items: ["Reistijd"],
    groupBy: "Dienst",
    themeUnit: "interviews",
  };
  assert.match(
    interviewInsights(analyse(d, settings)).facts[0],
    /None of the selected themes/,
  );
  assert.match(
    interviewInsights(analyse(d, { ...settings, items: ["Halte"] })).facts[0],
    /percentages are equal/,
  );
  assert.match(
    interviewInsights(
      analyse(d, { ...settings, groupBy: "", filter: "source", value: "Noor" }),
    ).facts[0],
    /fewer than two interviews/,
  );
});

test("a theme's contribution bars describe who supplied its passages, omitting interviews with missing group information", () => {
  const d = project();
  const grouped = {
    ...view,
    items: ["Reistijd"],
    groupBy: "Dienst",
    themeUnit: "themeShare",
  };
  const summary = analyse(d, grouped);
  assert.equal(summary.themeComparison.unit, "themePassageShare");
  const advice = interviewPatternSuggestion(summary, "table", [
    ...options,
    "stack",
  ]);
  assert.match(
    advice.message,
    /Of the 2 included passages coded “Reistijd”, 2 came from “Dag” \(100%\) and 0 from “Nacht”/,
  );
  assert.match(advice.message, /who contributed/);
  assert.equal(advice.chart, "stack");
  const perSource = analyse(d, {
    ...view,
    items: ["Reistijd"],
    sourceMeasure: "themeShare",
  });
  const named = chartReadingOptions(
    [{ ...perSource, settings: tutorViewSettings(view) }],
    "count",
    "How many passages did Iris contribute for Reistijd?",
  );
  assert.match(
    named[0].options[0],
    /Of the 3 included passages coded “Reistijd”, 2 came from “Iris” \(66.7%\)/,
  );
  const suggestion = suggestGrouping(d, grouped);
  if (suggestion.spec) assert.equal(suggestion.spec.themeUnit, "interviews");
});

test("plain-language shortcuts keep named subgroups and explicit qualifications for contextual resolution", () => {
  for (const s of [
    "What stands out?",
    "Could you identify interesting patterns across these interviews?",
    "Which themes stand out across my selected groups?",
    "Spot patterns in my data and suggest a visual.",
  ])
    assert.ok(asksForThemePatterns(s));
  for (const s of [
    "Compare Mo and Iris",
    "What stands out in Noor?",
    "What stands out in these interviews only among night workers?",
  ])
    assert.equal(asksForThemePatterns(s), false);
});

test("unavailable group material cannot produce a group suggestion or a chart of an invented difference", () => {
  const d = project();
  d.passages = d.passages.filter((p) => d.metadata[p.source]?.Dienst === "Dag");
  const settings = {
    ...view,
    items: ["Halte"],
    groupBy: "Dienst",
    themeUnit: "interviews",
  };
  const comparison = analyse(d, settings);
  assert.equal(interviewInsights(comparison).comparable, false);
  assert.equal(suggestGrouping(d, settings).spec, undefined);
  const empty = analyse(d, { ...settings, filter: "Dienst", value: "Nacht" });
  const suggestion = interviewPatternSuggestion(empty, "grid", options);
  assert.equal(suggestion.chart, undefined);
  assert.match(suggestion.message, /no included passages/i);
});

test("conversational contributions switch the active denominator and respect the requested group or interview scope", () => {
  const selected = { ...view, sourceMeasure: "count" };
  const groups = [["Dienst", "Dienst"]];
  const who = interviewContributionRequest(
    "Who contributed each theme’s passages?",
    selected,
    groups,
  );
  assert.equal(who.action, "suggest");
  assert.equal(
    interviewContributionRequest(
      "What percentage of each theme’s passages came from each group?",
      selected,
      groups,
    ).themeUnit,
    "themeShare",
  );
  assert.equal(who.sourceMeasure, "themeShare");
  assert.equal(who.groupBy, "");
  const show = interviewContributionRequest(
    "Show me which groups contributed most of the passages for each theme.",
    selected,
    groups,
  );
  assert.equal(show.action, "draw");
  assert.equal(show.themeUnit, "themeShare");
  assert.equal(show.groupBy, "Dienst");
  const individual = interviewContributionRequest(
    "Which interviewees supplied passages coded with each theme?",
    { ...selected, groupBy: "Dienst" },
    groups,
  );
  assert.equal(individual.groupBy, "");
  assert.equal(
    interviewContributionRequest(
      "Which groups contributed to each theme?",
      selected,
      [],
    ).action,
    "answer",
  );
  assert.equal(
    interviewContributionRequest(
      "Who contributed to each theme among interns only?",
      selected,
      groups,
    ),
    undefined,
  );

  const grid = { ...selected, chart: "grid" };
  assert.deepEqual(
    interviewComparisonPick({ action: "restyleChart", chart: "table" }, grid),
    { action: "restyleChart", chart: "table" },
  );
  const stack = interviewComparisonPick(
    { action: "restyleChart", chart: "stack" },
    grid,
  );
  assert.equal(stack.action, "draw");
  const oldView = { ...grid };
  delete oldView.sourceMeasure;
  assert.equal(
    interviewComparisonPick({ action: "restyleChart", chart: "stack" }, oldView)
      .sourceMeasure,
    "themeShare",
  );
  assert.equal(stack.sourceMeasure, "themeShare");
  const model = interviewComparisonPick(
    {
      action: "suggest",
      task: "patterns",
      patternMode: "sources",
      groupBy: "Dienst",
      themeUnit: "themeShare",
    },
    grid,
  );
  assert.equal(model.action, "suggest");
  assert.equal(model.chart, "stack");
  assert.equal(
    interviewComparisonPick(
      { action: "restyleChart", chart: "grid", sourceMeasure: "percent" },
      { ...grid, sourceMeasure: "themeShare" },
    ).sourceMeasure,
    "percent",
  );
});
