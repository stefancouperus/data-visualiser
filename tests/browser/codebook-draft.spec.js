import { backupContents, openBackup } from "./backup-helpers.js";
import { test, expect } from "@playwright/test";

const requestUrl = "https://tutor.example.test/ask";
const button = (page, name) => page.getByRole("button", { name, exact: true });
const file = (name, text) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});
const sampleBook =
  "Disruption: An unexpected change of plan.\nCost: Financial impact.";
const entries = [
  { label: "Disruption", definition: "An unexpected change of plan." },
  { label: "Cost", definition: "Financial impact." },
];
async function upload(
  page,
  transcript = "Mijn trein was te laat. Een taxi kostte meer.",
) {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.goto("/");
  const choose = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Upload uncoded transcripts/ })
    .click();
  await (await choose).setFiles(file("Travel.txt", transcript));
}
async function savedProject(page, asFile = false) {
  const pending = page.waitForEvent("download");
  await button(page, "Save coding project").click();
  const chunks = [];
  for await (const chunk of await (await pending).createReadStream())
    chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  return asFile ? bytes : backupContents(bytes);
}

test("extraction finishes after closing, drafts survive recovery and approval exposes the exact edited labels", async ({
  page,
}) => {
  await upload(page);
  let finish;
  const received = new Promise((resolve) => {
    finish = resolve;
  });
  await page.route(requestUrl, finish, { times: 1 });
  await page.locator("[data-act=iv-book]").click();
  await page.locator("#book-file").setInputFiles(file("Codes.txt", sampleBook));
  await button(page, "Extract labels").click();
  const request = await received;
  await button(page, "Close").click();
  await request.fulfill({
    json: {
      answer: JSON.stringify({
        entries: [
          ...entries,
          entries[0],
          { label: "Hallucinated", definition: "Missing from the file" },
        ],
      }),
    },
  });
  const sidebar = page.locator(".iv-tools");
  await expect(sidebar).toContainText("Draft labels to review");
  await expect(sidebar).toContainText("Disruption");
  await expect(sidebar).toContainText("Financial impact");
  await expect(sidebar).not.toContainText("Hallucinated");
  await page.locator("[data-act=iv-reviewbook]").click();
  await expect(page.locator("[data-label]")).toHaveCount(2);
  await page.locator("[data-label]").first().fill("Delay");
  await page.keyboard.press("Escape");
  await expect(sidebar).toContainText("Delay");
  const archive = await savedProject(page, true);
  const backup = backupContents(archive);
  const draft = backup.datasets[0].coding.bookDraft;
  expect(draft.name).toBe("Codes.txt");
  expect(draft.entries.map((e) => e.label)).toEqual(["Delay", "Cost"]);
  expect(backup.datasets[0].coding.book).toBeUndefined();
  await page.reload();
  await openBackup(page, archive);
  await expect(sidebar).toContainText("Delay");
  await page.locator("[data-act=iv-reviewbook]").click();
  await expect(page.locator("#book-original pre")).toHaveText(sampleBook);
  await button(page, "Use these labels").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(sidebar).toContainText("Approved project labels");
  const approved = (await savedProject(page)).datasets[0].coding;
  expect(approved.book.map((e) => e.label)).toEqual(["Delay", "Cost"]);
  expect(approved.bookDraft).toBeUndefined();
});

test("manual entry works without a bot session and identifies blank and duplicate rows beside the input", async ({
  page,
}) => {
  await upload(page);
  await page.evaluate(() => sessionStorage.clear());
  const sent = [];
  page.on("request", (r) => {
    if (r.url() === requestUrl) sent.push(r);
  });
  await page.locator("[data-act=iv-enterbook]").click();
  await button(page, "Use these labels").click();
  const fields = page.locator("[data-label]");
  await expect(fields.first()).toBeFocused();
  await expect(page.locator(".book-row-error")).toHaveText(
    /Give each entry a label/,
  );
  await fields.first().fill("Delay");
  await button(page, "Add label").click();
  await fields.last().fill("  delay  ");
  await button(page, "Use these labels").click();
  await expect(fields.last()).toBeFocused();
  await expect(page.locator(".book-row-error")).toHaveText(/duplicate/);
  await fields.last().fill("Costs");
  await button(page, "Close").click();
  await expect(page.locator(".iv-tools")).toContainText("Costs");
  await page.locator("[data-act=iv-reviewbook]").click();
  await button(page, "Use these labels").click();
  const dataset = (await savedProject(page)).datasets[0];
  expect(dataset.coding.book.map((e) => e.label)).toEqual(["Delay", "Costs"]);
  expect(dataset.passages.every((p) => !p.codes.length)).toBe(true);
  expect(sent).toHaveLength(0);
});

test("reopening an in-flight extraction shows the same job and receives its result", async ({
  page,
}) => {
  await upload(page);
  let finish;
  const received = new Promise((resolve) => {
    finish = resolve;
  });
  await page.route(requestUrl, finish, { times: 1 });
  await page.locator("[data-act=iv-book]").click();
  await page.locator("#book-file").setInputFiles(file("Guide.txt", sampleBook));
  await button(page, "Extract labels").click();
  const request = await received;
  await button(page, "Close").click();
  await page.locator("[data-act=iv-book]").click();
  await expect(page.locator("#book-status")).toHaveText(/Extracting labels/);
  await expect(button(page, "Extract labels")).toBeDisabled();
  await request.fulfill({ json: { answer: JSON.stringify({ entries }) } });
  await expect(page.locator("[data-label]")).toHaveCount(2);
  await button(page, "Discard draft").click();
  await button(page, "Close").click();
  expect(
    (await savedProject(page)).datasets[0].coding.bookDraft,
  ).toBeUndefined();
});

test("category-based codebooks keep two same-named labels distinct from draft through approved coding and ZIP restore", async ({
  page,
}) => {
  const transcript = "The newsletter is sent monthly.";
  await upload(page, transcript);
  const calls = [];
  const rows = [
    {
      category: "Committee meetings",
      label: "Monthly",
      definition: "Meeting every month.",
    },
    {
      category: "Committee meetings",
      label: "Weekly",
      definition: "Meeting every week.",
    },
    {
      category: "Newsletters",
      label: "Monthly",
      definition: "Newsletter sent every month.",
    },
  ];
  await page.route(requestUrl, async (route) => {
    const { skill, context } = route.request().postDataJSON();
    if (skill === "codebook") {
      await route.fulfill({
        json: { answer: JSON.stringify({ entries: rows }) },
      });
      return;
    }
    calls.push(context.guide);
    const entry = context.guide.vocabulary.find(
      (e) => e.category === "Newsletters",
    );
    await route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: [
            {
              id: context.passages[0].id,
              code: entry.label,
              reason: "Newsletter schedule",
              quote: "sent monthly",
            },
          ],
        }),
      },
    });
  });
  await page.locator("[data-act=iv-book]").click();
  const csv = [
    "Category,Label,Definition",
    ...rows.map((e) => [e.category, e.label, e.definition].join(",")),
  ].join("\n");
  await page.locator("#book-file").setInputFiles({
    name: "Handbook.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await button(page, "Extract labels").click();
  const categories = page.locator("#book-rows details.book-category");
  await expect(categories).toHaveCount(2);
  await expect(categories.first().locator("summary")).toHaveText(
    "Committee meetings · 2 labels",
  );
  await expect(categories.last().locator("summary")).toHaveText(
    "Newsletters · 1 label",
  );
  await categories.first().getByLabel("Category name").fill("Meetings");
  await categories
    .first()
    .getByLabel("Meaning and rules")
    .first()
    .fill("The group meets every month.");
  const weekly = categories.first().locator(".book-row").nth(1);
  await weekly.getByRole("button", { name: "Move label", exact: true }).click();
  await weekly
    .getByLabel("Move to category")
    .selectOption({ label: "Newsletters" });
  await button(page, "Close").click();
  const sidebar = page.locator(".iv-tools");
  await expect(sidebar).toContainText("Meetings · 1 label");
  await expect(sidebar).toContainText("Newsletters · 2 labels");
  const draft = await savedProject(page, true);
  await page.reload();
  await openBackup(page, draft);
  await page.locator("[data-act=iv-reviewbook]").click();
  await expect(categories.first().getByLabel("Category name")).toHaveValue(
    "Meetings",
  );
  await expect(
    categories.first().getByLabel("Meaning and rules").first(),
  ).toHaveValue("The group meets every month.");
  await button(page, "Use these labels").click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const approved = (await savedProject(page)).datasets[0].coding;
  const monthlies = approved.book.filter((e) => e.sourceLabel === "Monthly");
  expect(monthlies).toHaveLength(2);
  expect(new Set(monthlies.map((e) => e.label)).size).toBe(2);
  expect(monthlies.map((e) => e.category)).toEqual(["Meetings", "Newsletters"]);
  expect(approved.categories).toEqual(["Meetings", "Newsletters"]);
  expect(approved.book.find((e) => e.label === "Weekly")).toEqual({
    label: "Weekly",
    definition: "Meeting every week.",
    category: "Newsletters",
  });
  for (const entry of approved.book)
    expect(
      approved.labelStyles.find((s) => s.label === entry.label).category,
    ).toBe(entry.category);

  await button(page, "Code with the bot").click();
  await button(page, "Send to bot for coding").click();
  await button(page, "Review suggested coding").click();
  await button(page, "Apply reviewed coding").click();
  const final = (await savedProject(page)).datasets[0];
  expect(calls).toHaveLength(1);
  expect(calls[0].vocabulary.map((e) => e.label)).toEqual(
    approved.book.map((e) => e.label),
  );
  expect(final.passages.find((p) => p.text === transcript).codes).toEqual([
    monthlies.find((e) => e.category === "Newsletters").label,
  ]);
});
