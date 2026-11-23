import { structuredAnswer } from "./bot-response.js";
import { labelKey, labelsInCodebook } from "./coding.js";

// Keep explicit lists and table rows intact. Only passages whose coding rules
// need interpretation go to the bot, with their original section boundaries.
function batches(sections) {
  const result = [];
  let batch = [],
    size = 0,
    lines = 0;
  for (const [index, section] of sections.entries()) {
    if (section.explicitOnly) continue;
    let part = [];
    function addPart() {
      if (!part.length) return;
      const text = part.join("\n").trim();
      part = [];
      if (!text) return;
      const length = text.length + section.category.length;
      const rows = text.split("\n").length;
      if (batch.length && (size + length > 6500 || lines + rows > 48)) {
        result.push(batch);
        batch = [];
        size = 0;
        lines = 0;
      }
      batch.push({ index, category: section.category, text });
      size += length;
      lines += rows;
    }
    let length = 0;
    for (const line of section.text.split("\n")) {
      if (part.length && (length + line.length > 6500 || part.length >= 48)) {
        addPart();
        length = 0;
      }
      part.push(line);
      length += line.length + 1;
    }
    addPart();
  }
  if (batch.length) result.push(batch);
  return result;
}

const pathParts = (path) =>
  path
    .split("›")
    .map((p) => p.trim())
    .filter(Boolean);
function groundedEntry(row, section) {
  if (!labelsInCodebook([row], section.text).length) return;
  const given = pathParts(row.category || "").filter(
    (part) =>
      !/^(?:(?:approved|interview|coding)\s+)*(?:codes?|codebook|labels?|categories|codeboek|table headings?)\s*:?$/i.test(
        part,
      ),
  );
  const parent = pathParts(section.category);
  const evidence = section.category + "\n" + section.text;
  if (!given.every((label) => labelsInCodebook([{ label }], evidence).length))
    return;
  // A model may repeat all or the end of the supplied category before adding
  // a more specific subcategory. Keep the source path once.
  let overlap = Math.min(parent.length, given.length);
  while (overlap && !parent.slice(-overlap).every((p, i) => p === given[i]))
    overlap--;
  const path = [...parent, ...given.slice(overlap)];
  // An independently applicable parent belongs alongside its siblings. The
  // heading already supplies its own name, so it must not be its own child.
  if (path.length && labelKey(path.at(-1)) === labelKey(row.label)) path.pop();
  const category = path.join(" › ");
  return {
    label: row.label.trim(),
    definition: row.definition.trim(),
    ...(category && { category }),
  };
}

async function interpret(batch, request) {
  const sections = batch.map(({ category, text }, i) => ({
    id: String(i + 1),
    category,
    text,
  }));
  // Retain the original single-document contract for plain, unsectioned text.
  const context =
    sections.length === 1 && !sections[0].category
      ? { document: sections[0].text }
      : { sections };
  const answer = await request({
    skill: "codebook",
    question:
      "Extract each applicable code as a separate review row, in source order, with its original category and meaning. For sections include the supplied sectionId.",
    context,
  });
  const rows = structuredAnswer(answer)?.entries;
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        typeof row?.label !== "string" ||
        typeof row.definition !== "string" ||
        (row.category != null && typeof row.category !== "string"),
    )
  ) {
    throw Error(
      "The bot returned an unreadable codebook. Try extracting the labels again.",
    );
  }
  return rows;
}

export async function extractCodebookEntries(document, request) {
  const sections = document.sections;
  const groups = sections.map((section) => [...section.entries]);
  let omitted = 0;
  async function read(batch) {
    const retry = new Set();
    const rows = await interpret(batch, request);
    for (const row of rows) {
      const id = String(row.sectionId ?? "");
      let matches = [];
      for (const [i, section] of batch.entries()) {
        if (id && id !== String(i + 1)) continue;
        const entry = groundedEntry(row, section);
        if (entry) matches.push({ section, entry });
      }
      if (matches.length === 1) {
        const { section, entry } = matches[0];
        const explicit = sections[section.index].entries.some(
          (item) =>
            labelKey(item.label) === labelKey(entry.label) &&
            labelKey(item.category || "") === labelKey(entry.category || ""),
        );
        if (!explicit) groups[section.index].push(entry);
      } else if (matches.length > 1) {
        // Older gateways may omit source IDs. An isolated retry avoids
        // guessing which of several questions a repeated option belongs to.
        for (const { section } of matches) retry.add(section);
      } else omitted++;
    }
    for (const section of retry) await read([section]);
  }
  for (const batch of batches(sections)) await read(batch);
  const unique = new Map();
  for (const row of groups.flat()) {
    const key = JSON.stringify([
      labelKey(row.category || ""),
      labelKey(row.label),
    ]);
    const saved = unique.get(key);
    if (!saved) unique.set(key, { ...row });
    else if (
      row.definition &&
      !saved.definition.split("\n").includes(row.definition)
    )
      saved.definition = [saved.definition, row.definition]
        .filter(Boolean)
        .join("\n");
  }
  return { entries: [...unique.values()], omitted };
}
