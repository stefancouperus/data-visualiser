// Counts are computed locally from the records selected in the workspace.
import { filteredRows } from "./import.js";

export const selectionLimit = 6;
export function patternChoices(d) {
  if (d.kind === "text")
    return [...new Set(d.passages.flatMap((p) => p.codes))].map((code) => [
      code,
      code,
    ]);
  return d.fields
    .filter(
      (f) =>
        f.levels.length &&
        (["category", "ordered", "multiple"].includes(f.type) ||
          (f.type === "number" && f.levels.length <= 20)),
    )
    .map((f) => [f.id, f.label]);
}
export function patternModes(text) {
  return text
    ? [
        ["sources", "How often does each theme appear in each interview?"],
        ["passages", "Which themes appear together in the same passage?"],
        ["interviews", "Which themes appear together in the same interview?"],
      ]
    : [
        ["together", "Which answers did the same people give together?"],
        ["separate", "How did people answer each question overall?"],
      ];
}
export function patternAnswers(row, f) {
  const raw = row[f.id];
  if (raw == null || raw === "") return [];
  if (f.type !== "multiple") return [String(raw)];
  return [
    ...new Set(
      String(raw)
        .split(f.separator || ";")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort();
}

export function patternSummary(d, v) {
  const text = d.kind === "text",
    choices = new Map(patternChoices(d));
  const items = [...new Set(v.items || [])]
    .filter((id) => choices.has(id))
    .slice(0, selectionLimit);
  const mode = v.patternMode || patternModes(text)[0][0];
  const a = {
    title:
      v.title ||
      patternModes(text).find(([id]) => id === mode)?.[1] ||
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
    a.records = sorted.slice(0, 12).map(({ parts, n }) => ({
      keyParts: parts,
      parts: rowParts(parts),
      label: rowParts(parts).join(" · "),
      group: "",
      n,
      den,
      value: n,
    }));
    if (sorted.length > 12)
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
    a.unit = mode === "interviews" ? "Interviews" : "Passages";
    a.note =
      sources.length +
      " listed interviews · " +
      reviewed +
      " of " +
      passages.length +
      " imported passages reviewed. Counts refer to applied codes.";
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
          ? " Themes may occur in different passages of one interview."
          : " Each passage counts once.";
    }
    return a;
  }
  const rows = filteredRows(d).filter(
    (r) => !v.filter || r[v.filter] === v.value,
  );
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
        if (picks.length) den++;
        for (const pick of picks) tally.set(pick, (tally.get(pick) || 0) + 1);
      }
      const labels = f.type === "multiple" ? [...tally.keys()] : f.levels;
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
      if (parts.some((p) => !p.length)) continue;
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
    ranked(den, (parts) => parts.map((p) => p.join(" + ")));
  }
  return a;
}
