import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
async function upload(page, route, name, data) {
  await page.goto("/");
  if (!(await page.getByRole("button", { name: route }).isVisible()))
    await page.getByText("Other file types", { exact: true }).click();
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: route }).click();
  await (
    await picker
  ).setFiles({
    name,
    mimeType: "application/octet-stream",
    buffer: Buffer.from(data),
  });
}
async function finishInterviews(page) {
  while (
    await page
      .getByRole("button", {
        name: "Mark this interview as checked",
        exact: true,
      })
      .count()
  ) {
    await page
      .getByRole("button", {
        name: "Mark this interview as checked",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Mark as checked", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Coding complete · explore themes" })
    .click();
}
async function expand(page, name, root = page) {
  const summary = root.locator("summary").filter({ hasText: name }).first();
  if (!(await summary.evaluate((el) => el.parentElement.open)))
    await summary.click();
}
test("survey review, comparison, project save and figure export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await upload(
    page,
    /I have a Qualtrics export/,
    "survey.csv",
    "Vote,Age,Group\nYes,19,A\nNo,21,A\nYes,23,B\nNo,20,B\n",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await expect(page.locator("#graphic0 svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Compare two views", exact: true })
    .click();
  await expect(page.locator("#graphic1 svg")).toBeVisible();
  await page
    .getByRole("button", { name: "Save comparison", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Turnout");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .getByRole("button", { name: "Save and export", exact: true })
    .click();
  await page.getByText("Other save options", { exact: true }).click();
  await page.getByRole("button", { name: "Save on this device" }).click();
  const dl = page.waitForEvent("download");
  await page.getByLabel("Image format").selectOption("svg");
  await page.getByRole("button", { name: "Download figure" }).click();
  expect((await dl).suggestedFilename()).toContain(".svg");
  await page.reload();
  await page.getByRole("button", { name: "Resume on this device" }).click();
  await expect(page.locator("#graphic0")).toContainText("Vote");
  expect(errors).toEqual([]);
});
test("Word comments and highlights map to the same source passage", async ({
  page,
}) => {
  const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const doc = zipSync({
    "word/document.xml": strToU8(
      `<w:document xmlns:w="${w}"><w:body><w:p><w:commentRangeStart w:id="0"/><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>I had a late shift.</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p></w:body></w:document>`,
    ),
    "word/comments.xml": strToU8(
      `<w:comments xmlns:w="${w}"><w:comment w:id="0"><w:p><w:r><w:t>CODE: Work</w:t></w:r></w:p></w:comment></w:comments>`,
    ),
  });
  await upload(page, /I have coded interviews/, "interview.docx", doc);
  await expect(
    page.getByRole("heading", { name: /Where did you put/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("colour: yellow").fill("Time");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("main")).toContainText("1 passages");
  await expect(page.locator("main .scroll")).toContainText("Time");
  await expect(page.locator("main .scroll")).toContainText("Work");
  await page
    .getByRole("button", { name: "Edit labels on selected text" })
    .click();
  await page.getByLabel("New label").fill("Barriers");
  await page.getByRole("button", { name: "Save passage coding" }).click();
  await expect(page.locator(".iv-passage")).toContainText("Barriers");
  await finishInterviews(page);
  await expect(
    page.getByRole("combobox", { name: "Choose a theme or code", exact: true }),
  ).toContainText("Barriers");
});

test("Taguette all-highlights export keeps source and joint labels", async ({
  page,
}) => {
  const paragraphs = [
    "Taguette highlights",
    "I had to work",
    "Document: Interview 2",
    "Tags: Work, Time",
  ];
  const xml =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paragraphs
      .map((s) => "<w:p><w:r><w:t>" + s + "</w:t></w:r></w:p>")
      .join("") +
    "</w:body></w:document>";
  await upload(
    page,
    /I have coded interviews/,
    "taguette.docx",
    zipSync({ "word/document.xml": strToU8(xml) }),
  );
  await expect(page.locator("main .scroll")).toContainText("Interview 2");
  await expect(page.locator("main .scroll")).toContainText("Work; Time");
});
test("spreadsheet source mapping imports coded excerpts", async ({ page }) => {
  const Excel = (await import("exceljs/dist/exceljs.min.js")).default,
    book = new Excel.Workbook(),
    s = book.addWorksheet("Coded text");
  s.addRows([
    ["Interview", "Passage", "Codes"],
    ["A", "Work ended late", "Time;Work"],
    ["B", "I voted early", "Planning"],
  ]);
  await upload(
    page,
    /I have coded interviews/,
    "coded.xlsx",
    await book.xlsx.writeBuffer(),
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("main .scroll")).toContainText("Time; Work");
  await expect(page.locator("main .scroll")).toContainText("Planning");
});

test("a recognised two-header survey opens immediately and the tutor draws suggested and requested charts", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("dv-session", "fictional-browser-test"),
  );
  let calls = 0;
  await page.route("https://tutor.example.test/ask", (route) => {
    const data = route.request().postDataJSON();
    expect(data.skill).toBe("recommend");
    calls++;
    const suggestion =
      calls === 1
        ? {
            action: "suggest",
            task: "group",
            x: "c2",
            y: "c3",
            chart: "grid",
            measure: "percent",
            explanation: "A heatmap compares turnout within each group.",
          }
        : {
            action: "draw",
            task: "one",
            x: "c2",
            chart: "dots",
            measure: "count",
            explanation: "Show turnout counts.",
          };
    return route.fulfill({ json: { answer: JSON.stringify(suggestion) } });
  });
  await upload(
    page,
    /I have a Qualtrics export/,
    "test.csv",
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Turnout,Group\n2026,2026,Yes,A\n2026,2026,No,B\n",
  );
  await expect(page.getByText(/2 response records/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  const prompt = page.locator("#question");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await prompt.fill("How could I compare the two groups?");
  await send.click();
  await expect(
    page.getByRole("button", { name: "Make this chart" }),
  ).toBeVisible();
  await expect(page.locator(".msg-user").last()).toContainText(
    "How could I compare",
  );
  await expect(page.locator(".msg-assistant").last()).toBeVisible();
  await expect(page.locator(".msg-user p").last()).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await prompt.fill("Yes, show me");
  await send.click();
  await expect(
    page.locator('[data-chart][aria-pressed="true"]'),
  ).toHaveAttribute("data-chart", "grid");
  expect(calls).toBe(1);
  await prompt.fill("Make a dot plot of turnout instead");
  await send.click();
  await expect(
    page.locator('[data-chart][aria-pressed="true"]'),
  ).toHaveAttribute("data-chart", "dots");
  await page.getByRole("button", { name: "Undo view change" }).click();
  await expect(
    page.locator('[data-chart][aria-pressed="true"]'),
  ).toHaveAttribute("data-chart", "grid");
});

test("questionnaire labels reach charts and the bot can move, resize and dock", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await upload(
    page,
    /I have a Qualtrics export/,
    "example.csv",
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Q1,Age\n2026,2026,7,20\n2026,2026,9,23\n",
  );
  await page
    .getByText("Seeing question codes or numbers", { exact: false })
    .click();
  const picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add questionnaire labels" }).click();
  const question = {
    QuestionID: "QID1",
    DataExportTag: "Q1",
    QuestionType: "MC",
    Selector: "SAVR",
    QuestionText: "Would you vote?",
    Choices: { 1: { Display: "Definitely" }, 2: { Display: "Possibly" } },
    RecodeValues: { 1: 7, 2: 9 },
  };
  await (
    await picker
  ).setFiles({
    name: "example.qsf",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        SurveyElements: [{ Element: "SQ", Payload: question }],
      }),
    ),
  });
  await page.getByRole("button", { name: "Use these labels" }).click();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await expect(page.locator("#graphic0")).toContainText("Definitely");
  await expect(page.locator("#graphic0")).toContainText("Would you vote?");
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Compare groups" });
  await expect(
    page.getByLabel("Which question splits respondents into groups?"),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Data bot" })
    .click();
  const bot = page.locator("#data-bot");
  await page.locator("#question").fill("Make a chart");
  const start = await bot.boundingBox();
  const drag = async (handle, x, y) => {
    const r = await handle.boundingBox();
    await page.mouse.move(r.x + 8, r.y + 6);
    await page.mouse.down();
    await page.mouse.move(r.x + 8 + x, r.y + 6 + y);
    await page.mouse.up();
  };
  await drag(bot.locator(".bothead"), -150, 30);
  expect((await bot.boundingBox()).x).toBeCloseTo(start.x - 150, 0);
  await drag(bot.locator(".botsize"), 50, 40);
  expect((await bot.boundingBox()).width).toBeCloseTo(start.width + 50, 0);
  await page.getByRole("button", { name: "Dock right" }).click();
  await expect(bot).toHaveClass(/docked/);
  await page.getByRole("button", { name: "Float window" }).click();
  await expect(page.locator("#question")).toHaveValue("Make a chart");
  await bot.getByRole("button", { name: "Close", exact: true }).click();
  await expect(bot).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Data bot" })
    .click();
  expect((await bot.boundingBox()).width).toBeCloseTo(start.width + 50, 0);
  await page.setViewportSize({ width: 375, height: 680 });
  await expect
    .poll(async () => {
      const mobile = await bot.boundingBox();
      return mobile ? mobile.x + mobile.width : Infinity;
    })
    .toBeLessThanOrEqual(375);
});

test("an informal comparison draws the attitude question by preferences mentioned only in choices", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await upload(
    page,
    /I have a Qualtrics export/,
    "choices.csv",
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,I prefer...,Should specialists decide?\n2026,2026,Cats,Agree\n2026,2026,Dogs,Strongly agree\n2026,2026,Both,Disagree\n2026,2026,Neither,Agree\n",
  );
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  await page
    .locator("#question")
    .fill(
      "Could you create a visual that relates the cat-dog question to the specialists question?",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("#graphic0")).toContainText(
    "Should specialists decide? by I prefer...",
  );
  await expect(page.locator("#graphic0")).toContainText("Cats (n = 1)");
  await expect(page.locator("#data-bot .chatlog")).toContainText(
    "Created 100% stacked bars",
  );
});

test("all survey chart families, regression, filters, comparison controls and figure outputs", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const rows = Array.from(
    { length: 16 },
    (_, i) =>
      `2026,2026,${i},${3 * i + 2},${i % 3 ? "First" : "Second"},${i % 3 ? "Yes" : "No"}`,
  );
  await upload(
    page,
    /I have a Qualtrics export/,
    "analysis.csv",
    "StartDate,EndDate,Q1,Q2,Q3,Q4\nStart Date,End Date,Age,Score,Year,Vote\n" +
      rows.join("\n"),
  );
  const click = (name) =>
    page.getByRole("button", { name, exact: true }).click();
  await click("Confirm and explore");
  const key = (k) => page.locator('[data-panel="0"] [data-key="' + k + '"]');
  const svg = page.locator("#graphic0 svg");
  const shown = async (chart) => {
    await expand(page, "Chart type", page.locator('[data-panel="0"]'));
    await page.locator('[data-panel="0"] [data-chart="' + chart + '"]').click();
    await expect(svg).toBeVisible();
  };
  for (const type of ["hist", "dots", "bars", "table"]) await shown(type);
  await key("task").selectOption("group");
  await key("x").selectOption("c5");
  await key("y").selectOption("c4");
  for (const type of ["bars", "dots", "grid", "stack", "small", "table"])
    await shown(type);
  await shown("grid");
  await svg.locator('[data-code="Yes"][data-source="First"]').click();
  await expect(page.locator("dialog")).toContainText("10 records");
  await click("Done");
  await key("task").selectOption("two");
  await key("x").selectOption("c2");
  await key("y").selectOption("c3");
  await shown("scatter");
  await shown("line");
  await page.getByText("Chart settings", { exact: true }).click();
  await key("z").selectOption("c4");
  await page.getByText("Filters and appearance", { exact: true }).click();
  await key("filter").selectOption("c4");
  // The active filter control remains usable after the panel redraws.
  if (!(await key("value").isVisible()))
    await page.getByText("Filters and appearance", { exact: true }).click();
  await key("value").selectOption("First");
  await expect(svg).toContainText("10 paired");
  await key("task").selectOption("model");
  await key("outcome").selectOption("c3");
  await page.locator('[data-predictor="c2"]').check();
  await expect(svg).toContainText("Linear regression");
  await page.getByText("Coefficients and model details").click();
  await expect(page.locator("#modeldetails0")).toContainText("R squared");
  await click("Compare two views");
  await expect(page.locator("#graphic1 svg")).toBeVisible();
  await page.locator("#linked").uncheck();
  await page.locator("#linked").check();
  await click("Save comparison");
  await page.locator("#compname").fill("Test comparison");
  await click("Apply");
  await click("Save and export");
  await click("Duplicate");
  await expect(
    page.getByText("Test comparison (copy)", { exact: true }),
  ).toBeVisible();
  await expand(page, "Export options");
  await page.locator("#panels").selectOption("both");
  await page.locator("#layout").selectOption("vertical");
  await page.locator("#preset").selectOption("940");
  await click("Preview figure");
  await expect(page.locator("#previewFigure > svg > svg")).toHaveCount(2);
  await click("Done");
  const file = page.waitForEvent("download");
  await click("Download figure");
  expect((await file).suggestedFilename()).toBe("data-visualiser.png");
  await click("Copy figure");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await navigator.clipboard.read()).flatMap((i) => i.types),
      ),
    )
    .toContain("image/png");
});
test("tutor proposals fit a regression through the normal chart controls", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("dv-session", "test-session"),
  );
  await page.route("https://tutor.example.test/ask", (route) =>
    route.fulfill({
      json: {
        answer:
          "```json\n" +
          JSON.stringify({
            action: "draw",
            task: "model",
            chart: "model",
            outcome: "Score",
            predictors: ["Age"],
          }) +
          "\n```\nI will draw this regression.",
      },
    }),
  );
  await upload(
    page,
    /I have a Qualtrics export/,
    "test.csv",
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Age,Score\n2026,2026,20,5\n2026,2026,21,7\n2026,2026,22,8\n2026,2026,23,11",
  );
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  await page
    .locator("#question")
    .fill("Fit a linear regression of Score on Age");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("#graphic0")).toContainText("Linear regression");
  await expect(page.locator("#graphic0")).toContainText("4 complete records");
});

test("Check edits, exclusions and transforming open answers retain the right respondents", async ({
  page,
}) => {
  await upload(
    page,
    /I have a Qualtrics export/,
    "test.csv",
    "StartDate,EndDate,Q1,Q2,Q3,Q4\nStart Date,End Date,Status flag,Comment,Support,Plan\n2026,2026,Preview,Test wording,1,1\n2026,2026,Keep,I plan ahead,1,0\n2026,2026,Keep,I work late,0,1",
  );
  const button = (act) => page.locator('[data-act="' + act + '"]').first();
  const settings = async () => {
    const node = page.getByText("Review fields and import settings", {
      exact: true,
    });
    if (!(await button("exclude").isVisible())) await node.click();
  };
  await settings();
  await button("exclude").click();
  await page.locator("#excludeField").selectOption("c2");
  await page.locator("#excludeValue").fill("Preview");
  await page.locator("#modalform button[type=submit]").click();
  await settings();
  await button("multi").click();
  await page.locator("#multiTitle").fill("Options");
  await page.locator("[name=mf][value=c4]").check();
  await page.locator("[name=mf][value=c5]").check();
  await page.locator("#modalform button[type=submit]").click();
  await settings();
  await button("tocorpus").click();
  await page.locator("#textcol").selectOption("c3");
  await page.locator("#modalform button[type=submit]").click();
  await expect(page.locator("main .scroll")).toContainText("Record 2");
  await expect(page.locator("main .scroll")).not.toContainText("Test wording");
  await button("sources").click();
  await page.locator("#sourceList").fill("Record 2\nRecord 3\nEmpty");
  await page.locator("#modalform button[type=submit]").click();
  await button("confirm").click();
  await button("passages").click();
  await page.locator("[name=pickp]").first().check();
  await page.locator("#applycode").fill("Planning");
  await page.locator("#modalform button[type=submit]").click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await button("renamecode").click();
  await page.locator("#newcode").fill("Preparation");
  await page.locator("#modalform button[type=submit]").click();
  await expect(page.locator("main .scroll")).toContainText("Preparation");
});
test("UTF-16 TSV, interview bot matrix, evidence drill-down and accepted coding suggestions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("dv-session", "test-session"),
  );
  const replies = [];
  await page.route("https://tutor.example.test/ask", (route) => {
    const body = route.request().postDataJSON();
    if (body.skill === "coding") {
      const p = body.context.passages[0];
      replies.push(p);
      return route.fulfill({
        json: {
          answer: JSON.stringify({
            suggestions: [
              {
                id: p.id,
                quote: p.text,
                code: "Planning",
                reason: "An obstacle.",
              },
            ],
          }),
        },
      });
    }
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "draw",
          task: "group",
          chart: "presence",
          x: "codes",
          y: "sources",
          measure: "count",
        }),
      },
    });
  });
  await upload(
    page,
    /I have coded interviews/,
    "codes.tsv",
    Buffer.from(
      "\ufeffInterview\tPassage\tCodes\nA\tI worked late\tTime\nB\tI arrived early\tPlanning",
      "utf16le",
    ),
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Continue").click();
  await finishInterviews(page);
  await btn("Data bot").click();
  await page
    .locator("#question")
    .fill("Draw a grid of all codes across interviews");
  await btn("Send").click();
  await expect(page.locator("#graphic0")).toContainText(
    "Presence (1 = present",
  );
  await page.locator("[data-act=closebot]").click();
  await page.locator('#graphic0 [data-code="Time"][data-source="A"]').click();
  await expect(page.locator("#passlist")).toContainText("1 matching passages");
  await page.locator("input[name=pickp]").check();
  await expand(page, "Code with the Data bot");
  await page.locator("#suggestpass").click();
  await expect(page.locator("[data-act=acceptcode]")).toBeVisible();
  expect(replies).toHaveLength(1);
  await page.locator("[data-act=acceptcode]").click();
  await page.locator("#approved").selectOption("Planning");
  await page.locator("#modalform button[type=submit]").click();
  await expect(page.locator("#graphic0")).toContainText("Planning");
});

test("an explicitly requested heatmap takes precedence over a different model chart", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", (r) =>
    r.fulfill({
      json: {
        answer: JSON.stringify({
          action: "draw",
          task: "group",
          chart: "stack",
          x: "c2",
          y: "c3",
          measure: "percent",
        }),
      },
    }),
  );
  await upload(
    page,
    /I have a Qualtrics export/,
    "test.csv",
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Turnout,Study year\n2026,2026,Yes,First\n2026,2026,No,Second",
  );
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  await page
    .locator("#question")
    .fill("Draw a heatmap of Turnout by Study year");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.locator('[data-chart][aria-pressed="true"]'),
  ).toHaveAttribute("data-chart", "grid");
  await expect(page.locator("#graphic0 [data-code]")).toHaveCount(4);
});

test("a student can request a grouped heatmap from a single-question view even when the model would decline", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let modelCalls = 0;
  await page.route("https://tutor.example.test/ask", (route) => {
    modelCalls++;
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "answer",
          explanation: "A heatmap is unavailable for this selection.",
        }),
      },
    });
  });
  await upload(
    page,
    /I have a Qualtrics export/,
    "class.csv",
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Turnout,Study year\n2026,2026,Yes,First\n2026,2026,Yes,First\n2026,2026,No,Second\n2026,2026,Yes,Second",
  );
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  await page
    .locator("#question")
    .fill(
      "Can I see how voting differs between the two years? Please draw a heatmap now. Use Turnout for the answers and Study year for the groups. Show percentages within each year.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.locator('[data-chart][aria-pressed="true"]'),
  ).toHaveAttribute("data-chart", "grid");
  for (const [answer, year, percent] of [
    ["Yes", "First", 100],
    ["No", "First", 0],
    ["Yes", "Second", 50],
    ["No", "Second", 50],
  ]) {
    await expect(
      page.locator(
        `#graphic0 [data-code="${answer}"][data-source="${year}"] text`,
      ),
    ).toHaveText(String(percent));
  }
  expect(modelCalls).toBe(0);
});

test("portable download reopens from the start screen with optional bot memory", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let requests = 0;
  await page.route("https://tutor.example.test/ask", (r) => {
    const { context } = r.request().postDataJSON();
    requests++;
    if (requests > 1)
      expect(context.pastProjectWork.earlierExchanges.join(" ")).toContain(
        "Use year as the grouping question",
      );
    return r.fulfill({
      json: {
        answer: JSON.stringify(
          requests === 1
            ? {
                action: "answer",
                explanation: "Use year as the grouping question.",
              }
            : {
                action: "answer",
                explanation: "Earlier we discussed grouping by year.",
              },
        ),
      },
    });
  });
  await upload(
    page,
    /I have a Qualtrics export/,
    "Workshop survey.csv",
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Turnout,Year\n2026,2026,Yes,First\n2026,2026,No,Second",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Confirm and explore").click();
  await btn("Data bot").click();
  await page
    .locator("#question")
    .fill("Which grouping question should we use?");
  await btn("Send").click();
  await expect(page.locator(".chatlog")).toContainText("Use year");
  await page.locator("[data-act=closebot]").click();
  await btn("Compare two views").click();
  await btn("Save and export").click();
  await expect(btn("Download project with data")).toBeVisible();
  await expect(btn("Download settings only")).toBeHidden();
  async function save() {
    const wait = page.waitForEvent("download");
    await btn("Download project with data").click();
    const file = await wait;
    expect(file.suggestedFilename()).toBe("Workshop survey - project.json");
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const first = JSON.parse((await save()).toString());
  expect(first.datasets[0].rows.length).toBe(2);
  expect(first.tutorHistory[first.active].messages).toBeUndefined();
  expect(first.tutorHistory[first.active].activity.length).toBe(1);
  await expand(page, "Other save options");
  await page.getByLabel("Include full Data bot conversations").check();
  const bytes = await save();
  await page.reload();
  const picker = page.waitForEvent("filechooser");
  await btn("Open a saved project").click();
  await (
    await picker
  ).setFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await expect(page.locator("#graphic1 svg")).toBeVisible();
  await btn("Data bot").click();
  await expect(page.locator(".chatlog")).toContainText("Use year");
  await page.locator("#question").fill("Why did we choose year earlier?");
  await btn("Send").click();
  await expect(page.locator(".chatlog")).toContainText("Earlier we discussed");
  await page.reload();
  await page.locator("#project-drop").evaluate((zone, json) => {
    const dt = new DataTransfer();
    dt.items.add(new File([json], "saved.json", { type: "application/json" }));
    zone.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: dt }),
    );
  }, bytes.toString());
  await expect(page.locator("#graphic1 svg")).toBeVisible();
});

test("figure styles preview the current data and survive comparison, export and reopening", async ({
  page,
}) => {
  await upload(
    page,
    /I have a Qualtrics export/,
    "survey.csv",
    "Vote,Age,Group\nYes,19,A\nNo,21,A\nYes,23,B\nNo,20,B\n",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Confirm and explore").click();
  const chart = page.locator("#graphic0 svg");
  await expect(chart).toHaveAttribute("data-style", "workshop");
  const labels = await chart.locator("text").allTextContents();
  await expand(page, "Chart settings");
  await btn("Figure style · Workshop").click();
  const marks = new Map();
  for (const style of ["report", "presentation", "workshop", "policy"]) {
    await page
      .locator('input[name="figure-style"][value="' + style + '"]')
      .check();
    await expect(page.locator("#style-preview svg")).toHaveAttribute(
      "data-style",
      style,
    );
    expect(
      await page.locator("#style-preview svg text").allTextContents(),
    ).toEqual(labels);
    const bar = page.locator("#style-preview .bar-mark").first();
    marks.set(style, [
      await bar.getAttribute("height"),
      await bar.getAttribute("rx"),
      await bar.getAttribute("fill"),
    ]);
  }
  expect(new Set([...marks.values()].map((m) => m[2])).size).toBe(4);
  expect(Number(marks.get("presentation")[1])).toBeGreaterThan(
    Number(marks.get("workshop")[1]),
  );
  expect(Number(marks.get("policy")[0])).toBeLessThan(
    Number(marks.get("report")[0]),
  );
  await page.locator("#style-palette").selectOption("coast");
  await expect(
    page.locator("#style-preview .bar-mark").first(),
  ).toHaveAttribute("fill", "#00658a");
  await page.getByRole("radio", { name: /Presentation/ }).check();
  await expect(page.locator("#style-palette")).toHaveValue("coast");
  await expect(
    page.locator("#style-preview .bar-mark").first(),
  ).toHaveAttribute("fill", "#00658a");
  await btn("Close").click();
  await expect(chart).toHaveAttribute("data-style", "workshop");
  await expand(page, "Chart settings");
  await btn("Figure style · Workshop").click();
  await page.getByRole("radio", { name: /Policy brief/ }).check();
  await page.getByLabel("Highlight one category or group").selectOption("Yes");
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Colour palette", exact: true })
    .selectOption("grey");
  await btn("Apply style").click();
  await expect(chart).toHaveAttribute("data-style", "policy");
  await expect(chart.locator('.bar-mark[fill="#303030"]')).toHaveCount(1);
  await btn("Compare two views").click();
  await expand(page, "Chart settings", page.locator('[data-panel="1"]'));
  await page.locator('[data-panel="1"] [data-act="figurestyle"]').click();
  await page.getByRole("radio", { name: /Presentation/ }).check();
  await page.locator("#style-palette").selectOption("coast");
  await btn("Apply style").click();
  await expect(page.locator("#graphic1 svg")).toHaveAttribute(
    "data-style",
    "presentation",
  );
  await expect(chart).toHaveAttribute("data-style", "policy");
  await btn("Save and export").click();
  async function downloaded(button) {
    const pending = page.waitForEvent("download");
    await btn(button).click();
    const chunks = [];
    for await (const chunk of await (await pending).createReadStream())
      chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  await expand(page, "Export options");
  await page
    .getByRole("combobox", { name: "Panels", exact: true })
    .selectOption("both");
  await page.getByLabel("Image format").selectOption("svg");
  const svg = (await downloaded("Download figure")).toString();
  expect(svg).toContain('data-style="policy"');
  expect(svg).toContain('data-style="presentation"');
  expect(svg).toContain("#00658a");
  await page.getByLabel("Image format").selectOption("png");
  expect((await downloaded("Download figure")).subarray(1, 4).toString()).toBe(
    "PNG",
  );
  const data = await downloaded("Download project with data");
  await page.reload();
  const picked = page.waitForEvent("filechooser");
  await btn("Open a saved project").click();
  await (
    await picked
  ).setFiles({
    name: "styled.json",
    mimeType: "application/json",
    buffer: data,
  });
  await expect(chart).toHaveAttribute("data-style", "policy");
  await expect(chart.locator('.bar-mark[fill="#303030"]')).toHaveCount(1);
  await expect(
    page.locator('#graphic1 path[fill="#00658a"]').first(),
  ).toBeVisible();
  await expect(page.locator("#graphic1 svg")).toHaveAttribute(
    "data-style",
    "presentation",
  );
});

test("uncoded interview uses a reviewed PDF codebook and only approved labels", async ({
  page,
  context,
}) => {
  const doc = await context.newPage();
  await doc.setContent(
    "<p>Work conflict: A shift overlaps with voting time.</p>",
  );
  const pdf = await doc.pdf();
  await doc.close();
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", async (route) => {
    const request = route.request().postDataJSON();
    if (request.skill === "codebook") {
      expect(Object.keys(request.context)).toEqual(["document"]);
      expect(request.context.document).toContain("Work conflict");
      return route.fulfill({
        json: {
          answer: JSON.stringify({
            entries: [
              {
                label: "Work conflict",
                definition: "A shift overlaps with voting time.",
              },
            ],
          }),
        },
      });
    }
    expect(request.skill).toBe("coding");
    expect(request.context.guide.mode).toBe("deductive");
    const p = request.context.passages[0],
      label = request.context.guide.vocabulary[0].label;
    expect(label).toBe("Shift conflict");
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: ["Busyness", label].map((code) => ({
            id: p.id,
            quote: "work",
            code,
            reason: "A shift overlapped.",
          })),
        }),
      },
    });
  });
  await upload(
    page,
    /Written responses or documents/,
    "interview.txt",
    "I had to work until the polling station closed.\nI like dogs.",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Confirm and explore").click();
  await btn("Read and code passages").click();
  await page.locator("input[name=pickp]").first().check();
  await expand(page, "Code with the Data bot");
  await page.locator("#coding-method").selectOption("deductive");
  await page.locator("#book-file").setInputFiles({
    name: "codebook.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await btn("Extract labels").click();
  await expect(page.locator("[data-label]")).toHaveValue("Work conflict");
  await expect(page.locator("#suggestpass")).toBeDisabled();
  await page.locator("[data-label]").fill("Shift conflict");
  await btn("Use these labels").click();
  await expand(page, "Code with the Data bot");
  await page.locator("#suggestpass").click();
  await expect(page.locator("[data-act=acceptcode]")).toHaveCount(1);
  await btn("Review label").click();
  await expect(page.locator("#approved option")).toHaveCount(1);
  await btn("Apply").click();
  await page.locator("[data-act=closebot]").click();
  await btn("Save and export").click();
  const pending = page.waitForEvent("download");
  await btn("Download project with data").click();
  const chunks = [];
  for await (const c of await (await pending).createReadStream())
    chunks.push(c);
  const saved = JSON.parse(Buffer.concat(chunks));
  expect(saved.datasets[0].passages.map((p) => p.codes)).toEqual([
    ["Shift conflict"],
    [],
  ]);
  expect(saved.datasets[0].coding.book[0].label).toBe("Shift conflict");
});

test("the bot works on the selected panel, drafts a caption and compares both without resetting the right view", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  const calls = [];
  await page.route("https://tutor.example.test/ask", (route) => {
    const { context } = route.request().postDataJSON();
    calls.push(context);
    const answer =
      context.requestedOutput === "variant"
        ? {
            action: "restyleChart",
            panel: "right",
            chart: "table",
            explanation: "Read exact counts.",
          }
        : context.requestedOutput === "caption"
          ? {
              action: "caption",
              explanation: "Two of four students answered Yes.",
            }
          : {
              action: "answer",
              explanation: "Compare counts within the same sample.",
            };
    return route.fulfill({ json: { answer: JSON.stringify(answer) } });
  });
  await upload(
    page,
    /I have a Qualtrics export/,
    "tiny.csv",
    "Vote,Year\nYes,First\nNo,First\nNo,Second\nYes,Second",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Confirm and explore").click();
  await btn("Compare").click();
  await expect(page.getByRole("heading", { name: "Left view" })).toBeVisible();
  await page.getByText("Change right view", { exact: true }).click();
  await page
    .locator('[data-panel="1"] [data-key=x]')
    .selectOption({ label: "Year" });
  await page.locator('[data-panel="0"] [data-act=describechart]').click();
  await expand(page, "Chat tools");
  await btn("Explain the pattern").click();
  await expect(page.locator(".chatlog")).toContainText("Compare counts");
  expect(calls[0].focus).toBe("left");
  expect(calls[0].views.map((v) => v.selectedQuestions)).toEqual(["Vote"]);
  await btn("Try another chart").click();
  await expect(
    page.locator('[data-panel="0"] [data-chart][aria-pressed=true]'),
  ).toHaveAttribute("data-chart", "table");
  await expect(
    page.locator('[data-panel="1"] [data-chart][aria-pressed=true]'),
  ).toHaveAttribute("data-chart", "dots");
  await btn("Draft a caption").click();
  await btn("Add caption to figure").click();
  await expect(page.locator("#graphic0")).toContainText("Two of four students");
  await page.locator("#bot-focus").selectOption("both");
  await page
    .locator("#data-bot")
    .getByRole("button", { name: "Compare findings", exact: true })
    .click();
  await expect.poll(() => calls.at(-1)?.requestedOutput).toBe("compare");
  expect(calls.at(-1).views.map((v) => v.selectedQuestions)).toEqual([
    "Vote",
    "Year",
  ]);
  await page.locator("[data-act=closebot]").click();
  await btn("Explore").click();
  const filter = page.locator('[data-panel="0"] [data-key=filter]');
  if (!(await filter.isVisible())) {
    const settings = page.getByText("Chart settings", { exact: true });
    const appearance = page.getByText("Filters and appearance", {
      exact: true,
    });
    if (!(await appearance.isVisible())) await settings.click();
    await appearance.click();
  }
  await filter.selectOption({ label: "Vote" });
  const selectedFilter = await filter.inputValue();
  await btn("Compare two views").click();
  await expect(page.locator('[data-panel="1"] [data-key=filter]')).toHaveValue(
    selectedFilter,
  );
  await expect(page.locator("#graphic1")).toContainText("Year");
  await expect(page.locator("#graphic0")).toContainText("Two of four students");
});

test("discussing interview passages uses only the checked text and the student can clear it", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let received;
  await page.route("https://tutor.example.test/ask", (route) => {
    received = route.request().postDataJSON().context;
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "answer",
          explanation: "The participant describes a late shift.",
        }),
      },
    });
  });
  await upload(
    page,
    /Written responses or documents/,
    "Interview A.txt",
    "I worked a late shift.\nI play tennis.",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Confirm and explore").click();
  await btn("Read and code passages").click();
  await page.locator("input[name=pickp]").first().check();
  await btn("Discuss selected passages").click();
  await expect(page.locator(".chatlog")).toContainText("late shift");
  expect(received.requestedOutput).toBe("excerpts");
  expect(received.passages.map((p) => p.text)).toEqual([
    "I worked a late shift.",
  ]);
  expect(JSON.stringify(received)).not.toContain("I play tennis.");
  await btn("Clear included text").click();
  await expand(page, "Chat tools");
  await btn("Explain the pattern").click();
  await expect.poll(() => received.requestedOutput).toBe("explain");
  expect(received.passages).toEqual([]);
});

test("a student can follow a multi-question pattern to its responses and redraw it with the bot", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let sent;
  await page.route("https://tutor.example.test/ask", (route) => {
    sent = route.request().postDataJSON().context;
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "draw",
          task: "patterns",
          patternMode: "separate",
          chart: "dots",
          explanation: "See the answers for each question.",
        }),
      },
    });
  });
  await upload(
    page,
    /I have a Qualtrics export/,
    "survey.csv",
    "Vote,Trust,Duty\nYes,High,Often\nYes,High,Often\nNo,Low,Rarely\nYes,,Often",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Confirm and explore").click();
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Look across several questions" });
  await page.getByLabel("Trust", { exact: true }).check();
  await page.getByLabel("Duty", { exact: true }).check();
  const svg = page.locator("#graphic0");
  await expect(svg).toContainText("3 of 4");
  await svg.locator("[data-pattern-row]").first().click();
  await expect(page.locator("dialog")).toContainText("2 of 2");
  await btn("Done").click();
  await btn("Ask about this visual").click();
  await page
    .locator("#question")
    .fill("Show me how people answered each of these questions overall");
  await btn("Send").click();
  await expect(svg).toContainText("75% (3 of 4)");
  await expect(svg).toContainText("66.67% (2 of 3)");
  expect(sent.views[0].selectedLabels).toEqual(["Vote", "Trust", "Duty"]);
  await expect(page.locator('[data-chart="dots"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
test("students switch from interview coverage to exact co-coding and open the matching passages", async ({
  page,
}) => {
  await upload(
    page,
    /I have coded interviews/,
    "codes.tsv",
    "Interview\tPassage\tCodes\nA\tworked late\tTime\nA\tplanned ahead\tPlanning\nB\tcombined both\tTime;Planning",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Continue").click();
  await finishInterviews(page);
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Look across several themes" });
  await page.getByLabel("Planning", { exact: true }).check();
  const mode = page.locator('select[data-key="patternMode"]');
  await mode.selectOption("interviews");
  await page.locator("#graphic0 [data-pattern-row]").first().click();
  await expect(page.locator("dialog")).toContainText(
    "Matching interviews: A, B",
  );
  await btn("Done").click();
  await mode.selectOption("passages");
  await page
    .getByRole("button", {
      name: "Read evidence: Time · Planning",
      exact: false,
    })
    .click();
  await expect(page.locator("dialog")).toContainText("combined both");
  await expect(page.locator("dialog")).not.toContainText("planned ahead");
});

test("split the current three survey questions by study year using the bot and inspect the subset", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await upload(
    page,
    /I have a Qualtrics export/,
    "survey.csv",
    "Vote,Trust,Duty,Study year\nYes,High,Often,First\nYes,High,Often,First\nNo,Low,Rarely,Final\nYes,,Often,Final",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Confirm and explore").click();
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Look across several questions" });
  await page.getByLabel("Trust", { exact: true }).check();
  await page.getByLabel("Duty", { exact: true }).check();
  await btn("Ask about this visual").click();
  await page
    .locator("#question")
    .fill("Could you split these patterns by study year?");
  await btn("Send").click();
  await expect(page.getByLabel("Compare by group")).toHaveValue("c3");
  await expect(page.locator(".chatlog")).toContainText("100 percentage points");
  await page.locator("[data-act=closebot]").click();
  await page
    .getByRole("button", { name: "Read evidence: Yes · High · Often · First" })
    .click();
  await expect(page.locator("dialog")).toContainText("2 of 2 matching records");
});
test("enter interview groups, compare theme coverage and retrieve only that group's passages", async ({
  page,
}) => {
  await upload(
    page,
    /I have coded interviews/,
    "codes.tsv",
    "Interview\tPassage\tCodes\nA\tworked late\tTime\nA\tcombined both\tTime;Planning\nB\tplanned ahead\tPlanning\nC\talso late\tTime",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Continue").click();
  await finishInterviews(page);
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Look across several themes" });
  await btn("Add interview groups").click();
  await page
    .getByLabel("Which detail will you use to form groups?")
    .fill("Study year");
  for (const [id, group] of [
    ["A", "First"],
    ["B", "First"],
    ["C", "Final"],
  ])
    await page.getByLabel(id, { exact: true }).fill(group);
  await btn("Show groups").click();
  await expect(page.locator("#graphic0")).toContainText("50% (1 of 2)");
  await page.getByLabel("Count a theme once per").selectOption("passages");
  await expect(page.locator("#graphic0")).toContainText("66.67% (2 of 3)");
  await page
    .getByRole("button", { name: "Read evidence: Time · First" })
    .click();
  await expect(page.locator("dialog")).toContainText("combined both");
  await expect(page.locator("dialog")).not.toContainText("also late");
});

test("a group suggestion explains the comparison, keeps the figure until consent and supports declining", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await upload(
    page,
    /I have a Qualtrics export/,
    "survey.csv",
    "Vote,Trust,Study year\nYes,High,First\nYes,High,First\nNo,Low,Final\nNo,Low,Final",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Confirm and explore").click();
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Look across several questions" });
  await page.getByLabel("Trust", { exact: true }).check();
  const original = await page.locator("#graphic0").innerText();
  await btn("Ask about this visual").click();
  const send = async (q) => {
    await page.locator("#question").fill(q);
    await btn("Send").click();
  };
  await send("Do any groups stand out?");
  await expect(btn("Make this chart")).toBeVisible();
  await expect(page.locator(".chatlog")).toContainText("2 of 2 responses");
  expect(await page.locator("#graphic0").innerText()).toBe(original);
  await send("Why that?");
  await expect(btn("Make this chart")).toBeVisible();
  await btn("No thanks").click();
  await expect(btn("Make this chart")).toHaveCount(0);
  await expand(page, "Chat tools");
  await btn("Suggest groups to compare").click();
  await expect(btn("Make this chart")).toBeVisible();
  await send("Yes, please draw that comparison");
  await expect(page.getByLabel("Compare by group")).toHaveValue("c2");
  await expect(btn("Make this chart")).toHaveCount(0);
});

test("spreadsheet interviews apply only marker values confirmed for each project column", async ({
  page,
}) => {
  await upload(
    page,
    /I have coded interviews/,
    "repairs.tsv",
    "Interview\tPassage\tSupply delay\tFault located\nBench A\tOrder pending\tPENDING\tCLEARED\nBench B\tProblem found\tCLEARED\tFOUND",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await page.getByText("Separate yes/no code columns", { exact: true }).click();
  await page.getByLabel("Supply delay", { exact: true }).check();
  await page.getByLabel("Fault located", { exact: true }).check();
  await btn("Continue").click();
  await expect(page.locator("#formerror")).toContainText("Supply delay");
  await page.getByLabel("PENDING", { exact: true }).check();
  await page.getByLabel("FOUND", { exact: true }).check();
  await btn("Continue").click();
  const rows = page.locator("main table tr");
  await expect(rows.filter({ hasText: "Order pending" })).toContainText(
    "Supply delay",
  );
  await expect(rows.filter({ hasText: "Order pending" })).not.toContainText(
    "Fault located",
  );
  await expect(rows.filter({ hasText: "Problem found" })).toContainText(
    "Fault located",
  );
  await expect(rows.filter({ hasText: "Problem found" })).not.toContainText(
    "Supply delay",
  );
});

for (const text of [false, true]) {
  test(
    "research focus guides a reviewed " +
      (text ? "interview" : "survey") +
      " comparison",
    async ({ page }) => {
      const btn = (name) => page.getByRole("button", { name, exact: true });
      await page.addInitScript(() =>
        sessionStorage.setItem("dv-session", "test"),
      );
      let context,
        invalid = false;
      await page.route("https://tutor.example.test/ask", (route) => {
        const req = route.request().postDataJSON();
        expect(req.skill).toBe("research");
        context = req.context;
        return route.fulfill({
          json: {
            answer: JSON.stringify({
              action: "suggest",
              items: text ? ["Late bus"] : ["c1", "c2"],
              groupBy: invalid ? "Fabricated" : text ? "Shift" : "c2",
              patternMode: "separate",
              explanation: text
                ? "Compare travel reliability across shifts."
                : "Compare bus punctuality (c1) across shifts (c2).",
            }),
          },
        });
      });
      await upload(
        page,
        text ? /I have coded interviews/ : /I have a Qualtrics export/,
        text ? "commutes.tsv" : "commutes.csv",
        text
          ? "Interview\tPassage\tCodes\nA\tPrivate passage A\tLate bus\nB\tPrivate passage B\tReliable bus"
          : "Lunch,Bus punctuality,Shift\nSoup,Late,Day\nSalad,On time,Night\nSoup,On time,Day\nSalad,Late,Night",
      );
      await btn("Continue").click();
      if (text) await btn("Continue").click();
      if (text) await finishInterviews(page);
      else await btn("Confirm and explore").click();
      if (text) {
        await page
          .getByLabel("What would you like to find out?")
          .selectOption({ label: "Look across several themes" });
        await btn("Add interview groups").click();
        await page
          .getByLabel("Which detail will you use to form groups?")
          .fill("Shift");
        await page.getByLabel("A", { exact: true }).fill("Day");
        await page.getByLabel("B", { exact: true }).fill("Night");
        await btn("Show groups").click();
      }
      await btn("Data bot").click();
      const focus =
        "Our research question is whether bus reliability differs by shift.";
      await page.locator("#question").fill(focus);
      await btn("Send").click();
      await expect(page.locator("#research-focus")).toHaveValue(focus);
      await btn("Save project focus").click();
      const first = await page.locator("#graphic0").innerText();
      await expand(page, "Chat tools");
      await btn("Suggest what to explore").click();
      await expect(btn("Make this chart")).toBeVisible();
      expect(context.projectFocus).toBe(focus);
      await expect(page.locator(".chatlog")).not.toContainText("(c1)");
      expect(JSON.stringify(context)).not.toContain("Private passage");
      await expect(page.locator(".chatlog")).toContainText(
        (text ? "Late bus" : "Bus punctuality") + " by Shift",
      );
      expect(await page.locator("#graphic0").innerText()).toBe(first);
      await btn("Make this chart").click();
      await expect(page.getByLabel("Compare by group")).toHaveValue(
        text ? "Shift" : "c2",
      );
      invalid = true;
      await expand(page, "Chat tools");
      await btn("Suggest groups to compare").click();
      await expect(page.locator(".chatlog")).toContainText(
        "couldn’t match that suggestion",
      );
      expect(context.selectionToKeep).toEqual([text ? "Late bus" : "c1"]);
      await expect(btn("Make this chart")).toHaveCount(0);
      await btn("Edit research question or puzzle").click();
      await page.locator("#puzzle-field").fill("");
      await page
        .locator("#data-bot")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(btn("Suggest what to explore")).toHaveCount(0);
    },
  );
}

test("students can preview, pin and dismiss an explanation using their own survey labels", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await upload(
    page,
    /I have a Qualtrics export/,
    "service.csv",
    "Bus reliability,Work shift\nLate,Day\nEarly,Night\nEarly,Day\nLate,Night",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Compare groups" });
  const help = page
    .locator(".term-help")
    .filter({ has: page.getByText("What is a group?", { exact: true }) });
  const trigger = help.locator("summary"),
    note = help.locator("p");
  await trigger.hover();
  await expect(note).toContainText("People who gave the same answer");
  await expect(note).toContainText(
    "“Day” and “Night” are two groups for “Work shift”",
  );
  await page.getByRole("heading", { name: "Explore your data" }).hover();
  await expect(note).toBeHidden();
  await trigger.click();
  await page.getByRole("heading", { name: "Explore your data" }).hover();
  await expect(note).toBeVisible();
  await trigger.press("Escape");
  await expect(note).toBeHidden();
  await trigger.press("Enter");
  await expect(note).toBeVisible();
  await page.getByRole("button", { name: "Data bot", exact: true }).click();
  await page.locator("#question").fill("What do you mean by groups here?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".chatlog")).toContainText(
    "two groups for “Work shift”",
  );
  await expect(page.locator("[data-act=botdraw]")).toHaveCount(0);
});

test("touch users can read how interview groups are formed and what each theme counts", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    hasTouch: true,
    viewport: { width: 600, height: 850 },
  });
  try {
    const page = await context.newPage();
    await upload(
      page,
      /I have coded interviews/,
      "repairs.tsv",
      "Interview\tPassage\tCodes\nA\tOrder pending\tDelay\nB\tSeal replaced\tRepair",
    );
    const btn = (name) => page.getByRole("button", { name, exact: true });
    await btn("Continue").click();
    await btn("Continue").click();
    await finishInterviews(page);
    await page
      .getByLabel("What would you like to find out?")
      .selectOption({ label: "Look across several themes" });
    await btn("Add interview groups").click();
    await page
      .getByLabel("Which detail will you use to form groups?")
      .fill("Workplace");
    await page.getByLabel("A", { exact: true }).fill("Depot");
    await page.getByLabel("B", { exact: true }).fill("Office");
    await btn("Show groups").click();
    const trigger = page.getByText("What is a group?", { exact: true });
    await trigger.tap();
    const note = page.locator(".term-help[open] p");
    await expect(note).toContainText(
      "interviews that share something you recorded",
    );
    await expect(note).toContainText("“Depot” and “Office”");
    await trigger.tap();
    await expect(note).toHaveCount(0);
    await page.getByText("What are codes and passages?", { exact: true }).tap();
    await expect(note).toContainText("A passage is a piece of text");
  } finally {
    await context.close();
  }
});

test("interview heatmaps use the chosen colour ramp and pattern dots use the style's markers", async ({
  page,
}) => {
  await upload(
    page,
    /I have coded interviews/,
    "codes.tsv",
    "Interview\tPassage\tCodes\nA\tFirst\tDelay\nA\tSecond\tDelay\nB\tThird\tRepair",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Continue").click();
  await finishInterviews(page);
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Look across several themes" });
  await page.getByLabel("Repair", { exact: true }).check();
  await expand(page, "Chart settings");
  await btn("Figure style · Workshop").click();
  await page.getByRole("radio", { name: /Presentation/ }).check();
  await page.locator("#style-palette").selectOption("archive");
  await btn("Apply style").click();
  const chart = page.locator("#graphic0 svg");
  await expect(
    chart.locator('[data-code="Delay"][data-source="A"] rect'),
  ).toHaveAttribute("fill", "rgb(102, 34, 56)");
  await expect(
    chart.locator('[data-code="Repair"][data-source="A"] text'),
  ).toHaveAttribute("fill", "#000000");
  await expect(
    chart.locator('[data-code="Delay"][data-source="A"] text'),
  ).toHaveAttribute("fill", "#ffffff");
  await page.locator('select[data-key="patternMode"]').selectOption("passages");
  await expand(page, "Chart type");
  await btn("Dot plot").click();
  await expect(chart.locator('path[fill="#823447"]').first()).toBeVisible();
  await expect(chart.locator("[data-pattern-row]").first()).toBeVisible();
});

test("a partial Word highlight preserves surrounding text and repeated unmarked words in order", async ({
  page,
}) => {
  const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const doc = zipSync({
    "word/document.xml": strToU8(
      `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:t>Before </w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>delayed</w:t></w:r><w:r><w:t> after.</w:t></w:r></w:p><w:p><w:r><w:t>delayed</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
  await upload(page, /I have coded interviews/, "timing.docx", doc);
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await page.getByLabel("colour: yellow").fill("Timing");
  await btn("Continue").click();
  const cells = page.locator("main table tbody tr");
  await expect(cells).toHaveCount(4);
  expect(await cells.locator("td:nth-child(2)").allTextContents()).toEqual([
    "Before",
    "delayed",
    "after.",
    "delayed",
  ]);
  expect(await cells.locator("td:nth-child(3)").allTextContents()).toEqual([
    "",
    "Timing",
    "",
    "",
  ]);
  await finishInterviews(page);
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Compare interviews" });
  const cell = page.locator("#graphic0 [data-code=Timing]").first();
  await cell.focus();
  await cell.press("Enter");
  await expect(page.locator("dialog")).toContainText("1 matching passages");
});

test("an Excel worksheet with a title, blank cells and zero opens via its chosen header", async ({
  page,
}) => {
  const { default: Excel } = await import("exceljs/dist/exceljs.min.js");
  const book = new Excel.Workbook();
  book.addWorksheet("Notes").addRow(["Notes"]);
  const sheet = book.addWorksheet("Survey");
  sheet.addRows([
    ["Class exercise"],
    ["Rating", "Site"],
    [0, "Depot"],
    [null, "Office"],
    [3, "Depot"],
  ]);
  await upload(
    page,
    /I have a Qualtrics export/,
    "synthetic.xlsx",
    await book.xlsx.writeBuffer(),
  );
  await page.getByRole("combobox", { name: "Worksheet" }).selectOption("1");
  await page.getByLabel("Header row number").fill("2");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await expect(page.locator("#graphic0")).toContainText(
    "2 valid numerical answers of 3 selected records",
  );
});

test("review question roles, apply selections and reopen a saved visual", async ({
  page,
}) => {
  await page.route("https://tutor.example.test/ask", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.skill).toBe("variables");
    expect(body.context.questions[0]).not.toHaveProperty("levels");
    const id = (label) =>
      body.context.questions.find((f) => f.label === label).id;
    await route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: [
            {
              id: id("Trust"),
              roles: ["outcome"],
              reason: "This measures the attitude in your question.",
            },
            {
              id: id("Year"),
              roles: ["grouping"],
              reason: "These are the cohorts you want to compare.",
            },
            { id: "unknown", roles: ["outcome"] },
          ],
        }),
      },
    });
  });
  await upload(
    page,
    /I have a Qualtrics export/,
    "cohorts.csv",
    "Trust,Year,Contact\nHigh,First,Often\nLow,Second,Rarely\nHigh,Second,Often\nLow,First,Rarely",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.evaluate(() => sessionStorage.setItem("dv-session", "test"));
  await page.getByRole("button", { name: "Choose question roles" }).click();
  await page
    .getByLabel("What do you want to find out?")
    .fill("Does trust differ by year and frequency of contact?");
  await page
    .getByRole("button", { name: "Suggest roles from my project" })
    .click();
  await expect(page.locator(".role-list input:visible")).toHaveCount(0);
  await expect(
    page.locator(".role-list summary").filter({ hasText: "Trust" }),
  ).toContainText("Outcome");
  await expand(page, "Trust", page.locator(".role-list"));
  await expect(
    page
      .getByRole("group", { name: "Trust", exact: true })
      .getByLabel("Outcome"),
  ).toBeChecked();
  await expand(page, "Contact", page.locator(".role-list"));
  await page
    .getByRole("group", { name: "Contact", exact: true })
    .getByLabel("Explanatory")
    .check();
  await page.getByRole("button", { name: "Confirm question roles" }).click();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  const field = page.getByLabel("Choose a question or column");
  const original = await page.locator("#graphic0").textContent();
  await expand(page, "Chart settings");
  await page.getByLabel("Update the visual as I select").uncheck();
  await field.selectOption({ label: "Contact · Explanatory" });
  await expect(page.locator("#graphic0")).toHaveText(original);
  await page.getByRole("button", { name: "Apply selection to visual" }).click();
  await expect(page.locator("#graphic0")).toContainText("Contact");
  await page.getByRole("button", { name: "Save visual", exact: true }).click();
  await page.getByLabel("Visual name").fill("Contact distribution");
  await page.getByLabel("Also download this visual as an SVG image").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save to project" }).click();
  expect((await download).suggestedFilename()).toBe("Contact distribution.svg");
  await page
    .getByRole("button", { name: "Change selection", exact: true })
    .click();
  await field.selectOption({ label: "Year · Grouping" });
  await page.getByRole("button", { name: "Apply selection to visual" }).click();
  await page
    .getByRole("button", { name: "Save and export", exact: true })
    .click();
  await page.getByText("Other save options", { exact: true }).click();
  await page.getByRole("button", { name: "Save on this device" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Resume on this device" }).click();
  await page
    .getByRole("button", { name: "Save and export", exact: true })
    .click();
  await page.getByRole("button", { name: "Open visual" }).click();
  await expect(page.locator("#graphic0")).toContainText("Contact");
  await expect(field.locator("option:checked")).toHaveText(
    "Contact · Explanatory",
  );
});

test("open survey questions keep their research role and reopen reviewed written answers", async ({
  page,
}) => {
  await upload(
    page,
    /I have a Qualtrics export/,
    "transport.csv",
    "Study year,What makes travel difficult?,Arrival time\nFirst,Cost,Early\nSecond,Time and cost,Late\nFirst,,Late",
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Choose question roles" }).click();
  await expand(
    page,
    "What makes travel difficult?",
    page.locator(".role-list"),
  );
  const question = page.getByRole("group", {
    name: "What makes travel difficult?",
    exact: true,
  });
  await question.getByLabel("Explanatory").check();
  await question.getByLabel("Open question").check();
  await page.getByRole("button", { name: "Confirm question roles" }).click();
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  const sourceSurvey = await page
    .getByLabel("Choose a question or column")
    .locator("option")
    .allTextContents();
  expect(sourceSurvey).toContain(
    "What makes travel difficult? · Explanatory / Open question",
  );
  await page.getByLabel("Choose a question or column").selectOption({
    label: "What makes travel difficult? · Explanatory / Open question",
  });
  await expect(page.locator("#graphic0")).toContainText("2 written answers");
  await page
    .getByRole("button", { name: "Read and code answers", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "2 of 3 included respondents answered",
  );
  await page.locator("[name=pickp]").first().check();
  await page.getByLabel("Code to apply").fill("Travel cost");
  await page
    .getByRole("button", { name: "Mark reviewed / apply code" })
    .click();
  await page
    .getByLabel("What would you like to find out?")
    .selectOption({ label: "Compare themes across answers" });
  await expect(page.locator("#graphic0")).toContainText("Travel cost");
  await expect(page.locator("#graphic0")).toContainText(
    "1 of 2 written answers reviewed",
  );
  await page.getByLabel("Current dataset").selectOption({
    label: await page
      .getByLabel("Current dataset")
      .locator("option")
      .first()
      .textContent(),
  });
  await page
    .getByRole("button", { name: "Read and code answers", exact: true })
    .click();
  await expect(page.locator("#passlist")).toContainText("Travel cost");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByLabel("Current dataset").locator("option"),
  ).toHaveCount(2);
});

test("chat grounds label suggestions and applies only the accepted batch to the saved transcript", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let calls = 0;
  await page.route("https://tutor.example.test/ask", (route) => {
    const body = route.request().postDataJSON();
    expect(body.skill).toBe("coding");
    expect(body.context.passages).toHaveLength(2);
    calls++;
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: body.context.passages.map((p) => ({
            id: p.id,
            quote: p.text,
            code: "Opening hours",
            definition: "A reference to when a service is open.",
          })),
        }),
      },
    });
  });
  await upload(
    page,
    /Written responses or documents/,
    "example.txt",
    "The library is open late.\nThe library closes too early.\nPrivate sentence left out.",
  );
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Data bot").click();
  await page
    .locator("#question")
    .fill("Could you come up with labels for the transcript?");
  await btn("Send").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Choose passages for labelling",
  );
  expect(calls).toBe(0);
  await page.locator("[name=pickp]").nth(2).uncheck();
  await btn("Suggest labels for these passages").click();
  await expect(btn("Apply all suggested labels")).toBeVisible();
  await page.locator("#question").fill("Please apply them");
  await btn("Send").click();
  await expect(page.locator(".chatlog")).toContainText(
    "Applied 2 label assignments across 2 passages",
  );
  await expect(btn("Apply all suggested labels")).toHaveCount(0);
  expect(calls).toBe(1);
  await btn("Close").click();
  await btn("Save and export").click();
  const dl = page.waitForEvent("download");
  await btn("Download project with data").click();
  const chunks = [];
  for await (const c of await (await dl).createReadStream()) chunks.push(c);
  const saved = JSON.parse(Buffer.concat(chunks));
  expect(saved.datasets[0].passages.map((p) => p.codes)).toEqual([
    ["Opening hours"],
    ["Opening hours"],
    [],
  ]);
  expect(saved.datasets[0].passages.map((p) => p.reviewed)).toEqual([
    true,
    true,
    false,
  ]);
  expect(saved.datasets[0].coding.meanings).toHaveLength(1);
});

test("two interviews share an approved inductive codebook, resume a bot draft and open a presence grid", async ({
  page,
}) => {
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let failOnce = true;
  const requests = [];
  await page.route("https://tutor.example.test/ask", (route) => {
    const { context, skill } = route.request().postDataJSON();
    expect(skill).toBe("coding");
    const { guide, passages } = context;
    requests.push(context);
    if (
      guide.mode === "deductive" &&
      passages[0].source === "Second.txt" &&
      passages[0].text.includes("six") &&
      failOnce
    ) {
      failOnce = false;
      return route.fulfill({ status: 503, json: { error: "Try again" } });
    }
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: passages.map((p) => ({
            id: p.id,
            code: "Fare cost",
            definition: "The cost of a ticket.",
            quote: p.text,
            reason: "Mentions a fare.",
          })),
        }),
      },
    });
  });
  await upload(
    page,
    /Upload uncoded transcripts/,
    "First.txt",
    "My fare doubled.\nMy ticket is expensive.",
  );
  await expect(btn("Explore themes")).toBeDisabled();
  await btn("Data bot").click();
  await page.locator("#question").fill("Could you code my transcript?");
  await btn("Send").click();
  await btn("Send selected passages").click();
  await page.locator("[data-act=closebot]").click();
  await btn("Review suggested coding").click();
  await expect(page.getByRole("dialog")).toContainText("My fare doubled.");
  await page.locator("[name=iv-match]").last().uncheck();
  await btn("Apply reviewed coding").click();
  await expect(page.locator(".iv-passage").last()).not.toContainText(
    "Fare cost",
  );
  await btn("Use these labels for all interviews").click();
  await btn("Mark this interview as checked").click();
  await btn("Mark as checked").click();
  await btn("+ Add interview").click();
  const picker = page.waitForEvent("filechooser");
  await btn("Choose files").click();
  await (
    await picker
  ).setFiles({
    name: "Second.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      ["zero", "one", "two", "three", "four", "five", "six", "seven"]
        .map((n) => "Ticket cost " + n)
        .join("\n"),
    ),
  });
  await expect(page.locator(".iv-progress")).toContainText("1 of 2");
  await btn("Apply codebook to interviews").click();
  await btn("Send to bot for coding").click();
  await expect(btn("Resume coding")).toBeVisible();
  await expect(page.locator(".iv-passage .iv-chip")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await btn("Save coding project").click();
  const chunks = [];
  for await (const c of await (await download).createReadStream())
    chunks.push(c);
  await page.reload();
  const reopen = page.waitForEvent("filechooser");
  await btn("Open a saved project").click();
  await (
    await reopen
  ).setFiles({
    name: "project.json",
    mimeType: "application/json",
    buffer: Buffer.concat(chunks),
  });
  await btn("Resume coding").click();
  await btn("Send to bot for coding").click();
  await btn("Review suggested coding").click();
  await btn("Apply reviewed coding").click();
  await expect(page.locator(".iv-passage")).toHaveCount(8);
  await expect(page.locator(".iv-passage > div > .iv-chip")).toHaveCount(8);
  await finishInterviews(page);
  await expect(page.locator("#graphic0")).toContainText("Second.txt");
  await expect(page.locator("#graphic0")).toContainText("Fare cost");
  const fixed = requests.filter((r) => r.guide.mode === "deductive");
  expect(fixed).toHaveLength(3);
  expect(
    fixed.every(
      (r) =>
        r.guide.vocabulary.length === 1 &&
        r.passages.every((p) => p.source === "Second.txt"),
    ),
  ).toBe(true);
});

test("deductive interview codebook upload, review, whole-transcript matching and manual correction", async ({
  page,
}) => {
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  await page.route("https://tutor.example.test/ask", (route) => {
    const { skill, context } = route.request().postDataJSON();
    if (skill === "codebook")
      return route.fulfill({
        json: {
          answer: JSON.stringify({
            entries: [{ label: "Cost", definition: "Fare expense" }],
          }),
        },
      });
    expect(context.guide.mode).toBe("deductive");
    expect(context.guide.vocabulary[0].label).toBe("Fare cost");
    const p = context.passages[0];
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          suggestions: ["Fare cost", "Wrong label"].map((code) => ({
            id: p.id,
            code,
            quote: "train fare",
            reason: "Names the cost",
          })),
        }),
      },
    });
  });
  await upload(
    page,
    /Upload uncoded transcripts/,
    "travel.txt",
    "The train fare is high.\nI walk in the sunshine.",
  );
  await page.getByRole("button", { name: /Use an uploaded codebook/ }).click();
  await page.locator("#book-file").setInputFiles({
    name: "guide.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Cost: Fare expense"),
  });
  await btn("Extract labels").click();
  await page.locator("[data-label]").fill("Fare cost");
  await btn("Use these labels").click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Apply codebook to interview" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.locator(".iv-tools button").first()).toHaveText(
    "Apply codebook to interview",
  );
  await btn("Apply codebook to interview").click();
  await btn("Send to bot for coding").click();
  await btn("Review suggested coding").click();
  await expect(page.locator("[name=iv-match]")).toHaveCount(1);
  await btn("Apply reviewed coding").click();
  await expect(page.locator(".iv-passage").first()).toContainText("train fare");
  await page.locator("button[data-act=iv-select]").last().click();
  await btn("Edit labels on selected text").click();
  await page.locator("[name=iv-label]").check();
  await btn("Save passage coding").click();
  await expect(page.locator(".iv-passage").last()).toContainText("Fare cost");
});

test("reclassifying the visible survey question as open keeps its answers out of ordinary bot requests", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let received;
  await page.route("https://tutor.example.test/ask", (route) => {
    received = route.request().postDataJSON();
    return route.fulfill({
      json: {
        answer: JSON.stringify({
          action: "answer",
          explanation: "Read individual written answers in this view.",
        }),
      },
    });
  });
  await upload(
    page,
    /Qualtrics export/,
    "review.csv",
    "Reason,Location\nSynthetic statement north,East\nSynthetic statement south,West",
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Confirm and explore").click();
  await btn("Check").click();
  await btn("Choose question roles").click();
  await page
    .locator(".role-list summary")
    .filter({ hasText: "Reason" })
    .click();
  await page
    .getByRole("group", { name: "Reason", exact: true })
    .getByLabel("Open question")
    .check();
  await btn("Confirm question roles").click();
  await btn("Confirm and explore").click();
  await expect(page.locator("#graphic0")).toContainText(
    "Synthetic statement north",
  );
  await btn("Data bot").click();
  await page.locator("#question").fill("Explain this view");
  await btn("Send").click();
  await expect.poll(() => !!received).toBe(true);
  expect(JSON.stringify(received)).not.toContain("Synthetic statement");
});

test("a focus statement followed by a plotting request uses the new focus and draws the chart", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  const requests=[];
  await page.route("https://tutor.example.test/ask", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({json:{answer:JSON.stringify({action:"answer", explanation:"The paired data address commuting."})}});
  });
  const csv =
    "StartDate,EndDate,Q1,Q2\nStart Date,End Date,Distance cycled,Minutes cycling\n" +
    Array.from({ length: 15 }, (_, i) =>
      [2026, 2026, i + 1, 5 * (i + 1) + 7].join(","),
    ).join("\n");
  await upload(page, /I have a Qualtrics export/, "commute.csv", csv);
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Confirm and explore").click();
  await btn("Data bot").click();
  await page
    .locator("#question")
    .fill(
      "My project is about commuting. Could you plot Distance cycled on the horizontal axis and Minutes cycling on the vertical axis as a scatterplot?",
    );
  await btn("Send").click();
  await expect(
    page.locator('[data-chart][aria-pressed="true"]'),
  ).toHaveAttribute("data-chart", "scatter");
  expect(requests).toHaveLength(0);
  await expect(page.locator('#graphic0 svg')).toContainText("15 paired observations");
  await page.locator('#question').fill("My project is about cycle travel. Please explain the chart.");
  await btn("Send").click();
  await expect(page.locator(".chatlog .msg-assistant").last()).toContainText("The paired data address commuting");
  expect(requests).toHaveLength(1);
  expect(requests[0].question).toBe("Please explain the chart.");
  expect(requests[0].context.projectFocus).toBe("My project is about cycle travel");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("choosing among similar survey questions draws exactly the confirmed pair", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("dv-session", "test"));
  let calls = 0;
  await page.route("https://tutor.example.test/ask", (route) => {
    calls++;
    return route.abort();
  });
  const csv =
    "StartDate,EndDate,Q1,Q2,Q3,Q4\nStart Date,End Date,Trust in council,Trust in courts,Current year,Year joined\n2026,2026,High,Low,First,2023\n2026,2026,Low,High,Second,2024";
  await upload(page, /I have a Qualtrics export/, "trust.csv", csv);
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Confirm and explore").click();
  await btn("Data bot").click();
  await page
    .locator("#question")
    .fill(
      "Draw a heatmap of trust by year, showing percentages within each year.",
    );
  await btn("Send").click();
  await expect(
    page.getByText("Which survey questions did you mean?"),
  ).toBeVisible();
  await expect(page.locator("#resolve-axis-0")).toHaveValue("");
  await expect(page.locator("#resolve-axis-1")).toHaveValue("");
  await page
    .locator("#resolve-axis-0")
    .selectOption({ label: "Trust in courts" });
  await page.locator("#resolve-axis-1").selectOption({ label: "Year joined" });
  await btn("Draw this comparison").click();
  await expect(page.locator("#graphic0 svg")).toHaveAttribute(
    "aria-label",
    "Trust in courts by Year joined",
  );
  await expect(
    page.locator('#graphic0 [data-source="2023"][data-code="Low"] text'),
  ).toHaveText("100");
  expect(calls).toBe(0);
});
