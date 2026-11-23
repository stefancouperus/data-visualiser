import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { makeTable, texts, corpus } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
function fixture(name, ...datasets) {
  const view = newView(datasets[0]);
  return {
    ...fresh(),
    name,
    datasets,
    active: datasets[0].id,
    confirmed: datasets.filter((d) => d.kind === "table").map((d) => d.id),
    views: [view, { ...view }],
  };
}
function survey() {
  return makeTable(
    [
      ["Route", "Campus"],
      ["Bus", "East"],
      ["Walk", "North"],
    ],
    "Commuting",
  );
}
function interview() {
  return corpus(
    "Travel interviews",
    texts("Morgan", ["The late bus skips this stop."]),
    ["Morgan"],
  );
}
async function file(page, label, name, bytes, type = "application/json") {
  const picker = page.waitForEvent("filechooser");
  await button(page, label).click();
  await (
    await picker
  ).setFiles({ name, mimeType: type, buffer: Buffer.from(bytes) });
}
const open = (page, p) =>
  file(page, "Open a saved project", p.name + ".json", JSON.stringify(p));

test("the logo returns Home and each project sees only its own method on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  const s = fixture("Student survey", survey()),
    i = fixture("Practitioner interviews", interview());
  await open(page, i);
  await expect(
    page.locator('button[data-i="0"][data-act=nav] + .workflow-method'),
  ).toHaveText("Interview project");
  await button(page, "Data visualiser home").click();
  await open(page, s);
  await button(page, "Upload").click();
  await expect(button(page, "Upload Qualtrics export")).toBeVisible();
  await expect(button(page, "Upload coded interviews")).toHaveCount(0);
  await expect(page.locator("#coding-copies")).toContainText("Student survey");
  await expect(page.locator("#coding-copies")).not.toContainText(
    "Practitioner interviews",
  );
  await open(page, i);
  await expect(page.locator("#notice")).toContainText("Return to Home");
  await expect(page.locator(".workflow-method")).toHaveText("Survey project");
  await page.setViewportSize({ width: 360, height: 720 });
  await expect(page.locator(".workflow-method")).toBeInViewport();
  await expect(button(page, "Data visualiser home")).toBeInViewport();
  await button(page, "Data visualiser home").click();
  await expect(page.locator(".workflow-method")).toHaveCount(0);
  await expect(page.locator("#coding-copies")).toContainText(
    "Practitioner interviews",
  );
  await button(page, "Resume coding project").click();
  await button(page, "Upload").click();
  await expect(button(page, "Upload Qualtrics export")).toHaveCount(0);
  await expect(button(page, "Add participant information")).toBeVisible();
  await expect(page.locator("#coding-copies")).toContainText(
    "Practitioner interviews",
  );
  await expect(page.locator("#coding-copies")).not.toContainText(
    "Student survey",
  );
});

test("participant information can be linked without entering a survey workspace", async ({
  page,
}) => {
  await page.goto("/");
  await open(page, fixture("Travel interviews", interview()));
  await button(page, "Upload").click();
  await file(
    page,
    "Add participant information",
    "Participants.csv",
    "Name,Site\nMorgan,North\nLeah,South",
    "text/csv",
  );
  await button(page, "Continue").click(); // CSV header
  await expect(page.getByRole("dialog")).toContainText("Choose related table");
  await button(page, "Continue").click();
  await button(page, "Continue").click();
  await expect(page.getByRole("dialog")).toContainText("Review source matches");
  await expect(page.getByLabel("Morgan")).toHaveValue("Morgan");
  await button(page, "Apply").click();
  await expect(page.locator("#notice")).toContainText("1 sources linked");
  await expect(page.locator(".workflow-method")).toHaveText(
    "Interview project",
  );
  await expect(page.getByLabel("Current dataset")).toHaveCount(0);
});

test("a mixed legacy backup opens as separate working projects and preserves access to both originals", async ({
  page,
}) => {
  await page.goto("/");
  const original = fixture("Earlier mixed project", survey(), interview());
  for (const method of ["interview", "survey"]) {
    await open(page, original);
    await page
      .getByLabel("Which work would you like to open?")
      .selectOption(method);
    await button(page, "Open workspace").click();
    await expect(page.locator(".workflow-method")).toHaveText(
      method === "survey" ? "Survey project" : "Interview project",
    );
    await expect(page.getByLabel("Current dataset")).toHaveCount(0);
    await button(page, "Data visualiser home").click();
  }
  await expect(page.locator("#coding-copies")).toContainText(
    "Earlier mixed project · Interview",
  );
  await expect(page.locator("#coding-copies")).toContainText(
    "Earlier mixed project · Survey",
  );
});
