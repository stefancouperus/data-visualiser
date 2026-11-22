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
