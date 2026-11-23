import { esc } from "./chart.js";
import {
  applyCodingBatch,
  checkedCollectedSuggestions,
  codingLimits,
  discoveryLimit,
  bookEntries,
} from "./coding.js";
import { codingControls, bindCodingControls } from "./codebook-ui.js";
import { uid } from "./import.js";
import {
  askForm,
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
  establish,
  finishInterview,
  balancedSample,
  interviewBatches,
  reviewedMatches,
  coveredByQuotation,
  draftGuide,
} from "./interviews.js";

const jobs = new WeakMap();
const colours = [
  "#405cac",
  "#8e4a70",
  "#357366",
  "#996022",
  "#5a5392",
  "#336c88",
  "#876a32",
  "#80624c",
];
function chip(label) {
  let hash = 0;
  for (const c of label) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return (
    '<span class="iv-chip" style="--chip:' +
    colours[hash % colours.length] +
    '">' +
    esc(label) +
    "</span>"
  );
}
const tools = [
  [
    "imported",
    "Check existing codes",
    "Check how the imported labels match the text.",
  ],
  [
    "inductive",
    "Develop labels from the text (inductive)",
    "Start with a few passages and review the bot’s suggestions.",
  ],
  [
    "book",
    "Use an uploaded codebook (deductive)",
    "Extract the labels and meanings, then approve them.",
  ],
  ["manual", "Code by hand", "Select a passage and give the idea a label."],
];
function routeButtons(d) {
  return tools
    .filter(
      ([key]) => key !== "imported" || d.passages.some((p) => p.codes.length),
    )
    .map(([key, title, description]) =>
      b(
        "iv-method",
        esc(title) + "<small>" + esc(description) + "</small>",
        "iv-choice",
        'data-method="' + key + '"',
      ),
    )
    .join("");
}
export function interviewScreen(d, storageStatus = "") {
  const s = interviews(d),
    ps = d.passages.filter((p) => p.source === s.source),
    book = sharedBook(d);
  const done = s.done.includes(s.source),
    selected = ps.find((p) => p.id === s.passage) || ps[0];
  const job = jobs.has(d),
    draft = s.draft;
  const draftSources = draft ? draft.sources || [draft.source] : [];
  const locked = !!draft,
    remaining = d.sources.filter((source) => !s.done.includes(source)).length;
  const methods = !s.method
    ? routeButtons(d)
    : "<p>" +
      esc(tools.find(([k]) => k === s.method)?.[1] || "Shared codebook") +
      "</p>";
  const shared = s.established;
  const canFinish = !remaining && d.sources.length && !locked;
  return `<div class="iv-progress"><div><strong>${d.sources.length - remaining} of ${d.sources.length} interviews checked</strong><progress value="${d.sources.length - remaining}" max="${d.sources.length}"></progress></div>${b("iv-finish", "Coding complete · explore themes", "primary", canFinish ? "" : "disabled")}</div>
  <div class="iv-grid"><aside class="iv-side"><h2>Interviews</h2>${d.sources.map((source, i) => b("iv-source", esc(source) + "<small>" + (draftSources.includes(source) ? "Draft in progress" : s.done.includes(source) ? "✓ Checked" : "To check") + "</small>", "iv-source", `data-index="${i}" aria-pressed="${source === s.source}" ${locked && source !== s.source ? "disabled" : ""}`)).join("")}
  ${b("iv-add", "+ Add interview", "", locked ? "disabled" : "")} ${b("download", "Save coding project", "plain")}<small data-iv-storage role="status">${esc(storageStatus || "Coding changes create a recovery copy in this browser. Reopen or remove it from Upload.")}</small></aside>
  <section class="iv-paper"><header><small>${d.excerptSources?.includes(s.source) ? "Imported passages" : "Transcript"}</small><h2>${esc(s.source)}</h2><p>${ps.length} passages · select a passage to label it, or highlight a shorter quotation.</p>${d.excerptSources?.includes(s.source) ? "<small>Check the coverage of your export. Only the imported passages can be coded or compared.</small>" : ""}</header>
  <div class="iv-text">${ps.map((p, i) => `<article class="iv-passage ${p.id === selected?.id ? "iv-selected" : ""}" data-iv-id="${esc(p.id)}"><button data-act="iv-select" data-id="${esc(p.id)}" aria-pressed="${p.id === selected?.id}" ${locked ? "disabled" : ""}>${p.parent ? "Saved quotation" : "Passage"} ${i + 1}</button><p data-iv-text="${esc(p.id)}">${esc(p.text)}</p><div>${p.codes.map(chip).join("")}</div>${p.codingEvidence?.length ? "<details><summary>Words supporting these labels</summary>" + p.codingEvidence.map((e) => "<p>" + chip(e.code) + " “" + esc(e.quote) + "”</p>").join("") + "</details>" : ""}</article>`).join("")}</div>
  ${done ? "<p>✓ You have checked this interview.</p>" : b("iv-done", "Mark this interview as checked", "", locked || !book.length ? "disabled" : "")}</section>
  <aside class="iv-tools"><h2>Shared codebook</h2>${book.length ? '<div class="iv-legend">' + book.map((e) => "<div>" + chip(e.label) + (e.definition ? "<small>" + esc(e.definition) + "</small>" : "") + "</div>").join("") + "</div>" : "<p>Your labels and their meanings will appear here.</p>"}
  ${!locked && !shared ? methods : ""}
  ${!locked && !shared && s.method === "book" ? b("iv-book", "Upload or review codebook") : ""}
  ${!locked && !shared && s.method === "inductive" ? b("iv-sample", "Ask the bot for labels", "primary") : ""}
  ${!locked && !shared && s.method && book.length ? b("iv-establish", "Use these labels for all interviews") + "<small>This confirms your shared codebook. You can then ask the bot to apply it to the interviews you choose.</small>" : ""}
  ${!locked && shared ? "<p>Use these same labels across interviews.</p>" + b("iv-editbook", "Edit shared codebook", "plain") + b("iv-sample", "Look for additional labels", "plain") + b("iv-auto", d.sources.length > 1 ? "Code interviews with the bot" : "Code this interview with the bot", "primary") : ""}
  ${!locked && (s.method || shared) && selected ? b("iv-manual", "Edit labels on selected text") : ""}
  ${!locked && !shared && s.method ? b("iv-change", "Choose another approach", "plain") : ""}
  ${draft ? `<section class="iv-review" aria-live="polite"><h3>${draft.sample ? "Suggested labels" : "Bot coding draft"}</h3><p>${draft.next} of ${draft.total} batches processed · ${draft.matches.length} new suggested matches</p><small>Interviews in this draft: ${draftSources.map(esc).join(", ")}</small>${draft.error ? "<p>" + esc(draft.error) + "</p>" : ""}${job ? b("iv-stop", "Pause after this batch") : draft.next < draft.total ? b("iv-resume", "Resume coding") : b("iv-review", "Review suggested coding", "primary")}${job ? "" : b("iv-discard", "Discard draft", "plain")}</section>` : ""}
  </aside></div>`;
}
// Every new batch operation previews its scope before any text is sent.
function codingScope(d, state, sample, resuming, initialScope, api) {
  const draft = resuming ? state.draft : null;
  const source = state.source;
  const scope =
    d.sources.length > 1 && ["all", "selected"].includes(initialScope)
      ? initialScope
      : "current";
  const lists = new Map(d.sources.map((name) => [name, []]));
  const ordinals = new Map();
  for (const p of d.passages) {
    const list = lists.get(p.source);
    if (!list) continue;
    // Match the passage numbers visible in the central transcript, including any saved excerpts.
    const position = (ordinals.get(p.source) || 0) + 1;
    ordinals.set(p.source, position);
    if (!p.parent && p.text.trim()) list.push({ p, position });
  }
  const labelAllowance = sample
    ? Math.max(
        0,
        Math.min(
          discoveryLimit,
          codingLimits.inductiveLabels - sharedBook(d).length,
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
    const ids = [];
    for (let i = 0; groups.some((group) => i < group.length); i++)
      for (const group of groups) if (i < group.length) ids.push(group[i]);
    return ids;
  };
  const choice = askForm(
    sample
      ? "Suggest labels from selected passages"
      : "Apply the shared codebook",
    `<p>The university Data bot will receive ${sample ? "the passages you select and your existing labels" : "all original passages in the selected interviews and your shared codebook"}. You will review its suggestions before any coding is applied.</p>` +
      (sample
        ? `<p>${labelAllowance ? "The bot can suggest up to " + labelAllowance + " new labels in this sample." : "Your codebook has reached the bot’s limit for discovering new labels. It can still suggest matches for existing labels."} One label can fit several passages.</p>` +
          (state.established
            ? "<p>If you accept a new label, it joins your shared codebook. You will then need to check all interviews again so each has been assessed using the same labels.</p>"
            : "")
        : "") +
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
                `<label class="tick"><input type="checkbox" name="iv-source-pick" value="${esc(name)}" ${name === source ? "checked" : ""}>${esc(name)}</label>`,
            )
            .join("") +
          "</fieldset>"
        : "") +
      '<div id="iv-scope-summary"></div>' +
      (sample && !resuming
        ? '<small>The starting sample draws from different parts of the interviews. Tick or untick passages to choose what to send.</small><div class="iv-pick" id="iv-sample-pick"></div><small id="iv-sample-count" role="status"></small>'
        : "") +
      (!resuming
        ? '<label>What should the bot look for? (optional)<input id="iv-focus" maxlength="600" value="' +
          esc(d.coding?.focus || api.focus()) +
          '"></label>'
        : "") +
      (!sessionStorage.getItem("dv-session")
        ? '<label>Workshop course code<input id="iv-access" type="password"></label>'
        : ""),
    () => {
      const sources = currentSources();
      if (!sources.length) throw Error("Choose at least one interview.");
      const ids = draft ? draft.ids : sample ? selectedIds() : null;
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
      return {
        sources: used,
        ids,
        access: val("iv-access"),
        focus: val("iv-focus").trim(),
      };
    },
    sample ? "Send selected passages" : "Send this interview",
  );
  function countSample() {
    const groups = [
      ...get("iv-sample-pick").querySelectorAll("[data-sample-source]"),
    ];
    const count = groups.reduce(
      (sum, group) => sum + group.querySelectorAll(":checked").length,
      0,
    );
    const represented = groups.filter((group) =>
      group.querySelector(":checked"),
    ).length;
    get("iv-sample-count").textContent =
      `${count} passages selected from ${represented} of ${groups.length} interviews (up to ${sampleLimit(currentSources())} passages).`;
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
      : `<p>${sources.length ? "<strong>" + names + "</strong> · " + items + " original passages" : "Select the interviews to include."}</p>`;
    const submit = get("modalform").querySelector('[type="submit"]');
    if (!sample)
      submit.textContent =
        sources.length > 1 ? "Send selected interviews" : "Send this interview";
    if (!get("iv-sample-pick")) return;
    const defaults = new Set(
      balancedSample(d, sources, sources.length > 1 ? sampleLimit(sources) : 6),
    );
    get("iv-sample-pick").innerHTML = sources
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
    if (persist && act !== "iv-select" && act !== "iv-source") api.checkpoint();
    if (api.current() === d) api.render();
  };
  if (
    s.draft &&
    !["iv-source", "iv-stop", "iv-resume", "iv-review", "iv-discard"].includes(
      act,
    )
  )
    throw Error("Finish reviewing or discard the current draft first.");
  function changed(names = [s.source]) {
    s.done = s.done.filter((name) => !names.includes(name));
    s.finished = false;
  }
  if (act === "iv-source" && !s.draft) {
    s.source = d.sources[Number(el.dataset.index)];
    s.passage = null;
  }
  if (act === "iv-select") s.passage = el.dataset.id;
  if (act === "iv-change") s.method = "";
  if (act === "iv-method") {
    s.method = el.dataset.method;
    if (s.method === "book") act = "iv-book";
  }
  if (act === "iv-add") return api.add();
  if (act === "iv-establish") establish(d);
  if (act === "iv-editbook") {
    const book = sharedBook(d);
    modal(
      "Edit the shared codebook",
      "<p>Change a meaning or add a label. If you change the codebook, check each interview again before comparing themes.</p>" +
        book
          .map(
            (e, i) =>
              "<label>" +
              chip(e.label) +
              '<textarea id="iv-def-' +
              i +
              '">' +
              esc(e.definition) +
              "</textarea></label>",
          )
          .join("") +
        '<label>Additional label (optional)<input id="iv-add-label" maxlength="100"></label><label>Meaning of the additional label<input id="iv-add-meaning" maxlength="500"></label>',
      () => {
        const entries = book.map((e, i) => ({
          label: e.label,
          definition: val("iv-def-" + i).trim(),
        }));
        if (val("iv-add-label").trim())
          entries.push({
            label: val("iv-add-label"),
            definition: val("iv-add-meaning"),
          });
        const approved = bookEntries(entries);
        if (JSON.stringify(approved) !== JSON.stringify(book)) {
          d.coding.book = approved;
          s.done = [];
          s.finished = false;
          refresh();
        }
      },
      "Save codebook",
    );
    return;
  }
  if (act === "iv-book") {
    const working = { ...d, coding: { ...d.coding, mode: "deductive" } };
    modal(
      "Upload and check your codebook",
      codingControls(working),
      null,
      "Done",
    );
    document.querySelector("#dialog details").open = true;
    bindCodingControls(working, api.extract, () => {
      d.coding = working.coding;
      establish(d);
      get("dialog").close();
      refresh();
    });
    for (const id of ["coding-method", "coding-focus"])
      get(id).closest("label").hidden = true;
    get("suggestpass").parentElement.hidden = true;
    get("suggestpass").parentElement.previousElementSibling.hidden = true;
    return;
  }
  if (act === "iv-manual") {
    let p = ps.find((p) => p.id === s.passage) || ps[0];
    const sel = window.getSelection();
    let excerpt;
    if (sel?.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0),
        node = range.startContainer.parentElement?.closest("[data-iv-text]");
      if (
        node &&
        node === range.endContainer.parentElement?.closest("[data-iv-text]")
      ) {
        const parent = ps.find((x) => x.id === node.dataset.ivText),
          prefix = range.cloneRange();
        prefix.selectNodeContents(node);
        prefix.setEnd(range.startContainer, range.startOffset);
        const quote = range.toString(),
          start = prefix.toString().length;
        if (quote.trim() && quote !== parent.text) {
          excerpt = ps.find(
            (x) =>
              x.parent === parent.id && x.start === start && x.text === quote,
          ) || {
            id: uid(),
            source: s.source,
            text: quote,
            parent: parent.id,
            start,
            codes: [],
            reviewed: false,
          };
          p = excerpt;
        } else p = parent;
      }
    }
    const book = sharedBook(d);
    modal(
      "Label this passage",
      "<blockquote>" +
        esc(p.text) +
        "</blockquote>" +
        book
          .map(
            (e, i) =>
              `<label class="tick"><input type="checkbox" name="iv-label" value="${i}" ${p.codes.includes(e.label) ? "checked" : ""}>${chip(e.label)}</label>`,
          )
          .join("") +
        (!s.established
          ? '<label>New label<input id="iv-new" maxlength="100"></label><label>What does this label mean?<input id="iv-definition" maxlength="500"></label>'
          : ""),
      () => {
        const labels = [
          ...document.querySelectorAll("[name=iv-label]:checked"),
        ].map((n) => book[Number(n.value)].label);
        const added = val("iv-new").trim();
        if (added) {
          const existing = book.find(
            (e) => e.label.toLowerCase() === added.toLowerCase(),
          );
          labels.push(existing?.label || added);
          d.coding ||= {};
          d.coding.meanings ||= [];
          if (!existing)
            d.coding.meanings.push({
              label: added,
              definition: val("iv-definition").trim(),
            });
        }
        if (excerpt && !d.passages.includes(p))
          d.passages.splice(
            d.passages.indexOf(ps.find((x) => x.id === p.parent)) + 1,
            0,
            p,
          );
        p.codes = [...new Set(labels)];
        if (p.codingEvidence)
          p.codingEvidence = p.codingEvidence.filter((e) =>
            p.codes.includes(e.code),
          );
        p.reviewed = true;
        s.passage = p.id;
        changed();
        refresh();
      },
      "Save passage coding",
    );
    return;
  }
  if (act === "iv-done") {
    const ok = await askForm(
      "Finish checking this interview?",
      "<p>Confirm that you have checked the available text in <strong>" +
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
    notice("Pausing after the current batch.");
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
  }
  if (act === "iv-sample" || act === "iv-auto" || act === "iv-resume") {
    if (jobs.has(d)) return;
    const source = s.source;
    const sample = act === "iv-resume" ? s.draft.sample : act === "iv-sample";
    if (!sample && !s.established)
      throw Error("Confirm the shared labels before coding a whole interview.");
    const resuming = act === "iv-resume";
    const selection = await codingScope(
      d,
      s,
      sample,
      resuming,
      el.dataset?.scope,
      api,
    );
    if (!selection || (s.draft && act !== "iv-resume")) return;
    if (!sessionStorage.getItem("dv-session"))
      await api.unlock(selection.access);
    if (api.current() !== d || s.source !== source || jobs.has(d)) return;
    if (!resuming) {
      d.coding = { ...d.coding, focus: selection.focus };
      s.draft = {
        source: s.source,
        sources: selection.sources,
        sample,
        originalOnly: true,
        ids: sample ? selection.ids : null,
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
    const job = { stop: false };
    jobs.set(d, job);
    await api.checkpoint();
    refresh(false);
    try {
      while (draft.next < batches.length && !job.stop && api.current() === d) {
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
      jobs.delete(d);
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
    const positions = new Map();
    const targets = [];
    const selectedIds = draft.ids && new Set(draft.ids);
    for (const list of sourcePassages.values()) {
      list.forEach((p, i) => {
        positions.set(p.id, i + 1);
        if (
          (!draft.originalOnly || !p.parent) &&
          (!selectedIds || selectedIds.has(p.id))
        )
          targets.push(p);
      });
    }
    const reviewExcluded = {};
    const matches = checkedCollectedSuggestions(
      draft.matches,
      targets,
      guide,
      reviewExcluded,
    );
    const byPassage = new Map();
    matches.forEach((m, index) => {
      if (!byPassage.has(m.id)) byPassage.set(m.id, []);
      byPassage.get(m.id).push({ m, index });
    });
    const key = (id, code) => JSON.stringify([id, code]);
    const rejected = new Set(draft.rejected || []);
    const manual = new Set(draft.manual || []);
    const book = sharedBook(d);
    const canAdd = (p, label) =>
      !p.codes.includes(label) &&
      !(byPassage.get(p.id) || []).some(({ m }) => m.code === label);
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
                  `<label class="iv-match"><input type="checkbox" name="iv-match" value="${index}" ${rejected.has(key(m.id, m.code)) ? "" : "checked"}><span><small>Passage ${positions.get(m.id)}</small>${chip(m.code)}${draft.sample && m.definition ? "<small>" + esc(m.definition) + "</small>" : ""}<q>${esc(m.quote)}</q><small>${esc(m.reason)}</small></span></label>`,
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
              ? "<p>Already applied: " + p.codes.map(chip).join(" ") + "</p>"
              : "") +
            "<div data-missed-labels></div></details></section>",
        );
    });
    modal(
      "Review the suggested coding",
      `<p>${matches.length} proposed assignments across ${byPassage.size} of ${targets.length} passages in ${sources.length === 1 ? "<strong>" + esc(sources[0]) + "</strong>" : sources.length + " interviews"}. Read the full passage to check the meaning. Untick unsuitable suggestions and check for missed labels, including in passages that already have a suggestion.</p>` +
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
        const picked = matches.filter((m) => !rejected.has(key(m.id, m.code)));
        if (picked.length) {
          applyCodingBatch(d, picked, guide);
          const byId = new Map(targets.map((p) => [p.id, p]));
          for (const { id, code, quote } of picked) {
            const p = byId.get(id);
            p.codingEvidence ||= [];
            p.codingEvidence.push({ code, quote });
          }
        }
        const appliedIds = new Set(picked.map((m) => m.id));
        let added = 0;
        for (const p of targets) {
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
        if (
          draft.sample &&
          s.established &&
          sharedBook(d).length > book.length
        ) {
          establish(d);
          changed(d.sources);
        } else if (appliedIds.size)
          changed([
            ...new Set(
              targets.filter((p) => appliedIds.has(p.id)).map((p) => p.source),
            ),
          ]);
        await api.checkpoint();
        refresh(false);
        notice(
          picked.length +
            added +
            " label assignments applied. Check each interview before marking it as checked.",
        );
      },
      "Apply reviewed coding",
    );
    const form = get("modalform");
    for (const details of form.querySelectorAll("[data-review-passage]")) {
      details.ontoggle = () => {
        if (!details.open || details.dataset.filled) return;
        details.dataset.filled = "true";
        const p = targets[Number(details.dataset.reviewPassage)];
        const choices = book
          .map(({ label }, i) =>
            canAdd(p, label)
              ? `<label class="tick"><input type="checkbox" name="iv-missed" value="${i}" ${manual.has(key(p.id, label)) ? "checked" : ""}>${chip(label)}</label>`
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
