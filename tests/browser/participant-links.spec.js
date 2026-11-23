import { expect, test } from "@playwright/test";
import { newView } from "../../src/analysis.js";
import { corpus, makeTable, texts } from "../../src/import.js";
import { fresh } from "../../src/project.js";
import { backupContents, openBackup } from "./backup-helpers.js";

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function reviewMatches(page) {
  await button(page, "Code interviews").click();
  await page
    .getByText("Import details and source information", { exact: true })
    .click();
  await button(page, "Link source information").click();
  await button(page, "Continue").click();
  await button(page, "Continue").click();
}

test("unmatching a previously linked participant changes the chart and the reopened ZIP", async ({
  page,
  browser,
}) => {
  const sources = ["Dee", "Lee"];
  const d = corpus(
    "Access",
    sources.flatMap((s) => texts(s, ["The fare rose."])),
    sources,
  );
  for (const p of d.passages) {
    p.reviewed = true;
    p.codes = ["Cost"];
  }
  d.coding = {
    book: [{ label: "Cost", definition: "Travel costs" }],
    mode: "deductive",
  };
  d.interviews = {
    source: "Dee",
    method: "book",
    established: true,
    done: [...sources],
    finished: true,
  };
  delete d.participantLinks; // Shape saved by versions before link provenance.
  d.metadata = {
    Dee: { Site: "East", Programme: "History" },
    Lee: { Site: "West" },
  };
  const table = makeTable(
    [
      ["Person", "Site"],
      ["Dee", "East"],
      ["L02", "West"],
    ],
    "Participants",
  );
  table.purpose = "participant-information";
  const view = {
    ...newView(d),
    task: "patterns",
    items: ["Cost"],
    patternMode: "sources",
    themeUnit: "passages",
    groupBy: "Site",
    chart: "bars",
  };
  const p = {
    ...fresh(),
    name: "Access interviews",
    datasets: [d, table],
    active: d.id,
    confirmed: [d.id],
    views: [view, { ...view }],
  };
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await chooser
  ).setFiles({
    name: "old.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#graphic0")).toContainText("East");
  await reviewMatches(page);
  await expect(
    page.getByRole("combobox", { name: "Lee", exact: true }),
  ).toHaveValue("L02");
  await page
    .getByRole("combobox", { name: "Dee", exact: true })
    .selectOption("");
  await button(page, "Apply").click();
  await button(page, "Explore themes").click();
  const chart = page.locator("#graphic0");
  await expect(chart).not.toContainText("East");
  await expect(chart).toContainText("West");
  await expect(chart).toContainText(
    /1 interview(?:s)? omitted for missing\s*Site/,
  );
  await button(page, "Save and export").click();
  const download = page.waitForEvent("download");
  await button(page, "Download project with data").click();
  const bytes = [];
  for await (const chunk of await (await download).createReadStream())
    bytes.push(chunk);
  const buffer = Buffer.concat(bytes);
  const saved = backupContents(buffer).datasets[0];
  expect(saved.metadata.Dee).toEqual({ Programme: "History" });
  expect(saved.metadata.Lee).toEqual({ Site: "West" });

  const second = await browser.newPage();
  try {
    await second.goto(page.url());
    await openBackup(second, buffer);
    await expect(second.locator("#graphic0")).not.toContainText("East");
    await expect(second.locator("#graphic0")).toContainText(
      /1 interview(?:s)? omitted for missing\s*Site/,
    );
    await reviewMatches(second);
    await expect(
      second.getByRole("combobox", { name: "Dee", exact: true }),
    ).toHaveValue("");
    await expect(
      second.getByRole("combobox", { name: "Lee", exact: true }),
    ).toHaveValue("L02");
  } finally {
    await second.close();
  }
});
