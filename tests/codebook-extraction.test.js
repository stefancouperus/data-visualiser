import test from "node:test";
import assert from "node:assert/strict";
import {
  bookEntries,
  approvedBook,
  checkedSuggestions,
  codingGuide,
} from "../src/coding.js";
import { extractCodebookEntries } from "../src/codebook-extraction.js";

const entry = (label, category = "", definition = "") => ({
  label,
  category,
  definition,
});
const source = (category, text, entries = [], explicitOnly = false) => ({
  category,
  text,
  entries,
  explicitOnly,
});

test("preserve explicit leaves, isolate ambiguous homonyms, and ground model suggestions in their own section", async () => {
  const sections = [
    source(
      "Supplies",
      "Tools\nOther",
      [entry("Tools", "Supplies"), entry("Other", "Supplies")],
      true,
    ),
    source("Calls", "The handbook names Monthly and Rarely for calls."),
    source("Meetings", "Use Monthly or Weekly for meetings."),
  ];
  const sent = [];
  const out = await extractCodebookEntries({ sections }, async (payload) => {
    sent.push(payload.context);
    const s = payload.context.sections;
    if (s.length === 2)
      return JSON.stringify({
        entries: [
          entry("Monthly"), // Older model omitted its section ID. Recheck both separately.
          { ...entry("Weekly", "Meetings"), sectionId: "2" },
          { ...entry("Tools", "Meetings"), sectionId: "2" }, // This term only occurs in the local section.
        ],
      });
    return JSON.stringify({
      entries: (s[0].category === "Calls"
        ? ["Monthly", "Rarely"]
        : ["Monthly", "Weekly"]
      ).map((name) => entry(name)),
    });
  });
  assert.equal(sent.length, 3);
  assert.ok(
    sent.every((context) => !JSON.stringify(context).includes("Supplies")),
  );
  assert.equal(out.omitted, 1);
  const result = bookEntries(out.entries);
  assert.equal(result.length, 6);
  assert.deepEqual(
    result.filter((e) => e.sourceLabel === "Monthly").map((e) => e.label),
    ["Calls › Monthly", "Meetings › Monthly"],
  );
});

test("flat one-code books stay flat and unsupported nested categories are flagged", async () => {
  const s = source("", "Codes\nApply Waiting to references to a queue.");
  const result = await extractCodebookEntries(
    { sections: [s] },
    async ({ context }) => {
      assert.deepEqual(context, { document: s.text });
      return JSON.stringify({
        entries: [
          entry("Waiting", "Codes", "A queue"),
          entry("Waiting", "Invented category"),
        ],
      });
    },
  );
  assert.deepEqual(result, {
    entries: [{ label: "Waiting", definition: "A queue" }],
    omitted: 1,
  });
});

test("a separately applicable parent keeps its own level and a model cannot overwrite explicit child definitions", async () => {
  const sections = [
    source(
      "Access",
      "Apply Access directly to a general barrier.\nStairs: steps.",
      [entry("Stairs", "Access", "Steps.")],
    ),
  ];
  const result = await extractCodebookEntries({ sections }, async () =>
    JSON.stringify({
      entries: [
        entry("Access", "Access", "A general barrier."),
        entry("Stairs", "Access", "An unsupported rule."),
      ],
    }),
  );
  assert.deepEqual(result.entries, [
    entry("Stairs", "Access", "Steps."),
    { label: "Access", definition: "A general barrier." },
  ]);
});

test("an approved hierarchical vocabulary keeps exact applied identities through edits and additional coding", () => {
  const raw = [
    entry("Monthly", "Clubs › Frequency"),
    entry("Monthly", "Councils › Frequency"),
    entry("No", "Membership"),
    entry("No"),
    entry("Travel / leisure"),
  ];
  const book = bookEntries(raw);
  assert.deepEqual(
    book.map((e) => e.label),
    [
      "Clubs › Frequency › Monthly",
      "Councils › Frequency › Monthly",
      "Membership › No",
      "No",
      "Travel / leisure",
    ],
  );
  const d = {
    coding: { book, mode: "deductive" },
    passages: [
      {
        id: "p",
        source: "P",
        text: "My club holds its event monthly.",
        codes: [],
      },
    ],
  };
  assert.deepEqual(approvedBook(d), book);
  assert.deepEqual(bookEntries([...book, entry("New")]).slice(0, -1), book);
  assert.equal(
    bookEntries([{ ...raw[1], previousLabel: book[1].label }])[0].label,
    book[1].label,
  );
  const proposal = { id: "p", quote: "monthly", reason: "Frequency" };
  assert.deepEqual(
    checkedSuggestions(
      [
        { ...proposal, code: "Monthly" },
        { ...proposal, code: book[0].label },
      ],
      d.passages,
      codingGuide(d),
    ).map((s) => s.code),
    [book[0].label],
  );
});
