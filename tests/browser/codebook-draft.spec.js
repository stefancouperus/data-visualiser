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
async function upload(page) {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.goto("/");
  const choose = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Upload uncoded transcripts/ })
    .click();
  await (
    await choose
  ).setFiles(
    file("Travel.txt", "Mijn trein was te laat. Een taxi kostte meer."),
  );
}
async function savedProject(page) {
  const pending = page.waitForEvent("download");
  await button(page, "Save coding project").click();
  const chunks = [];
  for await (const chunk of await (await pending).createReadStream())
    chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks));
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
  const backup = await savedProject(page);
  const draft = backup.datasets[0].coding.bookDraft;
  expect(draft.name).toBe("Codes.txt");
  expect(draft.entries.map((e) => e.label)).toEqual(["Delay", "Cost"]);
  expect(backup.datasets[0].coding.book).toBeUndefined();
  await page.reload();
  await button(page, "Resume coding project").click();
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
