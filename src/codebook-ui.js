import { botSession } from "./bot-access.js";
import { esc } from "./chart.js";
import { readCodebookFile } from "./codebook-document.js";
import {
  applyCodebookCategories,
  groupCodebookEntries,
  labelAppearance,
} from "./label-appearance.js";
import {
  approvedBook,
  bookEntries,
  codingLimits,
  labelKey,
  labelVocabulary,
} from "./coding.js";
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
    <div id="book-rows"></div><div class="bar"><button type="button" id="book-add">Add label</button><button type="button" id="book-add-category">Add category</button><button type="button" class="primary" id="use-book">Use these labels</button><button type="button" class="plain" id="cancel-book">Discard draft</button></div>
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
  remapPreviousLabels = () => {},
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
  let displayed, timer;
  const isOpen = () => form.isConnected && dialog.open;
  const notify = () => {
    clearTimeout(timer);
    timer = null;
    onDraftChange();
  };
  const flush = () => {
    if (timer) notify();
  };
  const categoryGroups = () => [...rows.querySelectorAll(".book-category")];
  const categoryName = (group) =>
    group.querySelector("[data-category]").value.trim();
  function updateDraft() {
    const draft = d.coding?.bookDraft;
    if (!draft || draft !== displayed) return;
    const groups = categoryGroups();
    const names = groups.map(categoryName);
    if (names.length) draft.categories = names;
    else delete draft.categories;
    draft.entries = [...rows.querySelectorAll(".book-row")].map((row) => {
      const categoryIndex = groups.indexOf(row.closest(".book-category"));
      const category = names[categoryIndex];
      return {
        label: row.querySelector("[data-label]").value,
        definition: row.querySelector("[data-definition]").value,
        ...(categoryIndex >= 0 && { categoryIndex }),
        ...(category && { category }),
        ...(row.dataset.originalLabel && {
          originalLabel: row.dataset.originalLabel,
        }),
      };
    });
    updateCategoryControls();
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
  function updateCategoryControls() {
    const groups = categoryGroups();
    for (const group of groups) {
      const name = categoryName(group);
      const count = group.querySelectorAll(".book-row").length;
      group.querySelector("summary").textContent =
        (name || "New category") +
        " · " +
        count +
        (count === 1 ? " label" : " labels");
      group.querySelector("[data-remove-category]").hidden = count > 0;
    }
    for (const move of rows.querySelectorAll("[data-move-label]")) {
      move.hidden = groups.length === 0;
    }
    const instructions = el("book-instructions");
    if (groups.length)
      instructions.textContent =
        "Choose Add label to this category for a sublabel, or Add label for an ungrouped label. You can use the same sublabel under different categories.";
    else if (displayed?.method === "upload")
      instructions.textContent =
        "Check the extracted labels and their meanings. Choose Add category to group related labels. Your draft is saved when you close this window.";
    else
      instructions.textContent =
        "Enter your labels and what they mean. Choose Add category to group related labels. Your draft is saved when you close this window.";
  }
  function moveLabel(row, move) {
    const previous = row.closest(".book-category");
    const targets = categoryGroups().filter((group) => group !== previous);
    if (previous) targets.push(null);
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Move to category");
    select.add(new Option("Choose a destination", ""));
    targets.forEach((group, i) =>
      select.add(
        new Option(
          group ? categoryName(group) || "New category" : "Without a category",
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
        if (target) {
          target.querySelector("[data-members]").append(row);
          target.open = true;
        } else {
          rows.insertBefore(row, rows.querySelector(".book-category"));
        }
        updateDraft();
      }
      close();
      move.focus();
    };
    select.onblur = close;
    select.focus();
  }
  function appendRow(entry, container = rows) {
    const row = document.createElement("div");
    row.className = "book-row";
    if (entry.originalLabel) row.dataset.originalLabel = entry.originalLabel;
    row.innerHTML = `<label>Label<input data-label value="${esc(entry.label)}"></label><label>Meaning and rules<textarea data-definition>${esc(entry.definition)}</textarea></label><button type="button" class="plain" data-remove-label>Remove label</button><button type="button" class="plain" data-move-label>Move label</button>`;
    row.querySelector("[data-remove-label]").onclick = () => {
      row.remove();
      updateDraft();
    };
    const move = row.querySelector("[data-move-label]");
    move.onclick = () => moveLabel(row, move);
    if (container === rows)
      rows.insertBefore(row, rows.querySelector(".book-category"));
    else container.append(row);
    return row;
  }
  function addRow(container = rows) {
    const row = appendRow(empty(), container);
    updateDraft();
    row.querySelector("[data-label]").focus();
  }
  function appendCategory(name) {
    const group = document.createElement("details");
    group.className = "book-category";
    group.open = !rows.querySelector(".book-category");
    group.innerHTML = `<summary>New category</summary><label>Category name<input data-category value="${esc(name)}"></label><div data-members></div><button type="button" class="plain" data-add-in-category>Add label to this category</button><button type="button" class="plain" data-remove-category>Remove category</button>`;
    rows.append(group);
    group.querySelector("[data-add-in-category]").onclick = () =>
      addRow(group.querySelector("[data-members]"));
    group.querySelector("[data-remove-category]").onclick = () => {
      if (group.querySelector(".book-row")) return;
      group.remove();
      updateDraft();
      el("book-add-category").focus();
    };
    return group;
  }
  function showDraftRows(draft) {
    if (draft.categories) {
      const groups = draft.categories.map(appendCategory);
      for (const entry of draft.entries) {
        appendRow(
          entry,
          groups[entry.categoryIndex]?.querySelector("[data-members]"),
        );
      }
    } else {
      for (const [name, members] of groupCodebookEntries(draft.entries)) {
        const list = name
          ? appendCategory(name).querySelector("[data-members]")
          : rows;
        for (const entry of members) appendRow(entry, list);
      }
    }
    updateCategoryControls();
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
        showDraftRows(draft);
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
  el("book-add").onclick = () => addRow();
  el("book-add-category").onclick = () => {
    // A student may start with categories before entering their first label.
    const starter = rows.querySelector(":scope > .book-row:only-child");
    if (
      starter &&
      !starter.querySelector("[data-label]").value.trim() &&
      !starter.querySelector("[data-definition]").value.trim() &&
      !starter.dataset.originalLabel
    )
      starter.remove();
    const group = appendCategory("");
    group.open = true;
    updateDraft();
    group.querySelector("[data-category]").focus();
  };
  el("edit-book").onclick = () => {
    const styles = labelAppearance(d);
    const categories = [...(d.coding.categories || [])];
    const entries = approvedBook(d).map((entry) => {
      const category =
        styles.get(labelKey(entry.label))?.category || entry.category || "";
      let categoryIndex = -1;
      if (category) {
        categoryIndex = categories.findIndex(
          (name) => labelKey(name) === labelKey(category),
        );
        if (categoryIndex < 0) categoryIndex = categories.push(category) - 1;
      }
      return {
        originalLabel: entry.label,
        label: entry.sourceLabel || entry.label,
        definition: entry.definition,
        ...(categoryIndex >= 0 && { category, categoryIndex }),
      };
    });
    setDraft({
      method: "manual",
      name: d.coding.bookName || "Project codebook",
      entries,
      ...(categories.length && { categories }),
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
    let invalidField;
    try {
      // Read current controls as well, including autofill or an edit still in focus.
      updateDraft();
      const groups = categoryGroups();
      const seen = new Set();
      const names = groups.map((group) => {
        const name = categoryName(group)
          .split("›")
          .map((part) => part.trim())
          .filter(Boolean)
          .join(" › ");
        if (!name || seen.has(labelKey(name))) {
          invalidField = group.querySelector("[data-category]");
          throw Error(
            name
              ? "Give each category a distinct name."
              : "Name this category or remove it before approving the codebook.",
          );
        }
        seen.add(labelKey(name));
        return name;
      });
      // Match an existing entry by its original identity when editing the book,
      // or by its full branch and sublabel when reviewing a replacement upload.
      const applied = new Set(d.passages.flatMap((p) => p.codes).map(labelKey));
      const styles = d.coding.labelStyles || [];
      const styledCategory = new Map(
        styles.map((entry) => [labelKey(entry.label), entry.category]),
      );
      const previous = labelVocabulary([
        ...(d.coding.book || []),
        ...(d.coding.meanings || []),
        ...styles,
        ...d.passages.flatMap((p) => p.codes),
      ]).map((entry) => ({
        ...entry,
        category:
          entry.category || styledCategory.get(labelKey(entry.label)) || "",
      }));
      const scopedKey = (category, label) =>
        JSON.stringify([labelKey(category || ""), labelKey(label)]);
      const byId = new Map(previous.map((e) => [e.label, e]));
      const byScope = new Map();
      for (const entry of previous) {
        const scope = scopedKey(
          entry.category,
          entry.sourceLabel || entry.label,
        );
        if (!byScope.has(scope)) byScope.set(scope, entry);
      }
      // An explicitly edited row owns its old code. A newly added row with the
      // old name must not claim that same row's earlier annotations.
      const reserved = new Set(
        draft.entries.map((row) => row.originalLabel).filter(Boolean),
      );
      const oldRows = [];
      const entries = draft.entries.map((row) => {
        const category = names[row.categoryIndex] || row.category || "";
        const scoped = scopedKey(category, row.label);
        const candidate = byScope.get(scoped);
        const old =
          byId.get(row.originalLabel) ||
          (candidate && !reserved.has(candidate.label) ? candidate : undefined);
        oldRows.push(old);
        // Retain an existing qualified identity even when its sibling is removed.
        const sameScope =
          old &&
          scopedKey(old.category, old.sourceLabel || old.label) === scoped;
        return {
          ...row,
          category,
          previousLabel: sameScope ? old.label : undefined,
        };
      });
      // In a replacement book even a single remaining leaf may share its name
      // with an omitted branch. Keep those historical passage codes separate.
      const retained = new Set(oldRows);
      const omittedEntries = previous.filter((entry) => !retained.has(entry));
      const omitted = new Set(
        omittedEntries.map((entry) => labelKey(entry.label)),
      );
      const historical = omittedEntries.filter((entry) =>
        applied.has(labelKey(entry.label)),
      );
      for (const entry of entries) {
        if (!entry.previousLabel && omitted.has(labelKey(entry.label))) {
          entry.previousLabel =
            (entry.category || "Labels without a category") +
            " › " +
            entry.label.trim();
        }
      }
      const book = bookEntries(entries);
      const changes = new Map();
      book.forEach((entry, i) => {
        if (omitted.has(labelKey(entry.label))) {
          throw Error(
            "The code “" +
              entry.label +
              "” already belongs to a different category in your previous codebook. Choose a distinct label or category for this entry.",
          );
        }
        const old = oldRows[i];
        if (old && entry.label !== old.label)
          changes.set(old.label, entry.label);
      });
      if (changes.size) remapPreviousLabels(changes);
      clearTimeout(timer);
      timer = null;
      d.coding = {
        ...d.coding,
        mode: "deductive",
        focus: el("coding-focus")?.value.trim() ?? d.coding?.focus ?? "",
        book,
        bookName: draft.name,
      };
      // Keep the original branch and meaning of a code still used on older
      // passages, including when several later codebooks have replaced it.
      if (historical.length)
        d.coding.meanings = labelVocabulary([
          ...historical,
          ...(d.coding.meanings || []),
        ]);
      // The reviewed category list replaces its former names. Historical
      // annotations still need their categories even when the new book omits them.
      const categoryNames = new Map(
        names.map((name) => [labelKey(name), name]),
      );
      for (const { category } of historical) {
        if (category && !categoryNames.has(labelKey(category)))
          categoryNames.set(labelKey(category), category);
      }
      if (categoryNames.size || d.coding.categories)
        d.coding.categories = [...categoryNames.values()];
      applyCodebookCategories(d, book);
      delete d.coding.bookDraft;
      messages.set(d, "Codebook approved.");
      file.value = "";
      show();
      await onApprove(book);
    } catch (err) {
      error.textContent = err.message;
      const seen = new Set();
      const invalid =
        invalidField ||
        [...rows.querySelectorAll("[data-label]")].find((field) => {
          const label = labelKey(field.value);
          const category =
            field.closest(".book-category")?.querySelector("[data-category]")
              .value || "";
          const key = JSON.stringify([labelKey(category), label]);
          if (!label || seen.has(key)) return true;
          seen.add(key);
          return false;
        });
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
