import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function upload(page) {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await button(page, "Upload Qualtrics export").click();
  await (
    await picker
  ).setFiles({
    name: "routes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "StartDate,EndDate,Q1,Q2,Q3",
        "Start Date,End Date,Safe crossings,Clear signs,Age",
        "2026,2026,Yes,Often,22",
        "2026,2026,Yes,Often,18",
        "2026,2026,Yes,Rarely,18",
        "2026,2026,No,Rarely,18",
        "2026,2026,No,,18",
        "2026,2026,Yes,,20",
        "2026,2026,No,,20",
        "2026,2026,,Often,22",
        "2026,2026,Yes,Often,",
      ].join("\n"),
    ),
  });
  await button(page, "Confirm and explore").click();
}

test("a student can read answers across ages, reverse the denominator and export the same comparison", async ({
  page,
}) => {
  await upload(page);
  await button(page, "Compare questions by group").click();
  await page
    .getByRole("checkbox", { name: "Safe crossings", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Clear signs", exact: true })
    .check();
  await page.getByLabel("Compare by group").selectOption({ label: "Age" });
  const figure = page.locator("#graphic0");
  const heatmap = figure.locator('[data-survey-view="grid"]');
  const rows = heatmap.locator("[data-survey-question]");
  await expect(rows).toHaveCount(2);
  const cell = (row, answer, age) =>
    row.locator(`[data-answer="${answer}"][data-group="${age}"]`);
  await expect(cell(rows.first(), "Yes", "20")).toContainText("50%");
  await expect(cell(rows.last(), "Often", "20")).toContainText("No answers");
  await expect(rows.first().locator('[data-group-heading="20"]')).toContainText(
    "n = 2",
  );
  // The group value is displayed beside each matching response in the drill-down.
  await cell(rows.first(), "Yes", "20").click();
  const evidence = page.getByRole("dialog");
  await expect(evidence).toContainText("1 of 1 matching records");
  await expect(
    evidence.getByRole("columnheader", { name: "Age" }),
  ).toBeVisible();
  await button(evidence, "Close").click();
  await button(page, "Dot plot").click();
  const dots = figure.locator('[data-survey-view="dots"]');
  await expect(dots.locator("[data-percent-axis]")).toHaveCount(2);
  await expect(
    cell(dots.locator("[data-survey-question]").first(), "Yes", "20"),
  ).toHaveAccessibleName(/1 of 2/);
  await button(page, "Answer mix").click();
  await expect(
    figure.locator('[data-survey-view="stack"] [data-survey-question]'),
  ).toHaveCount(2);
  await button(page, "Heatmap").click();
  await page.getByLabel("What would you like to see?").selectOption("answer");
  await expect(cell(rows.first(), "Yes", "20")).toContainText("25%");
  await button(page, "Group mix").click();
  const mix = figure
    .locator('[data-survey-view="stack"] [data-survey-question]')
    .first();
  await expect(cell(mix, "Yes", "20")).toHaveAccessibleName(/25% \(1 of 4\)/);
  await button(page, "Data table").click();
  const table = figure.locator('[data-survey-view="table"]');
  await expect(table).toBeVisible();
  await expect(
    cell(table.locator("[data-survey-question]").first(), "Yes", "20"),
  ).toContainText("25%");
  await button(page, "Save and export").click();
  await page.getByLabel("Image format").selectOption("svg");
  const ready = page.waitForEvent("download");
  await button(page, "Download figure").click();
  const svg = await readFile(await (await ready).path(), "utf8");
  expect(svg).toContain('data-survey-view="table"');
  expect(svg).toContain("Safe crossings");
  expect(svg).toContain("Clear signs");
  expect(svg).toContain("25%");
});

test("a plain-language request draws all named survey outcomes in the same heatmap", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await upload(page);
  await button(page, "Data bot").click();
  await page
    .locator("#question")
    .fill("Compare safe crossings and clear signs by age");
  await button(page, "Send").click();
  await expect(
    page.locator('#graphic0 [data-survey-view="grid"] [data-survey-question]'),
  ).toHaveCount(2);
});

test("Spot patterns opens the bot, resumes after unlocking, and waits for agreement before drawing its recommendation", async ({
  page,
}) => {
  await page.route("https://tutor.example.test/session", (route) =>
    route.fulfill({ json: { token: "classroom-test" } }),
  );
  await upload(page);
  await button(page, "Compare questions by group").click();
  await page
    .getByRole("checkbox", { name: "Safe crossings", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Clear signs", exact: true })
    .check();
  await page.getByLabel("Compare by group").selectOption({ label: "Age" });
  await button(page, "Spot patterns").click();
  const bot = page.locator("#data-bot");
  await bot.locator("#course").fill("test-code");
  await button(bot, "Unlock the bot").click();
  const reply = bot.locator(".msg-assistant").last();
  await expect(reply).toContainText(/fewer than five answers/);
  await expect(reply).toContainText(/Safe crossings/);
  await expect(reply).toContainText(/counts table/);
  await expect(
    page.locator('#graphic0 [data-survey-view="grid"]'),
  ).toBeVisible();
  await button(bot, "Make this chart").click();
  await expect(
    page.locator('#graphic0 [data-survey-view="table"] [data-survey-question]'),
  ).toHaveCount(2);
  await button(bot, "Close").click();
  await page.getByLabel("What would you like to see?").selectOption("answer");
  await button(page, "Data bot").click();
  await bot.locator("#question").fill("What stands out?");
  await button(bot, "Send").click();
  await expect(reply).toContainText("had a recorded group");
  await expect(reply).toContainText(
    "can reflect how many people from that group took part",
  );
});
