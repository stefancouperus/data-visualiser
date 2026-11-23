import { expect } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

export function backupContents(bytes) {
  const files = unzipSync(bytes);
  expect(Object.keys(files)).toContain("project.json");
  const word = Object.keys(files).find((file) => file.endsWith(".docx"));
  expect(word).toBeTruthy();
  expect(unzipSync(files[word])["word/document.xml"]).toBeTruthy();
  return JSON.parse(strFromU8(files["project.json"]));
}
export async function openBackup(page, buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Open a saved project", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({ name: "backup.zip", mimeType: "application/zip", buffer });
}
