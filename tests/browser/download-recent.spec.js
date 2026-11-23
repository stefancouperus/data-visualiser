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

test("Home keeps a dated device copy after export while the workspace picker omits it", async ({
  page,
}) => {
  await page.goto("/");
  const devices = page.getByRole("region", { name: "Projects on this device" });
  await expect(devices).toContainText("No projects saved here yet");
  await openSurvey(page, "Living costs");
  await button(page, "Home").click();
  await openSurvey(page, "Student travel");
  await button(page, "Save and export").click();
  await page.getByText("Other save options", { exact: true }).click();
  await button(page, "Save on this device").click();
  await fullDownload(page);
  await button(page, "Compare").click();
  await button(page, "Upload").click();
  await expect(recent(page, "Living costs")).toBeVisible();
  await expect(recent(page, "Student travel")).toHaveCount(0);
  await button(page, "Home").click();
  await expect(recent(page, "Living costs")).toBeVisible();
  await expect(recent(page, "Student travel")).toContainText("Last saved");
  await expect(recent(page, "Student travel").locator("time")).toHaveAttribute(
    "datetime",
    /^\d{4}-\d\d-/,
  );
  await expect(button(page, "Resume on this device")).toHaveCount(0);
  await page.reload();
  await expect(recent(page, "Living costs")).toBeVisible();
  await expect(recent(page, "Student travel")).toBeVisible();
});

test("cancelling the browser download preserves the figure and recoverable project after a fresh tab", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "The browser download refusal is triggered through Chrome DevTools.",
  );
  const name = "Cancelled student backup";
  await page.goto("/");
  await openSurvey(page, name);
  await button(page, "Save visual").click();
  await page.getByLabel("Visual name").fill("Figure before cancellation");
  await button(page, "Save to project").click();
  await button(page, "Save and export").click();
  const client = await context.newCDPSession(page);
  const { targetInfo } = await client.send("Target.getTargetInfo");
  await client.send("Browser.setDownloadBehavior", {
    behavior: "deny",
    browserContextId: targetInfo.browserContextId,
    eventsEnabled: true,
  });
  const started = page.waitForEvent("download");
  await button(page, "Download project with data").click();
  expect(await (await started).failure()).toMatch(/cancel|denied/i);
  await button(page, "Home").click();
  await expect(recent(page, name)).toContainText("Last saved");
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await recent(reopened, name)
    .getByRole("button", { name: "Resume project" })
    .click();
  await button(reopened, "Save and export").click();
  await expect(
    reopened.getByText("Figure before cancellation", { exact: true }),
  ).toBeVisible();
});

test("a requested backup cannot bypass the warning when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new Error("Storage unavailable");
      },
    });
  });
  await page.goto("/");
  await openSurvey(page, "Restricted browser");
  await fullDownload(page);
  await button(page, "Home").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("check that it is in your downloads");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(button(page, "Download project with data")).toBeVisible();
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

test("older tabs keep the backup copy available while their next edit becomes separately recoverable", async ({
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
    "Saved on this device",
  );
  await button(other, "Check").click();
  await button(other, "Home").click();
  await expect(recent(other, "Unrelated survey")).toBeVisible();
  await expect(recent(other, name)).toHaveCount(1);
  await expect(recent(other, name)).toContainText("Backup requested");
  await other.goBack();
  await button(other, "Explore").click();
  await button(other, "Save visual").click();
  await other.getByLabel("Visual name").fill("New finding from the second tab");
  await button(other, "Save to project").click();
  await button(other, "Home").click();
  await recent(other, name)
    .and(other.locator(":not([data-backup-requested])"))
    .getByRole("button", { name: "Resume project", exact: true })
    .click();
  await button(other, "Save and export").click();
  await expect(
    other.getByText("New finding from the second tab", { exact: true }),
  ).toBeVisible();
});
