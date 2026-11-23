import { esc } from "./chart.js";
import { uid } from "./import.js";
import { approvedBook, labelKey } from "./coding.js";
import {
  sharedBook,
  pruneEmptyQuotations,
  retainInterviewVocabulary,
} from "./interviews.js";
import { askForm, button, formselect, get, modal, notice, val } from "./ui.js";

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
function colour(label) {
  let hash = 0;
  for (const c of label) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return colours[hash % colours.length];
}
export function chip(label) {
  return (
    '<span class="iv-chip" style="--chip:' +
    colour(label) +
    '">' +
    esc(label) +
    "</span>"
  );
}

// Older projects can contain quotations saved within earlier quotations.
// Leave an unanchored record visible on its own if its original text is missing.
function transcriptIndex(passages) {
  const byId = new Map(passages.map((p) => [p.id, p]));
  const positions = new Map(),
    excerpts = new Map(),
    originals = [];
  for (const p of passages) {
    let original = p,
      start = 0;
    const seen = new Set();
    while (original.parent && !seen.has(original.id)) {
      seen.add(original.id);
      const parent = byId.get(original.parent);
      if (
        !parent ||
        parent.source !== original.source ||
        !Number.isInteger(original.start) ||
        original.start < 0 ||
        parent.text.slice(
          original.start,
          original.start + original.text.length,
        ) !== original.text
      )
        break;
      start += original.start;
      original = parent;
    }
    if (original === p) originals.push(p);
    else {
      if (!excerpts.has(original.id)) excerpts.set(original.id, []);
      excerpts.get(original.id).push({ p, start });
    }
    positions.set(p.id, { original, start });
  }
  const numbers = new Map();
  const counts = new Map();
  for (const p of originals) {
    const number = (counts.get(p.source) || 0) + 1;
    numbers.set(p.id, number);
    counts.set(p.source, number);
  }
  for (const [id, position] of positions)
    numbers.set(id, numbers.get(position.original.id));
  return { originals, positions, excerpts, numbers };
}

export function transcriptOrdinals(passages) {
  return transcriptIndex(passages).numbers;
}

function evidenceForText(parent, quote) {
  return (
    parent.codingEvidence?.filter(
      (e) =>
        e.quote === quote &&
        parent.codes.includes(e.code) &&
        parent.text.indexOf(quote) === parent.text.lastIndexOf(quote),
    ) || []
  );
}

function rangeTarget(index, original, start, end) {
  const text = original.text.slice(start, end);
  if (!start && end === original.text.length)
    return {
      original,
      p: original,
      text,
      codes: [...original.codes],
      whole: true,
    };
  const existing = index.excerpts
    .get(original.id)
    ?.find((item) => item.start === start && item.p.text === text)?.p;
  const evidence = evidenceForText(original, text);
  return {
    original,
    p: existing,
    start,
    end,
    text,
    evidence,
    codes: [
      ...new Set([...(existing?.codes || []), ...evidence.map((e) => e.code)]),
    ],
  };
}

function quotationRanges(index, original) {
  const ranges = new Map();
  function add(start, text, labels) {
    if (!labels.length || !text.length) return;
    const end = start + text.length,
      key = start + ":" + end;
    if (!ranges.has(key)) ranges.set(key, { start, end, labels: new Set() });
    for (const label of labels) ranges.get(key).labels.add(label);
  }
  for (const { p, start } of index.excerpts.get(original.id) || [])
    add(start, p.text, p.codes);
  for (const e of original.codingEvidence || []) {
    if (!e.quote || !original.codes.includes(e.code)) continue;
    const start = original.text.indexOf(e.quote);
    if (start >= 0 && original.text.lastIndexOf(e.quote) === start)
      add(start, e.quote, [e.code]);
  }
  return [...ranges.values()].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
}
function highlightedText(original, ranges) {
  const points = [
    ...new Set([
      0,
      original.text.length,
      ...ranges.flatMap((r) => [r.start, r.end]),
    ]),
  ].sort((a, b) => a - b);
  return points
    .slice(1)
    .map((end, i) => {
      const start = points[i],
        text = esc(original.text.slice(start, end));
      const hits = ranges.filter((r) => r.start <= start && end <= r.end);
      if (!hits.length) return text;
      const labels = [...new Set(hits.flatMap((r) => [...r.labels]))];
      const first = hits[0];
      const attr =
        hits.length === 1
          ? `data-iv-quotation="${esc(original.id)}" data-start="${first.start}" data-end="${first.end}"`
          : "";
      return `<mark class="iv-highlight" style="--chip:${colour(labels[0])}" title="${esc(labels.join(", "))}" ${attr}>${text}</mark>`;
    })
    .join("");
}

export function transcriptRows(passages, selected) {
  const index = transcriptIndex(passages);
  const selectedId = index.positions.get(selected?.id)?.original.id;
  const ordinals = index.numbers;
  return index.originals
    .map((p) => {
      const ranges = quotationRanges(index, p);
      const unlocated = (p.codingEvidence || []).filter(
        (e) =>
          !e.quote ||
          p.text.indexOf(e.quote) < 0 ||
          p.text.indexOf(e.quote) !== p.text.lastIndexOf(e.quote),
      );
      const links = ranges
        .map((r) => {
          const quote = p.text.slice(r.start, r.end),
            short = quote.length > 72 ? quote.slice(0, 69) + "…" : quote;
          return button(
            "iv-excerpt",
            "“" + esc(short) + "” " + [...r.labels].map(chip).join(" "),
            "iv-quotation-button",
            `data-id="${esc(p.id)}" data-start="${r.start}" data-end="${r.end}" title="Edit labels on this quotation"`,
          );
        })
        .join("");
      return `<article class="iv-passage ${p.id === selectedId ? "iv-selected" : ""}" data-iv-id="${esc(p.id)}"><button data-act="iv-select" data-id="${esc(p.id)}" aria-pressed="${p.id === selectedId}">${p.parent ? "Saved quotation" : "Passage"} ${ordinals.get(p.id)}</button><p data-iv-text="${esc(p.id)}">${highlightedText(p, ranges)}</p><div>${p.codes.map(chip).join("")}</div>${links ? '<div class="iv-quotation-list">' + links + "</div>" : ""}${unlocated.length ? "<details><summary>Recorded supporting words</summary><small>The location of these words is ambiguous. Use the passage label to edit the assignment.</small>" + unlocated.map((e) => "<p>" + chip(e.code) + " “" + esc(e.quote) + "”</p>").join("") + "</details>" : ""}</article>`;
    })
    .join("");
}

export function transcriptEndpoint(node, offset) {
  if (!node) return;
  const text = (
    node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  )?.closest("[data-iv-text]");
  if (!text) return;
  const prefix = document.createRange();
  prefix.selectNodeContents(text);
  prefix.setEnd(node, offset);
  return { id: text.dataset.ivText, offset: prefix.toString().length };
}

function selectedTargets(ps, selected, explicit) {
  const index = transcriptIndex(ps);
  const current =
    ps.find((p) => p.id === (explicit?.id || selected)) || (!explicit && ps[0]);
  if (!current) throw Error("Select a passage in an interview first.");
  if (explicit?.id) {
    const first = Number(explicit.start),
      last = Number(explicit.end);
    if (
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first < 0 ||
      last > current.text.length ||
      first >= last
    )
      throw Error("Select the quotation again.");
    return [rangeTarget(index, current, first, last)];
  }
  const selection = window.getSelection();
  if (selection?.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const start = transcriptEndpoint(range.startContainer, range.startOffset),
      end = transcriptEndpoint(range.endContainer, range.endOffset);
    if (!start || !end)
      throw Error(
        "Start and end your selection inside the transcript text, or click a passage to label it.",
      );
    const first = index.originals.findIndex((p) => p.id === start.id);
    const last = index.originals.findIndex((p) => p.id === end.id);
    if (first < 0 || last < first)
      throw Error("Select text in the open interview.");
    const targets = index.originals
      .slice(first, last + 1)
      .map((p) =>
        rangeTarget(
          index,
          p,
          p.id === start.id ? start.offset : 0,
          p.id === end.id ? end.offset : p.text.length,
        ),
      )
      .filter((t) => t.text.trim());
    if (!targets.length) throw Error("Select words to label.");
    return targets;
  }
  const position = index.positions.get(current.id);
  return [
    rangeTarget(
      index,
      position.original,
      position.start,
      position.start + current.text.length,
    ),
  ];
}

export function manageLabels(d, api, refresh, initial = "") {
  const book = sharedBook(d);
  modal(
    "Manage project labels",
    '<div class="iv-label-editor">' +
      formselect(
        "iv-label-choice",
        "Choose a label",
        [
          ["", "Add a new label"],
          ...book.map((entry, i) => [String(i), entry.label]),
        ],
        initial,
      ) +
      '<label>Label name<input id="iv-label-name" maxlength="100" required></label><label>Meaning (optional)<textarea id="iv-label-meaning" maxlength="500"></textarea></label><p id="iv-label-usage"></p>' +
      (d.interviews?.draft ? '<p id="iv-label-draft" role="status"></p>' : "") +
      '<button type="button" class="iv-remove-label" id="iv-label-delete">Remove label</button></div>',
    () => {
      const i = val("iv-label-choice");
      api.changeLabel({
        oldLabel: i === "" ? undefined : book[Number(i)].label,
        label: val("iv-label-name").trim(),
        definition: val("iv-label-meaning").trim(),
      });
      refresh();
    },
    "Save label",
  );
  function show() {
    const i = val("iv-label-choice"),
      entry = i === "" ? null : book[Number(i)];
    get("iv-label-name").value = entry?.label || "";
    get("iv-label-meaning").value = entry?.definition || "";
    get("iv-label-delete").hidden = !entry;
    const count = entry
      ? d.passages.filter((p) =>
          p.codes.some((label) => labelKey(label) === labelKey(entry.label)),
        ).length
      : 0;
    get("iv-label-usage").textContent = entry
      ? "Applied to " +
        count +
        (count === 1 ? " passage or quotation." : " passages or quotations.")
      : "";
    const changedMeaning = () => {
      const hint = get("iv-label-draft");
      if (!hint) return;
      const newMeaning =
        entry &&
        get("iv-label-meaning").value.trim() !==
          (entry.definition || "").trim();
      hint.hidden = !!entry && !newMeaning;
      hint.textContent = newMeaning
        ? "Saving this new meaning clears its unapproved suggestions. Run the bot again to check earlier passages using the new meaning."
        : "A fresh bot run can look for this new label in passages the current draft has already checked.";
    };
    get("iv-label-meaning").oninput = changedMeaning;
    changedMeaning();
    get("iv-label-delete").onclick = async () => {
      if (!entry) return;
      const accepted = await askForm(
        "Remove “" + entry.label + "” from this project?",
        "<p>This removes the label from the codebook and its " +
          count +
          (count === 1 ? " application" : " applications") +
          " across the interviews. The transcript text stays available.</p>" +
          (book.length === 1 &&
          d.interviews?.draft &&
          !d.interviews.draft.sample
            ? "<p>The current draft will close because it will have no shared labels to apply.</p>"
            : ""),
        () => true,
        "Remove label",
      );
      if (api.current() !== d) return;
      if (!accepted) {
        manageLabels(d, api, refresh, i);
        return;
      }
      api.changeLabel({ oldLabel: entry.label, remove: true });
      refresh();
      notice("Label removed.");
    };
  }
  get("iv-label-choice").onchange = show;
  show();
}

export function editPassageLabels(d, s, ps, api, refresh, explicit) {
  const targets = selectedTargets(ps, s.passage, explicit);
  const fixed = s.established && approvedBook(d).length > 0;
  const book = fixed ? approvedBook(d) : sharedBook(d),
    originalSource = s.source;
  const selections = targets.map((t) => new Set(t.codes.map(labelKey)));
  modal(
    targets.length === 1
      ? targets[0].whole
        ? "Label this passage"
        : "Label this quotation"
      : "Label selected text",
    "<p><strong>" +
      esc(originalSource) +
      '</strong></p><div class="iv-selection-preview">' +
      targets
        .map((t) => "<blockquote>" + esc(t.text) + "</blockquote>")
        .join("") +
      "</div>" +
      (targets.length > 1
        ? "<p>Your selection spans " +
          targets.length +
          " passages. A mixed checkbox means the label applies to some of them. Changing it updates each selected part.</p>"
        : "") +
      book
        .map(
          (e, i) =>
            `<label class="tick"><input type="checkbox" name="iv-label" value="${i}">${chip(e.label)}</label>`,
        )
        .join("") +
      (fixed
        ? "<small>Tick the approved labels that fit these words. To change the codebook, choose Manage labels.</small>"
        : '<label>New label<input id="iv-new" maxlength="100"></label><label>What does this label mean? (optional)<input id="iv-definition" maxlength="500"></label>'),
    () => {
      if (api.current() !== d || s.source !== originalSource)
        throw Error("Open the intended interview and select the text again.");
      const inputs = [...get("modalform").querySelectorAll("[name=iv-label]")];
      const entered = val("iv-new").trim();
      const added =
        book.find((e) => labelKey(e.label) === labelKey(entered))?.label ||
        entered;
      if (!added && val("iv-definition").trim())
        throw Error("Enter a name for the new label.");
      if (entered && !book.some((e) => e.label === added))
        api.changeLabel({
          label: entered,
          definition: val("iv-definition").trim(),
        });
      const removed = [];
      let changed = false,
        reviewed = false;
      for (const target of targets) {
        const { original } = target;
        const next = new Set(target.codes);
        for (const input of inputs) {
          if (input.indeterminate) continue;
          const code = book[Number(input.value)].label;
          for (const current of next)
            if (labelKey(current) === labelKey(code)) next.delete(current);
          if (input.checked) next.add(code);
        }
        if (added) next.add(added);
        const previous = target.codes;
        if (
          next.size === previous.length &&
          previous.every((code) => next.has(code))
        ) {
          if (target.whole && !original.reviewed) {
            original.reviewed = true;
            reviewed = true;
          }
          continue;
        }
        changed = true;
        const deleted = previous.filter((code) => !next.has(code));
        for (const label of deleted) {
          removed.push(JSON.stringify([original.id, label]));
          if (target.p && original !== target.p)
            removed.push(JSON.stringify([target.p.id, label]));
        }
        if (target.whole) {
          original.codes = [...next];
          original.reviewed = true;
          if (original.codingEvidence)
            original.codingEvidence = original.codingEvidence.filter((e) =>
              next.has(e.code),
            );
        } else {
          const keptEvidence = target.evidence.filter((e) => next.has(e.code));
          if (keptEvidence.length !== target.evidence.length) {
            const dropping = new Set(
              target.evidence.filter((e) => !next.has(e.code)),
            );
            original.codingEvidence = original.codingEvidence.filter(
              (e) => !dropping.has(e),
            );
            original.codes = original.codes.filter(
              (code) =>
                !deleted.includes(code) ||
                original.codingEvidence.some((e) => e.code === code),
            );
          }
          let p = target.p;
          const codes = [...next].filter(
            (label) =>
              p?.codes.includes(label) ||
              !keptEvidence.some((e) => e.code === label),
          );
          if (!p && codes.length) {
            p = {
              id: uid(),
              source: original.source,
              parent: original.id,
              start: target.start,
              text: target.text,
              codes: [],
              reviewed: true,
            };
            d.passages.splice(d.passages.indexOf(original) + 1, 0, p);
          }
          if (p) {
            p.codes = codes;
            if (p.codingEvidence)
              p.codingEvidence = p.codingEvidence.filter((e) =>
                codes.includes(e.code),
              );
            p.reviewed = true;
          }
        }
        s.passage = original.id;
      }
      if (changed) {
        retainInterviewVocabulary(d, book);
        if (!s.method) s.method = "manual";
        s.done = s.done.filter((name) => name !== originalSource);
        s.finished = false;
        if (s.draft) {
          const rejected = new Set([...(s.draft.rejected || []), ...removed]);
          s.draft = {
            ...s.draft,
            rejected: [...rejected],
            manual: (s.draft.manual || []).filter((key) => !rejected.has(key)),
          };
        }
        pruneEmptyQuotations(d);
      }
      if (changed || reviewed) refresh();
    },
    "Save passage coding",
  );
  get("modalform")
    .querySelectorAll("[name=iv-label]")
    .forEach((input, i) => {
      const count = selections.filter((set) =>
        set.has(labelKey(book[i].label)),
      ).length;
      input.checked = count === targets.length;
      input.indeterminate = count > 0 && count < targets.length;
    });
}
