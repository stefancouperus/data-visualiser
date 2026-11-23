import { expect, test } from "@playwright/test";
import { makeTable } from "../../src/import.js";
import { fresh } from "../../src/project.js";
import { newView } from "../../src/analysis.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const recent = (page) =>
  page.locator(".recent-project [data-act=recoverCoding]");

async function openRecent(page, id) {
  await page
    .locator(`.recent-project [data-act=recoverCoding][data-copy="${id}"]`)
    .click();
  await expect(button(page, "Save visual")).toBeVisible();
}

async function saveVisual(page, name) {
  await button(page, "Save visual").click();
  await page.getByLabel("Visual name").fill(name);
  await button(page, "Save to project").click();
}

test("three tabs retain independent edits when a previously forked project has another conflict", async ({
  page: first,
  context,
}) => {
  const survey = makeTable([["Answer"], ["Yes"], ["No"]], "Cohort");
  const view = newView(survey);
  const project = {
    ...fresh(),
    name: "Shared survey",
    active: survey.id,
    datasets: [survey],
    confirmed: [survey.id],
    views: [view, structuredClone(view)],
  };
  await first.goto("/");
  const chooser = first.waitForEvent("filechooser");
  await button(first, "Open a saved project").click();
  await (
    await chooser
  ).setFiles({
    name: "shared.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await button(first, "Home").click();
  await expect(recent(first)).toHaveCount(1);
  const initial = await recent(first).getAttribute("data-copy");
  await openRecent(first, initial);
  const second = await context.newPage();
  await second.goto("/");
  await openRecent(second, initial);

  await saveVisual(first, "First tab’s decision");
  await button(first, "Home").click(); // Flush the first version to IndexedDB.
  await saveVisual(second, "Second tab’s decision");
  // The second tab keeps its own writer and stays open through both conflicts.
  await expect
    .poll(() => second.evaluate(() => window.history.state?.id))
    .not.toBe(initial);
  const firstFork = await second.evaluate(() => window.history.state.id);
  const third = await context.newPage();
  await third.goto("/");
  await openRecent(third, firstFork);
  await saveVisual(third, "Third tab’s addition");
  await button(third, "Home").click();
  await saveVisual(second, "Second tab’s later addition");
  await button(second, "Home").click();
  await expect(recent(second)).toHaveCount(3);
  const ids = await recent(second).evaluateAll((links) =>
    links.map((link) => link.dataset.copy),
  );
  const secondFork = ids.find((id) => id !== initial && id !== firstFork);

  for (const [id, expected] of [
    [initial, ["First tab’s decision"]],
    [firstFork, ["Second tab’s decision", "Third tab’s addition"]],
    [secondFork, ["Second tab’s decision", "Second tab’s later addition"]],
  ]) {
    await openRecent(second, id);
    await button(second, "Save and export").click();
    const names = second
      .locator(".card")
      .filter({
        has: second.getByRole("heading", {
          name: "Saved visuals",
          exact: true,
        }),
      })
      .locator(".check-item strong");
    await expect(names).toHaveText(expected);
    await button(second, "Home").click();
  }
});
