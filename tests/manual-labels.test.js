import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  editInterviewLabel,
  editInterviewCategory,
  rewriteInterviewLabelReferences,
  verifyProject,
} from "../src/project.js";
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

test("renaming an older label keeps it outside the approved book and removing the last approved label leaves a recoverable project", () => {
  const { p, d } = fixture();
  d.coding.book = [label("Delay")];
  editInterviewLabel(p, d, { oldLabel: "Cost", label: "Former fare code" });
  assert.deepEqual(d.coding.book, [label("Delay")]);
  assert.deepEqual(d.passages.at(-1).codes, ["Former fare code", "Delay"]);
  editInterviewLabel(p, d, { oldLabel: "Delay", remove: true });
  assert.equal(d.interviews.established, false);
  assert.equal(d.coding.book.length, 0);
  assert.deepEqual(d.passages.at(-1).codes, ["Former fare code"]);
  assert.deepEqual(
    verifyProject(structuredClone(p)).datasets[0].coding.meanings,
    [label("Former fare code")],
  );
});

test("adding, moving and deleting a scoped sibling preserves each branch's existing coding and evidence", () => {
  const { p, d, view } = fixture();
  const undo = [[view()]];
  const save = (change) => editInterviewLabel(p, d, change, undo);
  save({ oldLabel: "Delay", category: "Online", colour: "#315ea5" });
  const first = "Online › Delay",
    second = "Meetings › Delay";
  d.interviews.draft = {
    source: "Delay",
    ids: ["a"],
    next: 1,
    total: 1,
    matches: [{ id: "a", code: "Delay", quote: "lost time" }],
    manual: [JSON.stringify(["a", "Delay"])],
  };
  save({
    label: "Delay",
    category: "Meetings",
    definition: "A delayed meeting.",
    colour: "#a23456",
  });
  assert.deepEqual(
    d.coding.book.map((x) => x.label),
    [first, "Cost", second],
  );
  assert.deepEqual(d.passages[0].codes, [first]);
  assert.deepEqual(d.passages[1].codes, [first]);
  assert.equal(d.passages[0].codingEvidence[0].code, first);
  assert.deepEqual(d.interviews.draft.manual, [JSON.stringify(["a", first])]);
  assert.equal(d.interviews.draft.matches[0].code, first);
  for (const v of [
    ...p.views,
    ...p.saved[0].views,
    p.savedVisuals[0].view,
    ...undo[0],
  ]) {
    assert.equal(v.x, first);
    assert.deepEqual(v.items, [first, "Cost"]);
    assert.equal(v.value, "Delay");
  }
  assert.equal(
    d.coding.labelStyles.find((s) => s.label === first).colour,
    "#315ea5",
  );
  assert.equal(
    d.coding.labelStyles.find((s) => s.label === second).colour,
    "#a23456",
  );
  d.passages[2].codes = [second];
  const before = structuredClone(p);
  assert.throws(
    () => save({ oldLabel: first, category: "meetings" }),
    /already exists/,
  );
  assert.deepEqual(structuredClone(p), before);
  editInterviewCategory(p, d, "Online", "Online contact", undo);
  const renamed = "Online contact › Delay";
  assert.deepEqual(
    d.passages.map((x) => x.codes),
    [[renamed], [renamed], [second]],
  );
  assert.equal(d.passages[0].codingEvidence[0].code, renamed);
  assert.deepEqual(
    d.coding.labelStyles.find((s) => s.label === renamed),
    { label: renamed, category: "Online contact", colour: "#315ea5" },
  );
  assert.deepEqual(
    verifyProject(JSON.parse(JSON.stringify(p))).datasets[0].coding.book,
    d.coding.book,
  );
  save({ oldLabel: second, category: "Internal discussions" });
  assert.deepEqual(d.passages[2].codes, ["Internal discussions › Delay"]);
  save({ oldLabel: renamed, remove: true });
  assert.deepEqual(d.passages[0].codes, []);
  assert.deepEqual(d.passages.at(-1).codes, ["Internal discussions › Delay"]);
  assert.equal(
    d.coding.book.find((e) => e.sourceLabel === "Delay").category,
    "Internal discussions",
  );
});

test("moving a named category into an occupied ungrouped branch leaves both identities intact", () => {
  const { p, d } = fixture();
  editInterviewLabel(p, d, { label: "Delay", category: "Messages" });
  const before = structuredClone(p);
  assert.throws(
    () => editInterviewCategory(p, d, "Messages", ""),
    /within a category/,
  );
  assert.deepEqual(structuredClone(p), before);
});

test("bulk codebook identity changes are simultaneous when already-used project codes swap", () => {
  const { p, d } = fixture();
  d.coding.meanings = [
    label("Delay", "Old delay meaning"),
    label("Cost", "Old cost meaning"),
  ];
  rewriteInterviewLabelReferences(
    p,
    d,
    new Map([
      ["Delay", "Cost"],
      ["Cost", "Delay"],
    ]),
  );
  assert.deepEqual(
    d.passages.map((x) => x.codes),
    [["Cost"], ["Cost"], ["Delay", "Cost"]],
  );
  assert.equal(d.passages[0].codingEvidence[0].code, "Cost");
  assert.deepEqual(d.coding.meanings, [
    label("Cost", "Old delay meaning"),
    label("Delay", "Old cost meaning"),
  ]);
  assert.deepEqual(p.views[0].items, ["Cost", "Delay"]);
});
