import { expect, test } from "@playwright/test";
import { makeTable, corpus } from "../../src/import.js";
import { fresh } from "../../src/project.js";

async function openView(page, dataset, view) {
  const project = {
    ...fresh(),
    active: dataset.id,
    datasets: [dataset],
    confirmed: [dataset.id],
    views: [view, structuredClone(view)],
  };
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Open a saved project", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "figure.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
}

const button = (page, name) => page.getByRole("button", { name, exact: true });

test("a figure can be renamed, reordered, saved and exported while the heatmap still opens the original records", async ({
  page,
}) => {
  const d = makeTable(
    [
      ["Journey", "Campus"],
      ["Bike", "West"],
      ["Bike", "West"],
      ["Walk", "East"],
      ["Walk", "West"],
    ],
    "Journey",
  );
  await openView(page, d, {
    task: "group",
    chart: "grid",
    x: "c0",
    y: "c1",
    measure: "count",
  });
  const chart = page.locator("#graphic0 svg");
  await button(page, "Edit visual").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Figure title").fill("Daily travel");
  await dialog
    .getByLabel("Caption or annotation")
    .fill("Responses from our pilot.");
  await dialog.getByText("Edit labels and order").click();
  const labels = dialog.getByRole("group", { name: "Category labels" });
  await labels.getByLabel("Choose a label").selectOption("Walk");
  await labels.getByLabel("Display this label as").fill("On foot");
  await labels.getByRole("button", { name: "Move up" }).click();
  const groups = dialog.getByRole("group", { name: "Group or series names" });
  await groups.getByLabel("Choose a label").selectOption("West");
  await groups.getByLabel("Display this label as").fill("West campus");
  await button(page, "Apply to visual").click();
  await expect(chart).toHaveAttribute("aria-label", "Daily travel");
  await expect(chart).toContainText("Responses from our pilot.");
  await expect(chart.locator('[data-source="West"]').first()).toHaveAttribute(
    "data-code",
    "Walk",
  );
  await chart
    .getByRole("button", {
      name: "Read evidence: West campus · On foot · 1",
      exact: true,
    })
    .click();
  await expect(dialog).toContainText("Walk");
  await expect(dialog).toContainText("West");
  await button(page, "Close").click();
  await button(page, "Save visual").click();
  await dialog.getByLabel("Visual name").fill("Edited commuting figure");
  await dialog.getByLabel("Also download").check();
  const download = page.waitForEvent("download");
  await button(page, "Save to project").click();
  const chunks = [];
  for await (const c of await (await download).createReadStream())
    chunks.push(c);
  const svg = Buffer.concat(chunks).toString();
  expect(svg).toContain("Daily travel");
  expect(svg).toContain("On foot");
  expect(svg).toContain("West campus");
  expect(svg).toContain("Responses from our pilot.");
  await button(page, "Edit visual").click();
  await button(page, "Restore original text and order").click();
  await button(page, "Apply to visual").click();
  await expect(chart).not.toContainText("On foot");
  await button(page, "Save and export").click();
  await button(page, "Open visual").click();
  await expect(chart).toContainText("On foot");
  await expect(chart.locator('[data-source="West"]').first()).toHaveAttribute(
    "data-code",
    "Walk",
  );
});

test("line series can change order and axes can be named without moving observations along the scale", async ({
  page,
}) => {
  const d = makeTable(
    [
      ["Hour", "Value", "Route"],
      ["2", "6", "Blue"],
      ["1", "3", "Blue"],
      ["2", "4", "Red"],
      ["1", "2", "Red"],
    ],
    "Counts",
  );
  await openView(page, d, {
    task: "two",
    chart: "line",
    x: "c0",
    y: "c1",
    z: "c2",
  });
  const chart = page.locator("#graphic0 svg");
  const before = await chart
    .locator("path[fill=none][stroke-width]")
    .evaluateAll((paths) => paths.map((p) => p.getAttribute("d")));
  expect(before).toHaveLength(2);
  await button(page, "Edit visual").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Horizontal axis label").fill("Hours since noon");
  await dialog.getByLabel("Vertical axis label").fill("Trips");
  await dialog.getByText("Edit labels and order").click();
  const series = dialog.getByRole("group", { name: "Lines and legend" });
  await series.getByLabel("Choose a label").selectOption("Red");
  await series.getByLabel("Display this label as").fill("Express");
  await button(dialog, "Move up").click();
  await button(page, "Apply to visual").click();
  await expect(chart).toContainText("Hours since noon");
  await expect(chart).toContainText("Trips");
  await expect(chart).toContainText("Express");
  const after = await chart
    .locator("path[fill=none][stroke-width]")
    .evaluateAll((paths) => paths.map((p) => p.getAttribute("d")));
  expect(after).toEqual([...before].reverse());
});

test("reordered interview pattern rows still open the passages selected by their original themes", async ({
  page,
}) => {
  const d = corpus(
    "Walks",
    [
      {
        id: "p1",
        source: "R1",
        text: "I enjoy walking.",
        codes: ["Enjoyment"],
        reviewed: true,
      },
      {
        id: "p2",
        source: "R2",
        text: "The pavement is narrow.",
        codes: ["Access"],
        reviewed: true,
      },
    ],
    ["R1", "R2"],
  );
  d.coding = {
    mode: "deductive",
    book: ["Enjoyment", "Access"].map((label) => ({
      label,
      definition: label,
    })),
  };
  d.interviews = {
    method: "book",
    source: "R1",
    done: ["R1", "R2"],
    established: true,
    finished: true,
  };
  await openView(page, d, {
    task: "patterns",
    chart: "bars",
    items: ["Enjoyment", "Access"],
    patternMode: "passages",
  });
  await button(page, "Edit visual").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Edit labels and order").click();
  const labels = dialog.getByRole("group", { name: "Category labels" });
  await labels.getByLabel("Choose a label").selectOption("Access");
  await labels.getByLabel("Display this label as").fill("Accessibility");
  await button(labels, "Move up").click();
  await button(page, "Apply to visual").click();
  await expect(
    page.locator("#graphic0 [data-pattern-row]").first(),
  ).toHaveAttribute("data-pattern-row", "1");
  await page
    .getByRole("button", { name: "Read evidence: Accessibility", exact: true })
    .click();
  await expect(dialog).toContainText("The pavement is narrow.");
  await expect(dialog).not.toContainText("I enjoy walking.");
});
