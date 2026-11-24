import { annotatedPassages } from "./annotated-passages.js";
import {
  readFile,
  makeTable,
  qualtricsHeaders,
  corpus,
  texts,
  codedSheet,
} from "./import.js";
import { esc } from "./chart.js";
import { askForm, formselect, table, val } from "./ui.js";
import {
  indicatorColumns,
  bindIndicatorColumns,
  readIndicators,
} from "./indicator-ui.js";
export function taguette(doc) {
  if (doc.codedWordExport) return [];
  const merged = doc.paragraphs.join("\n"),
    matches = [
      ...merged.matchAll(/(?:^|\n)Document:\s*([^\n]+?)\s*Tags:\s*([^\n]*)/gi),
    ];
  let end = 0;
  const list = [];
  for (const m of matches) {
    const excerpt = merged
      .slice(end, m.index)
      .replace(/^Taguette highlights[^\n]*\n?/i, "")
      .trim();
    end = m.index + m[0].length;
    if (excerpt) {
      const p = texts(m[1].trim(), [excerpt])[0];
      p.codes = m[2]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      p.reviewed = true;
      list.push(p);
    }
  }
  return list;
}
// Reserve identifiers before matching broader headings such as “Interview text”.
function suggestInterviewColumns(fields) {
  const available = new Map(
    fields.map((f) => [
      f.id,
      f.label
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .replace(/[_-]+/g, " "),
    ]),
  );
  function choose(...patterns) {
    for (const pattern of patterns) {
      const matches = [...available].filter(([, name]) => pattern.test(name));
      if (!matches.length) continue;
      if (matches.length > 1) return "";
      const [id] = matches[0];
      available.delete(id);
      return id;
    }
    return "";
  }
  const pid = choose(
    /^(?:passage|excerpt|highlight|segment)\s*(?:id|identifier|number|no\.?)$/,
  );
  const source = choose(
    /^(?:source|document|interview|interviewee|participant|respondent|transcript)(?:\s*(?:id|identifier|code|name|number|file))?$/,
    /^(?:source|document|interview|transcript) file ?name$/,
  );
  const passage = choose(
    /^(?:text|excerpt|content|passage|highlight|quotation|quote|answer|response)$/,
    /\b(?:text|excerpt|content|passage|highlight|quotation|quote|written answer)\b/,
  );
  const codes = choose(
    /^(?:codes?|tags?|labels?|themes?)$/,
    /\b(?:applied|assigned|coding|thematic) (?:codes?|tags?|labels?|themes?)\b/,
  );
  return { pid, source, passage, codes };
}
async function sheet(doc, route, current) {
  const auto = doc.sheets.length === 1 && qualtricsHeaders(doc.sheets[0].grid);
  const choice = auto
    ? makeTable(doc.sheets[0].grid, doc.name)
    : await askForm(
        "Choose the table to read",
        `<p>${esc(doc.name)}</p><div class="formgrid">${formselect(
          "sheet",
          "Worksheet",
          doc.sheets.map((s, i) => [String(i), s.name]),
          "0",
        )}<label>Header row number<input id="header" type="number" min="1" value="1"></label></div>`,
        () =>
          makeTable(
            doc.sheets[+val("sheet")].grid.slice(Number(val("header")) - 1),
            doc.name,
          ),
      );
  if (!choice || !current()) return null;
  if (route !== "coded" && route !== "text") return choice;
  const fields = choice.fields.map((f) => [f.id, f.label]),
    columns = suggestInterviewColumns(choice.fields);
  function readMapping() {
    const m = {
      text: val("passage"),
      source: val("source"),
      codes: val("codes"),
      passage: val("pid"),
      separator: val("sep"),
    };
    if (!m.text) throw Error("Choose the column containing the passage text.");
    if (route === "coded" && !m.codes) {
      m.markers = readIndicators(choice.fields, "codecol");
      m.columns = choice.fields.filter((f) => m.markers.has(f.id));
      if (!m.columns.length)
        throw Error("Select a code column or tick its yes/no columns.");
    }
    const roles = [
      m.text,
      m.source,
      m.codes,
      m.passage,
      ...(m.columns || []).map((f) => f.id),
    ].filter(Boolean);
    if (new Set(roles).size !== roles.length)
      throw Error(
        "A column has two roles. Choose a different column for each of the passage text, interview identifier, passage ID and codes.",
      );
    return m;
  }
  const pendingMap = askForm(
    "Which columns contain your material?",
    `<div class="formgrid">${formselect("passage", "Passage or written answer", [["", "Choose the passage column"], ...fields], columns.passage)}${formselect("source", "Interview or source", [["", "Use filename"], ...fields], columns.source)}${route === "coded" ? formselect("codes", "Code or tags", [["", "Separate yes/no columns"], ...fields], columns.codes) : ""}${formselect("pid", "Passage ID (if repeated)", [["", "Each row is a passage"], ...fields], columns.pid)}${route === "coded" ? '<label>Separator between codes<input id="sep"><small>Leave blank for one code per cell. If a comma separates your labels, enter it here.</small></label>' : ""}</div>${route === "coded" ? "<details><summary>Separate yes/no code columns</summary>" + indicatorColumns(choice.fields, "codecol") + "</details>" : ""}<h3>Preview of the first three rows</h3><div id="passage-preview"></div>`,
    () => codedSheet(choice, readMapping()),
  );
  const preview = document.getElementById("passage-preview");
  const showPreview = () => {
    try {
      const { passages } = codedSheet(
        { ...choice, rows: choice.rows.slice(0, 3) },
        readMapping(),
      );
      preview.innerHTML = table(
        [
          "Interview or source",
          "Passage",
          ...(route === "coded" ? ["Codes"] : []),
        ],
        passages.map((p) => [
          p.source,
          p.text,
          ...(route === "coded" ? [p.codes.join("; ") || "No label"] : []),
        ]),
      );
    } catch (err) {
      preview.textContent = err.message;
    }
  };
  preview.closest("form").addEventListener("change", showPreview);
  if (route === "coded") {
    const codes = document.getElementById("codes"),
      sep = document.getElementById("sep");
    const suggestSeparator = () => {
      const values = choice.rows.map((row) => row[codes.value] || "");
      const separators = [";", "|"].filter((delimiter) =>
        values.some((value) => value.includes(delimiter)),
      );
      sep.value = separators.length === 1 ? separators[0] : "";
    };
    // A comma often belongs to a label, e.g. a list of examples in brackets.
    codes.addEventListener("change", suggestSeparator);
    sep.addEventListener("input", showPreview);
    suggestSeparator();
  }
  bindIndicatorColumns(choice, "codecol");
  showPreview();
  const map = await pendingMap;
  if (!map || !current()) return null;
  const { passages, sources } = map;
  const result = corpus(choice.name, passages, sources);
  result.excerptSources = [...sources];
  return result;
}
async function documents(docs, route, current) {
  if (route === "text")
    return corpus(
      docs.length === 1 ? docs[0].name : "Written sources",
      docs.flatMap(documentPassages),
      docs.map((d) => d.name),
    );
  // Taguette stores its interview names and tags inside the export. Only the
  // other documents need the student's mapping from Word or inline markings.
  const inputs = docs.map((doc) => ({ doc, highlights: taguette(doc) }));
  const transcripts = inputs
    .filter(({ highlights }) => !highlights.length)
    .map(({ doc }) => doc);
  const excerptSources = new Set(
    inputs.flatMap(({ highlights }) => highlights.map((p) => p.source)),
  );
  const collision = transcripts.find((doc) => excerptSources.has(doc.name));
  if (collision)
    throw Error(
      "A Taguette interview and a transcript both use the name “" +
        collision.name +
        "”. Give them distinct source names before importing.",
    );
  const mapping = transcripts.length
    ? await matchTranscriptMarkings(transcripts, current)
    : null;
  if ((transcripts.length && !mapping) || !current()) return null;
  const result = corpus(
    !transcripts.length
      ? "Taguette highlights"
      : docs.length === 1
        ? docs[0].name
        : "Coded interviews",
    inputs.flatMap(({ doc, highlights }) =>
      highlights.length ? highlights : annotatedPassages(doc, mapping),
    ),
    inputs.flatMap(({ doc, highlights }) =>
      highlights.length ? highlights.map((p) => p.source) : [doc.name],
    ),
  );
  if (excerptSources.size) result.excerptSources = [...excerptSources];
  if (transcripts.length)
    result.originals = Object.fromEntries(
      transcripts.map((doc) => [doc.name, doc.paragraphs.join("\n\n")]),
    );
  return result;
}
async function matchTranscriptMarkings(docs, current) {
  const markers = [
      ...new Set(docs.flatMap((d) => d.marked.flatMap((p) => p.markers))),
    ],
    has = (k) => markers.some((x) => x.startsWith(k));
  const method = await askForm(
    "Where did you put the codes you applied to your interview transcripts?",
    `<p>Choose all that apply.</p>` +
      [
        ["comment", "In comments attached to passages", has("comment")],
        ["inline", "In the transcript text, next to the passages", false],
        [
          "colour",
          "I used highlight colours to represent different codes",
          has("colour"),
        ],
        ["other", "Somewhere else", false],
        ["help", "I’m not sure — help me check", false],
      ]
        .map(
          ([v, t, c]) =>
            `<label class="tick"><input name="method" type="checkbox" value="${v}" ${c ? "checked" : ""}>${t}</label>`,
        )
        .join(""),
    () => {
      const m = [
        ...document.querySelectorAll("input[name=method]:checked"),
      ].map((e) => e.value);
      if (!m.length) throw Error("Choose a method.");
      return m;
    },
  );
  if (!method || !current()) return null;
  const chosen = markers.filter(
    (m) =>
      method.includes("help") ||
      method.includes("other") ||
      method.includes(m.split(":")[0]),
  );
  // A Data visualiser Word comment represents exactly one saved label. A
  // semicolon inside that label is part of its name.
  const exportedMarkers = new Set(
    docs
      .filter((doc) => doc.codedWordExport)
      .flatMap((doc) => doc.marked.flatMap((p) => p.markers)),
  );
  return askForm(
    "Match markings to codes",
    `<p>Check the labels for each marking. Enter one label per line. Leave the box empty to ignore a note or highlight.</p>` +
      chosen
        .map((m, i) => {
          const example = docs
            .flatMap((d) => d.marked)
            .find((p) => p.markers.includes(m));
          const raw = m.startsWith("comment: ")
            ? m
                .slice(9)
                .replace(/^CODE:/i, "")
                .trim()
            : "";
          const labels = exportedMarkers.has(m)
            ? raw
            : raw
                .split(";")
                .map((s) => s.trim())
                .join("\n");
          return `<div class="check-item"><label for="marker${i}">${esc(m)}</label><textarea rows="2" id="marker${i}">${esc(labels)}</textarea><small>${esc(example.text.slice(0, 220))}</small></div>`;
        })
        .join("") +
      (method.includes("inline") || method.includes("other")
        ? `<label>Opening and closing marks around each inline code</label><div class="formgrid"><input id="openmark" aria-label="Opening mark" value="["><input id="closemark" aria-label="Closing mark" value="]"></div><small>Each inline code applies to its paragraph.</small>`
        : "") +
      `<details><summary>Preview source text</summary>${table(
        ["Source", "Paragraph"],
        docs
          .slice(0, 3)
          .flatMap((d) => d.paragraphs.slice(0, 3).map((t) => [d.name, t])),
      )}</details>`,
    () => ({
      marks: Object.fromEntries(
        chosen.map((m, i) => [
          m,
          val("marker" + i)
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean),
        ]),
      ),
      open: val("openmark"),
      close: val("closemark"),
    }),
  );
}
function documentPassages(doc) {
  const originals = texts(doc.name, doc.paragraphs, doc.codedWordExport);
  for (const [i, included] of (doc.paragraphScope || []).entries())
    if (included !== undefined) originals[i].codingIncluded = included;
  return originals;
}
export async function importFiles(files, route, current = () => true) {
  const datasets = [],
    docs = [];
  if (new Set(files.map((f) => f.name)).size !== files.length)
    throw Error(
      "Two files have the same name. Give each source a distinct filename.",
    );
  for (const f of files) {
    const d = await readFile(f);
    if (!current()) return null;
    if (d.kind === "grid") {
      const t = await sheet(d, route, current);
      if (!t || !current()) return null;
      datasets.push(t);
    } else {
      if (!d.paragraphs.some((text) => text.trim()))
        throw Error(
          "“" +
            d.name +
            "” contains no readable transcript text. Choose a document containing the interview.",
        );
      docs.push(d);
    }
  }
  if (docs.length) {
    const d = await documents(docs, route, current);
    if (!d || !current()) return null;
    datasets.push(d);
  }
  return datasets;
}
