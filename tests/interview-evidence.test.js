import test from "node:test";
import assert from "node:assert/strict";
import { interviews } from "../src/interviews.js";
import { interviewPassageScope } from "../src/coding-passages.js";
import {
  applyCodingBatch,
  bookEntries,
  codingGuide,
  checkedSuggestions,
} from "../src/coding.js";
import { requestInterviewCoding } from "../src/interview-coding-request.js";

const passage = (id, text, source = "A") => ({ id, text, source, codes: [] });
const label = (label, category) => ({
  label,
  category,
  definition: "Approved meaning",
});
const suggestion = (id, code, quote) => ({ id, code, quote });

test("a qualified unique leaf and a qualified repeated leaf resolve once to approved identities", async () => {
  const book = bookEntries([
    label("Annual", "Membership"),
    label("Monthly", "Contact › Clubs"),
    label("Monthly", "Contact › Councils"),
  ]);
  const d = {
    coding: { mode: "deductive", book },
    passages: [passage("A", "Annual and monthly contact.")],
  };
  const guide = codingGuide(d);
  const rows = [
    "Membership › Annual",
    "Annual",
    "Monthly",
    "Contact › Councils › Monthly",
    "Fake › Monthly",
  ].map((code) => suggestion("A", code, "monthly"));
  const excluded = {};
  const approved = checkedSuggestions(rows, d.passages, guide, excluded);
  assert.deepEqual(
    approved.map((r) => r.code),
    ["Annual", "Councils › Monthly"],
  );
  assert.deepEqual(excluded, { duplicate: 1, label: 2 });
  let count = 0;
  await requestInterviewCoding({ guide, passages: d.passages }, async () => {
    count++;
    return JSON.stringify({ suggestions: [rows[0], rows[3]] });
  });
  assert.equal(count, 1);
  applyCodingBatch(d, approved);
  assert.deepEqual(d.passages[0].codes, ["Annual", "Councils › Monthly"]);
  assert.equal(d.passages[0].codingEvidence.length, 2);
});

test("approving a suggestion on a split answer changes only its own passage and evidence", () => {
  const turns = [
    passage("q", "Interviewer: Which costs matter?"),
    passage(
      "answer",
      "I pay for tickets. " + "The room was quiet. ".repeat(133),
    ),
    passage(
      "long-q",
      "Interviewer: " +
        "Please think about the journey. ".repeat(86) +
        "How often?",
    ),
    passage("next", "Noor: Monthly."),
  ];
  const d = { sources: ["A"], passages: turns };
  interviews(d);
  const split = d.passages.filter((p) => p.turnId === "answer");
  assert.ok(split.length > 1);
  assert.notEqual(split[0].codes, split[1].codes);
  const { questions, included } = interviewPassageScope(d.passages);
  assert.equal(questions.get(split.at(-1).id), turns[0].text);
  assert.ok(
    d.passages
      .filter((p) => p.turnId === "long-q")
      .every((p) => !included.has(p.id)),
  );
  const guide = codingGuide(d, "inductive");
  applyCodingBatch(
    d,
    [suggestion(split[0].id, "Cost", "I pay for tickets")],
    guide,
  );
  assert.deepEqual(
    split.map((p) => p.codes),
    [["Cost"], []],
  );
  assert.deepEqual(split[0].codingEvidence, [
    { code: "Cost", quote: "I pay for tickets" },
  ]);
  assert.equal(split[1].codingEvidence, undefined);
  assert.deepEqual(
    JSON.parse(JSON.stringify(d))
      .passages.filter((p) => p.codes.length)
      .map((p) => p.id),
    ["answer"],
  );
});

test("read-only context is local to its answer, source and participant evidence", () => {
  const turns = [
    passage("q0", "Interviewer: Can I record this interview?"),
    passage("a0", "[P_2] Yes."),
    passage("q1", "AB: Hoe vaak heeft u online contact?"),
    passage("a1", "[P_2] Maandelijks."),
    passage("a2", "[P_2] Dat is alles."),
    passage("a3", "[P_4] Maandelijks.", "B"),
    passage("q2", "Vraag: Wat is uw mening over het toestemmingsformulier?"),
    passage("a4", "[P_2] Akkoord."),
  ];
  turns[2].interviewerTag = "AB";
  const { questions, included } = interviewPassageScope(turns);
  assert.deepEqual([...questions], [["a1", turns[2].text]]);
  assert.ok(!included.has("q0") && !included.has("a0") && !included.has("q1"));
  const d = {
    coding: { book: [label("Online", "Contact")], mode: "deductive" },
    passages: turns,
  };
  const rejected = {};
  assert.deepEqual(
    checkedSuggestions(
      [
        suggestion("a1", "Online", "online contact"),
        suggestion("q1", "Online", "online contact"),
      ],
      [turns[3]],
      codingGuide(d),
      rejected,
    ),
    [],
  );
  assert.deepEqual(rejected, { quote: 1, passage: 1 });
});
