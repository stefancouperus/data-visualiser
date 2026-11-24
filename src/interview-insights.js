const format = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const pct = (n, den) => format.format((100 * n) / den) + "%";
const quoted = (s) => "“" + s + "”";
const list = new Intl.ListFormat("en-GB", { type: "conjunction" });

export function asksForThemePatterns(text) {
  const request = text
    .trim()
    .replace(/^(?:(?:could|can|would) you\s+)?(?:please\s+)?/iu, "")
    .replace(/[?!.]+$/u, "")
    .replace(
      /(?:,? and (?:suggest|recommend) (?:a|an appropriate|a suitable) (?:chart|visual|figure))$/iu,
      "",
    )
    .replace(
      /\s+(?:here|(?:in|across|between|among|for) (?:(?:these|those|the|my|our|the selected|my selected) )?(?:themes|interviews|groups|interviewees|participants|coded passages|selection|comparison|figure|chart|data))$/iu,
      "",
    );
  return /^(?:(?:what|anything) (?:else )?stands out|(?:what|which) (?:themes|patterns|differences|similarities) stand out|(?:spot|identify|suggest|find|highlight|look for) (?:any |the |some |interesting |main |clearest )*(?:patterns|differences|observations|similarities)|(?:are there|do you (?:see|notice)) (?:any |interesting )*(?:patterns|differences|similarities))$/iu.test(
    request,
  );
}

// Use this shortcut only when the active selection contains one interview.
// A named theme, an extra filter or a requested chart still needs its own reading.
export function asksForWithinInterviewPatterns(text) {
  const question = text
    .trim()
    .replace(
      /^(?:in|within) (?:this|the|my) (?:one |single )?interview,?\s+/iu,
      "",
    )
    .replace(
      /[.?!]\s*give (?:me )?the two highest counts and their denominator[.!]?$/iu,
      "",
    )
    .replace(/[?!.]+$/u, "")
    .replace(
      /\s+(?:in|within) (?:this|my|the) (?:one |single )?interview$/iu,
      "",
    );
  return /^(?:which|what) (?:of (?:my|our|the) )?(?:selected )?(?:themes|codes|labels) (?:recur(?: or (?:overlap|appear in the same passage))?|overlap|(?:are|were) coded most often|(?:appear|occur|come up) (?:most often|together(?: in the same passage)?|in the same passage))$/iu.test(
    question,
  );
}

// Stacked theme bars have one valid denominator. Validate model requests
// against the new measure as well as the chart, including a change of style.
export function interviewComparisonPick(pick, current) {
  const task = pick.task || current.task;
  const mode = pick.patternMode || current.patternMode || "sources";
  if (task !== "patterns" || mode !== "sources") return pick;
  const groupBy = pick.groupBy ?? current.groupBy;
  const key = groupBy ? "themeUnit" : "sourceMeasure";
  const explicit = pick[key];
  if (pick.action === "restyleChart") {
    if (
      explicit === undefined &&
      !(pick.chart === "stack" && current[key] !== "themeShare")
    )
      return pick;
    if (
      explicit !== undefined &&
      explicit === current[key] &&
      groupBy === current.groupBy
    )
      return pick;
    return {
      ...pick,
      action: "draw",
      task,
      patternMode: mode,
      [key]: explicit ?? "themeShare",
    };
  }
  if (pick.chart === "stack" && explicit === undefined)
    return { ...pick, [key]: "themeShare" };
  if (!pick.chart && explicit === "themeShare")
    return { ...pick, chart: "stack" };
  return pick;
}

function amount(row, mode) {
  const noun =
    (mode === "interviewShare" ? "interview" : "included passage") +
    (row.den === 1 ? "" : "s");
  return (
    row.n +
    " of " +
    row.den +
    " " +
    noun +
    (mode === "count" ? "" : " (" + pct(row.n, row.den) + ")")
  );
}

export function themeCellReading(row, comparison, other) {
  const theme = quoted(row.label);
  const level = quoted(row.groupValue);
  if (comparison.unit === "themePassageShare") {
    if (!row.den)
      return `No included passage in the comparison carries ${theme}.`;
    const passages = row.den === 1 ? "passage" : "passages";
    const next = other
      ? ` and ${other.n} from ${quoted(other.groupValue)} (${pct(other.n, other.den)})`
      : "";
    return `Of the ${row.den} included ${passages} coded ${theme}, ${row.n} came from ${level} (${pct(row.n, row.den)})${next}.`;
  }
  if (!row.den || row.undefinedShare)
    return `There are no included passages in ${level}.`;
  const what =
    comparison.unit === "interviewShare" ? "appeared in" : "was coded in";
  const next = other
    ? ` and ${amount(other, comparison.unit)} in ${quoted(other.groupValue)}`
    : "";
  return `${theme} ${what} ${amount(row, comparison.unit)} in ${level}${next}.`;
}

function withinInterviewInsights({ withinInterview, themeComparison }) {
  const { source, themes, pairs } = withinInterview;
  const { passages, reviewed } = themeComparison;
  const facts = [],
    caveats = [];
  if (!passages || !themes.length) {
    facts.push(
      !passages
        ? "There are no included original passages in this selection."
        : "Select a theme to see how often it was coded in this interview.",
    );
  } else {
    const frequencies = [
      ...new Set(themes.map((t) => t.n).filter((n) => n > 0)),
    ].sort((a, b) => b - a);
    if (frequencies.length) {
      const leading = frequencies.slice(0, 2).map((n) => {
        const labels = themes
          .filter((t) => t.n === n)
          .map((t) => quoted(t.label));
        return (
          list.format(labels) +
          (labels.length === 1 ? " was" : " were each") +
          " coded in " +
          n +
          " of " +
          passages +
          " included original " +
          (passages === 1 ? "passage" : "passages")
        );
      });
      facts.push(
        "Among the selected themes in " +
          quoted(source) +
          ", " +
          leading.join(". ") +
          ".",
      );
      if (frequencies[0] === 1)
        facts.push("No selected theme recurs in a second passage.");
      const unused = themes
        .filter((t) => t.n === 0)
        .map((t) => quoted(t.label));
      if (unused.length)
        facts.push(
          list.format(unused) +
            (unused.length === 1 ? " has" : " have") +
            " no coded passages in this selection.",
        );
    } else {
      facts.push(
        "None of the selected themes was coded in the " +
          passages +
          " included original " +
          (passages === 1 ? "passage" : "passages") +
          " of " +
          quoted(source) +
          ".",
      );
    }
    if (pairs.length) {
      const highest = pairs[0].n;
      if (highest) {
        const ties = pairs.filter((p) => p.n === highest);
        const examples = ties
          .slice(0, 2)
          .map((p) => quoted(p.left) + " with " + quoted(p.right));
        const total =
          highest +
          " of " +
          passages +
          " included original " +
          (passages === 1 ? "passage" : "passages");
        if (ties.length === 1)
          facts.push(
            "The most frequent overlap was " +
              examples[0] +
              ", coded together in " +
              total +
              ".",
          );
        else
          facts.push(
            ties.length +
              " pairs tied for the most frequent overlap, each coded together in " +
              total +
              ". " +
              (ties.length > 2 ? "Two examples are " : "The pairs are ") +
              list.format(examples) +
              ".",
          );
      } else {
        facts.push(
          "No included original passage was coded with two of the selected themes.",
        );
      }
    } else
      caveats.push(
        "Select another theme to check which passages carry both codes.",
      );
  }
  if (passages)
    caveats.push(
      "A theme counts once per passage in this interview. Codes on different quotations can share a passage.",
    );
  if (reviewed < passages)
    caveats.push(
      passages -
        reviewed +
        " of " +
        passages +
        " included original passages still need a recorded review.",
    );
  return { facts, caveats };
}

// Use the cells behind the figure, including those beyond the chat preview.
// A group may be on the source list even though it supplied no passages.
export function interviewInsights(summary) {
  const comparison = summary?.themeComparison;
  if (!comparison || comparison.written) return;
  if (summary.withinInterview) return withinInterviewInsights(summary);
  const { grouped, unit, passages, reviewed } = comparison;
  const sizes = new Map(summary.groupSizes.map((g) => [g.group, g]));
  const byTheme = new Map();
  for (const r of summary.records) {
    if (!r.den || r.undefinedShare || !sizes.get(r.groupValue)?.passages)
      continue;
    if (!byTheme.has(r.label)) byTheme.set(r.label, []);
    byTheme.get(r.label).push(r);
  }
  const levelName = grouped ? "groups" : "interviews";
  const support = (r) =>
    grouped ? Math.min(r.den, sizes.get(r.groupValue).selected) : r.den;
  const contrasts = [];
  let comparable = false;
  for (const rows of byTheme.values()) {
    if (rows.length < 2) continue;
    comparable = true;
    const ordered = [...rows].sort((a, b) => a.value - b.value);
    const larger = ordered.filter((r) => support(r) >= 5);
    const useLarger =
      larger.length >= 2 && larger[0].value !== larger.at(-1).value;
    const pool = useLarger ? larger : ordered;
    const low = pool[0],
      high = pool.at(-1);
    if (high.value > low.value)
      contrasts.push({
        high,
        low,
        gap: high.value - low.value,
        small: Math.min(support(low), support(high)) < 5,
      });
  }
  contrasts.sort((a, b) => Number(a.small) - Number(b.small) || b.gap - a.gap);
  const findings = contrasts.slice(0, 2);
  const facts = findings.map(({ high, low }) =>
    themeCellReading(high, comparison, low),
  );
  if (!facts.length) {
    if (!passages)
      facts.push(
        "There are no included passages in this selection. Check the passage selection or the current filter.",
      );
    else if ([...sizes.values()].filter((g) => g.passages).length < 2)
      facts.push(
        "This selection contains fewer than two " +
          levelName +
          " with included passages to compare.",
      );
    else if (!summary.records.some((r) => r.n))
      facts.push(
        "None of the selected themes has been applied to the included passages in these " +
          levelName +
          ".",
      );
    else
      facts.push(
        "For each selected theme with a usable base, the displayed " +
          (unit === "count" ? "counts" : "percentages") +
          " are equal across the " +
          levelName +
          " with included passages.",
      );
  }
  if (comparable && facts.length < 2) {
    const shared = [...byTheme.values()].find(
      (rows) =>
        rows.every((r) => r.n > 0) && rows[0].label !== findings[0]?.high.label,
    );
    if (shared) {
      const where = grouped ? "groups" : "interviews";
      facts.push(
        quoted(shared[0].label) +
          " had at least one coded passage in all " +
          shared.length +
          " " +
          where +
          " with included passages in this comparison.",
      );
    }
  }
  const smallGroups =
    grouped && [...sizes.values()].some((g) => g.passages && g.selected < 5);
  const small = smallGroups || findings.some((r) => r.small);
  const caveats = [];
  if (smallGroups)
    caveats.push(
      "At least one displayed group has fewer than five interviews. A single interview can change its result substantially.",
    );
  else if (small && unit !== "interviewShare")
    caveats.push(
      "At least one of these figures uses fewer than five original passages.",
    );
  if (unit === "count")
    caveats.push(
      "Longer interviews can have more coded passages. Switch to passage percentages to compare their shares.",
    );
  if (grouped && unit === "passageShare")
    caveats.push(
      "Interviews with more included passages contribute more to the group percentage.",
    );
  if (unit === "themePassageShare")
    caveats.push(
      "These shares show who contributed the passages coded with a theme. Interviews of different lengths can contribute different amounts of material, and a larger group can contribute more passages. To compare how often the theme was coded within each interview or group, choose the share of its own passages.",
    );
  if (comparison.sourcesWithoutPassages)
    caveats.push(
      "Some listed interviews have no included passages. Check their coverage before interpreting this comparison.",
    );
  if (reviewed < passages)
    caveats.push(
      "Some included passages have no recorded review. Further coding could change these figures.",
    );
  return { facts, comparable, small, caveats };
}

export function interviewPatternSuggestion(summary, currentChart, charts) {
  const evidence = interviewInsights(summary);
  if (!evidence) return;
  if (summary.withinInterview) {
    const usable =
      summary.themeComparison.passages > 0 &&
      summary.withinInterview.themes.some((t) => t.n);
    const chart =
      usable &&
      ["bars", "table"].find((c) => c !== currentChart && charts.includes(c));
    const grouped = summary.themeComparison.grouped;
    const measure = grouped
      ? { themeUnit: "passages" }
      : { sourceMeasure: "count" };
    const overlapping = summary.withinInterview.pairs.some((p) => p.n);
    return {
      evidence,
      chart: chart || undefined,
      spec: chart
        ? {
            action: "draw",
            task: "patterns",
            patternMode: "sources",
            ...measure,
            chart,
          }
        : undefined,
      message: [
        ...evidence.facts,
        ...evidence.caveats,
        chart &&
          "Use " +
            (chart === "bars" ? "horizontal bars" : "the data table") +
            " to compare " +
            (grouped
              ? "the percentage of this interview’s passages carrying each theme."
              : "the number of passages carrying each theme."),
        usable &&
          "Select a theme value in the figure to read the coded passages.",
        overlapping &&
          "Choose Read shared passages to inspect an overlap in the transcript.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  const options =
    evidence.small || !evidence.comparable
      ? ["table", "grid", "dots", "bars"]
      : summary.groupSizes.length > 3
        ? ["grid", "table", "dots", "bars"]
        : ["dots", "grid", "table", "bars"];
  if (
    evidence.comparable &&
    summary.themeComparison.unit === "themePassageShare" &&
    summary.groupSizes.length <= 6
  )
    options.splice(evidence.small ? 1 : 0, 0, "stack");
  const chart =
    summary.themeComparison.passages > 0 &&
    options.find((id) => charts.includes(id) && id !== currentChart);
  const recommendation = {
    stack:
      "Use a horizontal share bar for each theme to see which interviews or groups contributed its coded passages.",
    table: "Use the data table to check the counts and the totals behind them.",
    grid: "Use the heatmap to scan across the columns for each theme.",
    dots: "Use the dot plot to see how far apart the values are for each theme.",
    bars: "Use horizontal bars to compare the values for each theme.",
  };
  return {
    evidence,
    chart: chart || undefined,
    message: [
      ...evidence.facts,
      ...evidence.caveats,
      summary.note,
      chart && recommendation[chart],
      summary.records.some((r) => r.n > 0) &&
        "Select a value in the figure to read its matching coded passages.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
