import { backupContents } from "./backup-helpers.js";
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
async function downloadBytes(download) {
  const parts = [];
  for await (const chunk of await download.createReadStream())
    parts.push(chunk);
  return Buffer.concat(parts);
}
test("a transcript folder can be imported, expanded with another folder, and shared as coded Word files or a printable report", async ({
  page,
}, info) => {
  const work = info.outputPath("Interviews"),
    extra = info.outputPath("More interviews");
  await mkdir(work, { recursive: true });
  await mkdir(extra, { recursive: true });
  await writeFile(join(work, "Iris.txt"), "The park was closed.");
  await writeFile(join(work, "Koen.txt"), "We took the bus.");
  await writeFile(join(work, "notes.log"), "Skip this file.");
  await writeFile(join(extra, "Mira.txt"), "The fares went up.");
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto("/");
  const first = page.waitForEvent("filechooser");
  await button("Choose a transcript folder").click();
  await (await first).setFiles(work);
  await expect(page.getByRole("dialog")).toContainText("2 transcript");
  await expect(page.getByRole("dialog")).toContainText("1 other file");
  await button("Import transcripts").click();
  await expect(page.getByText("0 of 2 interviews checked")).toBeVisible();
  await button("+ Add interview").click();
  await page.getByLabel("What are you adding?").selectOption("folder-text");
  const next = page.waitForEvent("filechooser");
  await button("Choose files").click();
  await (await next).setFiles(extra);
  await button("Import transcripts").click();
  await expect(page.getByText("0 of 3 interviews checked")).toBeVisible();
  await button("Download coded interviews (.docx)").click();
  await page.getByLabel("Which interviews?").selectOption("all");
  const archive = page.waitForEvent("download");
  await button("Download").click();
  const zip = await archive;
  const files = unzipSync(await downloadBytes(zip));
  expect(Object.keys(files).sort()).toEqual([
    "Iris_coded.docx",
    "Koen_coded.docx",
    "Mira_coded.docx",
  ]);
  const doc = unzipSync(files["Mira_coded.docx"]);
  expect(strFromU8(doc["word/document.xml"])).toContain("The fares went up.");
  await button("Save and export").click();
  const readable = page.waitForEvent("download");
  await button("Download readable report").click();
  const report = await readable;
  expect(report.suggestedFilename()).toMatch(/report\.html$/);
  const html = (await downloadBytes(report)).toString();
  expect(html).toContain("Mira.txt");
  expect(html).not.toContain("The fares went up.");
});

test("a shared coloured Word interview reopens with overlapping comment labels anchored to the same original", async ({
  page,
}) => {
  const { codedInterviewDownload } = await import("../../src/coded-docx.js");
  const data = {
    name: "Transport",
    kind: "text",
    sources: ["Interview"],
    passages: [
      {
        id: "para",
        source: "Interview",
        text: "I take\nthe bus to work.",
        codes: ["Work travel"],
        codingEvidence: [{ code: "Work travel", quote: "bus to work" }],
      },
      {
        id: "quote",
        source: "Interview",
        text: "the bus",
        codes: ["Bus use"],
        parent: "para",
        start: 7,
      },
    ],
  };
  const { blob, name } = codedInterviewDownload(data, data.sources);
  const button = (label) =>
    page.getByRole("button", { name: label, exact: true });
  await page.goto("/");
  const pick = page.waitForEvent("filechooser");
  await button("Upload coded interviews").click();
  await (
    await pick
  ).setFiles({
    name,
    buffer: Buffer.from(await blob.arrayBuffer()),
    mimeType: blob.type,
  });
  await expect(
    page.getByText("In comments attached to passages"),
  ).toBeVisible();
  await button("Continue").click();
  await button("Continue").click();
  await expect(page.locator(".iv-text")).toContainText("the bus to work");
  const save = page.waitForEvent("download");
  await button("Save coding project").click();
  const saved = backupContents(await downloadBytes(await save));
  const entries = saved.datasets[0].passages,
    root = entries.filter((p) => !p.parent);
  expect(root).toHaveLength(1);
  expect(root[0].text).toEqual("I take\nthe bus to work.");
  expect(
    entries
      .filter((p) => p.parent)
      .map((p) => [p.text, p.codes[0]])
      .sort(),
  ).toEqual([
    ["bus to work", "Work travel"],
    ["the bus", "Bus use"],
  ]);
});

test("a downloaded survey report opens as an offline document with its filtered chart", async ({
  page,
}) => {
  const { fresh } = await import("../../src/project.js"),
    { makeTable } = await import("../../src/import.js");
  const d = makeTable(
    [
      ["Trust", "Campus"],
      ["High", "North"],
      ["Low", "South"],
      ["High", "North"],
    ],
    "Term survey",
  );
  const view = {
    task: "one",
    x: "c0",
    measure: "count",
    chart: "bars",
    filter: "c1",
    value: "North",
    title: "Trust at North campus",
  };
  const project = {
    ...fresh(),
    name: "Survey report",
    researchFocus: "How does trust vary?",
    datasets: [d],
    active: d.id,
    confirmed: [d.id],
    views: [view, view],
  };
  const button = (label) =>
    page.getByRole("button", { name: label, exact: true });
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await button("Open a saved project").click();
  await (
    await picker
  ).setFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await button("Save and export").click();
  const file = page.waitForEvent("download");
  await button("Download readable report").click();
  const html = (await downloadBytes(await file)).toString();
  await page.setContent(html);
  await expect(
    page.getByRole("heading", { name: "Research question or puzzle" }),
  ).toBeVisible();
  await expect(page.locator("figure svg")).toContainText(
    "Trust at North campus",
  );
  await expect(page.locator("figure svg")).toContainText("Filtered by Campus");
});
