import { includedInterview } from "./coding-passages.js";
import { transcriptIndex } from "./transcript-index.js";
import { allCodes } from "./coding.js";

// Keep words in their original language, including accents. Only the explicitly
// listed function words are removed. Differences in tense or number stay visible.
const commonEnglish = new Set(
  `a about after again all also am an and any are as at be because been before
  being between both but by can can't could did didn't do does doesn't doing
  don't during each either else for from had has have he her here hers herself him
  himself his how i i'd i'll i'm i've if in into is isn't it it's its itself just
  like may me might more most much my myself of on once one only or other our
  ours ourselves out over own really said say she should so some than that that's
  the their theirs them themselves then there there's these they they're this
  those through to too under until up us very was we we're well were what when
  where whether which while who whom whose why will with would yeah yes you
  you're your yours yourself yourselves`.split(/\s+/),
);
const commonDutch = new Set(
  `aan af al als bij ben bent binnen dat de deden deze die dit doe doet door dus
  echt een eens en er even gedaan ge had hadden haar haarzelf heb hebben heeft
  hem het hier hij hoe hun ik in is ja je jij jou jouw jullie kan kon konden
  maar daarmee me meer men met mij mijn moet na naar nog nu of om omdat ons onze
  ook op over toen tot tussen uit uw van vanuit veel voor waar waarom wat we wel
  welke werd werden wij wil willen wordt worden wou zal ze zich zij zijn zo zou
  zouden`.split(/\s+/),
);
const common = {
  both: new Set([...commonEnglish, ...commonDutch]),
  en: commonEnglish,
  nl: commonDutch,
  none: new Set(),
};
const stopNotes = {
  both: "Common Dutch and English words are omitted.",
  en: "Common English words are omitted.",
  nl: "Common Dutch words are omitted.",
  none: "Common words are included.",
};
const limit = 35;
const normal = (word) =>
  word.normalize("NFC").toLowerCase().replaceAll("’", "'");
const collator = new Intl.Collator("en", { sensitivity: "variant" });
const token = /\p{L}[\p{L}\p{M}]*(?:['’][\p{L}\p{M}]+)*/gu;
const speakerLabel =
  /^(?:\[[\d:. -]+\]\s*)?(?:interviewer|interviewee|geïnterviewde|respondent|participant|deelnemer|onderzoeker|researcher|moderator|speaker|spreker|question|vraag|answer|antwoord|[qa])(?:\s*\d+)?\s*:\s*/gimu;

function selectedRanges(index, passage, theme) {
  if (!theme) return { ranges: [[0, passage.text.length]], unresolved: 0 };
  const ranges = [];
  let unresolved = 0;
  const pieces = [
    { p: passage, start: 0 },
    ...(index.excerpts.get(passage.id) || []),
  ];
  for (const { p, start } of pieces) {
    if (!p.codes.includes(theme)) continue;
    // Where the student accepted a specific quotation, count just those words.
    // A whole-passage label, including legacy coding, has no narrower location.
    const evidence = p.codingEvidence?.filter((e) => e.code === theme) || [];
    const located = evidence.map(({ quote }) => {
      if (!quote) return null;
      const offset = p.text.indexOf(quote);
      return offset !== -1 && offset === p.text.lastIndexOf(quote)
        ? [start + offset, start + offset + quote.length]
        : null;
    });
    if (!located.length) ranges.push([start, start + p.text.length]);
    for (const range of located) {
      if (range) ranges.push(range);
      else unresolved++;
    }
  }
  const merged = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range);
  }
  return { ranges: merged, unresolved };
}

function scan(d, v, findWord) {
  d = includedInterview(d);
  if (v.x && !allCodes(d).includes(v.x))
    throw Error(
      "The theme “" +
        v.x +
        "” is unavailable. Choose another theme or All passages to update this table.",
    );
  const language = Object.hasOwn(common, v.wordLanguage)
    ? v.wordLanguage
    : "both";
  const sources = new Set(
    d.sources.filter(
      (s) =>
        !v.filter ||
        (v.filter === "source" ? s : d.metadata?.[s]?.[v.filter]) === v.value,
    ),
  );
  const index = transcriptIndex(
    d.passages.filter((p) => sources.has(p.source)),
  );
  const totals = new Map(),
    evidence = [];
  const documentPositions = new Map();
  let wordCount = 0,
    passageCount = 0,
    unresolved = 0;
  const sourceCount = new Set();
  for (const p of index.originals) {
    const located = selectedRanges(index, p, v.x);
    const ranges = located.ranges;
    unresolved += located.unresolved;
    if (!ranges.length) continue;
    sourceCount.add(p.source);
    passageCount++;
    // Preserve offsets when ignoring role labels in dialogue. A question and an
    // answer both remain part of the selected text.
    const text =
      !d.openAnswers && d.textPurpose !== "documents"
        ? p.text.replace(speakerLabel, (label) => " ".repeat(label.length))
        : p.text;
    // Word comments and highlights can overlap even before coding in the app.
    // Their original offsets distinguish repetitions from the same token
    // appearing in two imported excerpts. Unanchored passages stay distinct.
    let positions;
    if (
      p.markers?.length &&
      Number.isInteger(p.start) &&
      p.end === p.start + p.text.length
    ) {
      if (!documentPositions.has(p.source))
        documentPositions.set(p.source, new Set());
      positions = documentPositions.get(p.source);
    }
    let i = 0;
    const counts = new Map();
    for (const match of text.matchAll(token)) {
      const end = match.index + match[0].length;
      while (i < ranges.length && ranges[i][1] <= match.index) i++;
      if (i === ranges.length) break;
      if (match.index < ranges[i][0] || end > ranges[i][1]) continue;
      const term = normal(match[0]);
      if (common[language].has(term)) continue;
      if (positions) {
        const key = p.start + match.index + "|" + term;
        if (positions.has(key)) continue;
        positions.add(key);
      }
      wordCount++;
      counts.set(term, (counts.get(term) || 0) + 1);
    }
    if (findWord !== undefined) {
      if (counts.has(findWord))
        evidence.push({
          id: p.id,
          source: p.source,
          codes: v.x ? [v.x] : p.codes,
          text: ranges.map(([a, b]) => p.text.slice(a, b)).join(" … "),
        });
      continue;
    }
    for (const [label, n] of counts) {
      const entry = totals.get(label) || {
        label,
        n: 0,
        passageCount: 0,
        sources: new Set(),
      };
      entry.n += n;
      entry.passageCount++;
      entry.sources.add(p.source);
      totals.set(label, entry);
    }
  }
  return {
    totals,
    evidence,
    wordCount,
    passageCount,
    sourceCount: sourceCount.size,
    language,
    unresolved,
  };
}

export function wordPassages(d, v, word) {
  return scan(d, v, normal(word)).evidence;
}

export function wordCounts(d, v) {
  const { totals, wordCount, passageCount, sourceCount, language, unresolved } =
    scan(d, v);
  const records = [...totals.values()]
    .sort((a, b) => b.n - a.n || collator.compare(a.label, b.label))
    .slice(0, limit)
    .map(({ label, n, passageCount, sources }) => ({
      label,
      group: "",
      value: n,
      n,
      passageCount,
      sourceCount: sources.size,
    }));
  const sourceName = d.openAnswers ? "respondent" : "source";
  return {
    title:
      v.title ||
      (v.x
        ? "Words in passages coded “" + v.x + "”"
        : d.openAnswers
          ? "Words in written answers"
          : "Words in selected passages"),
    unit: "Word occurrences",
    n: sourceCount,
    records,
    excerpt: [],
    points: [],
    distinctWords: totals.size,
    wordCount,
    passageCount,
    sourceCount,
    sourcesLabel: d.openAnswers ? "Respondents" : "Sources",
    note:
      `Showing ${records.length} of ${totals.size} distinct words from ${passageCount} passage${passageCount === 1 ? "" : "s"} in ${sourceCount} ${sourceName}${sourceCount === 1 ? "" : "s"}. ${stopNotes[language]}` +
      (unresolved
        ? " " +
          unresolved +
          (unresolved === 1
            ? " supporting quotation was"
            : " supporting quotations were") +
          " omitted because the exact location was unclear."
        : "") +
      (!d.openAnswers && d.textPurpose !== "documents"
        ? d.interviews
          ? " Uses passages included for coding."
          : " Interviewer questions are included where present."
        : ""),
  };
}
