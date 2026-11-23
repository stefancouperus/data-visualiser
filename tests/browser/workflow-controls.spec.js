import { test, expect } from "@playwright/test";

const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });

async function upload(page, action, name, contents) {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await button(page, action).click();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(contents),
  });
}

test("each visual keeps its own evidence action, and its read-only dialogue has one exit", async ({
  page,
}) => {
  await upload(
    page,
    "Upload Qualtrics export",
    "survey.csv",
    "StartDate,EndDate,Q1\nStart Date,End Date,Which method did you choose?\n2026,2026,Interview\n2026,2026,Survey",
  );
  await button(page, "Confirm and explore").click();
  await button(
    page.locator(".live-figure"),
    "Read underlying responses",
  ).click();
  const dialog = page.getByRole("dialog", { name: "Underlying responses" });
  await expect(dialog).toContainText("Interview");
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await button(dialog, "Close").click();
  await button(page, "Compare two views").click();
  for (const figure of await page.locator(".live-figure").all()) {
    await expect(button(figure, "Read underlying responses")).toBeVisible();
    await expect(button(figure, "Ask about this visual")).toBeVisible();
  }
  await button(page, "Save and export").click();
  await expect(
    button(
      page.getByRole("region", { name: "Export a figure" }),
      "Preview figure",
    ),
  ).toBeVisible();
});

test("on a narrow screen, the long codebook scrolls independently of its approval and close buttons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await upload(
    page,
    "Upload uncoded transcripts",
    "Interview.txt",
    "The conversation lasted an hour.",
  );
  await button(page, "Enter labels manually").click();
  const dialog = page.getByRole("dialog");
  const fields = dialog.locator("[data-label]");
  for (let i = 0; i < 9; i++) {
    if (i) await button(dialog, "Add label").click();
    await fields.last().fill("Label " + (i + 1));
  }
  await dialog.locator(".dialog-body").evaluate((body) => {
    body.scrollTop = 0;
  });
  const footer = dialog.locator(".dialog-footer");
  await expect(button(footer, "Use these labels")).toBeInViewport();
  await expect(button(footer, "Close")).toBeInViewport();
  await button(footer, "Use these labels").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".iv-project-vocabulary")).toContainText("Label 9");
});
