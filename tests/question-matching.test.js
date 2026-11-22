import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartFields,
  directComparison,
  resolveAxis,
} from "../src/question-matching.js";
const fields = [
  {
    id: "c2",
    raw: "Q1",
    label: "I prefer…",
    type: "category",
    levels: ["trains", "boats", "both", "neither"],
  },
  {
    id: "c4",
    raw: "Q3",
    label: "Do specialists make better decisions?",
    type: "ordered",
    levels: ["Agree", "Disagree"],
  },
  {
    id: "c5",
    raw: "Q4",
    label: "Any comments?",
    type: "text",
    levels: ["I take boats with a specialist."],
  },
];
const question =
  "Could you create a visual that relates the train–boat question to the specialists question?";
test("titles and choice shorthand identify distinct axes without exporting responses", () => {
  const ask = question;
  const pick = directComparison(fields, ask);
  assert.deepEqual(
    [pick.x, pick.y, pick.chart, pick.measure],
    ["c4", "c2", "stack", "percent"],
  );
  assert.equal(resolveAxis(fields, "I prefer…"), "c2");
  assert.equal(resolveAxis(fields, "trains"), "c2");
  const hints = chartFields(fields, ask);
  assert.ok(hints[0].requestWordsMatchingAnswerChoices.includes("train"));
  assert.equal(hints[2].requestWordsMatchingAnswerChoices, undefined);
  assert.ok(!JSON.stringify(hints).includes("neither"));
});
test("ambiguous or qualified requests do not silently draw a different chart", () => {
  const also = {
    ...fields[1],
    id: "c6",
    label: "Do specialists listen enough?",
  };
  assert.match(
    directComparison(
      [...fields, also],
      question.replace("train–boat", "trains"),
    ).explanation,
    /listen enough/,
  );
  assert.equal(
    directComparison(fields, question.replace("?", " only among men?")),
    null,
  );
});
test("an explicit chart type is distinguished from a question about chart alternatives", async () => {
  const { namedChartRequest } = await import("../src/question-matching.js");
  assert.equal(
    namedChartRequest(
      "Draw a heatmap of Turnout by Study year, showing percentages within each year.",
    ),
    "grid",
  );
  assert.equal(
    namedChartRequest(
      "Could you draw a presence grid showing which themes appear in each interview?",
    ),
    "presence",
  );
  assert.equal(
    namedChartRequest("Would a heatmap be clearer than a bar chart?"),
    undefined,
  );
});

test("a request stating the observation unit draws the complete list or leaves uncertain fields for clarification", async () => {
  const { patternRequest } = await import("../src/question-matching.js");
  const q = [
    ["a", "Is voting important?"],
    ["b", "Trust in parliament"],
    ["c", "Did you vote?"],
  ];
  assert.deepEqual(
    patternRequest(
      "Show me which answers the same people gave together for voting importance, trust in parliament and whether they voted.",
      false,
      q,
    ).items,
    ["a", "b", "c"],
  );
  assert.equal(
    patternRequest(
      "Show the same people's answers for trust and satisfaction",
      false,
      q,
    ).items,
    undefined,
  );
  const t = [
    ["Trust", "Trust"],
    ["Duty", "Duty"],
  ];
  assert.deepEqual(
    patternRequest(
      "Make a figure showing which of the themes Trust and Duty turn up together in the very same passage.",
      true,
      t,
    ),
    { patternMode: "passages", items: ["Trust", "Duty"] },
  );
});
