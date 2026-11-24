import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { corpus, texts } from "../../src/import.js";
import { newView } from "../../src/analysis.js";
import { backupContents } from "./backup-helpers.js";

test("a chat request opens a voluntary second look over the chosen interviews and keeps only approved additions", async ({
  page,
}) => {
  const one = "The concert was free but the bus was late.";
  const two = "I walked along the river.";
  const passages = [...texts("North", [one]), ...texts("South", [two])];
  passages[0].codes = ["Price"];
  const d = corpus("Travel", passages, ["North", "South"]);
  d.coding = {
    mode: "deductive",
    book: [
      { label: "Price", definition: "An amount paid or saved." },
      { label: "Delay", definition: "An unplanned wait." },
    ],
  };
  const project = {
    ...fresh(),
    name: "Journeys",
    active: d.id,
    datasets: [d],
    views: [newView(d), newView(d)],
  };
  const requests = [];
  const checks = [];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("**/ask", (route) => {
    const { skill, context } = route.request().postDataJSON();
    if (skill === "verifyCoding") {
      checks.push(context);
      return route.fulfill({
        json: {
          answer: JSON.stringify({ keep: context.candidates.map((c) => c.id) }),
        },
      });
    }
    expect(skill).toBe("coding");
    requests.push(context);
    const p = context.passages.find((p) => p.source === "North");
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: p
            ? [
                {
                  id: p.id,
                  code: "Price",
                  quote: "free",
                  reason: "No charge.",
                },
                {
                  id: p.id,
                  code: "Delay",
                  quote: "the bus was late",
                  reason: "A transport delay.",
                },
                {
                  id: p.id,
                  code: "Atmosphere",
                  quote: "concert",
                  reason: "Unapproved code.",
                },
              ]
            : [],
        }),
      },
    });
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await button("Open a saved project").click();
  await (
    await picker
  ).setFiles({
    name: "journeys.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await button("Data bot").click();
  await page
    .locator("#question")
    .fill(
      "Could you check all interviews for missed labels, including passages you have already coded?",
    );
  await button("Send").click();
  await expect(page.locator("#iv-scope")).toHaveValue("all");
  expect(requests).toHaveLength(0);
  await button("Check selected passages").click();
  await page
    .locator(".iv-review")
    .getByRole("button", { name: "Review suggested coding" })
    .click();
  await expect(page.locator("[name=iv-match]")).toHaveCount(1);
  expect(checks).toHaveLength(1);
  expect(JSON.stringify(checks[0])).not.toContain(two);
  expect(JSON.stringify(checks[0])).not.toContain("Atmosphere");
  expect(requests.every((c) => c.guide.reviewPass === "missed")).toBe(true);
  const sent = requests.flatMap((c) => c.passages);
  expect(sent.find((p) => p.source === "North").codes).toContain("Price");
  expect(sent.find((p) => p.source === "South").codes).toEqual([]);
  await expect(page.locator("[name=iv-match]")).not.toBeChecked();
  await page.locator("[name=iv-match]").check();
  await button("Finish review").click();
  const download = page.waitForEvent("download");
  await button("Save coding project").click();
  const chunks = [];
  for await (const chunk of await (await download).createReadStream())
    chunks.push(chunk);
  const backup = backupContents(Buffer.concat(chunks));
  expect(
    backup.workLog.find(
      (item) => item.title === "Checked for missed interview labels",
    ).details[0],
  ).toContain("Accepted 1 of 1");
  const saved = backup.datasets[0].passages;
  expect(saved.find((p) => p.source === "North").codes.sort()).toEqual([
    "Delay",
    "Price",
  ]);
  expect(saved.find((p) => p.source === "South").codes).toEqual([]);
});
