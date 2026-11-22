import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
async function upload(page, route, name, data) {
  await page.goto("/");
  await page.getByRole("button", { name: route }).click();
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose files" }).click();
  await (
    await picker
  ).setFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(data),
  });
}
test("survey review, comparison, project save and figure export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await upload(
    page,
    /I have a Qualtrics export/,
    "survey.csv",
    "Vote,Age,Group\nYes,19,A\nNo,21,A\nYes,23,B\nNo,20,B\n",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await expect(page.locator("#graphic0 svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Compare two views", exact: true })
    .click();
  await expect(page.locator("#graphic1 svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Save comparison", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Turnout");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .getByRole("button", { name: "Save and export", exact: true })
    .click();
  await page.getByRole("button", { name: "Save on this device" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  expect((await dl).suggestedFilename()).toContain(".svg");
  await page.reload();
  await page.getByRole("button", { name: "Resume on this device" }).click();
  await expect(page.locator("#graphic0")).toContainText("Vote");
  expect(errors).toEqual([]);
});
test("Word comments and highlights map to the same source passage", async ({
  page,
}) => {
  const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const doc = zipSync({
    "word/document.xml": strToU8(
      `<w:document xmlns:w="${w}"><w:body><w:p><w:commentRangeStart w:id="0"/><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>I had a late shift.</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p></w:body></w:document>`,
    ),
    "word/comments.xml": strToU8(
      `<w:comments xmlns:w="${w}"><w:comment w:id="0"><w:p><w:r><w:t>CODE: Work</w:t></w:r></w:p></w:comment></w:comments>`,
    ),
  });
  await upload(page, /I have coded interviews/, "interview.docx", doc);
  await expect(
    page.getByRole("heading", { name: /Where did you put/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("colour: yellow").fill("Time");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("main")).toContainText("1 passages");
  await expect(page.locator("main .scroll")).toContainText("Time");
  await expect(page.locator("main .scroll")).toContainText("Work");
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Read and code passages" }).click();
  await page.locator("input[name=pickp]").check();
  await page.getByLabel("Code to apply").fill("Barriers");
  await page
    .getByRole("button", { name: "Mark reviewed / apply code" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Code", exact: true }),
  ).toContainText("Barriers");
});

test("Taguette all-highlights export keeps source and joint labels", async ({
  page,
}) => {
  const paragraphs = [
    "Taguette highlights",
    "I had to work",
    "Document: Interview 2",
    "Tags: Work, Time",
  ];
  const xml =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paragraphs
      .map((s) => "<w:p><w:r><w:t>" + s + "</w:t></w:r></w:p>")
      .join("") +
    "</w:body></w:document>";
  await upload(
    page,
    /I have coded interviews/,
    "taguette.docx",
    zipSync({ "word/document.xml": strToU8(xml) }),
  );
  await expect(page.locator("main .scroll")).toContainText("Interview 2");
  await expect(page.locator("main .scroll")).toContainText("Work; Time");
});
test("spreadsheet source mapping imports coded excerpts", async ({ page }) => {
  const Excel = (await import("exceljs/dist/exceljs.min.js")).default,
    book = new Excel.Workbook(),
    s = book.addWorksheet("Coded text");
  s.addRows([
    ["Interview", "Passage", "Codes"],
    ["A", "Work ended late", "Time;Work"],
    ["B", "I voted early", "Planning"],
  ]);
  await upload(
    page,
    /I have coded interviews/,
    "coded.xlsx",
    await book.xlsx.writeBuffer(),
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("main .scroll")).toContainText("Time; Work");
  await expect(page.locator("main .scroll")).toContainText("Planning");
});
