import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chartFields,
  directComparison,
  resolveAxis,
  wordTableRequest,
} from "../src/question-matching.js";
test("the word table uses the requested source or theme and clarifies unresolved names", () => {
  const ask = (q) =>
    wordTableRequest(
      q,
      { task: "one", x: "Travel" },
      ["Travel", "River"],
      ["River", "Hill.txt"],
    );
  assert.deepEqual(ask("Show a word count table"), {
    action: "draw",
    task: "words",
    chart: "table",
    x: "Travel",
    y: "",
  });
  assert.match(ask("Draw a word cloud").explanation, /Count words in passages/);
  assert.equal(
    ask("Show a word count table for interview Hill").value,
    "Hill.txt",
  );
  assert.equal(ask("Show a word count table for theme River").x, "River");
  assert.equal(ask("Show a word count table for River").action, "answer");
  assert.equal(
    ask("Show a word count table for interview Unknown").action,
    "answer",
  );
});
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

test("plain-language grouping follow-ups retain items and clarify ambiguous or missing groups", async () => {
  const { groupingRequest } = await import("../src/question-matching.js");
  const groups = [
      ["c3", "Study year"],
      ["c4", "Year of birth"],
    ],
    current = { task: "patterns", items: ["c0", "c1", "c2"] };
  assert.equal(
    groupingRequest(
      "Do answers to the same three questions differ by study year?",
      groups,
      current,
      false,
    ).reuse,
    true,
  );
  assert.match(
    groupingRequest("Split these patterns by year", groups, current, false)
      .clarification,
    /Which grouping/,
  );
  assert.match(
    groupingRequest(
      "Do these themes come up more in one group of interviewees?",
      [],
      current,
      true,
    ).clarification,
    /Add interview groups/,
  );
  assert.equal(
    groupingRequest(
      "Do these themes come up more in one group of interviewees?",
      [["Year", "Year"]],
      current,
      true,
    ).groupBy,
    "Year",
  );
});

test("requested cross-tab uses the named grouping and distinguishes counts from within-group percentages", async () => {
  const { namedSurveyComparison } = await import("../src/question-matching.js");
  const fields = [
    {
      id: "a",
      type: "category",
      raw: "Q1",
      label: "Trip purpose",
      levels: ["Leisure", "Work"],
    },
    {
      id: "b",
      type: "ordered",
      raw: "Q2",
      label: "Travel zone",
      levels: ["Inner", "Outer"],
    },
  ];
  const phrase = "Draw a heatmap of Trip purpose by Travel zone";
  assert.deepEqual(
    namedSurveyComparison(
      fields,
      phrase + ", showing percentages within each zone.",
    ),
    {
      action: "draw",
      task: "group",
      chart: "grid",
      x: "a",
      y: "b",
      measure: "percent",
    },
  );
  assert.equal(namedSurveyComparison(fields, phrase).measure, "count");
  assert.equal(
    namedSurveyComparison(
      fields,
      phrase + ", showing percentages within each purpose",
    ),
    null,
  );
  assert.equal(
    namedSurveyComparison(fields, phrase + " only among cyclists"),
    null,
  );
});

test("a conversational heatmap command can set both roles and its denominator after the request", async () => {
  const { namedSurveyComparison, namedChartRequest } =
    await import("../src/question-matching.js");
  const cols = [
    {
      id: "v1",
      label: "Library visits",
      type: "category",
      levels: ["Often", "Never"],
    },
    {
      id: "v2",
      label: "Home region",
      type: "ordered",
      levels: ["East", "West"],
    },
  ];
  const command = "Do the regions differ? Please draw a heatmap now. ";
  const measure = ". Show percentages within each region.";
  const expected = {
    action: "draw",
    task: "group",
    chart: "grid",
    x: "v1",
    y: "v2",
    measure: "percent",
  };
  for (const axes of [
    "Use Library visits for the answers and Home region for the groups",
    "Use Home region as the group and Library visits as the outcome",
  ]) {
    assert.deepEqual(
      namedSurveyComparison(cols, command + axes + measure),
      expected,
    );
    assert.equal(
      namedSurveyComparison(
        cols,
        command + axes + ". Show percentages within each answer.",
      ),
      null,
    );
  }
  assert.equal(
    namedChartRequest("Would a heatmap help? Explain the pros and cons."),
    undefined,
  );
  assert.equal(
    namedChartRequest("Draw a heatmap. Make a bar chart."),
    undefined,
  );
  assert.equal(
    namedSurveyComparison(
      cols,
      command + "Use Library visits for the answers and Unknown as the group.",
    ),
    null,
  );
});

test("ambiguous chart axes require a choice, and exact choices bind both axes", async () => {
  const { namedSurveyComparison } = await import("../src/question-matching.js");
  const fields = [
    "Trust in council",
    "Trust in courts",
    "Current year",
    "Year joined",
  ].map((label, i) => ({
    id: "q" + i,
    label,
    type: "category",
    levels: i < 2 ? ["High", "Low"] : ["First", "Second"],
  }));
  const q =
    "Please draw a heatmap of trust by year, showing percentages within each year.";
  const clarify = namedSurveyComparison(fields, q);
  assert.equal(clarify.action, "clarifyAxes");
  assert.equal(
    namedSurveyComparison(fields, "Could you show me trust by year?").action,
    "clarifyAxes",
  );
  assert.equal(
    namedSurveyComparison(fields, "Make a heatmap comparing trust by year")
      .action,
    "clarifyAxes",
  );
  assert.deepEqual(
    clarify.axes.map((axis) => axis.choices.map(([id]) => id)),
    [
      ["q0", "q1"],
      ["q2", "q3"],
    ],
  );
  assert.deepEqual(namedSurveyComparison(fields, q, ["q1", "q3"]), {
    action: "draw",
    task: "group",
    chart: "grid",
    measure: "percent",
    x: "q1",
    y: "q3",
  });
  assert.equal(
    namedSurveyComparison(
      fields,
      "Draw a heatmap of Trust in courts by Current year",
    ).x,
    "q1",
  );
});

test("a focus declaration can carry a separate plain-language request", async () => {
  const { projectFocusMessage } = await import("../src/research-focus.js");
  assert.deepEqual(
    projectFocusMessage(
      "My project is about commuting. Could you plot distance against time?",
    ),
    {
      focus: "My project is about commuting",
      request: "Could you plot distance against time?",
    },
  );
  assert.deepEqual(
    projectFocusMessage(
      "Our research question is whether groups differ? Please compare the outcomes.",
    ),
    {
      focus: "Our research question is whether groups differ",
      request: "Please compare the outcomes.",
    },
  );
  assert.deepEqual(projectFocusMessage("My study is about access and trust."), {
    focus: "My study is about access and trust.",
  });
  assert.equal(projectFocusMessage("What data are included?"), null);
});

test("explicit numerical axes use actual project fields in their requested orientation", async () => {
  const { namedSurveyComparison } = await import("../src/question-matching.js");
  const fields = [
    ["a", "Travel distance", "number"],
    ["b", "Travel time", "number"],
    ["c", "Start day", "date"],
    ["d", "Ticket", "category"],
  ].map(([id, label, type]) => ({ id, label, type, levels: ["a", "b"] }));
  const plot = (q, chosen) => namedSurveyComparison(fields, q, chosen);
  assert.deepEqual(
    plot(
      "Could you plot Travel distance on the horizontal axis and Travel time on the vertical axis as a scatterplot?",
    ),
    {
      action: "draw",
      task: "two",
      chart: "scatter",
      x: "a",
      y: "b",
      measure: "count",
    },
  );
  assert.deepEqual(
    plot(
      "Draw a line graph with Travel time on the y-axis and Start day on the x-axis.",
    ),
    {
      action: "draw",
      task: "two",
      chart: "line",
      x: "c",
      y: "b",
      measure: "count",
    },
  );
  const ambiguous =
    "Draw a scatter plot of Travel on the x-axis and Travel time on the y-axis";
  assert.equal(plot(ambiguous).action, "clarifyAxes");
  assert.equal(plot(ambiguous, ["a", "b"]).x, "a");
  assert.equal(
    plot(
      "Draw a line graph with Start day on the y-axis and Travel time on the x-axis.",
    ).action,
    "answer",
  );
  assert.equal(
    plot(
      "Draw a scatterplot of Ticket on the x-axis and Travel distance on the y-axis.",
    ).action,
    "answer",
  );
  assert.equal(
    plot(
      "Draw a scatterplot of Travel time on the x-axis and Travel distance on the y-axis only among cyclists.",
    ),
    null,
  );
});
