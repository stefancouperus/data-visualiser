import { zipSync, strToU8 } from "fflate";

const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const office =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNS = "http://schemas.openxmlformats.org/package/2006";
export const docxMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const xml = (value) =>
  String(value ?? "")
    .replace(
      /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,
      "",
    )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function run(value, properties = "") {
  const text = String(value)
    .split(/(\r\n|\r|\n|\t)/)
    .map((s) =>
      s === "\t"
        ? "<w:tab/>"
        : /^[\r\n]+$/.test(s)
          ? "<w:br/>"
          : '<w:t xml:space="preserve">' + xml(s) + "</w:t>",
    )
    .join("");
  return (
    "<w:r>" +
    (properties ? "<w:rPr>" + properties + "</w:rPr>" : "") +
    text +
    "</w:r>"
  );
}
export function paragraph(body, style = "") {
  return (
    "<w:p>" +
    (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : "") +
    body +
    "</w:p>"
  );
}
const docStyles = [
  ["Normal", "Normal", "", 22, "100"],
  ["Title", "Title", "<w:b/>", 36, "140"],
  ["Heading1", "Heading 1", "<w:b/>", 28, "110"],
  ["Heading2", "Heading 2", "<w:b/>", 23, "60"],
  ["LogMeta", "Log metadata", '<w:color w:val="404040"/>', 19, "25"],
  ["DVCodedPassage", "Transcript passage", "", 23, "80"],
  ["DVLabelNote", "Coding note", "", 19, "95"],
]
  .map(
    ([id, name, props, size, after]) =>
      '<w:style w:type="paragraph" w:styleId="' +
      id +
      '"' +
      (id === "Normal" ? ' w:default="1"' : "") +
      '><w:name w:val="' +
      name +
      '"/>' +
      (id !== "Normal" ? '<w:basedOn w:val="Normal"/>' : "") +
      "<w:pPr>" +
      (["Title", "Heading1", "Heading2", "LogMeta"].includes(id)
        ? "<w:keepNext/>"
        : "") +
      '<w:spacing w:after="' +
      after +
      '" w:line="285" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>' +
      props +
      '<w:sz w:val="' +
      size +
      '"/></w:rPr></w:style>',
  )
  .join("");

export function wordDocumentBytes(doc, comments = []) {
  const types =
    '<Types xmlns="' +
    packageNS +
    '/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    ["document", "styles", "comments"]
      .map(
        (part) =>
          '<Override PartName="/word/' +
          part +
          '.xml" ContentType="' +
          (part === "document"
            ? docxMime + ".main+xml"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml." +
              part +
              "+xml") +
          '"/>',
      )
      .join("") +
    "</Types>";
  const rels = (list) =>
    '<Relationships xmlns="' +
    packageNS +
    '/relationships">' +
    list
      .map(
        ([type, target], i) =>
          '<Relationship Id="rId' +
          (i + 1) +
          '" Type="' +
          office +
          "/" +
          type +
          '" Target="' +
          target +
          '"/>',
      )
      .join("") +
    "</Relationships>";
  const files = {
    "[Content_Types].xml": types,
    "_rels/.rels": rels([["officeDocument", "word/document.xml"]]),
    "word/document.xml":
      '<w:document xmlns:w="' +
      word +
      '"><w:body>' +
      doc.join("") +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1150" w:right="1200" w:bottom="1150" w:left="1200"/></w:sectPr></w:body></w:document>',
    "word/styles.xml":
      '<w:styles xmlns:w="' + word + '">' + docStyles + "</w:styles>",
    "word/comments.xml":
      '<w:comments xmlns:w="' +
      word +
      '">' +
      comments.join("") +
      "</w:comments>",
    "word/_rels/document.xml.rels": rels([
      ["styles", "styles.xml"],
      ["comments", "comments.xml"],
    ]),
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, body]) => [
        path,
        strToU8(
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + body,
        ),
      ]),
    ),
  );
}
