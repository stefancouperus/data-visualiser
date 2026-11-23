// Limits apply to bot proposals. Students keep control of their own vocabulary.
export const codingLimits = {
  perPassage: 2,
  newPerBatch: 2,
  inductiveLabels: 8,
};
export const discoveryLimit = 6;
const key = (text) =>
  text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

export function allCodes(d) {
  const approved = d.interviews?.established
    ? (d.coding?.book || []).map((e) => e.label)
    : [];
  return [...new Set([...approved, ...d.passages.flatMap((p) => p.codes)])];
}

export function codingGuide(d) {
  const mode = d.coding?.mode || "inductive";
  const labels = [...new Set(d.passages.flatMap((p) => p.codes))];
  const vocabulary =
    mode === "deductive"
      ? d.coding?.book || []
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
    limits: codingLimits,
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
  const newLabels = new Map();
  const used = new Map(passages.map((p) => [p.id, new Set(p.codes.map(key))]));
  const sources = new Map(passages.map((p) => [p.id, p.text]));
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
    const id = key(label),
      taken = used.get(entry.id);
    if (taken.has(id)) {
      skip("duplicate");
      continue;
    }
    if (taken.size >= codingLimits.perPassage) {
      skip("capacity");
      continue;
    }
    let canonical = known.get(id) || newLabels.get(id);
    if (!canonical) {
      if (guide.mode === "deductive") {
        skip("label");
        continue;
      }
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
  const seen = new Set();
  if (!rows.length)
    throw Error("Include at least one label before using this codebook.");
  return rows.map((row) => {
    const label = row.label.trim(),
      definition = row.definition.trim();
    if (!label) throw Error("Give each entry a label or remove its row.");
    if (seen.has(key(label)))
      throw Error(
        "Each label must appear once. Combine or rename the duplicate “" +
          label +
          "”.",
      );
    seen.add(key(label));
    return { label, definition };
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
    /\b(?:come up with|suggest|propose|generate|recommend|identify|assign|apply|adopt|create|give me|develop|find)\b.{0,65}\b(?:labels?|codes?|themes?)\b/i.test(
      message,
    ) ||
    /\b(?:code|label|tag) (?:these|those|the|my|this|selected|both|every|each|all|one|two|three|\d+|interviews?|transcripts?|passages?)\b/i.test(
      message,
    ) ||
    /\b(?:inductiv\w*|deductiv\w*|thematic) cod(?:e|ing)\b/i.test(message)
  );
}

export function applyCodingBatch(d, pending, guide = codingGuide(d)) {
  const byId = new Map(d.passages.map((p) => [p.id, p]));
  const targetIds = [...new Set(pending.map((s) => s.id))];
  const targets = targetIds.map((id) => byId.get(id)).filter(Boolean);
  const valid = checkedCollectedSuggestions(pending, targets, guide);
  if (!pending.length || valid.length !== pending.length)
    throw Error(
      "These suggestions no longer match the current passages or codebook. Ask for fresh suggestions.",
    );
  for (const s of valid) {
    const passage = byId.get(s.id);
    passage.codes.push(s.code);
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
    passages: targetIds.length,
    labels: [...new Set(valid.map((s) => s.code))],
  };
}
