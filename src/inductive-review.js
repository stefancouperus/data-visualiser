import { esc } from "./chart.js";
import { bookEntries, labelKey } from "./coding.js";
import { chip } from "./interview-manual.js";

// Keep the model's original code as the link to its quotations. Edits only
// become project vocabulary when the student approves this review.
export function sampleLabels(matches, book, edits = []) {
  const existing = new Map(book.map((entry) => [labelKey(entry.label), entry]));
  const changes = new Map(
    edits.map((entry) => [labelKey(entry.original), entry]),
  );
  const rows = new Map();
  for (const match of matches) {
    if (typeof match?.code !== "string" || !match.code.trim()) continue;
    const id = labelKey(match.code);
    if (rows.has(id)) continue;
    const approved = existing.get(id);
    const edited = changes.get(id);
    rows.set(id, {
      original: match.code,
      label: approved?.label ?? edited?.label ?? match.code,
      definition:
        approved?.definition ?? edited?.definition ?? match.definition ?? "",
      keep: !!approved || edited?.keep !== false,
      existing: !!approved,
    });
  }
  return [...rows.values()];
}

export function reviewVocabulary(book, rows) {
  const additions = rows.filter((row) => row.keep && !row.existing);
  if (!book.length && !additions.length)
    throw Error(
      "Select at least one label to approve, or close this review to try another sample.",
    );
  const existingNames = new Set(
    book.flatMap((entry) =>
      [entry.label, entry.sourceLabel].filter(Boolean).map(labelKey),
    ),
  );
  const duplicate = additions.find((row) =>
    existingNames.has(labelKey(row.label)),
  );
  if (duplicate)
    throw Error(
      "The new label “" +
        duplicate.label.trim() +
        "” would duplicate an existing code. Choose a different name here, or use Manage labels to add it under another category.",
    );
  // An inductive review adds standalone labels. Keep the identities and
  // assignments of the previously approved codebook, including older projects.
  return additions.length ? [...book, ...bookEntries(additions)] : [...book];
}

export function sampleLabelEditor(rows, includeExamples, styles) {
  return `<section class="iv-proposed-labels"><h3>Labels for your codebook</h3>
  <p>Choose the labels to keep. You can edit a new label and its meaning once for all its quotations.</p>
  ${rows
    .map((row, index) =>
      row.existing
        ? `<div>${chip(row.label, styles)} <small>Already in your project.</small></div>`
        : `<fieldset data-draft-code="${esc(row.original)}" data-draft-index="${index}" aria-label="Review suggested label ${esc(row.original)}">
      <label class="tick"><input type="checkbox" name="iv-keep-label" ${row.keep ? "checked" : ""}>Keep this label</label>
      <label>Label<input name="iv-draft-label" value="${esc(row.label)}"></label>
      <label>Meaning<textarea name="iv-draft-definition" rows="2">${esc(row.definition)}</textarea></label></fieldset>`,
    )
    .join("")}
  <h3>Supporting passages</h3>
  <label class="tick"><input type="checkbox" name="iv-code-examples" ${includeExamples ? "checked" : ""}>Also code the selected sample passages</label>
  <small>Leave this unticked to approve just the codebook. You can then apply it to any interviews in step 2.</small></section>`;
}

export function bindSampleLabelEditor(
  form,
  draft,
  rows,
  matches,
  persist,
  onClose,
  styles,
) {
  const byOriginal = new Map(rows.map((row) => [labelKey(row.original), row]));
  const examples = form.elements.namedItem("iv-code-examples");
  let pending;
  function updateEvidence() {
    for (const input of form.querySelectorAll('[name="iv-match"]')) {
      const match = matches[Number(input.value)];
      const row = byOriginal.get(labelKey(match.code));
      input.hidden = !examples.checked;
      input.disabled = !examples.checked || !row.keep;
      const item = input.closest("label");
      item.classList.toggle("iv-omitted", !row.keep);
      item.querySelector("[data-preview-code]").innerHTML = chip(
        row.label.trim() || "Unnamed label",
        styles,
        row.original,
      );
      item.querySelector("[data-preview-meaning]").textContent = row.definition;
    }
    for (const chooser of form.querySelectorAll("[data-missed-labels]"))
      chooser.hidden = !examples.checked;
  }
  function flush() {
    if (!pending) return;
    clearTimeout(pending);
    pending = null;
    persist();
  }
  function changed(event) {
    const field = event.target;
    if (field === examples) draft.codeExamples = field.checked;
    else {
      const group = field.closest("[data-draft-index]");
      if (!group) return;
      const row = rows[Number(group.dataset.draftIndex)];
      row.keep = group.querySelector("[name=iv-keep-label]").checked;
      row.label = group.querySelector("[name=iv-draft-label]").value;
      row.definition = group.querySelector("[name=iv-draft-definition]").value;
      draft.labelEdits = rows
        .filter((entry) => !entry.existing)
        .map(({ original, label, definition, keep }) => ({
          original,
          label,
          definition,
          keep,
        }));
    }
    updateEvidence();
    clearTimeout(pending);
    pending = setTimeout(flush, 350);
  }
  form.addEventListener("input", changed);
  const dialog = form.closest("dialog");
  dialog.addEventListener("close", function closed() {
    if (form.isConnected && dialog.open) return;
    dialog.removeEventListener("close", closed);
    flush();
    onClose();
  });
  updateEvidence();
}
