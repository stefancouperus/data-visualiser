import { esc } from "./chart.js";
import { readFile } from "./import.js";
import {
  approvedBook,
  bookEntries,
  codingLimits,
  labelKey,
  labelsInCodebook,
} from "./coding.js";
import { busyIndicator, formselect, get } from "./ui.js";

async function fileText(file) {
  if (!/\.pdf$/i.test(file.name)) {
    const doc = await readFile(file);
    return doc.kind === "doc"
      ? doc.paragraphs.join("\n")
      : doc.sheets
          .map((s) => s.grid.map((row) => row.join("\t")).join("\n"))
          .join("\n\n");
  }
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  });
  try {
    const pdf = await loading.promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      let line = "",
        previous;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        // PDF text runs may split one word at a ligature or font change.
        if (previous && !/\s$/u.test(line) && !/^\s/u.test(item.str)) {
          const gap =
            item.dir === "rtl"
              ? previous.transform[4] - (item.transform[4] + item.width)
              : item.transform[4] - (previous.transform[4] + previous.width);
          if (gap > Math.max(1, item.height * 0.12)) line += " ";
        }
        line += item.str;
        if (item.hasEOL) line += "\n";
        previous = item.hasEOL ? undefined : item;
      }
      pages.push(line);
    }
    return pages.join("\n\n");
  } finally {
    await loading.destroy();
  }
}

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
    <small>Choose a Word document, a PDF with selectable text, a text file or a spreadsheet. Select Extract labels to send the codebook to the bot.</small>
    <div id="book-access" hidden><label>Workshop course code<input type="password" id="book-course" autocomplete="off"></label></div>
    <div class="bar"><button type="button" id="extract-book">Extract labels</button></div></div>
    <div class="bar"><button type="button" id="book-manual">Enter labels manually</button><button type="button" id="edit-book" hidden>Review approved labels</button></div>
    <p id="book-status" role="status"></p>
    <section id="book-draft" hidden><h3>Review your labels</h3><p>Check the labels and their meanings. Your draft stays in this project when you close this window.</p>
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
  function updateDraft() {
    if (!d.coding?.bookDraft || d.coding.bookDraft !== displayed) return;
    d.coding.bookDraft.entries = [...rows.children].map((row) => ({
      label: row.querySelector("[data-label]").value,
      definition: row.querySelector("[data-definition]").value,
    }));
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
  function appendRow(entry) {
    const row = document.createElement("div");
    row.className = "book-row";
    row.innerHTML = `<label>Label<input data-label value="${esc(entry.label)}"></label><label>Meaning and rules<textarea data-definition>${esc(entry.definition)}</textarea></label><button type="button" class="plain">Remove label</button>`;
    row.querySelector("button").onclick = () => {
      row.remove();
      updateDraft();
    };
    rows.append(row);
    return row;
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
    el("book-access").hidden = !!sessionStorage.getItem("dv-session");
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
        draft.entries.forEach(appendRow);
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
  el("edit-book").onclick = () =>
    setDraft({
      method: "manual",
      name: d.coding.bookName || "Project codebook",
      entries: approvedBook(d),
      sourceText: "",
    });
  el("cancel-book").onclick = () => {
    file.value = "";
    setDraft(null);
  };
  el("extract-book").onclick = async () => {
    const source = file.files[0];
    if (!source || requests.has(d) || d.coding?.bookDraft) return;
    const access = el("book-course").value;
    const approved = d.coding?.book;
    requests.set(d, "Reading the codebook…");
    show();
    try {
      const sourceText = (await fileText(source)).trim();
      if (!sourceText)
        throw Error(
          "This file has no selectable text. Use a text-based PDF, Word document or spreadsheet.",
        );
      if (sourceText.length > 65000)
        throw Error(
          "Upload the section containing your labels and definitions (up to 65,000 characters).",
        );
      requests.set(d, "Extracting labels from your codebook…");
      editors.get(d)?.();
      const response = await extract(sourceText, access);
      if (
        !Array.isArray(response) ||
        response.some(
          (row) =>
            typeof row?.label !== "string" ||
            typeof row.definition !== "string",
        )
      )
        throw Error("The bot returned an unreadable codebook. Try again.");
      if (d.coding?.bookDraft || d.coding?.book !== approved)
        throw Error(
          "The project codebook changed while the bot was reading. Your newer work has been kept.",
        );
      const grounded = labelsInCodebook(response, sourceText);
      const entries = new Map();
      for (const row of grounded) {
        const key = labelKey(row.label),
          existing = entries.get(key);
        if (!existing) entries.set(key, { ...row });
        else if (
          row.definition &&
          !existing.definition.split("\n").includes(row.definition)
        )
          existing.definition = [existing.definition, row.definition]
            .filter(Boolean)
            .join("\n");
      }
      const count = entries.size;
      setDraft(
        {
          method: "upload",
          name: source.name,
          entries: [...entries.values()],
          sourceText,
        },
        (count
          ? count + " draft label" + (count === 1 ? "" : "s") + " to check."
          : "Check the source text and add any missing labels.") +
          (response.length > grounded.length
            ? " Some suggested labels could not be found in the uploaded text and were left out."
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
      const book = bookEntries(draft.entries);
      clearTimeout(timer);
      timer = null;
      d.coding = {
        ...d.coding,
        mode: "deductive",
        focus: el("coding-focus")?.value.trim() ?? d.coding?.focus ?? "",
        book,
        bookName: draft.name,
      };
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
          const key = labelKey(field.value);
          if (!key || seen.has(key)) return true;
          seen.add(key);
          return false;
        },
      );
      if (invalid) {
        const hint = document.createElement("small");
        hint.className = "book-row-error";
        hint.id = "book-row-error";
        hint.textContent = err.message;
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
