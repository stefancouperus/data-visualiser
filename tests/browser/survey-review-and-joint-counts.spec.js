import { test, expect } from "@playwright/test";
import { backupContents } from "./backup-helpers.js";

test("Qualtrics previews need an explicit reversible choice, and joint counts use the same people", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let asks = 0;
  await page.route("**/ask", (r) => {
    asks++;
    return r.abort();
  });
  await page.goto("/");
  const btn = (scope, name) => scope.getByRole("button", { name, exact: true });
  const file = page.waitForEvent("filechooser");
  await btn(page, "Upload Qualtrics export").click();
  await (
    await file
  ).setFiles({
    name: "workshop.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "StartDate,Status,Q1,Q2\nStart Date,Response Type,Ferries,Buses\n1,Survey Preview,Yes,Yes\n2,IP Address,Yes,Yes\n3,IP Address,No,Yes\n4,IP Address,Yes,No\n5,IP Address,Yes,\n6,IP Address,No,No",
    ),
  });
  const previews = page.getByRole("group", {
    name: "Qualtrics preview responses",
  });
  await expect(previews).toContainText("1 of 6");
  await btn(page, "Confirm and explore").click();
  await expect(btn(previews, "Exclude previews")).toBeFocused();
  await btn(previews, "Keep previews").click();
  await expect(previews).toContainText("are kept");
  await btn(previews, "Exclude previews").click();
  await expect(previews).toContainText("are excluded");
  await btn(page, "Confirm and explore").click();
  await btn(page, "Compare questions by group").click();
  for (const name of ["Ferries", "Buses"])
    await page.getByRole("checkbox", { name, exact: true }).check();
  await btn(page, "Data bot").click();
  const bot = page.locator("#data-bot");
  const reply = bot.locator(".msg-assistant").last();
  for (const [question, answer] of [
    ["How many chose Yes on both selected questions?", "1 of 4 (25%)"],
    [
      "How many chose Yes on at least one of the selected questions?",
      "3 of 4 (75%)",
    ],
  ]) {
    await bot.locator("#question").fill(question);
    await btn(bot, "Send").click();
    await expect(reply).toContainText(answer);
    await expect(reply).toContainText("1 had a missing answer");
  }
  await bot.locator("summary").filter({ hasText: "Chat tools" }).click();
  await btn(bot, "Combine answers").click();
  const dialog = page.getByRole("dialog");
  for (const name of ["Ferries", "Buses"])
    await dialog
      .getByRole("group", { name, exact: true })
      .getByLabel("No", { exact: true })
      .check();
  await dialog
    .getByLabel("How should I count respondents?")
    .selectOption("all");
  await btn(dialog, "Calculate totals").click();
  await expect(reply).toContainText("1 of 4 (25%)");
  await expect(reply).toContainText("every selected question");
  expect(asks).toBe(0);
  await btn(bot, "Close").click();
  await btn(page, "Save and export").click();
  const dl = page.waitForEvent("download");
  await btn(page, "Download project with data").click();
  const chunks = [];
  for await (const chunk of await (await dl).createReadStream())
    chunks.push(chunk);
  const backup = backupContents(Buffer.concat(chunks));
  expect(backup.datasets[0].rules).toEqual([
    { field: "c1", value: "Survey Preview" },
  ]);
  expect(
    backup.workLog
      .filter((e) => e.title.includes("Qualtrics preview responses"))
      .map((e) => e.title),
  ).toEqual([
    "Kept Qualtrics preview responses",
    "Excluded Qualtrics preview responses",
  ]);
});
