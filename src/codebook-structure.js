// Keep the original wording and use layout to distinguish a heading, a code
// and the examples or instructions that explain it.
const comparison = (s) =>
  s.trim().replace(/\s+/gu, " ").normalize("NFKC").toLowerCase();
const outline = /^(\d+(?:\.\d+)*(?:\.?[a-z]{1,4})?)\.?\s+(\S.*)$/iu;
const guidance =
  /^(?:(?:coding\s+)?instructions?|(?:coding\s+)?guidelines?|examples?|illustrative quotes?|sample quotes?|include|exclude|inclusion(?: criteria| rules)?|exclusion(?: criteria| rules)?|interview questions?|interview guide|definition|instructies|voorbeelden|citaten|einschlusskriterien|beispiele|exemples)(?:\s*[:–—]|\s*$)/iu;
const genericTitle =
  /^(?:the\s+)?(?:interview\s+)?(?:code\s?book|coding (?:framework|manual|scheme)|codeboek|k[oö]dierleitfaden|livre de codes)\b/iu;
const listHeading =
  /^(?:codes?|labels?|subcodes?|sublabels?|codes to (?:use|apply)|applicable codes|allowed values)[:\s]*$/iu;
const interviewPrompt =
  /^(?:tell me about|(?:can|could) you (?:tell|describe|explain)|please (?:describe|explain|tell)|(?:describe|explain) (?:your|how|which|what)|how (?:do|did|would|does)|what (?:do|did|would|was|were|is|are)|kunt u|kun je|vertel (?:me|eens)|beschrijf)\b/iu;
const parentCodingRule =
  /\b(?:also\s+(?:apply|assign|use|code)|(?:apply|assign|use|code)\b.{0,75}\b(?:directly|independently|itself|on its own|without (?:a |any )?(?:child|subcode))|(?:parent|category|theme|overarching code)\b.{0,75}\b(?:codable|codeable|independently|also applies)|(?:use|apply|assign) (?:this|the parent) (?:code|label|category) (?:if|when|where|for)|both (?:the )?parent and (?:the )?(?:child|subcode)|ook (?:de |het )?(?:hoofdcode|overkoepelende code)|registreer (?:de )?hoofdcode)\b/iu;
const columnNames = {
  label:
    /^(?:(?:code|subcode|sub-code|label|subtheme|sub-theme)(?: name| label)?|name of code|codenaam|naam van code|sublabel|code name|sous-code)$/iu,
  parent:
    /^(?:categor(?:y|ie)|question|vraag|domein|domain|theme|thema|parent(?: code| category| label)?|family|famille|rubrique|topic|hoofdcategorie)$/iu,
  meaning:
    /^(?:definition|description|meaning|omschrijving|definitie|beschrijving|bedeutung|définition)$/iu,
  boundary:
    /^(?:inclusion|exclusion|include|exclude|inclusie|exclusie)(?: criteria| rules)?$/iu,
};
const pathFrom = (parts) => parts.filter(Boolean).join(" › ");

function numberedHeading(text) {
  const hit = text.match(outline);
  if (!hit) return;
  const parts = hit[1].match(/\d+|[a-z]+/giu);
  return { text, kind: "heading", level: parts.length, numbered: true };
}
export function textBlocks(text) {
  const blocks = [];
  for (const line of text.split(/\r?\n/gu)) {
    const value = line.trim();
    if (!value) continue;
    const heading = value.match(/^(#{1,6})\s+(.+)$/u);
    const item = line.match(/^(\s*)[-*+•◦▪‣]\s+(.+)$/u);
    if (heading)
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: heading[2],
      });
    else if (item)
      blocks.push({
        kind: "item",
        level: item[1].replace(/\t/gu, "    ").length,
        text: item[2].trim(),
      });
    else blocks.push({ kind: "paragraph", text: value });
  }
  return blocks;
}

// A distinct label (or subcode) column is required. A spreadsheet arranged
// some other way still goes to the bot with its original rows and columns.
function tableEntries(rows, sectionCategory) {
  if (!rows.length) return;
  const header = rows[0].map((cell) => String(cell || "").trim());
  const labelCols = header.flatMap((h, i) =>
    columnNames.label.test(h) ? [i] : [],
  );
  if (!labelCols.length) return;
  const leaf = labelCols.at(-1);
  const parents = header.flatMap((h, i) =>
    i !== leaf && (columnNames.parent.test(h) || labelCols.includes(i))
      ? [i]
      : [],
  );
  const meaning = header.findIndex((h) => columnNames.meaning.test(h));
  const rules = header.flatMap((h, i) =>
    columnNames.boundary.test(h) ? [i] : [],
  );
  const inherited = parents.map(() => "");
  const entries = [];
  let ambiguous = false;
  const codable = header.findIndex((h) =>
    /^(?:codable|codeable|apply to passages|independently applicable|apply parent)\??$/iu.test(
      h,
    ),
  );
  for (const row of rows.slice(1)) {
    if (header.every((h, i) => String(row[i] ?? "").trim() === h)) continue;
    if (!row.some((cell) => String(cell ?? "").trim())) {
      inherited.fill("");
      continue;
    }
    for (const [i, col] of parents.entries()) {
      const value = String(row[col] ?? "").trim();
      if (!value) continue;
      if (value !== inherited[i]) inherited.fill("", i + 1);
      inherited[i] = value;
    }
    let label = String(row[leaf] ?? "").trim();
    let category = pathFrom([sectionCategory, ...inherited]);
    if (!label) {
      // A row with its own code and definition can be used directly even
      // when it has no subcode. A category heading alone is not such a row.
      const parent = parents.findLast((col) => String(row[col] ?? "").trim());
      if (parent === undefined || !String(row[meaning] ?? "").trim()) continue;
      const explicitlyCodable = /^(?:yes|true|1|ja|oui)$/iu.test(
        String(row[codable] || "").trim(),
      );
      if (
        !explicitlyCodable &&
        (codable >= 0 ||
          (!columnNames.label.test(header[parent]) &&
            !/^parent code$/iu.test(header[parent])))
      ) {
        if (codable < 0) ambiguous = true;
        continue;
      }
      label = String(row[parent]).trim();
      category = pathFrom([
        sectionCategory,
        ...inherited.slice(0, parents.indexOf(parent)),
      ]);
    }
    // Multiple or multiline values in a labelled cell need a review of their
    // layout. Do not present a whole list from a cell as one definitive code.
    const outsideBrackets = label.replace(/\([^()]*\)|\[[^\[\]]*\]/gu, "");
    const commaItems = outsideBrackets.split(",").map((s) => s.trim());
    if (
      /[\n;•]/u.test(label) ||
      (commaItems.length >= 3 &&
        commaItems.every((s) => s && s.split(/\s+/u).length <= 3))
    ) {
      ambiguous = true;
      continue;
    }
    const definition = [
      row[meaning],
      ...rules.flatMap((col) =>
        row[col] ? [header[col] + ": " + row[col]] : [],
      ),
    ]
      .filter(Boolean)
      .join("\n");
    entries.push({
      label,
      category,
      definition,
    });
  }
  return { entries, ambiguous };
}

function sectionText(block) {
  if (block.kind === "table")
    return block.rows.map((r) => r.join("\t")).join("\n");
  if (block.kind === "item")
    return "  ".repeat(Math.min(12, block.level || 0)) + "- " + block.text;
  return block.text;
}
function classify(block, next, following, previous, index) {
  if (block.kind === "table" || block.kind === "item") return block;
  if (!index && (block.title || genericTitle.test(block.text)))
    return { ...block, kind: "title" };
  const numbered = numberedHeading(block.text);
  if (numbered) return { ...numbered, level: block.level ?? numbered.level };
  if (block.kind === "heading") return block;
  if (
    block.bold &&
    block.text === block.text.toUpperCase() &&
    /\p{L}/u.test(block.text)
  )
    return { ...block, kind: "heading", level: 1 };
  if (
    (next?.kind === "item" ||
      (block.bold &&
        following?.kind === "item" &&
        next?.kind === "paragraph")) &&
    !block.italic &&
    !guidance.test(block.text) &&
    !listHeading.test(block.text) &&
    (block.bold ||
      block.text.endsWith(":") ||
      ((!previous || ["item", "title"].includes(previous.kind)) &&
        block.text.length <= 70 &&
        !/[.!?;]$/u.test(block.text)) ||
      (block.text.endsWith("?") && previous?.kind !== "heading"))
  )
    return { ...block, kind: "heading", level: 2 };
  return block;
}
function sectionPath(stack) {
  // A printed section identifier already locates that category in the outline.
  // Unnumbered nested headings retain their ancestry in the displayed path.
  const lastNumbered = stack.findLastIndex((b) => b.numbered);
  return pathFrom(stack.slice(Math.max(0, lastNumbered)).map((b) => b.text));
}
function unique(entries) {
  const keys = new Map();
  for (const e of entries) {
    const key = JSON.stringify([comparison(e.category), comparison(e.label)]);
    if (!keys.has(key)) keys.set(key, e);
    else if (
      e.definition &&
      !keys.get(key).definition.split("\n").includes(e.definition)
    )
      keys.get(key).definition = [keys.get(key).definition, e.definition]
        .filter(Boolean)
        .join("\n");
  }
  return [...keys.values()];
}

export function codebookStructure(input) {
  const blocks = input
    .filter((b) => b.kind === "table" || b.text?.trim())
    .slice();
  // A short numbered vocabulary is often typed as a list, without any Word
  // list metadata. Only remove the enumeration in a whole list or under an
  // explicit codes heading. Dotted section identifiers keep their meaning.
  const numberedItem = (b) =>
    b?.kind === "paragraph" && b.text.match(/^(\d{1,3})[.)]\s+(.+)$/u);
  for (let i = 0; i < blocks.length; i++) {
    const first = numberedItem(blocks[i]);
    if (!first) continue;
    let j = i + 1;
    while (
      j < blocks.length &&
      Number(numberedItem(blocks[j])?.[1]) === Number(first[1]) + j - i
    )
      j++;
    const preceding = blocks.slice(0, i);
    const wholeList =
      j === blocks.length &&
      preceding.every(
        (b) =>
          b.text && (genericTitle.test(b.text) || listHeading.test(b.text)),
      );
    if (wholeList || listHeading.test(blocks[i - 1]?.text || "")) {
      for (let k = i; k < j; k++)
        blocks[k] = {
          kind: "item",
          level: 0,
          text: numberedItem(blocks[k])[2],
        };
    }
    i = j - 1;
  }
  const sections = [];
  const stack = [];
  let group = { headings: [], content: [] };
  const classified = [];
  for (const [i, block] of blocks.entries())
    classified.push(
      classify(block, blocks[i + 1], blocks[i + 2], classified.at(-1), i),
    );
  for (const block of classified) {
    if (block.kind === "heading") {
      if (group.headings.length || group.content.length) sections.push(group);
      while (stack.length && stack.at(-1).level >= block.level) stack.pop();
      stack.push(block);
      group = { headings: [...stack], content: [] };
    } else group.content.push(block);
  }
  if (group.headings.length || group.content.length) sections.push(group);
  const codedParents = new Set(
    sections
      .filter(
        ({ headings, content }) =>
          headings.at(-1)?.numbered && content.some((b) => b.kind === "item"),
      )
      .map(({ headings }) => headings.at(-2)),
  );

  return {
    text: classified.map(sectionText).join("\n").trim(),
    sections: sections.map(({ headings, content }, i) => {
      const current = headings.at(-1);
      const category = sectionPath(headings);
      const child = current && sections[i + 1]?.headings.includes(current);
      const text = [current?.text, ...content.map(sectionText)]
        .filter(Boolean)
        .join("\n");
      const usable = content.filter((b) => b.kind !== "title");
      const entries = [];
      const ancestry = [];
      // Some manuals prefix several distinct codes with the same acronym.
      // An isolated "label: meaning" is a different format and needs parsing.
      const prefixCounts = new Map();
      for (const b of usable.filter((b) => b.kind === "item")) {
        const prefix = b.text.match(/^([\p{Lu}\d]{2,8}):\s/u)?.[1];
        if (prefix)
          prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
      }
      let definitions = [],
        hasList = false,
        ignoredExamples = false,
        ambiguous = false;
      const questionsOnly =
        /^(?:interview (?:guide|questions?)|topic guide)\s*:?$/iu;
      for (const [index, block] of usable.entries()) {
        if (block.kind === "table") {
          const found = tableEntries(block.rows, category);
          if (found) entries.push(...found.entries);
          if (!found || found.ambiguous) ambiguous = true;
          ancestry.length = 0;
        } else if (block.kind === "item") {
          hasList = true;
          if (ignoredExamples) continue;
          while (ancestry.length && ancestry.at(-1).level >= block.level)
            ancestry.pop();
          const next = usable[index + 1];
          if (next?.kind === "item" && next.level > block.level) {
            ancestry.push(block);
            continue;
          }
          if (
            ancestry.some((p) => guidance.test(p.text)) ||
            guidance.test(block.text)
          )
            continue;
          const colon = block.text.match(/^([^:]+):\s/u);
          if (
            block.text.endsWith("?") ||
            interviewPrompt.test(block.text) ||
            block.text.length > 220 ||
            /[;|]|\s[–—]\s/u.test(block.text) ||
            (colon && !(prefixCounts.get(colon[1]) > 1))
          ) {
            ambiguous = true;
            continue;
          }
          entries.push({
            label: block.text,
            category: pathFrom([category, ...ancestry.map((p) => p.text)]),
            definition: definitions.join("\n"),
          });
        } else {
          ancestry.length = 0;
          if (guidance.test(block.text)) ignoredExamples = true;
          if (questionsOnly.test(block.text)) ambiguous = true;
          if (listHeading.test(block.text)) ignoredExamples = false;
          else if (!hasList && !ignoredExamples) definitions.push(block.text);
          else if (hasList && !ignoredExamples) ambiguous = true;
        }
      }
      if (current && guidance.test(current.text.replace(outline, "$2")))
        return {
          category,
          entries: [],
          text,
          explicitOnly: !questionsOnly.test(
            current.text.replace(outline, "$2"),
          ),
        };
      if (
        !entries.length &&
        !hasList &&
        !child &&
        current?.numbered &&
        codedParents.has(headings.at(-2)) &&
        !current.text.endsWith("?") &&
        !usable.some((b) => b.kind === "table")
      ) {
        entries.push({
          label: current.text,
          category: sectionPath(headings.slice(0, -1)),
          definition: definitions.join("\n"),
        });
      }
      const explained =
        entries.length ||
        child ||
        (!usable.length && !current) ||
        ignoredExamples;
      // A heading can organise its children and also be a code in its own
      // right. Keep the exact instruction available to the interpreter.
      if (
        current &&
        (child || hasList) &&
        usable.some(
          (b) => b.kind === "paragraph" && parentCodingRule.test(b.text),
        )
      )
        ambiguous = true;
      return {
        category,
        entries: unique(entries),
        text,
        explicitOnly: !!explained && !ambiguous,
      };
    }),
  };
}
