import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCodingBatch,
  codingGuide,
  rememberDeclinedLabels,
} from "../src/coding.js";
import { interviewBatches, reviewedMatches } from "../src/interviews.js";
import { requestInterviewCoding } from "../src/interview-coding-request.js";
import { verifyMissedSuggestions } from "../src/verify-missed-labels.js";

function example() {
  const book = [
    "Time",
    "Costs",
    "Invitation",
    "Childcare",
    "Support",
    "Travel",
  ].map((label) => ({ label, definition: "Meaning of " + label }));
  const original = {
    id: "a",
    source: "Student",
    text: "Childcare costs time; my neighbour invited me.",
    codes: ["Time"],
  };
  const excerpt = {
    id: "quote",
    source: "Student",
    parent: "a",
    start: 10,
    text: "costs",
    codes: ["Costs"],
  };
  const empty = {
    id: "neutral",
    source: "Student",
    text: "My bag is green.",
    codes: [],
  };
  const other = {
    id: "other",
    source: "Neighbour",
    text: "I paid.",
    codes: [],
  };
  const d = { coding: { book }, passages: [original, excerpt, empty, other] };
  const guide = { ...codingGuide(d, "deductive"), reviewPass: "missed" };
  return { d, book, original, excerpt, guide };
}

test("a second look checks original and excerpt labels, protects prior decisions and limits only additions", () => {
  const { d, book, original, excerpt, guide } = example();
  rememberDeclinedLabels(original, [book[4]]);
  const [batch] = interviewBatches(
    d,
    ["Student"],
    ["a", "neutral"],
    true,
    true,
  );
  assert.deepEqual(
    batch.map((p) => p.passageId),
    ["a", "neutral"],
  );
  assert.deepEqual(batch[0].codes, ["Time", "Costs"]);
  assert.deepEqual(batch[0].declinedCodes, ["Support"]);
  const raw = [
    ["Time", "time"],
    ["Costs", "costs"],
    ["Support", "neighbour"],
    ["Made up", "Childcare"],
    ["Travel", "bicycle"],
    ["Invitation", "my neighbour invited me"],
    ["Childcare", "Childcare"],
    ["Travel", "time"],
  ].map(([code, quote]) => ({ id: batch[0].id, code, quote }));
  const skipped = {};
  const matches = reviewedMatches(raw, batch, guide, skipped);
  assert.deepEqual(
    matches.map((m) => m.code),
    ["Invitation", "Childcare"],
  );
  assert.deepEqual(skipped, {
    duplicate: 2,
    declined: 1,
    label: 1,
    quote: 1,
    capacity: 1,
  });
  applyCodingBatch(d, matches, guide);
  assert.deepEqual(original.codes, ["Time", "Invitation", "Childcare"]);
  assert.deepEqual(excerpt.codes, ["Costs"]);
  assert.deepEqual(
    original.codingEvidence.map((e) => e.quote),
    ["my neighbour invited me", "Childcare"],
  );
  assert.deepEqual(d.passages[2].codes, []);
  assert.throws(() => applyCodingBatch(d, matches, guide), /no longer match/);
  book[4].definition = "Revised definition";
  const repeat = interviewBatches(d, ["Student"], ["a"], true, true)[0];
  assert.equal(repeat[0].declinedCodes, undefined);
  assert.deepEqual(
    reviewedMatches(raw, repeat, guide).filter((m) =>
      ["Invitation", "Childcare"].includes(m.code),
    ),
    [],
  );
});

test("the missed-label request accepts an empty result without asking again or assigning a label", async () => {
  const { d, guide } = example();
  const [passages] = interviewBatches(d, ["Student"], ["neutral"], true, true);
  let calls = 0;
  const found = await requestInterviewCoding(
    { guide, passages },
    async ({ question, context }) => {
      calls++;
      assert.equal(context.guide.reviewPass, "missed");
      assert.match(question, /no expected number/);
      return JSON.stringify({ suggestions: [] });
    },
  );
  assert.deepEqual(found, []);
  assert.equal(calls, 1);
  assert.deepEqual(d.passages[2].codes, []);
});

test("verification sees only involved answers, exact candidates and same-leaf alternatives and can only retain an exact subset", async () => {
  const reading = {
    label: "Reading › Rarely",
    sourceLabel: "Rarely",
    category: "Reading",
    definition: "Infrequent reading",
  };
  const writing = {
    label: "Writing › Rarely",
    sourceLabel: "Rarely",
    category: "Writing",
    definition: "Infrequent writing",
  };
  const unrelated = { label: "Bird", definition: "A bird" };
  const guide = {
    mode: "deductive",
    reviewPass: "missed",
    vocabulary: [reading, writing, unrelated],
    focus: "Private focus",
  };
  const passages = [
    {
      id: "p1",
      source: "Private name",
      text: "I rarely read or write.",
      precedingQuestion: "Do you read and write?",
      codes: [],
    },
    { id: "p2", text: "Unrelated answer", codes: [] },
  ];
  const valid = [reading, writing].map((entry) => ({
    id: "p1",
    code: entry.label,
    quote: passages[0].text,
    reason: "Discovery rationale",
  }));
  const raw = [
    ...valid,
    { id: "p2", code: "Bird", quote: "invented" },
    { id: "p1", code: "New Label", quote: "rarely" },
  ];
  let saved;
  const found = await verifyMissedSuggestions(
    { guide, passages },
    raw,
    async ({ skill, context }) => {
      assert.equal(skill, "verifyCoding");
      assert.deepEqual(context.passages, [
        {
          id: "p1",
          text: passages[0].text,
          precedingQuestion: passages[0].precedingQuestion,
        },
      ]);
      assert.deepEqual(
        context.candidates.map((c) => [c.id, c.code, c.alternatives[0].code]),
        [
          ["v1", reading.label, writing.label],
          ["v2", writing.label, reading.label],
        ],
      );
      assert.deepEqual(context.candidates[0].alternatives, [
        {
          code: writing.label,
          category: writing.category,
          definition: writing.definition,
        },
      ]);
      assert.doesNotMatch(
        JSON.stringify(context),
        /Private|Discovery rationale|Unrelated answer|Bird/,
      );
      assert.deepEqual(saved.excluded, { quote: 1, label: 1 });
      return '{"keep":["v2"]}';
    },
    (suggestions, excluded) => {
      saved = { suggestions, excluded };
    },
  );
  assert.deepEqual(found, [{ ...valid[1], definition: writing.definition }]);
  assert.deepEqual(passages[0].codes, []);
});

test("an unreadable or invented verification verdict retries and never silently drops pending candidates", async () => {
  const { d, guide } = example();
  const [passages] = interviewBatches(d, ["Student"], ["a"], true, true);
  const candidate = {
    id: "p1",
    code: "Invitation",
    quote: "my neighbour invited me",
  };
  const context = { guide, passages };
  const outputs = [
    '{"keep":["v9"]}',
    '{"keep":["v1"],"correction":"new quote"}',
  ];
  let pending;
  await assert.rejects(
    requestInterviewCoding(
      context,
      async ({ skill }) => {
        if (skill === "coding")
          return JSON.stringify({ suggestions: [candidate] });
        return outputs.shift();
      },
      {
        checkpoint: (suggestions) => {
          pending = suggestions;
        },
      },
    ),
    /could not verify/,
  );
  assert.deepEqual(outputs, []);
  let requests = 0;
  assert.deepEqual(
    await requestInterviewCoding(
      context,
      async ({ skill }) => {
        assert.equal(skill, "verifyCoding");
        requests++;
        return '{"keep":[]}';
      },
      { pending },
    ),
    [],
  );
  assert.equal(requests, 1);
  await assert.rejects(
    verifyMissedSuggestions(context, pending, async () => {
      throw Error("Temporarily unavailable");
    }),
    /Temporarily unavailable/,
  );
});
