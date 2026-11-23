import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { corpus, texts } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });

async function openDocuments(page, openAnswers = false) {
  const data = corpus(
    "Documents",
    [
      ...texts("First", ["I learned to swim."]),
      ...texts("Second", ["We took the bus."]),
    ],
    ["First", "Second"],
  );
  data.textPurpose = "documents";
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
