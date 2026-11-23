// A combined checkbox has null for a skipped question and "" for an answered
// question with no selected options. Other survey fields use "" for missing.
export function hasAnswer(row, field) {
  const value = row[field.id];
  return (
    value != null &&
    (value !== "" || (field.type === "multiple" && !!field.checkboxIndicators))
  );
}

export function displayedAnswer(row, field) {
  return field.type === "multiple" &&
    field.checkboxIndicators &&
    row[field.id] === ""
    ? "No options selected"
    : (row[field.id] ?? "");
}

export function choicesIn(value, field) {
  if (value == null || value === "") return [];
  if (field.type !== "multiple") return [String(value)];
  return [
    ...new Set(
      String(value)
        .split(field.separator || ";")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export function optionLevels(field) {
  return field?.type === "multiple"
    ? [...new Set(field.levels.flatMap((level) => choicesIn(level, field)))]
    : field?.levels || [];
}

export function matchesValue(row, field, value) {
  if (!field) return false;
  if (field.type !== "multiple") return row[field.id] === value;
  if (value === "") return !hasAnswer(row, field);
  return choicesIn(row[field.id], field).includes(value);
}

export function recordEligibility(table) {
  const rules = (table.rules || []).map((rule) => ({
    ...rule,
    column: table.fields.find((field) => field.id === rule.field),
  }));
  return (row) =>
    rules.every((rule) =>
      rule.mode === "option"
        ? !matchesValue(row, rule.column, rule.value)
        : (row[rule.field] ?? "") !== rule.value,
    );
}

export function fillCheckboxField(table, field, restoring = false) {
  const columns = field.checkboxIndicators.map((option) => ({
    ...option,
    selected: new Set(
      restoring &&
        option.rawSelected &&
        !table.fields.find((f) => f.id === option.id)?.answerLabels
        ? option.rawSelected
        : option.selected,
    ),
  }));
  for (const row of table.rows) {
    const recorded = columns.some(
      (option) => row[option.id] != null && row[option.id] !== "",
    );
    row[field.id] = recorded
      ? columns
          .filter((option) => option.selected.has(row[option.id]))
          .map((option) => option.label)
          .join(field.separator)
      : null;
  }
}

export function combineCheckboxes(table, id, label, markers) {
  const checkboxIndicators = table.fields
    .filter((field) => markers.has(field.id))
    .map((field) => ({
      id: field.id,
      label: field.label,
      selected: [...markers.get(field.id)],
      ...(field.answerLabels
        ? {
            rawSelected: field.answerLabels
              .filter(([, text]) => markers.get(field.id).has(text))
              .map(([raw]) => raw),
          }
        : {}),
    }));
  const levels = checkboxIndicators.map((option) => option.label);
  if (levels.length < 2) throw Error("Choose at least two answer columns.");
  if (new Set(levels).size !== levels.length)
    throw Error(
      "Give the answer columns different labels so their selections can be counted separately.",
    );
  let separator = " | ";
  while (levels.some((level) => level.includes(separator))) separator += "| ";
  const field = {
    id,
    label,
    raw: label,
    type: "multiple",
    levels,
    separator,
    checkboxIndicators,
  };
  fillCheckboxField(table, field);
  table.fields.push(field);
  return field;
}

// Earlier downloads retained the original indicator columns alongside the
// combined string. Recover the missingness distinction only when the match
// between original columns, selected values and existing answers is unambiguous.
export function restoreLegacyCheckboxes(table) {
  for (const field of table.fields) {
    if (
      field.type !== "multiple" ||
      field.checkboxIndicators ||
      !/^m[\da-f-]{36}$/i.test(field.id) ||
      field.separator !== " | " ||
      !field.levels.length ||
      field.levels.some((label) => label.includes(field.separator)) ||
      new Set(field.levels).size !== field.levels.length
    )
      continue;
    const columns = field.levels.map((label) =>
      table.fields.filter((f) => f !== field && f.label === label),
    );
    if (columns.some((matches) => matches.length !== 1)) continue;
    const picks = table.rows.map(
      (row) => new Set(choicesIn(row[field.id], field)),
    );
    const offered = new Set(field.levels);
    if (
      picks.some((choices) =>
        [...choices].some((choice) => !offered.has(choice)),
      )
    )
      continue;
    const options = columns.map(([column]) => {
      const selected = new Set(
        table.rows
          .filter((row, i) => picks[i].has(column.label))
          .map((row) => row[column.id]),
      );
      return { id: column.id, label: column.label, selected: [...selected] };
    });
    if (
      !options.every((option) =>
        table.rows.every(
          (row, i) =>
            picks[i].has(option.label) ===
            option.selected.includes(row[option.id]),
        ),
      )
    )
      continue;
    field.checkboxIndicators = options;
    fillCheckboxField(table, field);
  }
}
// A group gives each record one place in a comparison. Individual checkbox
// indicator columns can do this, while their combined multiple-answer field cannot.
export function isSingleAnswerField(field) {
  return (
    ["category", "ordered", "number", "date"].includes(field?.type) &&
    !field.roles?.includes("open")
  );
}

export function groupingQuestionHint(field) {
  if (field?.type === "multiple") {
    return (
      "People can tick several answers to “" +
      field.label +
      "”. Choose a single-answer question to form groups, or use an individual option column if your file has one."
    );
  }
  return "Choose a single-answer question to form groups. If you have no other suitable column, choose a different first question or explore one question.";
}
