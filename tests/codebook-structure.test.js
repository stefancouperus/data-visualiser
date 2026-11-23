import test from "node:test";
import assert from "node:assert/strict";
import { codebookStructure, textBlocks } from "../src/codebook-structure.js";
import { readCodebookFile } from "../src/codebook-document.js";
const parse = (s) => codebookStructure(textBlocks(s));
const rows = (d) => d.sections.flatMap((s) => s.entries);

test("flat and nested code lists keep each original leaf and deduplicate only within its branch", () => {
  const flat = parse("Labels:\n- Fares\n- Timetables");
  assert.deepEqual(
    rows(flat).map((e) => [e.category, e.label]),
    [
      ["", "Fares"],
      ["", "Timetables"],
    ],
  );
  const tree = parse(
    "Codebook\n- Access\n  - Full\n  - Other\n  - Other\n- Support\n  - Full\n  - Other",
  );
  assert.deepEqual(
    rows(tree).map((e) => [e.category, e.label]),
    [
      ["Access", "Full"],
      ["Access", "Other"],
      ["Support", "Full"],
      ["Support", "Other"],
    ],
  );
  assert.ok(tree.sections.every((s) => s.explicitOnly));
  const groups = parse(
    "Frequency\n- Weekly\n- Other\nFunding\n- Public\n- Other",
  );
  assert.deepEqual(
    rows(groups)
      .filter((e) => e.label === "Other")
      .map((e) => e.category),
    ["Frequency", "Funding"],
  );
});

test("question headings, notes and examples keep their roles; a numbered terminal topic remains codable", () => {
  const d = parse(
    "Codebook\n1. Journeys\n1.1.a Travelling time\nHow frequently did delays occur?\n- WT: Daily\n- WT: Monthly\n- WT: Monthly\n1.1.b Arrangements\nDescribe how reimbursement was arranged.\n2. Examples\n- The ticket was expensive\n- I was stranded.",
  );
  assert.deepEqual(
    rows(d).map((e) => e.label),
    ["WT: Daily", "WT: Monthly", "1.1.b Arrangements"],
  );
  assert.deepEqual(
    rows(d).map((e) => e.category),
    ["1.1.a Travelling time", "1.1.a Travelling time", "1. Journeys"],
  );
  assert.equal(rows(d)[0].definition, "How frequently did delays occur?");
  assert.equal(
    rows(d)[2].definition,
    "Describe how reimbursement was arranged.",
  );
  assert.ok(d.sections.every((s) => s.explicitOnly));
});

test("an interview guide without specified codes goes to review without deriving labels from its prompts", () => {
  const d = parse(
    "Interview guide\n1. How did you travel this morning?\n2. What shaped that decision?",
  );
  assert.equal(rows(d).length, 0);
  assert.ok(d.sections.filter((s) => s.category).every((s) => !s.explicitOnly));
  const prose = parse(
    "The team uses both a narrow and a broad definition of travel.",
  );
  assert.equal(rows(prose).length, 0);
  assert.equal(prose.sections[0].explicitOnly, false);
  const definitions = parse(
    "- Fares: the cost of public transport.\n- Delays: lost time while travelling.",
  );
  assert.equal(definitions.sections[0].explicitOnly, false);
  assert.deepEqual(rows(definitions), []);
});

test("a CSV codebook preserves parent columns, individual rows and separate coding rules", async () => {
  const d = await readCodebookFile(
    new File(
      [
        "Category,Code,Definition,Exclusion\nTransport,Other,Another mode,Reimbursement\n,Bus,Bus journeys,\nFinance,Other,Another source,",
      ],
      "labels.csv",
    ),
  );
  assert.deepEqual(rows(d), [
    {
      category: "Transport",
      label: "Other",
      definition: "Another mode\nExclusion: Reimbursement",
    },
    { category: "Transport", label: "Bus", definition: "Bus journeys" },
    { category: "Finance", label: "Other", definition: "Another source" },
  ]);
  assert.ok(d.sections.every((s) => s.explicitOnly));
  const multi = codebookStructure([
    {
      kind: "table",
      rows: [
        ["Category", "Label"],
        ["A", "Bus; car; rail"],
      ],
    },
  ]);
  assert.equal(multi.sections[0].explicitOnly, false);
  assert.deepEqual(rows(multi), []);
});

test("plain numbered lists keep bare code names; numbered guide prompts remain for review", () => {
  for (const prefix of ["", "Codes\n", "Codebook\nLabels:\n"]) {
    const d = parse(prefix + "1. Affordable\n2. Reliable");
    assert.deepEqual(
      rows(d).map((e) => [e.category, e.label]),
      [
        ["", "Affordable"],
        ["", "Reliable"],
      ],
    );
    assert.ok(d.sections.every((s) => s.explicitOnly));
  }
  const d = parse(
    "Interview guide\n- Tell me about travelling to work\n- Describe your best experience",
  );
  assert.deepEqual(rows(d), []);
  assert.ok(d.sections.some((s) => !s.explicitOnly));
  const q = parse("1. What was the trip like?\n2. How did you find it?");
  assert.deepEqual(rows(q), []);
  assert.ok(q.sections.some((s) => !s.explicitOnly));
});

test("parent-only defined codes and separately listed subcodes retain the scope of each row", () => {
  const d = codebookStructure([
    {
      kind: "table",
      rows: [
        ["Code", "Subcode", "Definition"],
        ["Confidence", "", "Confidence in completing the journey."],
        ["Time", "Waiting", "Time spent waiting"],
        ["", "Travelling", "Time spent in transit"],
      ],
    },
  ]);
  assert.deepEqual(
    rows(d).map((e) => [e.category, e.label]),
    [
      ["", "Confidence"],
      ["Time", "Waiting"],
      ["Time", "Travelling"],
    ],
  );
  assert.ok(d.sections[0].explicitOnly);
  const a = codebookStructure([
    {
      kind: "table",
      rows: [
        ["Category", "Subcode", "Definition"],
        ["Confidence", "", "The overall dimension"],
        ["Time", "Waiting", "Time spent waiting"],
      ],
    },
  ]);
  assert.equal(a.sections[0].explicitOnly, false);
  assert.deepEqual(
    rows(a).map((e) => e.label),
    ["Waiting"],
  );
});

test("a likely list in a table cell is left for interpretation; genuine comma names are preserved", () => {
  const data = codebookStructure([
    {
      kind: "table",
      rows: [
        ["Question", "Code"],
        ["Status", "Yes, No, Unsure"],
        ["Travel", "Active travel, including bicycles"],
        ["Travel", "Activities (walking, jogging, cycling)"],
      ],
    },
  ]);
  assert.equal(data.sections[0].explicitOnly, false);
  assert.deepEqual(
    rows(data).map((e) => e.label),
    [
      "Active travel, including bicycles",
      "Activities (walking, jogging, cycling)",
    ],
  );
  assert.ok(data.sections[0].text.includes("Yes, No, Unsure"));
});

test("Word heading emphasis followed by an explanation still scopes later bullets", () => {
  const d = codebookStructure([
    { kind: "paragraph", bold: true, text: "Journey costs" },
    { kind: "paragraph", italic: true, text: "How are expenses covered?" },
    { kind: "item", level: 0, text: "Own funds" },
    { kind: "item", level: 0, text: "Reimbursement" },
  ]);
  assert.deepEqual(
    rows(d).map((e) => e.category),
    ["Journey costs", "Journey costs"],
  );
});

test("an instruction to use both a parent and its subcodes survives interpretation", () => {
  const d = parse(
    "# Access\nAlso apply Access directly when a route is described without further detail.\n## Practical obstacles\n- Broken lift\n- Missing signs",
  );
  const parent = d.sections.find((s) => s.category === "Access");
  assert.equal(parent.explicitOnly, false);
  assert.match(parent.text, /Also apply Access directly/);
  assert.deepEqual(
    rows(d).map((e) => e.label),
    ["Broken lift", "Missing signs"],
  );
  assert.ok(d.sections.at(-1).explicitOnly);
  const localLeaves = parse(
    "1. Arrival\n1.1 Access\nApply this code when the arrangement is unspecified.\n- Same day\n- Next day",
  );
  assert.equal(localLeaves.sections.at(-1).explicitOnly, false);
  assert.deepEqual(
    rows(localLeaves).map((e) => e.label),
    ["Same day", "Next day"],
  );
});
