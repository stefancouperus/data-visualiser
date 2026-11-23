import { backupContents, openBackup } from "./backup-helpers.js";
import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { corpus, texts } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const text = [
  "The bus fare rose and the last bus was late.",
  "I usually walk or cycle in the sunshine.",
  "My fare went up this month.",
  "We talked about the fare.",
  "I can afford the fare now.",
  "The fare varies between towns.",
  "Today the bus was late.",
];
function seed() {
  const d = corpus("Journeys", texts("North", text), ["North"]);
  d.coding = {
    mode: "deductive",
    book: [
      { label: "Fares", definition: "Travel costs" },
      { label: "Delays", definition: "Late service" },
    ],
  };
  return {
    ...fresh(),
    name: "Journey interviews",
    active: d.id,
    datasets: [d],
    views: [newView(d), newView(d)],
  };
}
async function openFile(page, data) {
  const picker = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Open a saved project", exact: true })
    .click();
  await (
    await picker
  ).setFiles({
    name: "interviews.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
test("interview recovery checkpoints a failed batch, reviewer decisions and manual additions", async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  const batches = [];
  await page.route("https://tutor.example.test/ask", (route) => {
    const passages = route.request().postDataJSON().context.passages;
    batches.push(passages.map((p) => p.text));
    if (batches.length === 2)
      return route.fulfill({ status: 503, json: { error: "Service busy" } });
    const suggestions = passages.flatMap((p) =>
      p.text.includes("fare")
        ? [{ id: p.id, code: "Fares", quote: "fare", reason: "Travel cost" }]
        : [],
    );
    return route.fulfill({ json: { answer: JSON.stringify({ suggestions }) } });
  });
  await page.goto("/");
  await openFile(page, seed());
  await button(page, "Code with the bot").click();
  await button(page, "Send to bot for coding").click();
  await expect(button(page, "Resume coding")).toBeVisible();
  await expect(page.locator(".iv-review")).toContainText("1 of 2");
  await page.reload();
  await button(page, "Resume coding project").click();
  await button(page, "Resume coding").click();
  await button(page, "Send to bot for coding").click();
  await button(page, "Review suggested coding").click();
  expect(batches.map((ps) => ps.length)).toEqual([6, 1, 1]);
  const first = page.locator(".iv-review-passage").first();
  await first.locator("summary").click();
  await expect(first.locator("blockquote")).toHaveText(text[0]);
  await first.getByRole("checkbox", { name: "Delays", exact: true }).check();
  await page.locator("[name=iv-match]").nth(1).uncheck();
  await expect(page.locator("dialog [data-iv-storage]")).toHaveText(
    "Coding progress saved on this device.",
  );
  await button(page, "Close").click();
  const download = page.waitForEvent("download");
  await button(page, "Save coding project").click();
  const bytes = [];
  for await (const c of await (await download).createReadStream())
    bytes.push(c);
  const portable = backupContents(Buffer.concat(bytes));
  await page.reload();
  await openBackup(page, Buffer.concat(bytes));
  await button(page, "Review suggested coding").click();
  await expect(page.locator("[name=iv-match]").nth(1)).not.toBeChecked();
  await first.locator("summary").click();
  await expect(
    first.getByRole("checkbox", { name: "Delays", exact: true }),
  ).toBeChecked();
  const other = await browser.newPage();
  try {
    await other.goto("/");
    await openFile(other, portable);
    await button(other, "Review suggested coding").click();
    await expect(other.locator("[name=iv-match]").nth(1)).not.toBeChecked();
    await button(other, "Apply reviewed coding").click();
    await expect(
      other.locator(".iv-passage").first().locator(":scope > div > .iv-chip"),
    ).toHaveText(["Fares", "Delays"]);
    await expect(
      other.locator(".iv-passage").nth(2).locator(".iv-chip"),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
  await button(page, "Apply reviewed coding").click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.reload();
  await button(page, "Resume coding project").click();
  await expect(button(page, "Review suggested coding")).toHaveCount(0);
  await expect(
    page.locator(".iv-passage").first().locator(":scope > div > .iv-chip"),
  ).toHaveText(["Fares", "Delays"]);
  await button(page, "Home").click();
  await button(page, "Remove recovery copy").click();
  await button(page, "Remove copy").click();
  await expect(button(page, "Resume coding project")).toHaveCount(0);
});
test("blocked browser recovery storage gives an actionable message and leaves portable coding available", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw Error("Storage blocked");
      },
    }),
  );
  await page.goto("/");
  await openFile(page, seed());
  await button(page, "Edit labels on selected text").click();
  await page.getByRole("checkbox", { name: "Delays", exact: true }).check();
  await button(page, "Save passage coding").click();
  await expect(page.locator("[data-iv-storage]")).toContainText(
    "Download your coding project",
  );
  const download = page.waitForEvent("download");
  await button(page, "Save coding project").click();
  const bytes = [];
  for await (const c of await (await download).createReadStream())
    bytes.push(c);
  expect(
    backupContents(Buffer.concat(bytes)).datasets[0].passages[0].codes,
  ).toEqual(["Delays"]);
});

test("two tabs editing one recovery revision preserve both versions", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await openFile(page, seed());
  async function edit(tab, idx, label) {
    await tab.locator("[data-act=iv-select]").nth(idx).click();
    await button(tab, "Edit labels on selected text").click();
    await tab.getByRole("checkbox", { name: label, exact: true }).check();
    await button(tab, "Save passage coding").click();
    await expect(tab.locator("[data-iv-storage]")).toHaveText(
      "Coding progress saved on this device.",
    );
  }
  await edit(page, 0, "Fares");
  const other = await context.newPage();
  await other.goto("/");
  const originalId = await button(other, "Resume coding project").getAttribute(
    "data-copy",
  );
  await button(other, "Resume coding project").click();
  await edit(page, 1, "Fares");
  await edit(other, 2, "Delays");
  await page.reload();
  await expect(button(page, "Resume coding project")).toHaveCount(2);
  const ids = await button(page, "Resume coding project").evaluateAll(
    (buttons) => buttons.map((button) => button.dataset.copy),
  );
  const fork = ids.find((id) => id !== originalId);
  for (const [id, labels] of [
    [fork, ["Fares", "Delays"]],
    [originalId, ["Fares", "Fares"]],
  ]) {
    await page
      .locator('[data-act="recoverCoding"][data-copy="' + id + '"]')
      .click();
    if (id === originalId) {
      const switchDialog = page.getByRole("dialog", {
        name: "Switch projects?",
      });
      await switchDialog
        .getByRole("button", { name: "Resume coding project", exact: true })
        .click();
    }
    await expect(page.locator(".iv-passage > div > .iv-chip")).toHaveText(
      labels,
    );
    await button(page, "Upload").click();
  }
});
