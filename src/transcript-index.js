// Older projects can contain quotations saved within earlier quotations.
// Leave an unanchored record visible on its own if its original text is missing.
export function transcriptIndex(passages) {
  const byId = new Map(passages.map((p) => [p.id, p]));
  const positions = new Map(),
    excerpts = new Map(),
    originals = [];
  for (const p of passages) {
    let original = p,
      start = 0;
    const seen = new Set();
    while (original.parent && !seen.has(original.id)) {
      seen.add(original.id);
      const parent = byId.get(original.parent);
      if (
        !parent ||
        parent.source !== original.source ||
        !Number.isInteger(original.start) ||
        original.start < 0 ||
        parent.text.slice(
          original.start,
          original.start + original.text.length,
        ) !== original.text
      )
        break;
      start += original.start;
      original = parent;
    }
    if (original === p) originals.push(p);
    else {
      if (!excerpts.has(original.id)) excerpts.set(original.id, []);
      excerpts.get(original.id).push({ p, start });
    }
    positions.set(p.id, { original, start });
  }
  const numbers = new Map();
  const counts = new Map();
  for (const p of originals) {
    const number = (counts.get(p.source) || 0) + 1;
    numbers.set(p.id, number);
    counts.set(p.source, number);
  }
  for (const [id, position] of positions)
    numbers.set(id, numbers.get(position.original.id));
  return { originals, positions, excerpts, numbers };
}

// Count one unit per original passage. A quotation can add a theme to it but
// does not certify that the whole passage has been reviewed. Retain the stored
// records and their offsets for editing and for opening the exact quotation.
export function passageUnits(passages) {
  if (!passages.some((p) => p.parent)) return passages;
  const { originals, excerpts } = transcriptIndex(passages);
  return originals.map((original) => {
    const quotations = excerpts.get(original.id);
    if (!quotations) return original;
    const codes = new Set(original.codes);
    for (const { p } of quotations) for (const code of p.codes) codes.add(code);
    return { ...original, codes: [...codes] };
  });
}
