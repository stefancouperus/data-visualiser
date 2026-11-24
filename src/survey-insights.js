const percent = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const smallBase = 5;

// Only pool mutually exclusive choices. An intensity word must modify another
// actual answer label on this question. For example, "not likely" and "likely"
// never form a pair. The same raw cell counts work in either percentage view.
function sharedResponse(byQuestion, singleAnswerItems) {
  let strongest;
  for (const id of singleAnswerItems || []) {
    const answers = byQuestion.get(id);
    if (!answers) continue;
    const byLabel = new Map();
    const groupTotals = new Map();
    for (const [label, rows] of answers) {
      const name = String(label).trim().toLowerCase();
      byLabel.set(name, byLabel.has(name) ? null : rows);
      for (const row of rows) {
        if (row.n)
          groupTotals.set(
            row.groupValue,
            (groupTotals.get(row.groupValue) || 0) + row.n,
          );
      }
    }
    if (groupTotals.size < 2) continue;
    const den = [...groupTotals.values()].reduce((sum, n) => sum + n, 0);
    for (const [name, stronger] of byLabel) {
      if (!stronger) continue;
      const baseName = name.match(
        /^(?:strongly|very|zeer|sterk|helemaal|sehr|très)\s+(.+)$/u,
      )?.[1];
      const base = byLabel.get(baseName);
      if (!base?.some((r) => r.n) || !stronger.some((r) => r.n)) continue;
      const counts = new Map();
      for (const row of [...base, ...stronger]) {
        counts.set(row.groupValue, (counts.get(row.groupValue) || 0) + row.n);
      }
      if (
        ![...groupTotals].every(
          ([group, total]) => (counts.get(group) || 0) > total / 2,
        )
      )
        continue;
      const n = [...counts.values()].reduce((sum, count) => sum + count, 0);
      if (
        !strongest ||
        n / den > strongest.n / strongest.den ||
        (n / den === strongest.n / strongest.den && den > strongest.den)
      ) {
        strongest = {
          n,
          den,
          question: base[0].question,
          base: base[0].label,
          stronger: stronger[0].label,
        };
      }
    }
  }
  if (strongest) {
    const { n, den, question, base, stronger } = strongest;
    return `On “${question}”, ${n} of ${den} valid responses across the displayed groups were “${base}” or “${stronger}”. Together those answers made up a majority in each group with responses.`;
  }
}

export function canSpotSurveyPatterns(dataset, view) {
  return !!(
    dataset?.kind === "table" &&
    view?.task === "patterns" &&
    view.patternMode === "separate" &&
    view.groupBy &&
    view.items?.length
  );
}

export function asksForSurveyPatterns(text) {
  const request = text
    .trim()
    .replace(/^(?:(?:could|can|would) you\s+)?(?:please\s+)?/iu, "")
    .replace(/[?!.]+$/u, "")
    .replace(
      /\s+(?:here|in (?:this|my|the|these|our)|between (?:these|the selected)|across (?:these|my|the selected))\b.*$/iu,
      "",
    );
  return (
    /^(?:what|anything) (?:else )?stands? out$/iu.test(request) ||
    /^(?:spot|identify|suggest|look for|find|highlight) (?:some |any |the |interesting |notable |main |clearest )*(?:patterns?|observations?|differences?)$/iu.test(
      request,
    ) ||
    /^(?:are there |do you (?:notice|see) )?(?:any |interesting |notable )+(?:patterns?|differences?)$/iu.test(
      request,
    )
  );
}

// Read the complete, filtered figure, including rows beyond the bot preview.
// Each answer is compared only with that same answer to that same question.
export function surveyInsights(summary) {
  if (!summary?.surveyDistribution) return;
  const answerBase = summary.percentBase === "answer";
  const byQuestion = new Map();
  for (const row of summary.records) {
    if (row.undefinedShare || !(row.den > 0)) continue;
    if (!byQuestion.has(row.fieldId)) byQuestion.set(row.fieldId, new Map());
    const answers = byQuestion.get(row.fieldId);
    if (!answers.has(row.label)) answers.set(row.label, []);
    answers.get(row.label).push(row);
  }
  const findings = [];
  let comparable = false;
  let hasLargerComparison = false;
  const rank = (a, b) => Number(a.small) - Number(b.small) || b.gap - a.gap;
  for (const answers of byQuestion.values()) {
    const contrasts = [];
    for (const rows of answers.values()) {
      if (rows.length < 2) continue;
      comparable = true;
      const ordered = [...rows].sort((a, b) => a.n / a.den - b.n / b.den);
      const substantial = ordered.filter((row) => row.den >= smallBase);
      if (substantial.length >= 2) hasLargerComparison = true;
      // Prefer a contrast backed by at least five answers on each side.
      // If only the smaller bases differ, keep the contrast and flag it.
      const hasContrast =
        substantial.length >= 2 &&
        substantial[0].n / substantial[0].den !==
          substantial.at(-1).n / substantial.at(-1).den;
      const pool = hasContrast ? substantial : ordered;
      const low = pool[0],
        high = pool.at(-1);
      const gap = 100 * (high.n / high.den - low.n / low.den);
      if (gap > 0) {
        contrasts.push({
          low,
          high,
          gap,
          small: Math.min(low.den, high.den) < smallBase,
        });
      }
    }
    if (contrasts.length) findings.push(contrasts.sort(rank)[0]);
  }
  const selected = findings.sort(rank).slice(0, 2);
  const rate = (r) => percent.format((100 * r.n) / r.den) + "%";
  const facts = selected.map(({ low, high, gap, small }) => {
    const choice = "“" + high.label + "” for “" + high.question + "”";
    let sentence = answerBase
      ? `Of the ${high.den} who chose ${choice} and had a recorded group, ${high.n} were in “${high.groupValue}” (${rate(high)}) and ${low.n} in “${low.groupValue}” (${rate(low)}).`
      : `For “${high.question}”, ${high.n} of ${high.den} in “${high.groupValue}” chose “${high.label}” (${rate(high)}), compared with ${low.n} of ${low.den} in “${low.groupValue}” (${rate(low)}). The difference in this sample was ${gap < 0.1 ? "less than 0.1" : percent.format(gap)} percentage points.`;
    if (small)
      sentence += answerBase
        ? " Fewer than five people with a recorded group chose this answer."
        : " At least one percentage is based on fewer than five answers.";
    return sentence;
  });
  if (!facts.length)
    facts.push(
      comparable
        ? answerBase
          ? "For each answer that could be compared, its respondents were equally distributed across the displayed groups."
          : "For the answers that could be compared, the observed percentages were identical across groups."
        : "There are too few groups with usable answers to compare in this selection.",
    );
  const small = selected.length
    ? selected.every((row) => row.small)
    : comparable && !hasLargerComparison;
  if (!selected.length && small)
    facts[0] +=
      " Each comparison includes a percentage based on fewer than five answers.";
  const shared = sharedResponse(byQuestion, summary.singleAnswerItems);
  if (shared) facts.unshift(shared);
  return {
    facts,
    comparable,
    small,
    answerBase,
  };
}

export function surveyPatternSuggestion(summary, currentChart, charts) {
  const evidence = surveyInsights(summary);
  if (!evidence) return;
  const { facts, comparable, small, answerBase } = evidence;
  const options =
    !comparable || small
      ? ["table", "grid", "dots"]
      : summary.groupSizes.length > 3
        ? ["grid", "table", "dots"]
        : ["dots", "grid", "table"];
  if (answerBase && comparable && !small && summary.groupSizes.length <= 6)
    options.unshift("stack");
  const chart = options.find(
    (key) => charts.includes(key) && key !== currentChart,
  );
  const reasons = {
    stack:
      "Use Group mix to see who gave each answer. Each horizontal bar represents everyone who chose that answer and shows the share from each group.",
    table:
      "Use the counts table to check the number of answers behind each percentage.",
    grid: "Use the heatmap to scan across groups for each answer, keeping each question on its own rows.",
    dots: "Use the dot plot to compare the groups on the same percentage scale for each answer.",
  };
  return {
    message: [
      facts.join("\n\n"),
      answerBase && comparable
        ? "A group’s share of an answer can reflect how many people from that group took part. Switch to percentages within each group to compare how often its members chose the answer."
        : "",
      summary.note,
      chart && reasons[chart],
    ]
      .filter(Boolean)
      .join("\n\n"),
    chart,
    evidence,
  };
}
