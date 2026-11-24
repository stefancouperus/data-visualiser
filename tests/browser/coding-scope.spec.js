import { backupContents } from "./backup-helpers.js";
import { test, expect } from "@playwright/test";
import { fresh } from "../../src/project.js";
import { corpus, texts } from "../../src/import.js";
import { newView } from "../../src/analysis.js";

const fare = "The fare has doubled.";
const waits = "I waited for an hour.";
const quiet = "The sky was clear.";
const captions = { Fares: "The cost of travel", Delays: "Time spent waiting" };
const samples = {
  North: [fare, waits],
  East: [fare, waits],
  South: [fare, quiet],
  West: [quiet],
};
const button = (page, name) => page.getByRole("button", { name, exact: true });
const submit = (page) => page.locator("#modalform button[type=submit]").click();

function project(lines = samples, established = true) {
  const d = corpus(
    "Journeys",
    Object.entries(lines).flatMap(([source, ps]) => texts(source, ps)),
    Object.keys(lines),
  );
  if (established)
    d.coding = {
      mode: "deductive",
      book: Object.entries(captions).map(([label, definition]) => ({
        label,
        definition,
      })),
    };
  return {
    ...fresh(),
    name: "Travel interviews",
    active: d.id,
    datasets: [d],
    views: [newView(d), newView(d)],
  };
}

async function open(page, project) {
  await page.goto("/");
  const picker = page.waitForEvent("filechooser");
  await button(page, "Open a saved project").click();
  await (
    await picker
  ).setFiles({
    name: "travel.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator(".iv-progress")).toBeVisible();
}

async function save(page) {
  const download = page.waitForEvent("download");
  await button(page, "Save coding project").click();
  const chunks = [];
  for await (const chunk of await (await download).createReadStream())
    chunks.push(chunk);
  return backupContents(Buffer.concat(chunks));
}

function match(p) {
  const code = p.text === fare ? "Fares" : p.text === waits ? "Delays" : null;
  if (!code) return [];
  return [
    {
      id: p.id,
      code,
      quote: p.text,
      definition: captions[code],
      reason: captions[code],
    },
  ];
}

// This controlled responder tests transport, review and attribution independently of model variability.
async function recordBot(page, { failSecond = false } = {}) {
  const calls = [];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", (route) => {
    const { skill, context } = route.request().postDataJSON();
    expect(skill).toBe("coding");
    calls.push(context);
    if (failSecond && calls.length === 2)
      return route.fulfill({ status: 503, json: { error: "Service busy" } });
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: context.passages.flatMap(match),
        }),
      },
    });
  });
  return calls;
}

async function choose(page, action, scope, selected = []) {
  await page.locator(`[data-act=${action}]`).click();
  await page.locator("#iv-scope").selectOption(scope);
  if (scope === "selected") {
    const checkboxes = page.locator("[name=iv-source-pick]");
    for (const input of await checkboxes.all()) {
      await input.setChecked(selected.includes(await input.inputValue()));
    }
  }
}

async function apply(page) {
  await button(page, "Apply reviewed coding").click();
  await expect(page.locator(".iv-review")).toHaveCount(0);
}

function assignments(dataset) {
  return dataset.passages
    .filter((p) => p.codes.length)
    .map((p) => ({
      source: p.source,
      text: p.text,
      codes: p.codes,
      evidence: p.codingEvidence,
    }));
}

function expected(source, text, code) {
  return { source, text, codes: [code], evidence: [{ code, quote: text }] };
}

test("pooled discovery includes and reviews one passage from each of eleven interviews", async ({
  page,
}) => {
  const sources = Array.from({ length: 11 }, (_, i) => `Rider ${i + 1}`);
  const calls = await recordBot(page);
  await open(
    page,
    project(Object.fromEntries(sources.map((s) => [s, [fare, waits]])), false),
  );
  await choose(page, "iv-sample", "all");
  await expect(page.locator("[name=iv-example]:checked")).toHaveCount(11);
  await submit(page);
  await button(page, "Review draft labels").click();
  await page.locator("[name=iv-code-examples]").check();
  const sent = calls.flatMap(({ passages }) => passages);
  expect(sent).toHaveLength(sources.length);
  expect(sent.map((p) => p.source).sort()).toEqual([...sources].sort());
  for (const source of sources) {
    await expect(
      page.locator(`[data-review-source="${source}"] [name=iv-match]:checked`),
    ).toHaveCount(1);
  }
  await button(page, "Use these labels").click();
  const accepted = assignments((await save(page)).datasets[0]);
  expect(accepted).toHaveLength(sources.length);
  expect(accepted.map((p) => p.source).sort()).toEqual([...sources].sort());
});

test("one shared-codebook run stays with the current interview, including when another interview has identical words", async ({
  page,
}) => {
  const calls = await recordBot(page);
  await open(page, project());
  await page.locator('[data-act=iv-source][data-index="1"]').click();
  await choose(page, "iv-auto", "current");
  await submit(page);
  await button(page, "Review suggested coding").click();
  expect(calls.flatMap((c) => c.passages.map((p) => p.source))).toEqual([
    "East",
    "East",
  ]);
  await apply(page);
  expect(assignments((await save(page)).datasets[0])).toEqual([
    expected("East", fare, "Fares"),
    expected("East", waits, "Delays"),
  ]);
});

test("deductive coding sends the chosen interviews only and a review decision belongs to its own interview", async ({
  page,
}) => {
  const calls = await recordBot(page);
  await open(page, project());
  await choose(page, "iv-auto", "selected", ["East", "South", "West"]);
  await submit(page);
  await expect(button(page, "Review suggested coding")).toBeVisible();
  const drafted = (await save(page)).datasets[0];
  expect(drafted.interviews.draft.sources).toEqual(["East", "South", "West"]);
  expect(assignments(drafted)).toEqual([]);
  expect(calls.flatMap((c) => c.passages.map((p) => p.source))).toEqual([
    "East",
    "East",
    "South",
    "South",
    "West",
  ]);
  await button(page, "Review suggested coding").click();
  const south = page.locator('[data-review-source="South"]');
  await south.locator("[name=iv-match]").uncheck();
  await expect(
    page.locator('[data-review-source="West"] [name=iv-match]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-review-source="East"] [name=iv-match]:checked'),
  ).toHaveCount(2);
  await apply(page);
  const accepted = (await save(page)).datasets[0];
  expect(assignments(accepted)).toEqual([
    expected("East", fare, "Fares"),
    expected("East", waits, "Delays"),
  ]);
  expect(accepted.interviews.done).toEqual([]);
});

test("an all-interview draft reopens at the failed batch and keeps its original scope when the project gains an interview", async ({
  page,
}) => {
  const calls = await recordBot(page, { failSecond: true });
  await open(
    page,
    project({
      North: [fare, ...Array(5).fill(quiet), waits],
      East: [fare],
      West: [quiet],
    }),
  );
  await choose(page, "iv-auto", "all");
  await submit(page);
  await expect(button(page, "Resume coding")).toBeVisible();
  await expect(button(page, "+ Add interview")).toBeDisabled();
  const portable = await save(page);
  const saved = portable.datasets[0];
  expect(saved.interviews.draft.next).toBe(1);
  expect(saved.interviews.draft.sources).toEqual(["North", "East", "West"]);
  expect(assignments(saved)).toEqual([]);
  // Reopen a portable copy with an additional source. The old consent covered only the original three.
  saved.sources.push("Later");
  saved.passages.push(...texts("Later", [fare]));
  await open(page, portable);
  await button(page, "Resume coding").click();
  await submit(page);
  await button(page, "Review suggested coding").click();
  expect(calls[0].passages).toHaveLength(6);
  expect(calls[2].passages).toEqual(calls[1].passages);
  const sent = calls.filter((_, i) => i !== 1).flatMap((c) => c.passages);
  expect(sent.map((p) => p.source)).toEqual([
    ...Array(7).fill("North"),
    "East",
    "West",
  ]);
  await expect(page.locator('[data-review-source="Later"]')).toHaveCount(0);
  await apply(page);
  expect(assignments((await save(page)).datasets[0])).toEqual([
    expected("North", fare, "Fares"),
    expected("North", waits, "Delays"),
    expected("East", fare, "Fares"),
  ]);
});

test("inductive sampling combines chosen interviews, honours the passage choices and builds a book usable across all interviews", async ({
  page,
}) => {
  const calls = await recordBot(page);
  const scenario = project(samples, false);
  await open(page, scenario);
  await choose(page, "iv-sample", "selected", ["North", "East", "West"]);
  const passages = scenario.datasets[0].passages;
  const sample = passages.filter(
    (p) =>
      (p.source === "North" && p.text === waits) ||
      (p.source === "East" && p.text === fare) ||
      p.source === "West",
  );
  const ids = sample.map((p) => p.id);
  const options = page.locator("[name=iv-example]");
  for (const input of await options.all())
    await input.setChecked(ids.includes(await input.inputValue()));
  await submit(page);
  await expect(button(page, "Review draft labels")).toBeVisible();
  const pending = (await save(page)).datasets[0];
  expect(new Set(pending.interviews.draft.ids)).toEqual(new Set(ids));
  expect(assignments(pending)).toEqual([]);
  const sent = calls.flatMap((c) => c.passages.map((p) => [p.source, p.text]));
  expect(sent).toHaveLength(sample.length);
  expect(sent).toEqual(
    expect.arrayContaining(sample.map((p) => [p.source, p.text])),
  );
  expect(calls.every((c) => c.guide.mode === "inductive")).toBe(true);
  await button(page, "Review draft labels").click();
  await page.locator("[name=iv-code-examples]").check();
  await button(page, "Use these labels").click();
  expect(assignments((await save(page)).datasets[0])).toEqual([
    expected("North", waits, "Delays"),
    expected("East", fare, "Fares"),
  ]);
  await expect(button(page, "Code with the bot")).toBeEnabled();
  const first = calls.length;
  await choose(page, "iv-auto", "all");
  await submit(page);
  await button(page, "Review suggested coding").click();
  for (const { guide } of calls.slice(first)) {
    expect(guide.mode).toBe("deductive");
    expect(guide.vocabulary.map((entry) => entry.label).sort()).toEqual([
      "Delays",
      "Fares",
    ]);
  }
  await apply(page);
  const coded = (await save(page)).datasets[0];
  expect(assignments(coded)).toEqual([
    expected("North", fare, "Fares"),
    expected("North", waits, "Delays"),
    expected("East", fare, "Fares"),
    expected("East", waits, "Delays"),
    expected("South", fare, "Fares"),
  ]);
});

test("a reopened shared codebook can gain student-approved inductive labels", async ({
  page,
}) => {
  const calls = await recordBot(page);
  const saved = project({ North: [fare, waits], South: [quiet] });
  const d = saved.datasets[0];
  d.coding.book = d.coding.book.filter((entry) => entry.label === "Fares");
  d.interviews = {
    source: "North",
    done: ["North", "South"],
    established: true,
    method: "book",
  };
  await open(page, saved);
  await button(page, "Data bot").click();
  await page
    .locator("#question")
    .fill("Suggest fresh labels across all interviews");
  await button(page, "Send").click();
  await expect(page.locator("#iv-scope")).toHaveValue("all");
  await submit(page);
  await button(page.locator("#data-bot"), "Review draft labels").click();
  expect(calls[0].guide.mode).toBe("inductive");
  await button(page, "Use these labels").click();
  await page.locator("#data-bot [data-act=closebot]").click();
  const updated = (await save(page)).datasets[0];
  expect(updated.coding.book.map((entry) => entry.label)).toEqual([
    "Fares",
    "Delays",
  ]);
  expect(updated.interviews.done).toEqual([]);
  expect(updated.passages.find((p) => p.text === quiet).codes).toEqual([]);
});

test("a chat request using existing codes sends only the approved book and saves no synonyms or translations", async ({
  page,
}) => {
  const calls = [];
  const dutch = "Ik moest een uur wachten.";
  const saved = project({ North: [dutch], South: [quiet] });
  const dataset = saved.datasets[0];
  dataset.interviews = {
    source: "North",
    method: "book",
    established: true,
    done: [],
  };
  dataset.coding.mode = "inductive"; // Older project with stale mode.
  dataset.passages[0].codes = ["Travel diary", "Earlier code"];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", (route) => {
    const { context } = route.request().postDataJSON();
    calls.push(context);
    const source = context.passages.find((p) => p.text === dutch);
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: ["Vertraging", "Late bus", " DELAYS "].map((code) => ({
            id: source.id,
            code,
            quote: dutch,
            definition: "Model-supplied change",
            reason: "The speaker describes waiting.",
          })),
        }),
      },
    });
  });
  await open(page, saved);
  await button(page, "Data bot").click();
  await page
    .locator("#question")
    .fill(
      "Apply the existing codes to both interviews. Do not invent new labels.",
    );
  await button(page, "Send").click();
  await expect(page.locator("#iv-scope")).toHaveValue("all");
  await expect(page.locator("#iv-sample-pick")).toHaveCount(0);
  await submit(page);
  await button(page.locator("#data-bot"), "Review suggested coding").click();
  expect(calls).toHaveLength(1);
  expect(calls[0].guide.mode).toBe("deductive");
  expect(calls[0].guide.limits.newPerBatch).toBe(0);
  expect(calls[0].guide.vocabulary).toEqual(dataset.coding.book);
  expect(calls[0].passages.flatMap((p) => p.codes)).toEqual([]);
  await expect(page.locator("[name=iv-match]")).toHaveCount(1);
  await apply(page);
  await page.locator("#data-bot [data-act=closebot]").click();
  const result = (await save(page)).datasets[0];
  expect(result.coding.book).toEqual(dataset.coding.book);
  expect(result.passages.map((p) => p.codes)).toEqual([
    ["Travel diary", "Earlier code", "Delays"],
    [],
  ]);
  expect(result.passages[0].codingEvidence).toEqual([
    { code: "Delays", quote: dutch },
  ]);
});

test("the coding check and the bot see only the included answers; the saved source stays complete", async ({
  page,
}) => {
  const calls = await recordBot(page);
  const consent = "Interviewer: Can I record this interview?";
  const assent = "Speaker: Yes.";
  const question = "Interviewer: Which journeys changed?";
  await open(
    page,
    project({ Case: [consent, assent, question, fare, waits, quiet] }),
  );
  await expect(page.locator(".iv-text .iv-passage")).toHaveCount(3);
  await expect(page.locator(".iv-paper")).toContainText(
    "3 of 6 passages included for coding",
  );
  await button(page, "Choose passages for coding").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/Passage 1/)).not.toBeChecked();
  await dialog.getByLabel(/Passage 6/).uncheck();
  await button(page, "Save passage selection").click();
  await expect(page.locator(".iv-paper")).toContainText(
    "2 of 6 passages included for coding",
  );
  await expect(page.locator(".iv-text")).not.toContainText(quiet);
  await button(page, "Code with the bot").click();
  await dialog.getByText("Choose passages for this coding run").click();
  await expect(dialog.locator("[name=iv-example]")).toHaveCount(2);
  await dialog.getByLabel(/Passage 5/).uncheck();
  await button(page, "Send to bot for coding").click();
  await button(page, "Review suggested coding").click();
  await expect(dialog.locator(".iv-review-passage")).toHaveCount(1);
  await expect(dialog).toContainText(fare);
  await expect(dialog).not.toContainText(waits);
  await button(page, "Apply reviewed coding").click();
  expect(calls.flatMap((c) => c.passages.map((p) => p.text))).toEqual([fare]);
  await button(page, "Mark this interview as checked").click();
  await button(page, "Mark as checked").click();
  const d = (await save(page)).datasets[0];
  expect(d.passages.map((p) => p.text)).toEqual([
    consent,
    assent,
    question,
    fare,
    waits,
    quiet,
  ]);
  expect(d.passages.filter((p) => p.reviewed).map((p) => p.text)).toEqual([
    fare,
    waits,
  ]);
  expect(d.passages[5].codingIncluded).toBe(false);
});

test("students can customise label colours and organise labels into named categories", async ({
  page,
}) => {
  await open(page, project({ Case: [fare, waits] }));
  const colours = () =>
    page
      .locator(".iv-project-vocabulary .iv-chip")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.style.getPropertyValue("--chip")),
      );
  expect(new Set(await colours()).size).toBe(2);
  await button(page, "Manage categories").click();
  await page.getByLabel("Category name").fill("Experience");
  await button(page, "Save category").click();
  await button(page, "Manage labels").click();
  await page.getByLabel("Choose a label").selectOption({ label: "Fares" });
  await page.getByLabel("Label colour").fill("#734caa");
  await page.getByLabel("Category (optional)").fill("Experience");
  await button(page, "Save label").click();
  const fareChip = page
    .locator(".iv-project-vocabulary .iv-chip")
    .filter({ hasText: "Fares" });
  await expect(fareChip).toHaveAttribute("title", "Category: Experience");
  expect(await colours()).toContain("#734caa");
  await button(page, "Manage categories").click();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Experience");
  await page.getByLabel("Category name").fill("Travel experiences");
  await button(page, "Save category").click();
  await expect(fareChip).toHaveAttribute(
    "title",
    "Category: Travel experiences",
  );
  const style = (await save(page)).datasets[0].coding.labelStyles.find(
    (row) => row.label === "Fares",
  );
  expect(style).toEqual({
    label: "Fares",
    colour: "#734caa",
    category: "Travel experiences",
  });
});

test("a confirmed interviewer tag supplies questions as optional read-only context for identical Dutch answers", async ({
  page,
}) => {
  const first = "KL: Hoe vaak is er contact met verenigingen?";
  const second = "KL: Hoe vaak spreekt u de gemeenteraad?";
  const answer = "[PERSON_3] Maandelijks.";
  const consent = "KL: Mag ik dit interview opnemen?";
  const saved = project({
    Case: [consent, "[PERSON_3] Ja.", first, answer, second, answer],
  });
  const { bookEntries } = await import("../../src/coding.js");
  saved.datasets[0].coding.book = bookEntries(
    ["Clubs", "Councils"].map((category) => ({
      label: "Monthly",
      category,
      definition: "Monthly contact",
    })),
  );
  const calls = [];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", (route) => {
    const { context } = route.request().postDataJSON();
    calls.push(context);
    const suggestions = context.passages.flatMap((p) =>
      !p.precedingQuestion
        ? []
        : [
            {
              id: p.id,
              code:
                p.precedingQuestion === first
                  ? "Clubs › Monthly"
                  : "Councils › Monthly",
              quote: "Maandelijks",
            },
            { id: p.id, code: "Monthly", quote: "Maandelijks" },
            { id: p.id, code: "Clubs › Monthly", quote: p.precedingQuestion },
          ],
    );
    return route.fulfill({ json: { answer: JSON.stringify({ suggestions }) } });
  });
  await open(page, saved);
  await button(page, "Choose passages for coding").click();
  await page.getByLabel("Which speaker is the interviewer?").selectOption("KL");
  await button(page, "Save passage selection").click();
  await expect(page.locator(".iv-paper")).toContainText(
    "2 of 6 passages included for coding",
  );
  for (const include of [false, true]) {
    await button(page, "Code with the bot").click();
    await page
      .getByLabel("Include the preceding interviewer questions as context")
      .setChecked(include);
    await submit(page);
    await button(page, "Review suggested coding").click();
    await expect(page.locator("[name=iv-match]")).toHaveCount(include ? 2 : 0);
    if (include) {
      const firstAnswer = page.locator(".iv-review-passage").first();
      await firstAnswer.locator("details > summary").click();
      await expect(firstAnswer).toContainText(first);
      await expect(firstAnswer).not.toContainText(second);
    }
    await apply(page);
  }
  expect(calls).toHaveLength(2);
  expect(calls[0].passages.every((p) => !p.precedingQuestion)).toBe(true);
  expect(calls[1].passages.map((p) => p.precedingQuestion)).toEqual([
    first,
    second,
  ]);
  expect(
    calls.every((context) => !JSON.stringify(context).includes(consent)),
  ).toBe(true);
  expect(
    assignments((await save(page)).datasets[0]).map((p) => p.codes),
  ).toEqual([["Clubs › Monthly"], ["Councils › Monthly"]]);
});

test("approving an inductive label on part of a long answer saves only that quoted assignment", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", (route) => {
    const { context } = route.request().postDataJSON();
    const suggestions = context.passages
      .filter((p) => p.text.includes("I pay for tickets"))
      .map((p) => ({
        id: p.id,
        code: "Cost",
        quote: "I pay for tickets",
        definition: "Paying for travel",
      }));
    return route.fulfill({ json: { answer: JSON.stringify({ suggestions }) } });
  });
  await open(
    page,
    project(
      { Case: ["I pay for tickets. " + "The room was quiet. ".repeat(133)] },
      false,
    ),
  );
  await page.locator("[data-act=iv-sample]").click();
  await submit(page);
  await button(page, "Review draft labels").click();
  await page.locator("[name=iv-code-examples]").check();
  await button(page, "Use these labels").click();
  const d = (await save(page)).datasets[0];
  expect(d.passages).toHaveLength(2);
  expect(
    assignments(d).map(({ codes, evidence }) => ({ codes, evidence })),
  ).toEqual([
    {
      codes: ["Cost"],
      evidence: [{ code: "Cost", quote: "I pay for tickets" }],
    },
  ]);
});

test("a missed-label check includes coded and uncoded passages, remembers refusals and accepts an empty second reading", async ({
  page,
}) => {
  const setup = project({ North: [fare, waits, quiet], South: [waits] });
  const d = setup.datasets[0];
  const original = d.passages[0];
  original.codes = ["Delays"];
  const calls = [];
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", async (route) => {
    const { skill, context } = route.request().postDataJSON();
    if (skill === "verifyCoding")
      return route.fulfill({
        json: {
          answer: JSON.stringify({ keep: context.candidates.map((c) => c.id) }),
        },
      });
    calls.push(context);
    const rows = context.passages.flatMap((p) => {
      if (p.text === quiet) return [];
      return [
        {
          id: p.id,
          code: p.text === fare ? "Fares" : "Delays",
          quote: p.text,
          reason: "Test match.",
        },
      ];
    });
    await route.fulfill({
      json: { answer: JSON.stringify({ suggestions: rows }) },
    });
  });
  await open(page, setup);
  await choose(page, "iv-second-look", "current");
  await button(page, "Check selected passages").click();
  await button(page, "Review suggested coding").click();
  expect(calls[0].guide.reviewPass).toBe("missed");
  expect(calls[0].passages.map((p) => [p.text, p.codes])).toEqual([
    [fare, ["Delays"]],
    [waits, []],
    [quiet, []],
  ]);
  await expect(page.locator("input[name=iv-match]:checked")).toHaveCount(0);
  await page.locator("input[name=iv-match]").first().check();
  await page.locator("#closeDialog").click();
  const draft = await save(page);
  expect(draft.datasets[0].passages[0].codes).toEqual(["Delays"]);
  await open(page, draft);
  await button(page, "Review suggested coding").click();
  await expect(page.locator("input[name=iv-match]:checked")).toHaveCount(1);
  await button(page, "Finish review").click();
  const copy = await save(page);
  expect(copy.datasets[0].passages.map((p) => p.codes)).toEqual([
    ["Delays", "Fares"],
    [],
    [],
    [],
  ]);
  await open(page, copy);
  await button(page, "Mark this interview as checked").click();
  await button(page, "Mark as checked").click();
  await choose(page, "iv-second-look", "selected", ["North"]);
  await button(page, "Check selected passages").click();
  await button(page, "Review suggested coding").click();
  expect(calls[1].passages.find((p) => p.text === waits).declinedCodes).toEqual(
    ["Delays"],
  );
  await expect(page.locator("input[name=iv-match]")).toHaveCount(0);
  await button(page, "Finish review").click();
  expect((await save(page)).datasets[0].interviews.done).toContain("North");
});

test("a failed evidence check resumes its saved candidates without repeating discovery, and can return none", async ({
  page,
}) => {
  const setup = project({ North: [fare] });
  const skills = [];
  let firstCandidates;
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", async (route) => {
    const { skill, context } = route.request().postDataJSON();
    skills.push(skill);
    if (skill === "coding")
      return route.fulfill({
        json: {
          answer: JSON.stringify({
            suggestions: context.passages.flatMap(match),
          }),
        },
      });
    if (!firstCandidates) {
      firstCandidates = context;
      return route.fulfill({ status: 503, json: { error: "Service busy" } });
    }
    expect(context).toEqual(firstCandidates);
    return route.fulfill({ json: { answer: '{"keep":[]}' } });
  });
  await open(page, setup);
  await button(page, "Check for missed labels").click();
  await button(page, "Check selected passages").click();
  await expect(button(page, "Resume coding")).toBeVisible();
  const recovery = await save(page);
  const d = recovery.datasets[0];
  expect(d.interviews.draft.verifying.suggestions.map((s) => s.code)).toEqual([
    "Fares",
  ]);
  expect(d.interviews.draft.next).toBe(0);
  expect(d.passages[0].codes).toEqual([]);
  await open(page, recovery);
  await button(page, "Resume coding").click();
  await button(page, "Check selected passages").click();
  await button(page, "Review suggested coding").click();
  await expect(
    page.getByText(/second reading could not establish/),
  ).toBeVisible();
  await expect(page.locator("input[name=iv-match]")).toHaveCount(0);
  await button(page, "Finish review").click();
  expect((await save(page)).datasets[0].passages[0].codes).toEqual([]);
  expect(skills).toEqual(["coding", "verifyCoding", "verifyCoding"]);
});
