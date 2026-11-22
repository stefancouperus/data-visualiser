import { optionLevels, choicesIn } from "./survey-answers.js";
import { uid, filteredRows } from "./import.js";
export function combineTables(left, right, mode, keyLeft, keyRight) {
  const result = structuredClone(left);
  result.rows = structuredClone(filteredRows(left));
  result.rules = [];
  const rightRows = filteredRows(right);
  result.id = uid();
  result.name = left.name + " + " + right.name;
  const requireUnique = (list, label) => {
    if (list.some((s) => !s) || new Set(list).size !== list.length)
      throw Error("Choose complete, unique " + label + ".");
  };
  if (mode === "append") {
    const names = left.fields.map((f) => f.raw),
      byName = new Map(right.fields.map((f) => [f.raw, f]));
    requireUnique(names, "column names");
    if (
      right.fields.length !== names.length ||
      names.some((n) => !byName.has(n))
    )
      throw Error(
        "Appending requires the same named columns. Original tables remain available.",
      );
    for (const field of result.fields.filter((f) => f.type === "multiple")) {
      field.levels = [
        ...new Set([
          ...optionLevels(field),
          ...optionLevels(byName.get(field.raw)),
        ]),
      ];
    }
    result.rows.push(
      ...rightRows.map((r) =>
        Object.fromEntries(
          left.fields.map((f) => {
            const origin = byName.get(f.raw);
            const value = r[origin.id];
            if (f.type !== "multiple") return [f.id, value];
            if (!value)
              return [
                f.id,
                origin.checkboxIndicators && value === "" ? "" : null,
              ];
            return [f.id, choicesIn(value, origin).join(f.separator || ";")];
          }),
        ),
      ),
    );
  } else {
    requireUnique(
      rightRows.map((r) => r[keyRight]),
      "identifiers in the related table",
    );
    const map = new Map(rightRows.map((r) => [r[keyRight], r]));
    const added = right.fields
      .filter((f) => f.id !== keyRight)
      .map((f) => ({
        ...f,
        old: f.id,
        id: "j" + uid(),
        label: right.name + " · " + f.label,
        raw: right.name + " · " + f.raw,
      }));
    const joinedIDs = new Map(added.map((field) => [field.old, field.id]));
    joinedIDs.set(keyRight, keyLeft);
    for (const field of added) {
      if (field.checkboxIndicators)
        field.checkboxIndicators = field.checkboxIndicators.map((option) => ({
          ...option,
          id: joinedIDs.get(option.id),
        }));
    }
    for (const r of result.rows) {
      const paired = map.get(r[keyLeft]);
      for (const f of added)
        r[f.id] = paired ? paired[f.old] : f.checkboxIndicators ? null : "";
    }
    result.fields.push(...added);
    result.matchCount = result.rows.filter((r) => map.has(r[keyLeft])).length;
  }
  for (const f of result.fields)
    f.levels = [
      ...new Set([
        ...(f.type === "ordered" || f.type === "multiple"
          ? optionLevels(f)
          : []),
        ...result.rows.flatMap((row) => choicesIn(row[f.id], f)),
      ]),
    ];
  return result;
}
