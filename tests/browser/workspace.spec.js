import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
async function upload(page, route, name, data) {
  await page.goto("/");
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
  await page.getByRole("button", { name: "Save on this device" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
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
  await page.getByRole("button", { name: "Confirm and explore" }).click();
  await page.getByRole("button", { name: "Read and code passages" }).click();
  await page.locator("input[name=pickp]").check();
  await page.getByLabel("Code to apply").fill("Barriers");
  await page
    .getByRole("button", { name: "Mark reviewed / apply code" })
    .click();
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
  await prompt.fill("Yes, show me");
  await send.click();
  await expect(page.locator('[data-key="chart"]')).toHaveValue("grid");
  expect(calls).toBe(1);
  await prompt.fill("Make a dot plot of turnout instead");
  await send.click();
  await expect(page.locator('[data-key="chart"]')).toHaveValue("dots");
  await page.getByRole("button", { name: "Undo view change" }).click();
  await expect(page.locator('[data-key="chart"]')).toHaveValue("grid");
});

test("questionnaire labels reach charts and the bot can move, resize and dock", async ({
  page,
}) => {
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
    .selectOption("group");
  await expect(
    page.getByLabel("Which question defines the groups?"),
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
    await key("chart").selectOption(chart);
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
  await page.locator("#panels").selectOption("both");
  await page.locator("#layout").selectOption("vertical");
  await page.locator("#preset").selectOption("940");
  await click("Preview figure");
  await expect(page.locator("#previewFigure > svg > svg")).toHaveCount(2);
  await click("Done");
  const file = page.waitForEvent("download");
  await click("Download PNG");
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
        answer: JSON.stringify({
          action: "draw",
          task: "model",
          chart: "model",
          outcome: "Score",
          predictors: ["Age"],
        }),
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
                code: "Barrier",
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
      "\ufeffInterview\tPassage\tCodes\nA\tI worked late\tTime;Work\nB\tI arrived early\tPlanning",
      "utf16le",
    ),
  );
  const btn = (name) => page.getByRole("button", { name, exact: true });
  await btn("Continue").click();
  await btn("Continue").click();
  await btn("Confirm and explore").click();
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
  await page.locator("#suggestpass").click();
  await expect(page.locator("[data-act=acceptcode]")).toBeVisible();
  expect(replies).toHaveLength(1);
  await page.locator("[data-act=acceptcode]").click();
  await page.locator("#approved").fill("Schedule");
  await page.locator("#modalform button[type=submit]").click();
  await expect(page.locator("#graphic0")).toContainText("Schedule");
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
  await expect(page.locator('[data-key="chart"]')).toHaveValue("grid");
  await expect(page.locator("#graphic0 [data-code]")).toHaveCount(4);
});
