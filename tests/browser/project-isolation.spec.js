import { expect, test } from "@playwright/test";
import { newView } from "../../src/analysis.js";
import { makeTable } from "../../src/import.js";
import { fresh } from "../../src/project.js";
import { backupContents } from "./backup-helpers.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const qsf = {
  SurveyElements: [
    {
      Element: "SQ",
      Payload: {
        QuestionID: "QID1",
        DataExportTag: "Q1",
        QuestionType: "MC",
        Selector: "SAVR",
        QuestionText: "Project A only",
        Choices: { 1: { Display: "Yes" }, 2: { Display: "No" } },
      },
    },
  ],
};

function survey(name) {
  const d = makeTable(
    [
      ["Q1", "Cohort"],
      ["1", "East"],
      ["2", "West"],
    ],
    name,
  );
  const v = newView(d);
  return {
    ...fresh(),
    name,
    datasets: [d],
    active: d.id,
    confirmed: [d.id],
    views: [v, structuredClone(v)],
  };
}
async function selectFile(page, label, name, contents) {
  const chooser = page.waitForEvent("filechooser");
  await button(page, label).click();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(contents)),
  });
}
async function open(page, p) {
  await selectFile(page, "Open a saved project", p.name + ".json", p);
  await expect(page.locator(".project-path")).toContainText(p.name);
}
async function holdRead(page, name, method) {
  await page.evaluate(
    ({ name, method }) => {
      const original = File.prototype[method];
      File.prototype[method] = async function (...args) {
        if (this.name === name) {
          await new Promise((resolve) => {
            window.releaseFileRead = resolve;
          });
        }
        return original.apply(this, args);
      };
    },
    { name, method },
  );
}
async function exportedProject(page) {
  await button(page, "Save and export").click();
  const ready = page.waitForEvent("download");
  await button(page, "Download project with data").click();
  const chunks = [];
  for await (const bytes of await (await ready).createReadStream())
    chunks.push(bytes);
  return backupContents(Buffer.concat(chunks));
}

test("a questionnaire that finishes after switching projects cannot offer to copy the old respondents", async ({
  page,
}) => {
  await page.goto("/");
  const a = survey("Survey A"),
    b = survey("Survey B");
  await open(page, a);
  await button(page, "Check").click();
  await page
    .getByText("Seeing question codes or numbers instead of answer text?")
    .click();
  await holdRead(page, "slow.qsf", "text");
  await selectFile(page, "Add questionnaire labels", "slow.qsf", qsf);
  await page.waitForFunction(() => window.releaseFileRead);
  await button(page, "Home").click();
  await open(page, b);
  await page.evaluate(async () => {
    window.releaseFileRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  const data = await exportedProject(page);
  expect(data.datasets.map((d) => d.id)).toEqual([b.active]);
  expect(JSON.stringify(data)).not.toContain("Survey A");
});

test("a different project in the same browser returns the first tab to Home with its own saved work", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const a = survey("Harbours"),
    b = survey("Libraries");
  await open(page, a);
  await button(page, "Save visual").click();
  await page.getByLabel("Visual name").fill("Harbour responses");
  await button(page, "Save to project").click();
  const second = await context.newPage();
  await second.goto("/");
  await expect(button(page, "Save visual")).toBeVisible(); // Home alone makes no claim.
  await open(second, b);
  await expect(button(page, "Open a saved project")).toBeVisible();
  await expect(button(page, "Save visual")).toBeHidden();
  await expect(second.locator(".project-path")).toContainText("Libraries");
  await page.evaluate(() => window.history.back());
  await expect(page.locator("main h1")).toHaveText("Data visualiser");
  const aCopy = page.locator(".recent-project").filter({ hasText: "Harbours" });
  await button(aCopy, "Resume project").click();
  await expect(page.locator(".project-path")).toContainText("Harbours");
  await expect(second.locator("main h1")).toHaveText("Data visualiser");
  const restored = await exportedProject(page);
  expect(restored.savedVisuals.map((v) => v.name)).toContain(
    "Harbour responses",
  );
  expect(restored.datasets.map((d) => d.id)).toEqual([a.active]);
  const claim = await second.evaluate(() =>
    JSON.parse(localStorage.getItem("dv-active-project")),
  );
  expect(Object.keys(claim).sort()).toEqual(["id", "nonce", "time"]);
});

test("a delayed project open in another tab cannot reclaim the workspace", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const second = await context.newPage();
  await second.goto("/");
  await holdRead(page, "slow.json", "arrayBuffer");
  await selectFile(
    page,
    "Open a saved project",
    "slow.json",
    survey("Old request"),
  );
  await page.waitForFunction(() => window.releaseFileRead);
  await open(second, survey("Current project"));
  await page.evaluate(async () => {
    window.releaseFileRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page.locator("main h1")).toHaveText("Data visualiser");
  await expect(second.locator(".project-path")).toContainText(
    "Current project",
  );
});

test("opening a second project wins even if the first project file finishes last", async ({
  page,
}) => {
  await page.goto("/");
  await holdRead(page, "slow.json", "arrayBuffer");
  await selectFile(
    page,
    "Open a saved project",
    "slow.json",
    survey("Slow survey"),
  );
  await page.waitForFunction(() => window.releaseFileRead);
  await open(page, survey("Chosen survey"));
  await page.evaluate(async () => {
    window.releaseFileRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".project-path")).toContainText("Chosen survey");
});

test("an old confirmation cannot apply file contents after a project switch", async ({
  page,
}) => {
  await page.goto("/");
  const a = survey("First survey"),
    b = survey("Selected survey");
  await open(page, a);
  await button(page, "Check").click();
  await page
    .getByText("Seeing question codes or numbers instead of answer text?")
    .click();
  await selectFile(page, "Add questionnaire labels", "questions.qsf", qsf);
  await expect(button(page, "Use these labels")).toBeVisible();
  await page.evaluate(() => {
    const form = document.querySelector("#modalform");
    window.confirmLate = () => form.requestSubmit();
    // Retain the previous form as a queued callback would, across the switch.
    document.querySelector("#closeDialog").click();
  });
  await button(page, "Home").click();
  await open(page, b);
  await page.evaluate(() => window.confirmLate());
  expect((await exportedProject(page)).datasets.map((d) => d.id)).toEqual([
    b.active,
  ]);
});

test("a fresh survey upload wins over an older project file being read on Home", async ({
  page,
}) => {
  await page.goto("/");
  await holdRead(page, "slow.json", "arrayBuffer");
  await selectFile(
    page,
    "Open a saved project",
    "slow.json",
    survey("Old project"),
  );
  await page.waitForFunction(() => window.releaseFileRead);
  const chooser = page.waitForEvent("filechooser");
  await button(page, "Upload Qualtrics export").click();
  await (
    await chooser
  ).setFiles({
    name: "New survey.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "StartDate,EndDate,Q1\nStart Date,End Date,Satisfaction?\nToday,Today,Yes",
    ),
  });
  await expect(page.locator(".project-path")).toContainText("New survey");
  await page.evaluate(async () => {
    window.releaseFileRead();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".project-path")).toContainText("New survey");
});

test("a pending chat and its research focus cannot follow the student into another project", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.goto("/");
  const a = survey("First project"),
    b = survey("Second project");
  a.researchFocus = "Original project only";
  await open(page, a);
  const oldPrompt = "Tell me about the original project sample";
  let started;
  const pending = new Promise((resolve) => {
    started = resolve;
  });
  await page.route("**/ask", (route) => started(route), { times: 1 });
  await button(page, "Data bot").click();
  await page.locator("#question").fill(oldPrompt);
  await button(page, "Send").click();
  const oldReply = await pending;
  await button(page, "Home").click();
  await open(page, b);
  await expect(page.locator("#data-bot")).toBeHidden();
  await button(page, "Data bot").click();
  await expect(page.locator("#puzzle-field")).toHaveValue("");
  await expect(page.locator(".chatlog")).not.toContainText(oldPrompt);
  await expect(button(page, "Send")).toBeEnabled();
  const payloads = [];
  await page.route("**/ask", (route) => {
    payloads.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "answer",
          explanation: "Second project reply.",
        }),
      },
    });
  });
  await page.locator("#question").fill("What do these responses show?");
  await button(page, "Send").click();
  await expect(page.locator(".msg-assistant")).toHaveCount(1);
  await expect(button(page, "Send")).toBeEnabled();
  expect(payloads).toHaveLength(1);
  await oldReply.fulfill({ json: { answer: "Reply from first project" } });
  await expect(page.locator(".chatlog")).not.toContainText(
    "Reply from first project",
  );
  expect(JSON.stringify(payloads)).not.toContain("Original project only");
  expect(JSON.stringify(payloads)).not.toContain(oldPrompt);
});
