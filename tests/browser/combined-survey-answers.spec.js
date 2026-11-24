import { test, expect } from "@playwright/test";

test("the bot calculates combined survey totals locally and students can choose their own options", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/ask", (r) => {
    requests++;
    return r.abort();
  });
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.goto("/");
  const btn = (scope, name) => scope.getByRole("button", { name, exact: true });
  const file = page.waitForEvent("filechooser");
  await btn(page, "Upload Qualtrics export").click();
  await (
    await file
  ).setFiles({
    name: "markets.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "StartDate,EndDate,Q1,Q2,Q3\nStart Date,End Date,Lighting,Space,Market\n2026,2026,Agree,Strongly agree,East\n2026,2026,Strongly agree,,West\n2026,2026,Disagree,Agree,East\n2026,2026,Agree,Disagree,West\n2026,2026,Disagree,Agree,",
    ),
  });
  await btn(page, "Confirm and explore").click();
  await btn(page, "Compare questions by group").click();
  for (const name of ["Lighting", "Space"])
    await page.getByRole("checkbox", { name, exact: true }).check();
  await page.getByLabel("Compare by group").selectOption({ label: "Market" });
  await btn(page, "Data bot").click();
  const bot = page.locator("#data-bot");
  await bot
    .locator("#question")
    .fill(
      "Across these two selected questions, what do most respondents agree on? For each question give the number who agreed or strongly agreed, and the total who answered.",
    );
  await btn(bot, "Send").click();
  const reply = bot.locator(".msg-assistant").last();
  await expect(reply).toContainText("“Lighting” — 3 of 4 (75%)");
  await expect(reply).toContainText("“Space” — 2 of 3 (66.7%)");
  await bot.locator("summary").filter({ hasText: "Chat tools" }).click();
  await btn(bot, "Combine answers").click();
  const dialog = page.getByRole("dialog"),
    question = dialog.getByRole("group", { name: "Space", exact: true });
  await question.getByRole("checkbox", { name: "Agree", exact: true }).check();
  await question
    .getByRole("checkbox", { name: "Disagree", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "Show a total for each group" })
    .check();
  await btn(dialog, "Calculate totals").click();
  await expect(reply).toContainText("“Space” · “East” — 1 of 2 (50%)");
  await expect(reply).toContainText("“Space” · “West” — 1 of 1 (100%)");
  await expect(reply).not.toContainText("Lighting");
  expect(requests).toBe(0);
});
