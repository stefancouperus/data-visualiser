import { test, expect } from "@playwright/test";

const gateway = "https://tutor.example.test";
const extraction = "Extract labels from a codebook";
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
const textFile = (name, text) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});

async function openInterviews(page) {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await button(page, "Upload uncoded transcripts").click();
  await (
    await picker
  ).setFiles(textFile("Interview.txt", "I cycled to the station."));
}

async function expectCodeAlone(dialog) {
  await expect(dialog.getByLabel("Workshop course code")).toBeVisible();
  await expect(button(dialog, "Confirm code")).toBeVisible();
  await expect(button(dialog, "Close")).toBeVisible();
  await expect(dialog.locator("button:visible")).toHaveCount(2);
  await expect(
    dialog.locator("input:visible, select:visible, textarea:visible"),
  ).toHaveCount(1);
  await expect(dialog.getByLabel("Upload your codebook")).toBeHidden();
  await expect(button(dialog, "Extract labels")).toBeHidden();
}

test("sign-in replaces the code prompt with the chosen extraction task and waits for explicit extraction", async ({
  page,
}) => {
  const codes = [];
  const extracts = [];
  const doc = "Transport: Means of reaching a destination.";
  await page.route(gateway + "/session", (route) => {
    const { code } = route.request().postDataJSON();
    codes.push(code);
    return code === "synthetic-course"
      ? route.fulfill({ json: { token: "classroom-test" } })
      : route.fulfill({
          status: 403,
          json: { error: "Check the course code." },
        });
  });
  await page.route(gateway + "/ask", (route) => {
    extracts.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          entries: [
            {
              label: "Transport",
              definition: "Means of reaching a destination.",
            },
          ],
        }),
      },
    });
  });
  await openInterviews(page);
  await button(page, extraction).click();
  const dialog = page.getByRole("dialog");
  await expectCodeAlone(dialog);
  const field = dialog.getByLabel("Workshop course code");
  await field.fill("incorrect");
  await button(dialog, "Confirm code").click();
  await expect(
    dialog.getByText("Check the course code.", { exact: true }),
  ).toBeVisible();
  await expectCodeAlone(dialog);
  await field.fill("synthetic-course");
  await field.press("Enter");

  await expect(dialog).toHaveAccessibleName(extraction);
  const upload = dialog.getByLabel("Upload your codebook");
  await expect(upload).toBeVisible();
  await expect(dialog.getByLabel("Workshop course code")).toBeHidden();
  await expect(page.locator("#data-bot")).toBeHidden();
  await expect(button(dialog, "Extract labels")).toBeDisabled();
  expect(codes).toEqual(["incorrect", "synthetic-course"]);
  expect(extracts).toHaveLength(0);
  await upload.setInputFiles(textFile("Codes.txt", doc));
  await expect(button(dialog, "Extract labels")).toBeEnabled();
  expect(extracts).toHaveLength(0);
  await button(dialog, "Extract labels").click();
  await expect(dialog.locator("[data-label]").first()).toHaveValue("Transport");
  expect(extracts).toHaveLength(1);
  expect(extracts[0]).toMatchObject({
    skill: "codebook",
    context: { document: doc },
  });
  await button(dialog, "Close").click();
  await page.evaluate(() => sessionStorage.removeItem("dv-session"));
  await button(page, "Review draft labels").click();
  await expect(dialog.locator("[data-label]").first()).toHaveValue("Transport");
  await expect(dialog.getByLabel("Workshop course code")).toBeHidden();
  await button(dialog, "Use these labels").click();
  await expect(page.locator(".iv-project-vocabulary")).toContainText(
    "Transport",
  );
  expect(codes).toHaveLength(2);
  expect(extracts).toHaveLength(1);
});

test("an active chat session opens codebook extraction directly", async ({
  page,
}) => {
  let signIns = 0;
  await page.route(gateway + "/session", (route) => {
    signIns++;
    return route.fulfill({ json: { token: "existing-classroom-session" } });
  });
  await openInterviews(page);
  await button(page, "Data bot").click();
  const bot = page.locator("#data-bot");
  await bot.getByLabel("Workshop course code").fill("synthetic-course");
  await button(bot, "Unlock the bot").click();
  await expect(bot.locator("#question")).toBeVisible();
  await button(bot, "Close").click();

  await button(page, extraction).click();
  const dialog = page.getByRole("dialog", { name: extraction });
  await expect(dialog.getByLabel("Upload your codebook")).toBeVisible();
  await expect(dialog.getByLabel("Workshop course code")).toBeHidden();
  await expect(button(dialog, "Confirm code")).toBeHidden();
  expect(signIns).toBe(1);
});

test("an expired session asks again and cancelling leaves manual coding available", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("dv-session", "old.1000.signature"),
  );
  const calls = [];
  await page.route(gateway + "/**", (route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 503, body: "Unexpected bot request" });
  });
  await openInterviews(page);
  await button(page, extraction).click();
  const dialog = page.getByRole("dialog");
  await expectCodeAlone(dialog);
  await button(dialog, "Close").click();
  await expect(dialog).toBeHidden();
  await button(page, "Enter labels manually").click();
  await expect(dialog.locator("[data-label]").first()).toBeVisible();
  await expect(dialog.getByLabel("Workshop course code")).toBeHidden();
  await dialog.locator("[data-label]").first().fill("Travel");
  await button(dialog, "Use these labels").click();
  await expect(button(page, "Code manually")).toBeEnabled();
  expect(calls).toEqual([]);
});

test("a late sign-in reply cannot reopen the extraction task after the student closes it", async ({
  page,
}) => {
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  await page.route(gateway + "/session", (route) => complete(route));
  await openInterviews(page);
  await button(page, extraction).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Workshop course code").fill("synthetic-course");
  await button(dialog, "Confirm code").click();
  const route = await pending;
  await button(dialog, "Close").click();
  await expect(dialog).toBeHidden();
  await button(page, "Enter labels manually").click();
  await expect(dialog.locator("[data-label]").first()).toBeVisible();
  const reply = page.waitForResponse(
    (res) => res.url() === gateway + "/session",
  );
  await route.fulfill({ json: { token: "classroom-test" } });
  await (await reply).finished();
  await dialog.locator("[data-label]").first().fill("Transport");
  await button(dialog, "Use these labels").click();
  await expect(page.locator(".iv-project-vocabulary")).toContainText(
    "Transport",
  );
  await expect(dialog).toBeHidden();
});

test("reconfirming a session keeps a chosen codebook file and waits for Extract labels", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("dv-session", "valid-initial-session"),
  );
  const calls = [];
  await page.route(gateway + "/session", (route) => {
    calls.push("confirm");
    return route.fulfill({ json: { token: "renewed-test-session" } });
  });
  await page.route(gateway + "/ask", (route) => {
    calls.push("extract");
    expect(route.request().postDataJSON().context.document).toContain("Travel");
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          entries: [{ label: "Travel", definition: "A journey." }],
        }),
      },
    });
  });
  await openInterviews(page);
  await button(page, extraction).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Upload your codebook")
    .setInputFiles(textFile("Kept.txt", "Travel: A journey."));
  await page.evaluate(() =>
    sessionStorage.setItem("dv-session", "old.1000.signature"),
  );
  await button(dialog, "Extract labels").click();
  await expectCodeAlone(dialog);
  await dialog.getByLabel("Workshop course code").fill("synthetic-course");
  await button(dialog, "Confirm code").click();
  await expect(dialog.getByLabel("Upload your codebook")).toBeVisible();
  await expect(button(dialog, "Extract labels")).toBeEnabled();
  expect(
    await dialog
      .getByLabel("Upload your codebook")
      .evaluate((input) => input.files[0].name),
  ).toBe("Kept.txt");
  expect(calls).toEqual(["confirm"]);
  await button(dialog, "Extract labels").click();
  await expect(dialog.locator("[data-label]").first()).toHaveValue("Travel");
  expect(calls).toEqual(["confirm", "extract"]);
});
