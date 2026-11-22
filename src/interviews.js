import { uid } from "./import.js";
import { codingGuide, checkedSuggestions } from "./coding.js";

export const isInterview = (d) =>
  d?.kind === "text" && !d.openAnswers && d.textPurpose !== "documents";
const normal = (s) => s.trim().normalize("NFKC").toLowerCase();
export function sharedBook(d) {
  const entries = new Map();
  for (const e of [
    ...(d.coding?.book || []),
    ...(d.coding?.meanings || []),
    ...new Set(d.passages.flatMap((p) => p.codes)),
  ]) {
    const entry = typeof e === "string" ? { label: e, definition: "" } : e;
    if (!entries.has(normal(entry.label)))
      entries.set(normal(entry.label), entry);
  }
  return [...entries.values()];
}
// Keep uninterrupted speech manageable while preserving offsets on previously annotated text.
function prepareReadingPassages(d) {
  const parents = new Set(d.passages.map((p) => p.parent));
  d.passages = d.passages.flatMap((p) => {
    if (
      p.text.length <= 1800 ||
      p.reviewed ||
      p.codes.length ||
      p.parent ||
      parents.has(p.id)
    )
      return [p];
    const parts = [];
    let at = 0;
    while (at < p.text.length) {
      let end = Math.min(p.text.length, at + 1500);
      if (end < p.text.length) {
        const tail = p.text.slice(at + 600, end);
        const cuts = [...tail.matchAll(/[.!?]\s+|\n+/g)];
        const last = cuts.at(-1);
        if (last) end = at + 600 + last.index + last[0].length;
        else {
          const space = p.text.lastIndexOf(" ", end - 1);
          if (space >= at + 600) end = space + 1;
        }
      }
      parts.push({
        ...p,
        id: at ? uid() : p.id,
        text: p.text.slice(at, end),
        ...(Number.isFinite(p.start)
          ? { start: p.start + at, end: p.start + end }
          : {}),
      });
      at = end;
    }
    return parts;
  });
}
export function interviews(d) {
  if (!d.interviews) prepareReadingPassages(d);
  d.interviews ||= {
    source: d.sources[0],
    done: [],
    method: d.coding?.book?.length
      ? "book"
      : d.passages.some((p) => p.codes.length)
        ? "imported"
        : "",
    established: !!d.coding?.book?.length,
  };
  if (!d.sources.includes(d.interviews.source))
    d.interviews.source = d.sources[0];
  return d.interviews;
}
function useCanonicalLabels(d, book) {
  const labels = new Map(book.map((e) => [normal(e.label), e.label]));
  for (const p of d.passages) {
    p.codes = [
      ...new Set(p.codes.map((code) => labels.get(normal(code)) || code)),
    ];
    for (const e of p.codingEvidence || [])
      e.code = labels.get(normal(e.code)) || e.code;
  }
}
export function establish(d) {
  const book = sharedBook(d);
  if (!book.length) throw Error("Create or approve at least one label first.");
  d.coding = {
    ...d.coding,
    mode: "deductive",
    book,
    bookName: d.coding?.bookName || "Shared interview codebook",
  };
  useCanonicalLabels(d, book);
  interviews(d).established = true;
}
export function appendInterviews(d, sets) {
  const names = new Set(d.sources);
  for (const set of sets)
    for (const source of set.sources) {
      if (names.has(source))
        throw Error(
          "An interview already uses the name “" +
            source +
            "”. Give each interview a distinct name before adding it.",
        );
      names.add(source);
    }
  for (const set of sets) {
    prepareReadingPassages(set);
    d.sources.push(...set.sources);
    d.passages.push(...set.passages);
    d.metadata = { ...d.metadata, ...set.metadata };
    if (set.excerptSources)
      d.excerptSources = [...(d.excerptSources || []), ...set.excerptSources];
    if (set.originals) d.originals = { ...d.originals, ...set.originals };
  }
  const state = interviews(d);
  if (state.established && sharedBook(d).length !== d.coding.book.length) {
    state.done = [];
    state.established = false;
    state.method = "imported";
  }
  if (state.established) useCanonicalLabels(d, d.coding.book);
  state.source = sets[0].sources[0];
  interviews(d).finished = false;
}
// Work units keep each request small even for transcripts exported as a single paragraph.
export function interviewBatches(d, source, sampleIds, originalOnly = false) {
  const batches = [];
  let batch = [],
    size = 0;
  for (const p of d.passages.filter(
    (p) =>
      p.source === source &&
      (!originalOnly || !p.parent) &&
      (!sampleIds || sampleIds.includes(p.id)),
  )) {
    let start = 0;
    while (start < p.text.length) {
      let end = Math.min(start + 3200, p.text.length);
      if (end < p.text.length) {
        const boundary = p.text.lastIndexOf(" ", end);
        if (boundary > start + 1600) end = boundary + 1;
      }
      const text = p.text.slice(start, end);
      if (batch.length >= 6 || size + text.length > 9500) {
        batches.push(batch);
        batch = [];
        size = 0;
      }
      batch.push({
        id: "p" + (batch.length + 1),
        passageId: p.id,
        source,
        text,
        codes: p.codes,
      });
      size += text.length;
      start = end;
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}
export function reviewedMatches(raw, batch, guide) {
  return checkedSuggestions(raw, batch, guide).map((s) => ({
    ...s,
    id: batch.find((p) => p.id === s.id).passageId,
  }));
}
// A manually saved quotation still belongs to the original transcript passage.
export function coveredByQuotation(match, parent, excerpts) {
  if (!parent || !excerpts?.length) return false;
  let start = parent.text.indexOf(match.quote);
  if (start < 0) return false;
  while (start >= 0) {
    if (
      !excerpts.some(
        (p) =>
          p.codes.some((code) => normal(code) === normal(match.code)) &&
          start >= p.start &&
          start + match.quote.length <= p.start + p.text.length,
      )
    )
      return false;
    start = parent.text.indexOf(match.quote, start + 1);
  }
  return true;
}
export function draftGuide(d, sample) {
  if (!sample) return codingGuide(d);
  return {
    ...codingGuide({ ...d, coding: { ...d.coding, mode: "inductive" } }),
    vocabulary: sharedBook(d),
  };
}
export function finishInterview(d) {
  const state = interviews(d);
  if (state.draft) throw Error("Review or discard the bot draft first.");
  if (!state.established) establish(d);
  if (!state.done.includes(state.source)) state.done.push(state.source);
  for (const p of d.passages) if (p.source === state.source) p.reviewed = true;
}
