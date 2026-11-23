import { test, expect } from "@playwright/test";

const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
const file = (name, lines) => ({
  name: name + ".txt",
  mimeType: "text/plain",
  buffer: Buffer.from(lines.join("\n")),
});
const originalLabel = "Time pressure";
const approved = {
  label: "Work and voting hours",
  definition: "A paid shift limits the time available to cast a ballot.",
};
const examples = [
  file("Sanne", [
    "A shift at the supermarket stopped me getting to the polling station.",
    "I see voting as a duty.",
    "My late shift finished after the polling station closed.",
    "In my family voting is a civic duty.",
  ]),
  file("Lina", [
    "My shift ran late and I missed the vote.",
    "I feel a duty to take part in elections.",
    "I could vote after a colleague covered my shift.",
    "I see a duty to have a say in decisions that affect us.",
  ]),
  file("Iris", [
    "I swapped a shift to make it to the polling station.",
    "I grew up thinking voting was a duty.",
  ]),
];

async function downloadProject(page) {
  const next = page.waitForEvent("download");
  await button(page, "Save coding project").click();
  const chunks = [];
  for await (const piece of await (await next).createReadStream())
    chunks.push(piece);
  return JSON.parse(Buffer.concat(chunks));
}

async function openProject(page, project) {
  await page.goto("/");
  const chosen = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await chosen
  ).setFiles({
    name: "interview-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
}

test("two named interviews yield an editable, recoverable draft and the approved vocabulary can code all three", async ({
  page,
}) => {
  const calls = [];
  let finishFirst;
  const firstRelease = new Promise((resolve) => {
    finishFirst = resolve;
  });
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", async (route) => {
    const { context, skill } = route.request().postDataJSON();
    expect(skill).toBe("coding");
    calls.push(context);
    if (calls.length === 1) await firstRelease;
    const suggestions = context.passages.flatMap((passage) => {
      const shift = passage.text.includes("shift");
      const suggestion = (code, definition) => ({
        id: passage.id,
        code,
        definition,
        quote: passage.text,
      });
      if (context.guide.mode === "inductive")
        return [
          shift
            ? suggestion(originalLabel, "Little time to vote.")
            : suggestion("Civic duty", "A sense of obligation."),
        ];
      return [
        ...(shift
          ? [
              suggestion(
                approved.label,
                "The bot cannot replace the approved meaning.",
              ),
            ]
          : []),
        suggestion(
          shift ? originalLabel : "Civic duty",
          "This label was not approved.",
        ),
      ];
    });
    await route.fulfill({ json: { answer: JSON.stringify({ suggestions }) } });
  });

  await page.goto("/");
  const picked = page.waitForEvent("filechooser");
  await button(page, "Upload uncoded transcripts").click();
  await (await picked).setFiles(examples);
  await button(page, "Data bot").click();
  await page
    .locator("#question")
    .fill("Suggest inductive labels from Sanne and Lina.");
  await button(page, "Send").click();
  const dialog = page.getByRole("dialog");
  await expect(page.locator("#iv-scope")).toHaveValue("selected");
  await expect(dialog.getByLabel("Sanne.txt", { exact: true })).toBeChecked();
  await expect(dialog.getByLabel("Lina.txt", { exact: true })).toBeChecked();
  await expect(
    dialog.getByLabel("Iris.txt", { exact: true }),
  ).not.toBeChecked();
  expect(calls).toHaveLength(0);
  await button(dialog, "Send selected passages").click();
  await expect.poll(() => calls.length).toBe(1);
  await page.locator("[data-act=closebot]").click();
  await expect(page.locator(".iv-workflow .bot-working")).toBeVisible();
  finishFirst();

  const workspace = page.locator(".iv-workflow");
  const review = workspace.locator("[data-act=iv-review]");
  await expect(review).toBeVisible();
  await expect(workspace).toContainText(originalLabel);
  const sampling = calls.filter((c) => c.guide.mode === "inductive");
  expect(sampling).toHaveLength(2);
  expect(
    new Set(sampling.flatMap((c) => c.passages.map((p) => p.source))),
  ).toEqual(new Set(["Sanne.txt", "Lina.txt"]));
  await review.click();
  const retained = dialog.locator('[data-draft-code="Time pressure"]');
  const rejected = dialog.locator('[data-draft-code="Civic duty"]');
  await retained.locator("[name=iv-draft-label]").fill(approved.label);
  await retained
    .locator("[name=iv-draft-definition]")
    .fill(approved.definition);
  await rejected.locator("[name=iv-keep-label]").uncheck();
  await expect(dialog.locator("[name=iv-code-examples]")).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(workspace).toContainText(approved.label);
  await expect(page.locator("[data-iv-storage]").first()).toContainText(
    "saved on this device",
  );
  const portable = await downloadProject(page);
  const pending = portable.datasets[0];
  expect(pending.passages.every((p) => p.codes.length === 0)).toBe(true);
  expect(pending.coding?.book || []).toEqual([]);

  await page.reload();
  await button(page, "Resume coding project").click();
  await workspace.locator("[data-act=iv-review]").click();
  await expect(retained.locator("[name=iv-draft-label]")).toHaveValue(
    approved.label,
  );
  await expect(retained.locator("[name=iv-draft-definition]")).toHaveValue(
    approved.definition,
  );
  await expect(rejected.locator("[name=iv-keep-label]")).not.toBeChecked();
  await button(dialog, "Close").click();

  await openProject(page, portable);
  await workspace.locator("[data-act=iv-review]").click();
  await expect(retained.locator("[name=iv-draft-label]")).toHaveValue(
    approved.label,
  );
  await expect(rejected.locator("[name=iv-keep-label]")).not.toBeChecked();
  await button(dialog, "Use these labels").click();
  const established = (await downloadProject(page)).datasets[0];
  expect(established.coding.book).toEqual([approved]);
  expect(established.passages.every((p) => p.codes.length === 0)).toBe(true);
  expect(calls).toHaveLength(2);

  await button(workspace, "Code with the bot").click();
  await dialog.locator("#iv-scope").selectOption("all");
  await button(dialog, "Send to bot for coding").click();
  await review.click();
  const matching = calls.filter((c) => c.guide.mode === "deductive");
  expect(
    new Set(matching.flatMap((c) => c.passages.map((p) => p.source))),
  ).toEqual(new Set(["Sanne.txt", "Lina.txt", "Iris.txt"]));
  for (const { guide } of matching)
    expect(guide.vocabulary).toEqual([approved]);
  const third = dialog.locator('[data-review-source="Iris.txt"]');
  await expect(third.locator("[name=iv-match]:checked")).toHaveCount(1);
  await button(dialog, "Apply reviewed coding").click();
  const final = (await downloadProject(page)).datasets[0];
  expect(final.coding.book).toEqual([approved]);
  for (const passage of final.passages) {
    expect(passage.codes).toEqual(
      passage.text.includes("shift") ? [approved.label] : [],
    );
    if (passage.codes.length)
      expect(passage.codingEvidence).toEqual([
        { code: approved.label, quote: passage.text },
      ]);
  }
});

test("the bot asks who the second interview is before sending passages", async ({
  page,
}) => {
  const requests = [];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: { answer: JSON.stringify({ suggestions: [] }) },
    });
  });
  await page.goto("/");
  const files = page.waitForEvent("filechooser");
  await button(page, "Upload uncoded transcripts").click();
  await (await files).setFiles(examples);
  await button(page, "Data bot").click();
  await page
    .locator("#question")
    .fill("Suggest labels from Sanne and a second interview");
  await button(page, "Send").click();
  const scope = page.getByRole("dialog");
  const send = button(scope, "Send selected passages");
  await expect(scope.locator("#iv-scope")).toHaveValue("selected");
  await expect(scope.getByLabel("Sanne.txt", { exact: true })).toBeChecked();
  await expect(scope.locator("[name=iv-source-pick]:checked")).toHaveCount(1);
  await expect(scope.locator("#iv-scope-summary")).toContainText(
    "Tick the second interview",
  );
  await send.click();
  await expect(scope.getByRole("alert")).toContainText("both interviews");
  expect(requests).toEqual([]);
  await scope.getByLabel("Iris.txt", { exact: true }).check();
  await expect(scope.getByLabel("Lina.txt", { exact: true })).not.toBeChecked();
  await expect(scope.locator("#iv-scope-summary")).not.toContainText(
    "Tick the second interview",
  );
  expect(requests).toEqual([]);
  await send.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(new Set(requests[0].context.passages.map((p) => p.source))).toEqual(
    new Set(["Sanne.txt", "Iris.txt"]),
  );
});
