import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import { backupContents } from "./backup-helpers.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const textFile = (name, text) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});
const tagFile = textFile(
  "highlights.txt",
  "Taguette highlights\nThe bus was late.\nDocument: Interview A\nTags: Access, Travel",
);
const wordNamespace =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const wordFile = {
  name: "Interview B.docx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: Buffer.from(
    zipSync({
      "word/document.xml": strToU8(
        `<w:document xmlns:w="${wordNamespace}"><w:body><w:p><w:r><w:t>We need </w:t></w:r><w:commentRangeStart w:id="0"/><w:r><w:t>a timetable</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:t> here.</w:t></w:r></w:p></w:body></w:document>`,
      ),
      "word/comments.xml": strToU8(
        `<w:comments xmlns:w="${wordNamespace}"><w:comment w:id="0"><w:p><w:r><w:t>CODE: Planning</w:t></w:r></w:p></w:comment></w:comments>`,
      ),
    }),
  ),
};
async function chooseFiles(page, name, files) {
  const pending = page.waitForEvent("filechooser");
  await button(page, name).click();
  await (await pending).setFiles(files);
}
async function savedDataset(page) {
  const pending = page.waitForEvent("download");
  await button(page, "Save coding project").click();
  const parts = [];
  for await (const part of await (await pending).createReadStream())
    parts.push(part);
  return backupContents(Buffer.concat(parts)).datasets[0];
}
for (const add of [false, true]) {
  test(`mixed Taguette and Word imports preserve interview names, quotations and labels ${add ? "when adding interviews" : "in a new project"}`, async ({
    page,
  }) => {
    await page.goto("/");
    if (add) {
      await chooseFiles(page, "Upload uncoded transcripts", [
        textFile("Earlier.txt", "A separate conversation."),
      ]);
      await button(page, "+ Add interview").click();
      await page.getByLabel("What are you adding?").selectOption("coded");
      await chooseFiles(page, "Choose files", [tagFile, wordFile]);
    } else {
      await chooseFiles(page, "Upload coded interviews", [wordFile, tagFile]);
    }
    await button(page, "Continue").click();
    await expect(page.locator("#marker0")).toHaveValue("Planning");
    await button(page, "Continue").click();
    const d = await savedDataset(page);
    expect(d.sources).toEqual(
      add
        ? ["Earlier.txt", "Interview A", "Interview B.docx"]
        : ["Interview B.docx", "Interview A"],
    );
    expect(d.excerptSources).toEqual(["Interview A"]);
    const original = d.passages.find(
      (p) => p.source === wordFile.name && !p.parent,
    );
    expect(original.text).toBe("We need a timetable here.");
    expect(d.originals[wordFile.name]).toBe(original.text);
    expect(d.passages.find((p) => p.parent === original.id)).toMatchObject({
      text: "a timetable",
      start: 8,
      codes: ["Planning"],
    });
    expect(d.passages.filter((p) => p.source === "Interview A")).toMatchObject([
      { text: "The bus was late.", codes: ["Access", "Travel"] },
    ]);
    expect(d.passages.filter((p) => !p.parent)).toHaveLength(add ? 3 : 2);
  });
}
test("coded spreadsheet mapping separates names, text, repeated passage IDs and labels", async ({
  page,
}) => {
  await page.goto("/");
  await chooseFiles(page, "Upload coded interviews", [
    textFile(
      "coded.csv",
      'Interview code,Interview text,Passage ID,Codes\nP01,Fares rose,1,Cost\nP01,Fares rose,1,Access\nP02,Bus was late,1,"Events (meetings, talks)"',
    ),
  ]);
  await button(page, "Continue").click();
  const source = page.getByRole("combobox", {
      name: "Interview or source",
      exact: true,
    }),
    codes = page.getByRole("combobox", { name: "Code or tags", exact: true }),
    passageID = page.getByLabel("Passage ID (if repeated)");
  await expect(source).toHaveValue("c0");
  await expect(codes).toHaveValue("c3");
  await expect(passageID).toHaveValue("c2");
  await expect(page.getByLabel("Passage or written answer")).toHaveValue("c1");
  const preview = page.locator("#passage-preview");
  const separator = page.locator("#sep");
  await expect(separator).toHaveValue("");
  const sample = preview.locator("tr").filter({ hasText: "P02" });
  await expect(sample).toContainText("Events (meetings, talks)");
  await separator.fill(",");
  await expect(sample).toContainText("Events (meetings; talks)");
  await separator.fill("");
  await expect(preview.locator("tbody tr")).toHaveCount(2);
  await expect(preview.locator("tr").filter({ hasText: "P01" })).toContainText(
    "Cost; Access",
  );
  for (const bad of [source, passageID]) {
    await bad.selectOption("c3");
    await button(page, "Continue").click();
    await expect(page.locator("#formerror")).toContainText("two roles");
    await bad.selectOption(bad === source ? "c0" : "c2");
  }
  await button(page, "Continue").click();
  const d = await savedDataset(page);
  expect(d.sources).toEqual(["P01", "P02"]);
  expect(d.passages.map((p) => [p.source, p.text, p.codes])).toEqual([
    ["P01", "Fares rose", ["Cost", "Access"]],
    ["P02", "Bus was late", ["Events (meetings, talks)"]],
  ]);
});

test("reimporting a coded Word passage keeps original spacing and quotation offsets", async ({
  page,
}) => {
  const { codedInterviewDownload } = await import("../../src/coded-docx.js");
  const paragraph = {
    id: "p",
    source: "A",
    text: "  We need a timetable. ",
    codes: ["Planning"],
    codingEvidence: [{ code: "Planning", quote: "a timetable" }],
  };
  const { name, blob } = codedInterviewDownload(
    { kind: "text", name: "Trip", sources: ["A"], passages: [paragraph] },
    ["A"],
  );
  await page.goto("/");
  await chooseFiles(page, "Upload coded interviews", [
    {
      name,
      mimeType: blob.type,
      buffer: Buffer.from(await blob.arrayBuffer()),
    },
  ]);
  await button(page, "Continue").click();
  await button(page, "Continue").click();
  const saved = await savedDataset(page);
  const original = saved.passages.find((p) => !p.parent);
  expect(original.text).toEqual(paragraph.text);
  expect(saved.passages.find((p) => p.parent === original.id)).toMatchObject({
    codes: ["Planning"],
    text: "a timetable",
    start: paragraph.text.indexOf("a timetable"),
  });
});
