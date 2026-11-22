import { optionLevels } from "./survey-answers.js";

// Match filter actions only to fields and values the student can select in this project.
const normal = (value) =>
  String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’'"]/g, "")
    .replace(/[-‐‑–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function options(d) {
  if (d.kind === "table")
    return d.fields
      .filter(
        (f) =>
          f.type !== "metadata" &&
          !f.roles?.includes("open") &&
          f.levels.length,
      )
      .map((f) => ({ key: f.id, name: f.label, values: optionLevels(f) }));
  const records = Object.values(d.metadata || {});
  return [
    { key: "source", name: "Source", values: d.sources },
    ...[...new Set(records.flatMap(Object.keys))].map((key) => ({
      key,
      name: key,
      values: [...new Set(records.map((r) => r[key]).filter(Boolean))],
    })),
  ];
}
export function filterRequest(d, question) {
  const instruction = question
    .trim()
    .replace(/^(?:(?:could|can|would) you\s+)?(?:please\s+)?/i, "")
    .replace(/[.!?]+$/, "");
  if (
    /^(?:clear|remove|reset) (?:the |my |this )?(?:view |chart )?filter$|^show (?:all|every) (?:records|responses|respondents|interviews|sources) again$/i.test(
      instruction,
    )
  )
    return { filter: "", value: "", name: "" };
  const command = instruction.match(
    /^(?:show (?:that|this|it|the (?:chart|visual|figure)|me)?\s*(?:just|only) (?:for |the )?|keep (?:just |only )|filter (?:the (?:chart|visual|view)|this|that|it) to |filter (?:by )?)(.+)$/i,
  );
  if (!command) return null;
  // A follow-up may explicitly request that the existing units stay in place.
  const target = command[1]
    .replace(
      /\.\s*keep (?:the )?(?:percentages|counts) (?:within [^.!?]+? )?and update (?:my|the) (?:visual|chart)$/i,
      "",
    )
    .replace(/\s+(?:in|on) (?:the|this|my) (?:chart|visual|figure)$/i, "")
    .trim();
  const parts = target.match(/^(.+?)\s*(?:=|\s+to\s+)\s*(.+)$/i);
  const phrase = normal(parts ? parts[2] : target);
  const fields = options(d);
  const matches = [];
  for (const field of fields) {
    if (parts && normal(field.name) !== normal(parts[1])) continue;
    const end = normal(field.name).split(" ").at(-1);
    for (const value of field.values) {
      const v = normal(value);
      if (!v) continue;
      if (
        phrase === v ||
        phrase === v + " " + end ||
        phrase === v + " " + end + "s"
      )
        matches.push({ filter: field.key, value, name: field.name });
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1)
    return {
      message:
        "Which question should supply the filter? " +
        [...new Set(matches.map((m) => m.name))]
          .map((n) => "“" + n + "”")
          .join(" or ") +
        ". You can say “Filter " +
        matches[0].name +
        " to " +
        matches[0].value +
        "”.",
    };
  return {
    message:
      "Which question and answer should I keep? Use “Filter [question] to [answer]” with the wording from your project.",
  };
}
