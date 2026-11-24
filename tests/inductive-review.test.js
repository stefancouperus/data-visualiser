import test from "node:test";
import assert from "node:assert/strict";
import { sampleLabels, reviewVocabulary } from "../src/inductive-review.js";
import {
  approvedBook,
  bookEntries,
  checkedSuggestions,
} from "../src/coding.js";
import { establish } from "../src/interviews.js";
import { fresh, verifyProject } from "../src/project.js";

const book = [{ label: "Travel costs", definition: "Cost of a journey" }];
const match = (id, code, definition) => ({ id, code, definition });
const seed = [
  match("a", "Time pressure", "Being short on time"),
  match("b", "TIME PRESSURE", "Other wording"),
  match("b", "Travel costs", "Bot definition"),
  match("c", "Uncertainty", "Feeling unsure"),
];
const edits = [
  {
    original: "Time pressure",
    label: "Schedule clashes",
    definition: "A commitment overlaps with another.",
    keep: true,
  },
  {
    original: "Uncertainty",
    label: "Doubt",
    definition: "Questioning an option",
    keep: false,
  },
];

test("inductive reviews keep repeated sublabels in their approved categories", () => {
  const book = bookEntries(
    ["Practice", "Meetings"].map((category) => ({
      category,
      label: "Monthly",
      definition: "",
    })),
  );
  const guide = {
    mode: "inductive",
    vocabulary: book,
    limits: { newPerBatch: 2 },
  };
  const passage = { id: "a", text: "We practise monthly.", codes: [] };
  const proposals = ["Monthly", "Practice › Monthly"].map((code) => ({
    id: "a",
    code,
    quote: "practise monthly",
  }));
  assert.deepEqual(
    checkedSuggestions(proposals, [passage], guide).map((m) => m.code),
    ["Practice › Monthly"],
  );
  const addition = { keep: true, label: "Monthly", definition: "" };
  assert.throws(() => reviewVocabulary(book, [addition]), /another category/);
  assert.deepEqual(
    reviewVocabulary(book, [{ ...addition, label: "Travel" }]).slice(0, 2),
    book,
  );
});

test("inductive drafts keep one editable label across examples and preserve earlier codebook meanings", () => {
  const rows = sampleLabels(seed, book, edits);
  assert.deepEqual(
    rows.map((r) => [r.original, r.label, r.keep]),
    [
      ["Time pressure", "Schedule clashes", true],
      ["Travel costs", "Travel costs", true],
      ["Uncertainty", "Doubt", false],
    ],
  );
  assert.deepEqual(reviewVocabulary(book, rows), [
    ...book,
    {
      label: "Schedule clashes",
      definition: "A commitment overlaps with another.",
    },
  ]);
  assert.equal(seed[0].code, "Time pressure");
  const collision = structuredClone(rows);
  collision[0].label = " travel costs ";
  assert.throws(() => reviewVocabulary(book, collision), /duplicate/);
  collision[0].label = "";
  assert.throws(() => reviewVocabulary(book, collision), /Give each entry/);
  assert.throws(
    () =>
      reviewVocabulary(
        [],
        rows.filter((r) => !r.keep),
      ),
    /Select at least/,
  );
});

test("edited draft state round trips before approval without annotating a passage", () => {
  const p = fresh();
  const d = {
    id: "qual",
    kind: "text",
    name: "Interviews",
    sources: ["Sanne", "Lina"],
    passages: [
      { id: "a", source: "Sanne", text: "I was busy.", codes: [] },
      {
        id: "b",
        source: "Lina",
        text: "The ticket costs too much.",
        codes: [],
      },
    ],
    interviews: {
      source: "Sanne",
      done: [],
      method: "inductive",
      established: false,
      draft: {
        source: "Sanne",
        sources: ["Sanne", "Lina"],
        sample: true,
        ids: ["a", "b"],
        next: 1,
        total: 1,
        matches: seed.slice(0, 3),
        labelEdits: edits,
        codeExamples: false,
      },
    },
  };
  p.datasets = [d];
  p.active = d.id;
  const loaded = verifyProject(JSON.parse(JSON.stringify(p))).datasets[0];
  const draft = loaded.interviews.draft;
  assert.deepEqual(draft.labelEdits, edits);
  const labels = reviewVocabulary(
    [],
    sampleLabels(draft.matches, [], draft.labelEdits),
  );
  establish(loaded, labels);
  assert.deepEqual(
    approvedBook(loaded).map((e) => e.label),
    ["Schedule clashes", "Travel costs"],
  );
  assert(loaded.passages.every((p) => p.codes.length === 0));
  const invalid = structuredClone(p);
  invalid.datasets[0].interviews.draft.labelEdits[0].keep = "false";
  assert.throws(() => verifyProject(invalid), /review progress/);
});
