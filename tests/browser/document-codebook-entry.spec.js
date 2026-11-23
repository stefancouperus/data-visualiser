import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { corpus, texts } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });

async function openDocuments(page, openAnswers = false, withBook = true) {
  const data = corpus(
    "Documents",
    [
      ...texts("First", ["I learned to swim."]),
      ...texts("Second", ["We took the bus."]),
    ],
    ["First", "Second"],
  );
  data.textPurpose = "documents";
  if (withBook)
    data.coding = {
      mode: "deductive",
      book: [{ label: "Travel", definition: "Making a journey" }],
      bookName: "Codebook.txt",
    };
  if (openAnswers) {
    data.unit = "respondent";
    data.openAnswers = {
      question: "How did you travel?",
      answered: 2,
      eligible: 2,
    };
  }
  const view = newView(data);
  const project = {
    ...fresh(),
    datasets: [data],
    active: data.id,
    confirmed: [data.id],
    views: [view, structuredClone(view)],
  };
  await page.goto("/");
  const file = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await file
  ).setFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await button(
    page,
    openAnswers ? "Read and code written answers" : "Read and code passages",
  ).click();
}

test("a codebook in the documents view can be applied to chosen transcripts", async ({
  page,
}) => {
  const requests = [];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: { answer: JSON.stringify({ suggestions: [] }) },
    });
  });
  await openDocuments(page);
  const modal = page.getByRole("dialog");
  const apply = button(modal, "Apply codebook to interviews");
  await expect(apply).toBeVisible();
  // Editing the book hides the action until the revised vocabulary is approved.
  await page.getByText("Code with the Data bot", { exact: true }).click();
  await button(modal, "Review approved labels").click();
  await expect(apply).toBeHidden();
  await modal.locator("[data-label]").fill("Transport");
  await button(modal, "Use these labels").click();
  await expect(apply).toBeFocused();
  await apply.click();
  await expect(
    modal.getByRole("heading", { name: "Apply codebook to interviews" }),
  ).toBeVisible();
  await modal
    .getByLabel("Which interviews should the bot use?")
    .selectOption("selected");
  await modal.getByLabel("First", { exact: true }).uncheck();
  await modal.getByLabel("Second", { exact: true }).check();
  expect(requests).toEqual([]);
  await button(modal, "Send to bot for coding").click();
  await expect.poll(() => requests.length).toBe(1);
  const [{ context }] = requests;
  expect(context.passages.map((p) => p.text)).toEqual(["We took the bus."]);
  expect(context.guide.vocabulary.map((entry) => entry.label)).toEqual([
    "Transport",
  ]);
});

test("written survey answers retain passage coding and have no interview action", async ({
  page,
}) => {
  await openDocuments(page, true);
  await expect(
    page.getByRole("button", { name: /Apply codebook to interview/ }),
  ).toHaveCount(0);
  await page.getByText("Code with the Data bot", { exact: true }).click();
  await expect(
    button(page, "Suggest codes for selected passages"),
  ).toBeEnabled();
});

test("a document codebook stays visible outside the passage reader and survives a refresh before and after approval", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  const calls = [];
  await page.route("https://tutor.example.test/ask", (route) => {
    calls.push(route.request().postDataJSON().skill);
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          entries: [{ label: "Travel", definition: "Making a journey" }],
        }),
      },
    });
  });
  await openDocuments(page, false, false);
  const modal = page.getByRole("dialog");
  await modal.getByText("Code with the Data bot", { exact: true }).click();
  await modal.locator("#coding-method").selectOption("deductive");
  await modal
    .locator("#book-file")
    .setInputFiles({
      name: "Book.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Travel: Making a journey"),
    });
  await button(modal, "Extract labels").click();
  await expect(modal.locator("[data-label]")).toHaveValue("Travel");
  await modal.locator("[data-label]").fill("Travel decisions");
  await button(modal, "Close").click();
  const panel = page.locator("#document-codebook");
  await expect(panel).toContainText("Draft labels to review");
  await expect(panel).toContainText("Travel decisions");

  async function recover() {
    await page.reload();
    await button(page, "Resume coding project").click();
  }
  await recover();
  await expect(panel).toContainText("Travel decisions");
  await button(page, "Read and code passages").click();
  // A saved, unapproved document codebook reopens in the deductive editor.
  if (!(await modal.locator("[data-label]").isVisible()))
    await modal.getByText("Code with the Data bot", { exact: true }).click();
  await expect(modal.locator("[data-label]")).toHaveValue("Travel decisions");
  await button(modal, "Use these labels").click();
  await expect(modal.locator("#applycode")).toHaveJSProperty(
    "tagName",
    "SELECT",
  );
  await expect(modal.locator("#applycode option")).toHaveText([
    "Choose an approved label",
    "Travel decisions",
  ]);
  await button(modal, "Close").click();
  await expect(panel).toContainText("Approved labels");
  await expect(panel).not.toContainText("Draft labels to review");
  await recover();
  await expect(panel).toContainText("Travel decisions");
  await button(panel, "Use the interview coding workspace").click();
  await expect(button(page, "Code manually")).toBeEnabled();
  await expect(button(page, "Code with the bot")).toBeEnabled();
  expect(calls).toEqual(["codebook"]);
});
