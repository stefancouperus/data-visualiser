import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { corpus } from "../../src/import.js";
import { fresh } from "../../src/project.js";
import { newView } from "../../src/analysis.js";
import { backupContents, openBackup } from "./backup-helpers.js";

test("theme units and the new grouping survive staged edits and a project round trip", async ({
  page,
  browser,
}) => {
  const sources = ["Linde", "Iris"];
  const d = corpus(
    "Reading habits",
    [
      {
        id: "p1",
        source: "Linde",
        text: "I borrow titles nearby.",
        codes: ["Library"],
        reviewed: true,
      },
      {
        id: "p2",
        source: "Linde",
        text: "I choose a new language.",
        codes: ["Translation"],
        reviewed: true,
      },
      {
        id: "p3",
        source: "Iris",
        text: "We translate collectively.",
        codes: ["Translation"],
        reviewed: true,
      },
    ],
    sources,
  );
  d.coding = {
    mode: "inductive",
    book: ["Library", "Translation"].map((label) => ({
      label,
      definition: "",
    })),
  };
  d.interviews = {
    source: "Linde",
    done: sources,
    method: "book",
    established: true,
    finished: true,
  };
  const view = newView(d);
  const project = {
    ...fresh(),
    datasets: [d],
    active: d.id,
    confirmed: [d.id],
    views: [view, { ...view }],
  };
  const button = (scope, name) =>
    scope.getByRole("button", { name, exact: true });
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await picker
  ).setFiles({
    name: "reading.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await button(page, "Compare themes").click();
  await page.getByRole("checkbox", { name: "Library", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Translation", exact: true })
    .check();
  await page.getByLabel("Show for each interview").selectOption("percent");
  const graphic = page.locator("#graphic0");
  await expect(graphic).toContainText("Translation");
  await expect(button(page, "Spot patterns")).toBeVisible();
  await page.getByText("Chart settings", { exact: true }).click();
  await page.getByLabel("Update the visual as I select").uncheck();
  await button(page, "Add interview groups").click();
  await page
    .getByLabel("Which detail will you use to form groups?")
    .fill("Workshop language");
  await page.getByLabel("Linde", { exact: true }).fill("Dutch");
  await page.getByLabel("Iris", { exact: true }).fill("English");
  await button(page, "Show groups").click();
  await page.getByLabel("Show for each group").selectOption("passages");
  await expect(graphic).not.toContainText("English");
  await button(page, "Apply selection to visual").click();
  await expect(graphic).toContainText("English");
  await button(page, "Data table").click();
  await button(page, "Save and export").click();
  const download = page.waitForEvent("download");
  await button(page, "Download project with data").click();
  const bytes = await readFile(await (await download).path());
  const restored = backupContents(bytes);
  expect(restored.views[0]).toMatchObject({
    task: "patterns",
    patternMode: "sources",
    items: ["Library", "Translation"],
    groupBy: "Workshop language",
    sourceMeasure: "percent",
    themeUnit: "passages",
    chart: "table",
  });
  const other = await browser.newPage();
  try {
    await other.goto("/");
    await openBackup(other, bytes);
    await expect(other.locator("#graphic0")).toContainText("English");
    await expect(other.getByLabel("Compare by group")).toHaveValue(
      "Workshop language",
    );
    await other.getByLabel("Compare by group").selectOption("");
    await expect(other.getByLabel("Show for each interview")).toHaveValue(
      "percent",
    );
    const sourceShare = other.getByLabel("Show for each interview");
    const groupShare = other.getByLabel("Show for each group");
    const by = other.getByLabel("Compare by group");
    const sourcesChart = button(other, "Theme sources");
    await sourceShare.selectOption("themeShare");
    await expect(sourcesChart).toHaveAttribute("aria-pressed", "true");
    await by.selectOption("Workshop language");
    await expect(groupShare).toHaveValue("themeShare");
    await expect(sourcesChart).toHaveAttribute("aria-pressed", "true");
    await button(other, "Dot plot").click();
    await by.selectOption("");
    await expect(sourceShare).toHaveValue("themeShare");
    await expect(button(other, "Dot plot")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await sourcesChart.click();
    await sourceShare.selectOption("count");
    await expect(sourcesChart).toHaveCount(0);
    await expect(button(other, "Heatmap")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await by.selectOption("Workshop language");
    await expect(groupShare).toHaveValue("interviews");
  } finally {
    await other.close();
  }
});
