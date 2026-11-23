import test from "node:test";
import assert from "node:assert/strict";
import { bookEntries, checkedSuggestions, codingGuide } from "../src/coding.js";
const p = { id: "a", text: "My shift ended late.", codes: [] };
const suggest = (code) => ({
  id: "a",
  code,
  quote: "ended late",
  definition: "Candidate meaning",
  reason: "Time pressure",
});
test("deductive coding requires an approved label, preserves its definition and grounds each suggestion", () => {
  const d = {
    passages: [p],
    coding: {
      mode: "deductive",
      book: [
        {
          label: "Time conflict",
          definition: "An obligation overlaps with voting.",
        },
      ],
    },
  };
  const result = checkedSuggestions(
    [
      suggest("Scheduling"),
      suggest(" time  conflict "),
      suggest("TIME CONFLICT"),
      { ...suggest("Time conflict"), quote: "never said" },
    ],
    [p],
    codingGuide(d),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].code, "Time conflict");
  assert.equal(result[0].definition, d.coding.book[0].definition);
  assert.throws(() =>
    bookEntries([d.coding.book[0], { label: "TIME CONFLICT", definition: "" }]),
  );
});
test("inductive proposals respect the passage, batch and cross-batch limits while retaining approved meanings", () => {
  const passages = [p, { ...p, id: "b" }];
  const raw = [
    suggest("Work"),
    suggest("Travel"),
    { ...suggest("Leisure"), id: "b" },
    { ...suggest("work"), id: "b" },
  ];
  assert.deepEqual(
    checkedSuggestions(raw, passages, codingGuide({ passages })).map(
      (s) => s.code,
    ),
    ["Work", "Travel", "Work"],
  );
  const old = {
    ...p,
    id: "old",
    codes: Array.from({ length: 8 }, (_, i) => "Code " + i),
  };
  const guide = codingGuide({
    passages: [old, p],
    coding: { meanings: [{ label: "Code 0", definition: "Original meaning" }] },
  });
  const limited = checkedSuggestions(
    [suggest("New idea"), suggest("Code 0")],
    [p],
    guide,
  );
  assert.deepEqual(
    limited.map((s) => s.definition),
    ["Original meaning"],
  );
  assert.equal(
    checkedSuggestions(
      [suggest("Code 0")],
      [{ ...p, codes: ["A", "B"] }],
      guide,
    ).length,
    0,
  );
});

test("deductive extraction retains complete labels evidenced in the project's codebook", async () => {
  const { labelsInCodebook } = await import("../src/coding.js");
  const entries = ["Spare parts", "Duty", "Part", "Depot"].map((label) => ({
    label,
    definition: "",
  }));
  assert.deepEqual(
    labelsInCodebook(
      entries,
      "Spare\nparts — availability\nDepot — location\nPartial refunds",
    ).map((e) => e.label),
    ["Spare parts", "Depot"],
  );
});

test("chat acceptance applies only valid reviewed matches atomically", async () => {
  const { acceptsCodingBatch, requestsCoding, applyCodingBatch } =
    await import("../src/coding.js");
  for (const q of [
    "Please apply them",
    "Yes, adopt the suggested codes.",
    "apply all",
    "Can you apply those labels to the selected passages?",
  ])
    assert.equal(acceptsCodingBatch(q), true, q);
  for (const q of [
    "don't apply them",
    "apply them except Time",
    "please explain these codes",
    "apply the first one",
  ])
    assert.equal(acceptsCodingBatch(q), false, q);
  assert.ok(requestsCoding("come up with labels for these passages"));
  assert.ok(requestsCoding("Could you code all interviews?"));
  assert.ok(requestsCoding("Please code both transcripts"));
  assert.equal(requestsCoding("plot a chart of the suggested codes"), false);
  const data = {
    passages: [structuredClone(p), { ...structuredClone(p), id: "b" }],
    coding: {
      mode: "deductive",
      book: [{ label: "Hours", definition: "Time" }],
    },
  };
  assert.throws(() =>
    applyCodingBatch(data, [
      suggest("Hours"),
      { ...suggest("Hours"), id: "b", quote: "not in the source" },
    ]),
  );
  assert.deepEqual(
    data.passages.map((x) => x.codes),
    [[], []],
  );
  assert.throws(() => applyCodingBatch(data, [suggest("Other")]));
  assert.equal(applyCodingBatch(data, [suggest("hours")]).assignments, 1);
  assert.throws(() => applyCodingBatch(data, [suggest("Hours")]));
  assert.deepEqual(
    data.passages.map((x) => x.codes),
    [["Hours"], []],
  );
});

test("evidence validation recovers original punctuation and spacing without accepting paraphrases, wildcards or another passage", () => {
  const text = "I couldn’t\n\tswap (my shift). Her words were: don't go.";
  const passage = { ...p, text };
  const entries = [
    { ...suggest("Rota"), quote: "couldn't swap (my shift)." },
    { ...suggest("Wrong case"), quote: "Couldn't swap" },
    { ...suggest("Spliced"), quote: "couldn’t ... shift" },
    { ...suggest("Wildcard"), quote: "swap (.*)" },
    { ...suggest("Fabricated"), id: "other", quote: "swap" },
    { ...suggest("Advice"), quote: "don’t go" },
  ];
  const excluded = {};
  const valid = checkedSuggestions(
    entries,
    [passage],
    codingGuide({ passages: [passage] }),
    excluded,
  );
  assert.deepEqual(
    valid.map((s) => s.quote),
    ["couldn’t\n\tswap (my shift).", "don't go"],
  );
  assert.deepEqual(excluded, { quote: 3, passage: 1 });
  assert.ok(valid.every((s) => text.includes(s.quote)));
});

test("an interview sample shares tentative labels across batches; every reviewed label can be accepted without committing other proposals", async () => {
  const { draftGuide, interviewBatches, reviewedMatches } =
    await import("../src/interviews.js");
  const { applyCodingBatch, checkedCollectedSuggestions } =
    await import("../src/coding.js");
  const d = {
    passages: Array.from({ length: 10 }, (_, i) => ({
      id: "real" + i,
      source: i < 5 ? "One" : "Two",
      text: "My example " + i,
      codes: [],
    })),
  };
  const ids = d.passages.map((p) => p.id);
  const batches = interviewBatches(d, ["One", "Two"], ids, true);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [6, 4],
  );
  const reply = (row, code) => ({
    id: row.id,
    code,
    quote: row.text,
    definition: code + " meaning",
  });
  const first = reviewedMatches(
    batches[0].map((row, i) => reply(row, "Theme " + (i % 4))),
    batches[0],
    draftGuide(d, true),
  );
  assert.equal(first.length, 6);
  const nextGuide = draftGuide(d, true, first);
  assert.equal(nextGuide.limits.newPerBatch, 2);
  assert.equal(nextGuide.vocabulary[2].definition, "Theme 2 meaning");
  const second = reviewedMatches(
    batches[1].map((row, i) =>
      reply(row, ["Theme 4", "Theme 5", "Excess", "THEME 2"][i]),
    ),
    batches[1],
    nextGuide,
  );
  assert.deepEqual(
    second.map((s) => s.code),
    ["Theme 4", "Theme 5", "Theme 2"],
  );
  const collected = [...first, ...second];
  const reviewGuide = draftGuide(d, true);
  assert.deepEqual(
    checkedCollectedSuggestions(collected, d.passages, reviewGuide),
    collected,
  );
  assert.ok(d.passages.every((item) => item.codes.length === 0));
  const approved = collected.filter((entry) => entry.code !== "Theme 1");
  assert.equal(
    applyCodingBatch(d, approved, reviewGuide).assignments,
    approved.length,
  );
  assert.equal(d.coding.meanings.length, 5);
  assert.equal(
    d.coding.meanings.some(({ label }) => label === "Theme 1"),
    false,
  );
  assert.deepEqual(d.passages.at(-1).codes, ["Theme 2"]);
  assert.deepEqual(d.passages[8].codes, []);
  assert.equal(draftGuide(d, true).limits.newPerBatch, 3); // up to eight project-wide
});

test("balanced sample spreads original replies across interviews and keeps legacy resume ordering intact", async () => {
  const { balancedSample, interviewBatches } =
    await import("../src/interviews.js");
  const replies = (source, count) =>
    Array.from({ length: count }, (_, i) => ({
      source,
      id: source + i,
      text: "What choice did I have?",
      codes: [],
    }));
  const d = {
    passages: [
      { source: "A", id: "header", text: "Interview transcript", codes: [] },
      { source: "A", id: "q", text: "Interviewer: When was that?", codes: [] },
      ...replies("A", 9),
      ...replies("B", 3),
      {
        source: "C",
        id: "mixed",
        text: "Interviewer: Why? Noor: I was out of town.",
        codes: [],
      },
      {
        source: "C",
        id: "excerpt",
        parent: "mixed",
        text: "out of town",
        codes: [],
      },
    ],
  };
  const sample = balancedSample(d, ["A", "B", "C"], 7);
  assert.deepEqual(sample, ["A0", "B0", "mixed", "A4", "B1", "A8", "B2"]);
  assert.deepEqual(
    interviewBatches(d, ["A", "B", "C"], sample, true)
      .flat()
      .map((p) => p.passageId),
    sample,
  );
  assert.deepEqual(
    interviewBatches(d, "A", ["A8", "A0"], true)
      .flat()
      .map((p) => p.passageId),
    ["A0", "A8"],
  );
  // Students can still choose the interviewer's own words explicitly.
  assert.equal(
    interviewBatches(d, ["A"], ["q"], true)[0][0].text,
    "Interviewer: When was that?",
  );
});

test("in a transcript with speaker turns, six default places include six replies", async () => {
  const { balancedSample } = await import("../src/interviews.js");
  const passages = [
    "Short profile of the interviewee.",
    ...Array.from({ length: 6 }, (_, i) => [
      "Interviewer: “What happened next?”",
      "Speaker 01: “Here is my experience " + i + ".”",
    ]).flat(),
  ].map((text, i) => ({ id: i + "", text, source: "Interview", codes: [] }));
  assert.deepEqual(balancedSample({ passages }, ["Interview"], 6), [
    "2",
    "4",
    "6",
    "8",
    "10",
    "12",
  ]);
});

test("open discovery requests new labels directly and resolves an unnecessary permission question once", async () => {
  const { requestInterviewCoding } =
    await import("../src/interview-coding-request.js");
  const context = {
    guide: {
      mode: "inductive",
      vocabulary: [{ label: "Timing" }],
      limits: { newPerBatch: 3 },
    },
    passages: [p],
  };
  const asks =
    '{"suggestions":[]}\nWould you like me to propose a new label for this?';
  const proposal = {
    id: "a",
    code: "Shift patterns",
    quote: "shift ended late",
  };
  const calls = [];
  assert.deepEqual(
    await requestInterviewCoding(context, async (request) => {
      calls.push(request);
      return calls.length === 1
        ? asks
        : JSON.stringify({ suggestions: [proposal] });
    }),
    [proposal],
  );
  assert.equal(calls.length, 2);
  assert.match(calls[0].question, /3 NEW labels/);
  assert.ok(calls.every((call) => call.context === context));
  let attempts = 0;
  await assert.rejects(
    requestInterviewCoding(context, async () => {
      attempts++;
      return asks;
    }),
    /asked for permission again/,
  );
  assert.equal(attempts, 2);
  attempts = 0;
  assert.deepEqual(
    await requestInterviewCoding(context, async () => {
      attempts++;
      return '{"suggestions":[]}';
    }),
    [],
  );
  assert.equal(attempts, 1);
  context.guide.mode = "deductive";
  assert.deepEqual(
    await requestInterviewCoding(context, async () => {
      attempts++;
      return asks;
    }),
    [],
  );
  assert.equal(attempts, 2);
});

test("a prose-only batch is retried before it can be counted as reviewed", async () => {
  const { requestInterviewCoding } =
    await import("../src/interview-coding-request.js");
  const context = { guide: { mode: "deductive" }, passages: [p] };
  const calls = [];
  const result = await requestInterviewCoding(context, async (request) => {
    calls.push(request);
    return calls.length === 1
      ? "No codes have been suggested for this passage."
      : '{"suggestions":[]}';
  });
  assert.deepEqual(result, []);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.context === context));
  let attempts = 0;
  await assert.rejects(
    requestInterviewCoding(context, async () => {
      attempts++;
      return '{"matches":[]}';
    }),
    /format this batch/,
  );
  assert.equal(attempts, 2);
});
