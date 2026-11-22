import { esc } from "./chart.js";
import { readFile } from "./import.js";
import { bookEntries, codingLimits, labelsInCodebook } from "./coding.js";
import { formselect, get, val } from "./ui.js";

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

export function codingControls(d) {
  return `<fieldset><legend>Code with the Data bot</legend>
    ${formselect(
      "coding-method",
      "How do you want to code?",
      [
        ["inductive", "Build labels from the passages (inductive)"],
        ["deductive", "Use my codebook (deductive)"],
      ],
      d.coding?.mode || "inductive",
    )}
    <label>What are you trying to understand? (optional)<input id="coding-focus" maxlength="600" value="${esc(d.coding?.focus)}"></label>
    <p id="inductive-help">The bot reuses your labels. It can propose up to ${codingLimits.newPerBatch} new labels per batch and stops adding them at ${codingLimits.inductiveLabels} distinct labels.</p>
    <div id="codebook-controls" hidden>
    <p id="approved-book"></p>
    <label>Upload your codebook<input id="book-file" type="file" accept=".pdf,.docx,.txt,.xlsx,.csv,.tsv"></label>
    <small>Use a Word document, a PDF with selectable text, a text file or a spreadsheet containing your codebook. The bot receives this document when you choose Extract labels.</small>
    <div id="book-access" hidden><label>Workshop course code<input type="password" id="book-course" autocomplete="off"></label></div>
    <div class="bar"><button type="button" id="extract-book">Extract labels</button><button type="button" id="edit-book" hidden>Review approved labels</button></div>
    <p id="book-status" role="status"></p>
    <section id="book-draft" hidden><h3>Review the codebook</h3><p>Check each label and its meaning. Add any missing labels and remove anything that is only an example.</p>
    <details id="book-original"><summary>Read text from the upload</summary><pre class="book-source"></pre></details>
    <div id="book-rows"></div><div class="bar"><button type="button" id="book-add">Add label</button><button type="button" id="use-book">Use these labels</button><button type="button" id="cancel-book">Discard draft</button></div></section>
    </div><small>Review up to ten passages at a time. The bot can suggest up to two labels per passage, counting any already applied. A passage may receive none.</small><div class="bar"><button type="button" id="suggestpass">Suggest codes for selected passages</button></div></fieldset>`;
}

export function bindCodingControls(d, extract, onApprove) {
  let pending = false,
    editing = false;
  const mode = get("coding-method"),
    file = get("book-file"),
    draft = get("book-draft"),
    status = get("book-status"),
    rows = get("book-rows");
  function update() {
    const deductive = mode.value === "deductive";
    get("codebook-controls").hidden = !deductive;
    get("inductive-help").hidden = deductive;
    const size = d.coding?.book?.length || 0;
    get("approved-book").textContent = size
      ? size + " approved labels · " + d.coding.bookName
      : "Upload your codebook and check the labels before coding.";
    get("edit-book").hidden = !size || editing;
    get("book-access").hidden = !!sessionStorage.getItem("dv-session");
    get("extract-book").disabled = !file.files.length || pending;
    file.disabled = pending;
    mode.disabled = pending;
    draft.hidden = !editing;
    get("suggestpass").disabled =
      deductive && (!size || pending || editing || !!file.files.length);
  }
  function addRow(entry = { label: "", definition: "" }) {
    const row = document.createElement("div");
    row.className = "book-row";
    row.innerHTML = `<label>Label<input data-label value="${esc(entry.label)}"></label><label>Meaning and rules<textarea data-definition>${esc(entry.definition)}</textarea></label><button type="button" class="plain">Remove label</button>`;
    row.querySelector("button").onclick = () => row.remove();
    rows.append(row);
  }
  function review(entries, original) {
    editing = true;
    rows.replaceChildren();
    entries.forEach(addRow);
    get("book-original").hidden = !original;
    get("book-original").querySelector("pre").textContent = original;
    update();
  }
  file.onchange = () => {
    editing = false;
    status.textContent = "";
    update();
  };
  mode.onchange = update;
  get("book-add").onclick = () => addRow();
  get("edit-book").onclick = () => review(d.coding.book, "");
  get("cancel-book").onclick = () => {
    editing = false;
    file.value = "";
    status.textContent = "";
    update();
  };
  get("extract-book").onclick = async () => {
    const source = file.files[0];
    if (!source || pending) return;
    pending = true;
    editing = false;
    status.textContent = "Reading the codebook…";
    update();
    try {
      const documentText = (await fileText(source)).trim();
      if (!documentText)
        throw Error(
          "This file has no selectable text. Use a text-based PDF, Word document or spreadsheet.",
        );
      if (documentText.length > 65000)
        throw Error(
          "Upload the section containing your labels and definitions (up to 65,000 characters).",
        );
      status.textContent = "The bot is extracting labels for your review…";
      const entries = await extract(documentText, val("book-course"));
      if (!draft.isConnected) return;
      if (
        !Array.isArray(entries) ||
        entries.some(
          (row) =>
            typeof row?.label !== "string" ||
            typeof row.definition !== "string",
        )
      )
        throw Error("The bot returned an unreadable codebook. Try again.");
      const grounded = labelsInCodebook(entries, documentText);
      const omitted = entries.length - grounded.length;
      status.textContent =
        (grounded.length
          ? grounded.length + " draft labels to check."
          : "Check the source text and add any missing labels.") +
        (omitted
          ? " Some suggested labels could not be found in the uploaded text and were left out."
          : "");
      review(grounded, documentText);
    } catch (error) {
      if (draft.isConnected) status.textContent = error.message;
    } finally {
      pending = false;
      if (draft.isConnected) update();
    }
  };
  get("use-book").onclick = () => {
    try {
      const book = bookEntries(
        [...rows.children].map((row) => ({
          label: row.querySelector("[data-label]").value,
          definition: row.querySelector("[data-definition]").value,
        })),
      );
      d.coding = {
        ...d.coding,
        mode: "deductive",
        focus: val("coding-focus").trim(),
        book,
        bookName: file.files[0]?.name || d.coding?.bookName,
      };
      editing = false;
      file.value = "";
      onApprove();
      status.textContent = "Codebook approved.";
      update();
    } catch (error) {
      status.textContent = error.message;
    }
  };
  update();
}
