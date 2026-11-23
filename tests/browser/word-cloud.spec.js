import { test, expect } from "@playwright/test";

test("students explore the words in a coded interview, read passages, compare counts and export a bot-drawn cloud", async ({
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
    .selectOption({ label: "Explore frequently used words" });
  const graphic = page.locator("#graphic0");
  const word = (label) => graphic.locator('[data-cloud-word="' + label + '"]');
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
  await page.locator(".chart-picker summary").click();
  await page.locator('[data-chart="table"]').click();
  await expect(graphic).toContainText("Occurrences");
  await expect(word("stoep")).toHaveAttribute("aria-label", /2 occurrences/);
  await word("stoep").press("Space");
  await expect(dialog).toContainText("1 matching passage");
  await expect(dialog).not.toContainText("River");
  await button("Close").click();

  await button("Data bot").click();
  await page.locator("#question").fill("Draw a word cloud for all interviews");
  await button("Send").click();
  await expect(
    graphic.locator("text.cloud-word").filter({ hasText: "stoep" }),
  ).toHaveAttribute("aria-label", /3 occurrences/);
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
  expect(svg).toContain('class="cloud-word"');
  expect(svg).toContain("stoep");
  expect(svg).not.toContain("data-cloud-word");
  expect(svg).not.toContain("stoep bij de haven");
});
