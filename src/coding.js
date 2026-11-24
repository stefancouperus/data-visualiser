import { passageUnits } from "./transcript-index.js";

// Limits apply to bot proposals. Students keep control of their own vocabulary.
export const codingLimits = {
  perPassage: 2,
  newPerBatch: 2,
  inductiveLabels: 8,
};
export const discoveryLimit = 6;
const key = (text) =>
  text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

export { key as labelKey };

// Early projects can store a label as a string; the first spelling and meaning
// are the ones students recognise in an established codebook.
export function labelVocabulary(entries = []) {
  const vocabulary = new Map();
  for (const entry of entries) {
    const label = typeof entry === "string" ? entry : entry?.label;
    if (typeof label !== "string" || !label.trim()) continue;
    const id = key(label);
    if (!vocabulary.has(id))
      vocabulary.set(id, {
        label: label.trim(),
        definition:
          typeof entry?.definition === "string" ? entry.definition : "",
        ...(typeof entry?.category === "string" && entry.category.trim()
          ? { category: entry.category.trim() }
          : {}),
        ...(typeof entry?.sourceLabel === "string" && entry.sourceLabel.trim()
          ? { sourceLabel: entry.sourceLabel.trim() }
          : {}),
      });
  }
  return [...vocabulary.values()];
}

export const approvedBook = (d) => labelVocabulary(d.coding?.book);

// A declined assignment applies to this passage and this meaning of the code.
// Editing its definition allows the revised code to be considered afresh.
export function rememberDeclinedLabels(passage, entries) {
  if (!entries.length) return;
  const previous = Array.isArray(passage.declinedCoding)
    ? passage.declinedCoding
    : [];
  const updated = new Map(
    previous
      .filter((e) => typeof e?.label === "string")
      .map((e) => [key(e.label), e]),
  );
  for (const { label, category = "", definition = "" } of entries)
    updated.set(key(label), { label, category, definition });
  passage.declinedCoding = [...updated.values()];
}

export function secondLookPassages(passages, vocabulary) {
  const active = new Map(vocabulary.map((entry) => [key(entry.label), entry]));
  return passageUnits(passages).map((p) => {
    const declinedCodes = [];
    for (const saved of Array.isArray(p.declinedCoding)
      ? p.declinedCoding
      : []) {
      const entry =
        typeof saved?.label === "string" && active.get(key(saved.label));
      if (
        entry &&
        (entry.category || "") === saved.category &&
        entry.definition === saved.definition
      )
        declinedCodes.push(entry.label);
    }
    return { ...p, declinedCodes };
  });
}

// Older annotations are retained on the transcript. Only active codes should
// influence a new deductive pass, including the two-code limit.
export function codingRequestContext(context) {
  if (context.guide.mode !== "deductive") return context;
  const active = new Map(
    context.guide.vocabulary.map((e) => [key(e.label), e.label]),
  );
  return {
    ...context,
    passages: context.passages.map((p) => ({
      ...p,
      codes: [
        ...new Set(
          (p.codes || []).map((c) => active.get(key(c))).filter(Boolean),
        ),
      ],
    })),
  };
}

export function allCodes(d) {
  const approved = d.interviews?.established
    ? approvedBook(d).map((e) => e.label)
    : [];
  return [...new Set([...approved, ...d.passages.flatMap((p) => p.codes)])];
}

// The stored passage tag can be a bare leaf or a shorter unique path. Accept
// the exact full path too. A spelling shared by two entries has no safe match.
export function approvedLabelLookup(vocabulary) {
  const names = new Map();
  for (const entry of vocabulary) {
    const spellings = [entry.label];
    if (entry.category)
      spellings.push(
        entry.category + " › " + (entry.sourceLabel || entry.label),
      );
    for (const spelling of spellings) {
      const name = key(spelling);
      if (!names.has(name)) names.set(name, entry);
      else if (names.get(name) !== entry) names.set(name, null);
    }
  }
  return names;
}

export function codingGuide(
  d,
  mode = d.interviews?.established
    ? "deductive"
    : d.coding?.mode || "inductive",
) {
  const labels = [...new Set(d.passages.flatMap((p) => p.codes))];
  const vocabulary =
    mode === "deductive"
      ? approvedBook(d)
      : labels.map((label) => ({
          label,
          definition:
            d.coding?.meanings?.find((entry) => entry.label === label)
              ?.definition ||
            d.coding?.book?.find((entry) => entry.label === label)
              ?.definition ||
            "",
        }));
  if (mode === "deductive" && !vocabulary.length)
    throw Error("Review and use a codebook first.");
  return {
    mode,
    focus: d.coding?.focus || "",
    vocabulary,
    limits:
      mode === "deductive"
        ? { perPassage: codingLimits.perPassage, newPerBatch: 0 }
        : codingLimits,
  };
}

// Return the original words, including their original punctuation and spacing.
// Only typographical apostrophes and runs of whitespace are interchangeable.
function supportingQuote(source, quote) {
  if (typeof quote !== "string" || !quote.trim()) return;
  const words = quote.trim();
  if (source.includes(words)) return words;
  const pattern = words
    .split(/(['‘’]|\s+)/u)
    .map((part) => {
      if (/^['‘’]$/u.test(part)) return "['‘’]";
      if (/^\s+$/u.test(part)) return "\\s+";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return source.match(new RegExp(pattern, "u"))?.[0];
}

export function checkedSuggestions(raw, passages, guide, excluded) {
  return validateSuggestions(
    raw,
    passages,
    guide,
    guide.limits?.newPerBatch ?? codingLimits.newPerBatch,
    excluded,
  );
}

// Each model request has already had its new-label budget checked. The
// combined review still enforces the project's vocabulary and passage limits.
export function checkedCollectedSuggestions(raw, passages, guide, excluded) {
  return validateSuggestions(
    raw,
    passages,
    guide,
    guide.limits?.newPerSample ?? codingLimits.inductiveLabels,
    excluded,
  );
}

function validateSuggestions(raw, passages, guide, newLabelLimit, excluded) {
  if (!Array.isArray(raw))
    throw Error(
      "The bot did not return a readable list of suggestions. Try again.",
    );
  const known = new Map(
    guide.vocabulary.map((entry) => [key(entry.label), entry]),
  );
  const approved = approvedLabelLookup(guide.vocabulary);
  const existingLeaves = new Set(
    guide.vocabulary.map((entry) => key(entry.sourceLabel || entry.label)),
  );
  const withdrawn = new Set((guide.withdrawnLabels || []).map(key));
  const newLabels = new Map();
  const used = new Map(
    passages.map((p) => [
      p.id,
      new Set(
        p.codes
          .map(key)
          .filter((code) => guide.mode !== "deductive" || known.has(code)),
      ),
    ]),
  );
  const sources = new Map(passages.map((p) => [p.id, p.text]));
  const secondLook =
    guide.mode === "deductive" && guide.reviewPass === "missed";
  const added = new Map();
  const declined = new Map(
    secondLook
      ? passages.map((p) => [p.id, new Set((p.declinedCodes || []).map(key))])
      : [],
  );
  const result = [];
  const skip = (reason) => {
    if (excluded) excluded[reason] = (excluded[reason] || 0) + 1;
  };
  for (const entry of raw) {
    const source = sources.get(entry?.id);
    if (source === undefined) {
      skip("passage");
      continue;
    }
    const quote = supportingQuote(source, entry.quote);
    if (!quote) {
      skip("quote");
      continue;
    }
    const label = typeof entry.code === "string" ? entry.code.trim() : "";
    if (!label) {
      skip("label");
      continue;
    }
    const spelling = key(label);
    const recognised = approved.get(spelling);
    const id = recognised ? key(recognised.label) : spelling,
      taken = used.get(entry.id);
    const leaf = spelling.split("›").at(-1).trim();
    if (
      withdrawn.has(id) ||
      (!recognised &&
        (guide.mode === "deductive" ||
          approved.has(spelling) ||
          existingLeaves.has(leaf)))
    ) {
      skip("label");
      continue;
    }
    if (taken.has(id)) {
      skip("duplicate");
      continue;
    }
    if (declined.get(entry.id)?.has(id)) {
      skip("declined");
      continue;
    }
    if (
      (secondLook ? added.get(entry.id) || 0 : taken.size) >=
      codingLimits.perPassage
    ) {
      skip("capacity");
      continue;
    }
    let canonical = recognised || newLabels.get(id);
    if (!canonical) {
      if (
        newLabels.size >= newLabelLimit ||
        known.size + newLabels.size >= codingLimits.inductiveLabels
      ) {
        skip("capacity");
        continue;
      }
      canonical = {
        label,
        definition:
          typeof entry.definition === "string" ? entry.definition.trim() : "",
      };
      newLabels.set(id, canonical);
    }
    taken.add(id);
    if (secondLook) added.set(entry.id, (added.get(entry.id) || 0) + 1);
    result.push({
      id: entry.id,
      code: canonical.label,
      definition: canonical.definition,
      quote,
      reason: typeof entry.reason === "string" ? entry.reason : "",
    });
  }
  return result;
}
export function bookEntries(rows) {
  if (!rows.length)
    throw Error("Include at least one label before using this codebook.");
  const branches = new Map();
  const entries = rows.map((row) => {
    // Approved entries keep their original sublabel alongside their passage
    // tag. Both forms also feed the editor when an existing book is revised.
    const label = (row.sourceLabel || row.label).trim(),
      definition = row.definition.trim(),
      category = (row.category || "")
        .split("›")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" › ");
    if (!label) throw Error("Give each entry a label or remove its row.");
    const name = key(label);
    if (!branches.has(name)) branches.set(name, new Set());
    const parents = branches.get(name);
    if (parents.has(key(category)))
      throw Error(
        "Each label must appear once within a category. Combine or rename the duplicate “" +
          label +
          "”.",
      );
    parents.add(key(category));
    return category ? { label, definition, category } : { label, definition };
  });
  // Passage tags are strings in both existing projects and shared Word files.
  // Only homonyms need a qualified tag. Keep the exact leaf for the editor.
  const used = new Set(branches.keys());
  return entries.map((entry, index) => {
    const row = rows[index];
    const previous = row.sourceLabel ? row.label : row.previousLabel;
    const parents = branches.get(key(entry.label));
    const parent = entry.category || "Labels without a category";
    const path = parent.split(" › ");
    const uniqueQualifier = (qualifier) =>
      ![...parents].some((other) => {
        if (other === key(entry.category || "")) return false;
        const otherPath = other || key("Labels without a category");
        // A full path remains usable when it is the suffix of a longer one.
        return (
          otherPath === qualifier ||
          (qualifier !== key(parent) && otherPath.endsWith(" › " + qualifier))
        );
      });
    if (
      typeof previous === "string" &&
      previous.endsWith(" › " + entry.label) &&
      !used.has(key(previous)) &&
      path.some((_, i) => {
        const qualifier = path.slice(i).join(" › ");
        return (
          previous === qualifier + " › " + entry.label &&
          uniqueQualifier(key(qualifier))
        );
      })
    ) {
      used.add(key(previous));
      return { ...entry, label: previous, sourceLabel: entry.label };
    }
    if (parents.size === 1) return entry;
    // A bare reply from the bot must never resolve to one branch of a
    // repeated name, even when one of those branches is uncategorised.
    for (let depth = 1; depth <= path.length; depth++) {
      const qualifier = path.slice(-depth).join(" › ");
      if (!uniqueQualifier(key(qualifier))) continue;
      const label = qualifier + " › " + entry.label;
      if (used.has(key(label))) continue;
      used.add(key(label));
      return { ...entry, label, sourceLabel: entry.label };
    }
    throw Error(
      "Two labels would have the same full name. Edit a label or its category before approving the codebook.",
    );
  });
}

// A model-extracted deductive label must occur as a complete label or phrase
// in the uploaded material. PDF line breaks and equivalent Unicode are common.
export function labelsInCodebook(entries, source) {
  const normalise = (value) =>
    value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const document = normalise(source);
  return entries.filter(({ label }) => {
    const term = normalise(label);
    if (!term) return false;
    let at = document.indexOf(term);
    while (at !== -1) {
      const end = at + term.length;
      if (
        !(
          /[\p{L}\p{N}]$/u.test(document.slice(0, at)) &&
          /^[\p{L}\p{N}]/u.test(term)
        ) &&
        !(
          /[\p{L}\p{N}]$/u.test(term) &&
          /^[\p{L}\p{N}]/u.test(document.slice(end))
        )
      )
        return true;
      at = document.indexOf(term, at + 1);
    }
    return false;
  });
}

// Only an unqualified acceptance of the displayed batch can write codes from chat.
export function acceptsCodingBatch(message) {
  const words = message
    .toLowerCase()
    .trim()
    .replace(/[.!?,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:please )?(?:apply|accept|adopt) all(?: please)?$/.test(words))
    return true;
  return /^(?:(?:yes|ok|okay|sure) )?(?:(?:can|could|would) you |i(?:'d like| would like| want) you to )?(?:please )?(?:apply|accept|adopt|assign|use|add) (?:all(?: of)? )?(?:them(?: all)?|these|those|the suggestions|(?:the|these|those|your|suggested)(?: suggested| proposed)? (?:labels|codes|suggestions))(?:(?: to| on) (?:the |these |those |their |my )?(?:matching |selected )?(?:passages|excerpts|responses|transcript))?(?: please| now)?$/.test(
    words,
  );
}

export function requestsCoding(message) {
  if (/\b(?:chart|plot|graph|figure|axis|legend)\b/i.test(message))
    return false;
  return (
    acceptsCodingBatch(message) ||
    /\b(?:apply|use|assign) (?:them|those|these)(?: to| across| on| in) (?:all |both |each |every |the |my |our |selected |other )*(?:interviews?|transcripts?)\b/i.test(
      message,
    ) ||
    /\b(?:come up with|suggest|propose|generate|recommend|identify|assign|apply|adopt|create|give me|develop|find)\b.{0,65}\b(?:labels?|codes?|themes?)\b/i.test(
      message,
    ) ||
    /\b(?:code|label|tag) (?:these|those|the|my|this|selected|both|every|each|all|one|two|three|\d+|interviews?|transcripts?|passages?)\b/i.test(
      message,
    ) ||
    /\b(?:inductiv\w*|deductiv\w*|thematic) cod(?:e|ing)\b/i.test(message)
  );
}

export function requestsLabelDiscovery(message, established = false) {
  const text = message.toLowerCase().replace(/’/g, "'");
  const noAdditions =
    /\b(?:no|without(?: any)?) (?:new|extra|additional|fresh) (?:labels?|codes?|themes?)\b|\b(?:never|avoid|without|don't|do not|must not|cannot|can't) (?:propos\w*|generat\w*|invent\w*|creat\w*|introduc\w*|add\w*|suggest\w*)\b[^.!?;]{0,35}\b(?:codes?|labels?|themes?)\b/;
  const fixedBook =
    /\b(?:deductiv\w*|pre[- ]?defined)\b|\b(?:no|avoid|without) label[- ]drift\w*\b|\b(?:only|just|stick to)\b[^.!?;]{0,45}\b(?:code\s?book|existing|approved|provided|supplied|current)\b|\b(?:existing|approved|supplied|codebook) (?:labels?|codes?) only\b/;
  if (noAdditions.test(text) || fixedBook.test(text)) return false;
  if (
    /\binductiv\w*\b|\b(?:new|additional|fresh) (?:labels?|codes?|themes?)\b/.test(
      text,
    )
  )
    return true;
  return (
    !established &&
    !/\b(?:code\s?book|approved|existing)\b/.test(text) &&
    /\b(?:suggest|develop|come up with|propose|generate)\b.{0,35}\b(?:labels?|codes?|themes?)\b/.test(
      text,
    )
  );
}

export function applyCodingBatch(d, pending, guide = codingGuide(d)) {
  const byId = new Map(d.passages.map((p) => [p.id, p]));
  const targetIds = new Set(pending.map((s) => s.id));
  // Protect the commit if a book has been replaced since this review opened.
  const activeGuide =
    guide.mode === "deductive" ? codingGuide(d, "deductive") : guide;
  const secondLook =
    guide.mode === "deductive" && guide.reviewPass === "missed";
  if (secondLook) activeGuide.reviewPass = "missed";
  const targets = secondLook
    ? secondLookPassages(d.passages, activeGuide.vocabulary).filter((p) =>
        targetIds.has(p.id),
      )
    : [...targetIds].map((id) => byId.get(id)).filter(Boolean);
  const valid = checkedCollectedSuggestions(pending, targets, activeGuide);
  const oldMeanings =
    guide.mode === "deductive" &&
    new Map(guide.vocabulary.map((e) => [key(e.label), e.definition]));
  if (
    !pending.length ||
    valid.length !== pending.length ||
    (oldMeanings &&
      valid.some((s) => oldMeanings.get(key(s.code)) !== s.definition))
  )
    throw Error(
      "These suggestions no longer match the current passages or codebook. Ask for fresh suggestions.",
    );
  for (const s of valid) {
    const passage = byId.get(s.id);
    passage.codes = [...passage.codes, s.code];
    passage.codingEvidence = [
      ...(passage.codingEvidence || []),
      { code: s.code, quote: s.quote },
    ];
    passage.reviewed = true;
    if (guide.mode === "inductive") {
      d.coding ||= {};
      d.coding.meanings ||= [];
      const meaning = d.coding.meanings.find((e) => e.label === s.code);
      if (!meaning)
        d.coding.meanings.push({ label: s.code, definition: s.definition });
      else if (!meaning.definition) meaning.definition = s.definition;
    }
  }
  return {
    assignments: valid.length,
    passages: targetIds.size,
    labels: [...new Set(valid.map((s) => s.code))],
  };
}
