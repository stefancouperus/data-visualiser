import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { corpus, texts } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const btn = (page, name) => page.getByRole("button", { name, exact: true });
const dialog = (page) => page.getByRole("dialog");
const repeated = "I waited, and later I waited again.";
const other = "The last bus was cancelled.";

async function importFiles(page, files, button) {
  await page.goto("/");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(files);
  await expect(page.locator(".iv-paper")).toBeVisible();
}
async function openProject(page, project) {
  await importFiles(
    page,
    {
      name: "journeys.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    },
    "Open a saved project",
  );
}
async function download(page) {
  const event = page.waitForEvent("download");
  await btn(page, "Save coding project").click();
  const bytes = [];
  for await (const chunk of await (await event).createReadStream())
    bytes.push(chunk);
  return JSON.parse(Buffer.concat(bytes));
}
function example() {
  const d = corpus(
    "Train journeys",
    [...texts("North", [repeated, other]), ...texts("East", [repeated])],
    ["North", "East"],
  );
  d.coding = {
    mode: "deductive",
    book: [
      { label: "Delay", definition: "A wait for transport" },
      { label: "Cancellation", definition: "A service did not run" },
    ],
  };
  return {
    ...fresh(),
    name: "Journeys",
    active: d.id,
    datasets: [d],
    views: [newView(d), newView(d)],
  };
}
async function manage(page, label) {
  await page.locator("[data-act=iv-editbook]").click();
  const picker = page.locator("#iv-label-choice");
  if (label) await picker.selectOption({ label });
  else await picker.selectOption("");
}
async function saveLabel(page, label, definition) {
  await page.locator("#iv-label-name").fill(label);
  await page.locator("#iv-label-meaning").fill(definition);
  await btn(page, "Save label").click();
  await expect(dialog(page)).not.toBeVisible();
}
// Place a browser Range at offsets in the rendered transcript, including when
// earlier annotations have split the paragraph into multiple text nodes.
async function markWords(page, from, start, to, end) {
  await page.locator(".iv-text").evaluate(
    (root, arg) => {
      const paragraphs = root.querySelectorAll("[data-iv-text]");
      function point(index, offset) {
        const walker = document.createTreeWalker(
          paragraphs[index],
          NodeFilter.SHOW_TEXT,
        );
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (offset <= node.length) return [node, offset];
          offset -= node.length;
        }
        throw Error("Selection exceeds the length of this passage.");
      }
      const range = document.createRange();
      range.setStart(...point(arg.from, arg.start));
      range.setEnd(...point(arg.to, arg.end));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { from, start, to, end },
  );
}
async function selectRange(page, from, start, to, end) {
  await markWords(page, from, start, to, end);
  await page.locator("[data-act=iv-manual]").click();
}
async function savePassage(page) {
  await btn(page, "Save passage coding").click();
  await expect(dialog(page)).not.toBeVisible();
}

test("code a repeated quotation without a bot, revise its labels, and reopen the saved highlights", async ({
  page,
}) => {
  const network = [];
  page.on("request", (request) => {
    if (request.url().includes("tutor.example.test"))
      network.push(request.url());
  });
  await importFiles(
    page,
    [
      {
        name: "North.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(repeated + "\n" + other),
      },
      {
        name: "East.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(repeated),
      },
    ],
    /Upload uncoded transcripts/,
  );
  await btn(page, "Enter labels manually").click();
  await page.locator("[data-label]").fill("Queue");
  await page.locator("[data-definition]").fill("Time waiting in line");
  await btn(page, "Add label").click();
  await page.locator("[data-label]").nth(1).fill("Repeated wait");
  await page.locator("[data-definition]").nth(1).fill("Returning to a queue");
  await btn(page, "Use these labels").click();
  await expect(btn(page, "Code manually")).toBeEnabled();
  await expect(page.locator(".iv-legend")).toContainText("Queue");
  const quote = "I waited",
    start = repeated.lastIndexOf(quote);
  await markWords(page, 0, start, 0, start + quote.length);
  await btn(page, "Code manually").click();
  await expect(dialog(page)).toContainText(quote);
  await dialog(page)
    .getByRole("checkbox", { name: "Queue", exact: true })
    .check();
  await savePassage(page);

  let saved = await download(page);
  let d = saved.datasets[0];
  const first = d.passages.find((p) => p.source === "North.txt" && p.parent);
  expect(first).toMatchObject({ text: quote, start, codes: ["Queue"] });
  expect(d.passages.filter((p) => p.codes.length)).toHaveLength(1);
  await openProject(page, saved);
  const excerpt = page.locator(
    `[data-act=iv-excerpt][data-id="${first.parent}"][data-start="${start}"]`,
  );
  await expect(excerpt).toBeVisible();
  await excerpt.click();
  await expect(
    dialog(page).getByRole("checkbox", { name: "Queue", exact: true }),
  ).toBeChecked();
  await dialog(page)
    .getByRole("checkbox", { name: "Queue", exact: true })
    .uncheck();
  await expect(page.locator("#iv-new")).toHaveCount(0);
  await dialog(page)
    .getByRole("checkbox", { name: "Repeated wait", exact: true })
    .check();
  await savePassage(page);

  await manage(page, "Repeated wait");
  await saveLabel(
    page,
    "Repeated delay",
    "The participant had to wait more than once",
  );
  saved = await download(page);
  d = saved.datasets[0];
  expect(d.passages.find((p) => p.id === first.id)).toMatchObject({
    text: quote,
    start,
    codes: ["Repeated delay"],
  });
  await openProject(page, saved);
  await page
    .locator(
      `[data-act=iv-excerpt][data-id="${first.parent}"][data-start="${start}"]`,
    )
    .click();
  await dialog(page)
    .getByRole("checkbox", { name: "Repeated delay", exact: true })
    .uncheck();
  await savePassage(page);
  const cleared = (await download(page)).datasets[0];
  expect(cleared.passages.flatMap((p) => p.codes)).toEqual([]);
  expect(cleared.passages.filter((p) => !p.parent).map((p) => p.text)).toEqual([
    repeated,
    other,
    repeated,
  ]);
  await expect(page.locator(".iv-legend")).toContainText("Repeated delay");
  expect(network).toEqual([]);
});

test("renaming and removing a bot or imported label updates every interview and its saved views", async ({
  page,
}) => {
  const project = example();
  const d = project.datasets[0];
  for (const p of d.passages.filter((p) => p.text === repeated)) {
    p.codes = ["Delay"];
    p.codingEvidence = [{ code: "Delay", quote: "I waited" }];
  }
  d.passages[1].codes = ["Cancellation"];
  const view = { ...newView(d), x: "Delay", task: "one" };
  project.views = [view, { ...view }];
  project.savedVisuals = [
    { name: "Across interviews", dataset: d.id, view: { ...view } },
  ];
  await openProject(page, project);
  await manage(page, "Delay");
  await saveLabel(page, "Waiting", "An extended wait for transport");
  let saved = await download(page);
  let updated = saved.datasets[0];
  expect(
    updated.passages
      .filter((p) => p.text === repeated)
      .map((p) => [p.codes, p.codingEvidence]),
  ).toEqual(
    Array(2).fill([["Waiting"], [{ code: "Waiting", quote: "I waited" }]]),
  );
  expect(saved.savedVisuals[0].view.x).toBe("Waiting");
  expect(updated.coding.book).toContainEqual({
    label: "Waiting",
    definition: "An extended wait for transport",
  });
  await openProject(page, saved);
  await manage(page, "Waiting");
  await page.locator("#iv-label-delete").click();
  await expect(dialog(page)).toContainText("Waiting");
  await btn(page, "Remove label").click();
  await expect(dialog(page)).not.toBeVisible();
  saved = await download(page);
  updated = saved.datasets[0];
  expect(updated.passages.flatMap((p) => p.codes)).toEqual(["Cancellation"]);
  expect(updated.passages.flatMap((p) => p.codingEvidence || [])).toEqual([]);
  expect(saved.savedVisuals[0].view.x).not.toBe("Waiting");
  await openProject(page, saved);
  await expect(page.locator(".iv-legend")).not.toContainText("Waiting");
  await expect(page.locator(".iv-legend")).toContainText("Cancellation");
});

test("manual edits during a saved bot draft survive its review and the next project download", async ({
  page,
}) => {
  const project = example();
  const d = project.datasets[0];
  const [first, second, third] = d.passages;
  const match = (p, code, quote) => ({
    id: p.id,
    code,
    quote,
    definition: "",
    reason: "Quoted in this passage",
  });
  d.interviews = {
    source: "North",
    done: [],
    method: "book",
    established: true,
    draft: {
      source: "North",
      sources: ["North", "East"],
      sample: false,
      ids: null,
      originalOnly: true,
      next: 1,
      total: 1,
      matches: [
        match(first, "Delay", "I waited"),
        match(second, "Cancellation", "cancelled"),
        match(third, "Delay", "I waited"),
      ],
    },
  };
  await openProject(page, project);
  await manage(page, "Delay");
  await saveLabel(page, "Queue time", "A wait for transport");
  await page
    .locator("[data-act=iv-select]")
    .filter({ hasText: "Passage 1" })
    .click();
  await page.locator("[data-act=iv-manual]").click();
  await dialog(page)
    .getByRole("checkbox", { name: "Queue time", exact: true })
    .check();
  await savePassage(page);
  const pending = await download(page);
  expect(pending.datasets[0].passages[0].codes).toEqual(["Queue time"]);
  expect(pending.datasets[0].passages[2].codes).toEqual([]);
  await openProject(page, pending);
  await btn(page, "Review suggested coding").click();
  await expect(
    dialog(page).locator(".iv-match").filter({ hasText: "Delay" }),
  ).toHaveCount(0);
  await btn(page, "Apply reviewed coding").click();
  const final = (await download(page)).datasets[0];
  expect(final.interviews.draft).toBeUndefined();
  expect(final.passages.map((p) => p.codes)).toEqual([
    ["Queue time"],
    ["Cancellation"],
    ["Queue time"],
  ]);
  expect(final.passages[0].codingEvidence || []).toEqual([]);
  expect(final.passages[2].codingEvidence).toEqual([
    { code: "Queue time", quote: "I waited" },
  ]);
});

test("a cross-paragraph selection keeps existing bot evidence and can be corrected at quotation level", async ({
  page,
}) => {
  const project = example(),
    d = project.datasets[0],
    [first, , last] = d.passages;
  const word = "I waited again.",
    start = repeated.indexOf(word);
  for (const p of [first, last]) {
    p.codes = ["Delay"];
    p.codingEvidence = [{ code: "Delay", quote: word }];
  }
  await openProject(page, project);
  await selectRange(page, 0, start, 1, 3);
  await expect(dialog(page).locator("blockquote")).toHaveText([word, "The"]);
  const existing = dialog(page).getByRole("checkbox", {
    name: "Delay",
    exact: true,
  });
  expect(await existing.evaluate((el) => el.indeterminate)).toBe(true);
  await dialog(page)
    .getByRole("checkbox", { name: "Cancellation", exact: true })
    .check();
  await savePassage(page);
  let updated = (await download(page)).datasets[0];
  expect(
    updated.passages.filter((p) => p.parent).map((p) => [p.text, p.codes]),
  ).toEqual([
    [word, ["Cancellation"]],
    ["The", ["Cancellation"]],
  ]);
  expect(
    updated.passages.find((p) => p.id === first.id).codingEvidence,
  ).toEqual([{ code: "Delay", quote: word }]);
  await page
    .locator(
      `[data-act=iv-excerpt][data-id="${first.id}"][data-start="${start}"]`,
    )
    .click();
  await dialog(page)
    .getByRole("checkbox", { name: "Delay", exact: true })
    .uncheck();
  await savePassage(page);
  updated = (await download(page)).datasets[0];
  expect(updated.passages.find((p) => p.id === first.id).codes).toEqual([]);
  expect(
    updated.passages.find((p) => p.id === first.id).codingEvidence || [],
  ).toEqual([]);
  expect(updated.passages.find((p) => p.id === last.id).codingEvidence).toEqual(
    [{ code: "Delay", quote: word }],
  );
  expect(
    updated.passages
      .filter((p) => p.parent)
      .every((p) => p.codes.join() === "Cancellation"),
  ).toBe(true);
});

test("a student's edit during a live request survives resuming the same batch", async ({
  page,
}) => {
  const project = example(),
    requests = [];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let release, arrived;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const received = new Promise((resolve) => {
    arrived = resolve;
  });
  await page.route("https://tutor.example.test/ask", async (route) => {
    const { context } = route.request().postDataJSON();
    requests.push(context);
    const initial = requests.length === 1;
    if (initial) {
      arrived();
      await held;
    }
    const [{ id, text }] = context.passages;
    await route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: [
            {
              id,
              code: initial ? "Delay" : "Waiting",
              quote: text,
              reason: "A wait",
            },
          ],
        }),
      },
    });
  });
  try {
    await openProject(page, project);
    await page.locator("[data-act=iv-auto]").click();
    await btn(page, "Send to bot for coding").click();
    await received;
    await expect(btn(page, "Pause after this batch")).toBeVisible();
    await manage(page, "Delay");
    await saveLabel(page, "Waiting", "A wait for transport");
    await page.locator("[data-act=iv-select]").nth(1).click();
    await page.locator("[data-act=iv-manual]").click();
    await dialog(page)
      .getByRole("checkbox", { name: "Cancellation", exact: true })
      .check();
    await savePassage(page);
    release();
    await btn(page, "Resume coding").click();
    await btn(page, "Send to bot for coding").click();
    await btn(page, "Review suggested coding").click();
    expect(requests).toHaveLength(2);
    expect(requests[1].guide.vocabulary.map((entry) => entry.label)).toContain(
      "Waiting",
    );
    expect(requests[1].passages[1].codes).toEqual(["Cancellation"]);
    await expect(dialog(page).locator(".iv-match")).toHaveCount(1);
    await expect(dialog(page).locator(".iv-match")).toContainText("Waiting");
    await btn(page, "Apply reviewed coding").click();
    const final = (await download(page)).datasets[0];
    expect(final.passages.map((p) => p.codes)).toEqual([
      ["Waiting"],
      ["Cancellation"],
      [],
    ]);
  } finally {
    release();
  }
});

test("a workspace rerender keeps the highlighted words and their original occurrence", async ({
  page,
}) => {
  const project = example();
  const [
    {
      passages: [first],
    },
  ] = project.datasets;
  await openProject(page, project);
  const quote = "I waited",
    start = repeated.lastIndexOf(quote);
  await markWords(page, 0, start, 0, start + quote.length);
  await expect
    .poll(() => page.evaluate(() => window.getSelection().toString()))
    .toBe(quote);
  await btn(page, "Toggle sidebar").evaluate((button) => button.click());
  await expect(page.locator(".shell")).toHaveClass(/compact/);
  await expect
    .poll(() => page.evaluate(() => window.getSelection().toString()))
    .toBe(quote);
  await page.locator("[data-act=iv-manual]").click();
  await expect(dialog(page).locator("blockquote")).toHaveText(quote);
  await dialog(page)
    .getByRole("checkbox", { name: "Delay", exact: true })
    .check();
  await savePassage(page);
  const updated = (await download(page)).datasets[0];
  expect(updated.passages.filter((p) => p.codes.length)).toMatchObject([
    { source: "North", parent: first.id, start, text: quote, codes: ["Delay"] },
  ]);
});

test("open the plotted evidence in its transcript, edit it and return to the same chart", async ({
  page,
}) => {
  const project = example(),
    d = project.datasets[0];
  d.passages[0].codes = ["Delay"];
  d.passages[1].codes = ["Cancellation"];
  d.passages[2].codes = ["Delay"];
  d.interviews = {
    source: "North",
    done: ["North", "East"],
    method: "book",
    established: true,
    finished: false,
  };
  project.confirmed = [d.id];
  Object.assign(project.views[0], {
    task: "one",
    x: "Cancellation",
    chart: "dots",
    title: "Service interruptions",
  });
  await openProject(page, project);
  await btn(page, "Coding complete · explore themes").click();
  const chart = page.locator("#graphic0");
  await expect(chart).toContainText("Service interruptions");
  await btn(page, "Read and code passages").click();
  const match = page.locator(`[name=pickp][value="${d.passages[2].id}"]`);
  await match.check();
  await btn(page, "Open passage in transcript").click();
  await expect(page.locator(".iv-paper header h2")).toHaveText("East");
  await expect(page.locator(".iv-selected")).toHaveAttribute(
    "data-iv-id",
    d.passages[2].id,
  );
  await page.locator("[data-act=iv-manual]").click();
  await dialog(page)
    .getByRole("checkbox", { name: "Cancellation", exact: true })
    .check();
  await savePassage(page);
  const saved = await download(page);
  expect(saved.views[0]).toMatchObject({
    task: "one",
    x: "Cancellation",
    chart: "dots",
    title: "Service interruptions",
  });
  expect(saved.datasets[0].passages[2].codes).toEqual([
    "Delay",
    "Cancellation",
  ]);
  await btn(page, "Mark this interview as checked").click();
  await btn(page, "Mark as checked").click();
  await btn(page, "Coding complete · explore themes").click();
  await expect(chart).toContainText("Service interruptions");
  await expect(
    page.getByRole("combobox", { name: "Choose a theme or code", exact: true }),
  ).toHaveValue("Cancellation");
  await expect(chart).toContainText("East");
});
