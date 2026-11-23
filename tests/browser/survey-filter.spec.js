import { test, expect } from "@playwright/test";

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
