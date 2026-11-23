import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { projectBackup, readProjectFile } from "../src/project-backup.js";
import { projectWordReport } from "../src/project-word-report.js";

const seed = () => ({
  name: "Travel workshop",
  active: "survey",
  researchFocus: "Which modes do students prefer?",
  datasets: [
    {
      id: "survey",
      name: "Travel survey",
      kind: "table",
      rows: [{ mode: "Unique individual answer" }],
      rules: [],
    },
  ],
  savedVisuals: [
    {
      dataset: "survey",
      name: "Preferred route",
      view: { annotation: "Check the sample size." },
    },
  ],
  saved: [],
  workLog: [
    {
      at: "2026-11-23T09:12:00Z",
      source: "Travel survey",
      title: "Confirmed data for exploration",
      details: ["One record included."],
    },
    {
      at: "2026-11-23T09:15:00Z",
      source: "Travel survey",
      title: "Saved a visual",
      details: ["The comparison uses responses from one campus."],
    },
  ],
});
const xml = (docx) => strFromU8(unzipSync(docx)["word/document.xml"]);

test("backup contains a directly reopenable editable project and the current Word log", async () => {
  const project = seed(),
    describe = () => ["Two groups compared."];
  const initial = projectWordReport(project, describe);
  assert.equal(projectWordReport(project, describe), initial);
  project.workLog.push({
    at: "2026-11-24T08:00:00Z",
    source: "",
    title: "Edited the research question",
    details: ["Town & city travel"],
  });
  const report = projectWordReport(project, describe);
  const { blob, name } = projectBackup(project, report);
  const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(name, "Travel workshop - project.zip");
  assert.deepEqual(Object.keys(archive).sort(), [
    "Travel workshop - project report.docx",
    "project.json",
  ]);
  const content = xml(archive["Travel workshop - project report.docx"]);
  assert.ok(
    content.indexOf("Confirmed data for exploration") <
      content.indexOf("Saved a visual"),
  );
  for (const text of [
    "Activity and findings",
    "Edited the research question",
    "Saved visuals and comparisons",
    "Check the sample size.",
    "Two groups compared.",
    "Town &amp; city travel",
  ])
    assert.ok(content.includes(text));
  assert.ok(!content.includes("Unique individual answer"));
  assert.ok(!xml(initial).includes("Edited the research question"));
  assert.deepEqual(await readProjectFile(blob), project);
});

test("legacy JSON reopens and unrelated ZIP files get a project-specific error", async () => {
  const project = seed();
  assert.deepEqual(
    await readProjectFile(new Blob([JSON.stringify(project)])),
    project,
  );
  await assert.rejects(
    readProjectFile(new Blob([zipSync({ "other.txt": strToU8("Other") })])),
    /does not contain a readable Data visualiser project/,
  );
});
