import { filteredRows } from "./import.js";
import { choicesIn, hasAnswer, optionLevels } from "./survey-answers.js";
import { surveyGroupReader } from "./survey-grouping.js";

const quoted = (s) => "“" + s + "”";
const format = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const normal = (s) =>
  String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(dis)?agreed\b/gu, "$1agree")
    .replace(/[\u201c\u201d"]/gu, "")
    .replace(/[‘’]/gu, "'")
    .replace(/(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const literal = (s) =>
  new RegExp(
    "(?<![\\p{L}\\p{N}])" + escaped(normal(s)) + "(?![\\p{L}\\p{N}])",
    "u",
  );
const pickerHint =
  "Open Combine answers in Chat tools to choose the exact questions and response options.";

export function combinationFields(d, v) {
  if (d?.kind !== "table" || !v) return [];
  const ids =
    v.task === "patterns" && v.patternMode === "separate"
      ? v.items || []
      : ["one", "group", "two"].includes(v.task) &&
          ["bars", "dots", "stack", "grid", "small", "table", "gap"].includes(
            v.chart,
          )
        ? [v.x]
        : [];
  return ids
    .map((id) => d.fields.find((f) => f.id === id))
    .filter(
      (f) =>
        f &&
        !f.roles?.includes("open") &&
        ["category", "multiple", "ordered", "number"].includes(f.type),
    );
}

export function answerOptions(f) {
  return [
    ...new Set([
      ...optionLevels(f),
      ...(f.answerLabels || []).map(([, name]) => name),
    ]),
  ].map(String);
}

// The plotted grouping can use bands in a multiple-question comparison. A
// single-outcome frequency chart uses its original grouping values instead.
function groupField(d, v) {
  const id = v.task === "patterns" ? v.groupBy : v.task === "one" ? "" : v.y;
  return d.fields.find((f) => f.id === id);
}

export function combinedAnswerTotals(
  d,
  v,
  selections,
  byGroup = false,
  mode = "separate",
) {
  const joint = mode === "all" || mode === "any";
  if (joint && new Set(selections.map((s) => s.field)).size < 2)
    throw Error(
      "Choose answers for at least two questions to count the same respondents across questions.",
    );
  const displayed = combinationFields(d, v);
  const fields = selections.map(({ field, answers }) => {
    const f = displayed.find((f) => f.id === field);
    const options = f && new Set(answerOptions(f));
    const labels = new Set(answers);
    if (!f || !labels.size || [...labels].some((s) => !options.has(s)))
      throw Error(
        "Choose a recorded response option for each question you want to include.",
      );
    return { f, labels };
  });
  if (!fields.length) throw Error("Choose the responses you want to count.");
  const group = groupField(d, v);
  if (byGroup && !group)
    throw Error("Choose a grouping question in the figure first.");
  const readGroup = !group
    ? () => ""
    : v.task === "patterns"
      ? surveyGroupReader(group)
      : (row) => String(row[group.id] ?? "");
  const empty = () =>
    joint
      ? [{ n: 0, den: 0, incomplete: 0, mode }]
      : fields.map(({ f, labels }) => ({
          question: f.label,
          field: f.id,
          labels: [...labels],
          n: 0,
          den: 0,
        }));
  const buckets = new Map();
  if (!byGroup) buckets.set("", empty());
  for (const row of filteredRows(d, v)) {
    const level = readGroup(row);
    if (group && !level) continue;
    const key = byGroup ? level : "";
    if (!buckets.has(key)) buckets.set(key, empty());
    const counts = buckets.get(key);
    const picked = ({ f, labels }) =>
      choicesIn(row[f.id], f).some((value) => labels.has(value));
    if (joint) {
      const result = counts[0];
      if (fields.some(({ f }) => !hasAnswer(row, f))) {
        result.incomplete++;
        continue;
      }
      result.den++;
      if (mode === "all" ? fields.every(picked) : fields.some(picked))
        result.n++;
      continue;
    }
    for (const [i, { f }] of fields.entries()) {
      if (!hasAnswer(row, f)) continue;
      counts[i].den++;
      if (picked(fields[i])) counts[i].n++;
    }
  }
  const results = [...buckets].flatMap(([group, entries]) =>
    entries.map((r) => ({ ...r, group })),
  );
  const relation =
    mode === "all"
      ? "every selected question"
      : "at least one selected question";
  const lines = results.map((r) => {
    const name = joint
      ? "Same respondents across questions"
      : quoted(r.question);
    const subject = name + (r.group ? " · " + quoted(r.group) : "") + " — ";
    if (!r.den)
      return (
        subject +
        (joint
          ? "No respondents answered every selected question."
          : "No valid answers in this selection.")
      );
    const value =
      r.n + " of " + r.den + " (" + format.format((100 * r.n) / r.den) + "%)";
    return (
      subject +
      value +
      (joint
        ? " chose a matching answer on " + relation + "."
        : " chose " + r.labels.map(quoted).join(" or ") + ".")
    );
  });
  const scope = joint
    ? [
        "Each respondent counts once. The denominator includes people who answered every selected question. " +
          results.reduce((n, r) => n + r.incomplete, 0) +
          " had a missing answer and were left out.",
        ...fields.map(
          ({ f, labels }) =>
            quoted(f.label) +
            " — " +
            [...labels].map(quoted).join(" or ") +
            ".",
        ),
      ]
    : ["The denominator is the number who answered each question."];
  if (fields.some(({ f }) => f.type === "multiple"))
    scope.push("A response that ticked several matching options counts once.");
  if (group)
    scope.push(
      "Only responses with a recorded answer to " +
        quoted(group.label) +
        " are included.",
    );
  if (v.filter)
    scope.push(
      "Filtered to " +
        quoted(v.value) +
        " for " +
        quoted(d.fields.find((f) => f.id === v.filter)?.label || v.filter) +
        ".",
    );
  if (d.rules?.length) scope.push("Project exclusions apply.");
  return {
    results,
    message: [
      ...(lines.length ? lines : ["No recorded groups in this selection."]),
      scope.join(" "),
    ].join("\n\n"),
  };
}

// Match adjacent project labels as a set. Prefer a whole label such as
// "Very often" to "Often" occurring inside it. Preserve punctuation in labels.
function namedSets(text, labels) {
  const names = new Map();
  for (const label of labels) {
    const name = normal(label);
    if (name)
      names.set(
        name,
        names.has(name) && names.get(name) !== label ? null : label,
      );
  }
  const words = [...names.keys()]
    .filter((name) => text.includes(name))
    .sort((a, b) => b.length - a.length)
    .map(escaped);
  if (!words.length) return [];
  const matches = [
    ...text.matchAll(
      new RegExp(
        "(?<![\\p{L}\\p{N}])(?:" + words.join("|") + ")(?![\\p{L}\\p{N}])",
        "gu",
      ),
    ),
  ];
  const sets = [];
  for (const m of matches) {
    const last = sets.at(-1);
    if (
      last &&
      /^\s*(?:(?:,\s*)?(?:or|and|plus)|[,/+&])\s*$/u.test(
        text.slice(last.end, m.index),
      )
    ) {
      last.values.push(names.get(m[0]));
      last.end = m.index + m[0].length;
    } else
      sets.push({
        values: [names.get(m[0])],
        start: m.index,
        end: m.index + m[0].length,
      });
  }
  return sets;
}

// If a model ignores the tool request and starts pooling figures in prose,
// only the browser may supply the pooled result.
export function claimsCombinedCount(d, v, reply) {
  if (d?.kind !== "table" || typeof reply !== "string" || !/\d/u.test(reply))
    return false;
  const text = normal(reply);
  if (
    !/[%+]|\b(?:chose|selected|respondents?|responses?|total|combined|agree(?:ment)?|pool(?:ed)?|of \d+)\b/u.test(
      text,
    )
  )
    return false;
  return namedSets(
    text,
    new Set(combinationFields(d, v).flatMap(answerOptions)),
  ).some((set) => set.values.length > 1);
}

// Recognise the relationship between questions separately from "or" between answer options.
function questionRelation(text) {
  const target = String.raw`(?:the |these |those |my |our )?(?:(?:two|three|four|five|six|[2-9]) )?(?:(?:selected|displayed|current|survey|closed) )?(?:questions?|items?|statements?|\[question\]|them)`;
  const every = new RegExp(
    String.raw`\b(?:both|all)(?: of)? ${target}|\b(?:on|to|in|for) (?:both|all)(?=$|[?.!,])`,
    "u",
  );
  const any = new RegExp(
    String.raw`\b(?:at least one(?: of)?|any(?: of)?|either(?: of)?) ${target}|\b(?:on|to|in|for) (?:either|at least one)(?=$|[?.!,])`,
    "u",
  );
  const allMatch = every.test(text),
    anyMatch = any.test(text);
  if (
    (allMatch && anyMatch) ||
    ((anyMatch || allMatch) &&
      /\b(?:separately|for each question)\b/u.test(text))
  )
    return "clarify";
  if (allMatch) return "all";
  if (anyMatch) return "any";
  return "separate";
}

export function combinedAnswerRequest(d, v, question, force = false) {
  if (d?.kind !== "table") return;
  const text = normal(question);
  const otherTask =
    /^(?:(?:can|could|would) you )?(?:please )?(?:draw|plot|build|make|create|filter|show (?:me )?a (?:chart|plot|visual)|(?:suggest|recommend) (?:a|another) (?:chart|plot|visual)|how (?:can|do|should) (?:i|we)|should (?:i|we))\b/u.test(
      text,
    );
  const aggregate =
    /\b(?:how many|how (?:often|common)|count|number|overall|total|totals|percentage|percent|proportion|share|fraction|combine|combined|pool|pooled|altogether|add up|giving|gave|chose|picked|ticked|selected|endorsed|respondents?|responses?)\b|%/u.test(
      text,
    );
  const explicit =
    /\b(?:combin(?:e|ed|ing)|pool(?:ed|ing)?|aggregat(?:e|ed)|add(?:ed)? (?:up|together)|(?:overall|total) (?:support|agreement|disagreement|approval|opposition)|(?:top|bottom)[- ](?:two|2|three|3)(?:[- ](?:box|categories|options|responses)))\b/u.test(
      text,
    );
  const alternatives =
    /\b(?:chose|selected|picked|ticked|answered|said|give|gave|agree|disagree)\b[^?!.]{0,90}\bor\b/u.test(
      text,
    );
  if (!force && (otherTask || !(aggregate || explicit || alternatives))) return;
  const fields = combinationFields(d, v);
  const requestedFields = fields.filter((f) => literal(f.label).test(text));
  const masked = requestedFields.reduce(
    (q, f) => q.replace(literal(f.label), "[question]"),
    text,
  );
  const mode = questionRelation(masked);
  if (mode === "clarify")
    return {
      message:
        "Should I count responses separately for each question, or count the same respondents across questions? " +
        pickerHint,
    };
  const joint = mode !== "separate";
  const sets = namedSets(masked, new Set(fields.flatMap(answerOptions))).filter(
    (set) => joint || set.values.length > 1,
  );
  if (!force && !joint && !sets.length && !explicit && !alternatives) return;
  if (!fields.length)
    return {
      message:
        "Choose one or more survey questions in an answer distribution to calculate their combined responses.",
    };
  if (sets.length !== 1 || !sets[0].values.every(Boolean))
    return {
      message: "I need the exact response options to combine. " + pickerHint,
    };
  const set = sets[0];
  const labels = [...new Set(set.values)];
  // Do not silently turn an incomplete list into a smaller union.
  if (
    (!joint && labels.length < 2) ||
    /^\s*(?:,?\s+or\b|,?\s+plus\b|\/)/u.test(masked.slice(set.end)) ||
    /\bor\s*$/u.test(masked.slice(0, set.start))
  )
    return {
      message:
        "I couldn't identify every requested response option. " + pickerHint,
    };
  const chosen = requestedFields.length ? requestedFields : fields;
  const countingClause =
    masked.slice(0, set.start) + " [answers] " + masked.slice(set.end);
  const declared = countingClause.match(
    /\b(two|three|four|five|six|[2-9]) (?:(?:selected|displayed|current|survey|closed) )?(?:questions?|items?|statements?)\b/u,
  );
  const namedNumber = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const expected = declared
    ? namedNumber[declared[1]] || Number(declared[1])
    : /\bboth\b/u.test(countingClause)
      ? 2
      : undefined;
  if (joint && (chosen.length < 2 || (expected && chosen.length !== expected)))
    return {
      message:
        "Choose the questions you mean in the figure, then try again. " +
        pickerHint,
    };
  const byGroup =
    /\b(?:by (?:each )?group|(?:in|for|within) each group|per group|group by group)\b/u.test(
      text,
    );
  let remainder = declared
    ? countingClause.replace(declared[0], "questions")
    : countingClause;
  remainder = remainder.replace(
    /\b(?:by (?:each )?group|(?:in|for|within) each group|per group|group by group|(?:across|among) (?:all |the )?(?:displayed |selected )?groups|in (?:this|the current) (?:view|figure|selection|sample))\b/gu,
    "",
  );
  if (
    chosen.some((f) => f.type === "multiple") &&
    /\band\b|&/u.test(masked.slice(set.start, set.end)) &&
    !/\b(?:either|any|at least one|combine|combined|pooled)\b/u.test(text)
  )
    return {
      message:
        "Do you mean anyone who chose either option, or only people who chose both? For the first, ask with “or” between the options. For the second, inspect answer combinations.",
    };
  const [before, after] = remainder.split("[answers]");
  // Check the counting clause for unbound words, especially a subgroup such
  // as “first-year students” for which the figure has no confirmed filter.
  const clause = (
    before.split(/[?!.;]/u).at(-1) +
    " " +
    after.split(/[?!.;]/u)[0]
  ).replaceAll("[question]", " ");
  const genericWords =
    /\b(?:a|an|the|me|my|our|we|i|you|this|these|those|them|both|two|three|four|five|six|all|each|selected|current|displayed|same|closed|survey|sample|data|dataset|figure|chart|view|project|across|of|for|on|to|from|in|and|or|at|least|one|more|either|any|these|question[s]?|statement[s]?|item[s]?|option[s]?|choice[s]?|answer[s]?|response[s]?|category|categories|people|persons?|participants?|respondents?|records?|students?|who|what|which|how|when|can|could|would|do|did|has|have|is|are|were|was|many|much|often|common|number[s]?|count[s]?|percentage[s]?|pct|percent|proportion[s]?|share[s]?|fraction|total[s]?|overall|together|combined?|combining|add|up|pooled?|altogether|majority|denominator[s]?|valid|out|answered|answering|responded|responding|say|said|select|selecting|choose|chosen|choosing|chose|pick(?:ed)?|ticked|endorsed|indicated|reported|gave|give|with|show|tell|calculate|please|as)\b/gu;
  if (
    /\b(?:only|excluding|except|weighted|among|within|where|instead|not|didn.t|neither|intersection|simultaneously|at the same time|in group|from group)\b/u.test(
      remainder,
    ) ||
    /[\p{L}\p{N}]/u.test(clause.replace(genericWords, ""))
  )
    return {
      message:
        "I couldn't verify the full question or subgroup requested. Set any subgroup filter in the figure first. " +
        pickerHint,
    };
  const selections = [];
  const missing = [];
  for (const f of chosen) {
    const options = answerOptions(f);
    const resolved = labels.map((l) =>
      options.filter((o) => normal(o) === normal(l)),
    );
    if (resolved.some((names) => names.length !== 1)) missing.push(f.label);
    else
      selections.push({
        field: f.id,
        answers: resolved.map((names) => names[0]),
      });
  }
  if (!selections.length || (joint && missing.length))
    return {
      message:
        "I couldn't verify those response options for the selected questions. " +
        pickerHint,
    };
  if (byGroup && !groupField(d, v))
    return {
      message:
        "Choose a grouping question in the figure first, then ask for a total in each group.",
    };
  const result = combinedAnswerTotals(d, v, selections, byGroup, mode);
  if (missing.length)
    result.message +=
      "\n\nThe available answer labels do not establish the same options for " +
      missing.map(quoted).join(", ") +
      ".";
  return result;
}
