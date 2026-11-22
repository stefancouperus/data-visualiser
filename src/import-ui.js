import { readFile, makeTable, corpus, texts, codedSheet } from "./import.js";
import { esc } from "./chart.js";
import { askForm, formselect, table, val } from "./ui.js";
export function taguette(doc) {
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
async function sheet(doc, route) {
  const choice = await askForm(
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
  if (!choice) return null;
  if (route !== "coded" && route !== "text") return choice;
  const fields = choice.fields.map((f) => [f.id, f.label]),
    guess = (re) => choice.fields.find((f) => re.test(f.label))?.id || "";
  const map = await askForm(
    "Which columns contain your material?",
    table(
      choice.fields.map((f) => f.label),
      choice.rows.slice(0, 3).map(Object.values),
    ) +
      `<div class="formgrid">${formselect("passage", "Passage or written answer", fields, guess(/text|excerpt|content|passage|highlight/i))}${formselect("source", "Interview or source", [["", "Use filename"], ...fields], guess(/source|document|interview/i))}${route === "coded" ? formselect("codes", "Code or tags", [["", "Separate yes/no columns"], ...fields], guess(/codes?|tags?/i)) : ""}${formselect("pid", "Passage ID (if repeated)", [["", "Each row is a passage"], ...fields], guess(/highlight.?id|passage.?id/i))}<label>Separator between codes<input id="sep" value="${/tags/i.test(choice.fields.map((f) => f.label).join(" ")) ? "," : ";"}"></label></div>${route === "coded" ? "<details><summary>Separate yes/no code columns</summary>" + choice.fields.map((f) => `<label class="tick"><input type="checkbox" name="codecol" value="${f.id}">${esc(f.label)}</label>`).join("") + "</details>" : ""}`,
    () => {
      const m = {
        text: val("passage"),
        source: val("source"),
        codes: val("codes"),
        passage: val("pid"),
        separator: val("sep"),
      };
      if (route === "coded" && !m.codes) {
        m.columns = choice.fields.filter((f) =>
          document.querySelector(
            `input[name=codecol][value="${f.id}"]:checked`,
          ),
        );
        if (!m.columns.length)
          throw Error("Select a code column or tick its yes/no columns.");
      }
      if (m.codes === m.text)
        throw Error("Choose separate passage and code columns.");
      return m;
    },
  );
  if (!map) return null;
  const { passages, sources } = codedSheet(choice, map);
  return corpus(choice.name, passages, sources);
}
async function documents(docs, route) {
  if (route === "text")
    return corpus(
      docs.length === 1 ? docs[0].name : "Written sources",
      docs.flatMap((d) => texts(d.name, d.paragraphs)),
      docs.map((d) => d.name),
    );
  const tagged = docs.map(taguette);
  if (tagged.every((v) => v.length)) {
    const passages = tagged.flat();
    return corpus("Taguette highlights", passages, [
      ...new Set(passages.map((p) => p.source)),
    ]);
  }
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
  if (!method) return null;
  const chosen = markers.filter(
    (m) =>
      method.includes("help") ||
      method.includes("other") ||
      method.includes(m.split(":")[0]),
  );
  const mapped = await askForm(
    "Match markings to codes",
    `<p>Inspect a passage for each marking. Separate codes with a semicolon. Clear a label to ignore a note or decorative highlight.</p>` +
      chosen
        .map((m, i) => {
          const example = docs
            .flatMap((d) => d.marked)
            .find((p) => p.markers.includes(m));
          return `<div class="check-item"><label>${esc(m)}<input id="marker${i}" value="${
            m.startsWith("comment: ")
              ? esc(
                  m
                    .slice(9)
                    .replace(/^CODE:/i, "")
                    .trim(),
                )
              : ""
          }"></label><small>${esc(example.text.slice(0, 220))}</small></div>`;
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
            .split(";")
            .map((x) => x.trim())
            .filter(Boolean),
        ]),
      ),
      open: val("openmark"),
      close: val("closemark"),
    }),
  );
  if (!mapped) return null;
  const passages = [];
  for (const doc of docs) {
    const selected = doc.marked
      .map((p) => ({
        ...p,
        codes: [...new Set(p.markers.flatMap((m) => mapped.marks[m] || []))],
      }))
      .filter((p) => p.codes.length);
    for (const p of selected) {
      p.reviewed = true;
      passages.push(p);
    }
    for (const text of doc.paragraphs) {
      const inline = [];
      let edited = text;
      if (mapped.open && mapped.close) {
        const split = text.split(mapped.open);
        edited = split[0];
        for (const s of split.slice(1)) {
          const idx = s.indexOf(mapped.close);
          if (idx >= 0) {
            inline.push(s.slice(0, idx).trim());
            edited += s.slice(idx + mapped.close.length);
          } else edited += mapped.open + s;
        }
      }
      if (
        inline.length ||
        !selected.some((p) => text.includes(p.text) || p.text.includes(text))
      ) {
        const p = texts(doc.name, [edited.trim() || text])[0];
        p.codes = inline.filter(Boolean);
        p.reviewed = !!p.codes.length;
        passages.push(p);
      }
    }
  }
  const result = corpus(
    docs.length === 1 ? docs[0].name : "Coded interviews",
    passages,
    docs.map((d) => d.name),
  );
  result.originals = Object.fromEntries(
    docs.map((d) => [d.name, d.paragraphs.join("\n\n")]),
  );
  return result;
}
export async function importFiles(files, route) {
  const datasets = [],
    docs = [];
  if (new Set(files.map((f) => f.name)).size !== files.length)
    throw Error(
      "Two files have the same name. Give each source a distinct filename.",
    );
  for (const f of files) {
    const d = await readFile(f);
    if (d.kind === "grid") {
      const t = await sheet(d, route);
      if (!t) return null;
      datasets.push(t);
    } else docs.push(d);
  }
  if (docs.length) {
    const d = await documents(docs, route);
    if (!d) return null;
    datasets.push(d);
  }
  return datasets;
}
