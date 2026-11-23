import { test, expect } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { makeTable } from "../../src/import.js";
import { newView } from "../../src/analysis.js";
import { fresh } from "../../src/project.js";
import { figureScope } from "../../src/figure-edits.js";
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

test("edited names and small model estimates agree across the project log and both Word downloads", async ({
  page,
}) => {
  const d = makeTable(
    [
      ["Travel mode", "Seminar tutor", "Budget in euros", "Support out of ten"],
      ...[1, 3, 2, 4, 5, 6].map((n, i) => [
        i < 3 ? "Bike" : "Walk",
        i < 2 ? "Dr Example" : "Dr Fiction",
        String((i + 1) * 1000),
        String(n),
      ]),
    ],
    "Student poll",
  );
  const v = {
    task: "group",
    chart: "grid",
    x: "c0",
    y: "c1",
    measure: "count",
  };
  const m = {
    task: "model",
    chart: "model",
    outcome: "c3",
    predictors: ["c2"],
  };
  const aliases = [
    ["Dr Example", "Tutor A"],
    ["Dr Fiction", "Tutor B"],
  ];
  const filtered = {
    ...v,
    filter: "c1",
    value: "Dr Fiction",
    figureEdits: {
      scope: figureScope(v),
      dimensions: { groups: { names: aliases } },
    },
  };
  const categoricalModel = { ...m, predictors: ["c1"] };
  categoricalModel.figureEdits = {
    scope: figureScope(categoricalModel),
    dimensions: { predictions: { names: aliases } },
  };
  const project = {
    ...fresh(),
    name: "Report checks",
    active: d.id,
    confirmed: [d.id],
    datasets: [d],
    views: [v, m],
    savedVisuals: [
      { dataset: d.id, view: m, name: "Budget analysis" },
      { dataset: d.id, view: filtered, name: "Selected tutor" },
      { dataset: d.id, view: categoricalModel, name: "Difference by tutor" },
    ],
  };
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await page.goto("/");
  const pick = page.waitForEvent("filechooser");
  await btn("Open a saved project").click();
  await (
    await pick
  ).setFiles({
    name: "audit.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await btn("Edit visual").first().click();
  const editor = page.getByRole("dialog");
  await editor.getByText("Edit labels and order").click();
  const group = editor.getByRole("group", { name: "Group or series names" });
  for (const [original, alias] of [
    ["Dr Example", "Tutor A"],
    ["Dr Fiction", "Tutor B"],
  ]) {
    await group.getByLabel("Choose a label").selectOption(original);
    await group.getByLabel("Display this label as").fill(alias);
  }
  await btn("Apply to visual").click();
  await expect(page.locator("#graphic0 svg")).toContainText("Tutor A");
  await btn("Save visual").first().click();
  await page.getByLabel("Visual name").fill("Edited tutor comparison");
  await btn("Save to project").click();
  await btn("Save and export").click();
  await btn("View project log").click();
  await expect(editor).toContainText("Tutor A");
  await expect(editor).not.toContainText("Dr Fiction");
  await btn("Close").click();

  const single = page.waitForEvent("download");
  await btn("Download Word report").click();
  const documentText = (data) =>
    strFromU8(unzipSync(data)["word/document.xml"]);
  const xml = documentText(await bytes(await single));
  expect(xml).toContain("Tutor A");
  expect(xml).toContain("Tutor B");
  expect(xml).not.toMatch(/Dr Fiction|Dr Example/);
  expect(xml).toContain("0.0009429 (95% interval 0.0004803 to 0.001405)");
  expect(xml).toContain("Filtered by Seminar tutor = “Tutor B”.");
  expect(xml).toContain("Reference: Seminar tutor = Tutor A.");
  expect(xml).toContain("coefficient for “Seminar tutor = Tutor B”");
  const all = page.waitForEvent("download");
  await btn("Download project with data").click();
  const files = unzipSync(await bytes(await all));
  expect(documentText(files["Report checks - project report.docx"])).toBe(xml);
  const packed = JSON.parse(strFromU8(files["project.json"]));
  expect(JSON.stringify(packed.workLog)).not.toMatch(/Dr Fiction|Dr Example/);
  expect(packed.datasets[0].rows[0].c1).toBe("Dr Example");
});
