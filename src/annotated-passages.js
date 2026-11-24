import { texts, uid } from "./import.js";

// Inline tags disappear from the displayed paragraph. Keep the original offsets
// so native Word comments still attach to the same words in a mixed document.
function inlineTags(raw, open, close) {
  if (!open || !close) return { text: raw, codes: [], offset: (pos) => pos };
  const removed = [];
  const codes = [];
  let text = "",
    from = 0;
  let start = raw.indexOf(open);
  while (start >= 0) {
    const closing = raw.indexOf(close, start + open.length);
    if (closing < 0) break;
    const end = closing + close.length;
    const code = raw.slice(start + open.length, closing).trim();
    if (code) codes.push(code);
    removed.push({ start, end });
    text += raw.slice(from, start);
    from = end;
    start = raw.indexOf(open, end);
  }
  text += raw.slice(from);
  const leading = text.length - text.trimStart().length;
  const offset = (pos) =>
    pos -
    leading -
    removed.reduce(
      (n, r) => n + Math.max(0, Math.min(pos, r.end) - r.start),
      0,
    );
  return { text: text.trim(), codes: [...new Set(codes)], offset };
}

export function annotatedPassages(doc, mapped) {
  const marks = doc.marked
    .map((mark) => ({
      ...mark,
      codes: [...new Set(mark.markers.flatMap((m) => mapped.marks[m] || []))],
    }))
    .filter((mark) => mark.codes.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const passages = [];
  let first = 0;
  for (const [i, raw] of doc.paragraphs.entries()) {
    const { text, codes, offset } = inlineTags(raw, mapped.open, mapped.close);
    if (!text) continue;
    const [original] = texts(doc.name, [text], doc.codedWordExport);
    const scope = doc.paragraphScope?.[i];
    if (scope !== undefined) original.codingIncluded = scope;
    original.codes = codes;
    passages.push(original);
    const start = doc.paragraphStarts?.[i] ?? 0;
    const end = start + raw.length;
    // A spanning comment contributes its intersection with each original.
    while (first < marks.length && marks[first].end <= start) first++;
    const excerpts = new Map();
    for (let j = first; j < marks.length && marks[j].start < end; j++) {
      const mark = marks[j];
      const a = Math.max(0, offset(Math.max(start, mark.start) - start));
      const b = Math.min(text.length, offset(Math.min(end, mark.end) - start));
      if (a >= b) continue;
      const words = text.slice(a, b);
      if (!words.trim()) continue;
      if (a === 0 && b === text.length) {
        original.codes.push(...mark.codes);
        if (mark.evidenceQuote !== undefined) {
          original.codingEvidence ||= [];
          for (const code of mark.codes)
            original.codingEvidence.push({ code, quote: mark.evidenceQuote });
        }
      } else {
        const key = a + ":" + b;
        let quote = excerpts.get(key);
        if (!quote) {
          quote = {
            id: uid(),
            source: doc.name,
            text: words,
            parent: original.id,
            start: a,
            codes: [],
            reviewed: true,
          };
          excerpts.set(key, quote);
        }
        quote.codes = [...new Set([...quote.codes, ...mark.codes])];
      }
    }
    original.codes = [...new Set(original.codes)];
    original.reviewed = original.codes.length > 0;
    passages.push(...excerpts.values());
  }
  return passages;
}
