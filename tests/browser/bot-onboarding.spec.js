import { test, expect } from "@playwright/test";

const gateway = "https://tutor.example.test";

async function openSurveyChat(page) {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Upload Qualtrics export/ }).click();
  await (
    await picker
  ).setFiles({
    name: "workshop.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Do you feel heard?,Optional contact\n2026,2026,Yes,first@example.invalid\n2026,2026,No,second@example.invalid",
    ),
  });
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  return page.locator("#data-bot");
}

test("a new student unlocks the panel before seeing the optional focus prompt and chat", async ({
  page,
}) => {
  let signIns = 0;
  const requests = [];
  await page.route(gateway + "/session", (route) => {
    signIns++;
    const allowed = route.request().postDataJSON().code === "demo-course";
    return route.fulfill({
      status: allowed ? 200 : 403,
      json: allowed
        ? { token: "test-session" }
        : { error: "Check the course code." },
    });
  });
  await page.route(gateway + "/ask", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "answer",
          readingChoices: { left: 999 },
          explanation: "All 700 respondents answered Maybe.",
        }),
      },
    });
  });

  const panel = await openSurveyChat(page);
  await expect(panel.locator("#course")).toBeVisible();
  await expect(panel.locator("input:visible, textarea:visible")).toHaveCount(1);
  await expect(panel.locator("#question")).toBeHidden();
  await expect(panel.locator(".chatlog")).toBeHidden();
  await expect(panel.getByText("Help settings", { exact: true })).toBeHidden();
  await expect(panel.locator('[data-act="editfocus"]')).toBeHidden();
  await expect(panel.locator('[data-act="send"]')).toBeHidden();

  await panel.locator("#course").fill("wrong");
  await panel.getByRole("button", { name: /unlock/i }).click();
  await expect(
    page.getByText("Check the course code.", { exact: true }).first(),
  ).toBeVisible();
  await expect(panel.locator("#question")).toBeHidden();
  await panel.locator("#course").fill("demo-course");
  await panel.getByRole("button", { name: /unlock/i }).click();

  await expect(panel.locator("#course")).toBeHidden();
  const puzzle = panel.getByLabel(/research question or puzzle/i);
  await expect(puzzle).toBeVisible();
  await expect(panel.locator("#question")).toBeVisible();
  expect(
    await puzzle.evaluate((el) =>
      Boolean(
        el.compareDocumentPosition(document.querySelector("#question")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  await panel.getByRole("button", { name: /skip for now/i }).click();
  await expect(panel.locator("#question")).toBeVisible();
  await expect(panel.getByText("Help settings", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);

  await panel
    .locator("#question")
    .fill("What do the current responses tell us?");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.locator(".msg-assistant").last()).toContainText(
    "1 of 2 valid responses",
  );
  expect(requests).toHaveLength(1);
  expect(JSON.stringify(requests[0])).not.toContain("@example.invalid");
  expect(
    requests[0].context.fields.find((f) => f.name === "Optional contact")
      .binaryOutcome,
  ).toBe(true);
  await expect(panel.locator(".msg-assistant").last()).not.toContainText("700");

  await panel.locator('[data-act="closebot"]').click();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  await expect(panel.locator("#question")).toBeVisible();
  await expect(panel.locator(".msg-assistant").last()).toContainText(
    "1 of 2 valid responses",
  );
  expect(signIns).toBe(2);
});

test("students can add their research question and inspect help modes with mouse and keyboard", async ({
  page,
}) => {
  await page.route(gateway + "/session", (route) =>
    route.fulfill({ json: { token: "test-session" } }),
  );
  const requests = [];
  await page.route(gateway + "/ask", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "answer",
          explanation:
            "The selected question asks whether students feel heard.",
        }),
      },
    });
  });
  const panel = await openSurveyChat(page);
  await panel.locator("#course").fill("demo-course");
  await panel.getByRole("button", { name: /unlock/i }).click();
  const focus =
    "Does access to student representatives affect whether students feel heard?";
  await panel.getByLabel(/research question or puzzle/i).fill(focus);
  await panel.getByRole("button", { name: "Save", exact: true }).click();

  const openSettings = () =>
    panel.getByRole("button", { name: "Help settings", exact: true }).click();
  await openSettings();
  const dialog = page.getByRole("dialog");
  const hints = dialog.getByRole("radio", {
    name: "Contextual hints",
    exact: true,
  });
  const guided = dialog.getByRole("radio", {
    name: "Guided exploration",
    exact: true,
  });
  const onRequest = dialog.getByRole("radio", {
    name: "Help on request",
    exact: true,
  });
  await expect(hints).toBeChecked();
  const tooltipFor = async (radio) => {
    const id = await radio.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    return page.locator('[id="' + id + '"]');
  };
  await guided.focus();
  await expect(await tooltipFor(guided)).toBeVisible();
  await hints.focus();
  await onRequest.hover();
  await expect(await tooltipFor(onRequest)).toBeVisible();
  await onRequest.check();
  await dialog.getByRole("button", { name: "Save settings" }).click();
  await expect(dialog).toBeHidden();
  await openSettings();
  await expect(onRequest).toBeChecked();
  await dialog.getByRole("button", { name: "Save settings" }).click();

  await panel
    .locator("#question")
    .fill("What does my current survey question measure?");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.locator(".msg-assistant").last()).toContainText(
    "feel heard",
  );
  expect(requests.at(-1).context.projectFocus).toBe(focus);
  expect(requests.at(-1).mode).toBe("request");
});

test("an expired workshop session returns to the code prompt", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("dv-session", "old.1000.signature"),
  );
  const panel = await openSurveyChat(page);
  await expect(panel.locator("#course")).toBeFocused();
  await expect(panel.locator("#question")).toHaveCount(0);
});

test("interview coding requests in chat open the requested scope for confirmation", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  const requests = [];
  await page.route(gateway + "/ask", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { answer: '{"suggestions":[]}' } });
  });
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Upload uncoded transcripts/ })
    .click();
  await (
    await picker
  ).setFiles(
    ["River", "Forest", "Coast"].map((name) => ({
      name: name + ".txt",
      mimeType: "text/plain",
      buffer: Buffer.from("We joined the public meeting at " + name + "."),
    })),
  );
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  const panel = page.locator("#data-bot");
  for (const [request, scope] of [
    ["Suggest inductive labels for all my interviews", "all"],
    ["Suggest codes from several transcripts", "selected"],
    ["Suggest labels for this interview", "current"],
  ]) {
    await panel.locator("#question").fill(request);
    await panel.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("#iv-scope")).toHaveValue(scope);
    await expect(
      page.getByRole("button", { name: "Send selected passages" }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
  }
  expect(requests).toHaveLength(0);
});
