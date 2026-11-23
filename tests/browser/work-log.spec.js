import { test, expect } from "@playwright/test";
import { backupContents } from "./backup-helpers.js";
test("students revisit calculated findings and add their own interpretation to the project log", async ({
  page,
}) => {
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await button("Upload Qualtrics export").click();
  await (
    await chooser
  ).setFiles({
    name: "Campus travel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Route,Campus\nWalk,North\nWalk,South\nCycle,South"),
  });
  await button("Continue").click();
  await button("Confirm and explore").click();
  await button("Save visual").click();
  await page.getByLabel("Visual name").fill("Routes to campus");
  await button("Save to project").click();
  await button("Save and export").click();
  await button("View project log").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Added a dataset");
  await expect(dialog).toContainText("2 of 3 (66.67%)");
  await button("Add a finding or note").click();
  await page
    .getByLabel("What did you observe?")
    .fill("Walking was common in our small sample.");
  await button("Save finding").click();
  await expect(dialog).toContainText("Student finding or note");
  await expect(dialog).toContainText("Walking was common in our small sample.");
  await button("Close").click();
  const pending = page.waitForEvent("download");
  await button("Download project with data").click();
  const dl = await pending;
  const chunks = [];
  for await (const part of await dl.createReadStream()) chunks.push(part);
  const project = backupContents(Buffer.concat(chunks));
  expect(
    project.workLog.filter((e) => e.title === "Saved a visual"),
  ).toHaveLength(1);
  expect(project.workLog.at(-1).details).toEqual([
    "Walking was common in our small sample.",
  ]);
});
