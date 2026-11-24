import { includedInterview } from "./coding-passages.js";
// Counts are computed locally from the records selected in the workspace.
import { hasAnswer, choicesIn, optionLevels } from "./survey-answers.js";
import { allCodes } from "./coding.js";
import { passageUnits } from "./transcript-index.js";
import { filteredRows } from "./import.js";
import { isInterview } from "./interviews.js";
import { themeComparison } from "./theme-comparison.js";
import {
  numberBands,
  orderedGroups,
  surveyGroupReader,
} from "./survey-grouping.js";

export const selectionLimit = 6;
export function patternChoices(d) {
  if (d.kind === "text") return allCodes(d).map((code) => [code, code]);
  return d.fields
    .filter(
      (f) =>
        !f.roles?.includes("open") &&
        f.levels.length &&
        (["category", "ordered", "multiple"].includes(f.type) ||
          (f.type === "number" && f.levels.length <= 20)),
    )
    .map((f) => [f.id, f.label]);
}
export function patternModes(text, written = false) {
  return text
    ? [
        [
          "sources",
          written
            ? "How often does each theme appear in each written answer?"
            : "How often does each theme appear in each interview?",
        ],
        ["passages", "Which themes appear together in the same passage?"],
        [
          "interviews",
          written
            ? "Which themes does the same respondent mention?"
            : "Which themes appear together in the same interview?",
        ],
      ]
    : [
        ["together", "Which answers did the same people give together?"],
        ["separate", "How did people answer each question overall?"],
      ];
}
export function patternAnswers(row, f) {
  return choicesIn(row[f.id], f).sort();
}

export function groupChoices(d, items = []) {
  if (d.kind === "text")
    return [
      ...new Set(Object.values(d.metadata || {}).flatMap(Object.keys)),
    ].map((key) => [key, key]);
  return d.fields
    .filter(
      (f) =>
        !items.includes(f.id) &&
        !f.roles?.includes("open") &&
        ["category", "ordered", "number"].includes(f.type) &&
        f.levels.length &&
        (f.levels.length <= 30 || f.type === "number"),
    )
    .map((f) => [f.id, f.label]);
}
export function groupValue(d, key, record) {
  if (d.kind === "table") {
    const field = d.fields.find((f) => f.id === key);
    return field ? surveyGroupReader(field)(record) : "";
  }
  const values = d.metadata?.[record];
  return values && Object.hasOwn(values, key)
    ? String(values[key] ?? "").trim()
    : "";
}
export function patternSummary(d, v) {
  const sourceView =
    isInterview(d) && (v.patternMode || "sources") === "sources";
  // Use the project vocabulary even when a code's only quotation is excluded.
  // Inclusion controls which original passages can contribute to a result.
  const knownThemes = sourceView ? new Set(allCodes(d)) : null;
  d = includedInterview(d);
  if (d.kind === "text") d = { ...d, passages: passageUnits(d.passages) };
  if (sourceView) {
    if (v.groupBy && !groupChoices(d).some(([id]) => id === v.groupBy))
      throw Error("Choose a recorded interview detail to compare groups.");
    const labels = [...new Set(v.items || [])]
      .filter((id) => knownThemes.has(id))
      .slice(0, selectionLimit);
    return themeComparison(d, v, labels, groupValue);
  }
  if (v.groupBy) return groupedSummary(d, v);
  return summarise(d, v);
}
function summarise(d, v, rankLimit = 12, choices = new Map(patternChoices(d))) {
  const text = d.kind === "text";
  const items = [...new Set(v.items || [])]
    .filter((id) => choices.has(id))
    .slice(0, selectionLimit);
  const mode = v.patternMode || patternModes(text, !!d.openAnswers)[0][0];
  const a = {
    title:
      v.title ||
      patternModes(text, !!d.openAnswers).find(([id]) => id === mode)?.[1] ||
      "Selected patterns",
    unit: "",
    records: [],
    n: 0,
    points: [],
    excerpt: [],
    note: "",
    selectedLabels: items.map((id) => choices.get(id)),
  };
  if (!items.length) {
    a.note = text
      ? "Tick a theme to start your figure."
      : "Tick a question to start your figure.";
    return a;
  }
  const counts = new Map();
  function tally(parts) {
    const key = JSON.stringify(parts);
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { parts, n: 1 });
  }
  function ranked(den, rowParts) {
    const sorted = [...counts.values()].sort((a, b) => b.n - a.n);
    a.distinctPatterns = sorted.length;
    a.records = sorted.slice(0, rankLimit).map(({ parts, n }) => ({
      keyParts: parts,
      parts: rowParts(parts),
      label: rowParts(parts).join(" · "),
      group: "",
      n,
      den,
      value: n,
    }));
    if (sorted.length > rankLimit)
      a.note +=
        " Showing the 12 most frequent of " +
        sorted.length +
        " combinations. Ties at the cut-off appear in data order.";
  }
  if (text) {
    const sources = d.sources.filter(
      (s) =>
        !v.filter ||
        (v.filter === "source" ? s : d.metadata?.[s]?.[v.filter]) === v.value,
    );
    const bySource = new Map(
      sources.map((s) => [s, new Map(items.map((c) => [c, 0]))]),
    );
    const passages = d.passages.filter((p) => bySource.has(p.source));
    let reviewed = 0;
    for (const p of passages) {
      if (p.reviewed) reviewed++;
      const matches = items.filter((code) => p.codes.includes(code));
      for (const c of matches)
        bySource.get(p.source).set(c, bySource.get(p.source).get(c) + 1);
      if (mode === "passages") tally(matches);
    }
    a.n = mode === "passages" ? passages.length : sources.length;
    a.unit =
      mode === "interviews"
        ? d.openAnswers
          ? "Respondents"
          : "Interviews"
        : "Passages";
    a.note =
      sources.length +
      (d.openAnswers
        ? " respondents who wrote an answer · "
        : " listed interviews · ") +
      reviewed +
      " of " +
      passages.length +
      " original passages reviewed. A label on a saved quotation counts once in its original passage.";
    if (mode === "sources") {
      if (sources.length * items.length > 20000)
        throw Error(
          "Choose fewer themes or filter the interviews to draw a smaller figure.",
        );
      a.records = sources.flatMap((s) =>
        items.map((c) => ({
          group: s,
          label: c,
          n: bySource.get(s).get(c),
          value: bySource.get(s).get(c),
        })),
      );
    } else {
      if (mode === "interviews")
        for (const row of bySource.values())
          tally(items.filter((c) => row.get(c) > 0));
      ranked(a.n, (codes) =>
        codes.length ? codes : ["None of the selected themes"],
      );
      a.note +=
        mode === "interviews"
          ? d.openAnswers
            ? " Each respondent is counted once."
            : " Themes may occur in different passages of one interview."
          : " Each passage counts once.";
    }
    return a;
  }
  const rows = filteredRows(d, v);
  a.n = rows.length;
  const fields = items.map((id) => d.fields.find((f) => f.id === id));
  const units =
    d.unit === "response" ? "responses" : (d.unit || "data") + " records";
  if (mode === "separate") {
    a.unit = "% of answered records for each question";
    a.note =
      rows.length +
      " selected " +
      units +
      ". Each percentage uses that question’s answered records. A person can tick several options in a multiple-answer question.";
    for (const f of fields) {
      const tally = new Map();
      let den = 0;
      for (const row of rows) {
        const picks = patternAnswers(row, f);
        if (hasAnswer(row, f)) den++;
        for (const pick of picks) tally.set(pick, (tally.get(pick) || 0) + 1);
      }
      const labels = [
        ...new Set([
          ...(f.answerLabels || []).map(([, name]) => name),
          ...optionLevels(f),
          ...tally.keys(),
        ]),
      ];
      if (f.type === "number") labels.sort((a, b) => Number(a) - Number(b));
      for (const label of labels) {
        const n = tally.get(label) || 0;
        a.records.push({
          group: f.label,
          fieldId: f.id,
          label,
          n,
          den,
          value: den ? (100 * n) / den : 0,
          undefinedShare: !den,
        });
      }
      if (!labels.length || !den)
        a.note += " No answers for “" + f.label + "”.";
    }
  } else {
    a.unit = "Number of " + units;
    let den = 0;
    for (const row of rows) {
      const parts = fields.map((f) => patternAnswers(row, f));
      if (fields.some((f) => !hasAnswer(row, f))) continue;
      den++;
      tally(parts);
    }
    a.complete = den;
    a.note =
      den +
      " of " +
      rows.length +
      " selected " +
      units +
      " answered every chosen question. " +
      (rows.length - den) +
      " omitted for a missing answer. Each complete record counts once.";
    ranked(den, (parts) =>
      parts.map((p) => (p.length ? p.join(" + ") : "No options selected")),
    );
  }
  return a;
}

function groupedSummary(d, v) {
  const text = d.kind === "text",
    key = v.groupBy,
    mode = v.patternMode || patternModes(text, !!d.openAnswers)[0][0];
  const label = new Map(groupChoices(d, v.items)).get(key);
  if (!label)
    throw Error(
      "Choose an available group separate from the questions in the figure.",
    );
  const entries = text
    ? d.sources.filter(
        (s) =>
          !v.filter ||
          (v.filter === "source" ? s : d.metadata?.[s]?.[v.filter]) === v.value,
      )
    : filteredRows(d, v);
  const buckets = new Map(),
    included = [];
  const groupField = !text && d.fields.find((f) => f.id === key);
  const readGroup = text
    ? (s) => groupValue(d, key, s)
    : surveyGroupReader(groupField);
  for (const entry of entries) {
    const group = readGroup(entry);
    if (!group) continue;
    if (!buckets.has(group)) buckets.set(group, []);
    buckets.get(group).push(entry);
    included.push(entry);
  }
  const omitted = entries.length - included.length;
  const passageBuckets = new Map();
  const sourceSet = text ? new Set(included) : null;
  const allPassages = text
    ? d.passages.filter((p) => sourceSet.has(p.source))
    : [];
  for (const p of allPassages) {
    const group = groupValue(d, key, p.source);
    if (!passageBuckets.has(group)) passageBuckets.set(group, []);
    passageBuckets.get(group).push(p);
  }
  const subset = (entries, passages) =>
    text
      ? { ...d, sources: entries, passages }
      : { ...d, rows: entries, rules: [] };
  const view = { ...v, groupBy: "", filter: "" };
  const choices = new Map(patternChoices(d));
  const pooled = summarise(subset(included, allPassages), view, 12, choices);
  const themes = text && mode === "sources",
    byPassage = themes && v.themeUnit === "passages";
  const distribution = !text && mode === "separate";
  const percentBase =
    distribution && v.percentBase === "answer" ? "answer" : "group";
  if (
    distribution &&
    v.chart === "stack" &&
    percentBase === "group" &&
    d.fields.some((f) => v.items?.includes(f.id) && f.type === "multiple")
  ) {
    throw Error(
      "A 100% answer mix within groups needs one answer per person. Choose the heatmap or table, or switch to the group mix for each answer.",
    );
  }
  const question = themes
    ? byPassage
      ? "Which themes occur in each group’s passages?"
      : d.openAnswers
        ? "Which themes do respondents in each group mention?"
        : "Which themes occur in each group’s interviews?"
    : distribution
      ? "Survey answers"
      : pooled.title;
  const a = {
    ...pooled,
    title: v.title || question.replace(/\?$/, "") + " — by " + label,
    groupLabel: label,
    ...(distribution ? { surveyDistribution: true, percentBase } : {}),
    records: [],
    groupSizes: [],
  };
  if (!v.items?.length) return a;
  const rows = themes ? v.items.map((c) => ({ label: c })) : pooled.records;
  if (rows.length * buckets.size > 20000)
    throw Error(
      "This figure is too large. Choose fewer items or a grouping with fewer categories.",
    );
  const rowKey = (r) =>
    JSON.stringify(r.keyParts ?? [r.fieldId || "", r.label]);
  const sets = [];
  const groupOrder = text
    ? [...buckets.keys()]
    : orderedGroups(groupField, new Set(buckets.keys()));
  const groupPositions = distribution
    ? new Map(
        [...new Set([...orderedGroups(groupField), ...groupOrder])].map(
          (group, i) => [group, i],
        ),
      )
    : null;
  for (const group of groupOrder) {
    const entries = buckets.get(group);
    const ps = passageBuckets.get(group) || [];
    const data = subset(entries, ps),
      part = summarise(data, view, Infinity, choices);
    const den = themes
      ? byPassage
        ? ps.length
        : entries.length
      : (part.complete ?? part.n);
    const cells = new Map(),
      fieldDen = new Map();
    if (themes) {
      for (const r of part.records)
        cells.set(
          r.label,
          (cells.get(r.label) || 0) + (byPassage ? r.n : Number(r.n > 0)),
        );
    } else {
      for (const r of part.records) {
        cells.set(rowKey(r), r.n);
        if (r.fieldId) fieldDen.set(r.fieldId, r.den);
      }
    }
    a.groupSizes.push({
      group,
      selected: entries.length,
      ...(distribution ? { colourIndex: groupPositions.get(group) } : {}),
      ...(text
        ? { passages: ps.length, reviewed: ps.filter((p) => p.reviewed).length }
        : mode === "together"
          ? { complete: den }
          : {}),
    });
    sets.push({ group, cells, den, fieldDen });
  }
  a.unit = themes
    ? byPassage
      ? "% of passages within each group"
      : d.openAnswers
        ? "% of respondents who wrote an answer within each group"
        : "% of interviews within each group"
    : mode === "separate"
      ? percentBase === "answer"
        ? "% of people who chose this answer, by group"
        : "% answering each question within each group"
      : mode === "passages"
        ? "% of passages within each group"
        : mode === "interviews"
          ? d.openAnswers
            ? "% of respondents who wrote an answer within each group"
            : "% of interviews within each group"
          : "% answering all selected questions within each group";
  a.note =
    (themes
      ? a.unit +
        ". Each theme is counted once per " +
        (byPassage
          ? "passage."
          : d.openAnswers
            ? "respondent."
            : "interview.") +
        " "
      : "") +
    (distribution
      ? (percentBase === "answer"
          ? "When anyone chose an answer, its percentages add to 100% across groups."
          : "Each percentage uses the people in that group who answered that question.") +
        (v.items.some(
          (id) => d.fields.find((f) => f.id === id)?.type === "multiple",
        )
          ? " People could choose several options in a multiple-answer question."
          : "")
      : pooled.note) +
    (!text && numberBands(groupField)
      ? " Numerical groups use ranges based on the full data."
      : "") +
    " " +
    omitted +
    (text
      ? omitted === 1
        ? d.openAnswers
          ? " respondent"
          : " interview"
        : d.openAnswers
          ? " respondents"
          : " interviews"
      : omitted === 1
        ? " record"
        : " records") +
    " omitted for missing " +
    label +
    ".";
  for (const row of rows) {
    const series = row.fieldId ? row.group + " · " + row.label : row.label;
    const comparable = [];
    for (const { group, cells, den, fieldDen } of sets) {
      const n = cells.get(themes ? row.label : rowKey(row)) || 0;
      const base =
        percentBase === "answer"
          ? row.n
          : row.fieldId
            ? fieldDen.get(row.fieldId) || 0
            : den;
      const value = base ? (100 * n) / base : 0;
      const cell = {
        ...row,
        group: series,
        ...(distribution ? { question: row.group } : {}),
        groupValue: group,
        n,
        den: base,
        value,
        undefinedShare: !base,
      };
      a.records.push(cell);
      if (base) comparable.push({ group, n, den: base, percent: value });
    }
    if (percentBase !== "answer" && comparable.length >= 2) {
      comparable.sort((x, y) => x.percent - y.percent);
      const low = comparable[0],
        high = comparable.at(-1),
        gap = high.percent - low.percent;
      if (
        !a.largestDisplayedDifference ||
        gap > a.largestDisplayedDifference.percentagePoints
      )
        a.largestDisplayedDifference = {
          pattern: series,
          low,
          high,
          percentagePoints: gap,
        };
    }
  }
  return a;
}
