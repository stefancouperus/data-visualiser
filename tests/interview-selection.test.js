import test from "node:test";
import assert from "node:assert/strict";
import { codingSelection, includedInterview } from "../src/coding-passages.js";
import {
  rememberLabelAppearance,
  labelAppearance,
  editCategory,
  setLabelAppearance,
} from "../src/label-appearance.js";
import { finishInterview } from "../src/interviews.js";
import { analyse } from "../src/analysis.js";
import { fresh, editInterviewLabel } from "../src/project.js";

test("eligible interview passages omit consent exchanges, respect overrides and retain the original text and codes", () => {
  const lines = [
    "Interviewer: Can I record this interview?",
    "Sanne: Yes.",
    "Interviewer: How do you feel about voting?",
    "Sanne: I feel heard.",
    "Interviewer: A follow-up I want to analyse",
    "Sanne: I was on time.",
    "Sanne: Is this working for us?",
  ];
  const d = {
    id: "case",
    kind: "text",
    sources: ["Case"],
    metadata: {},
    coding: { book: [{ label: "Voice", definition: "" }] },
    interviews: { source: "Case", done: [], established: true },
    passages: lines.map((text, i) => ({
      text,
      source: "Case",
      id: "p" + i,
      codes: i === 3 || i === 5 ? ["Voice"] : [],
    })),
  };
  d.passages[4].codingIncluded = true;
  d.passages[5].codingIncluded = false;
  assert.deepEqual([...codingSelection(d.passages)], ["p3", "p4", "p6"]);
  finishInterview(d);
  assert.deepEqual(
    d.passages.filter((p) => p.reviewed).map((p) => p.id),
    ["p3", "p4", "p6"],
  );
  const a = analyse(d, {
    task: "patterns",
    items: ["Voice"],
    patternMode: "sources",
    themeUnit: "passages",
    chart: "bars",
    measure: "percent",
  });
  assert.equal(includedInterview(d).passages.length, 3);
  assert.deepEqual(d.passages[5].codes, ["Voice"]);
  assert.equal(a.records[0].n, 1);
  assert.equal(d.passages.length, 7);
  assert.equal(
    includedInterview({ ...d, textPurpose: "documents" }).passages.length,
    7,
  );
});

test("distinct stable label colours and explicit categories survive edits and project roundtrips", () => {
  const d = {
    id: "d",
    kind: "text",
    sources: [],
    passages: [],
    interviews: { source: "", done: [], established: true },
    coding: {
      book: Array.from({ length: 32 }, (_, i) => ({
        label: "Theme " + i,
        definition: "",
      })),
    },
  };
  rememberLabelAppearance(d);
  let styles = labelAppearance(d);
  assert.equal(new Set([...styles.values()].map((e) => e.colour)).size, 32);
  const nextColour = styles.get("theme 1").colour;
  setLabelAppearance(d, "Theme 1", "#42962f", "Experience");
  editCategory(d, "Experience", "Daily life");
  const project = { ...fresh(), active: d.id, datasets: [d] };
  editInterviewLabel(project, d, { oldLabel: "Theme 1", label: "Access" });
  styles = labelAppearance(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(styles.get("access"), {
    label: "Access",
    colour: "#42962f",
    category: "Daily life",
  });
  assert.notEqual(nextColour, "#42962f");
  editInterviewLabel(project, d, { oldLabel: "Theme 0", remove: true });
  assert.equal(
    labelAppearance(d).get("theme 2").colour,
    styles.get("theme 2").colour,
  );
  editCategory(d, "Daily life", "");
  assert.equal(labelAppearance(d).get("access").category, "");
});

test("confirmed roster entries without supplied excerpts survive passage selection elsewhere", () => {
  const interview = (source) => ({
    id: source,
    source,
    text: "A response",
    codes: [],
  });
  const d = {
    interviews: {},
    sources: ["A", "B", "No excerpts"],
    passages: [interview("A"), interview("B")],
  };
  assert.deepEqual(includedInterview(d).sources, ["A", "B", "No excerpts"]);
  d.passages[0].codingIncluded = false;
  assert.deepEqual(includedInterview(d).sources, ["B", "No excerpts"]);
});

test("large imported codebooks allocate colours beyond the rounded hue wheel", () => {
  const book = Array.from({ length: 1500 }, (_, i) => "Label " + i);
  const styles = labelAppearance({ coding: { book }, passages: [] });
  assert.equal(
    new Set([...styles.values()].map((s) => s.colour)).size,
    book.length,
  );
});
