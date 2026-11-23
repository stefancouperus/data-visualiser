import { expect, test } from "@playwright/test";
import { makeTable } from "../../src/import.js";
import { fresh } from "../../src/project.js";
import { combineCheckboxes } from "../../src/survey-answers.js";

test("a saved checkbox grouping asks for a single answer and keeps checkbox outcomes and filters usable", async ({
  page,
}) => {
  const survey = makeTable(
    [
      ["Support", "Bus", "Train", "Site"],
      ["Yes", "1", "1", "East"],
      ["Yes", "1", "0", "East"],
      ["No", "0", "1", "West"],
      ["Yes", "0", "1", "West"],
      ["No", "0", "0", "East"],
      ["Yes", "0", "0", "West"],
      ["No", "0", "0", "West"],
      ["Yes", "", "", "East"],
      ["No", "", "", "West"],
    ],
    "Commuting",
  );
  const checkbox = combineCheckboxes(
    survey,
    "travel",
    "Travel modes",
    new Map([
      ["c1", new Set(["1"])],
      ["c2", new Set(["1"])],
    ]),
  );
  const view = {
    task: "group",
    x: "c0",
    y: checkbox.id,
    chart: "grid",
    measure: "percent",
  };
  const project = {
    ...fresh(),
    datasets: [survey],
    active: survey.id,
    confirmed: [survey.id],
    views: [view, { ...view }],
    figurePanels: "left",
  };
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Open a saved project", exact: true })
    .click();
  await (
    await picker
  ).setFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const figure = page.locator("#graphic0");
  const grouping = page.locator('[data-panel="0"] [data-key="y"]');
  const task = page.getByLabel("What would you like to find out?");
  await expect(figure).toContainText(
    "People can tick several answers to “Travel modes”",
  );
  await expect(figure.locator("svg")).toHaveCount(0);
  await expect(grouping).toHaveValue("");
  await expect(grouping.locator('option[value="travel"]')).toHaveCount(0);
  await grouping.selectOption("c1");
  await expect(figure).toContainText("7 valid of 9");
  await task.selectOption("two");
  await expect(grouping.locator('option[value="travel"]')).toHaveCount(0);
  await page.locator('[data-panel="0"] [data-key="x"]').selectOption("travel");
  await grouping.selectOption("c3");
  await expect(figure).toContainText("7 valid of 9");
  await page.getByText("Chart settings", { exact: true }).click();
  await page.getByText("Filters and appearance", { exact: true }).click();
  await page.getByLabel("Keep a subset").selectOption("travel");
  await page.getByLabel("Keep this value").selectOption("Train");
  await expect(figure).toContainText("3 valid of 3");
});
