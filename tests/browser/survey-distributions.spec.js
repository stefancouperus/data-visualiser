import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function uploadSurvey(page) {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Upload Qualtrics export", exact: true })
    .click();
  await (
    await picker
  ).setFiles({
    name: "travel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "StartDate,EndDate,Q1,Q2,Q3",
        "Start Date,End Date,Commute minutes,Campus,Recommends the route",
        "2026,2026,0,North,Yes",
        "2026,2026,10,North,No",
        "2026,2026,20,North,Yes",
        "2026,2026,100,North,Yes",
        "2026,2026,8,South,Yes",
        "2026,2026,,South,No",
        "2026,2026,12,South,No",
        "2026,2026,4,South,No",
      ].join("\n"),
    ),
  });
  await page
    .getByRole("button", { name: "Confirm and explore", exact: true })
    .click();
}

async function chooseChart(page, chart) {
  const picker = page.locator(".chart-picker").first();
  if (!(await picker.evaluate((el) => el.open)))
    await picker.locator("summary").click();
  await picker.getByRole("button", { name: chart, exact: true }).click();
}

test("survey charts show and export actual within-group gaps and numerical spreads", async ({
  page,
}) => {
  await uploadSurvey(page);
  const current = page.locator("#graphic0");
  await page
    .getByLabel("Choose a question or column")
    .selectOption({ label: "Commute minutes" });
  await chooseChart(page, "Box plot");
  await expect(current.locator(".box-plot-mark")).toHaveCount(1);
  await expect(current).toContainText("7 of 8 selected records");
  await page
    .getByLabel("What would you like to find out?")
    .selectOption("group");
  await page
    .getByLabel("Which answers do you want to compare?")
    .selectOption({ label: "Commute minutes" });
  await page
    .getByLabel("Which question splits respondents into groups?")
    .selectOption({ label: "Campus" });
  await chooseChart(page, "Box plot");
  await expect(current.locator(".box-plot-mark")).toHaveCount(2);
  await expect(current.locator(".box-plot-mark title").first()).toContainText(
    "upper quartile 40",
  );
  await expect(current).toContainText("median 15");
  await expect(current).toContainText("median 8");
  const coordinates = await current
    .locator(".box-plot-mark")
    .first()
    .evaluate((mark) => {
      const box = mark.querySelector("rect");
      const ends = mark.querySelector("line");
      return {
        box: Number(box.getAttribute("width")),
        range:
          Number(ends.getAttribute("x2")) - Number(ends.getAttribute("x1")),
      };
    });
  expect(coordinates.box / coordinates.range).toBeCloseTo(0.325);
  await page
    .getByLabel("Which answers do you want to compare?")
    .selectOption({ label: "Recommends the route" });
  await chooseChart(page, "Two-group gap plot");
  await expect(current).toContainText("gap of 50 percentage points");
  await expect(current).toContainText("North (n = 4)");
  await page
    .getByRole("button", { name: "Save and export", exact: true })
    .click();
  await page.getByLabel("Image format").selectOption("svg");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download figure", exact: true })
    .click();
  const exported = await readFile(await (await download).path(), "utf8");
  expect(exported).toContain("gap of 50 percentage points");
  expect(exported).toContain("South (n = 4)");
});

test("a named bot request draws a box plot and can switch to the gap plot", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await uploadSurvey(page);
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  const ask = async (prompt) => {
    await page.locator("#question").fill(prompt);
    await page.getByRole("button", { name: "Send", exact: true }).click();
  };
  await ask("Draw a box plot of Commute minutes by Campus.");
  await expect(page.locator("#graphic0 .box-plot-mark")).toHaveCount(2);
  await expect(page.locator("#graphic0")).toContainText(
    "7 of 8 selected records",
  );
  await ask("Draw a gap chart of Recommends the route by Campus.");
  await expect(page.locator("#graphic0")).toContainText(
    "gap of 50 percentage points",
  );
});

test("confirmed roles prefill the outcome and group and a staged reading applies to the saved selection", async ({
  page,
}) => {
  await uploadSurvey(page);
  await page.getByText("Chart settings", { exact: true }).click();
  await page
    .getByRole("button", { name: "Choose question roles", exact: true })
    .click();
  for (const [label, role] of [
    ["Recommends the route", "Outcome"],
    ["Campus", "Grouping"],
  ]) {
    await page.locator(".role-list summary").filter({ hasText: label }).click();
    await page
      .getByRole("group", { name: label, exact: true })
      .getByLabel(role)
      .check();
  }
  await page.getByRole("button", { name: "Confirm question roles" }).click();
  await page
    .getByRole("button", { name: "Compare questions by group" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Recommends the route · Outcome" }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Compare by group").locator("option:checked"),
  ).toHaveText("Campus · Grouping");
  const panels = page.locator(
    '#graphic0 [data-survey-view="grid"] [data-survey-question]',
  );
  await expect(panels).toHaveCount(1);
  await page.getByLabel("Update the visual as I select").uncheck();
  await page
    .getByRole("checkbox", { name: "Commute minutes", exact: true })
    .check();
  await page.getByLabel("What would you like to see?").selectOption("answer");
  await expect(panels).toHaveCount(1);
  await page.getByRole("button", { name: "Apply selection to visual" }).click();
  await expect(panels).toHaveCount(2);
  const zero = panels.locator('[data-group="North"][data-answer="0"]');
  await expect(zero).toContainText("100%");
  await expect(zero).toHaveAccessibleName(/1 of 1/);
});
