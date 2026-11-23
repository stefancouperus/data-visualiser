import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { codedInterviewDownload } from "../src/coded-docx.js";
import { projectReport } from "../src/project-report.js";
import { transcriptFolder } from "../src/transcript-folder.js";
import { fresh } from "../src/project.js";
import { makeTable } from "../src/import.js";

const original = {
  id: "one",
  source: "Alex.txt",
  text: "We pay rent & fees.",
  codes: ["Livelihood"],
};
const data = {
  kind: "text",
  id: "housing",
  name: "Housing",
  sources: ["Alex.txt", "Alex.docx"],
  passages: [
    original,
    {
      id: "quote",
      parent: "one",
      start: 7,
      text: "rent",
      source: "Alex.txt",
      codes: ["Families <3"],
    },
    {
      id: "two",
      text: "Rente, rente.",
      codes: ["Uncertain"],
      source: "Alex.docx",
      codingEvidence: [{ code: "Uncertain", quote: "ente" }],
    },
  ],
  coding: {
    book: [{ label: "Families <3", definition: "Living together" }],
    labelStyles: [
      { label: "Families <3", colour: "#123456", category: "Home" },
    ],
  },
};
const unzip = async (blob) =>
  unzipSync(new Uint8Array(await blob.arrayBuffer()));

test("Word export preserves source, label colour/category, overlapping annotations and original text", async () => {
  const result = codedInterviewDownload(data, [data.sources[0]]);
  assert.equal(result.name, "Alex_coded.docx");
  const parts = await unzip(result.blob),
    document = strFromU8(parts["word/document.xml"]),
    comments = strFromU8(parts["word/comments.xml"]);
  assert.match(document, /Label legend/);
  assert.match(document, /Shared labels on “rent”/);
  assert.match(document, /Families &lt;3/);
  assert.match(document, /Home/);
  assert.match(document, /w:val="123456"/);
  assert.match(document, /<w:shd/);
  assert.match(document, /<w:commentRangeStart/);
  assert.doesNotMatch(document, /Rente, rente|Uncertain/);
  assert.match(comments, /CODE: Families &lt;3/);
  assert.match(comments, /CODE: Livelihood/);
});
test("ZIP gives each selected interview a distinct filename and identifies ambiguous supporting words", async () => {
  const { name, blob } = codedInterviewDownload(data, data.sources);
  assert.equal(name, "Housing_coded.zip");
  const files = await unzip(blob);
  assert.deepEqual(Object.keys(files), [
    "Alex_coded.docx",
    "Alex (2)_coded.docx",
  ]);
  const parts = unzipSync(files["Alex (2)_coded.docx"]);
  assert.match(
    strFromU8(parts["word/document.xml"]),
    /without a unique location/,
  );
  assert.doesNotMatch(strFromU8(parts["word/document.xml"]), /<w:shd/);
});
test("readable report contains labelled variables, filtered record counts and separate current and saved figures", () => {
  const dataset = makeTable(
    [
      ["Colour", "Campus"],
      ["Green", "West"],
      ["Red", "East"],
    ],
    "Views",
  );
  dataset.fields[0].roles = ["outcome"];
  dataset.rules = [{ field: "c1", value: "East" }];
  const project = {
    ...fresh(),
    name: "Test <project>",
    researchFocus: "What matters?",
    active: dataset.id,
    datasets: [data, dataset],
    confirmed: [dataset.id],
    views: [{ id: "cur" }],
    savedVisuals: [
      { name: "Saved plot", dataset: dataset.id, view: { id: "saved" } },
    ],
    saved: [
      {
        name: "North & South",
        note: "A note.",
        dataset: dataset.id,
        views: [{ id: "a" }, { id: "b" }],
      },
    ],
  };
  const html = projectReport(project, (_d, v) => "<svg>" + v.id + "</svg>");
  for (const text of [
    "Test &lt;project&gt;",
    "What matters?",
    "1 of 2 records",
    "Campus = East",
    "Outcome",
    "Families &lt;3",
    "Home",
    "<svg>cur</svg>",
    "<svg>saved</svg>",
    "<svg>a</svg>",
    "A note.",
    "North &amp; South",
  ])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /We pay rent|Rente, rente/);
});
test("folder import preserves duplicate filenames across subfolders and skips unsupported/hidden files", async () => {
  function file(path) {
    const f = new File(["text"], path.split("/").at(-1));
    Object.defineProperty(f, "webkitRelativePath", { value: path });
    return f;
  }
  const input = [
    "Study/Test/A.txt",
    "Study/Control/A.txt",
    "Study/Private.xlsx",
    "Study/.hidden/Secret.docx",
    "Study/~$Work.docx",
    "Study/B.docx",
  ].map(file);
  const { name, files, skipped } = transcriptFolder(input);
  assert.equal(name, "Study");
  assert.equal(skipped, 3);
  assert.deepEqual(files.map((f) => f.name).sort(), [
    "B.docx",
    "Control/A.txt",
    "Test/A.txt",
  ]);
  assert.equal(await files[1].text(), "text");
});
