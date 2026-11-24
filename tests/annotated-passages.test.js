import assert from "node:assert/strict";
import test from "node:test";
import { annotatedPassages } from "../src/annotated-passages.js";
import { passageUnits } from "../src/transcript-index.js";

test("a Word comment spanning paragraphs is clipped to each original, and shorter nested comments never spill into the next paragraph", () => {
  const name = "Interview";
  const first = "The bus was late.";
  const second = "I called the office and then walked the rest of the way.";
  const next = first.length + 1;
  const doc = {
    name,
    paragraphs: [first, second],
    paragraphStarts: [0, next],
    marked: [
      { start: 4, end: next + 8, markers: ["trip"] },
      { start: 12, end: 16, markers: ["time"] },
    ],
  };
  const records = annotatedPassages(doc, {
    marks: { trip: ["Travel"], time: ["Delay"] },
  });
  const roots = passageUnits(records);
  assert.deepEqual(
    roots.map((p) => [p.text, p.codes]),
    [
      [first, ["Travel", "Delay"]],
      [second, ["Travel"]],
    ],
  );
  assert.deepEqual(
    records.filter((p) => p.parent).map((p) => [p.parent, p.start, p.text]),
    [
      [roots[0].id, 4, "bus was late."],
      [roots[0].id, 12, "late"],
      [roots[1].id, 0, "I called"],
    ],
  );
});

test("a native comment and inline codes use offsets in the displayed text, including repeated words", () => {
  const raw = "  [Home] rent [Cost]rent  ";
  const doc = {
    name: "Interview",
    paragraphs: [raw],
    paragraphStarts: [0],
    marked: [
      {
        start: raw.lastIndexOf("rent"),
        end: raw.lastIndexOf("rent") + 4,
        markers: ["paid"],
      },
    ],
  };
  const [original, quote] = annotatedPassages(doc, {
    open: "[",
    close: "]",
    marks: { paid: ["Paid"] },
  });
  assert.equal(original.text, "rent rent");
  assert.deepEqual(original.codes, ["Home", "Cost"]);
  assert.deepEqual(
    [quote.parent, quote.start, quote.text, quote.codes],
    [original.id, 5, "rent", ["Paid"]],
  );
});
