// Limits apply to bot proposals. Students keep control of their own vocabulary.
export const codingLimits = {
  perPassage: 2,
  newPerBatch: 2,
  inductiveLabels: 8,
};
const key = (text) =>
  text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

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

export function checkedSuggestions(raw, passages, guide) {
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
  for (const entry of raw) {
    if (
      !entry ||
      typeof entry.code !== "string" ||
      typeof entry.quote !== "string" ||
      !entry.quote.trim() ||
      !sources.get(entry.id)?.includes(entry.quote)
    )
      continue;
    const label = entry.code.trim(),
      id = key(label),
      taken = used.get(entry.id);
    if (!label || taken.has(id) || taken.size >= codingLimits.perPassage)
      continue;
    let canonical = known.get(id) || newLabels.get(id);
    if (!canonical) {
      if (
        guide.mode === "deductive" ||
        newLabels.size >= codingLimits.newPerBatch ||
        known.size + newLabels.size >= codingLimits.inductiveLabels
      )
        continue;
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
      quote: entry.quote,
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
