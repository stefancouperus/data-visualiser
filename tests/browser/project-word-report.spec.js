import { test, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { makeTable } from "../../src/import.js";
import { newView } from "../../src/analysis.js";
import { fresh } from "../../src/project.js";
import { openBackup } from "./backup-helpers.js";

async function bytes(download) {
  const parts = [];
  for await (const part of await download.createReadStream()) parts.push(part);
  return Buffer.concat(parts);
}
test("the current Word log is available on its own and in the directly reopenable project ZIP", async ({
  page,
}) => {
  const d = makeTable(
    [
      ["Preference", "Campus"],
      ["Bike", "West"],
      ["Walk", "East"],
    ],
    "Transport survey",
  );
  const view = newView(d);
  const project = {
    ...fresh(),
    name: "Student travel",
    researchFocus: "How do students travel?",
    active: d.id,
    confirmed: [d.id],
    datasets: [d],
    views: [view, { ...view }],
  };
  await page.goto("/");
  const pick = page.waitForEvent("filechooser");
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Open a saved project").click();
  await (
    await pick
  ).setFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await btn("Save visual").click();
  await page.getByLabel("Visual name").fill("Travel choices");
  await btn("Save to project").click();
  await btn("Save and export").click();
  const single = page.waitForEvent("download");
  await btn("Download Word report").click();
  const doc = await single;
  expect(doc.suggestedFilename()).toMatch(/project report\.docx$/);
  const document = unzipSync(await bytes(doc));
  const xml = strFromU8(document["word/document.xml"]);
  expect(xml).toContain("Travel choices");
  expect(xml).toContain("Activity and findings");
  expect(xml).toContain("How do students travel?");
  const both = page.waitForEvent("download");
  await btn("Download project with data").click();
  const archive = await bytes(await both);
  const files = unzipSync(archive);
  const packedXml = strFromU8(
    unzipSync(files["Student travel - project report.docx"])[
      "word/document.xml"
    ],
  );
  expect(packedXml).toBe(xml);
  const saved = JSON.parse(strFromU8(files["project.json"]));
  expect(
    saved.workLog.some((e) => JSON.stringify(e).includes("Travel choices")),
  ).toBe(true);
  await page.reload();
  await openBackup(page, archive);
  await btn("Save and export").click();
  const restored = page.waitForEvent("download");
  await btn("Download Word report").click();
  expect(
    strFromU8(unzipSync(await bytes(await restored))["word/document.xml"]),
  ).toContain("Travel choices");
});
