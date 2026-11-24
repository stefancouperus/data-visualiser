import { test, expect } from "@playwright/test";

const ask = "https://tutor.example.test/ask";
const button = (page, name) => page.getByRole("button", { name, exact: true });
const indicator = (container) => container.locator(".bot-working");
const sidebarIcon = (page) =>
  page.locator("nav [data-act=bot] .bot-activity-icon");

async function upload(page, shortcut, name, text) {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: shortcut }).click();
  await (
    await picker
  ).setFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });
}

// Hold the actual browser request until its waiting UI has been checked.
async function holdRequest(page, trigger) {
  let accept;
  const arrived = new Promise((resolve) => {
    accept = resolve;
  });
  await page.route(ask, accept, { times: 1 });
  await trigger();
  return arrived;
}
const reply = (route, data) =>
  route.fulfill({ json: { answer: JSON.stringify(data) } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
});

test("chat activity stays visible when closed, respects reduced motion and clears on reply", async ({
  page,
}) => {
  await upload(
    page,
    /Upload Qualtrics export/,
    "survey.csv",
    "StartDate,EndDate,Q1\nStart Date,End Date,Do you feel heard?\n2026,2026,Yes\n2026,2026,No",
  );
  await button(page, "Confirm and explore").click();
  const nav = button(page, "Data bot"),
    panel = page.locator("#data-bot");
  await nav.click();
  await expect(sidebarIcon(page)).toBeHidden();
  await panel
    .locator("#question")
    .fill("What do the current responses tell us?");
  const route = await holdRequest(page, () => button(panel, "Send").click());
  const message = indicator(panel);
  await expect(message).toBeVisible();
  await expect(message).toContainText(/\S/);
  expect(
    await message.evaluate((el) =>
      Boolean(el.closest('[role="status"], [aria-live="polite"]')),
    ),
  ).toBe(true);
  await expect(sidebarIcon(page)).toBeVisible();
  const countAnimations = () =>
    message
      .locator(".bot-activity-icon")
      .evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      );
  await expect.poll(countAnimations).toBeGreaterThan(0);
  await panel.locator('[data-act="closebot"]').click();
  await expect(panel).toBeHidden();
  await expect(sidebarIcon(page)).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await nav.click();
  await expect(message).toBeVisible();
  await expect.poll(countAnimations).toBe(0);
  await reply(route, {
    action: "answer",
    explanation: "One participant answered Yes.",
  });
  await expect(panel.locator(".msg-assistant").last()).toContainText(
    "1 of 2 valid responses",
  );
  await expect(message).toBeHidden();
  await expect(sidebarIcon(page)).toBeHidden();
});

test("a failed survey role request clears activity and leaves the form usable", async ({
  page,
}) => {
  await upload(
    page,
    /Upload Qualtrics export/,
    "roles.csv",
    "Trust,Year\nHigh,First\nLow,Second\nHigh,Second",
  );
  await button(page, "Continue").click();
  await button(page, "Choose question roles").click();
  await page
    .getByLabel("What do you want to find out?")
    .fill("Does trust differ by year?");
  const trigger = button(page, "Suggest roles from my project"),
    status = page.locator("#role-status");
  const route = await holdRequest(page, () => trigger.click());
  await expect(indicator(status)).toBeVisible();
  await expect(sidebarIcon(page)).toBeVisible();
  await expect(trigger).toBeDisabled();
  await route.fulfill({
    status: 503,
    json: { error: "The test service is busy." },
  });
  await expect(status).toContainText("The test service is busy.");
  await expect(trigger).toBeEnabled();
  await expect(indicator(status)).toBeHidden();
  await expect(sidebarIcon(page)).toBeHidden();
});

test("codebook and coding activity report the current task and stop on pause or review", async ({
  page,
}) => {
  await upload(
    page,
    /Upload uncoded transcripts/,
    "travel.txt",
    Array.from(
      { length: 7 },
      (_, i) => "Passenger " + (i + 1) + " waited at the station.",
    ).join("\n"),
  );
  await page
    .getByRole("button", { name: "Extract labels from a codebook" })
    .click();
  await page.locator("#book-file").setInputFiles({
    name: "book.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Waiting: Time spent waiting for a service."),
  });
  const sent = [];
  page.on("request", (request) => {
    if (request.url() === ask) sent.push(request.postDataJSON().skill);
  });
  const extraction = await holdRequest(page, () =>
    button(page, "Extract labels").click(),
  );
  const book = page.locator("#book-status");
  await expect(indicator(book)).toBeVisible();
  await expect(sidebarIcon(page)).toBeVisible();
  await reply(extraction, {
    entries: [
      { label: "Waiting", definition: "Time spent waiting for a service." },
    ],
  });
  await expect(page.locator("[data-label]").first()).toHaveValue("Waiting");
  await expect(indicator(book)).toBeHidden();
  await expect(sidebarIcon(page)).toBeHidden();
  await button(page, "Use these labels").click();
  const scope = page.getByRole("dialog"),
    send = button(scope, "Send to bot for coding");
  await expect(scope).not.toBeVisible();
  await expect(button(page, "Code manually")).toBeEnabled();
  expect(sent).toEqual(["codebook"]);
  await button(page, "Code with the bot").click();
  await expect(send).toBeVisible();
  await expect(scope).toContainText("travel.txt");
  expect(sent).toEqual(["codebook"]);
  const first = await holdRequest(page, () => send.click());
  const coding = indicator(page.locator(".iv-review"));
  await expect(coding).toContainText(/1 of 2/);
  await expect(sidebarIcon(page)).toBeVisible();
  await button(page, "Pause after this batch").click();
  await expect(coding).toContainText(/paus/i);
  await reply(first, { suggestions: [] });
  await expect(button(page, "Resume coding")).toBeVisible();
  await expect(coding).toBeHidden();
  await expect(sidebarIcon(page)).toBeHidden();
  await button(page, "Resume coding").click();
  const second = await holdRequest(page, () => send.click());
  await expect(coding).toContainText(/2 of 2/);
  await reply(second, { suggestions: [] });
  await expect(button(page, "Review suggested coding")).toBeVisible();
  await expect(coding).toBeHidden();
  await expect(sidebarIcon(page)).toBeHidden();
});
