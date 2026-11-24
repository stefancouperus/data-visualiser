import { backupContents } from "./backup-helpers.js";
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
import { codedInterviewDownload } from "../../src/coded-docx.js";
import { analyse } from "../../src/analysis.js";
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

for (const legacy of [false, true])
  test(
    (legacy ? "older" : "new") +
      " coded Word exchange keeps an ambiguous quotation on its passage and punctuation inside one label",
    async ({ page }) => {
      const source = "Fran";
      const data = {
        name: "Repeat remarks",
        kind: "text",
        sources: [source],
        passages: [
          {
            id: "p1",
            source,
            text: "Yes, it works. Yes, it works.",
            codes: ["Mode; transport", "Available"],
            codingEvidence: [{ code: "Mode; transport", quote: "it works" }],
          },
          {
            id: "p2",
            source,
            text: "Taking the bus.",
            codes: ["Mode; transport"],
          },
        ],
      };
      const file = codedInterviewDownload(data, [source]);
      let bytes = new Uint8Array(await file.blob.arrayBuffer());
      if (legacy) {
        const parts = unzipSync(bytes);
        parts["word/document.xml"] = strToU8(
          strFromU8(parts["word/document.xml"]).replaceAll(
            "DVEvidenceNote",
            "DVLabelNote",
          ),
        );
        bytes = zipSync(parts);
      }
      const button = (label) =>
        page.getByRole("button", { name: label, exact: true });
      await page.goto("/");
      const pick = page.waitForEvent("filechooser");
      await button("Upload coded interviews").click();
      await (
        await pick
      ).setFiles({
        name: file.name,
        mimeType: file.blob.type,
        buffer: Buffer.from(bytes),
      });
      await button("Continue").click();
      await expect(
        page.getByLabel("comment: CODE: Mode; transport", { exact: true }),
      ).toHaveValue("Mode; transport");
      await button("Continue").click();
      await expect(
        page
          .locator(".iv-passage")
          .first()
          .getByText("Recorded supporting words"),
      ).toBeVisible();
      const save = page.waitForEvent("download");
      await button("Save coding project").click();
      const dataset = backupContents(await downloadBytes(await save))
        .datasets[0];
      expect(dataset.passages).toHaveLength(2);
      expect(dataset.passages[0].codingEvidence).toEqual([
        { code: "Mode; transport", quote: "it works" },
      ]);
      expect(dataset.passages[0].codes.sort()).toEqual([
        "Available",
        "Mode; transport",
      ]);
      expect(dataset.passages[1].codes).toEqual(["Mode; transport"]);
    },
  );
for (const legacy of [false, true]) {
  test(
    (legacy ? "older" : "new") +
      " coded Word files keep an excluded passage out of theme counts",
    async ({ page }) => {
      const source = "Dee";
      const passages = [
        { text: "The fee rose.", codes: ["Cost"] },
        { text: "The fee rose.", codes: ["Cost"], codingIncluded: false },
        {
          text: "Interviewer: Can you elaborate?",
          codes: [],
          codingIncluded: true,
        },
        { text: "Outside the selected coding passages.", codes: [] },
      ].map((p, i) => ({ ...p, id: "p" + i, source }));
      const data = {
        name: "Travel costs",
        kind: "text",
        sources: [source],
        passages,
        interviews: {},
      };
      const view = {
        task: "one",
        chart: "bars",
        x: "Cost",
        measure: "passages",
      };
      expect(analyse(data, view).themeCounts.matchingPassages).toBe(1);
      const { blob, name } = codedInterviewDownload(data, data.sources);
      let bytes = new Uint8Array(await blob.arrayBuffer());
      if (legacy) {
        // Prior exports only retained the printed, styled exclusion note.
        const files = unzipSync(bytes);
        const document = strFromU8(files["word/document.xml"]).replace(
          /<w:bookmark(?:Start|End)\b[^>]*\/>/g,
          "",
        );
        files["word/document.xml"] = strToU8(document);
        bytes = zipSync(files);
      }
      const button = (label) =>
        page.getByRole("button", { name: label, exact: true });
      await page.goto("/");
      const files = page.waitForEvent("filechooser");
      await button("Upload coded interviews").click();
      await (
        await files
      ).setFiles({ name, mimeType: blob.type, buffer: Buffer.from(bytes) });
      await button("Continue").click();
      await button("Continue").click();
      await expect(page.locator(".iv-paper")).toContainText(
        (legacy ? 2 : 3) + " of 4 passages included for coding",
      );
      await button("Choose passages for coding").click();
      const choices = page.getByRole("dialog");
      await expect(choices.getByLabel(/Passage 1/)).toBeChecked();
      await expect(choices.getByLabel(/Passage 2/)).not.toBeChecked();
      // The same words as the legacy note can be part of a genuine answer.
      await expect(choices.getByLabel(/Passage 4/)).toBeChecked();
      if (!legacy) await expect(choices.getByLabel(/Passage 3/)).toBeChecked();
      await button("Save passage selection").click();
      const save = page.waitForEvent("download");
      await button("Save coding project").click();
      const restored = backupContents(await downloadBytes(await save))
        .datasets[0];
      expect(restored.passages[1].codes).toEqual(["Cost"]);
      expect(restored.passages[1].codingIncluded).toBe(false);
      expect(analyse(restored, view).themeCounts.matchingPassages).toBe(1);
    },
  );
}

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
