import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fresh } from "../../src/project.js";
import { corpus } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
const passages = [
  ["a0", "Klei", "Onderzoeker: Wat vond u van de prijs?", ["Kosten"]],
  ["a1", "Klei", "De kaart werd duur, vooral in de zomer.", []],
  ["a2", "Klei", "De wachttijd liep op.", ["Wachttijd"]],
  ["a3", "Klei", "De tweede rit was ook duur.", ["Kosten"]],
  ["b1", "Zand", "De veerpont was snel.", []],
  ["c1", "Veen", "De wachtrij was lang.", ["Wachttijd"]],
  ["d1", "Krijt", "Een duur ticket zonder locatie.", ["Kosten"]],
];
function project() {
  const d = corpus(
    "Vervoersgesprekken",
    passages.map(([id, source, text, codes]) => ({
      id,
      source,
      text,
      codes,
      reviewed: true,
      codingIncluded: id !== "a0",
    })),
    ["Klei", "Zand", "Veen", "Krijt"],
  );
  d.passages.push({
    id: "quote",
    source: "Klei",
    parent: "a1",
    start: 14,
    text: "duur",
    codes: ["Kosten"],
    reviewed: true,
  });
  d.coding = {
    mode: "deductive",
    book: ["Kosten", "Wachttijd"].map((label) => ({
      label,
      definition: label,
    })),
  };
  d.interviews = {
    source: "Klei",
    method: "book",
    established: true,
    done: [...d.sources],
    finished: true,
  };
  d.metadata = {
    Klei: { Halte: "Pier" },
    Zand: { Halte: "Pier" },
    Veen: { Halte: "Brug" },
  };
  const view = { ...newView(d), task: "one", chart: "bars", x: "Kosten" };
  return {
    ...fresh(),
    active: d.id,
    datasets: [d],
    confirmed: [d.id],
    views: [view, { ...view }],
  };
}
async function open(page, p = project()) {
  await page.goto("/");
  const pick = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await pick
  ).setFiles({
    name: "veerpont.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
}
const cell = (figure, theme, comparison) =>
  figure.locator(
    `[data-pattern-row][data-theme="${theme}"][data-comparison="${comparison}"]`,
  );

test("theme figures follow covered interviews and original passages through to the exact transcript and export", async ({
  page,
}) => {
  await open(page);
  await button(page, "Compare themes").click();
  await page.getByRole("checkbox", { name: "Kosten", exact: true }).check();
  await page.getByRole("checkbox", { name: "Wachttijd", exact: true }).check();
  const figure = page.locator("#graphic0");
  await expect(
    figure.locator('[data-theme-view="grid"] [data-pattern-row]'),
  ).toHaveCount(8);
  await cell(figure, "Kosten", "Klei").focus();
  await cell(figure, "Kosten", "Klei").press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("2 of 3 original passages");
  await expect(dialog.locator("td mark")).toHaveText("duur");
  await expect(dialog).not.toContainText("Onderzoeker");
  await button(dialog, "Open passage 2 in Klei").click();
  await expect(page.locator(".iv-passage.iv-selected")).toContainText(
    "De kaart werd duur",
  );
  await button(page, "Explore themes").click();
  await page.getByLabel("Compare by group").selectOption({ label: "Halte" });
  await cell(figure, "Kosten", "Pier").click();
  await expect(dialog).toContainText("1 of 2 interviews contained this theme");
  await expect(dialog).toContainText("2 matching passages from 1 interview");
  await expect(dialog).not.toContainText("zonder locatie");
  await button(dialog, "Close").click();
  await page.getByLabel("Show for each group").selectOption("passages");
  await cell(figure, "Kosten", "Pier").click();
  await expect(dialog).toContainText("2 of 4 original passages");
  await button(dialog, "Close").click();
  await cell(figure, "Kosten", "Brug").click();
  await expect(dialog).toContainText("0 of 1 original passages");
  await expect(dialog).toContainText("No matching coded passages");
  await button(dialog, "Close").click();
  await button(page, "Dot plot").click();
  await expect(
    figure.locator('[data-theme-view="dots"] [data-pattern-row]'),
  ).toHaveCount(4);
  await button(page, "Save and export").click();
  await page.getByLabel("Image format").selectOption("svg");
  const ready = page.waitForEvent("download");
  await button(page, "Download figure").click();
  const svg = await readFile(await (await ready).path(), "utf8");
  expect(svg).toContain("Wachttijd");
  expect(svg).toContain("Pier");
  expect(svg).not.toContain("De kaart werd");
});

test("the bot spots verified individual and group patterns and draws the suggested view on acceptance", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/ask", (route) => {
    requests++;
    return route.abort();
  });
  await page.route("https://tutor.example.test/session", (route) =>
    route.fulfill({ json: { token: "local-test" } }),
  );
  await open(page);
  await button(page, "Compare themes").click();
  await page.getByRole("checkbox", { name: "Wachttijd", exact: true }).check();
  await button(page, "Spot patterns").click();
  const bot = page.locator("#data-bot");
  await bot.locator("#course").fill("test");
  await button(bot, "Unlock the bot").click();
  const reply = bot.locator(".msg-assistant").last();
  await expect(reply).toContainText("Kosten");
  await expect(reply).toContainText(/2 of 3 included passages/);
  await expect(reply).toContainText(/longer interviews/i);
  await expect(
    page.locator('#graphic0 [data-theme-view="grid"]'),
  ).toBeVisible();
  await button(bot, "Make this chart").click();
  await expect(
    page.locator('#graphic0 [data-theme-view="table"]'),
  ).toBeVisible();
  const ask = async (request) => {
    await bot.locator("#question").fill(request);
    await button(bot, "Send").click();
  };
  await ask("Compare Kosten and Wachttijd by Halte");
  await expect(page.getByLabel("Compare by group")).toHaveValue("Halte");
  await ask("What stands out?");
  await expect(reply).toContainText(/fewer than five interviews/);
  await expect(reply).toContainText("Pier");
  await expect(reply).not.toContainText("Een duur ticket zonder locatie");
  await button(bot, "Make this chart").click();
  await expect(
    page.locator('#graphic0 [data-theme-view="table"]'),
  ).toBeVisible();
  expect(requests).toBe(0);
});

test("the contribution view draws one bar per theme and follows the selected segment to its original passages", async ({
  page,
}) => {
  await open(page);
  await button(page, "Compare themes").click();
  await page.getByRole("checkbox", { name: "Wachttijd", exact: true }).check();
  await page.getByLabel("Show for each interview").selectOption("themeShare");
  const figure = page.locator("#graphic0");
  await expect(figure.locator('[data-theme-view="stack"]')).toBeVisible();
  await cell(figure, "Kosten", "Klei").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "2 of the 3 original passages coded with this theme",
  );
  await button(dialog, "Close").click();
  await page.getByLabel("Compare by group").selectOption({ label: "Halte" });
  await expect(figure.locator('[data-theme-view="stack"]')).toBeVisible();
  await cell(figure, "Wachttijd", "Brug").click();
  await expect(dialog).toContainText(
    "1 of the 2 original passages coded with this theme across the displayed groups",
  );
  await expect(dialog).toContainText("De wachtrij was lang.");
  await expect(dialog).not.toContainText("De wachttijd liep op.");
});

test("every matching passage can be opened even in an interview with over two hundred matches", async ({
  page,
}) => {
  const p = project();
  p.datasets[0].passages = Array.from({ length: 201 }, (_, i) => ({
    id: "part-" + i,
    source: "Klei",
    text: "Originele passage " + (i + 1) + ".",
    codes: ["Kosten"],
    codingIncluded: true,
    reviewed: true,
  }));
  await open(page, p);
  await button(page, "Compare themes").click();
  await cell(page.locator("#graphic0"), "Kosten", "Klei").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("201 matching passages from 1 interview");
  await expect(dialog.locator("tbody tr")).toHaveCount(25);
  for (let i = 0; i < 8; i++) await button(dialog, "Next passages").click();
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(button(dialog, "Next passages")).toBeDisabled();
  await button(dialog, "Open passage 201 in Klei").click();
  await expect(page.locator(".iv-passage.iv-selected")).toContainText(
    "Originele passage 201.",
  );
});

test("conversational and model proposals switch the denominator only when the student accepts", async ({
  page,
}) => {
  let requests = 0;
  const suggestion = {
    action: "suggest",
    task: "patterns",
    patternMode: "sources",
    chart: "stack",
    explanation: "See the contribution of each group to each theme.",
  };
  await page.route("**/ask", (route) => {
    requests++;
    return route.fulfill({ json: { answer: JSON.stringify(suggestion) } });
  });
  await page.route("https://tutor.example.test/session", (route) =>
    route.fulfill({ json: { token: "local-test" } }),
  );
  await open(page);
  await button(page, "Compare themes").click();
  await page.getByRole("checkbox", { name: "Wachttijd", exact: true }).check();
  await button(page, "Spot patterns").click();
  const bot = page.locator("#data-bot");
  await bot.locator("#course").fill("test");
  await button(bot, "Unlock the bot").click();
  const ask = async (text) => {
    await bot.locator("#question").fill(text);
    await button(bot, "Send").click();
  };
  await ask("Who contributed each theme’s passages?");
  await expect(bot.locator(".msg-assistant").last()).toContainText("came from");
  await expect(page.getByLabel("Show for each interview")).toHaveValue("count");
  await button(bot, "Make this chart").click();
  await expect(page.getByLabel("Show for each interview")).toHaveValue(
    "themeShare",
  );
  await expect(
    page.locator('#graphic0 [data-theme-view="stack"]'),
  ).toBeVisible();
  expect(requests).toBe(0);

  await page.getByLabel("Compare by group").selectOption({ label: "Halte" });
  await page.getByLabel("Show for each group").selectOption("interviews");
  await ask("Can you suggest another way to see my material?");
  await expect(bot.locator(".msg-assistant").last()).toContainText(
    "contribution of each group",
  );
  await expect(page.getByLabel("Show for each group")).toHaveValue(
    "interviews",
  );
  await button(bot, "Make this chart").click();
  await expect(page.getByLabel("Show for each group")).toHaveValue(
    "themeShare",
  );
  await expect(
    page.locator('#graphic0 [data-theme-view="stack"]'),
  ).toBeVisible();
  expect(requests).toBe(1);
  await ask(
    "What percentage of each theme’s passages came from each interview?",
  );
  await expect(bot.locator(".msg-assistant").last()).toContainText("came from");
  await button(bot, "Make this chart").click();
  await expect(page.getByLabel("Compare by group")).toHaveValue("");
  await expect(page.getByLabel("Show for each interview")).toHaveValue(
    "themeShare",
  );
  expect(requests).toBe(1);
});

test("long interview and theme names stay inside the grid and every cell has keyboard-accessible evidence", async ({
  page,
}) => {
  const p = project();
  const sources = Array.from({ length: 17 }, (_, i) =>
    i % 2 ? "W".repeat(37) + i : "界".repeat(29) + i,
  );
  const codes = ["M".repeat(39), "Diensten & toegankelijkheid"];
  const d = corpus(
    "Publieke diensten",
    sources.map((source, i) => ({
      id: "p-" + i,
      source,
      codes: [codes[i % 2]],
      reviewed: true,
      text: "Antwoord " + i,
    })),
    sources,
  );
  d.interviews = {
    ...p.datasets[0].interviews,
    source: sources[0],
    done: sources,
  };
  d.coding = {
    mode: "inductive",
    book: codes.map((label) => ({ label, definition: label })),
  };
  p.datasets = [d];
  p.active = d.id;
  p.confirmed = [d.id];
  const v = {
    ...newView(d),
    task: "one",
    chart: "bars",
    x: codes[0],
    style: "presentation",
  };
  p.views = [v, { ...v }];
  await open(page, p);
  await button(page, "Compare themes").click();
  for (const name of codes)
    await page.getByRole("checkbox", { name, exact: true }).check();
  const figure = page.locator('#graphic0 [data-theme-view="grid"]');
  const cells = figure.locator("[data-pattern-row]");
  await expect(cells).toHaveCount(sources.length * codes.length);
  expect(
    await figure.evaluate((layer) => {
      const problems = [];
      for (const group of layer.querySelectorAll("[data-comparison-heading]")) {
        const column = [...layer.querySelectorAll("[data-pattern-row]")]
          .find(
            (cell) =>
              group.dataset.comparisonHeading === cell.dataset.comparison,
          )
          .querySelector("rect")
          .getBBox();
        for (const label of group.querySelectorAll("text")) {
          const box = label.getBBox();
          if (
            box.x < column.x - 1 ||
            box.x + box.width > column.x + column.width + 1
          )
            problems.push(label.textContent);
        }
      }
      for (const row of layer.querySelectorAll("[data-theme-heading]")) {
        const column = row.querySelector("rect").getBBox();
        for (const label of row.querySelectorAll(":scope > text")) {
          const box = label.getBBox();
          if (box.x + box.width > column.x + 1)
            problems.push(label.textContent);
        }
      }
      return problems;
    }),
  ).toEqual([]);
  const last = cells.last();
  await last.focus();
  await expect(last).toBeFocused();
  await last.press("Space");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    await last.getAttribute("data-theme"),
  );
});

for (const action of ["draw", "restyleChart"]) {
  test(
    "asking for a dot plot recommendation keeps the grouped contribution chart until acceptance with model action " +
      action,
    async ({ page }) => {
      const request =
        "Please recommend a dot plot of my selected themes. Keep the groups and the share of each theme’s passages as they are.";
      const received = [];
      await page.route("**/ask", (route) => {
        received.push(route.request().postDataJSON().question);
        const response = {
          action,
          chart: "dots",
          ...(action === "draw" && {
            task: "patterns",
            patternMode: "sources",
            items: ["Kosten", "Wachttijd"],
            groupBy: "Halte",
          }),
          explanation:
            "A dot plot makes the two groups’ shares easy to compare.",
        };
        return route.fulfill({ json: { answer: JSON.stringify(response) } });
      });
      await page.route("https://tutor.example.test/session", (route) =>
        route.fulfill({ json: { token: "local-test" } }),
      );
      await open(page);
      await button(page, "Compare themes").click();
      for (const name of ["Kosten", "Wachttijd"]) {
        await page.getByRole("checkbox", { name, exact: true }).check();
      }
      const group = page.getByLabel("Compare by group");
      const unit = page.getByLabel("Show for each group");
      await group.selectOption("Halte");
      await unit.selectOption("themeShare");
      const figure = page.locator("#graphic0");
      const stack = figure.locator('[data-theme-view="stack"]');
      const dots = figure.locator('[data-theme-view="dots"]');
      await expect(stack).toBeVisible();
      await button(page, "Data bot").click();
      const bot = page.locator("#data-bot");
      await bot.locator("#course").fill("test");
      await button(bot, "Unlock the bot").click();
      await bot.locator("#question").fill(request);
      await button(bot, "Send").click();
      const make = button(bot, "Make this chart");
      await expect(make).toBeVisible();
      expect(received).toEqual([request]);
      await expect(stack).toBeVisible();
      await expect(dots).toHaveCount(0);
      await expect(group).toHaveValue("Halte");
      await expect(unit).toHaveValue("themeShare");

      await make.click();
      await expect(dots).toBeVisible();
      await expect(stack).toHaveCount(0);
      await expect(group).toHaveValue("Halte");
      await expect(unit).toHaveValue("themeShare");
      await expect(dots.locator("[data-pattern-row]")).toHaveCount(4);
      await button(bot, "Close").click();
      await cell(figure, "Kosten", "Pier").click();
      await expect(page.getByRole("dialog")).toContainText(
        "2 of the 2 original passages coded with this theme across the displayed groups",
      );
      expect(received).toEqual([request]);
    },
  );
}
