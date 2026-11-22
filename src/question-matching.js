// Match what a student calls a question against its wording and categorical
// choices locally. Only words already in the request are sent as matching hints.
const ignore = new Set(
  "a an and or the question questions item items statement statements about on of to whether did do does is are how what would you your they i me my we people".split(
    " ",
  ),
);
const tokens = (text) => [
  ...new Set(
    (
      String(text || "")
        .toLowerCase()
        .normalize("NFKC")
        .match(/[\p{L}\p{N}]+/gu) || []
    )
      .filter((w) => !ignore.has(w))
      .map((w) =>
        w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)
          ? w.slice(0, -1)
          : w,
      ),
  ),
];

function answerWords(field) {
  if (!["category", "ordered", "multiple"].includes(field.type))
    return new Set();
  return new Set(field.levels.filter((s) => s.length <= 80).flatMap(tokens));
}

export function chartFields(fields, question) {
  const words = tokens(question);
  return fields
    .filter((f) => f.type !== "metadata" && f.levels.length)
    .map((f) => {
      const choices = answerWords(f);
      const matches = words.filter((w) => choices.has(w));
      return {
        id: f.id,
        name: f.label,
        type: f.type,
        ...(f.levels.length === 2 &&
        ["category", "ordered"].includes(f.type) &&
        f.levels.every((s) => s.length <= 60)
          ? { binaryEventChoices: f.levels }
          : {}),
        ...(matches.length
          ? { requestWordsMatchingAnswerChoices: matches }
          : {}),
      };
    });
}

function candidates(fields, phrase) {
  const words = tokens(phrase);
  if (!words.length) return [];
  return fields.filter((f) => {
    const possible = new Set([
      ...tokens(f.label),
      ...tokens(f.raw),
      ...answerWords(f),
    ]);
    return words.every((w) => possible.has(w));
  });
}

// Handle explicit, unqualified requests for a relationship chart. Specific
// chart types, filters, interpretation and more involved questions use the tutor.
export function directComparison(fields, question) {
  const ask = question.trim().replace(/[?!.,]+$/, "");
  const lead = ask.match(
    /^(?:(?:could|can|would) you\s+)?(?:please\s+)?(?:create|make|draw|show|plot|build)\s+(?:me\s+)?(?:a|an|the)\s+(?:visual|visualisation|visualization|chart|plot|graph)\s+(.*)$/i,
  );
  if (!lead) return null;
  const tail = lead[1];
  const pair =
    tail.match(
      /^(?:(?:that|which)\s+)?(?:relates?|links?|connects?|relating|linking|connecting)\s+(.+?)\s+(?:to|with)\s+(.+)$/i,
    ) ||
    tail.match(
      /^(?:of\s+|showing\s+)?(?:the\s+)?(?:relationship|association|link) between\s+(.+?)\s+and\s+(.+)$/i,
    );
  if (
    !pair ||
    /\b(?:only|excluding|except|among|filter|without|adjust|control|versus|instead|weighted|left|right)\b/i.test(
      tail,
    )
  )
    return null;
  const use = fields.filter(
    (f) => ["category", "ordered"].includes(f.type) && f.levels.length,
  );
  const [first, second] = pair.slice(1).map((p) => candidates(use, p));
  if (!first.length || !second.length) return null;
  if (first.length !== 1 || second.length !== 1) {
    const i = first.length > 1 ? 0 : 1;
    const choices = [first, second][i]
      .slice(0, 4)
      .map((f) => "“" + f.label + "”");
    return {
      action: "answer",
      explanation:
        "By “" +
        pair[i + 1] +
        "”, which question did you mean? " +
        choices.join(" or "),
    };
  }
  if (first[0].id === second[0].id) return null;
  const firstIsGroup =
    second[0].type === "ordered" && first[0].type !== "ordered";
  const [outcome, group] = firstIsGroup
    ? [second[0], first[0]]
    : [first[0], second[0]];
  return {
    action: "draw",
    task: "group",
    chart: "stack",
    measure: "percent",
    x: outcome.id,
    y: group.id,
  };
}

export function resolveAxis(fields, value) {
  if (typeof value !== "string" || !value.trim()) return value;
  const options = fields.filter((f) => f.type !== "metadata");
  if (options.some((f) => f.id === value)) return value;
  const lower = value.trim().toLowerCase();
  const exact = options.filter((f) =>
    [f.label, f.raw].some((s) => s?.toLowerCase().trim() === lower),
  );
  const results = exact.length ? exact : candidates(options, value);
  return results.length === 1 ? results[0].id : value;
}

// Enforce an explicitly requested visual in a draw instruction. Recommendations
// and comparative questions about several chart types still go to the tutor.
export function namedChartRequest(question) {
  const match = question
    .trim()
    .match(
      /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:draw|create|make|show|plot|build)\s+(?:me\s+)?(?:a |an |the )?(100% stacked bar(?: chart)?s?|stacked bar(?: chart)?s?|bar (?:chart|plot)|dot plot|heat\s?map|scatter\s?plot|histogram|presence (?:grid|matrix)|line (?:chart|graph)|small multiples|data table)\b/i,
    );
  if (!match) return;
  const name = match[1].toLowerCase();
  if (name.includes("stacked")) return "stack";
  if (name.startsWith("bar")) return "bars";
  if (name.startsWith("dot")) return "dots";
  if (name.startsWith("heat")) return "grid";
  if (name.startsWith("scatter")) return "scatter";
  if (name === "histogram") return "hist";
  if (name.startsWith("presence")) return "presence";
  if (name.startsWith("line")) return "line";
  if (name === "small multiples") return "small";
  return "table";
}
