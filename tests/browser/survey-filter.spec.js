import { test, expect } from "@playwright/test";
import { makeTable } from "../../src/import.js";
import { fresh } from "../../src/project.js";

test("exported comparison names the filter on each panel, including a fitted model", async ({
  page,
}) => {
  const survey = makeTable(
    [
      ["Support", "Campus", "Hours", "Score"],
      ["Yes", "North", "1", "4"],
      ["Yes", "North", "2", "6"],
      ["No", "South", "1", "3"],
      ["Yes", "South", "2", "5"],
      ["Yes", "South", "3", "8"],
      ["No", "South", "4", "8"],
    ],
    "Student survey",
  );
  const project = {
    ...fresh(),
    datasets: [survey],
    active: survey.id,
    confirmed: [survey.id],
    linked: false,
    figurePanels: "both",
    comparisonStarted: true,
    views: [
      {
        task: "one",
        x: "c0",
        y: "",
        chart: "bars",
        measure: "count",
        filter: "c1",
        value: "North",
      },
      {
        task: "model",
        chart: "model",
        outcome: "c3",
        predictors: ["c2"],
        filter: "c1",
        value: "South",
      },
    ],
  };
  await page.goto("/");
  const file = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open a saved project" }).click();
  await (
    await file
  ).setFiles({
    name: "comparison.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator("#graphic0 svg")).toBeVisible();
  await expect(page.locator("#graphic1 svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Save and export", exact: true })
    .click();
  await page.getByLabel("Image format").selectOption("svg");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download figure" }).click();
  const chunks = [];
  for await (const chunk of await (await pending).createReadStream())
    chunks.push(chunk);
  const panels = await page.evaluate((xml) => {
    const svg = new DOMParser().parseFromString(
      xml,
      "image/svg+xml",
    ).documentElement;
    return [...svg.children].map((panel) =>
      [...panel.querySelectorAll("text")].map((t) => t.textContent).join(" "),
    );
  }, Buffer.concat(chunks).toString());
  expect(panels).toHaveLength(2);
  expect(panels[0]).toContain("Filtered by Campus = “North”");
  expect(panels[0]).not.toContain("South");
  expect(panels[1]).toContain("Filtered by Campus = “South”");
  expect(panels[1]).not.toContain("North");
  expect(panels[1]).toContain("4 complete records");
});

test("the bot filters an existing grouped chart using its displayed cohort, with undo", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Upload Qualtrics export/ }).click();
  await (
    await picker
  ).setFiles({
    name: "survey.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Trust,Study year\n2026,2026,High,First\n2026,2026,Low,First\n2026,2026,Low,Second",
    ),
  });
  const click = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  await click("Confirm and explore");
  await click("Data bot");
  async function ask(s) {
    await page.locator("#question").fill(s);
    await click("Send");
  }
  await ask(
    "Draw a heatmap of Trust by Study year, showing percentages within each year.",
  );
  await expect(page.locator('#graphic0 [data-source="Second"]')).toHaveCount(2);
  await ask(
    "Show that just for first-years. Keep the percentages within year and update my visual.",
  );
  await expect(page.locator('#graphic0 [data-source="Second"]')).toHaveCount(0);
  await expect(
    page.locator('#graphic0 [data-code="High"][data-source="First"] text'),
  ).toHaveText("50");
  await expect(page.locator(".chatlog .msg-assistant").last()).toContainText(
    "First",
  );
  await click("Undo view change");
  await expect(page.locator('#graphic0 [data-source="Second"]')).toHaveCount(2);
});

test("applying a QSF after exclusions creates a labelled copy of the same respondents", async ({
  page,
}) => {
  await page.goto("/");
  const click = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const openDetails = async (text) => {
    const s = page.locator("summary").filter({ hasText: text }).first();
    if (!(await s.evaluate((el) => el.parentElement.open))) await s.click();
  };
  const file = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Upload Qualtrics export/ }).click();
  await (
    await file
  ).setFiles({
    name: "responses.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "StartDate,EndDate,Status,Q1\nStart Date,End Date,Response Type,Q1\n2026,2026,Preview,2\n2026,2026,Live,1\n2026,2026,Live,2",
    ),
  });
  await openDetails("Review fields and import settings");
  await click("Exclude records by value");
  await page.locator("#excludeField").selectOption("c2");
  await page.locator("#excludeValue").fill("Preview");
  await click("Apply");
  await openDetails("Seeing question codes or numbers");
  const next = page.waitForEvent("filechooser");
  await click("Add questionnaire labels");
  const q = {
    QuestionID: "QID1",
    DataExportTag: "Q1",
    QuestionText: "Feeling heard",
    QuestionType: "MC",
    Selector: "SAVR",
    Choices: { 1: { Display: "Yes" }, 2: { Display: "No" } },
  };
  await (
    await next
  ).setFiles({
    name: "questions.qsf",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ SurveyElements: [{ Element: "SQ", Payload: q }] }),
    ),
  });
  await expect(page.locator("dialog")).toContainText(
    "2 of 3 records remain selected",
  );
  await click("Use these labels");
  await click("Confirm and explore");
  await expect(page.locator("#graphic0")).toContainText("2 valid of 2");
});
