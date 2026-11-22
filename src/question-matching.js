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

function axisChoices(fields, phrase) {
  const exactId = fields.find((f) => f.id === phrase);
  if (exactId) return [exactId];
  const lower = phrase.trim().toLowerCase();
  const exact = fields.filter((f) =>
    [f.label, f.raw].some((s) => s?.trim().toLowerCase() === lower),
  );
  return exact.length ? exact : candidates(fields, phrase);
}

// A coordinate request specifies the direction on each axis. Match those roles
// directly so a scatterplot cannot be replaced by a categorical comparison.
function coordinateComparison(fields, question, chosen) {
  const command = question
    .trim()
    .replace(/[.?!]+$/, "")
    .match(
      /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:plot|draw|create|make|show|build)\s+(?:me\s+)?(.+)$/i,
    );
  if (!command) return null;
  const body = command[1];
  const prefix = body.match(
    /^(?:a |an |the )?(scatter\s?plot|line (?:chart|graph|plot))\s+(?:of|showing|with)\s+(.+)$/i,
  );
  const suffix = body.match(
    /^(.+?)\s+as\s+(?:a |an |the )?(scatter\s?plot|line (?:chart|graph|plot))$/i,
  );
  if (!prefix && !suffix) return null;
  const chart = /^scatter/i.test(prefix?.[1] || suffix[2]) ? "scatter" : "line";
  const placement = (prefix?.[2] || suffix[1]).match(
    /^(.+?)\s+on\s+(?:the\s+)?(horizontal|vertical|x|y)[ -]axis(?:,?\s+and\s+|,\s*)(.+?)\s+on\s+(?:the\s+)?(horizontal|vertical|x|y)[ -]axis$/i,
  );
  if (!placement) return null;
  const isHorizontal = (axis) => /^(?:horizontal|x)$/i.test(axis);
  const horizontalFirst = isHorizontal(placement[2]);
  if (horizontalFirst === isHorizontal(placement[4]))
    return {
      action: "answer",
      explanation:
        "Which question belongs on the horizontal axis, and which on the vertical axis?",
    };
  const phrases = horizontalFirst
    ? [placement[1], placement[3]]
    : [placement[3], placement[1]];
  const options = fields.filter(
    (f) => f.levels.length && !f.roles?.includes("open"),
  );
  const choices = phrases.map((phrase, i) =>
    axisChoices(options, phrase).filter(
      (f) => f.type === "number" || (i === 0 && f.type === "date"),
    ),
  );
  if (choices.some((list) => !list.length)) {
    const i = choices.findIndex((list) => !list.length);
    return {
      action: "answer",
      explanation:
        i === 0
          ? "Which numeric or date question should go on the horizontal axis? I could not match “" +
            phrases[i] +
            "” to one."
          : "Which numeric question should go on the vertical axis? I could not match “" +
            phrases[i] +
            "” to one.",
    };
  }
  if (!chosen && choices.some((list) => list.length > 1))
    return {
      action: "clarifyAxes",
      axes: choices.map((list, i) => ({
        role: i === 0 ? "Horizontal axis" : "Vertical axis",
        phrase: phrases[i],
        choices: list.map((f) => [f.id, f.label]),
      })),
    };
  const [x, y] = chosen || choices.map((list) => list[0].id);
  if (
    x === y ||
    !choices[0].some((f) => f.id === x) ||
    !choices[1].some((f) => f.id === y)
  )
    return {
      action: "answer",
      explanation: "Choose two different questions for the two axes.",
    };
  return { action: "draw", task: "two", chart, x, y, measure: "count" };
}

// Students can name the axes together or assign each question a role in a later sentence.
export function namedSurveyComparison(fields, question, chosen) {
  const namedChart = namedChartRequest(question);
  const plainComparison = question
    .trim()
    .match(
      /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:show|plot|compare)\s+(?:me\s+)?(.+?)\s+by\s+([^,.;?!]+)[.?!]?$/i,
    );
  const chart = namedChart || (plainComparison && "bars");
  if (
    /\b(?:only|excluding|include|except|weighted|adjust|control for|instead|filter|overall|among|without|rather than|left panel|right panel)\b/i.test(
      question,
    )
  )
    return null;
  const numericPair = coordinateComparison(fields, question, chosen);
  if (numericPair) return numericPair;
  if (!["bars", "dots", "grid", "small", "table", "stack"].includes(chart))
    return null;
  const instruction = question.trim().replace(/[.?!]+$/u, "");
  const by = instruction.match(
    /\b(?:of|showing|comparing|for)\s+(.+?)\s+by\s+([^,]+?)(?:,?\s+(?:showing|using|as)\s+(counts?|numbers?|percentages?|percents?)(?:\s+within\s+each\s+(.+))?)?$/i,
  );
  const roles = instruction.match(
    /\buse\s+([^.!?]+?)\s+(?:for|as)\s+(?:the\s+)?(answers?|outcomes?|groups?)\s+and\s+([^.!?]+?)\s+(?:for|as)\s+(?:the\s+)?(answers?|outcomes?|groups?)(?:[.,;]\s*(?:show|use|showing|using)\s+(counts?|numbers?|percentages?|percents?)(?:\s+within\s+each\s+([^.!?]+))?)?$/i,
  );
  let axes, unit, within;
  if (roles) {
    const firstGroups = /^group/i.test(roles[2]);
    if (firstGroups === /^group/i.test(roles[4])) return null;
    axes = firstGroups ? [roles[3], roles[1]] : [roles[1], roles[3]];
    unit = roles[5];
    within = roles[6];
  } else if (by) {
    axes = [by[1], by[2]];
    unit = by[3];
    within = by[4];
  } else if (!namedChart && plainComparison) {
    axes = plainComparison.slice(1);
  } else return null;
  const options = fields.filter(
    (f) =>
      ["ordered", "category", "multiple", "number"].includes(f.type) &&
      f.levels.length &&
      !f.roles?.includes("open"),
  );
  const matches = axes.map((axis) => axisChoices(options, axis));
  if (!chosen && matches.some((list) => list.length > 1)) {
    return {
      action: "clarifyAxes",
      axes: matches.map((list, i) => ({
        phrase: axes[i],
        choices: (list.length ? list : options).map((f) => [f.id, f.label]),
      })),
    };
  }
  const [x, y] = chosen
    ? chosen.map((id) => options.find((f) => f.id === id))
    : matches.map((list) => list[0]);
  if (
    !x ||
    !y ||
    x === y ||
    y.type === "multiple" ||
    (chart === "stack" && x.type === "multiple")
  )
    return null;
  if (
    within &&
    within.toLowerCase() !== "group" &&
    !tokens(within).every((t) => tokens(y.label).includes(t))
  )
    return null;
  if (chart === "stack" && /count|number/i.test(unit || "")) return null;
  return {
    action: "draw",
    task: "group",
    chart,
    x: x.id,
    y: y.id,
    measure:
      chart === "stack" || /percent/i.test(unit || "") ? "percent" : "count",
  };
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
  const namedByChoices = (field, phrase) => {
    const words = tokens(phrase);
    const choices = answerWords(field);
    return (
      words.length &&
      words.every((word) => choices.has(word)) &&
      !words.every((word) => tokens(field.label).includes(word))
    );
  };
  const firstIsGroup =
    (second[0].type === "ordered" && first[0].type !== "ordered") ||
    (first[0].type === second[0].type &&
      namedByChoices(first[0], pair[1]) &&
      !namedByChoices(second[0], pair[2]));
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
  const results = axisChoices(options, value);
  return results.length === 1 ? results[0].id : value;
}

// Enforce an explicitly requested visual in a draw instruction. Recommendations
// and comparative questions about several chart types still go to the tutor.
export function namedChartRequest(question) {
  const commands = [
    ...question
      .trim()
      .matchAll(
        /(?:^|[.!?]\s+)(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:draw|create|make|show|plot|build)\s+(?:me\s+)?(?:a |an |the )?(100% stacked bar(?: chart)?s?|stacked bar(?: chart)?s?|bar (?:chart|plot)|dot plot|heat\s?map|scatter\s?plot|histogram|presence (?:grid|matrix)|line (?:chart|graph)|small multiples|data table)\b/gi,
      ),
  ];
  if (commands.length !== 1) return;
  const name = commands[0][1].toLowerCase();
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

// Recognise a student's stated unit before the model chooses a display. Resolve
// a list locally only when every named item has exactly one match.
export function patternRequest(question, text, choices, current) {
  if (
    !/^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:show|make|draw|create|plot|build|compare)\b/i.test(
      question.trim(),
    ) ||
    /\b(?:excluding|except|among|filter|only|weighted|regression|control for|instead of)\b/i.test(
      question,
    )
  )
    return null;
  const mentioned = text
    ? [
        ["passages", /\bsame (?:coded )?(?:passages?|excerpts?|segments?)\b/i],
        ["interviews", /\bsame (?:interviews?|transcripts?)\b/i],
        ["sources", /\b(?:each|per|by) (?:interview|transcript)\b/i],
      ]
    : [
        [
          "together",
          /\bsame (?:people|respondents?|persons?)\b|\b(?:answer combinations|combinations of answers)\b/i,
        ],
        [
          "separate",
          /\beach (?:question|item) (?:overall|separately|on its own)\b/i,
        ],
      ];
  const modes = mentioned.filter(([, pattern]) => pattern.test(question));
  if (modes.length !== 1) return null;
  const patternMode = modes[0][0];
  const named = text
    ? question.match(
        /\b(?:themes|codes)\s+(.+?)\s+(?:appear|turn up|occur|show up|come up|in the same)\b/i,
      )?.[1]
    : question.match(/\bfor\s+(.+)$/i)?.[1];
  const result = { patternMode };
  if (named) {
    // Match ordinary word forms against the actual question label.
    const wordMatches = (word, labelWord) =>
      word === labelWord ||
      (word.endsWith("ed") &&
        [word.slice(0, -1), word.slice(0, -2)].includes(labelWord)) ||
      (/(ance|ence)$/.test(word) && word.slice(0, -2) + "t" === labelWord);
    const matched = named
      .replace(/[?.!]+$/, "")
      .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
      .map((term) => {
        const exact = choices.filter(
          ([, label]) => label.toLowerCase() === term.trim().toLowerCase(),
        );
        if (exact.length === 1) return exact[0][0];
        const query = tokens(term);
        const found = choices.filter(
          ([, label]) =>
            query.length &&
            query.every((word) =>
              tokens(label).some((labelWord) => wordMatches(word, labelWord)),
            ),
        );
        return found.length === 1 ? found[0][0] : null;
      });
    if (
      matched.length >= 2 &&
      matched.every(Boolean) &&
      new Set(matched).size === matched.length
    )
      result.items = matched;
  } else if (
    current?.task === "patterns" &&
    current.items?.length >= 2 &&
    /\b(?:these|selected|ticked) (?:questions|items|themes|codes)\b/i.test(
      question,
    ) &&
    !/\b(?:add|also|except|plus|without|along with)\b/i.test(question) &&
    !choices.some(
      ([id, label]) =>
        !current.items.includes(id) &&
        question.toLowerCase().includes(label.toLowerCase()),
    )
  )
    result.items = current.items;
  return result;
}

// Resolve an explicit grouping separately from the questions or codes to count.
export function groupingRequest(question, groups, current, text) {
  const q = question.trim().replace(/[?!.]+$/, "");
  if (
    /\b(?:why|caus\w*|only|excluding|except|adjust|control for|instead of)\b/i.test(
      q,
    )
  )
    return null;
  const generic =
    current?.task === "patterns" &&
    /^(?:(?:do|are|can you compare) )?(?:these|the selected) (?:themes|patterns|answers) (?:come up more|appear more often|differ|vary|more common|by group)(?: in one group(?: of interviewees| of respondents)?(?: than (?:another|the other))?| between groups| across groups)?$/i.test(
      q,
    );
  if (generic) {
    const group =
      groups.find(([id]) => id === current.groupBy) ||
      (groups.length === 1 && groups[0]);
    return {
      reuse: true,
      before: q,
      groupBy: group?.[0],
      clarification: group
        ? ""
        : groups.length
          ? "Which grouping should I use? " +
            groups.map(([, s]) => s).join(", ") +
            "."
          : text
            ? "Choose Add interview groups and enter a group for each interview first."
            : "Add a separate grouping column to compare the selected questions.",
    };
  }
  const match = q.match(
    /\s+(?:by|according to|across(?: different)?)\s+(?:their |the )?(.+?)$/i,
  );
  if (
    !match ||
    !(
      current?.task === "patterns" ||
      /\b(?:patterns?|themes?|same (?:three |two )?questions|these questions|same people|combinations)\b/i.test(
        q,
      )
    )
  )
    return null;
  const name = match[1].trim(),
    lower = name.toLowerCase(),
    words = tokens(name);
  const exact = groups.filter(
    ([id, label]) => id === name || label.toLowerCase() === lower,
  );
  const matches = exact.length
    ? exact
    : groups.filter(
        ([, label]) =>
          words.length && words.every((w) => tokens(label).includes(w)),
      );
  const before = q.slice(0, match.index).trim();
  const reuse =
    /^(?:do|does|are) (?:the )?(?:answers to )?(?:the same|these|the selected) (?:two |three |four |five |six )?(?:questions|answers|themes|patterns) (?:differ|vary|different|more common|come up more|appear more often)$/i.test(
      before,
    ) ||
    /^(?:(?:can|could|would) (?:you|we) |please )?(?:(?:show|split|break down|compare|group|separate)(?: me)?(?: (?:this|it|these|that|them|the same|the selected|my selected)(?:\s+(?:two|three|four|five|six|selected|answer|coded|survey|interview|questions?|answers?|patterns?|themes?|results?|figure|chart|responses?))*)?(?: (?:split|broken down|grouped))?|(?:do|does|are) (?:these|the same|these selected) (?:answers|themes|patterns|questions) (?:differ|different|vary))$/i.test(
      before,
    );
  return {
    name,
    before,
    groupBy: matches.length === 1 ? matches[0][0] : null,
    reuse,
    clarification:
      matches.length === 1
        ? ""
        : groups.length
          ? "Which grouping did you mean by “" +
            name +
            "”? Choose from " +
            (matches.length ? matches : groups)
              .slice(0, 12)
              .map(([, s]) => "“" + s + "”")
              .join(", ") +
            "."
          : text
            ? "Open Look across several themes and choose Add interview groups. Give each interview a group, then ask me again."
            : "There is no suitable grouping column for these selected questions. Choose a separate column that records group membership.",
  };
}
