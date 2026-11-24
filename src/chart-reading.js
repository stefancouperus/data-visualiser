// Send the choices that actually define the displayed chart. A saved view can
// retain inactive model settings, edit dictionaries and earlier filter values.
export function tutorViewSettings(v) {
  const settings = { task: v.task, chart: v.chart, measure: v.measure };
  if (v.filter) Object.assign(settings, { filter: v.filter, value: v.value });
  if (v.task === "model")
    return {
      ...settings,
      outcome: v.outcome,
      predictors: v.predictors,
      positive: v.positive,
      interaction: v.interaction,
    };
  if (v.task === "patterns")
    return {
      ...settings,
      items: v.items,
      patternMode: v.patternMode,
      ...(v.groupBy && v.patternMode === "separate"
        ? { percentBase: v.percentBase === "answer" ? "answer" : "group" }
        : {}),
      groupBy: v.groupBy,
      themeUnit: v.themeUnit,
    };
  if (v.x) settings.x = v.x;
  if (v.task !== "one" && v.y) settings.y = v.y;
  if (["scatter", "line"].includes(v.chart) && v.z) settings.z = v.z;
  return settings;
}

export function chartReadingIntent(request) {
  const text = request.trim().replace(/[.!?]+$/u, "");
  if (
    /^(?:how many (?:of|people|respondents?|participants?|students?|interviewees?|interviews?|sources?|passages?|answers?|responses?|records?|said|answered|chose|selected)|what (?:percentage|proportion|share|fraction) of)\b/i.test(
      text,
    ) &&
    !/\b(?:should|can|could|allowed|recommend)\b/i.test(text)
  )
    return "count";
  if (
    /^(?:(?:could|can|would) you\s+)?(?:please\s+)?(?:draft|write|suggest)(?: me)? (?:a |the )?(?:short |concise )?(?:figure |chart )?caption(?: for (?:this|the current|my) (?:figure|chart|view))?$/i.test(
      text,
    )
  )
    return "caption";
  if (
    /^(?:(?:could|can|would) you\s+)?(?:please\s+)?(?:explain|interpret|summari[sz]e|describe) (?:this|the|my|our|the current) (?:chart|figure|plot|graph|view|pattern|results?|findings?)$/i.test(
      text,
    ) ||
    /^what (?:do|does) (?:this|these|the|the current|our|my) (?:responses|answers|data|results|chart|figure|plot|graph) (?:tell (?:us|me)|show)$/i.test(
      text,
    )
  )
    return "explain";
  return "";
}

const number = new Intl.NumberFormat("en-GB", { maximumSignificantDigits: 4 });
const label = (value) => "“" + value + "”";

// Each option can stand on its own. The model may choose a relevant verified
// sentence, but neither its prose nor an unknown option enters a figure.
function observations(v) {
  if (v.surveyInsights?.facts?.length) return v.surveyInsights.facts;
  const facts = [];
  const pattern = v.categoricalPattern;
  if (pattern?.largestObservedShareDifference) {
    const {
      label: answer,
      higher,
      lower,
    } = pattern.largestObservedShareDifference;
    facts.push(
      `For ${label(answer)}, ${higher.n} of ${higher.den} in ${label(higher.group)} gave this answer, compared with ${lower.n} of ${lower.den} in ${label(lower.group)}.`,
    );
  } else if (pattern?.highestShare) {
    const r = pattern.highestShare;
    const group = r.group ? ` in ${label(r.group)}` : "";
    const tie =
      pattern.numberTiedForHighestShare > 1
        ? " This answer tied for the largest share."
        : "";
    facts.push(
      `${r.n} of ${r.den} valid responses included ${label(r.label)}${group}.${tie}`,
    );
  } else if (
    pattern?.groupsCompared > 1 &&
    pattern.largestObservedShareDifference === null
  ) {
    facts.push(
      "The groups with valid answers had the same observed answer shares.",
    );
  }
  const pair = v.pairedStatistics;
  if (Number.isFinite(pair?.pearsonR))
    facts.push(
      `Across ${pair.completePairs} complete pairs, the correlation was ${number.format(pair.pearsonR)}.`,
    );
  if (v.settings.chart === "box") {
    for (const row of (v.records || [])
      .filter((r) => Number.isFinite(r.median))
      .slice(0, 3)) {
      const group = row.group ? ` in ${label(row.group)}` : "";
      facts.push(
        `The median${group} was ${number.format(row.median)} across ${row.n} valid numerical answers.`,
      );
    }
  }
  if (v.settings.chart === "hist") {
    const values = v.calculatedForSelection?.numericSummaries?.find(
      (s) => s.question === v.x,
    );
    if (values?.valid)
      facts.push(
        `The median was ${number.format(values.median)} across ${values.valid} valid numerical answers.`,
      );
  }
  for (const term of (v.coefficients || [])
    .filter((c) => c.term !== "Intercept")
    .slice(0, 2)) {
    if (Number.isFinite(term.estimate)) {
      const scale = v.event ? " on the log-odds scale" : "";
      facts.push(
        `The fitted coefficient for ${label(term.term)} was ${number.format(term.estimate)}${scale}.`,
      );
    }
  }
  if (v.settings.task === "two" && v.calculatedForSelection?.codeCounts) {
    const both = v.records?.find((r) => r.label === "Both");
    const unit =
      v.settings.measure === "sources" ? "sources" : "original passages";
    if (both) facts.push(`Both selected codes appeared in ${both.n} ${unit}.`);
  } else if (v.settings.task === "one" && v.settings.x) {
    const code = v.calculatedForSelection?.codeCounts?.find(
      (c) => c.code === v.settings.x,
    );
    if (code)
      facts.push(
        `${label(code.code)} appeared in ${code.matchingPassages} original passages across ${code.distinctSourcesWithCode} sources.`,
      );
  }
  if (v.settings.task === "words" && v.records?.length) {
    const first = v.records[0];
    facts.push(
      `The word ${label(first.label)} occurred ${first.n} times across ${first.passageCount} passages.`,
    );
  }
  if (
    v.settings.task === "patterns" &&
    v.largestDisplayedDifference?.percentagePoints > 0
  ) {
    const { pattern, high, low } = v.largestDisplayedDifference;
    facts.push(
      `For ${label(pattern)}, the displayed shares were ${high.n} of ${high.den} in ${label(high.group)} and ${low.n} of ${low.den} in ${label(low.group)}.`,
    );
  }
  return facts;
}

function countReadings(view, question) {
  const normalise = (s) =>
    " " +
    String(s)
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim() +
    " ";
  const prompt = normalise(question);
  const named = (s) =>
    s && normalise(s).trim() && prompt.includes(normalise(s));
  const codes = view.calculatedForSelection?.codeCounts;
  if (codes) {
    const matches = codes.filter((c) => named(c.code));
    if (
      !matches.length &&
      view.settings.x &&
      /\b(?:this|the selected) (?:theme|code|label)\b/i.test(question)
    )
      matches.push(...codes.filter((c) => c.code === view.settings.x));
    return matches.length && matches.length <= 8
      ? [
          matches
            .map(
              (c) =>
                `${label(c.code)} appeared in ${c.matchingPassages} original passages across ${c.distinctSourcesWithCode} sources in this selection.`,
            )
            .join(" "),
        ]
      : [];
  }
  if (view.surveyDistribution) {
    if (view.recordsTotal > view.records.length) return [];
    const selected = view.records.filter((r) => named(r.label));
    const questions = selected.filter((r) => named(r.question));
    const answers = questions.length ? questions : selected;
    const groups = answers.filter(
      (r) => named(r.groupValue) && r.groupValue !== r.label,
    );
    const rows = groups.length ? groups : answers;
    if (!rows.length || rows.length > 12) return [];
    return [
      rows
        .map((r) => {
          const questionAnswer = label(r.label) + " for " + label(r.question);
          if (view.percentBase === "answer") {
            return r.den
              ? `Of the ${r.den} people with a recorded group who chose ${questionAnswer}, ${r.n} belonged to ${label(r.groupValue)} (${number.format(r.value)}%).`
              : `No one with a recorded group chose ${questionAnswer}.`;
          }
          return r.den
            ? `In group ${label(r.groupValue)}, ${r.n} of ${r.den} people who answered chose ${questionAnswer} (${number.format(r.value)}%).`
            : `No one in group ${label(r.groupValue)} answered ${label(r.question)}.`;
        })
        .join(" "),
    ];
  }
  if (!view.categoricalPattern) return [];
  const rows = (view.records || []).filter((r) => r.den > 0 && named(r.label));
  const groups = rows.filter((r) => named(r.group));
  const matched = groups.length ? groups : rows;
  // Include every matching group together. A selected sentence must not make
  // one group's denominator look like the denominator for the whole survey.
  if (
    !matched.length ||
    matched.length > 12 ||
    view.recordsTotal > view.records.length
  )
    return [];
  return [
    matched
      .map((r) => {
        const group = r.group ? ` in ${label(r.group)}` : "";
        return `For ${label(r.label)}${group}, the count was ${r.n} of ${r.den} valid responses (${number.format((100 * r.n) / r.den)}%).`;
      })
      .join(" "),
  ];
}

export function chartReadingOptions(views, intent, question) {
  return views.map((v) => {
    const note =
      v.note || v.message || "There are no calculated figures for this view.";
    const observed = v.settings
      ? intent === "count"
        ? countReadings(v, question)
        : observations(v)
      : [];
    if (intent === "count" && !observed.length)
      return {
        panel: v.panel,
        title: v.title || v.selectedQuestions || "Current view",
        options: [
          "I could not verify the requested count from the categories in this view. Select the answer or theme in the chart, or ask using its displayed wording. " +
            note,
        ],
      };
    return {
      panel: v.panel,
      title: v.title || v.selectedQuestions || "Current view",
      options: [
        ...observed.map((fact) => fact + " " + note),
        ...(intent === "count" ? [] : [note]),
      ],
    };
  });
}

export function compareReadingViews(views) {
  const [left, right] = views;
  if (!left?.settings || !right?.settings) return;
  const selection = ({ chart, measure, filter, value, ...fields }) => fields;
  return {
    sameQuestion:
      JSON.stringify(selection(left.settings)) ===
      JSON.stringify(selection(right.settings)),
    sameFilter:
      left.settings.filter === right.settings.filter &&
      left.settings.value === right.settings.value,
    sameUnit: left.unit === right.unit,
  };
}

export function renderChartReading(panels, choices, comparison) {
  const descriptions = panels
    .map(({ panel, title, options }) => {
      const index = choices?.[panel];
      const observation =
        options[
          Number.isInteger(index) && index >= 0 && index < options.length
            ? index
            : 0
        ];
      return (
        (panels.length > 1
          ? (panel === "right" ? "Right" : "Left") + " view · "
          : "") +
        title +
        " — " +
        observation
      );
    })
    .join("\n\n");
  if (!comparison) return descriptions;
  const note = comparison.sameQuestion
    ? comparison.sameFilter
      ? "Both panels use the same selection and filter."
      : "The panels use the same selection with different filters."
    : comparison.sameFilter
      ? "The panels show different selections under the same filter settings."
      : "Both the selections and the filters differ.";
  return (
    descriptions +
    "\n\n" +
    note +
    (comparison.sameUnit
      ? ""
      : " Check the unit on each figure before comparing the values.")
  );
}
