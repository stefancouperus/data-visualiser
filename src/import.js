import Papa from "papaparse";
import { unzipSync, strFromU8 } from "fflate";

export const uid = () => crypto.randomUUID();
const str = (x) => (x == null ? "" : String(x));
const unique = (xs) => [...new Set(xs)];
const meta =
  /^(StartDate|EndDate|Status|IPAddress|Progress|Duration \(in seconds\)|Finished|RecordedDate|ResponseId|Recipient.*|ExternalReference|LocationLatitude|LocationLongitude|DistributionChannel|UserLanguage|Q_Language|LocationFirstSeen|LocationLastSeen|Last Seen Flow Element ID|Last Seen Question IDs|ExternalDataReference)$/i;
export function qualtricsHeaders(rows) {
  if (rows[2]?.some((v) => /"ImportId"\s*:/.test(str(v)))) return 3;
  const pairs = [
    ["StartDate", "Start Date"],
    ["EndDate", "End Date"],
    ["ResponseId", "Response ID"],
    ["Status", "Response Type"],
    ["IPAddress", "IP Address"],
  ];
  const matches = pairs.filter(([raw, label]) =>
    rows[0]?.some(
      (v, i) =>
        str(v).trim() === raw &&
        str(rows[1]?.[i]).trim().toLowerCase() === label.toLowerCase(),
    ),
  );
  if (matches.length >= 2) return 2;
  const idColumns = (rows[0] || [])
    .map((v, i) => (/^Q(?:ID)?\d+(?:_\w+)*$/i.test(str(v)) ? i : -1))
    .filter((i) => i >= 0);
  const wordedHeaders = idColumns.filter(
    (i) => str(rows[1]?.[i]).trim().split(/\s+/).length >= 4,
  );
  return rows.length >= 3 && matches.length >= 1 && wordedHeaders.length >= 1
    ? 2
    : 0;
}
export function makeTable(grid, name) {
  const rows = grid.filter((row) => row.some((v) => str(v).trim() !== ""));
  if (rows.length < 2)
    throw Error("A table needs a header row and at least one response.");
  const headers = qualtricsHeaders(rows),
    qual = headers > 0;
  const titles = qual ? rows[1] : rows[0],
    data = rows.slice(headers || 1);
  if (!data.length)
    throw Error("This export has headers but no response records.");
  const fields = Array.from(
    { length: rows.reduce((width, row) => Math.max(width, row.length), 0) },
    (_, i) => {
      const raw = str(rows[0][i]),
        label = str(titles[i]).trim() || raw || "Column " + (i + 1);
      const values = data.map((r) => str(r[i]).trim()).filter(Boolean),
        levels = unique(values);
      const numeric =
        values.length &&
        values.every((x) => /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(x));
      const type =
        meta.test(raw) && qual
          ? "metadata"
          : numeric
            ? "number"
            : values.length && values.every((x) => /^\d{4}-\d\d-\d\d/.test(x))
              ? "date"
              : levels.some((x) => x.length > 85)
                ? "text"
                : "category";
      return {
        id: "c" + i,
        raw,
        label,
        type,
        levels,
      };
    },
  );
  return {
    id: uid(),
    kind: "table",
    name,
    qual,
    unit: "response",
    fields,
    rows: data.map((r) =>
      Object.fromEntries(fields.map((f, i) => [f.id, str(r[i]).trim()])),
    ),
    rules: [],
  };
}
export function parseCSV(text) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.some((e) => e.code === "MissingQuotes"))
    throw Error("The CSV contains an unclosed quoted value.");
  return parsed.data;
}
function xml(s) {
  const doc = new DOMParser().parseFromString(s, "application/xml");
  if (doc.querySelector("parsererror")) throw Error("Invalid Word XML.");
  return doc;
}
const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const els = (el, n) => Array.from(el.getElementsByTagNameNS(ns, n));
const attr = (el, n) => el?.getAttributeNS(ns, n);
const txt = (el) =>
  els(el, "t")
    .map((v) => v.textContent)
    .join("");
function segment(source, text, markers = []) {
  return { id: uid(), source, text, codes: [], markers, reviewed: false };
}
export function wordDocument(bytes, name) {
  const zip = unzipSync(bytes, {
    filter: (f) => ["word/document.xml", "word/comments.xml"].includes(f.name),
  });
  if (!zip["word/document.xml"])
    throw Error("This file has no Word document body.");
  const body = xml(strFromU8(zip["word/document.xml"])),
    comments = new Map();
  if (zip["word/comments.xml"])
    for (const c of els(xml(strFromU8(zip["word/comments.xml"])), "comment"))
      comments.set(attr(c, "id"), txt(c));
  const all = [],
    ranges = new Map(),
    active = new Set(),
    paragraphs = [],
    paragraphStarts = [];
  let position = 0;
  const add = (text, start, end, marker) => {
    if (!text.trim()) return;
    const prior = all.find((p) => p.start === start && p.end === end);
    if (prior) {
      prior.markers.push(marker);
      return;
    }
    all.push({ ...segment(name, text, [marker]), start, end });
  };
  for (const p of els(body, "p")) {
    const paragraphStart = position;
    let colour = "",
      run = "",
      runStart = position;
    const flush = () => {
      if (colour) add(run, runStart, position, "colour: " + colour);
      run = "";
      runStart = position;
    };
    for (const e of p.getElementsByTagName("*")) {
      if (e.localName === "commentRangeStart") {
        const k = attr(e, "id");
        active.add(k);
        if (!ranges.has(k))
          ranges.set(k, { start: position, end: position, text: "" });
      }
      if (e.localName === "commentRangeEnd") active.delete(attr(e, "id"));
      if (e.localName !== "r") continue;
      const t = txt(e),
        h = attr(els(e, "highlight")[0], "val") || "";
      if (h !== colour) {
        flush();
        colour = h;
      }
      run += t;
      position += t.length;
      for (const k of active) {
        const range = ranges.get(k);
        range.text += t;
        range.end = position;
      }
    }
    flush();
    position++;
    for (const k of active) {
      const range = ranges.get(k);
      range.text += "\n";
      range.end = position;
    }
    const raw = txt(p);
    if (raw.trim()) {
      paragraphs.push(raw.trim());
      paragraphStarts.push(
        paragraphStart + raw.length - raw.trimStart().length,
      );
    }
  }
  for (const [k, r] of ranges)
    if (comments.has(k))
      add(r.text, r.start, r.end, "comment: " + comments.get(k));
  return { name, paragraphs, paragraphStarts, marked: all };
}
export function texts(name, paragraphs) {
  return paragraphs.filter((s) => s.trim()).map((t) => segment(name, t.trim()));
}
export function parseLines(s) {
  return s
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);
}
export async function readFile(file) {
  const name = file.name,
    ext = name.split(".").pop().toLowerCase();
  if (ext === "csv" || ext === "tsv") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encoding =
      bytes[0] === 255 && bytes[1] === 254
        ? "utf-16le"
        : bytes[0] === 254 && bytes[1] === 255
          ? "utf-16be"
          : "utf-8";
    return {
      name,
      kind: "grid",
      sheets: [
        {
          name: "Data",
          grid: parseCSV(new TextDecoder(encoding).decode(bytes)),
        },
      ],
    };
  }
  if (ext === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const sheets = book.worksheets.map((ws) => {
      const grid = [];
      ws.eachRow((row, n) => {
        const cells = [];
        row.eachCell((cell, c) => {
          let v = cell.value;
          if (v && typeof v === "object") {
            if (v instanceof Date) v = v.toISOString().slice(0, 10);
            else if (v.richText) v = v.richText.map((t) => t.text).join("");
            else v = v.result ?? v.text ?? cell.text;
          }
          cells[c - 1] = str(v);
        });
        grid[n - 1] = cells;
      });
      return { name: ws.name, grid: Array.from(grid, (r) => r || []) };
    });
    if (!sheets.length) throw Error("The workbook contains no worksheets.");
    return { name, kind: "grid", sheets };
  }
  if (ext === "docx")
    return {
      name,
      kind: "doc",
      ...wordDocument(new Uint8Array(await file.arrayBuffer()), name),
    };
  if (ext === "txt")
    return {
      name,
      kind: "doc",
      paragraphs: parseLines(await file.text()),
      marked: [],
    };
  throw Error("Choose CSV, TSV, XLSX, DOCX or TXT.");
}
export function codedSheet(table, map) {
  const out = new Map(),
    sources = new Set();
  for (const r of table.rows) {
    if (map.source && !r[map.source] && !r[map.text]) continue;
    if (map.source && !r[map.source] && r[map.text])
      throw Error(
        "A passage is missing its interview or source identifier. Fill in the source column, or choose Use filename if the file contains one interview.",
      );
    const source = r[map.source] || table.name,
      t = r[map.text];
    sources.add(source);
    if (!t) continue;
    const passageKey = map.passage ? r[map.passage] : "";
    const key = passageKey ? JSON.stringify([source, passageKey]) : uid();
    const p = out.get(key) || segment(source, t);
    if (p.text !== t)
      throw Error(
        "A passage ID refers to different text within the same source.",
      );
    const codes = map.columns
      ? map.columns
          .filter((f) => map.markers.get(f.id).has(r[f.id]))
          .map((f) => f.label)
      : (map.separator === ""
          ? [r[map.codes] || ""]
          : (r[map.codes] || "").split(map.separator ?? ";")
        )
          .map((s) => s.trim())
          .filter(Boolean);
    p.codes = unique([...p.codes, ...codes]);
    p.reviewed = p.codes.length > 0;
    out.set(key, p);
  }
  return { passages: [...out.values()], sources: [...sources] };
}
export function corpus(name, passages, sources) {
  return {
    id: uid(),
    kind: "text",
    name,
    passages,
    sources: unique(sources),
    metadata: {},
    unit: "source",
  };
}
export const filteredRows = (t) =>
  t.rows.filter((row) =>
    (t.rules || []).every((r) => row[r.field] !== r.value),
  );
