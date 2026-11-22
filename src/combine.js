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
    result.rows.push(
      ...rightRows.map((r) =>
        Object.fromEntries(
          left.fields.map((f) => [f.id, r[byName.get(f.raw).id]]),
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
    for (const r of result.rows) {
      const paired = map.get(r[keyLeft]);
      for (const f of added) r[f.id] = paired?.[f.old] || "";
    }
    result.fields.push(...added);
    result.matchCount = result.rows.filter((r) => map.has(r[keyLeft])).length;
  }
  for (const f of result.fields)
    f.levels = [
      ...new Set([
        ...(f.type === "ordered" ? f.levels : []),
        ...result.rows.map((r) => r[f.id]).filter(Boolean),
      ]),
    ];
  return result;
}
