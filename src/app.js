import {
  canImport,
  currentMethod,
  datasetMethod,
  methodLabels,
  projectMethods,
  separateMethod,
  workingDatasets,
} from "./project-method.js";
import { includedInterview } from "./coding-passages.js";
import { editFigure } from "./figure-editor.js";
import { filterDisplayValue, modelDisplayTerm } from "./figure-edits.js";
import {
  chooseHelpMode,
  helpSettings,
  helpSuggestion,
  readHelpMode,
  saveHelpMode,
} from "./bot-help.js";
import { structuredAnswer } from "./bot-response.js";
import { extractCodebookEntries } from "./codebook-extraction.js";
import { botSession, confirmTaskAccess } from "./bot-access.js";
import { interviewScopeRequest } from "./interview-scope.js";
import { requestInterviewCoding } from "./interview-coding-request.js";
import {
  isInterview,
  interviews,
  appendInterviews,
  sharedBook,
} from "./interviews.js";
import {
  listRecoveries,
  loadRecovery,
  removeRecovery,
  archiveDownload,
  downloadedContent,
  isDownloaded,
  keepInRecents,
  preserveDownloadAcrossNavigation,
  saveRecovery,
  recoveryId,
  resumeRecovery,
  protectDeparture,
} from "./project-recovery.js";
import {
  interviewScreen,
  interviewAction,
  interviewActivity,
} from "./interview-workspace.js";
import { transcriptEndpoint } from "./interview-manual.js";
import { passageUnits } from "./transcript-index.js";
import { writtenAnswerSet, isOpenQuestion } from "./open-answers.js";
import { wordPassages } from "./word-counts.js";
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
  wordTableRequest,
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
  isSingleAnswerField,
  groupingQuestionHint,
} from "./survey-answers.js";
import { uid, filteredRows } from "./import.js";
import { importFiles } from "./import-ui.js";
import { transcriptFolder } from "./transcript-folder.js";
import { codedInterviewDownload, fileStem } from "./coded-docx.js";
import { projectReport } from "./project-report.js";
import {
  projectWordReport,
  scheduleWordReport,
} from "./project-word-report.js";
import {
  projectBackup,
  readProjectFile,
  reportFilename,
} from "./project-backup.js";
import { docxMime } from "./word-package.js";
import {
  syncProjectLog,
  startProjectLog,
  recordWork,
  recordFigure,
  describeFigure,
} from "./work-log.js";
import {
  fresh,
  verifyProject,
  switchDataset,
  reattach,
  settingsProject,
  renameTheme,
  rewriteInterviewLabelReferences,
  editInterviewLabel,
  editInterviewCategory,
} from "./project.js";
import {
  reviewParticipantLinks,
  applyParticipantLinks,
} from "./participant-links.js";
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
  readingDownloads,
  available,
  adaptChart,
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
  if (v.task === "words")
    return v.x ? "Words in " + v.x : "Words across all passages";
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
    const change = adaptChart(getData(), next);
    if (change) notice(change);
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
  preserveDownloadAcrossNavigation(project, () => {
    switchDataset(project, id, newView);
    resetTutor();
  });
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
    return !!(
      localStorage.getItem("dv-device-project-id") ||
      localStorage.getItem("dv-project")
    );
  } catch {
    return false;
  }
}
const codingSaveStatus = new WeakMap();
const lastPosition = new WeakMap();
const saveTimers = new WeakMap();
let restoringHistory = false;
let navigationNumber = 0;
function workspacePosition(p) {
  const previous = lastPosition.get(p) || {};
  if (p !== project || step === 0) return previous;
  const selections = [...pendingSelections].filter(
    ([, draft]) => JSON.stringify(draft.base) !== JSON.stringify(draft.view),
  );
  const position = {
    step,
    ...(selections.length ? { selections } : {}),
    ...(selectionConfirmed ? { selectionConfirmed: true } : {}),
  };
  lastPosition.set(p, position);
  return position;
}
function historyEntry() {
  return {
    visualiser: true,
    id: project.datasets.length ? recoveryId(project) : "",
    step,
  };
}
function markLocation(replace = false) {
  if (restoringHistory) return;
  const next = historyEntry(),
    browser = window.history,
    old = browser.state;
  if (old?.visualiser && old.id === next.id && old.step === next.step) return;
  browser[replace || !old?.visualiser ? "replaceState" : "pushState"](next, "");
}
function saveMessage(p, state) {
  if (project !== p || codingSaveStatus.get(p) !== state) return;
  document.querySelectorAll("[data-iv-storage]").forEach((el) => {
    el.textContent = state.message;
  });
  const status = get("autosave-status");
  if (status) status.textContent = state.short;
}
async function checkpointProject(p, verifyPresence = false) {
  if (!p.datasets.length) return true;
  clearTimeout(saveTimers.get(p));
  syncProjectLog(p);
  const state = {
    needsSave: true,
    short: "Saving…",
    message: "Saving project on this device…",
  };
  codingSaveStatus.set(p, state);
  saveMessage(p, state);
  try {
    const before = recoveryId(p);
    await saveRecovery(p, workspacePosition(p), verifyPresence);
    state.needsSave = false;
    state.short = "Saved on this device";
    state.message = isInterview(p.datasets.find((d) => d.id === p.active))
      ? "Coding progress saved on this device."
      : "Project saved on this device.";
    if (p === project && before !== recoveryId(p)) markLocation(true);
  } catch {
    state.short = "Autosave unavailable · download your project";
    state.message = isInterview(p.datasets.find((d) => d.id === p.active))
      ? "This browser could not save your latest changes. Download your coding project before closing or refreshing."
      : "This browser could not save your latest changes. Download your project before leaving.";
  }
  saveMessage(p, state);
  return !state.needsSave;
}
const prepareProjectDownload = downloadedContent;
function clearDownloadedShortcut(p, id) {
  try {
    if (localStorage.getItem("dv-device-project-id") === id)
      localStorage.removeItem("dv-device-project-id");
    const old = localStorage.getItem("dv-project");
    if (old) {
      const backup = verifyProject(JSON.parse(old));
      if (
        downloadedContent(projectPackage(backup)) ===
        downloadedContent(projectPackage(p))
      )
        localStorage.removeItem("dv-project");
    }
  } catch {
    /* Downloading works without a local shortcut. */
  }
}
async function afterProjectDownload(p, exported) {
  const id = recoveryId(p);
  const position = workspacePosition(p);
  try {
    // The browser owns the download dialog. Its anchor click does not tell
    // us whether the user saved the ZIP, cancelled it, or blocked it.
    await archiveDownload(p, position, exported);
  } catch {
    protectDeparture(p, position);
    if (p === project) {
      const state = {
        needsSave: true,
        short: "Autosave unavailable · check your download",
        message: "Check that the ZIP was saved before closing this project.",
      };
      codingSaveStatus.set(p, state);
      saveMessage(p, state);
      notice(state.message);
    }
    return;
  }
  const current = isDownloaded(p);
  if (current) {
    clearDownloadedShortcut(p, id);
    if (recoveryId(p) !== id) clearDownloadedShortcut(p, recoveryId(p));
  }
  if (p === project && current) {
    const state = {
      needsSave: false,
      short: "Saved on this device",
      message: "Your project is saved in this browser.",
    };
    codingSaveStatus.set(p, state);
    saveMessage(p, state);
    notice(
      "ZIP download requested. You can still resume this project on Home.",
    );
    if (step === 0 && get("coding-copies"))
      showRecentProjects(get("coding-copies"));
  }
}
const checkpointInterview = (p) => checkpointProject(p);
function scheduleSave() {
  if (!project.datasets.length || !step) return;
  const p = project;
  clearTimeout(saveTimers.get(p));
  saveTimers.set(
    p,
    setTimeout(() => checkpointProject(p), 180),
  );
}
function protectOpenProject() {
  if (!project.datasets.length) return true;
  syncProjectLog(project);
  return protectDeparture(project, workspacePosition(project));
}
window.addEventListener("beforeunload", (event) => {
  if (!protectOpenProject()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", protectOpenProject);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && project.datasets.length) checkpointProject(project);
  if (!document.hidden && step === 0 && get("coding-copies"))
    showRecentProjects(get("coding-copies"));
});
async function showRecentProjects(container) {
  const method = currentMethod(project);
  const list = container.querySelector("[data-project-list]");
  try {
    let entries = await listRecoveries({ includeBackups: !method });
    if (method) {
      const matches = await Promise.all(
        entries.map(async (entry) => {
          // Older summaries recorded the current file type, which cannot
          // distinguish coded written survey answers from an interview.
          try {
            const methods =
              entry.methods ||
              projectMethods((await loadRecovery(entry.id)).project);
            return methods.length === 1 && methods[0] === method;
          } catch {
            return false;
          }
        }),
      );
      entries = entries.filter((_, i) => matches[i]);
    }
    if (!container.isConnected) return;
    if (!entries.length) {
      if (method) container.hidden = true;
      else
        list.innerHTML =
          "<p>No projects saved here yet. When you add data, your progress will be saved automatically in this browser.</p>";
      return;
    }
    const firstWithName = new Map();
    const repeatedNames = new Set();
    for (const entry of entries) {
      if (firstWithName.has(entry.name)) repeatedNames.add(entry.name);
      else firstWithName.set(entry.name, entry.id);
    }
    list.innerHTML =
      "<p>Progress is saved automatically in this browser. Choose a project to pick up where you left off.</p>" +
      entries
        .map((entry) => {
          const attributes = 'data-copy="' + esc(entry.id) + '"';
          const coding =
            entry.methods?.[0] !== "survey" &&
            (!entry.kind || ["interview", "coding"].includes(entry.kind));
          const source =
            entry.source && entry.source !== entry.name
              ? esc(entry.source) + " · "
              : "";
          const saved = new Date(entry.saved);
          const timestamp = Number.isFinite(saved.getTime())
            ? 'Last saved <time datetime="' +
              saved.toISOString() +
              '">' +
              esc(
                saved.toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              ) +
              "</time>"
            : "Save date unavailable";
          return (
            '<div class="recent-project"' +
            (entry.hidden ? ' data-backup-requested="true"' : "") +
            "><div><strong>" +
            esc(entry.name) +
            "</strong><small>" +
            (repeatedNames.has(entry.name) &&
            firstWithName.get(entry.name) === entry.id
              ? "Most recently saved copy · "
              : "") +
            (entry.methods?.length === 1
              ? methodLabels[entry.methods[0]] + " · "
              : "") +
            source +
            timestamp +
            (entry.hidden ? " · Backup requested" : "") +
            '</small></div><div class="bar">' +
            b(
              "recoverCoding",
              coding ? "Resume coding project" : "Resume project",
              "",
              attributes,
            ) +
            (project.datasets.length && recoveryId(project) === entry.id
              ? ""
              : b(
                  "removeCodingCopy",
                  "Remove recovery copy",
                  "plain",
                  attributes,
                )) +
            "</div></div>"
          );
        })
        .join("");
    container.hidden = false;
  } catch {
    if (container.isConnected) {
      list.innerHTML =
        "<p>Browser storage is unavailable. Download a project copy and check that the file was saved before leaving this device.</p>";
      container.hidden = false;
    }
  }
}
async function checkpointBeforeSwitch() {
  if (!project.datasets.length) return true;
  if (await checkpointProject(project, true)) return true;
  return !!(await askForm(
    "Keep a copy before leaving",
    "<p>This browser could not autosave your latest changes. Download the ZIP and check that it is in your downloads before leaving this project.</p>" +
      b("download", "Download project with data"),
    () => true,
    "I have a saved copy — continue",
  ));
}
function home() {
  bot = false;
  setProject(fresh());
}
async function restoreLocation(route) {
  const sequence = ++navigationNumber;
  if (!(await checkpointBeforeSwitch()) || sequence !== navigationNumber) {
    if (sequence === navigationNumber) markLocation(true);
    return;
  }
  let saved;
  try {
    if (
      route?.id &&
      (!project.datasets.length || route.id !== recoveryId(project))
    )
      saved = await loadRecovery(route.id);
    if (sequence !== navigationNumber) return;
    restoringHistory = true;
    if (get("dialog").open) get("dialog").close();
    if (!route?.id) home();
    else if (saved) setProject(saved.project, saved, route.step);
    else goto(route.step);
  } catch (err) {
    notice(err.message);
  } finally {
    if (sequence === navigationNumber) {
      restoringHistory = false;
      markLocation(true);
    }
  }
}
window.addEventListener("popstate", (e) => {
  if (get("dialog").open) {
    markLocation();
    notice(
      "Your form is still open. Apply your changes or close it before going back.",
    );
    return;
  }
  restoreLocation(e.state);
});
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
  const labels = (entries) => {
    const categories = new Set(entries.map((e) => e.category).filter(Boolean));
    if (categories.size)
      return (
        entries.length +
        " labels · " +
        categories.size +
        (categories.size === 1 ? " category" : " categories")
      );
    return entries
      .filter((e) => e.label.trim())
      .map((e) => esc(e.label))
      .join(" · ");
  };
  return `<section class="card document-codebook"><h2>Project codebook</h2>
    ${draft ? `<p><strong>Draft labels to review</strong><br>${labels(draft.entries) || "Your draft is ready to edit."}</p>` : ""}
    ${approved.length ? `<p><strong>Approved labels</strong><br>${labels(approved)}</p>` : ""}
    ${b("makeinterview", "Use the interview coding workspace")}
    <small>Review your labels, code a passage yourself or choose interviews for the bot.</small></section>`;
}
function render(figureLog) {
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
  const method = currentMethod(project);
  let content = step === 0 ? landing(!method && hasDeviceCopy(), method) : "";
  if (step !== 0 && d) {
    content = `<div class="hero"><h1>${headers[step]}</h1></div>${datasetSelect(project)}${coverageNote}`;
    if (
      method !== "survey" &&
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
      content += `<div class="bar">${b("upload", "Add files", "", 'data-route="' + (method === "text" ? "text" : method === "interview" ? "coded" : "table") + '"')}</div>${check(d)}${roleButton ? `<section class="card"><h2>Which questions help answer your research question?</h2><p>Identify the outcome, groups and possible explanations. Mark questions with written answers too.</p>${roleButton}</section>` : ""}${openRoute}<div class="bar step-actions">${b("confirm", "Confirm and explore", "primary")}</div>`;
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
        '<section class="card"><h2>Save your coding progress</h2><p>Your ZIP includes the editable project and its Word report. Reopen the ZIP to continue coding.</p><div class="bar action-row">' +
        b("download", "Download project with data", "primary") +
        b("device", "Save on this device") +
        "</div>" +
        readingDownloads(true) +
        "</section>";
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
    `<div class="shell ${compact ? "compact" : ""}"><aside class="rail">${b("home", mark + "<span>Data<br>visualiser</span>", "brand", 'aria-label="Data visualiser home" title="Home"')}<nav class="nav" aria-label="Workflow">${labels.map((s, i) => `<button title="${s}" aria-label="${s}" data-short="${shortSteps[i]}" data-act="nav" data-i="${i}" ${step === i ? 'aria-current="step"' : ""} ${(i > 0 && !d) || (i > 1 && !confirmed && !(interview && i === 4)) ? "disabled" : ""}>${icon(icons[i])}<span>${s}</span></button>${i === 0 && method ? '<div class="workflow-method">' + methodLabels[method] + "<span> project</span></div>" : ""}`).join("")}${b("bot", icon("bot") + "<span>Data bot</span>", "botnav", 'aria-label="Data bot" title="Data bot" data-short="Data bot" aria-expanded="' + bot + '"')}</nav><div class="rail-bottom">${b("compact", icon("menu") + "<span>Collapse sidebar</span>", "plain", 'aria-label="Toggle sidebar"')}<small class="app-version">0.1 beta</small></div></aside><main class="main" id="workspace"><header class="top"><div class="project-path">${d ? b("home", "Home", "plain") + " / " : ""}<span>${esc(project.name)} &nbsp; / &nbsp; ${labels[step]}</span></div>${d ? '<small id="autosave-status" role="status">' + esc(codingSaveStatus.get(project)?.short || "Saving…") + "</small>" : ""}</header><div class="content"><div class="${asideBot ? "withbot" : ""}"><div>${content}</div>${asideBot ? botBox() : ""}</div>${bot && !asideBot ? botBox() : ""}</div></main></div>`;
  if (
    previousSource &&
    previousSource === document.querySelector(".iv-paper h2")?.textContent
  ) {
    restoreReadingSelection?.();
    document.querySelector(".iv-text").scrollTop = transcriptScroll;
  }
  refreshBotActivity();
  if (step === 0) showRecentProjects(get("coding-copies"));
  else scheduleSave();
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
        draw(i, figureLog?.panel === i ? figureLog.title : "");
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
            includedInterview(d).passages.some((p) => !p.reviewed)
          ? "Some passages are unreviewed. Check coding coverage before interpreting a frequency."
          : project.mode === "hints" &&
              d.kind === "table" &&
              filteredRows(d).length < 20
            ? "Small sample: inspect the underlying counts alongside percentages."
            : "";
    if (hint) get("hint").innerHTML = `<p class="review">${esc(hint)}</p>`;
  }
  syncProjectLog(project);
  scheduleWordReport(project, reportFigure);
}
function summary(
  i,
  v = project.views[i],
  d = getData(),
  comparedViews = step === 3 || step === 4 ? project.views : [],
) {
  if (
    d.kind === "table" &&
    [v.filter, v.groupBy].some(
      (key) => key && isOpenQuestion(d.fields.find((f) => f.id === key)),
    )
  )
    throw Error(
      "The question used to group or filter this figure now contains written answers. Clear that selection or choose a closed question.",
    );
  const result = v.task === "model" ? modelSummary(d, v) : analyse(d, v);
  if (v.filter) {
    const field = d.fields?.find((f) => f.id === v.filter);
    const label = field?.label || (v.filter === "source" ? "Source" : v.filter);
    const value = filterDisplayValue(d, v, result);
    const filterNote = (display) =>
      v.value === ""
        ? " Filtered to blank answers for " + label + "."
        : field?.type === "multiple"
          ? " Filtered to records that selected “" +
            display +
            "” for " +
            label +
            "."
          : " Filtered by " + label + " = “" + display + "”.";
    if (result.legacyNote || value !== v.value)
      result.legacyNote =
        (result.legacyNote || result.note) + filterNote(v.value);
    result.note += filterNote(value);
  } else if (comparedViews.some((view) => view.filter)) {
    result.note += " No subgroup filter on this view.";
    if (result.legacyNote)
      result.legacyNote += " No subgroup filter on this view.";
  }
  if (d.rules?.length) {
    result.note += " Project exclusions apply.";
    if (result.legacyNote) result.legacyNote += " Project exclusions apply.";
  }
  return result;
}
function modelSummary(d, v) {
  const rows = filteredRows(d, v),
    m = fitModel(d, rows, { ...v, predictors: v.predictors || [] });
  const baseNote =
    m.n +
    " complete records · " +
    m.excluded +
    " excluded." +
    (m.held ? " Held at " + m.held + "." : "");
  let reference = m.reference;
  if (!m.numericalPredictor && m.predictions.length && v.figureEdits) {
    const first = m.predictor + " = " + m.predictions[0].label;
    if (reference.startsWith(first))
      reference = modelDisplayTerm(first, m, v) + reference.slice(first.length);
  }
  return {
    ...m,
    title:
      v.title ||
      m.method + " · " + d.fields.find((f) => f.id === v.outcome).label,
    x: m.predictor,
    y: m.event ? "Probability of " + m.event : "Predicted outcome",
    unit: "95% confidence interval",
    note: baseNote + (reference ? " Reference: " + reference + "." : ""),
    ...(reference !== m.reference && {
      legacyNote: baseNote + " Reference: " + m.reference + ".",
    }),
    records: [],
  };
}
function draw(i, logTitle) {
  const a = summary(i),
    v = project.views[i];
  get("graphic" + i).replaceChildren(figure(a, v, { interactive: true }));
  if (logTitle) recordFigure(project, getData(), logTitle, v, a);
  if (a.coefficients)
    get("modeldetails" + i).innerHTML =
      "<details><summary>Coefficients and model details</summary>" +
      table(
        ["Term", "Estimate", "95% lower", "95% upper"],
        a.coefficients.map((c) => [
          modelDisplayTerm(c.term, a, v),
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
  const nextGrouping = () => {
    const choices = fs.filter((f) => f.id !== v.x && isSingleAnswerField(f));
    return (
      (
        choices.find(
          (f) =>
            f.levels.length > 1 && ["category", "ordered"].includes(f.type),
        ) || choices[0]
      )?.id || ""
    );
  };
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
  if (key === "task" && v.task === "words") {
    Object.assign(v, {
      x: "",
      y: "",
      chart: "table",
      title: "",
      annotation: "",
    });
    return;
  }
  if (key === "x" && v.task === "words") {
    v.title = v.annotation = "";
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
            : nextGrouping();
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
      d.kind === "text" ? allCodes(d).find((c) => c !== v.x) : nextGrouping();
}
function goto(i, restorePosition) {
  const d = getData();
  if (i > 0 && !d) return;
  if (i > 1 && !analysisReady(d) && !(isInterview(d) && i === 4)) i = 1;
  preserveDownloadAcrossNavigation(project, () => {
    if (i === 2 || i === 3) project.figurePanels = i === 3 ? "both" : "left";
    if (i === 3 && !project.comparisonStarted) {
      const right = structuredClone(project.views[0]);
      right.chart =
        {
          bars: "dots",
          dots: "bars",
          small: "bars",
          grid: "table",
          box: right.task === "one" ? "hist" : "box",
          gap: "stack",
        }[right.chart] || right.chart;
      project.views[1] = right;
      project.comparisonStarted = true;
    }
    if (i === 3 && project.linked) {
      const { filter, value } = project.views[0];
      Object.assign(project.views[1], { filter, value });
    }
  });
  if (step && !i && d) {
    workspacePosition(project);
    checkpointProject(project).then(() => {
      if (step === 0 && get("coding-copies"))
        showRecentProjects(get("coding-copies"));
    });
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
  if (restorePosition && restorePosition.step === i) {
    for (const [index, draft] of restorePosition.selections || [])
      pendingSelections.set(index, draft);
    selectionConfirmed = !!restorePosition.selectionConfirmed;
  }
  markLocation();
  render();
  window.scrollTo(0, 0);
}
async function methodForOpening(p) {
  const available = projectMethods(p);
  const method = currentMethod(project);
  if (method && available.length && !available.includes(method))
    throw Error(
      "Return to Home to open this " +
        methodLabels[available[0]].toLowerCase() +
        " project.",
    );
  if (available.length <= 1 || method) return method || available[0] || "";
  return (
    (await askForm(
      "Choose a workspace for this older project",
      "<p>This project contains both survey and interview data. Open one method as a separate project. You can return to the original from Home to open the other method.</p>" +
        formselect(
          "legacy-method",
          "Which work would you like to open?",
          available.map((key) => [key, methodLabels[key] + " project"]),
          datasetMethod(
            p.datasets.find((d) => d.id === p.active) || p.datasets[0],
          ),
        ),
      () => val("legacy-method"),
      "Open workspace",
    )) || null
  );
}
function setProject(p, saved, target, selectedMethod) {
  pendingSelections.clear();
  selectionConfirmed = false;
  const checked = verifyProject(p);
  const methods = projectMethods(checked);
  if (methods.length > 1) {
    const active = checked.datasets.find((d) => d.id === checked.active);
    const preferred = selectedMethod || (active && datasetMethod(active));
    project = separateMethod(
      checked,
      methods.includes(preferred) ? preferred : methods[0],
    );
    // A fresh recovery identity leaves the historic combined copy intact.
    saved = undefined;
    target = undefined;
  } else project = checked;
  project.mode = readHelpMode();
  project.comparisonStarted ??=
    project.figurePanels === "both" ||
    (project.views.length === 2 &&
      JSON.stringify(project.views[0]) !== JSON.stringify(project.views[1]));
  undoViews = [];
  const choices = workingDatasets(project);
  if (choices.length && !choices.some((d) => d.id === project.active))
    activate(choices[0].id);
  if (getData() && project.views.length !== 2) activate(project.active);
  resetTutor();
  startProjectLog(project, (dataset, view, index, views) =>
    summary(index, view, dataset, views),
  );
  if (saved) {
    lastPosition.set(project, saved.workspace);
    resumeRecovery(project, saved.entry, saved.workspace);
  }
  goto(
    target ??
      saved?.workspace?.step ??
      (getData()
        ? project.confirmed.includes(project.active)
          ? project.figurePanels === "both"
            ? 3
            : 2
          : 1
        : 0),
    saved?.workspace,
  );
}
async function openProjectFile(file) {
  const saved = verifyProject(await readProjectFile(file));
  const method = await methodForOpening(saved);
  if (method === null) return;
  const restored = saved.settingsOnly
    ? reattach(
        projectMethods(saved).length > 1
          ? separateMethod(saved, method)
          : saved,
        project.datasets,
      )
    : saved;
  if (
    !saved.settingsOnly &&
    project.datasets.length &&
    !(await askForm(
      "Switch projects?",
      "<p>Your current project will stay under Projects on this device on Home.</p>",
      () => true,
      "Open saved project",
    ))
  )
    return;
  if (!(await checkpointBeforeSwitch())) return;
  setProject(restored, undefined, undefined, method);
  notice("Opened " + project.name + ".");
}
function chooseFiles(accept, multiple, handler, folder = false) {
  const p = get("picker");
  p.value = "";
  p.accept = accept;
  p.toggleAttribute("webkitdirectory", folder);
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
async function confirmTranscriptFolder(files, chooseFormat) {
  const folder = transcriptFolder(files);
  const format = await askForm(
    "Import a transcript folder",
    "<p>" +
      folder.files.length +
      (folder.files.length === 1
        ? " transcript file in “"
        : " transcript files in “") +
      esc(folder.name) +
      "”. Each filename identifies an interview.</p>" +
      (folder.skipped
        ? "<p>" +
          folder.skipped +
          (folder.skipped === 1
            ? " other file will be skipped.</p>"
            : " other files will be skipped.</p>")
        : "") +
      "<details><summary>Files to import</summary><ul>" +
      folder.files.map((f) => "<li>" + esc(f.name) + "</li>").join("") +
      "</ul></details>" +
      (chooseFormat
        ? formselect(
            "folder-format",
            "How are these interviews coded?",
            [
              ["text", "They are uncoded"],
              ["coded", "They already have labels"],
            ],
            "text",
          )
        : ""),
    () => (chooseFormat ? val("folder-format") : "confirmed"),
    "Import transcripts",
  );
  return format ? { ...folder, format } : null;
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
  const d = includedInterview(getData());
  if (d?.kind !== "text" || (!chosen.size && !scope.length)) return [];
  const named = d.passages.filter(
    (p) => chosen.has(p.id) && !scope.includes(p.source),
  );
  const sources = new Set([...scope, ...named.map((p) => p.source)]);
  const units = passageUnits(d.passages.filter((p) => sources.has(p.source)));
  // Selecting an original shares the codes shown on its evidence row.
  // Selecting its quotation shares just those words and their own codes.
  const selectedUnits = new Map(
    units.filter((p) => chosen.has(p.id)).map((p) => [p.id, p]),
  );
  return [
    ...named.map((p) => selectedUnits.get(p.id) || p),
    ...units.filter((p) => scope.includes(p.source)),
  ];
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
            singleNumber: ["hist", "box"],
            numericByCategory:
              "box with x=numeric answer and y=single-answer grouping field",
            twoGroupPercentages:
              "gap with task=group for two groups with valid answers",
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
          wordFrequencies: {
            task: "words",
            chart: "table",
            x: "Empty for all passages, or one exact theme",
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
  if (text && pick.task === "words") {
    if (pick.chart !== "table" || (pick.x && !keys.includes(pick.x)) || pick.y)
      return null;
    const scoped = {};
    if (pick.filter !== undefined) {
      if (pick.filter === "source" && d.sources.includes(pick.value))
        Object.assign(scoped, { filter: "source", value: pick.value });
      else if (pick.filter === "" && !pick.value)
        Object.assign(scoped, { filter: "", value: "" });
      else return null;
    }
    return candidate({
      ...current,
      ...scoped,
      task: "words",
      chart: pick.chart,
      x: pick.x || "",
      y: "",
      title: "",
      annotation: "",
    });
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
  if (!text && paired) {
    const grouping = d.fields.find((f) => f.id === pick.y);
    if (!isSingleAnswerField(grouping))
      throw Error(groupingQuestionHint(grouping));
  }
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
  recordFigure(
    project,
    getData(),
    "Created a visual with the Data bot",
    candidate.view,
    chart,
  );
  let linkedMessage = "";
  if (step === 3 && project.linked && candidate.view.task === "words") {
    const other = project.views[1 - candidate.panel];
    if (
      (other.filter || "") !== (candidate.view.filter || "") ||
      (candidate.view.filter && other.value !== candidate.view.value)
    ) {
      Object.assign(other, {
        filter: candidate.view.filter,
        value: candidate.view.value,
      });
      pendingSelections.delete(1 - candidate.panel);
      linkedMessage = " Both views use this filter because Link filters is on.";
    }
  }
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
      linkedMessage +
      (candidate.groupSuggestion ? "" : groupInsight) +
      (typeof explanation === "string" ? " " + explanation : ""),
  });
  render();
  get("graphic" + candidate.panel)?.scrollIntoView({ block: "nearest" });
}
async function unlockBot(code, stillCurrent = () => true) {
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
  if (!stillCurrent()) return false;
  sessionStorage.setItem("dv-session", json.token);
  return true;
}

async function ensureBotAccess(title) {
  if (!botURL)
    throw Error("The workshop tutor service has not been connected.");
  if (botSession()) return true;
  const owner = project,
    dataset = getData();
  const allowed = await confirmTaskAccess(title, (code, stillOpen) =>
    withBotActivity("Checking your course code…", () =>
      unlockBot(code, stillOpen),
    ),
  );
  if (!allowed || owner !== project || dataset !== getData()) return false;
  if (bot) render();
  return true;
}

async function requestTutor(payload) {
  if (payload.skill === "coding")
    payload = { ...payload, context: codingRequestContext(payload.context) };
  const session = botSession();
  if (!session)
    throw Error(
      "Your session has expired. Choose the bot action again to confirm your course code.",
    );
  const res = await fetch(botURL + "/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + session,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && botSession() === session)
      sessionStorage.removeItem("dv-session");
    throw Error(data.error || "Tutor unavailable.");
  }
  return data.answer;
}
async function extractCodebook(document) {
  return withBotActivity(
    "Reading labels and categories from your codebook…",
    () => extractCodebookEntries(document, requestTutor),
  );
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
      const included = includedInterview(d);
      const dataset =
        d.kind === "text"
          ? {
              kind: d.kind,
              sources: included.sources,
              metadata: d.metadata,
              openAnswers: !!d.openAnswers,
              ...(d.interviews?.established
                ? {
                    interviews: { established: true },
                    coding: {
                      book: approvedBook(d).map((entry) => entry.label),
                    },
                  }
                : {}),
              passages: passageUnits(included.passages).map(
                ({ source, codes, reviewed }) => ({
                  source,
                  codes,
                  reviewed,
                }),
              ),
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
          const adapted = changes
            .filter((v) => v.chart === "gap")
            .map((v) => adaptChart(dataset, v))
            .find(Boolean);
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
          if (adapted) message += " " + adapted;
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
    dataset &&
    (wordTableRequest(
      question,
      current,
      dataset.kind === "text" ? allCodes(dataset) : [],
      dataset.sources,
    ) ||
      (dataset.kind === "table" &&
        (namedSurveyComparison(dataset.fields, question) ||
          directComparison(dataset.fields, question))));
  if (direct?.chart === "gap" && !proposedChart(direct))
    direct = {
      action: "answer",
      explanation:
        "A gap chart needs two groups with answers to both questions in this selection. Try a grouped bar chart to compare more groups, or change the selection.",
    };
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
function reportFigure(dataset, view, index, views) {
  return describeFigure(summary(index, view, dataset, views), view);
}
async function downloadProjectBackup(owner) {
  syncProjectLog(owner);
  const report = projectWordReport(owner, reportFigure);
  const downloadedState = prepareProjectDownload(owner);
  const { blob, name } = projectBackup(projectPackage(owner), report);
  blobSave(blob, name);
  await afterProjectDownload(owner, downloadedState);
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
    if (!tables.length) {
      if (isInterview(d))
        return action("upload", {
          dataset: { route: "participant-information" },
        });
      throw Error("Add the related table on Upload first.");
    }
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
    const savedLink = d.participantLinks?.tables.find(
      (link) => link.id === t.id,
    );
    const key = await askForm(
      "Choose a unique identifier",
      formselect(
        "key",
        "Identifier column",
        t.fields.map((f) => [f.id, f.label]),
        savedLink?.key,
      ),
      () => val("key"),
    );
    if (!key) return;
    const { identifiers, matches, previousValues } = reviewParticipantLinks(
      d,
      t,
      key,
    );
    modal(
      "Review source matches",
      `<p>Choose Unmatched to remove this table’s information from an interview. You can still explore its passages.</p>` +
        d.sources
          .map((s, i) =>
            formselect(
              "map" + i,
              s,
              [["", "Unmatched"], ...identifiers],
              matches[s],
            ),
          )
          .join("") +
        (previousValues.length
          ? "<details open><summary>Check existing values from an older project</summary><p>Tick the values that came from this table. Matching values are ticked for you. Leave independently entered values unticked to keep them after unlinking.</p>" +
            previousValues
              .map(
                ({ source, field, value, suggested }, i) =>
                  `<label class="tick"><input type="checkbox" id="old-link-${i}" ${suggested ? "checked" : ""}> ${esc(source)} · ${esc(field)} · ${esc(value)}</label>`,
              )
              .join("") +
            "</details>"
          : ""),
      () => {
        const m = Object.fromEntries(
          d.sources.map((s, i) => [s, val("map" + i)]),
        );
        const count = applyParticipantLinks(
          d,
          t,
          key,
          m,
          previousValues.filter((_, i) => get("old-link-" + i).checked),
          tables.map((table) => table.id),
        );
        render();
        notice(count + " sources linked.");
      },
    );
    return;
  }
}
function patternEvidence(i, index) {
  const d = includedInterview(getData()),
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
    passages = passageUnits(d.passages.filter((p) => set.has(p.source)));
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
      (v.themeUnit === "passages"
        ? included.length +
          " of " +
          passages.length +
          " original passages contained this theme."
        : interviews.size +
          " of " +
          sources.length +
          (d.openAnswers
            ? " respondents mentioned this theme."
            : " interviews contained this theme.")) +
      "</p>";
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
  const candidates =
    codingPrompt && (chosen.size || scope.length)
      ? selectedPassages()
      : passageUnits(includedInterview(d).passages);
  const ps = candidates.filter(
    (p) =>
      (!v.filter ||
        (v.filter === "source"
          ? p.source
          : d.metadata?.[p.source]?.[v.filter]) === v.value) &&
      (!match || (p.source === match.source && p.codes.includes(match.code))) &&
      (v.chart !== "excerpts" ||
        !v.query ||
        p.text.toLowerCase().includes(v.query.toLowerCase())),
  );
  let highlightedQuote,
    page = 0,
    query = "";
  const selected = new Set(
    codingPrompt ? ps.slice(0, 10).map((p) => p.id) : [],
  );
  function list() {
    const filtered = ps.filter(
      (p) => !query || p.text.toLowerCase().includes(query),
    );
    const visible = filtered.slice(page * 25, (page + 1) * 25);
    if (
      highlightedQuote &&
      !page &&
      (!query || highlightedQuote.text.toLowerCase().includes(query))
    )
      visible.unshift(highlightedQuote);
    return (
      `<p>${filtered.length} matching passages</p>` +
      visible
        .map(
          (p) =>
            `<div class="excerpt"><label class="tick"><input name="pickp" type="checkbox" value="${p.id}" ${selected.has(p.id) ? "checked" : ""}>${p === highlightedQuote ? "Selected quotation · " : ""}${esc(p.source)}</label><span data-passage-text="${p.id}">${esc(p.text)}</span><br><small>${esc(p.codes.join(" · "))}</small></div>`,
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
        : currentMethod(project) === "survey"
          ? ""
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
          ? d.passages.find((p) => selected.has(p.id))
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
      const row = document.querySelector(".iv-text .iv-selected");
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
    }
    highlightedQuote = ps.some((item) => item.id === p.id) ? undefined : p;
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
      currentMethod(project) !== "survey" &&
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
    ensureBotAccess,
    (changes) => rewriteInterviewLabelReferences(owner, d, changes, undoViews),
  );
  syncPassageLabels();
  const applyBook = get("apply-book-interviews");
  if (applyBook) {
    applyBook.onclick = async () => {
      if (
        getData() !== d ||
        currentMethod(project) === "survey" ||
        !d.coding?.book?.length
      )
        return;
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
    remapPreviousLabels: (changes) =>
      rewriteInterviewLabelReferences(owner, d, changes, undoViews),
    status: () => codingSaveStatus.get(owner)?.message || "",
    render,
    focus: () => project.researchFocus,
    changeLabel: (change) => changeInterviewLabel(d, change),
    changeCategory: (old, name) => {
      if (getData() !== d)
        throw Error(
          "Open this interview collection again to edit its categories.",
        );
      editInterviewCategory(project, d, old, name, undoViews);
      suggestions = [];
      proposal = captionDraft = queuedShortcut = null;
      pendingSelections.clear();
    },
    extract: extractCodebook,
    ensureAccess: ensureBotAccess,
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
            ["folder-text", "A folder of uncoded transcripts"],
            ["folder-coded", "A folder of transcripts with existing labels"],
          ],
          "text",
        ),
        () => val("iv-format"),
        "Choose files",
      );
      if (!route) return;
      chooseFiles(
        ".txt,.docx,.csv,.tsv,.xlsx",
        true,
        async (files) => {
          const folder = route.startsWith("folder-")
            ? await confirmTranscriptFolder(files, false)
            : null;
          if (getData() !== d || (route.startsWith("folder-") && !folder))
            return;
          const sets = await importFiles(
            folder?.files || files,
            route.replace(/^folder-/, ""),
          );
          if (!sets || getData() !== d) return;
          appendInterviews(d, sets);
          checkpoint();
          resetTutor();
          goto(1);
        },
        route.startsWith("folder-"),
      );
    },
  });
}
async function action(act, el) {
  const d = getData(),
    i = Number(el.dataset.i || 0);
  if (act === "makeinterview") {
    if (currentMethod(project) === "survey")
      throw Error("These written answers belong to your survey.");
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
          ? (context) =>
              withBotActivity("Suggesting question roles…", async () => {
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
        ensureBotAccess,
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
      render({
        panel: i,
        title: "Confirmed the questions or themes for a visual",
      });
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
        `<label>Visual name<input id="visual-name" required maxlength="180" value="${esc((view.title || viewName(d, view)).slice(0, 180))}"></label><p>Open this visual again under Save and export. Project changes are saved automatically in this browser.</p><label class="tick"><input id="visual-svg" type="checkbox">Also download this visual as an SVG image</label>`,
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
          recordFigure(project, d, "Saved a visual", view, result, name);
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
    case "home":
      if (await checkpointBeforeSwitch()) home();
      return;
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
    case "editfigure": {
      const view = project.views[i];
      editFigure(summary(i, { ...view, title: "" }), view, (draft) => {
        snapshotViews();
        Object.assign(view, draft);
        render({ panel: i, title: "Edited a visual" });
        document
          .querySelector(`[data-panel="${i}"] [data-act="editfigure"]`)
          ?.focus();
      });
      return;
    }
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
      render({ panel: i, title: "Changed the chart type" });
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
      const uploadProject = project;
      let route = el.dataset.route;
      const method = currentMethod(project);
      if (!canImport(method, route))
        throw Error(
          "Return to Home to start a project with a different method.",
        );
      const folderMode = route === "interview-folder";
      chooseFiles(
        ["survey", "table", "participant-information"].includes(route)
          ? ".csv,.tsv,.xlsx"
          : ".docx,.txt,.csv,.tsv,.xlsx",
        true,
        async (files) => {
          const folder = folderMode
            ? await confirmTranscriptFolder(files, true)
            : null;
          if (project !== uploadProject || (folderMode && !folder)) return;
          if (folder) {
            files = folder.files;
            route = folder.format === "coded" ? "coded" : "interview";
          }
          let datasets = await importFiles(
            files,
            route === "interview"
              ? "text"
              : route === "participant-information"
                ? "table"
                : route,
          );
          if (!datasets?.length || project !== uploadProject || getData() !== d)
            return;
          if (!canImport(currentMethod(project), route))
            throw Error(
              "The open project changed. Choose the files again in the intended project.",
            );
          if (route === "participant-information") {
            if (!isInterview(d) || getData() !== d) return;
            // A newly imported table cannot have supplied an older project's
            // existing values. Only tables already in that file can have done so.
            d.participantLinks ??= {
              tables: [],
              legacyTables: project.datasets
                .filter((d) => d.kind === "table")
                .map((d) => d.id),
            };
            for (const t of datasets) t.purpose = "participant-information";
            project.datasets.push(...datasets);
            goto(1);
            await reviewAction("link", d);
            return;
          }
          if (["interview", "coded"].includes(route) && isInterview(d)) {
            appendInterviews(d, datasets);
            resetTutor();
            goto(1);
            return;
          }
          if (["interview", "coded"].includes(route)) {
            if (datasets.length > 1)
              appendInterviews(datasets[0], datasets.slice(1));
            datasets = [datasets[0]];
            if (folder) datasets[0].name = folder.name;
            interviews(datasets[0]).source = datasets[0].sources[0];
          } else if (route === "text")
            for (const set of datasets) set.textPurpose = "documents";
          project.datasets.push(...datasets);
          if (project.name === "Untitled project")
            project.name =
              folder?.name || files[0].name.replace(/\.[^.]+$/, "");
          activate(datasets[0].id);
          goto(1);
        },
        folderMode,
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
      recordWork(project, d, "Accepted a figure caption", [
        viewName(d, project.views[draft.panel]),
        "Caption: " + draft.text,
      ]);
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
          const details = [];
          for (const [panel, view] of project.views.entries()) {
            try {
              const analysis = summary(panel, view);
              details.push(
                (panel ? "Right: " : "Left: ") + analysis.title,
                ...describeFigure(analysis, view),
              );
            } catch {
              details.push(
                (panel ? "Right" : "Left") +
                  " panel had no displayable result.",
              );
            }
            if (view.annotation) details.push("Caption: " + view.annotation);
          }
          if (val("compnote").trim())
            details.push("Student interpretation: " + val("compnote").trim());
          recordWork(project, d, "Saved comparison " + name, details);
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
    case "device": {
      keepInRecents(project);
      // Point the explicit device shortcut at the live autosave so it cannot
      // silently reopen an older snapshot after subsequent edits.
      try {
        // A refresh can follow the click before the IndexedDB transaction finishes.
        localStorage.setItem("dv-device-project-id", recoveryId(project));
      } catch {
        /* Recent projects also works without the shortcut. */
      }
      const owner = project;
      const stored = await checkpointProject(owner);
      if (isDownloaded(owner)) return;
      try {
        if (stored)
          localStorage.setItem("dv-device-project-id", recoveryId(owner));
        else {
          localStorage.setItem(
            "dv-project",
            JSON.stringify(projectPackage(owner)),
          );
          localStorage.removeItem("dv-device-project-id");
        }
      } catch {
        if (!stored)
          throw Error(
            "This browser could not store the project. Download your project to keep your work.",
          );
      }
      notice(
        stored
          ? "Saved under Projects on this device on Home."
          : "A copy was saved in this browser.",
      );
      return;
    }
    case "removeCodingCopy":
      if (
        await askForm(
          "Remove this recovery copy?",
          "<p>This deletes the saved copy from this browser. Any ZIP files you have downloaded stay on your device.</p>",
          () => true,
          "Remove copy",
        )
      ) {
        await removeRecovery(el.dataset.copy);
        try {
          if (localStorage.getItem("dv-device-project-id") === el.dataset.copy)
            localStorage.removeItem("dv-device-project-id");
        } catch {
          /* Recent projects still works without this shortcut. */
        }
        render();
      }
      return;
    case "recoverCoding": {
      const saved = await loadRecovery(el.dataset.copy);
      const method = await methodForOpening(saved.project);
      if (method === null) return;
      if (
        project.datasets.length &&
        !(await askForm(
          "Switch projects?",
          "<p>Your current project will stay under Projects on this device on Home.</p>",
          () => true,
          method === "interview" ||
            (saved.entry.kind === "coding" && method !== "survey")
            ? "Resume coding project"
            : "Resume project",
        ))
      )
        return;
      if (!(await checkpointBeforeSwitch())) return;
      setProject(saved.project, saved, undefined, method);
      return;
    }
    case "deviceOpen":
      if (
        project.datasets.length &&
        !(await askForm(
          "Switch projects?",
          "<p>Your current project will stay under Projects on this device on Home.</p>",
          () => true,
          "Resume saved copy",
        ))
      )
        return;
      if (!(await checkpointBeforeSwitch())) return;
      {
        const id = localStorage.getItem("dv-device-project-id");
        if (id) {
          const saved = await loadRecovery(id);
          const p = saved.project;
          const target = p.confirmed.includes(p.active)
            ? p.figurePanels === "both"
              ? 3
              : 2
            : 1;
          const method = await methodForOpening(p);
          if (method !== null) setProject(p, saved, target, method);
        } else {
          const p = verifyProject(
            JSON.parse(localStorage.getItem("dv-project")),
          );
          const method = await methodForOpening(p);
          if (method !== null) setProject(p, undefined, undefined, method);
        }
      }
      return;
    case "download":
      return downloadProjectBackup(project);
    case "settings":
      download(settingsProject(project), "visualiser-settings.json");
      return;
    case "open":
      chooseFiles(".zip,.json", false, ([file]) => openProjectFile(file));
      return;
    case "worklog": {
      const entries = syncProjectLog(project);
      const list = entries
        .slice()
        .reverse()
        .map(
          (e) =>
            "<li><strong>" +
            esc(e.title) +
            "</strong><small> · " +
            esc(new Date(e.at).toLocaleString()) +
            (e.source ? " · " + esc(e.source) : "") +
            "</small>" +
            e.details.map((s) => "<p>" + esc(s) + "</p>").join("") +
            "</li>",
        )
        .join("");
      modal(
        "Project log",
        b("logfinding", "Add a finding or note") + "<ol>" + list + "</ol>",
      );
      return;
    }
    case "logfinding":
      modal(
        "Add a finding or note",
        '<label>What did you observe?<textarea id="finding-text" maxlength="4000" required></textarea></label><p>Give the question or theme and the evidence behind your interpretation.</p>',
        () => {
          const finding = val("finding-text").trim();
          if (!finding) throw Error("Write a finding or note first.");
          recordWork(project, d, "Student finding or note", [finding]);
          render();
          action("worklog", el);
        },
        "Save finding",
      );
      return;
    case "wordreport":
      syncProjectLog(project);
      blobSave(
        new Blob([projectWordReport(project, reportFigure)], {
          type: docxMime,
        }),
        reportFilename(project),
      );
      return;
    case "report": {
      syncProjectLog(project);
      const html = projectReport(project, (dataset, v, i, views) =>
        new XMLSerializer().serializeToString(
          figure(summary(i, v, dataset, views), v, { width: 760 }),
        ),
      );
      blobSave(
        new Blob([html], { type: "text/html;charset=utf-8" }),
        fileStem(project.name) + " - report.html",
      );
      return;
    }
    case "codedword": {
      if (!isInterview(d)) return;
      const one = d.sources.length === 1;
      const choice = await askForm(
        "Download coded interviews",
        "<p>Each Word document contains the transcript, its coloured labels and a legend. Share the project download to continue coding together on another device.</p>" +
          (one
            ? "<p>" + esc(d.sources[0]) + "</p>"
            : formselect(
                "word-interviews",
                "Which interviews?",
                [
                  ["all", "All interviews together (.zip)"],
                  ...d.sources.map((source, i) => [String(i), source]),
                ],
                String(Math.max(0, d.sources.indexOf(d.interviews?.source))),
              )),
        () =>
          one
            ? [d.sources[0]]
            : val("word-interviews") === "all"
              ? [...d.sources]
              : [d.sources[Number(val("word-interviews"))]],
        "Download",
      );
      if (!choice || getData() !== d) return;
      const { name, blob } = codedInterviewDownload(d, choice);
      blobSave(blob, name);
      return;
    }
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
    const word = e.target.closest("[data-counted-word]");
    if (word?.closest("[data-panel]")) {
      const index = Number(word.closest("[data-panel]").dataset.panel);
      const term = word.dataset.countedWord;
      const rows = wordPassages(getData(), project.views[index], term);
      modal(
        "Passages containing “" + term + "”",
        "<p>" +
          rows.length +
          " matching " +
          (rows.length === 1 ? "passage" : "passages") +
          ". " +
          (rows.length > 200 ? "Showing the first 200." : "") +
          "</p>" +
          table(
            ["Source", "Passage"],
            rows.slice(0, 200).map((p) => [p.source, p.text]),
          ),
      );
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
      e.target.hasAttribute("data-code") ||
      e.target.hasAttribute("data-counted-word"))
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
    scheduleSave();
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
    render(
      draft
        ? undefined
        : { panel: i, title: "Explored a selection of questions or themes" },
    );
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
  const presentationOnly = [
    "style",
    "palette",
    "highlight",
    "annotation",
    "title",
  ].includes(t.dataset.key);
  render(
    draft || presentationOnly
      ? undefined
      : { panel: i, title: "Explored a visual" },
  );
  if (["task", "patternMode"].includes(t.dataset.key))
    document
      .querySelector(`[data-panel="${i}"] select[data-key="${t.dataset.key}"]`)
      ?.focus({ preventScroll: true });
});
resetTutor();
const initialRoute = window.history.state;
if (
  initialRoute?.id &&
  performance.getEntriesByType("navigation")[0]?.type === "back_forward"
) {
  render();
  restoreLocation(initialRoute);
} else {
  markLocation(true);
  render();
}
