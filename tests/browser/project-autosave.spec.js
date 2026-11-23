import { test, expect } from "@playwright/test";
import { makeTable } from "../../src/import.js";
import { fresh } from "../../src/project.js";
import { newView } from "../../src/analysis.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function openSurvey(page, name) {
  const d = makeTable(
    [
      ["Preferred route", "Campus"],
      ["Walk", "North"],
      ["Cycle", "South"],
    ],
    name,
  );
  const view = newView(d);
  const p = {
    ...fresh(),
    name,
    datasets: [d],
    active: d.id,
    confirmed: [d.id],
    views: [view, { ...view }],
  };
  const file = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await file
  ).setFiles({
    name: name + ".json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(
    page.getByRole("heading", { name: "Explore your data" }),
  ).toBeVisible();
}
async function savedVisual(page, name) {
  await button(page, "Save visual").click();
  await page.getByLabel("Visual name").fill(name);
  await button(page, "Save to project").click();
}
test("Home, browser Back and Forward and reopening the tab keep surveys and figures in distinct recent projects", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await openSurvey(page, "Student travel");
  await savedVisual(page, "Most common travel modes");
  await button(page, "Compare two views").click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Explore your data" }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.locator("#graphic1 svg")).toBeVisible();
  await button(page, "Home").click();
  const recent = page.locator("#coding-copies");
  await expect(recent).toContainText("Student travel");
  await openSurvey(page, "Campus survey");
  await button(page, "Home").click();
  await expect(recent.locator(".recent-project")).toHaveCount(2);
  await recent
    .locator(".recent-project")
    .filter({ hasText: "Student travel" })
    .getByRole("button", { name: "Resume project", exact: true })
    .click();
  await expect(page.locator("#graphic1 svg")).toBeVisible();
  await button(page, "Save and export").click();
  await expect(
    page.getByText("Most common travel modes", { exact: true }),
  ).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  const row = reopened
    .locator(".recent-project")
    .filter({ hasText: "Student travel" });
  await row
    .getByRole("button", { name: "Resume project", exact: true })
    .click();
  await expect(
    reopened
      .getByRole("heading", { name: "Save and export", exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    reopened.getByText("Most common travel modes", { exact: true }),
  ).toBeVisible();
});
test("refresh immediately after a survey edit restores the edit from Recent projects", async ({
  page,
}) => {
  await page.goto("/");
  await openSurvey(page, "Local travel");
  await savedVisual(page, "Immediate departure");
  await page.reload();
  await button(page, "Resume project").click();
  await button(page, "Save and export").click();
  await expect(
    page.getByText("Immediate departure", { exact: true }),
  ).toBeVisible();
});

test("Back immediately after importing a CSV keeps the data and returns to Check", async ({
  page,
}) => {
  await page.goto("/");
  const file = page.waitForEvent("filechooser");
  await button(page, "Upload Qualtrics export").click();
  await (
    await file
  ).setFiles({
    name: "Ferry survey.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Ticket,Campus\nDay,West\nWeek,East"),
  });
  await button(page, "Continue").click();
  await expect(button(page, "Confirm and explore")).toBeVisible();
  await page.goBack();
  const row = page
    .locator(".recent-project")
    .filter({ hasText: "Ferry survey" });
  await row
    .getByRole("button", { name: "Resume project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your upload" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Ticket", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/2 response records/)).toBeVisible();
});

test("the explicit device shortcut includes edits made after the manual save", async ({
  page,
}) => {
  await page.goto("/");
  await openSurvey(page, "Bicycle use");
  await button(page, "Save and export").click();
  await page.getByText("Other save options", { exact: true }).click();
  await button(page, "Save on this device").click();
  await button(page, "Explore").click();
  await savedVisual(page, "Later figure");
  await button(page, "Home").click();
  await button(page, "Resume on this device").click();
  await button(page, "Save and export").click();
  await expect(page.getByText("Later figure", { exact: true })).toBeVisible();
});

test("Back keeps an unsubmitted form open so that edits can be applied", async ({
  page,
}) => {
  await page.goto("/");
  await openSurvey(page, "Town routes");
  await button(page, "Save visual").click();
  await page.getByLabel("Visual name").fill("An unfinished name");
  await page.goBack();
  await expect(page.getByLabel("Visual name")).toHaveValue(
    "An unfinished name",
  );
  await button(page, "Save to project").click();
  await button(page, "Home").click();
  await button(page, "Resume project").click();
  await button(page, "Save and export").click();
  await expect(
    page.getByText("An unfinished name", { exact: true }),
  ).toBeVisible();
});

test("local recovery keeps the conversation while the default shared download omits it", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("**/ask", (route) =>
    route.fulfill({ json: { answer: "Use the number of survey responses." } }),
  );
  await page.goto("/");
  await openSurvey(page, "Campus travel");
  await button(page, "Data bot").click();
  await page.locator("#question").fill("What can I say about the sample size?");
  await button(page, "Send").click();
  await expect(page.locator(".chatlog .msg-assistant").last()).toBeVisible();
  await page.locator('[data-act="closebot"]').click();
  await button(page, "Home").click();
  await button(page, "Resume project").click();
  await button(page, "Data bot").click();
  await expect(page.locator(".chatlog")).toContainText(
    "What can I say about the sample size?",
  );
  await page.locator('[data-act="closebot"]').click();
  await button(page, "Save and export").click();
  const download = page.waitForEvent("download");
  await button(page, "Download project with data").click();
  const data = [];
  for await (const bytes of await (await download).createReadStream())
    data.push(bytes);
  const p = JSON.parse(Buffer.concat(data));
  expect(p.tutorHistory[p.active].messages).toBeUndefined();
});

test("an interview saved by the previous browser recovery format still appears on Home", async ({
  page,
}) => {
  await page.goto("/");
  const p = {
    ...fresh(),
    name: "Earlier interviews",
    active: "old",
    datasets: [
      {
        id: "old",
        name: "Earlier interviews",
        kind: "text",
        sources: ["Noor"],
        passages: [
          {
            id: "turn",
            source: "Noor",
            text: "The last bus was late.",
            codes: ["Delays"],
            reviewed: true,
          },
        ],
        coding: {
          book: [{ label: "Delays", definition: "Service delay" }],
          mode: "deductive",
        },
        interviews: {
          source: "Noor",
          done: [],
          method: "book",
          established: true,
        },
      },
    ],
    views: [{}, {}],
  };
  await page.evaluate(async (p) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("dv-interview-recovery", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["projects", "summaries"], "readwrite");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.objectStore("projects").put(p, "old-id");
      tx.objectStore("summaries").put(
        {
          id: "old-id",
          revision: 2,
          name: p.name,
          source: "Noor",
          saved: Date.now() - 1000,
        },
        "old-id",
      );
    });
    db.close();
  }, p);
  await page.reload();
  await button(page, "Resume coding project").click();
  await expect(page.locator(".iv-paper")).toContainText(
    "The last bus was late.",
  );
  await expect(page.locator(".iv-paper")).toContainText("Delays");
  await button(page, "Home").click();
  await expect(page.locator(".recent-project")).toHaveCount(1);
});
