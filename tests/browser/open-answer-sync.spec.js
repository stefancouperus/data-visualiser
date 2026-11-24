import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { makeTable } from "../../src/import.js";
import { newView } from "../../src/analysis.js";
import { setQuestionRoles } from "../../src/open-answers.js";
import { backupContents } from "./backup-helpers.js";

test("QSF labels, exclusions and restored respondents keep their original written-answer coding", async ({
  page,
}) => {
  const table = makeTable(
    [
      ["Open answer", "Q2"],
      ["I value libraries", "1"],
      ["I value libraries", "2"],
      ["", "2"],
    ],
    "Priorities",
  );
  setQuestionRoles(table.fields[0], ["open"]);
  const v = newView(table);
  const project = {
    ...fresh(),
    active: table.id,
    datasets: [table],
    views: [v, structuredClone(v)],
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  const openDetails = async (name) => {
    const s = page.locator("summary").filter({ hasText: name }).first();
    if (!(await s.evaluate((el) => el.parentElement.open))) await s.click();
  };
  const load = async (name, filename, data) => {
    const task = page.waitForEvent("filechooser");
    await button(name).click();
    await (
      await task
    ).setFiles({
      name: filename,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  };
  async function code(source, label) {
    await button("Read and code answers").click();
    await page.locator("#passlist").getByLabel(source, { exact: true }).check();
    await page.getByLabel("Code to apply").fill(label);
    await button("Mark reviewed / apply code").click();
    await page.getByLabel("Current dataset").selectOption(table.id);
  }
  await page.goto("./");
  await load("Open a saved project", "priorities.json", project);
  await code("Record 1", "Libraries");
  await code("Record 2", "Services");
  await openDetails("Seeing question codes or numbers");
  await load("Add questionnaire labels", "questionnaire.qsf", {
    SurveyElements: [
      {
        Element: "SQ",
        Payload: {
          QuestionID: "QID2",
          DataExportTag: "Q2",
          QuestionText: "Study year",
          QuestionType: "MC",
          Selector: "SAVR",
          Choices: {
            1: { Display: "First year" },
            2: { Display: "Second year" },
          },
        },
      },
    ],
  });
  await button("Use these labels").click();
  await button("Read and code answers").click();
  await expect(page.locator("#passlist .excerpt").first()).toContainText(
    "Libraries",
  );
  await button("Close").click();
  await openDetails("Chart settings");
  await openDetails("Filters and appearance");
  const filter = page.getByLabel("Keep a subset");
  await filter.selectOption({ label: "Study year" });
  await expect(page.getByLabel("Keep this value").locator("option")).toHaveText(
    ["First year", "Second year"],
  );
  await filter.selectOption("");
  await page.getByLabel("Current dataset").selectOption(table.id);
  await openDetails("Review fields and import settings");
  await button("Exclude records by value").click();
  await page.locator("#excludeField").selectOption({ label: "Study year" });
  await page.locator("#excludeValue").fill("Second year");
  await button("Apply").click();
  await button("Read and code answers").click();
  await expect(page.getByRole("dialog")).toContainText(
    "1 of 1 included respondents answered",
  );
  await expect(page.locator("#passlist .excerpt")).toHaveCount(1);
  await expect(page.locator("#passlist .excerpt")).toContainText("Libraries");
  await expect(page.locator("#passlist")).not.toContainText("Services");
  await button("Close").click();
  await button("Save and export").click();
  const down = page.waitForEvent("download");
  await button("Download project with data").click();
  const chunks = [];
  for await (const chunk of await (await down).createReadStream())
    chunks.push(chunk);
  const backup = backupContents(Buffer.concat(chunks));
  expect(backup.datasets).toHaveLength(2);
  const data = backup.datasets[1];
  expect(data.metadata["Record 1"]).toEqual({ "Study year": "First year" });
  expect(data.excludedWrittenPassages[0].codes).toEqual(["Services"]);
  await page.goto("./");
  await load("Open a saved project", "saved.json", backup);
  await page.getByLabel("Current dataset").selectOption(table.id);
  await openDetails("Review fields and import settings");
  await button("Remove").click();
  await button("Read and code answers").click();
  await expect(page.getByRole("dialog")).toContainText(
    "2 of 3 included respondents answered",
  );
  await expect(page.locator("#passlist .excerpt").nth(0)).toContainText(
    "Libraries",
  );
  await expect(page.locator("#passlist .excerpt").nth(1)).toContainText(
    "Services",
  );
  await expect(
    page.getByLabel("Current dataset").locator("option"),
  ).toHaveCount(2);
});
