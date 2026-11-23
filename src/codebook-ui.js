import { botSession } from "./bot-access.js";
import { esc } from "./chart.js";
import { readCodebookFile } from "./codebook-document.js";
import {
  applyCodebookCategories,
  groupCodebookEntries,
  labelAppearance,
} from "./label-appearance.js";
import { approvedBook, bookEntries, codingLimits, labelKey } from "./coding.js";
import { busyIndicator, formselect, get } from "./ui.js";

// A request belongs to its dataset. Closing the editor only dismisses its view.
const requests = new WeakMap();
const editors = new WeakMap();
const messages = new WeakMap();

export function codingControls(d, options = {}) {
  const mode =
    options.mode ||
    (d.coding?.bookDraft ? "deductive" : d.coding?.mode) ||
    "inductive";
  const edit = `<div id="codebook-controls" data-standalone="${!!options.standalone}" data-manual="${!!options.manual}">
    <p id="approved-book"></p>
    <div id="book-upload"><label>Upload your codebook<input id="book-file" type="file" accept=".pdf,.docx,.txt,.xlsx,.csv,.tsv"></label>
    <small>Choose a Word document, a PDF with selectable text, a text file or a spreadsheet. Select Extract labels to read the file. Sections that need interpretation may be sent to the Data bot.</small>
    <div class="bar"><button type="button" id="extract-book">Extract labels</button></div></div>
    <div class="bar"><button type="button" id="book-manual">Enter labels manually</button><button type="button" id="edit-book" hidden>Review approved labels</button></div>
    <p id="book-status" role="status"></p>
    <section id="book-draft" hidden><h3>Review your labels</h3><p id="book-instructions">Check the labels and their meanings. Your draft stays in this project when you close this window.</p>
    <details id="book-original"><summary>Read text from the upload</summary><pre class="book-source"></pre></details>
    <div id="book-rows"></div><div class="bar"><button type="button" id="book-add">Add label</button><button type="button" class="primary" id="use-book">Use these labels</button><button type="button" class="plain" id="cancel-book">Discard draft</button></div>
    <p role="alert" id="book-error" tabindex="-1"></p></section></div>`;
  if (options.standalone) return edit;
  return `<details${d.coding?.bookDraft ? " open" : ""}><summary>Code with the Data bot</summary>
    ${formselect(
      "coding-method",
      "How do you want to code?",
      [
        ["inductive", "Build labels from the passages (inductive)"],
        ["deductive", "Use my codebook (deductive)"],
      ],
      mode,
    )}
    <label>What are you trying to understand? (optional)<input id="coding-focus" maxlength="600" value="${esc(d.coding?.focus)}"></label>
    <p id="inductive-help">The bot reuses your labels. It can propose up to ${codingLimits.newPerBatch} new labels per batch and stops adding them at ${codingLimits.inductiveLabels} distinct labels.</p>
    ${edit}<small>Review up to ten passages at a time. The bot can suggest up to two labels per passage, counting any already applied. A passage may receive none.</small><div class="bar"><button type="button" id="suggestpass">Suggest codes for selected passages</button></div></details>`;
}

export function bindCodingControls(
  d,
  extract,
  onApprove,
  onDraftChange = () => {},
  ensureAccess,
) {
  const controls = get("codebook-controls");
  const form = controls.closest("form");
  const dialog = form.closest("dialog");
  const el = (id) => form.querySelector("#" + id);
  const standalone = controls.dataset.standalone === "true";
  const manual = controls.dataset.manual === "true";
  const file = el("book-file"),
    rows = el("book-rows"),
    status = el("book-status"),
    error = el("book-error");
  let displayed, timer, canMoveLabels;
  const isOpen = () => form.isConnected && dialog.open;
  const notify = () => {
    clearTimeout(timer);
    timer = null;
    onDraftChange();
  };
  const flush = () => {
    if (timer) notify();
  };
  function updateDraft() {
    if (!d.coding?.bookDraft || d.coding.bookDraft !== displayed) return;
    d.coding.bookDraft.entries = [...rows.querySelectorAll(".book-row")].map(
      (row) => {
        const category = row
          .closest(".book-category")
          ?.querySelector("[data-category]")
          .value.trim();
        return {
          label: row.querySelector("[data-label]").value,
          definition: row.querySelector("[data-definition]").value,
          ...(category && { category }),
        };
      },
    );
    for (const group of rows.querySelectorAll(".book-category")) {
      const name = group.querySelector("[data-category]").value.trim();
      const count = group.querySelectorAll(".book-row").length;
      group.querySelector("summary").textContent = categorySummary(name, count);
    }
    if (error.textContent) {
      error.textContent = "";
      for (const field of rows.querySelectorAll("[aria-invalid]")) {
        field.removeAttribute("aria-invalid");
        field.removeAttribute("aria-describedby");
      }
      rows.querySelector(".book-row-error")?.remove();
    }
    clearTimeout(timer);
    timer = setTimeout(notify, 350);
  }
  function appendRow(entry, container = rows) {
    const row = document.createElement("div");
    row.className = "book-row";
    row.innerHTML = `<label>Label<input data-label value="${esc(entry.label)}"></label><label>Meaning and rules<textarea data-definition>${esc(entry.definition)}</textarea></label><button type="button" class="plain">Remove label</button>`;
    row.querySelector("button").onclick = () => {
      const group = row.closest(".book-category");
      row.remove();
      if (group && !group.querySelector(".book-row")) group.remove();
      updateDraft();
    };
    if (canMoveLabels) {
      const move = document.createElement("button");
      move.type = "button";
      move.className = "plain";
      move.textContent = "Move label";
      move.onclick = () => {
        const previous = row.closest(".book-category");
        const targets = [...rows.querySelectorAll(".book-category")].filter(
          (group) => group !== previous,
        );
        if (!targets.length) {
          status.textContent = "There are no other categories in this draft.";
          return;
        }
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Move to category");
        select.add(new Option("Keep in current category", ""));
        targets.forEach((group, i) =>
          select.add(
            new Option(
              group.querySelector("[data-category]").value ||
                "Labels without a category",
              String(i),
            ),
          ),
        );
        move.hidden = true;
        move.after(select);
        const close = () => {
          select.remove();
          move.hidden = false;
        };
        select.onchange = () => {
          if (select.value !== "") {
            const target = targets[Number(select.value)];
            target.querySelector("[data-members]").append(row);
            target.open = true;
            if (previous && !previous.querySelector(".book-row"))
              previous.remove();
            updateDraft();
          }
          close();
          move.focus();
        };
        select.onblur = close;
        select.focus();
      };
      row.append(move);
    }
    container.append(row);
    return row;
  }
  function categorySummary(name, count) {
    return (
      (name || "Labels without a category") +
      " · " +
      count +
      (count === 1 ? " label" : " labels")
    );
  }
  function showDraftRows(entries) {
    const groups = groupCodebookEntries(entries);
    const groupedReview = groups.some(([category]) => category);
    canMoveLabels = groups.length > 1;
    el("book-instructions").textContent = groupedReview
      ? "Open a category to check its individual labels. You can rename a category or move a label. The category distinguishes labels with the same name when you apply them."
      : "Check the labels and their meanings. Your draft stays in this project when you close this window.";
    if (!groupedReview) {
      entries.forEach((entry) => appendRow(entry));
      return;
    }
    for (const [name, members] of groups) {
      const group = document.createElement("details");
      group.className = "book-category";
      group.open = !rows.children.length;
      group.innerHTML = `<summary>${esc(categorySummary(name, members.length))}</summary><label>Category name<input data-category value="${esc(name)}"></label><div data-members></div><button type="button" class="plain" data-add-in-category>Add label to this category</button>`;
      rows.append(group);
      const list = group.querySelector("[data-members]");
      for (const member of members) appendRow(member, list);
      group.querySelector("[data-add-in-category]").onclick = () => {
        const row = appendRow(empty(), list);
        updateDraft();
        row.querySelector("[data-label]").focus();
      };
    }
  }
  function show() {
    if (!isOpen()) return;
    const pending = requests.get(d),
      draft = d.coding?.bookDraft;
    const deductive = standalone || el("coding-method").value === "deductive";
    controls.hidden = !deductive;
    if (!standalone) {
      el("inductive-help").hidden = deductive;
      el("coding-method").disabled = !!pending;
      el("suggestpass").disabled =
        deductive &&
        (!d.coding?.book?.length ||
          !!pending ||
          !!draft ||
          !!file.files.length);
    }
    const book = d.coding?.book;
    if (el("apply-book-collection"))
      el("apply-book-collection").hidden =
        !book?.length || !!pending || !!draft || !!file.files.length;
    el("approved-book").textContent = book?.length
      ? book.length +
        " approved label" +
        (book.length === 1 ? "" : "s") +
        (d.coding.bookName ? " · " + d.coding.bookName : "")
      : "";
    el("approved-book").hidden = !book?.length;
    el("book-upload").hidden = !!draft || manual;
    el("book-manual").hidden = !!draft || !!pending || (standalone && !manual);
    el("edit-book").hidden =
      !book?.length || !!draft || !!pending || standalone;
    el("extract-book").disabled = !file.files.length || !!pending;
    file.disabled = !!pending;
    el("book-draft").hidden = !draft;
    if (standalone) {
      el("extract-book").hidden = !!draft || manual;
      el("use-book").hidden = !draft;
    }
    if (draft !== displayed) {
      displayed = draft;
      rows.replaceChildren();
      error.textContent = "";
      if (draft) {
        showDraftRows(draft.entries);
        el("book-original").hidden = !draft.sourceText;
        el("book-original").querySelector("pre").textContent = draft.sourceText;
      }
    }
    if (pending) status.innerHTML = busyIndicator(pending, false);
    else status.textContent = messages.get(d) || "";
  }
  function setDraft(draft, message = "") {
    d.coding ||= {};
    if (draft) d.coding.bookDraft = draft;
    else delete d.coding.bookDraft;
    messages.set(d, message);
    notify();
    editors.get(d)?.();
  }
  const empty = () => ({ label: "", definition: "" });
  function startManual() {
    setDraft({
      method: "manual",
      name: "Manual codebook",
      entries: [empty()],
      sourceText: "",
    });
    rows.querySelector("[data-label]")?.focus();
  }
  editors.set(d, show);
  if (standalone) {
    const actions = form.querySelector(".dialog-actions");
    const extractButton = el("extract-book");
    extractButton.classList.add("primary");
    actions.prepend(extractButton, el("use-book"));
    form.onsubmit = (event) => {
      event.preventDefault();
    };
  }
  dialog.addEventListener("close", function closed() {
    if (isOpen()) return; // A previous modal's queued close event.
    dialog.removeEventListener("close", closed);
    flush();
    if (editors.get(d) === show) editors.delete(d);
  });
  if (!standalone) el("coding-method").onchange = show;
  file.onchange = () => {
    messages.delete(d);
    show();
  };
  rows.oninput = updateDraft;
  el("book-manual").onclick = startManual;
  el("book-add").onclick = () => {
    const row = appendRow(empty());
    updateDraft();
    row.querySelector("[data-label]").focus();
  };
  el("edit-book").onclick = () => {
    const styles = labelAppearance(d);
    setDraft({
      method: "manual",
      name: d.coding.bookName || "Project codebook",
      entries: approvedBook(d).map((entry) => ({
        ...entry,
        label: entry.sourceLabel || entry.label,
        category:
          styles.get(labelKey(entry.label))?.category || entry.category || "",
      })),
      sourceText: "",
    });
  };
  el("cancel-book").onclick = () => {
    file.value = "";
    setDraft(null);
  };
  el("extract-book").onclick = async () => {
    const source = file.files[0];
    if (!source || requests.has(d) || d.coding?.bookDraft) return;
    if (!botSession()) {
      try {
        if (
          (await ensureAccess("Extract labels from a codebook")) &&
          isOpen()
        ) {
          messages.set(
            d,
            "Course code confirmed. Choose Extract labels to read your codebook.",
          );
          show();
          el("extract-book").focus();
        }
      } catch (err) {
        if (isOpen()) status.textContent = err.message;
      }
      return;
    }
    const approved = d.coding?.book;
    requests.set(d, "Reading the codebook…");
    show();
    try {
      const document = await readCodebookFile(source);
      const sourceText = document.text;
      if (!sourceText.trim())
        throw Error(
          "This file has no selectable text. Use a text-based PDF, Word document or spreadsheet.",
        );
      if (sourceText.length > 65000)
        throw Error(
          "Upload the section containing your labels and definitions (up to 65,000 characters).",
        );
      requests.set(d, "Extracting labels from your codebook…");
      editors.get(d)?.();
      const result = await extract(document);
      const response = result?.entries;
      if (
        !Array.isArray(response) ||
        response.some(
          (row) =>
            typeof row?.label !== "string" ||
            typeof row.definition !== "string" ||
            (row.category != null && typeof row.category !== "string"),
        )
      )
        throw Error("The bot returned an unreadable codebook. Try again.");
      if (d.coding?.bookDraft || d.coding?.book !== approved)
        throw Error(
          "The project codebook changed while the bot was reading. Your newer work has been kept.",
        );
      const count = response.length;
      setDraft(
        {
          method: "upload",
          name: source.name,
          entries: response,
          sourceText,
        },
        (count
          ? count + " draft label" + (count === 1 ? "" : "s") + " to check."
          : "Check the source text and add any missing labels.") +
          (result.omitted
            ? " Some suggestions could not be matched to the source. Compare your draft with the uploaded text."
            : ""),
      );
    } catch (err) {
      messages.set(d, err.message);
    } finally {
      requests.delete(d);
      editors.get(d)?.();
    }
  };
  el("use-book").onclick = async () => {
    const draft = d.coding?.bookDraft;
    if (!draft || requests.has(d)) return;
    try {
      // Read current controls as well, including autofill or an edit still in focus.
      updateDraft();
      // A label already applied to passages keeps its identity if its sibling
      // with the same name is removed from a revised codebook.
      const scopedKey = (category, label) =>
        JSON.stringify([category || "", label]);
      const previous = new Map(
        approvedBook(d)
          .filter((e) => e.sourceLabel)
          .map((e) => [scopedKey(e.category, e.sourceLabel), e.label]),
      );
      const book = bookEntries(
        draft.entries.map((row) => ({
          ...row,
          previousLabel: previous.get(
            scopedKey(row.category, row.label.trim()),
          ),
        })),
      );
      clearTimeout(timer);
      timer = null;
      d.coding = {
        ...d.coding,
        mode: "deductive",
        focus: el("coding-focus")?.value.trim() ?? d.coding?.focus ?? "",
        book,
        bookName: draft.name,
      };
      applyCodebookCategories(d, book);
      delete d.coding.bookDraft;
      messages.set(d, "Codebook approved.");
      file.value = "";
      show();
      await onApprove(book);
    } catch (err) {
      error.textContent = err.message;
      const seen = new Set();
      const invalid = [...rows.querySelectorAll("[data-label]")].find(
        (field) => {
          const label = labelKey(field.value);
          const category =
            field.closest(".book-category")?.querySelector("[data-category]")
              .value || "";
          const key = JSON.stringify([labelKey(category), label]);
          if (!label || seen.has(key)) return true;
          seen.add(key);
          return false;
        },
      );
      if (invalid) {
        const hint = document.createElement("small");
        hint.className = "book-row-error";
        hint.id = "book-row-error";
        hint.textContent = err.message;
        const group = invalid.closest(".book-category");
        if (group) group.open = true;
        invalid.closest("label").append(hint);
        invalid.setAttribute("aria-invalid", "true");
        invalid.setAttribute("aria-describedby", hint.id);
        invalid.focus();
      } else if (draft === d.coding?.bookDraft) {
        el("book-add").focus();
      } else {
        status.textContent = err.message;
      }
    }
  };
  if (manual && !d.coding?.bookDraft && !requests.has(d)) startManual();
  else show();
}
