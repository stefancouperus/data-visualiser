import test from "node:test";
import assert from "node:assert/strict";
import { fresh, editInterviewLabel, verifyProject } from "../src/project.js";
import {
  sharedBook,
  draftGuide,
  pruneEmptyQuotations,
  retainInterviewVocabulary,
} from "../src/interviews.js";
import { checkedSuggestions } from "../src/coding.js";

const makePassage = (id, source, codes, extra = {}) => ({
  id,
  source,
  codes,
  text: "We lost time in traffic.",
  reviewed: true,
  ...extra,
});
const label = (name, definition = "") => ({ label: name, definition });
function fixture() {
  const view = () => ({
    task: "two",
    x: "Delay",
    y: "Cost",
    chart: "bars",
    filter: "source",
    value: "Delay",
    items: ["Delay", "Cost"],
  });
  const d = {
    id: "trips",
    kind: "text",
    sources: ["Delay", "North"],
    passages: [
      makePassage("a", "Delay", ["Delay"], {
        codingEvidence: [{ code: "Delay", quote: "lost time" }],
      }),
      makePassage("q", "Delay", [" delay "], {
        parent: "a",
        start: 3,
        text: "lost time",
      }),
      makePassage("b", "North", ["Cost", "Delay"]),
    ],
    coding: { book: [label("Delay", "A journey took longer"), label("Cost")] },
    interviews: {
      source: "Delay",
      passage: "q",
      method: "book",
      established: true,
      done: ["Delay", "North"],
      finished: true,
    },
  };
  const p = {
    ...fresh(),
    active: d.id,
    datasets: [d],
    views: [view(), view()],
    saved: [{ dataset: d.id, views: [view(), view()] }],
    savedVisuals: [{ dataset: d.id, name: "Overlap", view: view() }],
  };
  return { p, d, view };
}

test("collection label edits maintain scoped assignments, exact evidence, active/saved/undo views and source identity", () => {
  const { p, d, view } = fixture();
  const other = structuredClone(d);
  other.id = "unrelated";
  p.datasets.push(other);
  p.workingViews = { unrelated: { views: [view(), view()] } };
  const undo = [[view()]];
  const edit = (change) => editInterviewLabel(p, d, change, undo);
  assert.equal(edit({ oldLabel: "Delay", label: "Time lost" }), true);
  assert.deepEqual(
    d.passages.map((x) => x.codes),
    [["Time lost"], ["Time lost"], ["Cost", "Time lost"]],
  );
  assert.deepEqual(d.passages[0].codingEvidence, [
    { code: "Time lost", quote: "lost time" },
  ]);
  assert.deepEqual(d.interviews.done, d.sources);
  for (const v of [
    ...p.views,
    ...p.saved[0].views,
    p.savedVisuals[0].view,
    ...undo[0],
  ]) {
    assert.equal(v.x, "Time lost");
    assert.deepEqual(v.items, ["Time lost", "Cost"]);
    assert.equal(v.value, "Delay");
  }
  assert.equal(p.workingViews.unrelated.views[0].x, "Delay");
  assert.deepEqual(other.passages[0].codes, ["Delay"]);
  assert.equal(
    edit({ oldLabel: "Time lost", definition: "A delay in public transport" }),
    true,
  );
  assert.deepEqual(d.interviews.done, []);
  assert.equal(d.coding.book[0].definition, "A delay in public transport");
  const before = structuredClone(p);
  assert.throws(
    () => edit({ oldLabel: "Time lost", label: " cost " }),
    /already exists/,
  );
  assert.deepEqual(structuredClone(p), before);
  assert.equal(edit({ oldLabel: "Time lost" }), false);
  edit({ oldLabel: "Time lost", remove: true });
  assert.deepEqual(
    d.passages.map((x) => [x.id, x.codes]),
    [
      ["a", []],
      ["b", ["Cost"]],
    ],
  );
  assert.deepEqual(d.passages[0].codingEvidence, []);
  assert.equal(d.interviews.passage, "a");
  assert.equal(p.views[0].task, "one");
  assert.equal(p.views[0].x, "Cost");
  assert.deepEqual(p.views[0].items, ["Cost"]);
  edit({ oldLabel: "Cost", remove: true });
  assert.equal(d.interviews.established, false);
  assert.equal(p.views[0].chart, "excerpts");
  assert.equal(d.passages[0].text, "We lost time in traffic.");
  assert.deepEqual(sharedBook(d), []);
  verifyProject(JSON.parse(JSON.stringify(p)));
  for (let i = 0; i < 10; i++) edit({ label: "Manual " + i });
  assert.equal(sharedBook(d).length, 10);
  assert.equal(
    verifyProject(structuredClone(p)).datasets[0].coding.meanings.length,
    10,
  );
});

test("local vocabulary edits preserve recoverable drafts and prevent a withdrawn suggestion from returning", () => {
  const { p, d } = fixture();
  const pair = (name) => JSON.stringify(["a", name]);
  const draft = (d.interviews.draft = {
    source: "Delay",
    sources: ["Delay", "North"],
    sample: true,
    originalOnly: true,
    ids: ["a", "b"],
    next: 1,
    total: 2,
    matches: [
      { id: "a", code: "Delay", quote: "lost time" },
      { id: "b", code: "Cost", quote: "traffic" },
    ],
    rejected: [pair("Delay")],
    manual: [pair("Cost")],
  });
  editInterviewLabel(p, d, { oldLabel: "Delay", label: "Waiting" });
  const revised = d.interviews.draft;
  assert.notEqual(revised, draft);
  assert.equal(draft.matches[0].code, "Delay");
  assert.equal(revised.matches[0].code, "Waiting");
  assert.deepEqual(revised.rejected, [pair("Waiting")]);
  assert.deepEqual(revised.manual, [pair("Cost")]);
  assert.equal(revised.next, 1);
  editInterviewLabel(p, d, { oldLabel: "Waiting", remove: true });
  assert.deepEqual(
    d.interviews.draft.matches.map((m) => m.code),
    ["Cost"],
  );
  assert.deepEqual(d.interviews.draft.rejected, []);
  const guide = draftGuide(d, true, d.interviews.draft.matches);
  const suggestions = ["Delay", "Waiting", "Traffic"].map((code) => ({
    id: "a",
    code,
    quote: "traffic",
  }));
  assert.deepEqual(
    checkedSuggestions(suggestions, d.passages, guide).map((m) => m.code),
    ["Traffic"],
  );
  assert.equal(
    verifyProject(JSON.parse(JSON.stringify(p))).datasets[0].interviews.draft
      .next,
    1,
  );
  editInterviewLabel(p, d, {
    oldLabel: "Cost",
    definition: "Only fares paid in cash.",
  });
  assert.deepEqual(d.interviews.draft.matches, []);
  assert.deepEqual(d.interviews.draft.manual, []);
  d.interviews.draft.sample = false;
  editInterviewLabel(p, d, { oldLabel: "Cost", remove: true });
  assert.equal(d.interviews.draft, undefined);
});

test("uncoded original passages and parents of labelled quotations stay intact when empty quotes are pruned", () => {
  const { d } = fixture();
  const q = d.passages[1];
  q.codes = [];
  d.passages.push(
    makePassage("fragment", "Delay", ["Cost"], {
      parent: q.id,
      start: 0,
      text: "lost",
    }),
  );
  pruneEmptyQuotations(d);
  assert.equal(d.passages.length, 4);
  d.interviews.passage = "fragment";
  d.passages.at(-1).codes = [];
  pruneEmptyQuotations(d);
  assert.equal(d.interviews.passage, "a");
  assert.deepEqual(
    d.passages.map((p) => p.id),
    ["a", "b"],
  );
});

test("removing the final imported assignment keeps the label available until explicitly deleted", () => {
  const { d } = fixture();
  delete d.coding;
  d.interviews.established = false;
  const previouslyAvailable = sharedBook(d);
  for (const p of d.passages) p.codes = [];
  retainInterviewVocabulary(d, previouslyAvailable);
  assert.deepEqual(sharedBook(d), previouslyAvailable);
  retainInterviewVocabulary(d, previouslyAvailable);
  assert.equal(d.coding.meanings.length, 2);
});
