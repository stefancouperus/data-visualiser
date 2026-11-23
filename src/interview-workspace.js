import { codingSelection } from "./coding-passages.js";
import { transcriptIndex } from "./transcript-index.js";
import {
  labelAppearance,
  rememberLabelAppearance,
} from "./label-appearance.js";
import { esc } from "./chart.js";
import { botSession } from "./bot-access.js";
import {
  bindSampleLabelEditor,
  reviewVocabulary,
  sampleLabelEditor,
  sampleLabels,
} from "./inductive-review.js";
import {
  applyCodingBatch,
  approvedBook,
  labelKey,
  checkedCollectedSuggestions,
  codingLimits,
  discoveryLimit,
} from "./coding.js";
import { codingControls, bindCodingControls } from "./codebook-ui.js";
import {
  chip,
  transcriptRows,
  transcriptOrdinals,
  manageLabels,
  manageCategories,
  editPassageLabels,
} from "./interview-manual.js";
import {
  askForm,
  busyIndicator,
  button as b,
  formselect,
  get,
  modal,
  notice,
  val,
} from "./ui.js";
import {
  interviews,
  sharedBook,
  pruneEmptyQuotations,
  establish,
  finishInterview,
  balancedSample,
  interviewBatches,
  reviewedMatches,
  coveredByQuotation,
  draftGuide,
} from "./interviews.js";

const jobs = new WeakMap();
export function interviewActivity(d) {
  const job = jobs.get(d);
  if (!job || job.draft !== d.interviews?.draft) return "";
  const { draft } = job;
  if (draft.next >= draft.total) return "Saving your coding draft…";
  if (job.stop) return "Finishing this batch before pausing…";
  const action = draft.sample ? "Suggesting labels" : "Applying your labels";
  return action + " · batch " + (draft.next + 1) + " of " + draft.total;
}

function labelList(d, entries, className = "iv-legend") {
  const styles = labelAppearance(d, entries);
  return (
    '<div class="' +
    className +
    '">' +
    entries
      .map(
        (entry) =>
          "<div>" +
          chip(entry.label, styles) +
          (styles.get(labelKey(entry.label))?.category
            ? "<small>" +
              esc(styles.get(labelKey(entry.label)).category) +
              "</small>"
            : "") +
          (entry.definition
            ? "<small>" + esc(entry.definition) + "</small>"
            : "") +
          "</div>",
      )
      .join("") +
    "</div>"
  );
}

function codebookSetup(d, state, labels, sampleReview) {
  const draft = d.coding?.bookDraft;
  const approved = state.established ? approvedBook(d) : [];
  const disabled = state.draft ? "disabled" : "";
  let setup = "";
  if (sampleReview) setup = sampleReview;
  else if (draft) {
    const named = draft.entries.filter((entry) => entry.label.trim());
    setup =
      '<section class="iv-book-draft"><h3>Draft labels to review</h3>' +
      (draft.name ? "<small>" + esc(draft.name) + "</small>" : "") +
      (named.length
        ? labelList(d, named, "iv-legend iv-draft-legend")
        : "<p>Add a label or check the source in the editor.</p>") +
      b("iv-reviewbook", "Review draft labels", "primary", disabled) +
      "</section>";
  } else {
    setup =
      '<div class="iv-stage-actions">' +
      (approved.length
        ? b("iv-editbook", "Manage labels") +
          b("iv-categories", "Manage categories", "plain")
        : b("iv-enterbook", "Enter labels manually", "", disabled)) +
      b("iv-book", "Extract labels from a codebook", "", disabled) +
      (!approved.length && !state.draft
        ? b("iv-sample", "Develop labels from passages (inductive)")
        : "") +
      "</div>";
  }
  let list = "";
  if (labels.length) {
    const keys = new Set(approved.map((entry) => labelKey(entry.label)));
    const earlier = approved.length
      ? labels.filter((entry) => !keys.has(labelKey(entry.label)))
      : [];
    list =
      '<div class="iv-project-vocabulary"><h3 id="iv-project-labels" tabindex="-1">' +
      (approved.length
        ? "Approved project labels"
        : "Project labels to confirm") +
      "</h3>" +
      labelList(d, approved.length ? approved : labels) +
      (earlier.length
        ? "<details><summary>Other labels already in this project</summary>" +
          labelList(d, earlier) +
          "</details>"
        : "") +
      (approved.length ? "" : b("iv-editbook", "Manage labels", "plain")) +
      "</div>";
  }
  const confirmation =
    !approved.length && labels.length && !draft && !sampleReview
      ? b(
          "iv-establish",
          "Use these labels for all interviews",
          "primary",
          disabled,
        )
      : "";
  const inductive =
    approved.length && !draft && !state.draft && state.method === "inductive"
      ? b("iv-sample", "Look for additional labels (inductive)", "plain")
      : "";
  return (
    '<section class="iv-stage"><h2>1. Set up your codebook</h2>' +
    (!draft && !sampleReview && !approved.length
      ? "<p>Enter your own labels, extract them from a codebook, or develop them from interview passages.</p>"
      : "") +
    (approved.length && !draft && !sampleReview ? list + setup : setup + list) +
    (approved.length && draft
      ? b("iv-editbook", "Manage labels", "plain")
      : "") +
    confirmation +
    inductive +
    "</section>"
  );
}

function eligibleTranscript(ps) {
  const index = transcriptIndex(ps);
  const included = codingSelection(index.originals);
  return ps.filter((p) => included.has(index.positions.get(p.id).original.id));
}

function applyCodebookTitle(d) {
  return d.sources.length === 1
    ? "Apply codebook to interview"
    : "Apply codebook to interviews";
}
export function interviewScreen(d, storageStatus = "") {
  rememberLabelAppearance(d);
  const s = interviews(d),
    sourcePassages = d.passages.filter((p) => p.source === s.source),
    index = transcriptIndex(sourcePassages),
    included = codingSelection(index.originals),
    ps = sourcePassages.filter((p) =>
      included.has(index.positions.get(p.id).original.id),
    ),
    book = sharedBook(d);
  const done = s.done.includes(s.source),
    selected = ps.find((p) => p.id === s.passage) || ps[0];
  const activity = interviewActivity(d),
    job = jobs.get(d),
    draft = s.draft;
  const draftSources = draft ? draft.sources || [draft.source] : [];
  const locked = !!draft,
    remaining = d.sources.filter((source) => !s.done.includes(source)).length;
  const shared = s.established && approvedBook(d).length > 0;
  const disabled = shared ? "" : "disabled";
  let reviewPanel = "";
  if (draft) {
    const ready = !job && draft.next === draft.total;
    const reviewLabel = draft.sample
      ? "Review draft labels"
      : "Review suggested coding";
    const rows = draft.sample
      ? sampleLabels(
          draft.matches,
          shared ? approvedBook(d) : book,
          draft.labelEdits,
        )
      : [];
    const preview = rows.filter((row) => row.keep);
    reviewPanel = `<section class="iv-review" aria-live="polite">
      <h3>${draft.sample ? (ready ? "Draft labels to review" : "Developing labels from passages") : "Bot coding draft"}</h3>
      ${activity ? busyIndicator(activity, false) : ""}
      <p>${draft.next} of ${draft.total} batches processed · ${draft.matches.length} new suggested matches</p>
      <small>Interviews in this draft: ${draftSources.map(esc).join(", ")}</small>
      ${preview.length ? labelList(d, preview, "iv-legend iv-draft-legend") : ""}
      ${draft.error ? "<p>" + esc(draft.error) + "</p>" : ""}
      ${job ? b("iv-stop", "Pause after this batch", "", job.stop || draft.next >= draft.total ? "disabled" : "") : ready ? b("iv-review", reviewLabel, "primary") : b("iv-resume", "Resume coding")}
      ${job ? "" : b("iv-discard", "Discard draft", "plain")}</section>`;
  }
  const applyStage = `<section class="iv-stage"><h2 id="iv-application" tabindex="-1">2. Apply your labels</h2>
  <p>${shared ? "Choose a passage to code yourself, or ask the bot to look for your approved labels in one or more interviews." : "Approve your codebook in step 1 to use its labels here."}</p>
  ${shared && d.coding?.bookDraft ? "<p><strong>Your approved labels are in use.</strong> Review your draft in step 1 to use the revised labels.</p>" : ""}
  <div class="iv-stage-actions">${b("iv-apply-manual", "Code manually", "", disabled)}${b("iv-auto", "Code with the bot", "", shared && !locked ? "" : "disabled")}</div>
  ${draft && !draft.sample ? reviewPanel : ""}
  </section>`;
  const canFinish = !remaining && d.sources.length && !locked;
  return `<div class="iv-progress"><div><strong>${d.sources.length - remaining} of ${d.sources.length} interviews checked</strong><progress value="${d.sources.length - remaining}" max="${d.sources.length}"></progress></div>${b("iv-finish", "Coding complete · explore themes", "primary", canFinish ? "" : "disabled")}</div>
  <div class="iv-workflow iv-tools">${codebookSetup(d, s, book, draft?.sample ? reviewPanel : "")}${applyStage}</div>
  <div class="iv-grid iv-reading-grid"><aside class="iv-side"><h2>Interviews</h2>${d.sources.map((source, i) => b("iv-source", esc(source) + "<small>" + (draftSources.includes(source) ? "Draft in progress" : s.done.includes(source) ? "✓ Checked" : "To check") + "</small>", "iv-source", `data-index="${i}" aria-pressed="${source === s.source}"`)).join("")}
  ${b("iv-add", "+ Add interview", "", locked ? "disabled" : "")} ${b("download", "Save coding project", "plain")} ${b("codedword", "Download coded interviews (.docx)", "plain")}<small data-iv-storage role="status">${esc(storageStatus || "Coding changes create a recovery copy in this browser. Reopen or remove it from Upload.")}</small></aside>
  <section class="iv-paper"><header><small>${d.excerptSources?.includes(s.source) ? "Imported passages" : "Transcript"}</small><h2>${esc(s.source)}</h2><p>${included.size} of ${index.originals.length} passages included for coding. ${b("iv-inclusion", "Choose passages for coding", "plain", locked ? "disabled" : "")}</p><p>${included.size ? "Choose a passage or highlight the words you want to label." : "Choose passages above to include text in coding."}</p>${selected ? '<div class="iv-manual-tools">' + b("iv-manual", "Edit labels on selected text") + (book.length ? '<a class="iv-label-jump" href="#iv-project-labels">Project labels</a>' : "") + "</div>" : ""}${d.excerptSources?.includes(s.source) ? "<small>Check the coverage of your export. Only the imported passages can be coded or compared.</small>" : ""}</header>
  <div class="iv-text">${transcriptRows(ps, selected, labelAppearance(d), index.numbers)}</div>
  ${done ? "<p>✓ You have checked this interview.</p>" : b("iv-done", "Mark this interview as checked", "", locked || !book.length || (!shared && d.coding?.bookDraft) ? "disabled" : "")}</section>
</div>`;
}
// Every new batch operation previews its scope before any text is sent.
function codingScope(d, state, sample, resuming, request, api, title) {
  const draft = resuming ? state.draft : null;
  const source = state.source;
  const scope =
    d.sources.length > 1 && ["all", "selected"].includes(request?.scope)
      ? request.scope
      : "current";
  const initialSources = new Set(request?.sources ?? [source]);
  const lists = new Map(d.sources.map((name) => [name, []]));
  const ordinals = transcriptOrdinals(d.passages);
  const included = codingSelection(d.passages.filter((p) => !p.parent));
  for (const p of d.passages) {
    const list = lists.get(p.source);
    if (!list) continue;
    const position = ordinals.get(p.id);
    if (!p.parent && included.has(p.id) && p.text.trim())
      list.push({ p, position });
  }
  const activeLabels = approvedBook(d);
  const labelAllowance = sample
    ? Math.max(
        0,
        Math.min(
          discoveryLimit,
          codingLimits.inductiveLabels -
            (state.established ? activeLabels.length : sharedBook(d).length),
        ),
      )
    : 0;
  const manualPicks = new Map();
  const sampleLimit = (sources) => Math.max(10, sources.length);
  const currentSources = () => {
    if (draft) return draft.sources || [draft.source];
    if (val("iv-scope") === "all") return d.sources;
    if (val("iv-scope") === "selected")
      return [
        ...get("modalform").querySelectorAll("[name=iv-source-pick]:checked"),
      ].map((n) => n.value);
    return [source];
  };
  // Interleave selected passages so an early request can already see several voices.
  const selectedIds = () => {
    const groups = [
      ...get("modalform").querySelectorAll("[data-sample-source]"),
    ].map((group) =>
      [...group.querySelectorAll("[name=iv-example]:checked")].map(
        (n) => n.value,
      ),
    );
    if (!sample) return groups.flat();
    const ids = [];
    for (let i = 0; groups.some((group) => i < group.length); i++)
      for (const group of groups) if (i < group.length) ids.push(group[i]);
    return ids;
  };
  const pickerId = sample ? "iv-sample-pick" : "iv-run-pick";
  const choice = askForm(
    title,
    `<p>The university Data bot will receive ${sample ? "the passages you select and your existing labels" : "the included passages you select and your shared codebook"}. You will review its suggestions before any coding is applied.</p>` +
      (sample
        ? `<p>${labelAllowance ? "The bot can suggest up to " + labelAllowance + " new labels in this sample." : "Your codebook has reached the bot’s limit for discovering new labels. It can still suggest matches for existing labels."} One label can fit several passages.</p>` +
          (state.established
            ? "<p>If you accept a new label, it joins your shared codebook. You will then need to check all interviews again so each has been assessed using the same labels.</p>"
            : "")
        : "<p>The bot can only use approved labels. A passage may receive no label.</p><details><summary>See the " +
          activeLabels.length +
          (activeLabels.length === 1 ? " approved label" : " approved labels") +
          "</summary>" +
          labelList(d, activeLabels) +
          "</details>") +
      (!resuming && d.sources.length > 1
        ? formselect(
            "iv-scope",
            "Which interviews should the bot use?",
            [
              ["current", "Current interview · " + source],
              ["selected", "Choose interviews"],
              ["all", "All " + d.sources.length + " interviews"],
            ],
            scope,
          ) +
          '<fieldset id="iv-pick-sources" hidden><legend>Select interviews</legend>' +
          d.sources
            .map(
              (name) =>
                `<label class="tick"><input type="checkbox" name="iv-source-pick" value="${esc(name)}" ${initialSources.has(name) ? "checked" : ""}>${esc(name)}</label>`,
            )
            .join("") +
          "</fieldset>"
        : "") +
      '<div id="iv-scope-summary"></div>' +
      (!resuming
        ? (sample
            ? '<small>The starting sample draws from different parts of the interviews. Tick or untick passages to choose what to send.</small><div class="iv-pick" id="iv-sample-pick"></div>'
            : '<details><summary>Choose passages for this coding run</summary><div class="iv-pick" id="iv-run-pick"></div></details>') +
          '<small id="iv-sample-count" role="status"></small>'
        : "") +
      (!resuming
        ? '<label>What should the bot look for? (optional)<input id="iv-focus" maxlength="600" value="' +
          esc(d.coding?.focus || api.focus()) +
          '"></label>'
        : ""),
    () => {
      const sources = currentSources();
      if (!sources.length) throw Error("Choose at least one interview.");
      const ids = draft ? draft.ids : selectedIds();
      if (!draft && !ids.length)
        throw Error("Select at least one passage to code.");
      if (
        sample &&
        !draft &&
        (!ids.length || ids.length > sampleLimit(sources))
      )
        throw Error(
          "Choose between 1 and " + sampleLimit(sources) + " passages.",
        );
      // A user may untick all the passages for an interview in the initial sample.
      const selected = ids && new Set(ids);
      const used =
        !draft && selected
          ? sources.filter((name) =>
              lists.get(name).some(({ p }) => selected.has(p.id)),
            )
          : sources;
      if (
        val("iv-scope") === "selected" &&
        used.length < (request?.minimum || 1)
      )
        throw Error(
          sample
            ? "Select passages from both interviews, or change the interview choice above."
            : "Tick both interviews, or change the interview choice above.",
        );
      return {
        sources: used,
        ids,
        focus: val("iv-focus").trim(),
      };
    },
    sample ? "Send selected passages" : "Send to bot for coding",
    async () => {
      if (botSession()) return true;
      // A session may expire while the student chooses passages. Restore
      // this exact selection and let them explicitly send after unlocking.
      await api.ensureAccess(title);
      return false;
    },
  );
  function countSample() {
    const groups = [...get(pickerId).querySelectorAll("[data-sample-source]")];
    const count = groups.reduce(
      (sum, group) => sum + group.querySelectorAll(":checked").length,
      0,
    );
    const represented = groups.filter((group) =>
      group.querySelector(":checked"),
    ).length;
    get("iv-sample-count").textContent =
      `${count} passages selected from ${represented} of ${groups.length} interviews${sample ? " (up to " + sampleLimit(currentSources()) + " passages)" : ""}.`;
  }
  function redraw() {
    const picker = get("iv-pick-sources");
    if (picker) picker.hidden = val("iv-scope") !== "selected";
    const sources = currentSources();
    const names = sources.map(esc).join(", ");
    const items = sources.reduce(
      (sum, name) => sum + (lists.get(name)?.length || 0),
      0,
    );
    get("iv-scope-summary").innerHTML = draft
      ? `<p>Resume the saved ${sample ? "sample" : "coding"} for <strong>${names}</strong>. ${draft.next} of ${draft.total} batches are complete.</p>`
      : `<p>${sources.length ? "<strong>" + names + "</strong> · " + items + " original passages available for coding" : "Select the interviews to include."}</p>`;

    if (
      request?.prompt &&
      val("iv-scope") === "selected" &&
      sources.length < (request.minimum || 1)
    ) {
      const prompt = document.createElement("p");
      prompt.textContent = request.prompt;
      get("iv-scope-summary").append(prompt);
    }
    if (!get(pickerId)) return;
    const defaults = new Set(
      sample
        ? balancedSample(
            d,
            sources,
            sources.length > 1 ? sampleLimit(sources) : 6,
          )
        : sources.flatMap((name) => lists.get(name).map(({ p }) => p.id)),
    );
    get(pickerId).innerHTML = sources
      .map(
        (name) =>
          `<fieldset data-sample-source="${esc(name)}"><legend>${esc(name)}</legend>` +
          lists
            .get(name)
            .map(
              ({ p, position }) =>
                `<label class="tick" title="${esc(p.text.slice(0, 300))}"><input name="iv-example" type="checkbox" value="${esc(p.id)}" ${(manualPicks.get(p.id) ?? defaults.has(p.id)) ? "checked" : ""}>Passage ${position} · ${esc(p.text.slice(0, 104))}</label>`,
            )
            .join("") +
          "</fieldset>",
      )
      .join("");
    countSample();
  }
  redraw();
  get("modalform").addEventListener("change", (event) => {
    if (
      event.target.id === "iv-scope" ||
      event.target.name === "iv-source-pick"
    )
      redraw();
    if (event.target.name === "iv-example") {
      manualPicks.set(event.target.value, event.target.checked);
      countSample();
    }
  });
  return choice;
}
export async function interviewAction(act, el, d, api) {
  const s = interviews(d),
    ps = d.passages.filter((p) => p.source === s.source);
  const refresh = (persist = true) => {
    const pending = jobs.get(d);
    if (pending && pending.draft !== s.draft) {
      pending.stop = true;
      jobs.delete(d);
      if (s.draft && s.draft.next < s.draft.total)
        s.draft.error =
          "Your edits are saved. Resume coding to continue with your changes.";
    }
    if (persist && act !== "iv-select" && act !== "iv-source") api.checkpoint();
    if (api.current() === d) api.render();
  };
  if (
    s.draft &&
    ![
      "iv-source",
      "iv-select",
      "iv-manual",
      "iv-apply-manual",
      "iv-excerpt",
      "iv-editbook",
      "iv-categories",
      "iv-stop",
      "iv-resume",
      "iv-review",
      "iv-discard",
    ].includes(act)
  )
    throw Error("Finish reviewing or discard the current draft first.");
  function changed(names = [s.source]) {
    s.done = s.done.filter((name) => !names.includes(name));
    s.finished = false;
  }
  if (act === "iv-source") {
    s.source = d.sources[Number(el.dataset.index)];
    s.passage = null;
  }
  if (act === "iv-select") s.passage = el.dataset.id;
  if (act === "iv-inclusion") {
    const originals = transcriptIndex(ps).originals;
    const included = codingSelection(originals);
    const picks = await askForm(
      "Choose passages for coding",
      "<p>Tick the passages you want to code and review in " +
        esc(s.source) +
        ". Clearly marked interviewer turns and consent exchanges start unticked. Your selection also applies to future bot runs.</p>" +
        '<div class="iv-pick">' +
        originals
          .map(
            (p, i) =>
              '<label class="tick"><input name="iv-include" type="checkbox" value="' +
              esc(p.id) +
              '" ' +
              (included.has(p.id) ? "checked" : "") +
              ">Passage " +
              (i + 1) +
              " · " +
              esc(p.text) +
              "</label>",
          )
          .join("") +
        "</div>",
      () =>
        new Set(
          [
            ...get("modalform").querySelectorAll("[name=iv-include]:checked"),
          ].map((n) => n.value),
        ),
      "Save passage selection",
    );
    if (!picks || api.current() !== d) return;
    if (originals.some((p) => included.has(p.id) !== picks.has(p.id))) {
      for (const p of originals)
        if (included.has(p.id) !== picks.has(p.id))
          p.codingIncluded = picks.has(p.id);
      if (!picks.has(s.passage)) s.passage = null;
      changed();
      refresh();
    }
    return;
  }
  if (act === "iv-add") return api.add();
  if (act === "iv-establish") establish(d);
  if (act === "iv-categories") return manageCategories(d, refresh);
  if (act === "iv-editbook") return manageLabels(d, api, refresh);
  if (["iv-book", "iv-enterbook", "iv-reviewbook"].includes(act)) {
    const manual = d.coding?.bookDraft
      ? d.coding.bookDraft.method === "manual"
      : act === "iv-enterbook";
    const title = manual
      ? "Enter your codebook labels"
      : "Extract labels from a codebook";
    if (act === "iv-book" && !d.coding?.bookDraft) {
      if (!(await api.ensureAccess(title)) || api.current() !== d) return;
    }
    const previous = JSON.stringify(approvedBook(d));
    modal(
      title,
      codingControls(d, { mode: "deductive", standalone: true, manual }),
    );
    bindCodingControls(
      d,
      api.extract,
      () => {
        const approved = approvedBook(d);
        establish(d, approved);
        s.method = "book";
        if (JSON.stringify(approved) !== previous) changed(d.sources);
        get("dialog").close();
        refresh();
        get("iv-application")?.focus();
        notice(
          approved.length +
            (approved.length === 1 ? " label approved." : " labels approved.") +
            " Choose how to apply your labels.",
        );
      },
      () => refresh(),
      api.ensureAccess,
    );
    return;
  }
  if (act === "iv-apply-manual" || act === "iv-manual" || act === "iv-excerpt")
    return editPassageLabels(
      d,
      s,
      eligibleTranscript(ps),
      api,
      refresh,
      act === "iv-excerpt" ? el.dataset : null,
    );
  if (act === "iv-done") {
    const ok = await askForm(
      "Finish checking this interview?",
      "<p>Confirm that you have checked the included passages in <strong>" +
        esc(s.source) +
        "</strong>. Passages without a suitable label can remain uncoded." +
        (!s.established
          ? " The labels shown in the legend will become your shared codebook."
          : "") +
        "</p>",
      () => true,
      "Mark as checked",
    );
    if (!ok) return;
    finishInterview(d);
    const next = d.sources.find((source) => !s.done.includes(source));
    if (next) {
      s.source = next;
      s.passage = null;
    }
  }
  if (act === "iv-finish") return api.finish();
  if (act === "iv-stop") {
    const job = jobs.get(d);
    if (job) job.stop = true;
    refresh(false);
    return;
  }
  if (act === "iv-discard") {
    if (
      !(await askForm(
        "Discard these suggestions?",
        "<p>Your previously accepted coding will be kept.</p>",
        () => true,
        "Discard draft",
      ))
    )
      return;
    delete s.draft;
    pruneEmptyQuotations(d);
  }
  if (act === "iv-sample" || act === "iv-auto" || act === "iv-resume") {
    if (jobs.has(d)) return;
    const source = s.source;
    const sample = act === "iv-resume" ? s.draft.sample : act === "iv-sample";
    if (!sample && (!s.established || !approvedBook(d).length))
      throw Error("Confirm the shared labels before coding a whole interview.");
    const resuming = act === "iv-resume";
    const initialDraft = s.draft;
    const title = sample
      ? "Suggest labels from selected passages"
      : applyCodebookTitle(d);
    if (
      !(await api.ensureAccess(title)) ||
      api.current() !== d ||
      s.source !== source ||
      s.draft !== initialDraft ||
      jobs.has(d)
    )
      return;
    const selection = await codingScope(
      d,
      s,
      sample,
      resuming,
      el.scopeRequest,
      api,
      title,
    );
    if (
      !selection ||
      api.current() !== d ||
      s.source !== source ||
      s.draft !== initialDraft ||
      jobs.has(d)
    )
      return;
    if (!resuming) {
      if (sample && !s.established) s.method = "inductive";
      d.coding = { ...d.coding, focus: selection.focus };
      s.draft = {
        source: s.source,
        sources: selection.sources,
        sample,
        ...(sample ? { codeExamples: false } : {}),
        originalOnly: true,
        ids: selection.ids,
        next: 0,
        matches: [],
        total: 0,
      };
    }
    const draft = s.draft,
      sources = draft.sources || [draft.source],
      batches = interviewBatches(
        d,
        draft.sources || draft.source,
        draft.ids,
        draft.originalOnly,
      );
    const scoped = d.passages.filter((p) => sources.includes(p.source));
    const byId = new Map(scoped.map((p) => [p.id, p]));
    const excerpts = new Map();
    for (const p of scoped)
      if (p.parent) {
        if (!excerpts.has(p.parent)) excerpts.set(p.parent, []);
        excerpts.get(p.parent).push(p);
      }
    draft.total = batches.length;
    draft.error = "";
    const job = { stop: false, draft };
    jobs.set(d, job);
    refresh(false);
    try {
      await api.checkpoint();
      while (
        s.draft === draft &&
        draft.next < batches.length &&
        !job.stop &&
        api.current() === d
      ) {
        const batch = batches[draft.next];
        const guide = draftGuide(d, sample, draft.matches);
        const result = await api.code({
          guide,
          passages: batch.map(({ id, source, text, codes }) => ({
            id,
            source,
            text,
            codes,
          })),
        });
        if (s.draft !== draft) break;
        const excluded = (draft.excluded ||= {});
        const validated = reviewedMatches(result, batch, guide, excluded);
        const found = validated.filter(
          (m) => !coveredByQuotation(m, byId.get(m.id), excerpts.get(m.id)),
        );
        excluded.duplicate =
          (excluded.duplicate || 0) + validated.length - found.length;
        draft.skipped = (draft.skipped || 0) + result.length - found.length;
        draft.matches.push(...found);
        draft.next++;
        await api.checkpoint();
        refresh(false);
      }
    } catch (e) {
      draft.error = e.message + " Choose Resume coding to retry this batch.";
    } finally {
      if (jobs.get(d) === job) jobs.delete(d);
      await api.checkpoint();
      refresh(false);
    }
    return;
  }
  if (act === "iv-review") {
    const draft = s.draft,
      guide = draftGuide(d, draft.sample);
    const sources = draft.sources || [draft.source];
    const sourcePassages = new Map(sources.map((source) => [source, []]));
    for (const p of d.passages) sourcePassages.get(p.source)?.push(p);
    const positions = transcriptOrdinals(d.passages);
    const targets = [];
    const selectedIds = draft.ids && new Set(draft.ids);
    for (const list of sourcePassages.values()) {
      list.forEach((p) => {
        if (
          (!draft.originalOnly || !p.parent) &&
          (!selectedIds || selectedIds.has(p.id))
        )
          targets.push(p);
      });
    }
    const reviewExcluded = {};
    const parentById = new Map(targets.map((p) => [p.id, p]));
    const children = new Map();
    for (const p of d.passages) {
      if (!p.parent || !parentById.has(p.parent)) continue;
      if (!children.has(p.parent)) children.set(p.parent, []);
      children.get(p.parent).push(p);
    }
    const matches = checkedCollectedSuggestions(
      draft.matches,
      targets,
      guide,
      reviewExcluded,
    ).filter((m) => {
      if (!coveredByQuotation(m, parentById.get(m.id), children.get(m.id)))
        return true;
      reviewExcluded.duplicate = (reviewExcluded.duplicate || 0) + 1;
      return false;
    });
    const styles = labelAppearance(
      d,
      matches.map((m) => m.code),
    );
    const byPassage = new Map();
    matches.forEach((m, index) => {
      if (!byPassage.has(m.id)) byPassage.set(m.id, []);
      byPassage.get(m.id).push({ m, index });
    });
    const key = (id, code) => JSON.stringify([id, code]);
    const rejected = new Set(draft.rejected || []);
    const manual = new Set(draft.manual || []);
    const book =
      s.established || !draft.sample ? approvedBook(d) : sharedBook(d);
    const rows = draft.sample
      ? sampleLabels(matches, book, draft.labelEdits)
      : [];
    // Old drafts saved per-quotation decisions before label approval became independent.
    const codeExamples = () =>
      !draft.sample ||
      (draft.codeExamples ?? ("rejected" in draft || "manual" in draft));
    const canAdd = (p, label) =>
      !p.codes.includes(label) &&
      !(byPassage.get(p.id) || []).some(({ m }) => m.code === label);
    const emptySample = draft.sample && !rows.length && !book.length;
    const repeats =
      (draft.excluded?.duplicate || 0) + (reviewExcluded.duplicate || 0);
    const otherExcluded =
      (draft.skipped || 0) + draft.matches.length - matches.length - repeats;
    const alreadyCoded = targets.filter((p) => p.codes.length).length;
    const groupHtml = new Map(sources.map((source) => [source, []]));
    targets.forEach((p, target) => {
      const items = byPassage.get(p.id) || [];
      groupHtml
        .get(p.source)
        .push(
          '<section class="iv-review-passage"><strong>Passage ' +
            positions.get(p.id) +
            "</strong>" +
            items
              .map(
                ({ m, index }) =>
                  `<label class="iv-match"><input type="checkbox" name="iv-match" value="${index}" ${rejected.has(key(m.id, m.code)) ? "" : "checked"}><span><small>Passage ${positions.get(m.id)}</small>${draft.sample ? "<span data-preview-code>" + chip(m.code, styles) + "</span><small data-preview-meaning>" + esc(m.definition) + "</small>" : chip(m.code, styles)}<q>${esc(m.quote)}</q><small>${esc(m.reason)}</small></span></label>`,
              )
              .join("") +
            (items.length ? "" : "<p>No suggested label.</p>") +
            '<details data-review-passage="' +
            target +
            '"><summary>Read full passage' +
            (book.length ? " and check for missed labels" : "") +
            "</summary><blockquote>" +
            esc(p.text) +
            "</blockquote>" +
            (p.codes.length
              ? "<p>Already applied: " +
                p.codes.map((label) => chip(label, styles)).join(" ") +
                "</p>"
              : "") +
            "<div data-missed-labels></div></details></section>",
        );
    });
    modal(
      draft.sample ? "Review draft labels" : "Review the suggested coding",
      `<p>${matches.length} proposed assignments across ${byPassage.size} of ${targets.length} passages in ${sources.length === 1 ? "<strong>" + esc(sources[0]) + "</strong>" : sources.length + " interviews"}.</p>` +
        (draft.sample
          ? sampleLabelEditor(rows, codeExamples(), styles)
          : "<p>Read the full passage to check the meaning. Untick unsuitable suggestions and check for missed labels.</p>") +
        (repeats
          ? `<p>${repeats} repeated label suggestions were left out because the coding already exists or the same assignment was suggested twice.</p>`
          : "") +
        (otherExcluded > 0
          ? `<p>${otherExcluded} additional suggestions were left out during checks on quotations, labels and coding limits.</p>`
          : "") +
        (!matches.length && !repeats && !otherExcluded
          ? "<p>The bot returned no new matches. Read the passages below. " +
            (book.length
              ? "You can add any shared labels you think fit."
              : "You can try another sample or add your own label in the transcript.") +
            "</p>"
          : "") +
        (!matches.length && alreadyCoded
          ? `<p>${alreadyCoded} of the ${targets.length} passages already have labels. Open a passage to see its existing coding.</p>`
          : "") +
        [...groupHtml]
          .map(
            ([source, entries]) =>
              `<section data-review-source="${esc(source)}"><h3>${esc(source)}</h3>${entries.join("") || "<p>No passages were in this sample.</p>"}</section>`,
          )
          .join("") +
        '<small role="status" data-iv-storage>' +
        esc(api.status()) +
        "</small>",
      async () => {
        if (s.draft !== draft || api.current() !== d)
          throw Error("Reopen the current draft before approving it.");
        if (emptySample) {
          delete s.draft;
          pruneEmptyQuotations(d);
          await api.checkpoint();
          refresh(false);
          notice(
            "No labels were proposed for this sample. Try other passages or enter labels manually.",
          );
          return;
        }
        const vocabulary = draft.sample ? reviewVocabulary(book, rows) : null;
        const included = new Map(
          rows
            .filter((row) => row.keep)
            .map((row) => [labelKey(row.original), row]),
        );
        const picked = codeExamples()
          ? matches.flatMap((match) => {
              if (rejected.has(key(match.id, match.code))) return [];
              if (!draft.sample) return [match];
              const row = included.get(labelKey(match.code));
              return row
                ? [
                    {
                      ...match,
                      code: row.label.trim(),
                      definition: row.definition.trim(),
                    },
                  ]
                : [];
            })
          : [];
        if (picked.length) {
          applyCodingBatch(
            d,
            picked,
            vocabulary ? { ...guide, vocabulary } : guide,
          );
          const byId = new Map(targets.map((p) => [p.id, p]));
          for (const { id, code, quote } of picked) {
            const p = byId.get(id);
            p.codingEvidence ||= [];
            p.codingEvidence.push({ code, quote });
          }
        }
        const appliedIds = new Set(picked.map((m) => m.id));
        let added = 0;
        for (const p of codeExamples() ? targets : []) {
          for (const { label } of book) {
            if (manual.has(key(p.id, label)) && canAdd(p, label)) {
              p.codes.push(label);
              p.reviewed = true;
              appliedIds.add(p.id);
              added++;
            }
          }
        }
        delete s.draft;
        pruneEmptyQuotations(d);
        const bookChanged =
          draft.sample &&
          (!s.established ||
            JSON.stringify(vocabulary) !== JSON.stringify(book));
        if (draft.sample) establish(d, vocabulary);
        if (bookChanged) changed(d.sources);
        else if (appliedIds.size)
          changed([
            ...new Set(
              targets.filter((p) => appliedIds.has(p.id)).map((p) => p.source),
            ),
          ]);
        await api.checkpoint();
        refresh(false);
        if (draft.sample) get("iv-application")?.focus();
        notice(
          draft.sample
            ? vocabulary.length +
                (vocabulary.length === 1
                  ? " label approved. "
                  : " labels approved. ") +
                (picked.length + added
                  ? picked.length + added + " sample assignments saved. "
                  : "") +
                "Choose how to apply the codebook in step 2."
            : picked.length +
                added +
                " label assignments applied. Check each interview before marking it as checked.",
        );
      },
      emptySample
        ? "Finish review"
        : draft.sample
          ? "Use these labels"
          : "Apply reviewed coding",
    );
    const form = get("modalform");
    if (draft.sample)
      bindSampleLabelEditor(
        form,
        draft,
        rows,
        matches,
        () => {
          if (s.draft === draft) api.checkpoint();
        },
        () => {
          if (s.draft === draft) refresh(false);
        },
        styles,
      );
    for (const details of form.querySelectorAll("[data-review-passage]")) {
      details.ontoggle = () => {
        if (!details.open || details.dataset.filled) return;
        details.dataset.filled = "true";
        const p = targets[Number(details.dataset.reviewPassage)];
        const choices = book
          .map(({ label }, i) =>
            canAdd(p, label)
              ? `<label class="tick"><input type="checkbox" name="iv-missed" value="${i}" ${manual.has(key(p.id, label)) ? "checked" : ""}>${chip(label, styles)}</label>`
              : "",
          )
          .join("");
        details.querySelector("[data-missed-labels]").innerHTML = choices
          ? "<fieldset><legend>Add a missed label</legend>" +
            choices +
            "</fieldset>"
          : "";
      };
    }
    form.onchange = (e) => {
      const input = e.target;
      if (input.name === "iv-match") {
        const m = matches[Number(input.value)],
          id = key(m.id, m.code);
        if (input.checked) rejected.delete(id);
        else rejected.add(id);
        draft.rejected = [...rejected];
      } else if (input.name === "iv-missed") {
        const p =
          targets[Number(input.closest("details").dataset.reviewPassage)];
        const id = key(p.id, book[Number(input.value)].label);
        if (input.checked) manual.add(id);
        else manual.delete(id);
        draft.manual = [...manual];
      } else return;
      api.checkpoint();
    };
    return;
  }
  refresh();
}
