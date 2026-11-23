import test from "node:test";
import assert from "node:assert/strict";
import { analyse } from "../src/analysis.js";
import { wordPassages } from "../src/word-cloud.js";

const passage = (id, source, text, codes = [], extra = {}) => ({
  id,
  source,
  text,
  codes,
  ...extra,
});
const data = (passages, extra = {}) => ({
  kind: "text",
  sources: [...new Set(passages.map((p) => p.source))],
  passages,
  ...extra,
});
const view = { task: "words", chart: "wordcloud", x: "" };

test("ranks actual words and reports distinct passages and sources with exact-word evidence", () => {
  const d = data(
    [
      passage(
        "a",
        "A",
        "Interviewer: Trust?\nRespondent: TrusT, trust. The truster.",
      ),
      passage("b", "B", "De stem en trust!"),
      passage("c", "B", "Stem."),
    ],
    { metadata: { A: { cohort: "2" }, B: { cohort: "1" } } },
  );
  const a = analyse(d, view);
  assert.deepEqual(
    a.records.map((r) => [r.label, r.n, r.passageCount, r.sourceCount]),
    [
      ["trust", 4, 2, 2],
      ["stem", 2, 2, 1],
      ["truster", 1, 1, 1],
    ],
  );
  assert.equal(a.wordCount, 7);
  assert.equal(a.sourceCount, 2);
  const v = { ...view, filter: "cohort", value: "1" };
  assert.deepEqual(
    analyse(d, v).records.map((r) => [r.label, r.value]),
    [
      ["stem", 2],
      ["trust", 1],
    ],
  );
  assert.deepEqual(
    wordPassages(d, v, "Trust").map((p) => p.id),
    ["b"],
  );
  assert.deepEqual(
    wordPassages(d, { ...view, filter: "source", value: "A" }, "stem"),
    [],
  );
  assert.deepEqual(analyse(d, { ...view, task: "one" }).records, a.records);
  assert.deepEqual(analyse(d, { ...view, chart: "table" }).records, a.records);
});

test("counts nested and overlapping theme quotations once at their original positions", () => {
  const d = data([
    passage("p", "A", "Public trust rises then trust falls.", []),
    passage("q", "A", "Public trust rises", ["Voice"], {
      parent: "p",
      start: 0,
    }),
    passage("r", "A", "trust rises then trust", ["Voice"], {
      parent: "p",
      start: 7,
    }),
    passage("s", "A", "trust rises", ["Voice"], { parent: "q", start: 7 }),
    passage("t", "B", "Trust failed completely.", ["Voice"], {
      codingEvidence: [{ code: "Voice", quote: "Trust failed" }],
    }),
  ]);
  const v = { ...view, x: "Voice" };
  assert.equal(analyse(d, view).records.find((r) => r.label === "trust").n, 3);
  const a = analyse(d, v);
  assert.equal(a.records.find((r) => r.label === "trust").n, 3);
  assert.ok(!a.records.some((r) => ["falls", "completely"].includes(r.label)));
  assert.deepEqual(
    wordPassages(d, v, "trust").map((p) => p.text),
    ["Public trust rises then trust", "Trust failed"],
  );
});

test("deduplicates overlapping Word highlights and keeps genuine repetition", () => {
  const d = data([
    passage("p", "A", "Trust grows", ["T"], {
      markers: ["comment"],
      start: 0,
      end: 11,
    }),
    passage("q", "A", "grows here", ["T"], {
      markers: ["highlight"],
      start: 6,
      end: 16,
    }),
    passage("r", "A", "grows", ["T"], {
      markers: ["highlight"],
      start: 20,
      end: 25,
    }),
  ]);
  assert.equal(
    analyse(d, { ...view, x: "T" }).records.find((r) => r.label === "grows").n,
    2,
  );
  assert.deepEqual(
    wordPassages(d, view, "grows").map((p) => p.id),
    ["p", "r"],
  );
});

test("common-word settings, accents, written answers and empty selections", () => {
  const d = data([passage("a", "1", "the en COÖPERATIE coo\u0308peratie")], {
    openAnswers: {},
  });
  for (const [lang, words] of [
    ["both", ["coöperatie"]],
    ["en", ["coöperatie", "en"]],
    ["nl", ["coöperatie", "the"]],
    ["none", ["coöperatie", "en", "the"]],
  ]) {
    const a = analyse(d, { ...view, wordLanguage: lang });
    assert.deepEqual(
      a.records.map((r) => r.label),
      words,
    );
    assert.equal(a.records[0].n, 2);
    assert.equal(a.sourcesLabel, "Respondents");
  }
  assert.deepEqual(
    wordPassages(d, view, "coöperatie").map((p) => p.id),
    ["a"],
  );
  assert.equal(analyse(d, { ...view, x: "unassigned code" }).records.length, 0);
  assert.equal(
    analyse(data([passage("b", "2", "de it van the")]), view).records.length,
    0,
  );
});
