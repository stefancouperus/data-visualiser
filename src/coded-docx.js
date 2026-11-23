import { zipSync } from "fflate";
import { docxMime, run, paragraph, wordDocumentBytes } from "./word-package.js";
import { labelKey } from "./coding.js";
import { labelAppearance } from "./label-appearance.js";
import { transcriptIndex } from "./transcript-index.js";
import { quotationRanges } from "./interview-manual.js";

export function fileStem(value, fallback = "Interview") {
  return (
    value
      .replace(/\.(docx|txt|tsv|csv|xlsx)$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .trim()
      .replace(/[. ]+$/, "")
      .slice(0, 120) || fallback
  );
}
function shade(colour) {
  const channels = colour
    .slice(1)
    .match(/../g)
    .map((h) =>
      Math.round(200 + (55 * parseInt(h, 16)) / 255)
        .toString(16)
        .padStart(2, "0"),
    );
  return '<w:shd w:val="clear" w:fill="' + channels.join("") + '"/>';
}
function labelRun(label, colours) {
  return (
    run(
      "■ ",
      '<w:color w:val="' + colours.get(labelKey(label)).colour.slice(1) + '"/>',
    ) + run(label, "<w:b/>")
  );
}
function codedDocument(dataset, source, colours) {
  const records = dataset.passages.filter((p) => p.source === source);
  const index = transcriptIndex(records);
  const labels = [...new Set(records.flatMap((p) => p.codes || []))];
  const definitions = new Map(
    [...(dataset.coding?.meanings || []), ...(dataset.coding?.book || [])]
      .filter((e) => typeof e === "object")
      .map((e) => [labelKey(e.label), e.definition]),
  );
  const comments = [];
  const doc = [
    paragraph(run(fileStem(source) + " — coded interview"), "Title"),
    paragraph(
      run(
        "The transcript shows the coding saved for this interview. Highlighted words carry Word comments with their labels. The coloured squares identify the labels in print.",
      ),
    ),
    paragraph(run("Label legend"), "Heading1"),
    ...(labels.length
      ? labels.map((label) => {
          const category = colours.get(labelKey(label)).category,
            definition = definitions.get(labelKey(label));
          return paragraph(
            labelRun(label, colours) +
              run(
                (category ? "  ·  " + category : "") +
                  (definition ? "    " + definition : ""),
              ),
          );
        })
      : [paragraph(run("No labels applied yet."))]),
    paragraph(
      run(
        dataset.excerptSources?.includes(source)
          ? "Imported passages"
          : "Transcript",
      ),
      "Heading1",
    ),
  ];
  for (const p of index.originals) {
    const located = quotationRanges(index, p);
    const rangedCodes = [];
    for (const { start, end, labels: matched } of located)
      for (const label of matched) rangedCodes.push({ start, end, label });
    // A whole-passage assignment is different from a code attached to an
    // ambiguous quotation; mark the latter in a note without inventing an offset.
    const unresolved = (p.codingEvidence || []).filter(
      (e) =>
        p.codes.includes(e.code) &&
        (!e.quote ||
          p.text.indexOf(e.quote) < 0 ||
          p.text.indexOf(e.quote) !== p.text.lastIndexOf(e.quote)),
    );
    for (const label of p.codes)
      if (
        !p.codingEvidence?.some((e) => e.code === label) &&
        !rangedCodes.some(
          (r) => r.label === label && r.start === 0 && r.end === p.text.length,
        )
      )
        rangedCodes.push({ start: 0, end: p.text.length, label });
    for (const r of rangedCodes) {
      r.id = comments.length;
      comments.push(
        '<w:comment w:id="' +
          r.id +
          '" w:author="Data visualiser">' +
          paragraph(run("CODE: " + r.label)) +
          "</w:comment>",
      );
    }
    const points = [
      ...new Set([
        0,
        p.text.length,
        ...rangedCodes.flatMap((r) => [r.start, r.end]),
      ]),
    ].sort((a, b) => a - b);
    let line = "";
    const overlaps = [];
    for (const [i, offset] of points.entries()) {
      for (const r of rangedCodes.filter((r) => r.end === offset))
        line +=
          '<w:commentRangeEnd w:id="' +
          r.id +
          '"/><w:r><w:commentReference w:id="' +
          r.id +
          '"/></w:r>';
      for (const r of rangedCodes.filter((r) => r.start === offset))
        line += '<w:commentRangeStart w:id="' + r.id + '"/>';
      const next = points[i + 1];
      if (next === undefined) break;
      const covering = [
        ...new Set(
          rangedCodes
            .filter((r) => r.start <= offset && r.end >= next)
            .map((r) => r.label),
        ),
      ];
      if (covering.length > 1) {
        const previous = overlaps.at(-1);
        if (
          previous?.end === offset &&
          covering.length === previous.labels.length &&
          covering.every((l) => previous.labels.includes(l))
        )
          previous.end = next;
        else overlaps.push({ start: offset, end: next, labels: covering });
      }
      line += run(
        p.text.slice(offset, next),
        covering.length ? shade(colours.get(labelKey(covering[0])).colour) : "",
      );
    }
    doc.push(paragraph(line, "DVCodedPassage"));
    const used = [...new Set([...p.codes, ...rangedCodes.map((r) => r.label)])];
    if (used.length)
      doc.push(
        paragraph(
          used.map((c) => labelRun(c, colours)).join(run("    ")),
          "DVLabelNote",
        ),
      );
    for (const range of overlaps)
      doc.push(
        paragraph(
          run(
            "Shared labels on “" +
              p.text.slice(range.start, range.end) +
              "”    ",
          ) + range.labels.map((c) => labelRun(c, colours)).join(run("    ")),
          "DVLabelNote",
        ),
      );
    if (p.codingIncluded === false)
      doc.push(
        paragraph(run("Outside the selected coding passages."), "DVLabelNote"),
      );
    for (const e of unresolved)
      doc.push(
        paragraph(
          run(
            e.code +
              " · Supporting words without a unique location" +
              (e.quote ? " · “" + e.quote + "”" : ""),
          ),
          "DVLabelNote",
        ),
      );
  }
  return wordDocumentBytes(doc, comments);
}

export function codedInterviewDownload(dataset, sources) {
  if (!sources.length || sources.some((s) => !dataset.sources.includes(s)))
    throw Error("Choose an interview to export.");
  const colours = labelAppearance(dataset);
  const files = Object.create(null),
    names = new Set();
  for (const source of sources) {
    const stem = fileStem(source);
    let name = stem + "_coded.docx",
      n = 1;
    while (names.has(name.toLowerCase()))
      name = stem + " (" + ++n + ")_coded.docx";
    names.add(name.toLowerCase());
    files[name] = codedDocument(dataset, source, colours);
  }
  if (sources.length === 1) {
    const [name, bytes] = Object.entries(files)[0];
    return { name, blob: new Blob([bytes], { type: docxMime }) };
  }
  return {
    name: fileStem(dataset.name) + "_coded.zip",
    blob: new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }),
  };
}
