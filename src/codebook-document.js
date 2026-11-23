import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "./import.js";
import { codebookStructure, textBlocks } from "./codebook-structure.js";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const elements = (el, name) =>
  el ? Array.from(el.getElementsByTagNameNS(word, name)) : [];
const property = (el, name) => el?.getAttributeNS(word, name);
const value = (el, name) => property(elements(el, name)[0], "val");
function xml(data) {
  const doc = new DOMParser().parseFromString(
    strFromU8(data),
    "application/xml",
  );
  if (doc.querySelector("parsererror"))
    throw Error(
      "The Word codebook is unreadable. Open and resave it as a .docx file.",
    );
  return doc;
}
function words(el) {
  return elements(el, "*")
    .map((n) =>
      n.localName === "t"
        ? n.textContent
        : n.localName === "tab"
          ? "\t"
          : ["br", "cr"].includes(n.localName)
            ? "\n"
            : "",
    )
    .join("")
    .trim();
}
function enabled(el, name) {
  const tag = elements(el, name)[0];
  return !!tag && !["0", "false", "off"].includes(property(tag, "val"));
}
function wordBlocks(data) {
  const parts = unzipSync(data, {
    filter: (f) =>
      ["word/document.xml", "word/numbering.xml", "word/styles.xml"].includes(
        f.name,
      ),
  });
  if (!parts["word/document.xml"])
    throw Error("This file has no Word document body.");
  const numbering =
    parts["word/numbering.xml"] && xml(parts["word/numbering.xml"]);
  const definitions = new Map(
    elements(numbering, "abstractNum").map((n) => [
      property(n, "abstractNumId"),
      n,
    ]),
  );
  const numberingById = new Map(
    elements(numbering, "num").map((n) => [
      property(n, "numId"),
      definitions.get(value(n, "abstractNumId")),
    ]),
  );
  const styles = new Map(
    elements(
      parts["word/styles.xml"] && xml(parts["word/styles.xml"]),
      "style",
    ).map((s) => [property(s, "styleId"), s]),
  );
  const body = elements(xml(parts["word/document.xml"]), "body")[0];
  const blocks = [];
  function visit(node) {
    for (const el of node.children) {
      if (el.localName === "tbl") {
        const rows = Array.from(el.children)
          .filter((e) => e.localName === "tr")
          .map((row) =>
            Array.from(row.children)
              .filter((c) => c.localName === "tc")
              .map((cell) =>
                elements(cell, "p").map(words).filter(Boolean).join("\n"),
              ),
          );
        if (rows.length) blocks.push({ kind: "table", rows });
        continue;
      }
      if (el.localName !== "p") {
        visit(el);
        continue;
      }
      const text = words(el);
      if (!text) continue;
      const ppr = elements(el, "pPr")[0];
      const styleId = value(ppr, "pStyle");
      const style = styles.get(styleId);
      const label = value(style, "name") || styleId || "";
      const outline = value(ppr, "outlineLvl") ?? value(style, "outlineLvl");
      const heading = /^(?:heading|kop|überschrift|titre)\s*([1-9])$/iu.exec(
        label,
      );
      const runs = elements(el, "r").filter((r) => words(r));
      const bold =
        runs.length > 0 &&
        runs.every((r) => enabled(elements(r, "rPr")[0], "b"));
      const italic =
        runs.length > 0 &&
        runs.every((r) => enabled(elements(r, "rPr")[0], "i"));
      const num = elements(ppr, "numPr")[0] || elements(style, "numPr")[0];
      const id = value(num, "numId");
      const level = Number(value(num, "ilvl") || 0);
      const numbered = elements(numberingById.get(id), "lvl").find(
        (l) => property(l, "ilvl") === String(level),
      );
      const outlineLevel = outline == null ? undefined : Number(outline);
      if (heading || (outlineLevel >= 0 && outlineLevel < 9)) {
        blocks.push({
          kind: "heading",
          level: heading ? Number(heading[1]) : outlineLevel + 1,
          text,
        });
      } else if (
        id &&
        id !== "0" &&
        bold &&
        numbered &&
        value(numbered, "numFmt") !== "bullet"
      ) {
        blocks.push({ kind: "heading", level: level + 1, text });
      } else if ((id && id !== "0") || /list bullet/iu.test(label)) {
        blocks.push({ kind: "item", level, text });
      } else {
        const plain = textBlocks(text);
        for (const b of plain)
          blocks.push({ ...b, bold, italic, title: /^title$/iu.test(label) });
      }
    }
  }
  visit(body);
  return blocks;
}

async function pdfText(file) {
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

export async function readCodebookFile(file) {
  if (/\.docx$/iu.test(file.name))
    return codebookStructure(
      wordBlocks(new Uint8Array(await file.arrayBuffer())),
    );
  if (/\.pdf$/iu.test(file.name))
    return codebookStructure(textBlocks(await pdfText(file)));
  if (/\.txt$/iu.test(file.name))
    return codebookStructure(textBlocks(await file.text()));
  const doc = await readFile(file);
  return codebookStructure(
    doc.sheets.flatMap((sheet) => [
      ...(doc.sheets.length > 1
        ? [{ kind: "heading", level: 1, text: sheet.name }]
        : []),
      { kind: "table", rows: sheet.grid },
    ]),
  );
}
