import { button, askForm } from "./ui.js";

const modes = [
  [
    "hints",
    "Contextual hints",
    "See a suggestion that fits the data or task you have open. Choose it when it helps.",
  ],
  [
    "request",
    "Help on request",
    "Keep the chat quiet until you ask a question or choose a tool.",
  ],
  [
    "guided",
    "Guided exploration",
    "See one next step for your current task. The bot can guide you further when you reply.",
  ],
];
const valid = (value) => modes.some(([id]) => value === id);
const prefKey = "dv-help-mode";
let temporaryMode = "hints";

export function readHelpMode() {
  try {
    const value = localStorage.getItem(prefKey);
    if (valid(value)) return value;
  } catch {
    // A session can still use its chosen help level without local storage.
  }
  return temporaryMode;
}

export function saveHelpMode(mode) {
  if (!valid(mode)) return;
  temporaryMode = mode;
  try {
    localStorage.setItem(prefKey, mode);
  } catch {
    // Keep the change for this tab.
  }
}

export function helpSettings() {
  return button("bothelp", "Help settings", "plain");
}

export async function chooseHelpMode(current) {
  const buttons = modes
    .map(
      ([id, label]) =>
        `<div class="bot-help-option"><label><input type="radio" name="bot-help-mode" value="${id}" aria-describedby="help-mode-${id}" ${id === current ? "checked" : ""}>${label}</label><button type="button" class="help-about" aria-label="About ${label}" aria-controls="help-mode-${id}">?</button></div>`,
    )
    .join("");
  const tips = modes
    .map(
      ([id, , text]) =>
        `<span role="tooltip" id="help-mode-${id}" data-visible="${id === current}">${text}</span>`,
    )
    .join("");
  const pending = askForm(
    "Help settings",
    '<fieldset class="bot-help-options"><legend>How would you like help?</legend>' +
      buttons +
      '<div class="bot-help-descriptions">' +
      tips +
      "</div></fieldset>",
    () => document.querySelector('input[name="bot-help-mode"]:checked')?.value,
    "Save settings",
  );
  const form = document.getElementById("modalform");
  const show = (id) => {
    for (const tip of form.querySelectorAll('[role="tooltip"]'))
      tip.dataset.visible = String(tip.id === "help-mode-" + id);
  };
  for (const row of form.querySelectorAll(".bot-help-option")) {
    const input = row.querySelector("input");
    row.onpointerenter = () => show(input.value);
    row.addEventListener("focusin", () => show(input.value));
    row.querySelector(".help-about").onclick = () => show(input.value);
  }
  return pending;
}

function suggestion(mode, { step, dataset: d, view, both }) {
  if (!d || step === 0) return ["botfilehelp", "Which file should I open?"];
  if (step === 4)
    return ["botsavehelp", "How can I return to this project later?"];
  if (step === 1) {
    const iv = d.interviews;
    if (!iv)
      return d.kind === "table"
        ? ["variables", "Check the roles of my questions"]
        : ["bottexthelp", "What should I check in my text?"];
    if (iv.draft)
      return iv.draft.next === iv.draft.total
        ? ["iv-review", "Check the suggested labels"]
        : iv.draft.error
          ? ["iv-resume", "Continue from the unfinished coding batch"]
          : null;
    if (iv.done?.length === d.sources.length)
      return ["iv-finish", "Explore the reviewed interviews"];
    if (iv.established && !iv.done?.includes(iv.source))
      return ["iv-auto", "Match this interview to my codebook"];
    if (iv.method === "book")
      return ["iv-book", "Choose a codebook for this interview"];
    if (iv.method === "inductive")
      return ["iv-sample", "Choose passages to look for themes"];
    return ["bottexthelp", "How can I start checking these passages?"];
  }
  if (both) return ["askboth", "What changes between these views?"];
  if (mode === "guided") return ["askview", "Walk me through this figure"];
  if (view?.task === "one" && d.kind === "table")
    return ["choose", "How else could I show these answers?"];
  return [
    "askview",
    d.kind === "text"
      ? "What do these theme counts show?"
      : "What stands out in this selection?",
  ];
}

export function helpSuggestion(mode, context) {
  if (mode === "request") return "";
  const selected = suggestion(mode, context);
  if (!selected) return "";
  const [action, label] = selected;
  return (
    '<div class="bot-hint"><span>' +
    (mode === "guided" ? "Next step" : "Try this") +
    "</span>" +
    button(
      "bothintsuggestion",
      label,
      "plain",
      `data-next="${action}" data-i="${context.panel === 1 ? 1 : 0}"`,
    ) +
    "</div>"
  );
}
