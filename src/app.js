import {
  chooseHelpMode,
  helpSettings,
  helpSuggestion,
  readHelpMode,
  saveHelpMode,
} from "./bot-help.js";
import { structuredAnswer } from "./bot-response.js";
import { interviewScopeRequest } from "./interview-scope.js";
import { requestInterviewCoding } from "./interview-coding-request.js";
import {
  isInterview,
  interviews,
  appendInterviews,
  sharedBook,
} from "./interviews.js";
import {
  listCodingCopies,
  loadCodingCopy,
  removeCodingCopy,
  saveCodingCopy,
  useCodingCopy,
} from "./interview-recovery.js";
import {
  interviewScreen,
  interviewAction,
  interviewActivity,
} from "./interview-workspace.js";
import { transcriptEndpoint } from "./interview-manual.js";
import { writtenAnswerSet, isOpenQuestion } from "./open-answers.js";
import { confirmedRoles, editRoles } from "./variable-roles.js";
import { termHelp, bindTermHelp, termMeaning } from "./term-help.js";
import "./style.css";
import {
  indicatorColumns,
  bindIndicatorColumns,
  readIndicators,
} from "./indicator-ui.js";
import {
  codingGuide,
  approvedBook,
  codingRequestContext,
  labelKey,
  checkedSuggestions,
  acceptsCodingBatch,
  requestsCoding,
  requestsLabelDiscovery,
  applyCodingBatch,
} from "./coding.js";
import { codingControls, bindCodingControls } from "./codebook-ui.js";
import { tutorRecord, projectPackage, previousWork } from "./tutor-history.js";
import {
  analyticalEvidence,
  pairedStatistics,
  categoricalPattern,
} from "./tutor-evidence.js";
import {
  chartFields,
  directComparison,
  namedSurveyComparison,
  patternRequest,
  groupingRequest,
  namedChartRequest,
  resolveAxis,
} from "./question-matching.js";
import { filterRequest } from "./filter-request.js";
import { labelledSurvey } from "./survey-labels.js";
import { isDocked, toggleDock, layoutBot } from "./bot-panel.js";
import { combineTables } from "./combine.js";
import {
  combineCheckboxes,
  hasAnswer,
  matchesValue,
  optionLevels,
  displayedAnswer,
} from "./survey-answers.js";
import { uid, filteredRows } from "./import.js";
import { importFiles } from "./import-ui.js";
import {
  fresh,
  verifyProject,
  switchDataset,
  reattach,
  settingsProject,
  renameTheme,
  editInterviewLabel,
  linkage,
} from "./project.js";
import { newView, analyse, allCodes, kinds } from "./analysis.js";
import {
  patternChoices,
  patternModes,
  selectionLimit,
  patternAnswers,
  groupChoices,
  groupValue,
} from "./patterns.js";
import {
  focusLimit,
  readFocus,
  projectFocusMessage,
  researchCatalogue,
  researchChart,
  researchExplanation,
} from "./research-focus.js";
import { asksForGroupSuggestion } from "./group-suggestions.js";
import { fitModel } from "./model.js";
import {
  figureStyles,
  styleFor,
  highlightChoices,
  paletteOptions,
  paletteFor,
} from "./figure-styles.js";
import {
  esc,
  figure,
  styleSample,
  combinedSVG,
  exportSVG,
  blobSave,
} from "./chart.js";
import {
  icon,
  activityIcon,
  busyIndicator,
  mark,
  button as b,
  opts,
  table,
  get,
  val,
  notice,
  modal,
  askForm,
  formselect,
} from "./ui.js";
import {
  landing,
  check,
  panel,
  datasetSelect,
  saveScreen,
  available,
} from "./screens.js";
const steps = ["Upload", "Check", "Explore", "Compare", "Save and export"],
  icons = ["upload", "check", "explore", "compare", "save"];
let proposal = null,
  captionDraft = null,
  queuedShortcut = null,
  botFocus = "left";
function focusBot(target) {
  if (botFocus !== target) {
    proposal = null;
    captionDraft = null;
    queuedShortcut = null;
  }
  botFocus = target;
}
const focusIndex = () => (step === 3 && botFocus === "right" ? 1 : 0);
function viewName(d, v) {
  if (v.task === "themes") return "Themes in written answers";
  const name = (id) => d.fields?.find((f) => f.id === id)?.label || id;
  if (v.task === "patterns")
    return (
      ((v.items || []).map(name).join(" · ") || "Choose questions or themes") +
      (v.groupBy ? " by " + name(v.groupBy) : "")
    );
  if (v.task === "model") return name(v.outcome) || "Model";
  if (d.kind === "text" && v.task === "group")
    return "Themes across interviews";
  return (
    [name(v.x), v.task !== "one" && name(v.y)].filter(Boolean).join(" by ") ||
    "All passages"
  );
}
function botWorkspaceControls() {
  if (![2, 3].includes(step)) return "";
  const compare = step === 3,
    both = compare && botFocus === "both";
  const view = project.views[focusIndex()],
    d = getData();
  const target = compare
    ? formselect(
        "bot-focus",
        "Use for this request",
        [
          ["left", "Left view"],
          ["right", "Right view"],
          ["both", "Both views"],
        ],
        botFocus,
      )
    : "";
  const describe = (v) => {
    const filter = v.filter
      ? " · " +
        (d.fields?.find((f) => f.id === v.filter)?.label || v.filter) +
        " = " +
        v.value
      : "";
    return viewName(d, v) + " · " + kinds[v.chart] + filter;
  };
  const names = both ? project.views.map(describe).join(" / ") : describe(view);
  const controls = both
    ? b("askboth", "Compare findings")
    : b("choose", "Suggest a chart") +
      b("askview", "Explain the pattern", "", `data-i="${focusIndex()}"`) +
      (available(d, view).length > 1
        ? b("botvariant", "Try another chart")
        : "") +
      (["one", "two", "patterns"].includes(view.task)
        ? b("suggestgroups", "Suggest groups to compare")
        : "") +
      b("botcaption", "Draft a caption");
  return `<div class="bot-selection">${target}<strong>${esc(names)}</strong><div class="bar">${controls}</div></div>`;
}
// Work belongs to the open project and dataset. Separate active tasks can
// finish in any order, including after the student has closed the bot panel.
const botTasks = new Set();
function refreshBotActivity() {
  const dataset = getData();
  let message = interviewActivity(dataset);
  for (const task of botTasks) {
    if (task.owner === project && task.dataset === dataset)
      message = task.message;
  }
  const nav = document.querySelector(".botnav");
  if (nav && (nav.dataset.activity || "") !== message) {
    nav.dataset.activity = message;
    nav.title = message ? "Data bot · " + message : "Data bot";
    if (message) nav.setAttribute("aria-description", message);
    else nav.removeAttribute("aria-description");
    nav.querySelector("svg").outerHTML = message ? activityIcon : icon("bot");
  }
  const status = get("bot-task-status");
  if (status && (status.dataset.activity || "") !== message) {
    status.dataset.activity = message;
    status.innerHTML = message ? busyIndicator(message, false) : "";
  }
}
async function withBotActivity(message, run) {
  const task = { owner: project, dataset: getData(), message };
  botTasks.add(task);
  try {
    refreshBotActivity();
    return await run();
  } finally {
    botTasks.delete(task);
    refreshBotActivity();
  }
}

let undoViews = [],
  project = { ...fresh(), mode: readHelpMode() },
  step = 0,
  compact = false,
  bot = false,
  history = [],
  requesting = false,
  chosen = new Set(),
  scope = [],
  suggestions = [],
  lastQuestion = "";
const pendingSelections = new Map();
let selectionConfirmed = false;
const selectionKeys = [
  "task",
  "x",
  "y",
  "outcome",
  "positive",
  "predictors",
  "interaction",
  "items",
  "patternMode",
  "groupBy",
  "themeUnit",
];
function beginSelection(i) {
  const base = structuredClone(project.views[i]);
  pendingSelections.set(i, { base, view: structuredClone(base) });
}
function commitSelection(i) {
  const draft = pendingSelections.get(i);
  if (!draft) return;
  const current = project.views[i];
  const changed = selectionKeys.filter(
    (k) => JSON.stringify(draft.base[k]) !== JSON.stringify(draft.view[k]),
  );
  if (changed.length) {
    const next = { ...current };
    for (const k of [...changed, "chart"]) next[k] = draft.view[k];
    next.title = next.annotation = "";
    delete next.highlight;
    if (!available(getData(), next).includes(next.chart))
      next.chart = available(getData(), next)[0];
    summary(i, next);
    snapshotViews();
    project.views[i] = next;
    proposal = captionDraft = queuedShortcut = null;
  }
  beginSelection(i);
}
const getData = () => project.datasets.find((d) => d.id === project.active);
const resetTutor = () => {
  botFocus = "left";
  captionDraft = null;
  queuedShortcut = null;
  proposal = null;

  history = tutorRecord(project).messages;
  chosen.clear();
  scope = [];
  suggestions = [];
  lastQuestion = "";
};
function activate(id) {
  pendingSelections.clear();
  selectionConfirmed = false;
  undoViews = [];
  switchDataset(project, id, newView);
  resetTutor();
}
const botURL = (import.meta.env.VITE_BOT_URL || "").replace(/\/$/, "");
const puzzleDrafts = new WeakMap();
let unlocking = false;

function projectFocusControls() {
  const saved = project.researchFocus;
  const editing =
    puzzleDrafts.has(project) || (!saved && !project.puzzleSkipped);
  if (!editing) {
    if (!saved)
      return `<div class="bot-puzzle-collapsed">${b("editpuzzle", "Add research question or puzzle", "plain")}</div>`;
    return `<section class="bot-puzzle-summary"><div><small>Research question or puzzle</small><p title="${esc(saved)}">${esc(saved)}</p></div>${b("editpuzzle", "Edit", "plain", 'aria-label="Edit research question or puzzle"')}</section>`;
  }
  return `<section class="bot-puzzle-editor"><label for="puzzle-field">Research question or puzzle <small>(optional)</small></label>
    <textarea id="puzzle-field" rows="2" maxlength="${focusLimit}" aria-describedby="puzzle-help" placeholder="What are you trying to find out?">${esc(puzzleDrafts.get(project) ?? saved)}</textarea>
    <small id="puzzle-help">The bot uses this to suggest questions, themes and comparisons for your project.</small>
    <div class="bar">${b("savepuzzle", "Save")}${b("skippuzzle", saved ? "Cancel" : "Skip for now", "plain")}</div></section>`;
}
function editProjectFocus(draft) {
  modal(
    "Your project focus",
    `<label>What is your project about, and what do you want to find out?<textarea id="research-focus" rows="4" maxlength="${focusLimit}">${esc(draft ?? project.researchFocus)}</textarea></label><p>A sentence or two is enough. This is optional and saved with your project. Leave it blank to clear it.</p>`,
    () => {
      if (val("research-focus").trim().length > focusLimit)
        throw Error("Keep your project focus to 2,000 characters or fewer.");
      project.researchFocus = readFocus(val("research-focus"));
      puzzleDrafts.delete(project);
      project.puzzleSkipped = !project.researchFocus;
      proposal = captionDraft = queuedShortcut = null;
      if (draft !== undefined) lastQuestion = "";
      render();
      notice(
        project.researchFocus
          ? "Project focus saved."
          : "Project focus cleared.",
      );
    },
    "Save project focus",
  );
}
function botSession() {
  const token = sessionStorage.getItem("dv-session");
  const expiry = token?.split(".")[1];
  if (expiry && /^\d+$/.test(expiry) && Number(expiry) <= Date.now()) {
    sessionStorage.removeItem("dv-session");
    return null;
  }
  return token;
}
function botBox() {
  const unlocked = !!botURL && !!botSession();
  const header = `<header class="bothead" data-window-handle="move"><h2 title="Drag the title bar to move the floating window">Data bot</h2><div class="bottools">${unlocked ? helpSettings() : ""}${unlocked && innerWidth >= 900 ? b("dockbot", isDocked() ? "Float window" : "Dock right") : ""}${b("closebot", "Close", "plain")}</div></header>`;
  const gate = botURL
    ? `<div class="bot-access"><label for="course">Workshop course code</label><input id="course" type="password" autocomplete="off" aria-describedby="course-error"><div id="course-error" role="alert"></div>${b("unlock", unlocking ? "Unlocking…" : "Unlock the bot", "primary", unlocking ? "disabled" : "")}<div id="bot-task-status" role="status"></div></div>`
    : "<p>The workshop bot is currently unavailable.</p>";
  return `<section id="data-bot" aria-label="Data bot workspace" class="bot ${isDocked() ? "docked" : "floating"} ${unlocked ? "" : "bot-locked"}">${header}<div class="botbody">${unlocked ? botChat() : gate}</div>${unlocked ? '<div class="botsize" data-window-handle="resize" title="Drag to resize"></div>' : ""}</section>`;
}

function botChat() {
  const dataset = getData();
  const context = {
    step,
    dataset,
    view: project.views[focusIndex()],
    panel: focusIndex(),
    both: step === 3 && botFocus === "both",
  };
  const draft = step === 1 && dataset?.interviews?.draft;
  const reviewReady = draft && draft.next === draft.total && draft.total > 0;
  const messages = history
    .map(
      (t) =>
        `<div class="msg ${t.role === "user" ? "msg-user" : "msg-assistant"}"><strong>${t.role === "user" ? "You" : "Data bot"}</strong><p>${esc(t.content)}</p></div>`,
    )
    .join("");
  return `${projectFocusControls()}<section class="bot-conversation" aria-label="Chat"><h3>Chat</h3><div class="chatlog" role="log" aria-label="Conversation">${messages}</div><div id="bot-task-status" role="status"></div>
    ${proposal ? b("botdraw", "Make this chart", "primary") + (proposal.groupSuggestion ? b("declinegroups", "No thanks", "plain") : "") : ""}
    ${suggestions.length ? b("applycodes", "Apply all suggested labels", "primary") : ""}${suggestions.map((s, i) => `<div class="card"><b>${esc(s.code)}</b><small>${esc(s.source)}</small><p>“${esc(s.quote)}”</p><small>${esc(s.reason)}</small><div>${b("acceptcode", "Review label", "", 'data-i="' + i + '"')} ${b("dismisscode", "Dismiss", "plain", 'data-i="' + i + '"')}</div></div>`).join("")}
    ${captionDraft ? b("applycaption", "Add caption to figure") : ""}
    ${chosen.size || scope.length ? `<div class="bot-included"><small>Included with your message · ${chosen.size} selected passages · ${scope.length} whole sources</small>${b("clearevidence", "Clear included text", "plain")}</div>` : ""}
    <textarea id="question" rows="2" aria-label="Ask about your project" maxlength="4000" placeholder="Ask about your project…">${esc(lastQuestion)}</textarea><div class="bar">${b("send", "Send", "primary", requesting ? "disabled" : "")}</div></section>
    ${
      reviewReady
        ? '<div class="bot-hint" role="status"><span>' +
          (draft.sample ? "Draft labels ready" : "Coding draft ready") +
          "</span>" +
          b(
            "iv-review",
            draft.sample ? "Review draft labels" : "Review suggested coding",
            "primary",
          ) +
          "</div>"
        : requesting
          ? ""
          : helpSuggestion(project.mode, context)
    }
    <details class="bot-extras" data-chart-options="bot-extras"><summary>Chat tools</summary>${botWorkspaceControls()}
    <div class="bar">${dataset?.kind === "table" ? b("variables", "Identify question roles") : ""}${project.researchFocus && [2, 3].includes(step) ? b("researchsuggest", "Suggest what to explore") : ""}${b("scope", "What the bot can see")}</div>
    ${
      tutorRecord(project).activity.length
        ? `<details><summary>Project activity</summary><ul>${tutorRecord(
            project,
          )
            .activity.map((note) => "<li>" + esc(note) + "</li>")
            .join("")}</ul></details>`
        : ""
    }</details>`;
}
function analysisReady(d) {
  return (
    !!d &&
    project.confirmed.includes(d.id) &&
    (!isInterview(d) ||
      (!interviews(d).draft &&
        interviews(d).finished &&
        d.sources.every((source) => interviews(d).done.includes(source))))
  );
}
function hasDeviceCopy() {
  try {
    return localStorage.getItem("dv-project") !== null;
  } catch {
    return false;
  }
}
const codingSaveStatus = new WeakMap();
window.addEventListener("beforeunload", (event) => {
  if (codingSaveStatus.get(project)?.needsSave) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function checkpointInterview(p, d) {
  const state = {
    needsSave: true,
    message: "Saving coding progress on this device…",
  };
  codingSaveStatus.set(p, state);
  function showStatus() {
    if (project !== p || codingSaveStatus.get(p) !== state) return;
    document.querySelectorAll("[data-iv-storage]").forEach((el) => {
      el.textContent = state.message;
    });
  }
  showStatus();
  try {
    await saveCodingCopy(p, d.interviews?.source || d.name);
    state.needsSave = false;
    state.message = "Coding progress saved on this device.";
  } catch {
    state.message =
      "This browser could not save your latest changes. Download your coding project before closing or refreshing.";
    if (project === p && codingSaveStatus.get(p) === state)
      notice(state.message);
  }
  showStatus();
}
async function showCodingCopies(container) {
  try {
    const entries = await listCodingCopies();
    if (!container.isConnected || !entries.length) return;
    container.innerHTML =
      "<h2>Recover interview coding</h2>" +
      entries
        .map((entry) => {
          const attributes = 'data-copy="' + esc(entry.id) + '"';
          const when = esc(new Date(entry.saved).toLocaleString());
          return (
            '<div class="bar"><span>' +
            esc(entry.name) +
            " · " +
            esc(entry.source) +
            " · " +
            when +
            "</span>" +
            b("recoverCoding", "Resume coding project", "", attributes) +
            b("removeCodingCopy", "Remove recovery copy", "plain", attributes) +
            "</div>"
          );
        })
        .join("");
    container.hidden = false;
  } catch {
    // Upload and downloaded projects still work when browser storage is blocked.
  }
}
// Rendering a completed bot batch replaces the transcript's text nodes. Retain
// a student's unfinished native text selection by its original passage offsets.
function readingSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const anchor = transcriptEndpoint(
    selection.anchorNode,
    selection.anchorOffset,
  );
  const focus = transcriptEndpoint(selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) return;
  const point = ({ id, offset }) => {
    const paragraph = document.querySelector(
      '[data-iv-text="' + CSS.escape(id) + '"]',
    );
    if (!paragraph) return;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (offset <= node.length) return [node, offset];
      offset -= node.length;
    }
  };
  return () => {
    const from = point(anchor),
      to = point(focus);
    if (from && to) selection.setBaseAndExtent(...from, ...to);
  };
}
function documentCodebook(d) {
  const draft = d.coding?.bookDraft;
  const approved = approvedBook(d);
  if (!draft && !approved.length)
    return b("makeinterview", "Use the interview coding workspace");
  const labels = (entries) =>
    entries
      .filter((e) => e.label.trim())
      .map((e) => esc(e.label))
      .join(" · ");
  return `<section class="card document-codebook"><h2>Project codebook</h2>
    ${draft ? `<p><strong>Draft labels to review</strong><br>${labels(draft.entries) || "Your draft is ready to edit."}</p>` : ""}
    ${approved.length ? `<p><strong>Approved labels</strong><br>${labels(approved)}</p>` : ""}
    ${b("makeinterview", "Use the interview coding workspace")}
    <small>Review your labels, code a passage yourself or choose interviews for the bot.</small></section>`;
}
function render() {
  // A student may reopen a visual or change an existing question into an open one.
  const dataset = getData();
  if (dataset?.kind === "table") {
    for (const v of project.views) {
      if (
        v.task === "one" &&
        v.chart !== "excerpts" &&
        isOpenQuestion(dataset.fields.find((f) => f.id === v.x))
      ) {
        v.chart = "excerpts";
        v.title = "";
        v.annotation = "";
      }
    }
  }
  const restoreReadingSelection = readingSelection();
  const transcriptScroll = document.querySelector(".iv-text")?.scrollTop || 0;
  const previousSource = document.querySelector(".iv-paper h2")?.textContent;
  const expanded = [
    ...document.querySelectorAll("details[data-chart-options][open]"),
  ].map((el) => el.dataset.chartOptions);
  const d = getData(),
    interview = isInterview(d),
    confirmed = analysisReady(d),
    labels = interview
      ? [
          "Upload",
          "Code interviews",
          "Explore themes",
          "Compare",
          "Save and export",
        ]
      : steps,
    headers = [
      "",
      interview ? "Code your interviews" : "Check your upload",
      interview ? "Explore interview themes" : "Explore your data",
      "Compare two views",
      "Save and export",
    ];
  const roleButton =
    d?.kind === "table"
      ? b(
          "variables",
          confirmedRoles(d).length
            ? "Review question roles"
            : "Choose question roles",
        )
      : "";
  const openFields = d?.fields?.filter(isOpenQuestion) || [];
  const openRoute = openFields.length
    ? `<section class="card"><h2>Written survey answers</h2><p>Read the answers in respondents’ own words, label recurring themes, then compare themes across respondents. This uses the survey records included in Check.</p>${formselect(
        "open-question",
        "Open question",
        openFields.map((f) => [f.id, f.label]),
        project.views[0]?.x,
      )}<div class="bar">${b("openanswers", "Read and code answers")}</div></section>`
    : "";
  const coverage = d?.openAnswers;
  const coverageNote = coverage
    ? `<p class="review"><strong>${esc(coverage.question)}</strong><br>${coverage.answered} of ${coverage.eligible} included respondents wrote an answer. ${coverage.eligible - coverage.answered} had no recorded answer. Theme comparisons use respondents who wrote an answer.</p>`
    : "";
  let content = step === 0 ? landing(hasDeviceCopy()) : "";
  if (step !== 0 && d) {
    content = `<div class="hero"><h1>${headers[step]}</h1></div>${datasetSelect(project)}${coverageNote}`;
    if (
      d.textPurpose === "documents" &&
      !d.openAnswers &&
      step <= 3 &&
      (step === 1 || d.coding?.bookDraft || d.coding?.book?.length)
    )
      content += `<div id="document-codebook">${documentCodebook(d)}</div>`;
    if (step === 1 && interview) {
      content +=
        interviewScreen(d, codingSaveStatus.get(project)?.message) +
        '<details class="iv-import"><summary>Import details and source information</summary>' +
        check(d) +
        "</details>";
    } else if (step === 1)
      content += `<div class="bar">${b("upload", "Add files", "", 'data-route="' + (d.kind === "text" ? "coded" : "table") + '"')}</div>${check(d)}${roleButton ? `<section class="card"><h2>Which questions help answer your research question?</h2><p>Identify the outcome, groups and possible explanations. Mark questions with written answers too.</p>${roleButton}</section>` : ""}${openRoute}<div class="bar step-actions">${b("confirm", "Confirm and explore", "primary")}</div>`;
    else if (step === 2 || step === 3)
      content += `${step === 2 ? openRoute : ""}<div class="bar view-actions">${step === 2 ? b("compare", "Compare two views") : b("savecompare", "Save comparison", "primary")}${step === 3 ? b("askboth", icon("bot") + " Compare findings") : ""}${step === 3 ? `<label class="tick"><input id="linked" type="checkbox" ${project.linked ? "checked" : ""}>Link filters</label>` : ""}</div>${step === 3 ? '<p class="caption" id="comparisonNote"></p>' : ""}<div class="${step === 3 ? "pair" : ""}">${project.views
        .slice(0, step === 3 ? 2 : 1)
        .map((v, i) =>
          panel(
            d,
            v,
            i,
            step === 3,
            pendingSelections.get(i)?.view,
            selectionConfirmed && step === 2 ? viewName(d, v) : "",
          ),
        )
        .join(
          "",
        )}</div> ${undoViews.length ? b("undo", "Undo view change", "plain") : ""}<div id="hint"></div>`;
    else if (interview && !confirmed)
      content +=
        '<section class="card"><h2>Save your coding progress</h2><p>Reopen the project to continue with your shared codebook, interviews and any coding draft.</p><div class="bar action-row">' +
        b("download", "Download project with data", "primary") +
        b("device", "Save on this device") +
        "</div></section>";
    else content += saveScreen(project);
  }
  const previousBody = document.querySelector(".botbody");
  const scroll = previousBody?.scrollTop || 0;
  const previousCode = previousBody?.querySelector("#course")?.value;
  const asideBot = bot && isDocked();
  const shortSteps = [
    "Upload",
    interview ? "Code" : "Check",
    interview ? "Themes" : "Explore",
    "Compare",
    "Save",
  ];
  get("app").innerHTML =
    `<div class="shell ${compact ? "compact" : ""}"><aside class="rail"><div class="brand">${mark}<span>Data<br>visualiser</span></div><nav class="nav" aria-label="Workflow">${labels.map((s, i) => `<button title="${s}" aria-label="${s}" data-short="${shortSteps[i]}" data-act="nav" data-i="${i}" ${step === i ? 'aria-current="step"' : ""} ${(i > 0 && !d) || (i > 1 && !confirmed && !(interview && i === 4)) ? "disabled" : ""}>${icon(icons[i])}<span>${s}</span></button>`).join("")}${b("bot", icon("bot") + "<span>Data bot</span>", "botnav", 'aria-label="Data bot" title="Data bot" data-short="Data bot" aria-expanded="' + bot + '"')}</nav><div class="rail-bottom">${b("compact", icon("menu") + "<span>Collapse sidebar</span>", "plain", 'aria-label="Toggle sidebar"')}<small class="app-version">0.1 beta</small></div></aside><main class="main" id="workspace"><header class="top"><span>${esc(project.name)} &nbsp; / &nbsp; ${labels[step]}</span></header><div class="content"><div class="${asideBot ? "withbot" : ""}"><div>${content}</div>${asideBot ? botBox() : ""}</div>${bot && !asideBot ? botBox() : ""}</div></main></div>`;
  if (
    previousSource &&
    previousSource === document.querySelector(".iv-paper h2")?.textContent
  ) {
    restoreReadingSelection?.();
    document.querySelector(".iv-text").scrollTop = transcriptScroll;
  }
  refreshBotActivity();
  if (step === 0) showCodingCopies(get("coding-copies"));
  bindTermHelp(get("app"));
  if (bot) {
    layoutBot();
    if (previousCode && get("course")) get("course").value = previousCode;
    document.querySelector(".botbody").scrollTop = scroll;
  }
  for (const i of expanded) {
    const options = document.querySelector(
      `details[data-chart-options="${i}"]`,
    );
    if (options) options.open = true;
  }
  if (d && (step === 2 || step === 3)) {
    for (let i = 0; i < (step === 3 ? 2 : 1); i++) {
      try {
        draw(i);
      } catch (e) {
        get("graphic" + i).textContent = e.message;
      }
    }
    if (step === 3) {
      const [l, r] = project.views;
      get("comparisonNote").textContent =
        l.filter === r.filter && l.value === r.value
          ? "Both views use the same filter. Open Change left view or Change right view to try another question or chart."
          : "The views use different filters. Check which records each figure includes before comparing them.";
    }
    const hint =
      project.mode === "guided"
        ? "Check what each figure counts and how many responses or interviews each percentage is based on."
        : project.mode === "hints" &&
            d.kind === "text" &&
            d.passages.some((p) => !p.reviewed)
          ? "Some passages are unreviewed. Check coding coverage before interpreting a frequency."
          : project.mode === "hints" &&
              d.kind === "table" &&
              filteredRows(d).length < 20
            ? "Small sample: inspect the underlying counts alongside percentages."
            : "";
    if (hint) get("hint").innerHTML = `<p class="review">${esc(hint)}</p>`;
  }
}
function summary(i, v = project.views[i]) {
  const d = getData();
  if (
    d.kind === "table" &&
    [v.filter, v.groupBy].some(
      (key) => key && isOpenQuestion(d.fields.find((f) => f.id === key)),
    )
  )
    throw Error(
      "The question used to group or filter this figure now contains written answers. Clear that selection or choose a closed question.",
    );
  if (v.task !== "model") return analyse(d, v);
  const rows = filteredRows(d, v),
    m = fitModel(d, rows, { ...v, predictors: v.predictors || [] });
  return {
    ...m,
    title:
      v.title ||
      m.method + " · " + d.fields.find((f) => f.id === v.outcome).label,
    x: m.predictor,
    y: m.event ? "Probability of " + m.event : "Predicted outcome",
    unit: "95% confidence interval",
    note:
      m.n +
      " complete records · " +
      m.excluded +
      " excluded." +
      (m.held ? " Held at " + m.held + "." : "") +
      (m.reference ? " Reference: " + m.reference + "." : ""),
    records: [],
  };
}
function draw(i) {
  const a = summary(i),
    v = project.views[i];
  get("graphic" + i).replaceChildren(figure(a, v, { interactive: true }));
  if (a.coefficients)
    get("modeldetails" + i).innerHTML =
      "<details><summary>Coefficients and model details</summary>" +
      table(
        ["Term", "Estimate", "95% lower", "95% upper"],
        a.coefficients.map((c) => [
          c.term,
          ...[c.estimate, c.low, c.high].map((x) => x.toPrecision(4)),
        ]),
      ) +
      table(
        ["Model diagnostic", "Value"],
        Object.entries(a.diagnostics).map(([k, x]) => [
          k,
          x == null ? "Undefined" : Number(x.toPrecision(4)),
        ]),
      ) +
      "</details>";
}
function chooseFigureStyle(i) {
  const view = project.views[i];
  const analysis = summary(i);
  const choices = highlightChoices(analysis, view).filter(Boolean);
  const current = styleFor(view.style);
  const cards = Object.entries(figureStyles)
    .map(
      ([id, style]) =>
        `<label class="style-choice"><input type="radio" name="figure-style" value="${id}" ${current === id ? "checked" : ""}><span><span class="style-sample" data-sample="${id}"></span><strong>${esc(style.label)}</strong><small>${esc(style.description)}</small></span></label>`,
    )
    .join("");
  const read = () => ({
    style: get("modalform").elements["figure-style"].value,
    palette: val("style-palette"),
    highlight: val("style-highlight"),
  });
  modal(
    "Figure style",
    `<fieldset class="style-choices"><legend>Choose a style for this view</legend>${cards}</fieldset>
    ${formselect("style-palette", "Colour palette", paletteOptions, view.palette || "colour")}<div class="palette-key" id="palette-key" aria-live="polite"></div>
    <div id="highlight-control">${formselect("style-highlight", "Highlight one category or group", [["", "No highlight"], ...choices], view.highlight)}</div>
    <div class="style-preview" id="style-preview" aria-label="Figure preview"></div>`,
    () => {
      snapshotViews();
      Object.assign(view, read());
      render();
    },
    "Apply style",
  );
  function preview() {
    const draft = read();
    const scheme = paletteFor(draft.style, draft.palette);
    get("palette-key").innerHTML =
      scheme.series
        .map((c) => `<i aria-hidden="true" style="background:${c}"></i>`)
        .join("") +
      "<small>" +
      esc(scheme.label) +
      "</small>";
    for (const host of get("modalform").querySelectorAll("[data-sample]"))
      host.replaceChildren(styleSample(host.dataset.sample, draft.palette));
    get("highlight-control").hidden =
      draft.style !== "policy" || !choices.length;
    get("style-preview").replaceChildren(
      figure(analysis, { ...view, ...draft }),
    );
  }
  get("modalform").onchange = preview;
  preview();
}
function tidy(v, key) {
  if (["task", "x", "y", "z", "outcome"].includes(key)) delete v.highlight;
  const d = getData(),
    fs =
      d.fields?.filter((f) => f.type !== "metadata" && f.levels.length) || [];
  if (
    key === "task" &&
    d.kind === "table" &&
    ["group", "two"].includes(v.task) &&
    isOpenQuestion(fs.find((f) => f.id === v.x))
  ) {
    v.x = fs.find((f) => !isOpenQuestion(f))?.id;
  }
  if (key === "task" && v.task === "themes") {
    Object.assign(v, {
      x: "",
      y: "",
      chart: "bars",
      measure: "sources",
      title: "",
      annotation: "",
    });
    return;
  }
  if (key === "task" && v.task === "patterns") {
    const choices = patternChoices(d).map(([id]) => id);
    v.items = Array.isArray(v.items)
      ? v.items.filter((id) => choices.includes(id))
      : [...new Set([v.x, v.y].filter((id) => choices.includes(id)))];
    if (!v.items.length && choices.length) v.items = [choices[0]];
    v.patternMode ||= patternModes(d.kind === "text", !!d.openAnswers)[0][0];
    v.chart = available(d, v)[0];
    return;
  }
  if (key === "task") {
    if (v.task === "model") {
      v.chart = "model";
      v.outcome =
        fs.find((f) => f.type === "number")?.id ||
        fs.find(
          (f) =>
            ["ordered", "category"].includes(f.type) && f.levels.length === 2,
        )?.id;
      v.predictors = [];
    } else {
      v.chart =
        v.task === "group" && d.kind === "text"
          ? "presence"
          : v.task === "two" && d.kind === "table"
            ? "grid"
            : "bars";
      if (v.task === "two" && d.kind === "text" && !v.x) v.x = allCodes(d)[0];
      v.y =
        v.task === "one"
          ? ""
          : d.kind === "text"
            ? allCodes(d).find((c) => c !== v.x) || ""
            : (
                fs.find(
                  (f) =>
                    f.id !== v.x &&
                    f.levels.length > 1 &&
                    ["category", "ordered"].includes(f.type),
                ) || fs.find((f) => f.id !== v.x && !isOpenQuestion(f))
              )?.id;
    }
  }
  if (key === "outcome" || key === "task") {
    v.positive = fs.find((f) => f.id === v.outcome)?.levels[0] || "";
    v.predictors = (v.predictors || []).filter((k) => k !== v.outcome);
  }
  if (key === "filter")
    v.value =
      (d.kind === "table"
        ? optionLevels(fs.find((f) => f.id === v.filter))[0]
        : v.filter === "source"
          ? d.sources[0]
          : Object.values(d.metadata || {}).find((m) => m[v.filter])?.[
              v.filter
            ]) || "";
  if (key === "x" && v.x === v.y)
    v.y =
      d.kind === "text"
        ? allCodes(d).find((c) => c !== v.x)
        : (
            fs.find(
              (f) =>
                f.id !== v.x &&
                f.levels.length > 1 &&
                ["category", "ordered"].includes(f.type),
            ) || fs.find((f) => f.id !== v.x && !isOpenQuestion(f))
          )?.id;
}
function goto(i) {
  const d = getData();
  if (i > 0 && !d) return;
  if (i > 1 && !analysisReady(d) && !(isInterview(d) && i === 4)) i = 1;
  if (i === 2 || i === 3) project.figurePanels = i === 3 ? "both" : "left";
  if (i === 3 && !project.comparisonStarted) {
    const right = structuredClone(project.views[0]);
    right.chart =
      { bars: "dots", dots: "bars", small: "bars", grid: "table" }[
        right.chart
      ] || right.chart;
    project.views[1] = right;
    project.comparisonStarted = true;
  }
  if (i === 3 && project.linked) {
    const { filter, value } = project.views[0];
    Object.assign(project.views[1], { filter, value });
  }
  if (step !== i) {
    pendingSelections.clear();
    selectionConfirmed = false;
    focusBot(i === 3 ? "both" : "left");
    proposal = null;
    captionDraft = null;
    queuedShortcut = null;
  }
  step = i;
  render();
  window.scrollTo(0, 0);
}
function setProject(p) {
  pendingSelections.clear();
  selectionConfirmed = false;
  project = verifyProject(p);
  project.mode = readHelpMode();
  project.comparisonStarted ??=
    project.figurePanels === "both" ||
    (project.views.length === 2 &&
      JSON.stringify(project.views[0]) !== JSON.stringify(project.views[1]));
  undoViews = [];
  if (!getData() && project.datasets.length) activate(project.datasets[0].id);
  if (getData() && project.views.length !== 2) activate(project.active);
  resetTutor();
  goto(
    getData()
      ? project.confirmed.includes(project.active)
        ? project.figurePanels === "both"
          ? 3
          : 2
        : 1
      : 0,
  );
}
async function openProjectFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw Error(
      "Choose a downloaded Data visualiser project (.json). For a survey or transcript, use an upload option.",
    );
  }
  const saved = verifyProject(data);
  const restored = saved.settingsOnly
    ? reattach(saved, project.datasets)
    : saved;
  if (
    !saved.settingsOnly &&
    project.datasets.length &&
    !(await askForm(
      "Switch projects?",
      "<p>Opening this file will replace the current workspace. Save any changes you want to keep first.</p>",
      () => true,
      "Open saved project",
    ))
  )
    return;
  setProject(restored);
  notice("Opened " + restored.name + ".");
}
function chooseFiles(accept, multiple, handler) {
  const p = get("picker");
  p.value = "";
  p.accept = accept;
  p.multiple = multiple;
  p.onchange = async () => {
    try {
      if (p.files.length) await handler([...p.files]);
    } catch (e) {
      notice(e.message);
    }
  };
  p.click();
}
function snapshotViews() {
  undoViews.push(structuredClone(project.views));
  if (undoViews.length > 25) undoViews.shift();
}
function openBot(question = "") {
  bot = true;
  if (question) lastQuestion = question;
  render();
  (get("course") || get("question"))?.focus({ preventScroll: true });
}
function selectedPassages() {
  const d = getData();
  if (d?.kind !== "text") return [];
  return d.passages.filter((p) => chosen.has(p.id) || scope.includes(p.source));
}
function botContext(question = "") {
  const d = getData();
  if (!d)
    return { step: "Upload", projectFocus: project.researchFocus || undefined };
  const basic = {
    projectFocus: project.researchFocus || undefined,
    confirmedQuestionRoles: confirmedRoles(d),
    proposedExplanation: d.explanation || undefined,
    pastProjectWork: previousWork(tutorRecord(project), question),
    stage: step === 1 && isInterview(d) ? "Code interviews" : steps[step],
    dataset: d.name,
    datasetKind: d.openAnswers
      ? "coded written survey answers"
      : d.kind === "text"
        ? "coded interviews or documents"
        : "survey or table",
    unit: d.unit,
  };
  if (step <= 1)
    return {
      ...basic,
      fields: d.fields?.map((f) => ({ name: f.label, type: f.type })),
      sourceCount: d.sources?.length,
      ...(isInterview(d)
        ? {
            openInterview: interviews(d).source,
            checkedInterviews: interviews(d).done.length,
            approvedLabels: approvedBook(d).map((entry) => entry.label),
            hasCodebookDraft: !!d.coding?.bookDraft,
            hasCodingDraft: !!interviews(d).draft,
          }
        : {}),
    };
  const indices =
    step === 2
      ? [0]
      : step === 3 && botFocus !== "both"
        ? [focusIndex()]
        : [0, 1];
  const views = indices.map((i) => {
    try {
      const a = summary(i);
      return {
        ...a,
        panel: i ? "right" : "left",
        selectedQuestions: viewName(d, project.views[i]),
        filter: project.views[i].filter
          ? {
              field:
                d.fields?.find((f) => f.id === project.views[i].filter)
                  ?.label || project.views[i].filter,
              value: project.views[i].value,
            }
          : null,
        availableCharts: available(d, project.views[i]),
        chartListScope:
          "These options apply to restyling the current selection. For a new comparison, use the project chart options and choose the requested questions.",
        categoricalPattern:
          project.views[i].task !== "patterns" &&
          d.kind === "table" &&
          ["ordered", "category", "multiple"].includes(
            d.fields.find((f) => f.id === project.views[i].x)?.type,
          )
            ? categoricalPattern(a.records || [])
            : undefined,
        calculatedForSelection:
          project.views[i].task === "patterns"
            ? undefined
            : analyticalEvidence(d, project.views[i], question),
        pairedStatistics:
          a.points?.length && !a.date ? pairedStatistics(a.points) : undefined,
        excerpt: undefined,
        points: a.points?.slice(0, 40),
        pointsTotal: a.points?.length,
        records: a.records?.slice(0, 120),
        recordsTotal: a.records?.length,
        settings: project.views[i],
      };
    } catch (e) {
      return { panel: i ? "right" : "left", message: e.message };
    }
  });
  return {
    ...basic,
    focus: step === 3 ? botFocus : step === 2 ? "left" : "both",
    pendingChart: proposal?.view,
    views,
    fields: d.fields ? chartFields(d.fields, question) : undefined,
    surveyChartOptions:
      d.kind === "table"
        ? {
            categoricalComparison: [
              "grid",
              "bars",
              "dots",
              "stack",
              "small",
              "table",
            ],
            numericPair: ["scatter", "line"],
            singleNumber: ["hist"],
            note: "availableCharts in each view lists only that view’s current options. You may change the task and questions to draw another supported chart.",
          }
        : undefined,
    ...(d.kind === "text"
      ? {
          presenceGrid: {
            task: "group",
            chart: "presence",
            x: "",
            y: "",
            measure: "passages",
          },
        }
      : {}),
    patternOptions:
      (d.kind === "text" ? allCodes(d).length : d.fields.length) > 0
        ? {
            modes: patternModes(d.kind === "text", !!d.openAnswers),
            groupingFields: groupChoices(d),
            selectable: patternChoices(d).map(([id]) => id),
            maximum: selectionLimit,
          }
        : undefined,
    codebook: d.kind === "text" ? allCodes(d) : undefined,
    passages: selectedPassages().map((p) => ({
      id: p.id,
      source: p.source,
      text: p.text,
      codes: p.codes,
    })),
  };
}
function proposedChart(pick) {
  const d = getData(),
    text = d.kind === "text",
    keys = text
      ? allCodes(d)
      : d.fields.filter((f) => f.type !== "metadata").map((f) => f.id);
  const panel =
      step === 3 &&
      (botFocus === "both" ? pick.panel !== "left" : botFocus === "right")
        ? 1
        : 0,
    current = project.views[panel];
  const candidate = (view) => ({
    view,
    panel,
    step,
    dataset: d.id,
    baseline: JSON.stringify(current),
  });
  if (pick.action === "restyleChart") {
    if (
      !available(d, current).includes(pick.chart) ||
      pick.chart === current.chart
    )
      return null;
    const view = { ...current, chart: pick.chart };
    summary(panel, view);
    return candidate(view);
  }
  if (pick.task === "patterns") {
    const modes = patternModes(text, !!d.openAnswers),
      choices = new Map(patternChoices(d));
    const supplied =
      pick.items ?? (current.task === "patterns" ? current.items : undefined);
    if (!Array.isArray(supplied)) return null;
    const items = [
      ...new Set(supplied.map((id) => (text ? id : resolveAxis(d.fields, id)))),
    ];
    if (
      !items.length ||
      items.length > selectionLimit ||
      items.some((id) => !choices.has(id))
    )
      return null;
    const patternMode =
      pick.patternMode ||
      (current.task === "patterns" && current.patternMode) ||
      modes[0][0];
    if (!modes.some(([key]) => key === patternMode)) return null;
    const groups = groupChoices(d, items);
    const groupKey =
      pick.groupBy ?? (current.task === "patterns" ? current.groupBy : "");
    let groupBy = "";
    if (groupKey) {
      const exact = groups.filter(
        ([id, label]) =>
          id === groupKey ||
          label.toLowerCase() === String(groupKey).toLowerCase(),
      );
      if (exact.length !== 1) return null;
      groupBy = exact[0][0];
    }
    const themeUnit = pick.themeUnit ?? current.themeUnit ?? "interviews";
    if (!["interviews", "passages"].includes(themeUnit)) return null;
    const view = {
      ...current,
      groupBy,
      themeUnit,
      task: "patterns",
      items,
      patternMode,
      title: "",
      annotation: "",
    };
    view.chart = pick.chart || available(d, view)[0];
    if (!available(d, view).includes(view.chart)) return null;
    return candidate(view);
  }
  if (!text && pick.task === "model" && pick.chart === "model") {
    if (!Array.isArray(pick.predictors) || !pick.predictors.length) return null;
    const outcome = resolveAxis(d.fields, pick.outcome);
    const predictors = [
      ...new Set(pick.predictors.map((k) => resolveAxis(d.fields, k))),
    ];
    const target = d.fields.find((f) => f.id === outcome);
    if (
      !keys.includes(outcome) ||
      predictors.includes(outcome) ||
      predictors.some((k) => !keys.includes(k)) ||
      !(
        target.type === "number" ||
        (["category", "ordered"].includes(target.type) &&
          target.levels.length === 2 &&
          target.levels.includes(pick.positive))
      )
    )
      return null;
    const view = {
      ...newView(d),
      task: "model",
      chart: "model",
      outcome,
      predictors,
      positive: pick.positive || "",
      interaction: pick.interaction === true,
      filter: current.filter,
      value: current.value,
      palette: current.palette,
      style: styleFor(current.style),
    };
    summary(panel, view);
    return candidate(view);
  }
  if (
    text &&
    pick.task === "group" &&
    ["presence", "grid", "table"].includes(pick.chart)
  ) {
    // These views always use the full code × source matrix. Both axes are implicit.
    pick = { ...pick, x: "", y: "", measure: "passages" };
  }
  if (!text)
    pick = {
      ...pick,
      x: resolveAxis(d.fields, pick.x),
      y: resolveAxis(d.fields, pick.y),
    };
  if (!["one", "group", "two"].includes(pick.task)) return null;
  if (
    !keys.includes(pick.x) &&
    !(text && (pick.task === "group" || pick.chart === "excerpts") && !pick.x)
  )
    return null;
  if (pick.task === "one" && pick.y) return null;
  const paired = pick.task !== "one" && !(text && pick.task === "group");
  if (paired && (!keys.includes(pick.y) || pick.y === pick.x)) return null;
  const measure = pick.measure || (text ? "passages" : "count");
  if (
    !(text ? ["passages", "sources"] : ["count", "percent"]).includes(measure)
  )
    return null;
  const view = {
    ...newView(d),
    x: pick.x || "",
    y: paired ? pick.y : "",
    task: pick.task,
    chart: pick.chart,
    measure,
    filter: current.filter,
    value: current.value,
    palette: current.palette,
    style: styleFor(current.style),
  };
  if (!available(d, view).includes(view.chart)) return null;
  return candidate(view);
}
function applyProposal(explanation) {
  const candidate = proposal;
  proposal = null;
  if (
    !candidate ||
    project.active !== candidate.dataset ||
    candidate.step !== step ||
    JSON.stringify(project.views[candidate.panel]) !== candidate.baseline
  )
    throw Error("The view has changed. Ask for a fresh chart suggestion.");
  const chart = summary(candidate.panel, candidate.view);
  if (
    candidate.groupSuggestion?.some(
      (evidence) =>
        !chart.records.some(
          (row) =>
            row.group === evidence.group &&
            row.groupValue === evidence.groupValue &&
            row.n === evidence.n &&
            row.den === evidence.den,
        ),
    )
  ) {
    render();
    throw Error(
      "The data behind that comparison changed. Ask for a fresh group suggestion.",
    );
  }
  snapshotViews();
  pendingSelections.delete(candidate.panel);
  project.views[candidate.panel] = candidate.view;
  tutorRecord(project).activity.push(
    "Created " +
      kinds[candidate.view.chart].toLowerCase() +
      " · " +
      chart.title +
      (candidate.view.filter ? " (filtered view)" : "") +
      ". " +
      chart.note,
  );
  const contrast = chart.largestDisplayedDifference;
  const groupInsight =
    contrast?.percentagePoints > 0
      ? " For “" +
        contrast.pattern +
        "”, " +
        contrast.high.n +
        " of " +
        contrast.high.den +
        " in " +
        contrast.high.group +
        " compared with " +
        contrast.low.n +
        " of " +
        contrast.low.den +
        " in " +
        contrast.low.group +
        " (" +
        Number(contrast.percentagePoints.toFixed(1)) +
        " percentage points apart in this sample)."
      : contrast
        ? " The displayed shares are the same across groups with usable data."
        : "";
  history.push({
    role: "assistant",
    content:
      "Created " +
      kinds[candidate.view.chart].toLowerCase() +
      " · " +
      chart.title +
      ". " +
      chart.note +
      (candidate.groupSuggestion ? "" : groupInsight) +
      (typeof explanation === "string" ? " " + explanation : ""),
  });
  render();
  get("graphic" + candidate.panel)?.scrollIntoView({ block: "nearest" });
}
async function unlockBot(code) {
  if (!botURL)
    throw Error("The workshop tutor service has not been connected.");
  const res = await fetch(botURL + "/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const json = await res.json();
  if (!res.ok) throw Error(json.error || "Could not unlock the tutor.");
  if (typeof json.token !== "string" || !json.token.trim())
    throw Error(
      "The workshop service did not return a session. Try unlocking again.",
    );
  sessionStorage.setItem("dv-session", json.token);
}

async function requestTutor(payload) {
  if (payload.skill === "coding")
    payload = { ...payload, context: codingRequestContext(payload.context) };
  const res = await fetch(botURL + "/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + botSession(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) sessionStorage.removeItem("dv-session");
    throw Error(data.error || "Tutor unavailable.");
  }
  return data.answer;
}
async function extractCodebook(document, code) {
  return withBotActivity("Extracting labels from your codebook…", async () => {
    if (!botSession()) {
      if (!code.trim())
        throw Error("Enter your workshop course code to extract labels.");
      await unlockBot(code.trim());
    }
    const answer = await requestTutor({
      skill: "codebook",
      question: "Extract the code labels and their meanings for review.",
      context: { document },
    });
    return structuredAnswer(answer).entries;
  });
}
async function checkGroupSuggestion() {
  proposal = captionDraft = null;
  if (step === 3 && botFocus === "both") {
    history.push({
      role: "assistant",
      content:
        "Choose Left view or Right view under Use for this request, then ask me to suggest a group for that selection.",
    });
    return;
  }
  const d = getData(),
    view = project.views[focusIndex()],
    startView = JSON.stringify(view);
  const stage = step,
    target = botFocus,
    chat = history;
  render();
  const worker = new Worker(
    new URL("./group-search-worker.js", import.meta.url),
    { type: "module" },
  );
  try {
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) =>
        data.error ? reject(new Error(data.error)) : resolve(data);
      worker.onerror = () =>
        reject(
          new Error(
            "I couldn’t check group comparisons. Try a smaller selection.",
          ),
        );
      const dataset =
        d.kind === "text"
          ? {
              kind: d.kind,
              sources: d.sources,
              metadata: d.metadata,
              passages: d.passages.map(({ source, codes, reviewed }) => ({
                source,
                codes,
                reviewed,
              })),
            }
          : {
              kind: d.kind,
              unit: d.unit,
              fields: d.fields,
              rows: d.rows,
              rules: d.rules,
            };
      worker.postMessage({ dataset, view });
    });
    if (getData() !== d || chat !== history) return;
    if (
      step !== stage ||
      botFocus !== target ||
      JSON.stringify(project.views[focusIndex()]) !== startView
    ) {
      history.push({
        role: "assistant",
        content:
          "Your selection changed. Ask again to check the groups for the current view.",
      });
      return;
    }
    if (result.spec) {
      const candidate = proposedChart(result.spec);
      if (!candidate)
        throw Error(
          "The suggested grouping is no longer available. Ask again using the current selection.",
        );
      proposal = { ...candidate, groupSuggestion: result.evidence };
    }
    history.push({ role: "assistant", content: result.message });
  } finally {
    worker.terminate();
  }
}
function finishCodingBatch(question) {
  const current = new Set(selectedPassages().map((p) => p.id));
  if (suggestions.some((s) => !current.has(s.id)))
    throw Error("The passage selection changed. Ask for fresh suggestions.");
  const applied = applyCodingBatch(getData(), suggestions);
  const message = `Applied ${applied.assignments} label assignment${applied.assignments === 1 ? "" : "s"} across ${applied.passages} passage${applied.passages === 1 ? "" : "s"}: ${applied.labels.join(", ")}.`;
  suggestions = [];
  if (question) history.push({ role: "user", content: question });
  history.push({ role: "assistant", content: message });
  tutorRecord(project).activity.push(message);
  lastQuestion = "";
  render();
}

async function prepareChatCoding(question) {
  if (requesting) throw Error("Wait for the current bot reply first.");
  if (!getData().passages.length) {
    history.push(
      { role: "user", content: question },
      {
        role: "assistant",
        content:
          "This dataset has no passages to code. Open a transcript or a set of written answers first.",
      },
    );
    lastQuestion = "";
    render();
    return;
  }
  const selected = selectedPassages();
  if (!selected.length || selected.length > 10) {
    evidence(focusIndex(), undefined, question);
    return;
  }
  await ask(question, "coding");
}
async function ask(question, skill, intent = "") {
  if (requesting) throw Error("A tutor request is already pending.");
  if (!botURL)
    throw Error("The workshop tutor service has not been connected.");
  if (!botSession()) {
    openBot(question);
    if (skill === "coding") {
      queuedShortcut = {
        prompt: question,
        skill,
        step,
        dataset: project.active,
        baseline: JSON.stringify(project.views),
        focus: botFocus,
        selection: JSON.stringify([[...chosen], scope]),
      };
      return;
    }
    throw Error("Enter the workshop course code first.");
  }
  if (skill === "recommend" && step === 3 && !intent) {
    const left =
      /\bleft(?:-hand)? (?:view|chart|figure|panel)\b|\bon the left\b/i.test(
        question,
      );
    const right =
      /\bright(?:-hand)? (?:view|chart|figure|panel)\b|\bon the right\b/i.test(
        question,
      );
    if (
      (left && right) ||
      /\b(?:both|two) (?:views|charts|figures|panels)\b/i.test(question)
    )
      focusBot("both");
    else if (left || right) focusBot(left ? "left" : "right");
  }
  const dataset = getData();
  const current =
    project.views[step === 3 && botFocus === "both" ? 1 : focusIndex()];
  if (dataset && skill === "recommend" && !intent && [2, 3].includes(step)) {
    const requested = filterRequest(dataset, question);
    if (requested) {
      lastQuestion = "";
      proposal = captionDraft = null;
      history.push({ role: "user", content: question });
      let message = requested.message;
      if (!message) {
        const panels =
          step === 3 && (project.linked || botFocus === "both")
            ? [0, 1]
            : [focusIndex()];
        const changes = panels.map((i) => ({
          ...project.views[i],
          filter: requested.filter,
          value: requested.value,
        }));
        try {
          changes.forEach((v, index) => summary(panels[index], v));
          snapshotViews();
          changes.forEach((v, index) => {
            pendingSelections.delete(panels[index]);
            project.views[panels[index]] = v;
          });
          const target = panels.length > 1 ? "both views" : "this view";
          message = requested.filter
            ? "Filtered " +
              target +
              " to “" +
              requested.value +
              "” for “" +
              requested.name +
              "”."
            : "Cleared the view filter on " +
              target +
              ". Project exclusions still apply.";
          tutorRecord(project).activity.push(message);
        } catch (error) {
          message =
            "I couldn’t apply that filter to this visual. " + error.message;
        }
      }
      history.push({ role: "assistant", content: message });
      render();
      return;
    }
  }
  if (skill === "recommend" && project.researchFocus && [2, 3].includes(step)) {
    const wantsGroups = asksForGroupSuggestion(question);
    if (
      intent === "suggestGroups" ||
      (!intent &&
        wantsGroups &&
        !/stand out|largest|biggest|strongest/i.test(question))
    )
      intent = "researchGroups";
    else if (
      intent === "suggest" ||
      (!intent &&
        /(?:what (?:could|should|can) (?:we|I) (?:explore|compare|look at)|which (?:questions|themes|measures|comparisons) (?:should|could|would|can|fit|relate)|(?:suggest|recommend|choose).{0,75}(?:research question|project focus))/i.test(
          question,
        ))
    )
      intent = "research";
  }
  const research = intent === "research" || intent === "researchGroups";
  if (
    skill === "recommend" &&
    [2, 3].includes(step) &&
    (intent === "suggestGroups" ||
      (!intent && asksForGroupSuggestion(question)))
  ) {
    lastQuestion = "";
    requesting = true;
    history.push({ role: "user", content: question });
    try {
      await withBotActivity(
        "Checking possible groups in your selection…",
        checkGroupSuggestion,
      );
    } finally {
      requesting = false;
      render();
    }
    return;
  }
  let direct =
    [2, 3].includes(step) &&
    !intent &&
    skill === "recommend" &&
    dataset?.kind === "table" &&
    (namedSurveyComparison(dataset.fields, question) ||
      directComparison(dataset.fields, question));
  if (direct?.action === "clarifyAxes") {
    const axes = direct.axes;
    const controls = axes.map(({ phrase, choices, role }, i) => {
      const label = role || (i ? "Group respondents by" : "Compare answers to");
      const values =
        choices.length === 1
          ? choices
          : [["", "Choose a question"], ...choices];
      return formselect(
        "resolve-axis-" + i,
        label + " (“" + phrase + "”)",
        values,
      );
    });
    const selection = await askForm(
      "Which survey questions did you mean?",
      "<p>More than one question matches your wording.</p>" + controls.join(""),
      () => {
        const ids = axes.map((_, i) => val("resolve-axis-" + i));
        if (ids.some((id) => !id)) throw Error("Choose both questions.");
        const spec = namedSurveyComparison(dataset.fields, question, ids);
        if (spec?.action !== "draw" || !proposedChart(spec))
          throw Error(
            "Choose two different questions that support this comparison and its requested measure.",
          );
        return spec;
      },
      "Draw this comparison",
    );
    if (!selection) return;
    direct = selection;
  }
  if (direct) {
    const candidate = direct.action === "draw" && proposedChart(direct);
    if (direct.action === "answer" || candidate) {
      lastQuestion = "";
      proposal = candidate || null;
      history.push({ role: "user", content: question });
      if (candidate) applyProposal();
      else {
        history.push({ role: "assistant", content: direct.explanation });
        render();
      }
      return;
    }
  }
  const inPatterns = current?.task === "patterns";
  const grouping =
    skill === "recommend" &&
    !intent &&
    [2, 3].includes(step) &&
    dataset &&
    groupingRequest(
      question,
      groupChoices(dataset, inPatterns ? current.items : []),
      current,
      dataset.kind === "text",
    );
  if (grouping?.clarification) {
    lastQuestion = "";
    proposal = null;
    history.push(
      { role: "user", content: question },
      { role: "assistant", content: grouping.clarification },
    );
    render();
    return;
  }
  const selectedItems = inPatterns
    ? current.items
    : current?.task === "one" && current.x
      ? [current.x]
      : [];
  const reuse =
    grouping?.reuse && selectedItems?.length && !namedChartRequest(question);
  let pattern = reuse
    ? {
        items: selectedItems,
        patternMode: inPatterns
          ? current.patternMode
          : patternModes(dataset.kind === "text", !!dataset.openAnswers)[0][0],
      }
    : skill === "recommend" &&
      !intent &&
      [2, 3].includes(step) &&
      dataset &&
      patternRequest(
        grouping?.before || question,
        dataset.kind === "text",
        patternChoices(dataset),
        current,
      );
  if (grouping) pattern = { ...(pattern || {}), groupBy: grouping.groupBy };
  if (pattern?.items && pattern.items.length <= selectionLimit) {
    const chart =
      namedChartRequest(question) ||
      (dataset.kind === "text" &&
      pattern.patternMode === "sources" &&
      !(pattern.groupBy || current?.groupBy)
        ? "grid"
        : "bars");
    const spec = { action: "draw", task: "patterns", chart, ...pattern };
    const candidate = proposedChart(spec);
    if (candidate) {
      history.push({ role: "user", content: question });
      lastQuestion = "";
      proposal = candidate;
      applyProposal();
      return;
    }
  }
  const coding = skill === "coding";
  const batch = coding ? selectedPassages() : [];
  if (coding && (!batch.length || batch.length > 10))
    throw Error("Select one to ten passages first.");
  const context = coding
    ? {
        guide: codingGuide(dataset),
        priorDiscussion:
          acceptsCodingBatch(question) ||
          /\b(?:earlier|suggested|previous|discussed)\b/i.test(question)
            ? history
                .filter(
                  (m) =>
                    m.role === "assistant" &&
                    /\b(?:labels?|themes?|codes?|coding)\b/i.test(m.content),
                )
                .slice(-3)
                .map((m) => m.content.slice(0, 1600))
            : undefined,
        passages: batch.map(({ id, source, text, codes }) => ({
          id,
          source,
          text,
          codes,
        })),
      }
    : research
      ? researchCatalogue(
          dataset,
          current,
          project.researchFocus,
          question,
          intent === "researchGroups",
        )
      : botContext(question);
  if (
    intent === "researchGroups" &&
    (!context.selectionToKeep.length || !context.groupingFields.length)
  ) {
    const message = !context.selectionToKeep.length
      ? "Tick the questions or themes you want to split by group, then ask again."
      : dataset.kind === "text"
        ? "I need a recorded characteristic with at least two interview groups in this view. Use Add interview groups if you collected that information."
        : "This selection needs a separate survey column with at least two groups under the current filter.";
    proposal = null;
    lastQuestion = "";
    history.push(
      { role: "user", content: question },
      { role: "assistant", content: message },
    );
    render();
    return;
  }
  if (intent) context.requestedOutput = intent;
  if (pattern) context.requestedPattern = pattern;
  if (
    skill === "recommend" &&
    step === 3 &&
    botFocus === "both" &&
    intent === "compare"
  ) {
    const [l, r] = project.views;
    context.comparison = {
      sameQuestion:
        l.x === r.x &&
        l.y === r.y &&
        l.task === r.task &&
        l.outcome === r.outcome &&
        (l.task !== "patterns" ||
          (l.patternMode === r.patternMode &&
            l.groupBy === r.groupBy &&
            (l.themeUnit || "interviews") === (r.themeUnit || "interviews") &&
            JSON.stringify(l.items) === JSON.stringify(r.items))),
      sameFilter: l.filter === r.filter && l.value === r.value,
      sameUnit: context.views[0]?.unit === context.views[1]?.unit,
    };
  }
  if (skill === "recommend") {
    captionDraft = null;
  }
  if (JSON.stringify(context).length > 115000)
    throw Error("Choose fewer sources or passages for the bot.");
  if (coding) {
    suggestions = [];
    proposal = captionDraft = null;
  }
  const previous = history.slice(-4),
    activeProject = project,
    activeChat = history,
    activeId = project.active,
    startProjectFocus = project.researchFocus,
    startStep = step,
    startFocus = botFocus,
    startEvidence = JSON.stringify([[...chosen], scope]),
    startViews = JSON.stringify(project.views);
  lastQuestion = "";
  requesting = true;
  history.push({ role: "user", content: question });
  render();
  try {
    const activity =
      {
        compare: "Comparing your views…",
        caption: "Drafting a figure caption…",
        explain: "Reading your chart…",
        excerpts: "Reading the selected passages…",
      }[intent] ||
      (coding
        ? "Suggesting labels for your selection…"
        : research
          ? "Checking your research question and data…"
          : "Preparing a reply…");
    const answer = await withBotActivity(activity, () =>
      requestTutor({
        question,
        skill: research ? "research" : skill,
        mode: project.mode,
        context,
        history: coding || research ? [] : previous,
      }),
    );
    if (
      project !== activeProject ||
      history !== activeChat ||
      project.active !== activeId
    )
      return;
    if (
      skill === "recommend" &&
      (project.researchFocus !== startProjectFocus ||
        step !== startStep ||
        botFocus !== startFocus ||
        JSON.stringify([[...chosen], scope]) !== startEvidence ||
        JSON.stringify(project.views) !== startViews)
    ) {
      history.push({
        role: "assistant",
        content:
          "Your view or project focus changed while I was replying. Ask again with the current selection.",
      });
      return;
    }
    if (skill === "coding") {
      if (
        startEvidence !== JSON.stringify([[...chosen], scope]) ||
        JSON.stringify(context.guide) !== JSON.stringify(codingGuide(dataset))
      ) {
        suggestions = [];
        notice(
          "Your coding guide changed. Request suggestions with the updated labels.",
        );
        return;
      }
      suggestions = checkedSuggestions(
        structuredAnswer(answer).suggestions,
        context.passages,
        context.guide,
      ).map((s) => ({ ...s, source: batch.find((p) => p.id === s.id).source }));
      tutorRecord(project).activity.push(
        "Requested coding suggestions for " +
          context.passages.length +
          " selected passages.",
      );
      history.push({
        role: "assistant",
        content:
          suggestions.length +
          " suggestions for review. " +
          (context.passages.length -
            new Set(suggestions.map((s) => s.id)).size) +
          " selected passages have no new suggestion." +
          suggestions
            .map(
              (s) => "\n" + s.code + " — “" + s.quote + "” " + (s.reason || ""),
            )
            .join("") +
          (suggestions.length
            ? "\nReview the matches. Choose Apply all suggested labels or reply “apply them” to save them to these passages."
            : ""),
      });
    } else if (skill === "recommend") {
      let pick;
      try {
        const requestedAction =
          !!intent ||
          /\b(?:draw|create|make|plot|fit|build|show|compare|visualise|visualize|suggest|recommend)\b/i.test(
            question,
          );
        pick = structuredAnswer(answer, requestedAction);
      } catch {
        pick = {
          action: "answer",
          explanation: /[`]{3}(?:json)?\s*[{]|^\s*[{]/i.test(answer)
            ? "I couldn’t read a single usable instruction from that reply. Please try the request again."
            : answer,
        };
      }
      if (!pick || typeof pick !== "object")
        pick = {
          action: "answer",
          explanation:
            "I could not read the model response. Please try the question again.",
        };
      proposal = null;
      if (
        pick.action === "reviewCoding" &&
        dataset.kind === "text" &&
        !intent
      ) {
        history.push({
          role: "assistant",
          content:
            "Choose the passages to code. I’ll match suggested labels to quotations for you to review and apply.",
        });
        evidence(focusIndex(), undefined, question);
        return;
      }
      if (research) {
        let message;
        if (
          pick.action === "answer" &&
          typeof pick.explanation === "string" &&
          pick.explanation.trim()
        ) {
          message = researchExplanation(pick.explanation, context);
        } else {
          const spec = researchChart(pick, context);
          const candidate = spec && proposedChart(spec);
          if (candidate) {
            proposal = candidate;
            message =
              viewName(dataset, candidate.view) +
              "\n" +
              researchExplanation(pick.explanation, context);
            if (
              dataset.kind === "text" &&
              spec.groupBy &&
              spec.patternMode === "sources"
            )
              message +=
                "\nThe chart shows the share of interviews in each group carrying each theme. Repeated mentions in one interview count once.";
          } else {
            message =
              "I couldn’t match that suggestion to an available comparison. Which part of your research question would you like to explore first?";
          }
        }
        history.push({ role: "assistant", content: message });
        return;
      }
      if (
        (step === 2 || (step === 3 && botFocus !== "both")) &&
        pick.action === "caption" &&
        typeof pick.explanation === "string" &&
        pick.explanation.trim()
      ) {
        const panel = focusIndex();
        captionDraft = {
          text: pick.explanation.trim(),
          dataset: project.active,
          step,
          panel,
          baseline: JSON.stringify(project.views[panel]),
        };
        history.push({ role: "assistant", content: captionDraft.text });
        return;
      }
      if (pick.action === "suggestGroups" && !intent && [2, 3].includes(step)) {
        await withBotActivity(
          "Checking possible groups in your selection…",
          checkGroupSuggestion,
        );
        return;
      }
      if (intent === "suggest" && pick.action === "draw")
        pick.action = "suggest";
      if (intent === "variant")
        pick.action = pick.chart ? "restyleChart" : "answer";
      if (["explain", "compare", "caption", "excerpts"].includes(intent))
        pick.action = "answer";
      if (
        pick.action === "restyleChart" ||
        pick.action === "draw" ||
        pick.action === "suggest" ||
        (!pick.action && pick.chart)
      ) {
        if (grouping && (pick.action === "draw" || pick.action === "suggest")) {
          pick = { ...pick, task: "patterns", groupBy: grouping.groupBy };
          if (pick.chart === "grid" && !namedChartRequest(question))
            pick.chart = "bars";
        }
        const requestedChart = namedChartRequest(question);
        if (requestedChart) {
          pick = { ...pick, chart: requestedChart };
          if (dataset?.kind === "text" && requestedChart === "presence")
            pick.task = "group";
        }
        let candidate;
        try {
          candidate = proposedChart(pick);
        } catch (error) {
          history.push({ role: "assistant", content: error.message });
          return;
        }
        if (!candidate && pick.action === "restyleChart") {
          const index =
            step === 3 && botFocus === "both"
              ? pick.panel === "left"
                ? 0
                : 1
              : focusIndex();
          const options = available(dataset, project.views[index]).filter(
            (k) => k !== project.views[index].chart,
          );
          history.push({
            role: "assistant",
            content: options.length
              ? "That chart would not give a different, valid view of this selection. You can show it as: " +
                options.map((k) => kinds[k]).join(", ") +
                "."
              : "This selection has only one available chart.",
          });
        } else if (!candidate && requestedChart) {
          history.push({
            role: "assistant",
            content:
              "I couldn’t draw the requested " +
              kinds[requestedChart].toLowerCase() +
              " with the selected questions. Which question or code belongs on each axis?",
          });
        } else if (!candidate) {
          const fields = dataset?.fields || [];
          const matched = [
            ...new Set(
              [pick.x, pick.y]
                .filter(Boolean)
                .map(
                  (axis) =>
                    fields.find((f) => f.id === resolveAxis(fields, axis))
                      ?.label,
                )
                .filter(Boolean),
            ),
          ];
          history.push({
            role: "assistant",
            content:
              matched.length > 1
                ? "I found “" +
                  matched.join("” and “") +
                  "”. The suggested chart does not support this combination. Would you like to try a different chart type?"
                : matched.length
                  ? "I found “" +
                    matched[0] +
                    "”. Which other question should I compare it with? You can give a few words from its wording or its answer choices."
                  : "Which question did you mean? A few words from its wording, answer choices or interview code will help me find it.",
          });
        } else {
          proposal = candidate;
          if (["draw", "restyleChart"].includes(pick.action))
            applyProposal(pick.explanation);
          else
            history.push({
              role: "assistant",
              content: String(
                pick.explanation || "This view is ready to draw.",
              ),
            });
        }
      } else {
        if (pick.action === "answer")
          tutorRecord(project).activity.push(
            "Discussed " +
              (context.views
                ?.map((v) => v.title)
                .filter(Boolean)
                .join(" and ") || steps[step]) +
              " with the Data bot.",
          );
        history.push({
          role: "assistant",
          content: String(
            pick.explanation || "Which question would you like to explore?",
          ),
        });
      }
    } else {
      tutorRecord(project).activity.push(
        "Asked the Data bot about " + steps[step].toLowerCase() + ".",
      );
      history.push({ role: "assistant", content: answer });
    }
  } finally {
    requesting = false;
    render();
  }
}
function download(p, name) {
  blobSave(new Blob([JSON.stringify(p)], { type: "application/json" }), name);
}

async function reviewAction(act, d, el) {
  const fields = d.fields || [],
    fl = fields.map((f) => [f.id, f.label]);
  if (act === "combinetables") {
    const other = project.datasets.filter(
      (t) => t.kind === "table" && t.id !== d.id,
    );
    if (!other.length)
      throw Error(
        "Import the second table first. Both files will appear in Current dataset.",
      );
    const id = await askForm(
      "Choose a table",
      formselect(
        "second",
        "Related table",
        other.map((t) => [t.id, t.name]),
      ),
      () => val("second"),
    );
    if (!id) return;
    const t = other.find((t) => t.id === id);
    const config = await askForm(
      "Combine records or columns",
      formselect("combineHow", "Method", [
        ["append", "Append records with the same columns"],
        ["join", "Add columns using a shared identifier"],
      ]) +
        formselect("key1", "Identifier in current table (for a join)", fl) +
        formselect(
          "key2",
          "Identifier in related table (for a join)",
          t.fields.map((f) => [f.id, f.label]),
        ),
      () => combineTables(d, t, val("combineHow"), val("key1"), val("key2")),
      "Preview",
    );
    if (!config) return;
    modal(
      "Review combined table",
      "<p>" +
        config.rows.length +
        " records. " +
        (config.matchCount != null
          ? config.matchCount +
            " matched; unmatched records keep blank values for the new fields."
          : "Both original tables will remain available.") +
        "</p>" +
        table(
          config.fields.map((f) => f.label),
          config.rows.slice(0, 8).map((r) => config.fields.map((f) => r[f.id])),
        ),
      () => {
        project.datasets.push(config);
        activate(config.id);
        goto(1);
      },
      "Keep combined table",
    );
    return;
  }
  if (act === "field") {
    const f = fields.find((x) => x.id === el.dataset.field);
    modal(
      "Review field",
      `<label>Question or chart label<input id="flabel" value="${esc(f.label)}" required></label>${formselect("ftype", "Data type", ["category", "ordered", "number", "multiple", "date", "text", "metadata"], f.type)}<label>Ordered categories (one per line)<textarea id="levels">${esc(f.levels.join("\n"))}</textarea></label><label>Multiple-answer separator<input id="fsep" value="${esc(f.separator || ";")}"></label>`,
      () => {
        const list = val("levels")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (
          val("ftype") === "ordered" &&
          f.levels.some((l) => !list.includes(l))
        )
          throw Error("Keep observed categories in the ordered list.");
        if (isOpenQuestion(f) && val("ftype") !== "text") {
          f.roles = f.roles.filter((r) => r !== "open");
          delete f.typeBeforeOpen;
        }
        Object.assign(f, {
          label: val("flabel"),
          type: val("ftype"),
          levels: list,
          separator: val("fsep"),
        });
        render();
      },
    );
    return;
  }
  if (act === "unit") {
    modal(
      "What does one row represent?",
      `<label>Unit<input id="unit" required value="${esc(d.unit)}"></label>`,
      () => {
        d.unit = val("unit");
        render();
      },
    );
    return;
  }
  if (act === "exclude") {
    modal(
      "Exclude matching records",
      formselect("excludeField", "Field", fl) +
        `<label>Value or selected option<input id="excludeValue"></label>`,
      () => {
        const rule = { field: val("excludeField"), value: val("excludeValue") };
        const field = fields.find((f) => f.id === rule.field);
        if (field?.type === "multiple") rule.mode = "option";
        if (!d.rows.some((r) => matchesValue(r, field, rule.value)))
          throw Error("No records have that value.");
        d.rules.push(rule);
        render();
      },
    );
    return;
  }
  if (act === "delrule") {
    d.rules.splice(+el.dataset.i, 1);
    render();
    return;
  }
  if (act === "sources") {
    modal(
      "Confirm the full source list",
      `<p>Include sources with no coded passages.</p><label>One source per line<textarea id="sourceList">${esc(d.sources.join("\n"))}</textarea></label>`,
      () => {
        const list = val("sourceList")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (d.passages.some((p) => !list.includes(p.source)))
          throw Error("Keep each source that has imported text.");
        d.sources = [...new Set(list)];
        render();
      },
    );
    return;
  }
  if (act === "renamecode") {
    modal(
      "Rename or merge an existing code",
      formselect("oldcode", "Existing code", allCodes(d)) +
        `<label>New or existing label<input id="newcode" required></label>`,
      () => {
        const old = val("oldcode"),
          name = val("newcode").trim();
        if (!name) throw Error("Enter a label.");
        renameTheme(project, d, old, name, undoViews);
        suggestions = [];
        proposal = captionDraft = queuedShortcut = null;
        render();
      },
    );
    return;
  }
  if (act === "tocorpus") {
    modal(
      "Use written survey answers",
      formselect("textcol", "Written answer", fl) +
        formselect("idcol", "Identify respondents with", [
          ["", "Original row number"],
          ...fl,
        ]),
      () => {
        const key = val("textcol"),
          id = val("idcol");
        const c = writtenAnswerSet(project, d, key, id, false);
        activate(c.id);
        goto(1);
      },
    );
    return;
  }
  if (act === "multi") {
    modal(
      "Combine select-all-that-apply columns",
      '<label>Question label<input id="multiTitle" required></label><p>Choose the columns for this question and check which values mark a selected answer. A completely blank set of columns counts as skipped. A recorded answer with no selected options counts towards the total who answered.</p>' +
        indicatorColumns(fields, "mf"),
      () => {
        const markers = readIndicators(fields, "mf");
        combineCheckboxes(d, "m" + uid(), val("multiTitle"), markers);
        render();
      },
    );
    bindIndicatorColumns(d, "mf");
    return;
  }
  if (act === "link") {
    const tables = project.datasets.filter((x) => x.kind === "table");
    if (!tables.length)
      throw Error(
        "Upload the metadata table first, then return to this collection in Check.",
      );
    const tid = await askForm(
      "Choose related table",
      formselect(
        "lt",
        "Metadata table",
        tables.map((t) => [t.id, t.name]),
      ),
      () => val("lt"),
    );
    if (!tid) return;
    const t = tables.find((x) => x.id === tid);
    const key = await askForm(
      "Choose a unique identifier",
      formselect(
        "key",
        "Identifier column",
        t.fields.map((f) => [f.id, f.label]),
      ),
      () => val("key"),
    );
    if (!key) return;
    modal(
      "Review source matches",
      `<p>Leave a source unmatched to keep it available for separate exploration.</p>` +
        d.sources
          .map((s, i) =>
            formselect(
              "map" + i,
              s,
              [
                ["", "Unmatched"],
                ...[
                  ...new Set(
                    filteredRows(t)
                      .map((r) => r[key])
                      .filter(Boolean),
                  ),
                ],
              ],
              s,
            ),
          )
          .join(""),
      () => {
        const m = Object.fromEntries(
          d.sources.map((s, i) => [s, val("map" + i)]),
        );
        const joined = linkage(d, t, key, m);
        for (const [source, attributes] of Object.entries(joined))
          d.metadata[source] = { ...d.metadata[source], ...attributes };
        render();
        notice(Object.keys(joined).length + " sources linked.");
      },
    );
    return;
  }
}
function patternEvidence(i, index) {
  const d = getData(),
    v = project.views[i],
    cell = summary(i).records[index];
  if (!cell) return;
  if (d.kind === "table") {
    const fields = v.items.map((id) => d.fields.find((f) => f.id === id));
    const rows = filteredRows(d, v).filter((r) => {
      if (v.groupBy && groupValue(d, v.groupBy, r) !== cell.groupValue)
        return false;
      if (v.patternMode === "separate")
        return patternAnswers(
          r,
          fields.find((f) => f.id === cell.fieldId),
        ).includes(cell.label);
      return fields.every(
        (f, j) =>
          hasAnswer(r, f) &&
          JSON.stringify(patternAnswers(r, f)) ===
            JSON.stringify(cell.keyParts[j]),
      );
    });
    modal(
      "Responses behind this pattern",
      `<p>Showing ${Math.min(200, rows.length)} of ${rows.length} matching records.</p>` +
        table(
          fields.map((f) => f.label),
          rows
            .slice(0, 200)
            .map((r) => fields.map((f) => displayedAnswer(r, f))),
        ),
    );
    return;
  }
  if (v.patternMode === "sources" && !v.groupBy)
    return evidence(i, { source: cell.group, code: cell.label });
  const sources = d.sources.filter(
    (s) =>
      (!v.filter ||
        (v.filter === "source" ? s : d.metadata?.[s]?.[v.filter]) ===
          v.value) &&
      (!v.groupBy || groupValue(d, v.groupBy, s) === cell.groupValue),
  );
  const set = new Set(sources),
    passages = d.passages.filter((p) => set.has(p.source));
  const same = (codes) =>
    v.items.every((c) => codes.has(c) === cell.keyParts.includes(c));
  let included = passages,
    note = "";
  if (v.patternMode === "sources") {
    included = passages.filter((p) => p.codes.includes(cell.label));
    const interviews = new Set(included.map((p) => p.source));
    note =
      "<p>" +
      esc(cell.groupValue) +
      " · " +
      interviews.size +
      " of " +
      sources.length +
      (d.openAnswers
        ? " respondents mentioned this theme.</p>"
        : " interviews contained this theme.</p>");
  } else if (v.patternMode === "interviews") {
    const bySource = new Map(sources.map((s) => [s, new Set()]));
    for (const p of passages)
      for (const c of p.codes) bySource.get(p.source).add(c);
    const matches = sources.filter((s) => same(bySource.get(s)));
    const selected = new Set(matches);
    included = passages.filter(
      (p) =>
        selected.has(p.source) &&
        (!cell.keyParts.length ||
          p.codes.some((c) => cell.keyParts.includes(c))),
    );
    note =
      (d.openAnswers
        ? "<p>Matching respondents: "
        : "<p>Matching interviews: ") +
      esc(matches.join(", ")) +
      ".</p>";
  } else included = passages.filter((p) => same(new Set(p.codes)));
  modal(
    "Passages behind this pattern",
    note +
      `<p>Showing ${Math.min(200, included.length)} of ${included.length} matching passages.</p>` +
      table(
        [d.openAnswers ? "Respondent" : "Interview", "Passage", "Codes"],
        included
          .slice(0, 200)
          .map((p) => [p.source, p.text, p.codes.join(" · ")]),
      ),
  );
}
function evidence(i, match, codingPrompt = "") {
  const d = getData(),
    v = project.views[i],
    isText = d.kind === "text";
  if (v.task === "patterns" && !isText && !match) {
    const fields = [...(v.items || []), ...(v.groupBy ? [v.groupBy] : [])]
      .map((id) => d.fields.find((f) => f.id === id))
      .filter(Boolean);
    const rows = filteredRows(d, v);
    modal(
      "Answers from the same person",
      `<p>Each row is one record. Blank cells are missing answers. Showing ${Math.min(200, rows.length)} of ${rows.length} records.</p>` +
        table(
          fields.map((f) => f.label),
          rows
            .slice(0, 200)
            .map((r) => fields.map((f) => displayedAnswer(r, f))),
        ),
    );
    return;
  }
  if (!isText) {
    const x = d.fields.find((f) => f.id === v.x);
    const rows = filteredRows(d, v).filter(
      (r) =>
        !match ||
        (matchesValue(r, x, match.code) && (!v.y || r[v.y] === match.source)),
    );

    const fields = d.fields.filter((f) => f.type !== "metadata");
    modal(
      "Underlying responses",
      `<p>${rows.length} records in selection. Showing the first 200.</p>` +
        table(
          fields.map((f) => f.label),
          rows
            .slice(0, 200)
            .map((r) => fields.map((f) => displayedAnswer(r, f))),
        ),
    );
    return;
  }
  const owner = project;
  const ps = d.passages.filter(
    (p) =>
      (!codingPrompt ||
        !scope.length ||
        chosen.has(p.id) ||
        scope.includes(p.source)) &&
      (!v.filter ||
        (v.filter === "source"
          ? p.source
          : d.metadata?.[p.source]?.[v.filter]) === v.value) &&
      (!match || (p.source === match.source && p.codes.includes(match.code))) &&
      (!v.query || p.text.toLowerCase().includes(v.query.toLowerCase())),
  );
  let page = 0,
    query = "";
  const selected = new Set(
    codingPrompt ? ps.slice(0, 10).map((p) => p.id) : [],
  );
  function list() {
    const filtered = ps.filter(
      (p) => !query || p.text.toLowerCase().includes(query),
    );
    return (
      `<p>${filtered.length} matching passages</p>` +
      filtered
        .slice(page * 25, (page + 1) * 25)
        .map(
          (p) =>
            `<div class="excerpt"><label class="tick"><input name="pickp" type="checkbox" value="${p.id}" ${selected.has(p.id) ? "checked" : ""}>${esc(p.source)}</label><span data-passage-text="${p.id}">${esc(p.text)}</span><br><small>${esc(p.codes.join(" · "))}</small></div>`,
        )
        .join("") +
      `<div class="bar"><button type="button" id="prevp" ${page ? "" : "disabled"}>Previous</button><button type="button" id="nextp" ${(page + 1) * 25 < filtered.length ? "" : "disabled"}>Next</button></div>`
    );
  }
  modal(
    codingPrompt
      ? "Choose passages for labelling"
      : d.openAnswers
        ? "Read and code written answers"
        : "Read and code passages",
    (codingPrompt
      ? `<p>The first ${selected.size} of ${ps.length} matching passages are selected. Choose up to ten to share with the bot for label suggestions.</p>`
      : "") +
      (d.openAnswers
        ? `<p>${d.openAnswers.answered} of ${d.openAnswers.eligible} included respondents answered. Select an answer, give the idea a short label, or ask the bot to suggest labels for your selection.</p>`
        : `<div id="apply-book-collection" hidden><button type="button" class="primary" id="apply-book-interviews">Apply codebook to ${d.sources.length === 1 ? "interview" : "interviews"}</button><small>Choose the transcripts you want the bot to code.</small></div>`) +
      `<label>Find a passage<input id="searchPass"></label><div id="passlist">${list()}</div><div class="bar"><button type="button" id="shortpass">Use highlighted words as a passage</button><button type="button" id="discusspass" data-i="${i}">Discuss selected passages</button>${isInterview(d) && !codingPrompt ? '<button type="button" id="iv-open-passage">Open passage in transcript</button>' : ""}</div><label>Code to apply<input id="applycode" list="knowncodes"></label><datalist id="knowncodes">${opts(allCodes(d), "")}</datalist>${codingControls(d)}`,
    () => {
      if (codingPrompt) {
        if (get("suggestpass").disabled)
          throw Error("Review your codebook first.");
        get("suggestpass").click();
        return false;
      }
      if (!selected.size) throw Error("Choose one or more passages.");
      let code = val("applycode").trim();
      const transcript = isInterview(d);
      const affected = new Set();
      if (
        code &&
        (d.interviews?.established || d.coding?.mode === "deductive")
      ) {
        const existing = approvedBook(d).find(
          (entry) => labelKey(entry.label) === labelKey(code),
        );
        if (!existing)
          throw Error("Choose a label from your approved codebook.");
        code = existing.label;
      } else if (transcript && code) {
        const existing = sharedBook(d).find(
          (entry) => labelKey(entry.label) === labelKey(code),
        );
        if (existing) code = existing.label;
        else changeInterviewLabel(d, { label: code, definition: "" });
      }
      for (const p of d.passages.filter((p) => selected.has(p.id))) {
        if (code && !p.codes.includes(code)) {
          p.codes.push(code);
          affected.add(p.source);
        }
        p.reviewed = true;
      }
      if (transcript) {
        if (affected.size) {
          const state = interviews(d);
          state.done = state.done.filter((name) => !affected.has(name));
          state.finished = false;
        }
        checkpointInterview(project, d);
        if (!analysisReady(d)) return goto(1);
      }
      render();
    },
    codingPrompt
      ? "Suggest labels for these passages"
      : "Mark reviewed / apply code",
  );
  if (codingPrompt) {
    get("applycode").closest("label").hidden = true;
    get("discusspass").hidden = true;
    get("suggestpass").hidden = true;
  }
  const refresh = () => {
    get("passlist").innerHTML = list();
    get("prevp").onclick = () => {
      page--;
      refresh();
    };
    get("nextp").onclick = () => {
      page++;
      refresh();
    };
    get("passlist").onchange = (e) => {
      if (e.target.name === "pickp") {
        if (e.target.checked) selected.add(e.target.value);
        else selected.delete(e.target.value);
      }
    };
  };
  refresh();
  get("searchPass").oninput = (e) => {
    query = e.target.value.toLowerCase();
    page = 0;
    refresh();
  };
  if (get("iv-open-passage")) {
    get("iv-open-passage").onclick = () => {
      const passage =
        selected.size === 1
          ? ps.find((p) => selected.has(p.id))
          : !selected.size && ps.length === 1
            ? ps[0]
            : undefined;
      if (!passage) {
        get("formerror").textContent =
          "Tick one passage to open it in the transcript.";
        return;
      }
      const state = interviews(d);
      state.source = passage.source;
      state.passage = passage.id;
      get("dialog").close();
      goto(1);
      const row = [...document.querySelectorAll("[data-iv-id]")].find(
        (el) => el.dataset.ivId === (passage.parent || passage.id),
      );
      row?.scrollIntoView({ block: "nearest" });
      row?.querySelector("button")?.focus({ preventScroll: true });
    };
  }
  get("shortpass").onmousedown = (e) => e.preventDefault();
  get("shortpass").onclick = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) {
      get("formerror").textContent = "Select words within one passage first.";
      return;
    }
    const r = selection.getRangeAt(0),
      anchor = r.startContainer.parentElement?.closest("[data-passage-text]"),
      end = r.endContainer.parentElement?.closest("[data-passage-text]");
    if (!anchor || anchor !== end) {
      get("formerror").textContent = "Select words within a single passage.";
      return;
    }
    const original = d.passages.find(
      (p) => p.id === anchor.dataset.passageText,
    );
    const range = r.cloneRange();
    range.selectNodeContents(anchor);
    range.setEnd(r.startContainer, r.startOffset);
    let start = range.toString().length;
    const quote = selection.toString();
    if (!quote.trim()) return;
    let parent = original;
    const visited = new Set();
    while (parent.parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      const next = d.passages.find(
        (p) => p.id === parent.parent && p.source === original.source,
      );
      if (
        !next ||
        !Number.isInteger(parent.start) ||
        next.text.slice(parent.start, parent.start + parent.text.length) !==
          parent.text
      )
        break;
      start += parent.start;
      parent = next;
    }
    let p =
      quote === original.text
        ? original
        : d.passages.find(
            (p) =>
              p.parent === parent.id && p.start === start && p.text === quote,
          );
    if (!p) {
      p = {
        id: uid(),
        source: original.source,
        parent: parent.id,
        start,
        text: quote,
        codes: [],
        reviewed: false,
      };
      d.passages.push(p);
      ps.unshift(p);
    }
    selected.clear();
    selected.add(p.id);
    page = 0;
    query = "";
    get("searchPass").value = "";
    refresh();
    get("formerror").textContent =
      "Shorter passage selected. You can apply a code or request suggestions.";
  };
  function syncPassageLabels() {
    const approved =
      d.coding?.mode === "deductive" || d.interviews?.established
        ? approvedBook(d)
        : [];
    const field = get("applycode");
    if (!field) return;
    if (approved?.length) {
      const select = document.createElement("select");
      select.id = field.id;
      select.innerHTML = opts(
        [["", "Choose an approved label"], ...approved.map((e) => e.label)],
        field.value,
      );
      field.replaceWith(select);
    } else {
      get("knowncodes").innerHTML = opts(allCodes(d), "");
    }
  }
  function refreshDocumentBook() {
    if (!d.openAnswers) checkpointInterview(owner, d);
    if (project !== owner || getData() !== d) return;
    const panel = get("document-codebook");
    if (panel) panel.innerHTML = documentCodebook(d);
    else if (
      d.textPurpose === "documents" &&
      !d.openAnswers &&
      (d.coding?.bookDraft || d.coding?.book?.length)
    )
      render();
  }
  bindCodingControls(
    d,
    extractCodebook,
    () => {
      refreshDocumentBook();
      if (project !== owner || getData() !== d) return;
      suggestions = [];
      syncPassageLabels();
      render();
      get("apply-book-interviews")?.focus();
    },
    refreshDocumentBook,
  );
  syncPassageLabels();
  const applyBook = get("apply-book-interviews");
  if (applyBook) {
    applyBook.onclick = async () => {
      if (getData() !== d || !d.coding?.book?.length) return;
      delete d.textPurpose;
      const state = interviews(d);
      get("dialog").close();
      if (!state.draft) {
        d.coding.mode = "deductive";
        state.method = "book";
        state.established = true;
      }
      goto(1);
      await checkpointInterview(owner, d);
      if (project !== owner || getData() !== d || step !== 1) return;
      if (state.draft) {
        notice("Review or resume the existing coding draft first.");
        return;
      }
      try {
        await handleInterview("iv-auto", applyBook, d);
      } catch (error) {
        notice(error.message);
      }
    };
  }
  if (isInterview(d) && interviews(d).established) {
    get("coding-method").disabled = true;
    get("codebook-controls").hidden = true;
    get("inductive-help").hidden = true;
  }
  for (const id of ["discusspass", "suggestpass"])
    get(id).onclick = async () => {
      if (requesting) {
        get("formerror").textContent = "Wait for the current bot reply first.";
        return;
      }
      if (!selected.size || selected.size > 10) {
        get("formerror").textContent = "Choose 1–10 passages for a batch.";
        return;
      }
      if (id === "suggestpass")
        d.coding = {
          ...d.coding,
          mode: val("coding-method"),
          focus: val("coding-focus").trim(),
        };
      suggestions = [];
      chosen = selected;
      scope = [];
      get("dialog").close();
      if (step === 3) focusBot(i ? "right" : "left");
      try {
        if (id === "discusspass")
          await action("discusspass", { dataset: { i } });
        else {
          openBot(codingPrompt || "Suggest codes for the selected passages.");
          await ask(lastQuestion, "coding");
        }
      } catch (e) {
        notice(e.message);
      }
    };
}
const reviewActs = [
  "combinetables",
  "field",
  "exclude",
  "delrule",
  "unit",
  "sources",
  "renamecode",
  "link",
  "multi",
  "tocorpus",
];
function changeInterviewLabel(d, change) {
  if (getData() !== d)
    throw Error("Open this interview collection again to edit its labels.");
  const changed = editInterviewLabel(project, d, change, undoViews);
  if (changed) {
    suggestions = [];
    proposal = captionDraft = queuedShortcut = null;
    pendingSelections.clear();
  }
  return changed;
}
async function handleInterview(act, el, d) {
  const owner = project;
  const checkpoint = () => checkpointInterview(owner, d);
  return interviewAction(act, el, d, {
    current: getData,
    checkpoint,
    status: () => codingSaveStatus.get(owner)?.message || "",
    render,
    focus: () => project.researchFocus,
    changeLabel: (change) => changeInterviewLabel(d, change),
    extract: extractCodebook,
    unlock: (code) =>
      withBotActivity("Checking your course code…", () => unlockBot(code)),
    code: (context) => requestInterviewCoding(context, requestTutor),
    finish: () => {
      const s = interviews(d);
      if (
        s.draft ||
        !d.sources.length ||
        !d.sources.every((source) => s.done.includes(source))
      )
        throw Error("Check each interview before exploring themes.");
      if (!project.confirmed.includes(d.id)) {
        const v = newView(d);
        if (d.sources.length > 1 && d.coding?.book?.length)
          Object.assign(v, { task: "group", chart: "presence" });
        project.views = [v, structuredClone(v)];
        project.comparisonStarted = false;
      }
      s.finished = true;
      if (!project.confirmed.includes(d.id)) project.confirmed.push(d.id);
      checkpoint();
      goto(2);
    },
    add: async () => {
      const route = await askForm(
        "Add an interview",
        formselect(
          "iv-format",
          "What are you adding?",
          [
            ["text", "An uncoded transcript"],
            ["coded", "An interview with existing labels"],
          ],
          "text",
        ),
        () => val("iv-format"),
        "Choose files",
      );
      if (!route) return;
      chooseFiles(".txt,.docx,.csv,.tsv,.xlsx", true, async (files) => {
        const sets = await importFiles(files, route);
        if (!sets || getData() !== d) return;
        appendInterviews(d, sets);
        checkpoint();
        resetTutor();
        goto(1);
      });
    },
  });
}
async function action(act, el) {
  const d = getData(),
    i = Number(el.dataset.i || 0);
  if (act === "makeinterview") {
    delete d.textPurpose;
    activate(d.id);
    goto(1);
    return;
  }
  if (act.startsWith("iv-") && isInterview(d))
    return handleInterview(act, el, d);
  if (
    isInterview(d) &&
    interviews(d).draft &&
    ["renamecode", "sources"].includes(act)
  )
    throw Error("Review or discard the current coding draft first.");
  if (reviewActs.includes(act)) return reviewAction(act, d, el);
  switch (act) {
    case "openanswers": {
      const key = val("open-question");
      if (!isOpenQuestion(d.fields.find((f) => f.id === key)))
        throw Error("Choose a confirmed open question.");
      const answers = writtenAnswerSet(project, d, key, "", true);
      activate(answers.id);
      if (!project.confirmed.includes(answers.id))
        project.confirmed.push(answers.id);
      goto(2);
      evidence(0);
      return;
    }
    case "variables":
      editRoles(
        d,
        project,
        botURL
          ? (context, code) =>
              withBotActivity("Suggesting question roles…", async () => {
                if (!botSession()) {
                  if (!code.trim())
                    throw Error(
                      "Enter your course code or tick the roles yourself.",
                    );
                  await unlockBot(code.trim());
                }
                return structuredAnswer(
                  await requestTutor({
                    skill: "variables",
                    context,
                    question:
                      "Suggest question roles for this research question.",
                  }),
                );
              })
          : null,
        () => {
          render();
          notice(
            "Question roles confirmed. Explore shows them beside the question labels.",
          );
        },
      );
      return;
    case "editselection":
      selectionConfirmed = false;
      beginSelection(i);
      render();
      document
        .querySelector(`[data-panel="${i}"] .selection-editor select`)
        ?.focus();
      return;
    case "applyselection":
      if (!pendingSelections.has(i)) summary(i);
      commitSelection(i);
      if (step === 2) selectionConfirmed = true;
      else
        document
          .querySelector(`[data-chart-options="edit-${i}"]`)
          ?.removeAttribute("open");
      render();
      get("figure-heading" + i)?.focus();
      get("figure-heading" + i)?.scrollIntoView({ block: "center" });
      notice(
        "Selection confirmed. Showing " + viewName(d, project.views[i]) + ".",
      );
      return;
    case "discardselection":
      beginSelection(i);
      render();
      notice("Selection reset to the current visual.");
      return;
    case "savevisual": {
      const view = structuredClone(project.views[i]);
      const result = summary(i, view);
      modal(
        "Save visual",
        `<label>Visual name<input id="visual-name" required maxlength="180" value="${esc((view.title || viewName(d, view)).slice(0, 180))}"></label><p>Open this visual again under Save and export. Download your project to keep it for another session.</p><label class="tick"><input id="visual-svg" type="checkbox">Also download this visual as an SVG image</label>`,
        () => {
          const name = val("visual-name").trim();
          if (!name) throw Error("Give the visual a name.");
          if (get("visual-svg").checked) {
            const svg = figure(result, view);
            const safeName = name.replace(/[<>:"/\\|?*]/g, "-");
            blobSave(
              new Blob([new XMLSerializer().serializeToString(svg)], {
                type: "image/svg+xml;charset=utf-8",
              }),
              safeName + ".svg",
            );
          }
          project.savedVisuals.push({ name, dataset: d.id, view });
          render();
          notice(
            "Visual saved in this project. Find it under Save and export.",
          );
        },
        "Save to project",
      );
      return;
    }
    case "loadvisual": {
      const saved = project.savedVisuals[i];
      if (project.active !== saved.dataset) activate(saved.dataset);
      snapshotViews();
      pendingSelections.clear();
      selectionConfirmed = false;
      project.views[0] = structuredClone(saved.view);
      proposal = captionDraft = queuedShortcut = null;
      goto(2);
      return;
    }
    case "editpuzzle":
      puzzleDrafts.set(project, project.researchFocus);
      render();
      get("puzzle-field")?.focus();
      return;
    case "savepuzzle":
      project.researchFocus = readFocus(val("puzzle-field"));
      project.puzzleSkipped = !project.researchFocus;
      proposal = captionDraft = queuedShortcut = null;
      puzzleDrafts.delete(project);
      render();
      get("question")?.focus();
      return;
    case "skippuzzle":
      if (!project.researchFocus) project.puzzleSkipped = true;
      puzzleDrafts.delete(project);
      render();
      get("question")?.focus();
      return;
    case "editfocus":
      editProjectFocus();
      return;
    case "original": {
      const names = Object.keys(d.originals || {});
      modal(
        "Original transcript",
        formselect("origSource", "Source", names) +
          '<div class="excerpt" id="origText"></div>',
      );
      const show = () =>
        (get("origText").textContent = d.originals[val("origSource")] || "");
      get("origSource").onchange = show;
      show();
      return;
    }
    case "nav":
      goto(i);
      return;
    case "undo":
      if (!undoViews.length) throw Error("There are no view changes to undo.");
      pendingSelections.clear();
      project.views = undoViews.pop();
      break;
    case "addgroups": {
      const view = project.views[i];
      modal(
        "Add interview groups",
        '<p>Choose a detail you recorded about the people you interviewed. Interviews with the same value form one group.</p><label>Which detail will you use to form groups?<input id="group-name" required maxlength="100"></label><p>Enter the recorded value for each interview. Use the same wording for interviews that belong together. Leave the box blank if you do not know.</p>' +
          d.sources
            .map(
              (source, j) =>
                "<label>" +
                esc(source) +
                '<input id="group-source-' +
                j +
                '" maxlength="150"></label>',
            )
            .join(""),
        () => {
          const name = val("group-name").trim();
          if (
            !name ||
            ["__proto__", "constructor", "prototype"].includes(name) ||
            groupChoices(d).some(
              ([key]) => key.toLowerCase() === name.toLowerCase(),
            )
          )
            throw Error(
              "Use a new grouping name. Existing groupings are in Compare by group.",
            );
          const groups = d.sources
            .map((source, j) => [source, val("group-source-" + j).trim()])
            .filter(([, value]) => value);
          if (!groups.length)
            throw Error("Enter a group for at least one interview.");
          d.metadata = Object.assign(Object.create(null), d.metadata || {});
          for (const [source, value] of groups)
            d.metadata[source] = { ...d.metadata[source], [name]: value };
          snapshotViews();
          view.groupBy = name;
          if (step === 3) focusBot(i ? "right" : "left");
          render();
        },
        "Show groups",
      );
      return;
    }
    case "describechart":
      if (step === 3) focusBot(i ? "right" : "left");
      openBot();
      get("question")?.focus();
      return;
    case "figurestyle":
      chooseFigureStyle(i);
      return;
    case "charttype": {
      const view = project.views[i];
      const picker = el.closest(".chart-picker");
      if (picker) {
        picker.open = false;
        picker.querySelector("summary").focus({ preventScroll: true });
      }
      if (
        view.chart === el.dataset.chart ||
        !available(d, view).includes(el.dataset.chart)
      )
        return;
      snapshotViews();
      if (step === 3) focusBot(i ? "right" : "left");
      proposal = captionDraft = queuedShortcut = null;
      view.chart = el.dataset.chart;
      render();
      document
        .querySelector(`[data-panel="${i}"] .chart-picker summary`)
        ?.focus({ preventScroll: true });
      return;
    }
    case "resetview":
      snapshotViews();
      pendingSelections.delete(i);
      project.views[i] = newView(d);
      break;
    case "compact":
      compact = !compact;
      break;
    case "upload": {
      const route = el.dataset.route;
      chooseFiles(
        route === "survey" || route === "table"
          ? ".csv,.tsv,.xlsx"
          : ".docx,.txt,.csv,.tsv,.xlsx",
        true,
        async (files) => {
          let datasets = await importFiles(
            files,
            route === "interview" ? "text" : route,
          );
          if (!datasets?.length) return;
          if (["interview", "coded"].includes(route)) {
            if (datasets.length > 1)
              appendInterviews(datasets[0], datasets.slice(1));
            datasets = [datasets[0]];
            interviews(datasets[0]).source = datasets[0].sources[0];
          } else if (route === "text")
            for (const set of datasets) set.textPurpose = "documents";
          project.datasets.push(...datasets);
          if (project.name === "Untitled project")
            project.name = files[0].name.replace(/\.[^.]+$/, "");
          activate(datasets[0].id);
          goto(1);
        },
      );
      return;
    }
    case "surveylabels":
      chooseFiles(".qsf", false, async ([file]) => {
        const result = labelledSurvey(d, JSON.parse(await file.text()));
        const replace = !project.confirmed.includes(d.id) && !d.rules.length;
        modal(
          "Check the questionnaire labels",
          `<p>${result.matched} question headings matched. Answer categories matched the questionnaire for ${result.decoded} questions.</p>` +
            table(["Question", "Example answers"], result.samples) +
            (d.rules.length
              ? "<p>Your exclusions carry across. " +
                filteredRows(result.copy).length +
                " of " +
                d.rows.length +
                " records remain selected.</p>"
              : "") +
            (replace
              ? ""
              : "<p>This creates a labelled copy with fresh views. Your existing analysis stays available.</p>"),
          () => {
            if (replace)
              project.datasets[project.datasets.indexOf(d)] = result.copy;
            else {
              result.copy.id = uid();
              result.copy.name += " (labelled)";
              project.datasets.push(result.copy);
            }
            activate(result.copy.id);
            goto(1);
          },
          "Use these labels",
        );
      });
      return;
    case "confirm":
      if (!project.confirmed.includes(d.id)) {
        project.confirmed.push(d.id);
        activate(d.id);
      }
      goto(2);
      return;
    case "compare":
      goto(3);
      return;
    case "passages":
    case "answers":
      evidence(i);
      return;
    case "dockbot":
      toggleDock();
      render();
      document.querySelector('[data-act="dockbot"]')?.focus();
      return;
    case "bothelp": {
      const mode = await chooseHelpMode(project.mode);
      if (mode) {
        saveHelpMode(mode);
        project.mode = mode;
        render();
        document.querySelector('[data-act="bothelp"]')?.focus();
      }
      return;
    }
    case "bothintsuggestion": {
      if (requesting)
        return notice("The Data bot is working on your previous request.");
      return action(el.dataset.next, el);
    }
    case "botfilehelp":
    case "bottexthelp":
    case "botsavehelp": {
      const answers = {
        botfilehelp:
          "For a questionnaire, choose your Qualtrics export or a table of responses. For interviews, choose transcripts or coded passages. To continue a previous project, choose Open a saved project and select your downloaded project file.",
        bottexthelp: isInterview(d)
          ? "Highlight the speaker’s words, or select a whole passage. Choose Edit labels on selected text to add or remove labels there. Manage labels changes the shared list for these interviews."
          : "Read a passage with its surrounding words. If it is already coded, check whether its labels capture what the speaker means. If you are starting from scratch, you can build labels from the passages or apply a codebook you already have.",
        botsavehelp:
          "Choose Download project with data. To continue on this or another computer, choose Open a saved project on Upload and select that file.",
      };
      history.push(
        { role: "user", content: el.textContent.trim() },
        { role: "assistant", content: answers[act] },
      );
      break;
    }
    case "closebot":
      bot = false;
      render();
      document.querySelector('[data-act="bot"]').focus();
      return;
    case "bot":
      if (!bot) {
        openBot(lastQuestion);
        return;
      }
      bot = false;
      break;
    case "declinegroups":
      proposal = null;
      history.push(
        { role: "user", content: "No thanks." },
        { role: "assistant", content: "Kept your current figure." },
      );
      break;
    case "botdraw":
      applyProposal();
      return;
    case "applycaption": {
      const draft = captionDraft;
      captionDraft = null;
      if (
        !draft ||
        draft.step !== step ||
        draft.dataset !== project.active ||
        draft.baseline !== JSON.stringify(project.views[draft.panel])
      )
        throw Error("The figure changed. Draft a new caption.");
      snapshotViews();
      project.views[draft.panel].annotation = draft.text;
      tutorRecord(project).activity.push(
        "Added a caption to " + viewName(d, project.views[draft.panel]) + ".",
      );
      break;
    }
    case "clearevidence":
      chosen.clear();
      scope = [];
      suggestions = [];
      proposal = null;
      captionDraft = null;
      queuedShortcut = null;
      break;
    case "discusspass":
    case "choose":
    case "researchsuggest":
    case "suggestgroups":
    case "botvariant":
    case "botcaption":
    case "askview":
    case "askboth": {
      if (requesting)
        return notice("The Data bot is working on your previous request.");
      if (step === 3 && (act === "askview" || act === "askboth"))
        focusBot(act === "askboth" ? "both" : i ? "right" : "left");
      const [intent, prompt] = {
        discusspass: [
          "excerpts",
          "Explain what the selected passages have in common or how they differ. Ground each point in a short exact quotation and name the source. Limit your claims to these passages.",
        ],
        researchsuggest: [
          "research",
          "Which questions or themes, and which groups if useful, would help us explore our research question? Explain the link and anything we cannot measure.",
        ],
        suggestgroups: [
          "suggestGroups",
          project.researchFocus
            ? "Which grouping fits our research question for the current selection?"
            : "Do any groups stand out for my selection?",
        ],
        choose: [
          "suggest",
          "Suggest a useful chart for the current selection and explain why.",
        ],
        botvariant: [
          "variant",
          "Show the current selection using a different chart and explain what that makes easier to see.",
        ],
        botcaption: [
          "caption",
          "Draft a one- or two-sentence caption for the selected figure using its evidence and unit.",
        ],
        askview: [
          "explain",
          "Explain the clearest pattern in this view using its counts, units and any relevant limitation.",
        ],
        askboth: [
          "compare",
          "Compare these two views. Explain what is comparable, what differs, and what the evidence shows.",
        ],
      }[act];
      openBot(prompt);
      if (!botSession()) {
        queuedShortcut = {
          prompt,
          intent,
          step,
          dataset: project.active,
          baseline: JSON.stringify(project.views),
          focus: botFocus,
        };
        return;
      }
      await ask(prompt, "recommend", intent);
      return;
    }
    case "finding":
      openBot("I would like to show this finding: ");
      return;
    case "caption":
      openBot("Suggest a concise caption for these figures.");
      return;
    case "scope": {
      const c = botContext();
      modal(
        "What the bot can see",
        `<p>The current question, recent conversation and the following project context accompany your request.</p><details><summary>Inspect current context</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(c, null, 2))}</pre></details>` +
          (d?.kind === "text"
            ? "<p>Also include these named sources</p>" +
              d.sources
                .map(
                  (s, j) =>
                    `<label class="tick"><input name="scope" type="checkbox" value="${j}" ${scope.includes(s) ? "checked" : ""}>${esc(s)}</label>`,
                )
                .join("")
            : ""),
        () => {
          if (d?.kind === "text") {
            suggestions = [];
            scope = d.sources.filter((s, j) =>
              document.querySelector(`input[name=scope][value="${j}"]:checked`),
            );
          }
          render();
        },
      );
      return;
    }
    case "unlock": {
      if (unlocking) return;
      const code = val("course").trim();
      if (!code) {
        get("course-error").textContent = "Enter your workshop course code.";
        get("course").focus();
        return;
      }
      unlocking = true;
      el.disabled = true;
      el.textContent = "Unlocking…";
      get("course-error").textContent = "";
      try {
        await withBotActivity("Checking your course code…", () =>
          unlockBot(code),
        );
      } catch (error) {
        const field = get("course");
        if (field) {
          get("course-error").textContent = error.message;
          field.setAttribute("aria-invalid", "true");
          field.focus();
          field.select();
          const retry = document.querySelector('[data-act="unlock"]');
          retry.disabled = false;
          retry.textContent = "Unlock the bot";
        }
        return;
      } finally {
        unlocking = false;
      }
      render();
      (get("puzzle-field") || get("question"))?.focus({ preventScroll: true });
      const queued = queuedShortcut;
      queuedShortcut = null;
      if (
        queued &&
        queued.prompt === lastQuestion &&
        queued.step === step &&
        queued.dataset === project.active &&
        queued.baseline === JSON.stringify(project.views) &&
        queued.focus === botFocus &&
        (!queued.selection ||
          queued.selection === JSON.stringify([[...chosen], scope]))
      ) {
        await ask(queued.prompt, queued.skill || "recommend", queued.intent);
      }
      return;
    }
    case "send": {
      let q = val("question").trim();
      if (!q) throw Error("Enter a question.");
      const declaration = projectFocusMessage(q);
      if (declaration) {
        if (!declaration.request) {
          lastQuestion = q;
          editProjectFocus(q);
          return;
        }
        if (declaration.focus.length > focusLimit)
          throw Error("Keep your project focus to 2,000 characters or fewer.");
        project.researchFocus = readFocus(declaration.focus);
        puzzleDrafts.delete(project);
        project.puzzleSkipped = false;
        proposal = captionDraft = queuedShortcut = null;
        history.push({ role: "user", content: declaration.focus });
        notice("Project focus saved.");
        q = declaration.request;
        lastQuestion = q;
      }
      if (
        isInterview(d) &&
        (step === 1 || /\b(?:transcripts?|interviews?)\b/i.test(q)) &&
        (requestsCoding(q) ||
          (d.interviews?.draft &&
            /\b(?:review|edit|approve|rename|reopen)\b.{0,45}\b(?:draft|labels?|codes?|suggestions|them)\b/i.test(
              q,
            )))
      ) {
        if (step !== 1) goto(1);
        const s = interviews(d);
        history.push({ role: "user", content: q });
        lastQuestion = "";
        const selection = interviewScopeRequest(q, d.sources, s.source);
        const useBook =
          /\b(?:deductiv\w*|code\s?book|pre[- ]?defined|approved|existing)\b|\b(?:apply|use|assign)\b.{0,30}\b(?:codes?|labels?|them)\b/i.test(
            q,
          );
        const discover = requestsLabelDiscovery(q, s.established);
        let command, reply;
        if (s.draft) {
          const ready = s.draft.total > 0 && s.draft.next === s.draft.total;
          if (interviewActivity(d)) {
            reply =
              "I'm still reading the selected passages. You can close the chat and follow progress in Code interviews.";
          } else if (ready) {
            command = "iv-review";
            reply = s.draft.sample
              ? "Your draft labels are ready. Edit their names and meanings, check the quotations and choose Use these labels to approve your codebook."
              : "Your coding draft is ready. Review the suggested matches before saving them to your interviews.";
          } else {
            command = "iv-resume";
            reply =
              "Your saved draft will continue from the first unfinished batch using your original selection.";
          }
        } else if (d.coding?.bookDraft && !discover) {
          command = "iv-reviewbook";
          reply =
            "Review the draft labels in your codebook first. Once you approve them, choose Code manually or Code with the bot.";
        } else if (s.established && discover) {
          command = "iv-sample";
          reply =
            "Choose passages to look for additional labels. I'll use your shared labels where they fit. You can review each proposal before changing the codebook.";
        } else if (s.established) {
          command = "iv-auto";
          reply =
            "Choose which interviews I should code with your shared labels. You can check each quotation before applying it.";
        } else if (useBook && sharedBook(d).length) {
          const labels = sharedBook(d)
            .map((entry) => esc(entry.label))
            .join(", ");
          const confirmed = await askForm(
            "Use these labels as your shared codebook?",
            "<p>" +
              labels +
              "</p><p>Next you can choose which interviews to check for these labels.</p>",
            () => true,
            "Confirm shared codebook",
          );
          if (!confirmed || getData() !== d) {
            render();
            return;
          }
          await handleInterview("iv-establish", el, d);
          command = "iv-auto";
          reply =
            "Choose which interviews I should check for the labels you confirmed.";
        } else if (!discover && (s.method === "book" || useBook)) {
          s.method = "book";
          command = /\b(?:upload|file|extract|document)\b/i.test(q)
            ? "iv-book"
            : null;
          reply = command
            ? "Upload your codebook and review the extracted labels. Once you approve them, choose Code with the bot."
            : "Under Set up your codebook, choose Enter labels manually or Extract labels from a codebook. After approval, choose Code with the bot to select your interviews.";
        } else {
          s.method = "inductive";
          command = "iv-sample";
          reply =
            "Choose the interviews and passages I should read to suggest labels. You can review the labels and their supporting quotations together.";
        }
        if (
          ["iv-auto", "iv-sample"].includes(command) &&
          selection.minimum > d.sources.length
        ) {
          reply =
            "This collection has only one interview. Choose + Add interview to include a second one, then ask me again.";
          command = null;
        }
        history.push({ role: "assistant", content: reply });
        render();
        if (command)
          await handleInterview(
            command,
            { dataset: {}, scopeRequest: selection },
            d,
          );
        return;
      }
      if (d?.kind === "text") {
        const latest = history.at(-1);
        const agrees =
          latest?.role === "assistant" &&
          latest.content.includes("reply “apply them”") &&
          /^(?:yes|yes please|okay|go ahead|please do)[.! ]*$/i.test(q);
        if (suggestions.length && (acceptsCodingBatch(q) || agrees)) {
          finishCodingBatch(q);
          return;
        }
        if (
          !suggestions.length &&
          acceptsCodingBatch(q) &&
          latest?.role === "assistant" &&
          /^Applied \d+ label assignment/.test(latest.content)
        ) {
          history.push(
            { role: "user", content: q },
            {
              role: "assistant",
              content:
                "Those labels have already been applied. You can see them under Read and code passages.",
            },
          );
          lastQuestion = "";
          break;
        }
        if (
          suggestions.length &&
          /\b(?:apply|adopt|accept|assign)\b/i.test(q) &&
          /\b(?:labels?|codes?|suggestions?|them)\b/i.test(q)
        ) {
          history.push(
            { role: "user", content: q },
            {
              role: "assistant",
              content:
                "The proposed matches are below. Use Review label to edit or accept one, Dismiss to leave one out, or Apply all suggested labels to save the remaining matches.",
            },
          );
          lastQuestion = "";
          break;
        }
        if (requestsCoding(q)) {
          await prepareChatCoding(q);
          return;
        }
      }
      if (
        /^(?:what (?:is|are) (?:a |the )?(?:sub[- ]?)?groups?|what (?:does|do) (?:a |the )?["'“”‘’]?(?:sub[- ]?)?groups?["'“”‘’]? mean|what do you mean by (?:a |the )?["'“”‘’]?(?:sub[- ]?)?groups?["'“”‘’]?)(?: (?:here|in (?:this|my|our) (?:chart|project|data|survey|interviews?)))?[?!. ]*$/i.test(
          q,
        )
      ) {
        lastQuestion = "";
        const view =
          step === 2 || (step === 3 && botFocus !== "both")
            ? project.views[focusIndex()]
            : undefined;
        history.push(
          { role: "user", content: q },
          { role: "assistant", content: termMeaning("group", d, view) },
        );
        break;
      }
      if (
        proposal?.groupSuggestion &&
        /^(?:why(?: this| that| those groups| this comparison| did you (?:choose|suggest|pick) (?:that|this|these groups))?|how did you (?:choose|decide|pick)(?: that| this)?)\s*[?!.]*$/i.test(
          q,
        )
      ) {
        lastQuestion = "";
        history.push(
          { role: "user", content: q },
          {
            role: "assistant",
            content:
              "I compared the shares for your selected items within each possible grouping I checked. I gave more weight to differences backed by more records or interviews and to grouping fields filled in for more of the sample. This is an exploratory comparison. Shall I draw it?",
          },
        );
        break;
      }
      if (
        proposal?.groupSuggestion &&
        /^(?:no(?: thanks| thank you)?|cancel|skip(?: it)?|keep (?:this|my|the current) (?:view|chart|figure))[.!]?$/i.test(
          q,
        )
      ) {
        proposal = null;
        lastQuestion = "";
        history.push(
          { role: "user", content: q },
          { role: "assistant", content: "Kept your current figure." },
        );
        break;
      }
      if (
        proposal &&
        /^(?:yes|sure|ok(?:ay)?|go ahead|please do|I agree|sounds good|make (?:it|that|the chart)|show (?:me|it)|draw (?:it|that|the chart|the comparison))(?:[, !.]+(?:please|do it|make it|show me|draw (?:it|that comparison|the comparison)|go ahead))*[!. ]*$/i.test(
          q,
        )
      ) {
        lastQuestion = "";
        history.push({ role: "user", content: q });
        applyProposal();
        return;
      }
      await ask(
        q,
        step === 1
          ? "imports"
          : step === 2 || step === 3
            ? "recommend"
            : project.views.some((v) => v.task === "model")
              ? "regression"
              : "charts",
      );
      return;
    }
    case "applycodes":
      finishCodingBatch();
      return;
    case "dismisscode":
      suggestions.splice(i, 1);
      break;
    case "acceptcode": {
      const s = suggestions[i];
      const guide = codingGuide(d);
      const deductive = guide.mode === "deductive";
      if (
        !s ||
        !checkedSuggestions(
          [s],
          d.passages.filter((p) => p.id === s.id),
          guide,
        ).length
      )
        throw Error(
          "The labels or passage changed. Request fresh suggestions.",
        );
      modal(
        "Review suggested code",
        `<p>“${esc(s.quote)}”</p><p>${esc(s.reason)}</p>${
          deductive
            ? formselect(
                "approved",
                "Codebook label",
                guide.vocabulary.map((e) => e.label),
                s.code,
              )
            : `<label>Code label<input id="approved" value="${esc(s.code)}" required></label>`
        }<label>Meaning<textarea id="approved-meaning" ${deductive ? "readonly" : ""}>${esc(s.definition)}</textarea></label>`,
        () => {
          const current = {
            ...s,
            code: val("approved").trim(),
            definition: val("approved-meaning").trim(),
          };
          const applied = applyCodingBatch(d, [current]);
          const code = applied.labels[0],
            p = d.passages.find((p) => p.id === s.id);
          if (!deductive) {
            const meaning = d.coding.meanings.find((e) => e.label === code);
            for (const remaining of suggestions)
              if (remaining.code === s.code && remaining !== s) {
                remaining.code = code;
                remaining.definition = meaning.definition;
              }
          }
          tutorRecord(project).activity.push(
            "Accepted the code “" +
              code +
              "” for a passage from " +
              p.source +
              ".",
          );
          suggestions.splice(i, 1);
          render();
        },
      );
      const updateMeaning = () => {
        const known = guide.vocabulary.find((e) => e.label === val("approved"));
        const field = get("approved-meaning");
        field.readOnly = deductive || !!known?.definition;
        if (known?.definition || deductive)
          field.value = known?.definition || "";
      };
      get("approved").oninput = updateMeaning;
      updateMeaning();
      return;
    }
    case "savecompare":
      modal(
        "Save comparison",
        `<label>Name<input id="compname" required></label><label>What does this comparison show?<textarea id="compnote"></textarea></label>`,
        () => {
          const name = val("compname").trim();
          if (!name) throw Error("Give the comparison a name.");
          project.saved.push({
            name,
            note: val("compnote"),
            dataset: d.id,
            views: structuredClone(project.views),
            linked: project.linked,
          });
          notice("Comparison saved in the project.");
          render();
        },
        "Save to project",
      );
      return;
    case "loadcomp": {
      const s = project.saved[i];
      activate(s.dataset);
      project.views = structuredClone(s.views);
      project.linked = s.linked;
      project.comparisonStarted = true;
      goto(3);
      return;
    }
    case "dupcomp": {
      const s = structuredClone(project.saved[i]);
      s.name += " (copy)";
      project.saved.push(s);
      break;
    }
    case "device":
      try {
        localStorage.setItem(
          "dv-project",
          JSON.stringify(projectPackage(project)),
        );
      } catch {
        throw Error(
          "This browser could not store the project. Choose Download project with data to keep your work.",
        );
      }
      notice(
        "Saved. Choose Resume on this device in the same browser to reopen this project.",
      );
      return;
    case "removeCodingCopy":
      if (
        await askForm(
          "Remove this recovery copy?",
          "<p>This removes the interview recovery copy from this browser. Downloaded projects and your open workspace are kept.</p>",
          () => true,
          "Remove copy",
        )
      ) {
        await removeCodingCopy(el.dataset.copy);
        render();
      }
      return;
    case "recoverCoding": {
      if (
        project.datasets.length &&
        !(await askForm(
          "Switch projects?",
          "<p>Download the current project first if you want to keep its changes.</p>",
          () => true,
          "Resume coding project",
        ))
      )
        return;
      const { project: restored, summary } = await loadCodingCopy(
        el.dataset.copy,
      );
      setProject(restored);
      useCodingCopy(project, summary);
      return;
    }
    case "deviceOpen":
      if (
        project.datasets.length &&
        !(await askForm(
          "Switch projects?",
          "<p>Resuming the device copy replaces the open workspace. Download your current project first if you want to keep these edits.</p>",
          () => true,
          "Resume saved copy",
        ))
      )
        return;
      setProject(JSON.parse(localStorage.getItem("dv-project")));
      return;
    case "download":
    case "settings":
      download(
        act === "settings" ? settingsProject(project) : projectPackage(project),
        act === "settings"
          ? "visualiser-settings.json"
          : (project.name
              .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
              .trim()
              .slice(0, 100) || "Data visualiser") + " - project.json",
      );
      if (act === "download" && codingSaveStatus.has(project))
        codingSaveStatus.get(project).needsSave = false;
      return;
    case "open":
      chooseFiles(".json", false, ([file]) => openProjectFile(file));
      return;
    case "downloadfigure":
      return action(val("figure-format") === "svg" ? "svg" : "png", el);
    case "previewexport":
    case "svg":
    case "png":
    case "copyfig": {
      const indices =
          val("panels") === "both"
            ? [0, 1]
            : [val("panels") === "left" ? 0 : 1],
        out = combinedSVG(
          indices.map((k) =>
            figure(summary(k), project.views[k], {
              width: Number(val("preset")),
            }),
          ),
          val("layout"),
        );
      if (act === "previewexport") {
        modal(
          "Figure preview",
          '<div class="graphic" id="previewFigure"></div>',
        );
        get("previewFigure").append(out);
      } else await exportSVG(out, act === "copyfig" ? "copy" : act);
      return;
    }
  }
  render();
}
document.addEventListener("dragover", (event) => {
  if (event.target.closest("#project-drop")) event.preventDefault();
});
document.addEventListener("drop", async (event) => {
  if (!event.target.closest("#project-drop")) return;
  event.preventDefault();
  if (event.dataTransfer.files.length !== 1)
    return notice("Drop one saved project at a time.");
  try {
    await openProjectFile(event.dataTransfer.files[0]);
  } catch (error) {
    notice(error.message);
  }
});
document.addEventListener("mousedown", (e) => {
  if (e.target.closest('[data-act="iv-manual"], [data-act="iv-apply-manual"]'))
    e.preventDefault();
});
document.addEventListener("click", async (e) => {
  const text = e.target.closest("[data-iv-text]");
  const el = e.target.closest("[data-act]");
  try {
    if (text && !window.getSelection()?.toString()) {
      const d = getData(),
        mark = e.target.closest("[data-iv-quotation]");
      if (mark) {
        await handleInterview(
          "iv-excerpt",
          {
            dataset: {
              id: mark.dataset.ivQuotation,
              start: mark.dataset.start,
              end: mark.dataset.end,
            },
          },
          d,
        );
      } else {
        // Keep the original text nodes in place so a double-click can select a word.
        interviews(d).passage = text.dataset.ivText;
        for (const item of document.querySelectorAll("[data-iv-id]")) {
          const selected = item.dataset.ivId === text.dataset.ivText;
          item.classList.toggle("iv-selected", selected);
          item
            .querySelector('[data-act="iv-select"]')
            ?.setAttribute("aria-pressed", String(selected));
        }
      }
      return;
    }
    if (el) {
      await action(el.dataset.act, el);
      return;
    }
    const row = e.target.closest("[data-pattern-row]");
    if (row?.closest("[data-panel]")) {
      patternEvidence(
        Number(row.closest("[data-panel]").dataset.panel),
        Number(row.dataset.patternRow),
      );
      return;
    }
    const cell = e.target.closest("[data-code]");
    if (cell?.closest("[data-panel]"))
      evidence(Number(cell.closest("[data-panel]").dataset.panel), {
        code: cell.dataset.code,
        source: cell.dataset.source,
      });
  } catch (err) {
    notice(err.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.hasAttribute("data-find-items")) {
    const query = e.target.value.trim().toLowerCase();
    for (const label of e.target.parentNode.querySelectorAll(
      ".item-list label",
    ))
      label.hidden = !label.textContent.toLowerCase().includes(query);
  }
  if (e.target.id === "question") lastQuestion = e.target.value;
  if (e.target.id === "puzzle-field") puzzleDrafts.set(project, e.target.value);
});
document.addEventListener("keydown", (e) => {
  if (e.target.id === "course" && e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    document.querySelector('[data-act="unlock"]')?.click();
    return;
  }
  if (e.key === "Escape") {
    const help =
      e.target.closest(".term-help[open]") ||
      document.querySelector(".term-help[open]:hover");
    if (help) {
      help.open = false;
      e.preventDefault();
      return;
    }
  }
  if (
    (e.key === "Enter" || e.key === " ") &&
    e.target.closest("[data-panel]") &&
    (e.target.hasAttribute("data-pattern-row") ||
      e.target.hasAttribute("data-code"))
  ) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return;
  }
  if (
    e.key === "Escape" &&
    bot &&
    !get("dialog").open &&
    e.target.closest("#data-bot")
  ) {
    document.querySelector('[data-act="closebot"]').click();
  }
});
matchMedia("(min-width: 900px)").addEventListener("change", () => {
  if (bot) render();
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "includeBotChat") {
    project.includeBotChat = t.checked;
    return;
  }
  if (t.id === "dataset") {
    activate(t.value);
    goto(project.confirmed.includes(t.value) ? step : 1);
    return;
  }
  if (t.id === "bot-focus") {
    focusBot(t.value);
    render();
    return;
  }
  if (t.id === "linked") {
    proposal = null;
    captionDraft = null;
    project.linked = t.checked;
    if (project.linked)
      Object.assign(project.views[1], {
        filter: project.views[0].filter,
        value: project.views[0].value,
      });
    render();
    return;
  }
  const box = t.closest("[data-panel]");
  if (!box) return;
  const i = Number(box.dataset.panel);
  if (t.hasAttribute("data-stage-selection")) {
    try {
      if (t.checked) {
        commitSelection(i);
        pendingSelections.delete(i);
      } else beginSelection(i);
      render();
    } catch (err) {
      t.checked = false;
      notice(err.message);
    }
    return;
  }
  const draft = t.closest(".selection-editor") && pendingSelections.get(i);
  if (!draft) snapshotViews();
  const v = draft ? draft.view : project.views[i];
  if (step === 3) focusBot(i ? "right" : "left");
  queuedShortcut = null;
  proposal = null;
  captionDraft = null;
  if (t.hasAttribute("data-item")) {
    const list = box.querySelector(".item-list"),
      scroll = list.scrollTop;
    const search = box.querySelector("[data-find-items]")?.value;
    const id = t.dataset.item;
    v.items = t.checked
      ? [...new Set([...v.items, id])].slice(0, selectionLimit)
      : v.items.filter((x) => x !== id);
    render();
    const panel = document.querySelector(`[data-panel="${i}"]`);
    if (search) {
      const find = panel.querySelector("[data-find-items]");
      find.value = search;
      find.dispatchEvent(new Event("input", { bubbles: true }));
    }
    panel.querySelector(".item-list").scrollTop = scroll;
    [...panel.querySelectorAll("[data-item]")]
      .find((input) => input.dataset.item === id)
      ?.focus({ preventScroll: true });
    return;
  }
  if (t.hasAttribute("data-predictor")) {
    v.predictors = [...box.querySelectorAll("[data-predictor]:checked")].map(
      (el) => el.dataset.predictor,
    );
  } else if (t.hasAttribute("data-interaction")) v.interaction = t.checked;
  else if (t.dataset.key) {
    v[t.dataset.key] = t.value;
    tidy(v, t.dataset.key);
    if (
      step === 3 &&
      project.linked &&
      ["filter", "value"].includes(t.dataset.key)
    )
      Object.assign(project.views[1 - i], { filter: v.filter, value: v.value });
  } else return;
  render();
  if (["task", "patternMode"].includes(t.dataset.key))
    document
      .querySelector(`[data-panel="${i}"] select[data-key="${t.dataset.key}"]`)
      ?.focus({ preventScroll: true });
});
resetTutor();
render();
