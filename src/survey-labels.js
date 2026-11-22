// Qualtrics question definitions contain simple HTML as well as plain text.
function wording(value) {
  const content = String(value ?? "")
    .replace(/<br\s*\/?\s*>|<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "");
  return content
    .replace(
      /&(#(?:x[\da-f]+|\d+)|amp|quot|apos|nbsp|lt|gt);/gi,
      (original, key) => {
        if (!key.startsWith("#"))
          return {
            amp: "&",
            quot: '"',
            apos: "'",
            nbsp: " ",
            lt: "<",
            gt: ">",
          }[key.toLowerCase()];
        const n =
          key[1]?.toLowerCase() === "x"
            ? parseInt(key.slice(2), 16)
            : Number(key.slice(1));
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : original;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function applyAnswerLabels(table, field, entries) {
  const lookup = new Map(entries);
  const values = new Set(
    table.rows.map((row) => row[field.id]).filter(Boolean),
  );
  if (!values.size) return false;
  const labels = new Set(lookup.values());
  if ([...values].every((value) => lookup.has(value))) {
    for (const row of table.rows) {
      if (lookup.has(row[field.id])) row[field.id] = lookup.get(row[field.id]);
    }
  } else if (![...values].every((value) => labels.has(value))) return false;
  const observed = new Set(table.rows.map((row) => row[field.id]));
  field.levels = [...labels].filter((label) => observed.has(label));
  field.answerLabels = entries;
  field.type = "category";
  return true;
}

export function labelledSurvey(table, definition) {
  if (!Array.isArray(definition?.SurveyElements))
    throw Error(
      "Choose the questionnaire exported from Qualtrics as a QSF file.",
    );
  const questions = new Map();
  for (const element of definition.SurveyElements) {
    const q = element.Payload;
    if (element.Element !== "SQ" || !q?.QuestionID) continue;
    for (const key of new Set(
      [q.DataExportTag, q.QuestionID].filter(Boolean),
    )) {
      questions.set(key, questions.has(key) ? null : q);
    }
  }
  const copy = structuredClone(table);
  let matched = 0,
    decoded = 0;
  const samples = [];
  for (const field of copy.fields) {
    if (field.type === "metadata") continue;
    const matrix = field.raw.match(/^(.+)_([^_]+)$/);
    const exact = questions.get(field.raw);
    const q = exact || (matrix && questions.get(matrix[1]));
    if (!q) continue;
    const stem = wording(q.QuestionText);
    const item = !exact && wording(q.Choices?.[matrix[2]]?.Display);
    if (!stem || (!exact && !item)) continue;
    const label = item ? stem + " — " + item : stem;
    // A named question in the export must agree with this questionnaire.
    if (
      field.label !== field.raw &&
      !wording(field.label).toLowerCase().startsWith(stem.toLowerCase())
    )
      continue;
    field.label = label;
    matched++;
    const single =
      exact && q.QuestionType === "MC" && /^(SA|DL$)/.test(q.Selector || "");
    const matrixScale =
      !exact &&
      q.QuestionType === "Matrix" &&
      q.Selector === "Likert" &&
      q.SubSelector === "SingleAnswer";
    const choices = single ? q.Choices : matrixScale ? q.Answers : null;
    if (choices) {
      const order =
        (single ? q.ChoiceOrder : q.AnswerOrder) || Object.keys(choices);
      const entries = order.map((id) => [
        String(q.RecodeValues?.[id] ?? id),
        wording(choices[id]?.Display),
      ]);
      if (
        entries.length &&
        entries.every(([, text]) => text) &&
        new Set(entries.map(([k]) => k)).size === entries.length &&
        new Set(entries.map(([, text]) => text)).size === entries.length &&
        !entries.some(([, text]) => /^[-+]?\d+(\.\d+)?$/.test(text)) &&
        applyAnswerLabels(copy, field, entries)
      ) {
        decoded++;
      }
    }
    if (field.levels.length && samples.length < 4)
      samples.push([field.label, field.levels.slice(0, 3).join(" · ")]);
  }
  if (!matched)
    throw Error(
      "No question matched this export. Choose the QSF for the same questionnaire, or export the responses with choice text.",
    );
  return { copy, matched, decoded, samples };
}
