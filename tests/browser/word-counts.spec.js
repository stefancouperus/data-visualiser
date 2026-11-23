import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";

test("students explore the words in a coded interview, read passages, compare counts and export a ranked word table", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("dv-session", "fictional-browser-test"),
  );
  await page.goto("/");
  const button = (name) => page.getByRole("button", { name, exact: true });
  const pick = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Upload coded interviews/ }).click();
  await (
    await pick
  ).setFiles({
    name: "walking-interviews.tsv",
    mimeType: "text/tab-separated-values",
    buffer: Buffer.from(
      [
        "Interview\tPassage\tCodes",
        "Hill\tDe stoep, stoep!\tAccess",
        "Hill\tPark, park.\tLeisure",
        "River\tDe stoep bij de haven.\tAccess",
      ].join("\n"),
    ),
  });
  await button("Continue").click();
  await button("Continue").click();
  while (await button("Mark this interview as checked").count()) {
    await button("Mark this interview as checked").click();
    await button("Mark as checked").click();
  }
  await button("Coding complete · explore themes").click();
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Count words in passages" });
  const graphic = page.locator("#graphic0");
  const word = (label) =>
    graphic.locator('[data-counted-word="' + label + '"]');
  await expect(word("stoep")).toHaveAttribute("aria-label", /3 occurrences/);
  await expect(word("de")).toHaveCount(0);
  await word("stoep").focus();
  await word("stoep").press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("2 matching passages");
  await expect(dialog).toContainText("De stoep, stoep!");
  await expect(dialog).toContainText("De stoep bij de haven.");
  await expect(dialog).not.toContainText("Park, park.");
  await button("Close").click();

  await page.getByLabel("Which passages should count?").selectOption("Access");
  await expect(word("park")).toHaveCount(0);
  await page.getByText("Chart settings", { exact: true }).click();
  await page.getByText("Filters and appearance", { exact: true }).click();
  await page.getByLabel("Keep a subset").selectOption("source");
  await page.getByLabel("Keep this value").selectOption("Hill");
  await expect(word("stoep")).toHaveAttribute("aria-label", /2 occurrences/);
  await expect(word("haven")).toHaveCount(0);
  await expect(page.locator('[data-chart="wordcloud"]')).toHaveCount(0);
  await expect(graphic).toContainText("Occurrences");
  await expect(word("stoep")).toHaveAttribute("aria-label", /2 occurrences/);
  await word("stoep").press("Space");
  await expect(dialog).toContainText("1 matching passage");
  await expect(dialog).not.toContainText("River");
  await button("Close").click();

  await button("Data bot").click();
  await page.locator("#question").fill("Draw a word cloud for all interviews");
  await button("Send").click();
  await expect(page.locator(".chatlog")).toContainText(
    "Count words in passages",
  );
  await expect(word("stoep")).toHaveAttribute("aria-label", /2 occurrences/);
  await page
    .locator("#question")
    .fill("Show a word count table for all interviews");
  await button("Send").click();
  await expect(word("stoep")).toHaveAttribute("aria-label", /3 occurrences/);
  await expect(word("park")).toHaveAttribute("aria-label", /2 occurrences/);
  await page.locator("[data-act=closebot]").click();
  await button("Save and export").click();
  await page.getByLabel("Image format").selectOption("svg");
  const pending = page.waitForEvent("download");
  await button("Download figure").click();
  const file = await pending;
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const svg = Buffer.concat(chunks).toString();
  expect(svg).toContain("Occurrences");
  expect(svg).not.toContain("cloud-word");
  expect(svg).toContain("stoep");
  expect(svg).not.toContain("data-counted-word");
  expect(svg).not.toContain("stoep bij de haven");
});

test("a downloaded legacy cloud opens with the same theme and source as a word table", async ({
  page,
}) => {
  const old = {
    chart: "wordcloud",
    task: "one",
    x: "Cost",
    filter: "source",
    value: "River",
    title: "Selected wording",
    palette: "grey",
  };
  const data = {
    id: "walks",
    kind: "text",
    name: "Walks",
    textPurpose: "documents",
    sources: ["River", "Hill"],
    passages: [
      {
        id: "a",
        source: "River",
        text: "Timetables changed.",
        codes: ["Planning"],
      },
      { id: "b", source: "River", text: "Fares rose.", codes: ["Cost"] },
      {
        id: "c",
        source: "Hill",
        text: "Tickets disappeared.",
        codes: ["Cost"],
      },
    ],
  };
  const project = {
    ...fresh(),
    active: data.id,
    datasets: [data],
    confirmed: [data.id],
    views: [old, old],
    savedVisuals: [{ dataset: data.id, name: "Scoped wording", view: old }],
  };
  await page.goto("/");
  const pick = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open a saved project" }).click();
  await (
    await pick
  ).setFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  const graphic = page.locator("#graphic0");
  await expect(graphic).toContainText("Selected wording");
  await expect(graphic).toContainText("Occurrences");
  await expect(graphic.locator('[data-counted-word="fares"]')).toHaveCount(1);
  await expect(
    graphic.locator(
      '[data-counted-word="tickets"], [data-counted-word="timetables"]',
    ),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-chart="wordcloud"], .cloud-word'),
  ).toHaveCount(0);
});
