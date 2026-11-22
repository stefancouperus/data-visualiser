import { esc } from "./chart.js";
import { applyCodingBatch, checkedSuggestions, bookEntries } from "./coding.js";
import { codingControls, bindCodingControls } from "./codebook-ui.js";
import { uid } from "./import.js";
import { askForm, button as b, get, modal, notice, val } from "./ui.js";
import {
  interviews,
  sharedBook,
  establish,
  finishInterview,
  interviewBatches,
  reviewedMatches,
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
export function interviewScreen(d) {
  const s = interviews(d),
    ps = d.passages.filter((p) => p.source === s.source),
    book = sharedBook(d);
  const done = s.done.includes(s.source),
    selected = ps.find((p) => p.id === s.passage) || ps[0];
  const job = jobs.has(d),
    draft = s.draft;
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
  <div class="iv-grid"><aside class="iv-side"><h2>Interviews</h2>${d.sources.map((source, i) => b("iv-source", esc(source) + "<small>" + (s.done.includes(source) ? "✓ Checked" : s.draft?.source === source ? "Draft in progress" : "To check") + "</small>", "iv-source", `data-index="${i}" aria-pressed="${source === s.source}" ${locked && source !== s.source ? "disabled" : ""}`)).join("")}
  ${b("iv-add", "+ Add interview", "", locked ? "disabled" : "")} ${b("download", "Save coding project", "plain")}</aside>
  <section class="iv-paper"><header><small>${d.excerptSources?.includes(s.source) ? "Imported passages" : "Transcript"}</small><h2>${esc(s.source)}</h2><p>${ps.length} passages · select a passage to label it, or highlight a shorter quotation.</p>${d.excerptSources?.includes(s.source) ? "<small>Check the coverage of your export. Only the imported passages can be coded or compared.</small>" : ""}</header>
  <div class="iv-text">${ps.map((p, i) => `<article class="iv-passage ${p.id === selected?.id ? "iv-selected" : ""}" data-iv-id="${esc(p.id)}"><button data-act="iv-select" data-id="${esc(p.id)}" aria-pressed="${p.id === selected?.id}" ${locked ? "disabled" : ""}>Passage ${i + 1}</button><p data-iv-text="${esc(p.id)}">${esc(p.text)}</p><div>${p.codes.map(chip).join("")}</div>${p.codingEvidence?.length ? "<details><summary>Words supporting these labels</summary>" + p.codingEvidence.map((e) => "<p>" + chip(e.code) + " “" + esc(e.quote) + "”</p>").join("") + "</details>" : ""}</article>`).join("")}</div>
  ${done ? "<p>✓ You have checked this interview.</p>" : b("iv-done", "Mark this interview as checked", "", locked || !book.length ? "disabled" : "")}</section>
  <aside class="iv-tools"><h2>Shared codebook</h2>${book.length ? '<div class="iv-legend">' + book.map((e) => "<div>" + chip(e.label) + (e.definition ? "<small>" + esc(e.definition) + "</small>" : "") + "</div>").join("") + "</div>" : "<p>Your labels and their meanings will appear here.</p>"}
  ${!locked && !shared ? methods : ""}
  ${!locked && !shared && s.method === "book" ? b("iv-book", "Upload or review codebook") : ""}
  ${!locked && !shared && s.method === "inductive" ? b("iv-sample", "Ask the bot for labels", "primary") : ""}
  ${!locked && !shared && s.method && book.length ? b("iv-establish", "Use these labels for all interviews") : ""}
  ${!locked && shared ? "<p>Use these same labels across interviews.</p>" + b("iv-editbook", "Edit shared codebook", "plain") + b("iv-auto", "Code this interview with the bot", "primary") : ""}
  ${!locked && (s.method || shared) && selected ? b("iv-manual", "Edit labels on selected text") : ""}
  ${!locked && !shared && s.method ? b("iv-change", "Choose another approach", "plain") : ""}
  ${draft ? `<section class="iv-review" aria-live="polite"><h3>${draft.sample ? "Suggested labels" : "Bot coding draft"}</h3><p>${draft.next} of ${draft.total} batches processed · ${draft.matches.length} suggested matches</p>${draft.error ? "<p>" + esc(draft.error) + "</p>" : ""}${job ? b("iv-stop", "Pause after this batch") : draft.next < draft.total ? b("iv-resume", "Resume coding") : b("iv-review", "Review suggested coding", "primary")}${job ? "" : b("iv-discard", "Discard draft", "plain")}</section>` : ""}
  </aside></div>`;
}
export async function interviewAction(act, el, d, api) {
  const s = interviews(d),
    ps = d.passages.filter((p) => p.source === s.source);
  const refresh = () => {
    if (api.current() === d) api.render();
  };
  if (
    s.draft &&
    !["iv-source", "iv-stop", "iv-resume", "iv-review", "iv-discard"].includes(
      act,
    )
  )
    throw Error("Finish reviewing or discard the current draft first.");
  function changed() {
    s.done = s.done.filter((name) => name !== s.source);
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
    const sample = act === "iv-resume" ? s.draft.sample : act === "iv-sample";
    if (!sample && !s.established)
      throw Error("Confirm the shared labels before coding a whole interview.");
    const plain = ps.filter((p) => !p.parent);
    const choices =
      sample && act !== "iv-resume"
        ? plain
            .map(
              (p, i) =>
                `<label class="tick"><input name="iv-example" type="checkbox" value="${esc(p.id)}" ${i < 6 ? "checked" : ""}>Passage ${i + 1} · ${esc(p.text.slice(0, 76))}</label>`,
            )
            .join("")
        : "";
    const selection = await askForm(
      sample
        ? "Suggest labels from selected passages"
        : "Code this interview with the bot",
      "<p>The university Data bot will receive " +
        (sample ? "the passages you tick" : "all imported passages") +
        " from <strong>" +
        esc(s.source) +
        "</strong> and your " +
        (sample ? "existing labels" : "shared codebook") +
        ". You will review its suggested matches before any labels are applied.</p>" +
        (sample && act !== "iv-resume"
          ? '<div class="iv-pick">' + choices + "</div>"
          : "") +
        (act !== "iv-resume"
          ? '<label>What should the bot look for? (optional)<input id="iv-focus" maxlength="600" value="' +
            esc(d.coding?.focus || api.focus()) +
            '"></label>'
          : "") +
        (!sessionStorage.getItem("dv-session")
          ? '<label>Workshop course code<input id="iv-access" type="password"></label>'
          : ""),
      () => {
        const ids = [
          ...document.querySelectorAll("[name=iv-example]:checked"),
        ].map((n) => n.value);
        if (sample && act !== "iv-resume" && (!ids.length || ids.length > 10))
          throw Error("Choose between one and ten passages.");
        return { ids, access: val("iv-access"), focus: val("iv-focus").trim() };
      },
      sample ? "Send selected passages" : "Send this interview",
    );
    if (!selection || (s.draft && act !== "iv-resume")) return;
    if (!sessionStorage.getItem("dv-session"))
      await api.unlock(selection.access);
    if (api.current() !== d) return;
    if (act !== "iv-resume") {
      changed();
      d.coding = { ...d.coding, focus: selection.focus };
      s.draft = {
        source: s.source,
        sample,
        ids: sample ? selection.ids : null,
        next: 0,
        matches: [],
        total: 0,
      };
    }
    const draft = s.draft,
      guide = draftGuide(d, sample),
      batches = interviewBatches(d, draft.source, draft.ids);
    draft.total = batches.length;
    draft.error = "";
    const job = { stop: false };
    jobs.set(d, job);
    refresh();
    try {
      while (draft.next < batches.length && !job.stop && api.current() === d) {
        const batch = batches[draft.next];
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
        const found = reviewedMatches(result, batch, guide);
        draft.skipped = (draft.skipped || 0) + result.length - found.length;
        draft.matches.push(...found);
        draft.next++;
        refresh();
      }
    } catch (e) {
      draft.error =
        e.message +
        " Your progress is saved in this draft. Resume to retry this batch.";
    } finally {
      jobs.delete(d);
      refresh();
    }
    return;
  }
  if (act === "iv-review") {
    const draft = s.draft,
      guide = draftGuide(d, draft.sample);
    const matches = checkedSuggestions(draft.matches, ps, guide);
    const targets = ps.filter((p) => !draft.ids || draft.ids.includes(p.id));
    const covered = new Set(matches.map((m) => m.id));
    const positions = new Map(ps.map((p, i) => [p.id, i + 1]));
    modal(
      "Review the suggested coding",
      `<p>${matches.length} proposed assignments across ${covered.size} of ${targets.length} passages in <strong>${esc(s.source)}</strong>. Untick any match you disagree with.</p>` +
        (draft.skipped
          ? "<p>" +
            draft.skipped +
            " additional suggestions were left out during checks on quotations, labels and duplicates.</p>"
          : "") +
        matches
          .map(
            (m, i) =>
              `<label class="iv-match"><input type="checkbox" name="iv-match" value="${i}" checked><span><small>Passage ${positions.get(m.id)}</small>${chip(m.code)}${draft.sample && m.definition ? "<small>" + esc(m.definition) + "</small>" : ""}<q>${esc(m.quote)}</q><small>${esc(m.reason)}</small></span></label>`,
          )
          .join("") +
        "<details><summary>Passages without a suggested match (" +
        (targets.length - covered.size) +
        ")</summary>" +
        targets
          .filter((p) => !covered.has(p.id))
          .map((p) => "<p>" + esc(p.text) + "</p>")
          .join("") +
        "</details>",
      () => {
        const picked = [
          ...document.querySelectorAll("[name=iv-match]:checked"),
        ].map((n) => matches[Number(n.value)]);
        if (picked.length) {
          applyCodingBatch(d, picked);
          const byId = new Map(ps.map((p) => [p.id, p]));
          for (const { id, code, quote } of picked) {
            const p = byId.get(id);
            p.codingEvidence ||= [];
            p.codingEvidence.push({ code, quote });
          }
        }
        delete s.draft;
        changed();
        refresh();
        notice(
          picked.length +
            " label assignments applied. Check the transcript before marking it as checked.",
        );
      },
      "Apply reviewed coding",
    );
    return;
  }
  refresh();
}
