import { expect, test } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { makeTable } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function openSurvey(page, name) {
  const d = makeTable([["Trip"], ["By train"], ["By bike"]], name);
  const view = newView(d);
  const project = {
    ...fresh(),
    name,
    active: d.id,
    datasets: [d],
    confirmed: [d.id],
    views: [view, { ...view }],
  };
  const picker = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await picker
  ).setFiles({
    name: "survey.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator("#graphic0 svg")).toBeVisible();
}
async function fullDownload(page) {
  await button(page, "Save and export").click();
  const wait = page.waitForEvent("download");
  await button(page, "Download project with data").click();
  const download = await wait;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/i);
}
const recent = (page, name) =>
  page.locator(".recent-project").filter({ hasText: name });

test("a full download clears only that recent project and its pinned shortcut, also after Back and refresh", async ({
  page,
}) => {
  await page.goto("/");
  await openSurvey(page, "Living costs");
  await button(page, "Home").click();
  await openSurvey(page, "Student travel");
  await button(page, "Save and export").click();
  await page.getByText("Other save options", { exact: true }).click();
  await button(page, "Save on this device").click();
  await fullDownload(page);
  await button(page, "Compare").click();
  await button(page, "Home").click();
  await expect(recent(page, "Living costs")).toBeVisible();
  await expect(recent(page, "Student travel")).toHaveCount(0);
  await expect(button(page, "Resume on this device")).toHaveCount(0);
  await page.reload();
  await expect(recent(page, "Living costs")).toBeVisible();
  await expect(recent(page, "Student travel")).toHaveCount(0);
});

test("a new edit after downloading is recoverable and its previous backup remains unchanged", async ({
  page,
}) => {
  await page.goto("/");
  await openSurvey(page, "Travel diary");
  await fullDownload(page);
  await button(page, "Explore").click();
  await button(page, "Save visual").click();
  await page.getByLabel("Visual name").fill("Added after the backup");
  await button(page, "Save to project").click();
  await button(page, "Home").click();
  await recent(page, "Travel diary")
    .getByRole("button", { name: "Resume project", exact: true })
    .click();
  await button(page, "Save and export").click();
  await expect(
    page.getByText("Added after the backup", { exact: true }),
  ).toBeVisible();
});

test("a Word report alone leaves the working project in Recent projects", async ({
  page,
}) => {
  await page.goto("/");
  await openSurvey(page, "Study routes");
  await button(page, "Save and export").click();
  const waiting = page.waitForEvent("download");
  await button(page, "Download Word report").click();
  expect((await waiting).suggestedFilename()).toMatch(/\.docx$/i);
  await button(page, "Home").click();
  await expect(recent(page, "Study routes")).toBeVisible();
});

test("navigating an older open tab does not revive a downloaded project, while its next figure is recoverable", async ({
  page,
  context,
}) => {
  const name = "Shared survey";
  await page.goto("/");
  await openSurvey(page, "Unrelated survey");
  await button(page, "Home").click();
  await openSurvey(page, name);
  await expect(page.locator("#autosave-status")).toHaveText(
    "Saved on this device",
  );
  const other = await context.newPage();
  await other.goto("/");
  await recent(other, name)
    .getByRole("button", { name: "Resume project", exact: true })
    .click();
  await expect(other.locator("#autosave-status")).toHaveText(
    "Saved on this device",
  );
  await fullDownload(page);
  await expect(page.locator("#autosave-status")).toHaveText(
    "Project downloaded",
  );
  await button(other, "Check").click();
  await button(other, "Home").click();
  await expect(recent(other, "Unrelated survey")).toBeVisible();
  await expect(recent(other, name)).toHaveCount(0);
  await other.goBack();
  await button(other, "Explore").click();
  await button(other, "Save visual").click();
  await other.getByLabel("Visual name").fill("New finding from the second tab");
  await button(other, "Save to project").click();
  await button(other, "Home").click();
  await recent(other, name)
    .getByRole("button", { name: "Resume project", exact: true })
    .click();
  await button(other, "Save and export").click();
  await expect(
    other.getByText("New finding from the second tab", { exact: true }),
  ).toBeVisible();
});
