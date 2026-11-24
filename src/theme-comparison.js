// The caller supplies included original passages with quotation codes folded in.
// A theme counts once per original passage, even when it has several quotations.
export function themeComparison(dataset, view, labels, groupValue) {
  const grouped = Boolean(view.groupBy);
  const sources = dataset.sources.filter(
    (s) =>
      !view.filter ||
      (view.filter === "source" ? s : dataset.metadata?.[s]?.[view.filter]) ===
        view.value,
  );
  const reverse =
    (grouped ? view.themeUnit : view.sourceMeasure) === "themeShare";
  if (view.chart === "stack" && !reverse)
    throw Error(
      "Choose who contributed the passages for each theme to draw a 100% contribution bar.",
    );
  const unit = reverse
    ? "themePassageShare"
    : grouped
      ? view.themeUnit === "passages"
        ? "passageShare"
        : "interviewShare"
      : view.sourceMeasure === "percent"
        ? "passageShare"
        : "count";
  const a = {
    title:
      view.title ||
      (grouped ? "Themes by " + view.groupBy : "Themes across interviews"),
    unit: reverse
      ? "% of passages carrying each theme"
      : unit === "count"
        ? "Original passages carrying the theme"
        : unit === "interviewShare"
          ? "% of listed interviews in each group"
          : "% of included original passages",
    selectedLabels: labels,
    n: 0,
    records: [],
    points: [],
    excerpt: [],
    groupSizes: [],
    ...(grouped ? { groupLabel: view.groupBy } : {}),
    themeComparison: {
      grouped,
      unit,
      written: false,
      sources: 0,
      omitted: 0,
      passages: 0,
      reviewed: 0,
    },
  };
  const meta = a.themeComparison;
  const buckets = new Map();
  const sourceBuckets = new Map();
  const observed = new Map();
  const withPassages = new Set();
  const colourOrder = new Map();
  for (const source of dataset.sources) {
    const group = grouped ? groupValue(dataset, view.groupBy, source) : source;
    if (group && !colourOrder.has(group))
      colourOrder.set(group, colourOrder.size);
  }
  for (const source of sources) {
    const group = grouped ? groupValue(dataset, view.groupBy, source) : source;
    if (!group && grouped) {
      meta.omitted++;
      continue;
    }
    if (!buckets.has(group)) {
      buckets.set(group, {
        group,
        selected: 0,
        passages: 0,
        reviewed: 0,
        passageCounts: new Map(),
        sourceCounts: new Map(),
      });
    }
    const bucket = buckets.get(group);
    bucket.selected++;
    sourceBuckets.set(source, bucket);
    observed.set(source, new Set());
  }
  if (labels.length * buckets.size > 20000)
    throw Error(
      "Choose fewer themes or filter the interviews to draw a smaller figure.",
    );
  const selected = new Set(labels);
  const pooled = new Map();
  for (const p of dataset.passages) {
    const bucket = sourceBuckets.get(p.source);
    if (!bucket) continue;
    withPassages.add(p.source);
    bucket.passages++;
    if (p.reviewed) bucket.reviewed++;
    for (const code of new Set(p.codes)) {
      if (!selected.has(code)) continue;
      bucket.passageCounts.set(code, (bucket.passageCounts.get(code) || 0) + 1);
      pooled.set(code, (pooled.get(code) || 0) + 1);
      const seen = observed.get(p.source);
      if (!seen.has(code)) {
        bucket.sourceCounts.set(code, (bucket.sourceCounts.get(code) || 0) + 1);
        seen.add(code);
      }
    }
  }
  const contrasts = new Map();
  for (const {
    group,
    selected,
    passages,
    reviewed,
    sourceCounts,
    passageCounts,
  } of buckets.values()) {
    a.groupSizes.push({
      group,
      selected,
      passages,
      reviewed,
      colourIndex: colourOrder.get(group),
    });
    meta.passages += passages;
    meta.reviewed += reviewed;
    meta.sources += selected;
    for (const label of labels) {
      const den = reverse
        ? pooled.get(label) || 0
        : unit === "interviewShare"
          ? selected
          : passages;
      const n =
        (unit === "interviewShare" ? sourceCounts : passageCounts).get(label) ||
        0;
      const value = unit === "count" ? n : den ? (100 * n) / den : 0;
      a.records.push({
        label,
        group: grouped ? label : group,
        groupValue: group,
        n,
        den,
        value,
        undefinedShare: !den,
      });
      if (!den || !passages || !grouped || reverse) continue;
      const entry = { group, n, den, percent: value };
      if (!contrasts.has(label))
        contrasts.set(label, { low: entry, high: entry, groups: 0 });
      const contrast = contrasts.get(label);
      contrast.groups++;
      if (value < contrast.low.percent) contrast.low = entry;
      if (value >= contrast.high.percent) contrast.high = entry;
    }
  }
  for (const [pattern, { low, high, groups }] of contrasts) {
    if (groups < 2) continue;
    const percentagePoints = high.percent - low.percent;
    if (
      !a.largestDisplayedDifference ||
      percentagePoints > a.largestDisplayedDifference.percentagePoints
    )
      a.largestDisplayedDifference = { pattern, low, high, percentagePoints };
  }
  a.n = meta.sources;
  meta.sourcesWithoutPassages = meta.sources - withPassages.size;
  const counted =
    unit === "interviewShare"
      ? "An interview with one or more coded passages counts once per theme."
      : "Each original passage counts once per theme, including codes on its saved quotations.";
  a.note =
    (labels.length ? counted : "Tick a theme to start your figure.") +
    " " +
    meta.sources +
    " listed interviews · " +
    meta.reviewed +
    " of " +
    meta.passages +
    " included original passages reviewed.";
  if (grouped)
    a.note +=
      " " +
      meta.omitted +
      (meta.omitted === 1 ? " interview" : " interviews") +
      " omitted for missing " +
      view.groupBy +
      ".";
  if (reverse)
    a.note +=
      " Percentages for each theme add up to 100% across the interviews or groups shown when there are matching passages.";
  if (unit === "passageShare" || reverse)
    a.note +=
      " If you imported only coded highlights, the percentages refer to those highlights.";
  if (meta.sourcesWithoutPassages)
    a.note +=
      " " +
      meta.sourcesWithoutPassages +
      (meta.sourcesWithoutPassages === 1
        ? " listed interview has"
        : " listed interviews have") +
      " no included passages." +
      (unit === "interviewShare"
        ? " These interviews count in the group totals."
        : "");
  return a;
}
