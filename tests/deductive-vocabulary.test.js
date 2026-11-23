import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCodingBatch,
  approvedBook,
  checkedSuggestions,
  codingGuide,
  codingRequestContext,
  requestsLabelDiscovery,
} from "../src/coding.js";
import {
  appendInterviews,
  draftGuide,
  establish,
  interviews,
} from "../src/interviews.js";
import { requestInterviewCoding } from "../src/interview-coding-request.js";

function collection() {
  return {
    kind: "text",
    sources: ["Iris"],
    interviews: { method: "book", established: true, source: "Iris", done: [] },
    coding: {
      mode: "inductive",
      book: ["Trust", { label: " TRUST ", definition: "Duplicate" }],
      meanings: [{ label: "Wait", definition: "Old classroom exercise" }],
    },
    passages: [
      {
        id: "old",
        source: "Iris",
        text: "Ik moest even wachten.",
        codes: ["Wait"],
      },
      {
        id: "reply",
        source: "Iris",
        text: "De trein had vertraging.",
        codes: [],
      },
    ],
  };
}
const book = [
  { label: "Service reliability", definition: "A late or cancelled service." },
];
const match = (code) => ({
  id: "reply",
  quote: "had vertraging",
  code,
  definition: "Unapproved new meaning",
});

test("reopening an older interview restores exactly its approved book when the workspace flag is missing or false", () => {
  for (const stored of [
    undefined,
    { established: false, method: "" },
    { method: "book" },
  ]) {
    const d = collection();
    d.coding.mode = "deductive";
    d.coding.bookName = "Reviewed labels.txt";
    d.interviews = stored && { done: ["Iris"], source: "Iris", ...stored };
    d.passages[1].codes = ["TRUST", "Imported note"];
    const state = interviews(d);
    assert.equal(state.established, true);
    assert.equal(state.method, "book");
    assert.deepEqual(state.done, stored ? ["Iris"] : []);
    assert.equal(d.coding.bookName, "Reviewed labels.txt");
    assert.deepEqual(d.coding.book, [{ label: "Trust", definition: "" }]);
    assert.deepEqual(
      d.passages.map((p) => p.codes),
      [["Wait"], ["Trust", "Imported note"]],
    );
    assert.equal(interviews(d), state);
  }
});

test("legacy recovery respects a pending import, active coding draft, unfinished replacement and explicit inductive setup", () => {
  for (const choice of ["imported", "draft", "bookDraft", "inductive"]) {
    const d = collection();
    d.interviews.established = false;
    d.coding.mode = "deductive";
    if (choice === "imported") d.interviews.method = "imported";
    if (choice === "draft")
      d.interviews.draft = { source: "Iris", matches: [] };
    if (choice === "bookDraft")
      d.coding.bookDraft = { method: "upload", entries: book };
    if (choice === "inductive") {
      d.interviews.method = "inductive";
      d.coding.mode = "inductive";
    }
    const saved = structuredClone(d);
    assert.equal(interviews(d).established, false);
    assert.deepEqual(d, saved);
  }
});

test("established legacy interviews and replacement books have a closed, canonical vocabulary", () => {
  const d = collection();
  assert.deepEqual(approvedBook(d), [{ label: "Trust", definition: "" }]);
  assert.equal(codingGuide(d).mode, "deductive");
  assert.equal(draftGuide(d, false).limits.newPerBatch, 0);
  const oldGuide = draftGuide(d, false);
  establish(d, [{ label: "Trust", definition: "A changed meaning" }]);
  assert.throws(
    () => applyCodingBatch(d, [match("Trust")], oldGuide),
    /no longer match/,
  );
  establish(d, book);
  assert.deepEqual(codingGuide(d).vocabulary, book);
  assert.deepEqual(draftGuide(d, true).vocabulary, book);
  assert.deepEqual(d.passages[0].codes, ["Wait"]);
  assert.throws(
    () => applyCodingBatch(d, [match("Trust")], oldGuide),
    /no longer match/,
  );
  const valid = checkedSuggestions(
    [
      match("Wait"),
      match("Punctuality"),
      match("Dienstregeling"),
      match("SERVICE  RELIABILITY"),
    ],
    d.passages,
    codingGuide(d),
  );
  assert.equal(valid.length, 1);
  assert.equal(valid[0].code, book[0].label);
  assert.equal(valid[0].definition, book[0].definition);
  assert.deepEqual(d.passages[1].codes, []);
  applyCodingBatch(d, valid);
  assert.deepEqual(d.passages[1].codes, [book[0].label]);
  appendInterviews(d, [
    {
      sources: ["Piet"],
      passages: [
        {
          id: "P1",
          source: "Piet",
          text: "Een oude code.",
          codes: ["Local notes"],
        },
      ],
    },
  ]);
  assert.equal(d.interviews.established, true);
  assert.deepEqual(approvedBook(d), book);
  assert.deepEqual(d.passages.at(-1).codes, ["Local notes"]);
});

test("a translated label can be corrected once; a repeated unapproved name is dropped before review", async () => {
  const d = collection();
  establish(d, book);
  const context = { guide: codingGuide(d), passages: d.passages };
  for (const replacement of ["Service reliability", "Vertraging"]) {
    const calls = [];
    const rows = await requestInterviewCoding(context, async (request) => {
      calls.push(request);
      return JSON.stringify({
        suggestions: [match(calls.length === 1 ? "Vertraging" : replacement)],
      });
    });
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.context === context));
    assert.match(calls[1].question, /outside the approved codebook/);
    assert.deepEqual(
      checkedSuggestions(rows, d.passages, context.guide).map((r) => r.code),
      replacement === "Service reliability" ? [replacement] : [],
    );
  }
});

test("only existing labels in the active book count towards its per-passage limit", () => {
  const d = collection();
  establish(d, [...book, { label: "Missed connection" }, { label: "Cost" }]);
  const p = d.passages[1];
  p.codes = ["Wait", "Archive", "missed connection"];
  const guide = codingGuide(d);
  assert.deepEqual(
    codingRequestContext({ guide, passages: [p] }).passages[0].codes,
    ["Missed connection"],
  );
  assert.deepEqual(p.codes, ["Wait", "Archive", "missed connection"]);
  assert.deepEqual(
    checkedSuggestions(
      [match("service reliability"), match("Cost")],
      [p],
      guide,
    ).map((r) => r.code),
    ["Service reliability"],
  );
});

test("chat uses a confirmed codebook unless discovery is explicit, including negated requests for new labels", () => {
  for (const text of [
    "Suggest codes for both interviews",
    "Apply the existing codes. Please don't propose new labels.",
    "Can you suggest labels without generating any new labels?",
    "Please code both transcripts with the approved labels only",
    "Use my codebook, no additional labels please",
    "Please use deductive coding for this transcript",
  ])
    assert.equal(requestsLabelDiscovery(text, true), false, text);
  for (const text of [
    "Find new labels",
    "Can we look for additional themes?",
    "Code this inductively",
  ])
    assert.equal(requestsLabelDiscovery(text, true), true, text);
  assert.equal(
    requestsLabelDiscovery("Suggest labels for this interview"),
    true,
  );
  assert.equal(
    requestsLabelDiscovery(
      "Suggest labels without a codebook; look for new themes",
    ),
    true,
  );
});
