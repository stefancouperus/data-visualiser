import assert from "node:assert/strict";
import test from "node:test";
import { makeTable } from "../src/import.js";
import {
  claimsCombinedCount,
  combinedAnswerRequest,
  combinedAnswerTotals,
} from "../src/combined-answers.js";

function survey() {
  const d = makeTable(
    [
      ["Street lighting", "Tram service", "District", "Status"],
      ["Agree", "Strongly agree", "Alder", "Keep"],
      ["Strongly agree", "Agree", "Alder", "Keep"],
      ["Disagree", "", "Alder", "Keep"],
      ["Agree", "Strongly agree", "Birch", "Keep"],
      ["Neutral", "Agree", "Birch", "Keep"],
      ["Neutral", "Agree", "", "Keep"],
      ["Agree", "Disagree", "Alder", "Preview"],
    ],
    "Local survey",
  );
  d.rules = [{ field: "c3", value: "Preview" }];
  return d;
}
const v = {
  task: "patterns",
  patternMode: "separate",
  items: ["c0", "c1"],
  groupBy: "c2",
  chart: "grid",
};
const prompt =
  "Across these two selected questions, what do most respondents agree on about lighting and trams? For each question give the number who agreed or strongly agreed, and the total who answered. Can you tell this from the data?";
test("each plotted outcome uses its own valid responses after project, grouping and view filters", () => {
  const d = survey();
  for (const percentBase of ["group", "answer"]) {
    const { results, message } = combinedAnswerRequest(
      d,
      { ...v, percentBase },
      prompt,
    );
    assert.deepEqual(
      results.map((r) => [r.n, r.den]),
      [
        [3, 5],
        [4, 4],
      ],
    );
    assert.match(message, /3 of 5 \(60%\)/);
    assert.match(message, /District/);
  }
  const filtered = combinedAnswerRequest(
    d,
    { ...v, filter: "c2", value: "Alder" },
    "How many chose Agree or Strongly agree?",
  );
  assert.deepEqual(
    filtered.results.map((r) => [r.n, r.den]),
    [
      [2, 3],
      [2, 2],
    ],
  );
  const single = combinedAnswerRequest(
    d,
    v,
    "How many chose Agree or Strongly agree for Street lighting?",
  );
  assert.deepEqual(
    single.results.map((r) => [r.field, r.n, r.den]),
    [["c0", 3, 5]],
  );
  const split = combinedAnswerRequest(
    d,
    v,
    "For each group, how many chose Agree or Strongly agree?",
  );
  assert.deepEqual(
    split.results.map((r) => [r.group, r.n, r.den]),
    [
      ["Alder", 2, 3],
      ["Alder", 2, 2],
      ["Birch", 1, 2],
      ["Birch", 2, 2],
    ],
  );
});
test("arbitrary project labels and checkbox unions count each row once and include recorded zero-choice answers", () => {
  const d = makeTable(
    [
      ["Options", "Status"],
      ["Rood;Blauw", "Keep"],
      ["Blauw", "Keep"],
      ["Groen", "Keep"],
      ["", "Keep"],
      ["", "Keep"],
    ],
    "Kleuren",
  );
  Object.assign(d.fields[0], {
    type: "multiple",
    levels: ["Rood", "Blauw", "Groen", "Geel"],
    separator: ";",
    checkboxIndicators: [],
  });
  d.rows[4].c0 = null;
  const view = { task: "one", x: "c0", chart: "bars" };
  const res = combinedAnswerRequest(
    d,
    view,
    "What percentage picked Rood or Blauw?",
  );
  assert.deepEqual(
    res.results.map((r) => [r.labels, r.n, r.den]),
    [[["Rood", "Blauw"], 2, 4]],
  );
  assert.match(
    combinedAnswerRequest(d, view, "How many chose Rood and Blauw?").message,
    /either option/,
  );
  assert.equal(
    combinedAnswerRequest(d, view, "Count Rood or Blauw or unknown").results,
    undefined,
  );
  const noBase = combinedAnswerTotals(
    d,
    { ...view, filter: "c1", value: "absent" },
    [{ field: "c0", answers: ["Rood", "Blauw"] }],
  );
  assert.match(noBase.message, /No valid answers/);
  assert.doesNotMatch(noBase.message, /0%/);
});
test("requests for an unconfirmed subgroup, different operation or unspecified scale do not silently return pooled numbers", () => {
  const d = survey();
  for (const q of [
    "How many cat lovers chose Agree or Strongly agree?",
    "How many First-year respondents chose Agree or Strongly agree?",
    "Among residents of Durham, how many chose Agree or Strongly agree?",
    "How many respondents did not choose Agree or Strongly agree?",
    "How many chose Agree or Strongly agree or definitely?",
    "How many chose Agree, Strongly agree and Uncertain?",
    "What was total agreement?",
  ])
    assert.equal(combinedAnswerRequest(d, v, q)?.results, undefined, q);
  assert.equal(
    combinedAnswerRequest(
      d,
      v,
      "Draw a plot for people who chose Agree or Strongly agree",
    ),
    undefined,
  );
  assert.equal(
    combinedAnswerRequest(d, v, "How many respondents chose Disagree?"),
    undefined,
  );
});

test("a model-written combined count is recognised even when the student used different wording", () => {
  const d = survey();
  assert.equal(
    claimsCombinedCount(
      d,
      v,
      "7 of 11 respondents selected 'Agree' or ‘Strongly agree’.",
    ),
    true,
  );
  assert.equal(
    claimsCombinedCount(
      d,
      v,
      "3 respondents chose Agree and 1 chose Strongly agree.",
    ),
    false,
  );
  assert.equal(
    claimsCombinedCount(d, v, "A table would help you compare answers."),
    false,
  );
  assert.deepEqual(
    combinedAnswerRequest(
      d,
      v,
      "How many selected 'Agree' or ‘Strongly agree’?",
    ).results.map((r) => r.n),
    [3, 4],
  );
});
