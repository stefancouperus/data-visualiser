import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { corpus } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

test("passage percentages, supporting text and saved edits agree for manual and bot coding", async ({
  page,
}) => {
  const original = { text: "My rent rose.", codes: [], reviewed: true };
  const d = corpus(
    "Housing interviews",
    [
      { ...original, id: "north", source: "N" },
      {
        id: "quote",
        source: "N",
        parent: "north",
        start: 3,
        text: "rent",
        codes: ["Housing"],
        reviewed: true,
      },
      {
        ...original,
        id: "south",
        source: "S",
        codes: ["Housing"],
        codingEvidence: [{ code: "Housing", quote: "rent" }],
      },
    ],
    ["N", "S"],
  );
  d.coding = {
    mode: "deductive",
    book: [
      { label: "Housing", definition: "Housing costs" },
      { label: "Change", definition: "Change over time" },
    ],
  };
  d.interviews = {
    source: "N",
    done: ["N", "S"],
    method: "book",
    established: true,
    finished: true,
  };
  d.metadata = { N: { Region: "North" }, S: { Region: "South" } };
  const view = {
    ...newView(d),
    task: "patterns",
    items: ["Housing"],
    patternMode: "sources",
    groupBy: "Region",
    themeUnit: "passages",
    chart: "bars",
  };
  const project = {
    ...fresh(),
    active: d.id,
    datasets: [d],
    confirmed: [d.id],
    views: [view, { ...view }],
  };
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("**/ask", (route) =>
    route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "answer",
          explanation: "The selected quotation mentions rent.",
        }),
      },
    }),
  );
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await button("Open a saved project").click();
  await (
    await chooser
  ).setFiles({
    name: "comparison.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const chart = page.locator("#graphic0");
  for (const group of ["North", "South"]) {
    await expect(chart).toContainText(group + " — 100% (1 of 1)");
    await button("Read evidence: Housing · " + group).click();
    await expect(page.getByRole("dialog")).toContainText(
      "1 of 1 original passages contained this theme",
    );
    await expect(
      page.getByRole("cell", { name: "My rent rose.", exact: true }),
    ).toHaveCount(1);
    await button("Close").click();
  }
  await button("Read and code passages").click();
  await expect(page.locator("#passlist")).toContainText("2 matching passages");
  const parentRow = page.locator(".excerpt").filter({
    has: page.locator('[name=pickp][value="north"]'),
  });
  await expect(parentRow.locator("small")).toHaveText("Housing");
  await parentRow.getByRole("checkbox").check();
  const parentSent = page.waitForRequest((req) => req.url().endsWith("/ask"));
  await button("Discuss selected passages").click();
  expect((await parentSent).postDataJSON().context.passages).toEqual([
    { id: "north", source: "N", text: "My rent rose.", codes: ["Housing"] },
  ]);
  await expect(page.locator(".chatlog")).toContainText(
    "The selected quotation mentions rent.",
  );
  await page.locator('[data-act="closebot"]').click();
  await button("Read and code passages").click();
  await page.locator('[data-passage-text="north"]').evaluate((el) => {
    const r = document.createRange();
    r.setStart(el.firstChild, 3);
    r.setEnd(el.firstChild, 7);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(r);
  });
  await button("Use highlighted words as a passage").click();
  await expect(page.locator('[name=pickp][value="quote"]')).toBeChecked();
  await expect(page.locator("#passlist")).toContainText("2 matching passages");
  const sent = page.waitForRequest((req) => req.url().endsWith("/ask"));
  await button("Discuss selected passages").click();
  expect((await sent).postDataJSON().context.passages).toEqual([
    { id: "quote", source: "N", text: "rent", codes: ["Housing"] },
  ]);
  await expect(page.locator(".chatlog")).toContainText(
    "The selected quotation mentions rent.",
  );
  await page.locator('[data-act="closebot"]').click();
  await button("Read and code passages").click();
  // The displayed unit includes codes from highlights; editing a whole unit
  // must still update its original stored passage.
  await page.locator('[name=pickp][value="north"]').check();
  await page.locator("#applycode").selectOption("Change");
  await button("Mark reviewed / apply code").click();
  const downloaded = page.waitForEvent("download");
  await button("Save coding project").click();
  const chunks = [];
  for await (const chunk of await (await downloaded).createReadStream())
    chunks.push(chunk);
  const saved = JSON.parse(Buffer.concat(chunks)).datasets[0];
  expect(saved.passages.map((p) => [p.id, p.codes])).toEqual([
    ["north", ["Change"]],
    ["quote", ["Housing"]],
    ["south", ["Housing"]],
  ]);
});
