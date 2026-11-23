import { filteredRows } from "./import.js";

function indexedRows(table, key) {
  const rows = new Map();
  for (const row of filteredRows(table)) {
    const id = row[key];
    if (!id) continue;
    if (rows.has(id)) throw Error("Repeated identifier in the table: " + id);
    rows.set(id, row);
  }
  return rows;
}

export function linkage(d, table, key, matches) {
  if (d.kind !== "text" || table.kind !== "table")
    throw Error("Choose a text collection and a table.");
  const rows = indexedRows(table, key);
  const fields = table.fields.filter((f) => f.id !== key);
  const attributes = Object.create(null);
  for (const source of d.sources) {
    const row = rows.get(matches[source]);
    if (row)
      attributes[source] = Object.fromEntries(
        fields.map((f) => [f.label, row[f.id]]),
      );
  }
  return attributes;
}

// Older projects saved only the visible grouping values. Let the student
// identify which matching values came from the table before removing any.
export function reviewParticipantLinks(d, table, key) {
  const state = d.participantLinks;
  const saved = state?.tables.find((item) => item.id === table.id);
  const rows = indexedRows(table, key);
  const legacy = !state || state.legacyTables?.includes(table.id);
  const fields = table.fields.filter((f) => f.id !== key);
  const previousValues = [];
  const matches = Object.create(null);
  const byValues = new Map();
  if (legacy) {
    for (const row of rows.values()) {
      const attributes = fields.map((f) => row[f.id]);
      if (!attributes.some(Boolean)) continue;
      const signature = JSON.stringify(attributes);
      const entries = byValues.get(signature) || [];
      entries.push(row);
      byValues.set(signature, entries);
    }
  }
  for (const source of d.sources) {
    if (saved?.key === key && Object.hasOwn(saved.matches, source)) {
      matches[source] = saved.matches[source];
      continue;
    }
    matches[source] = rows.has(source) ? source : "";
    if (!legacy || !Object.hasOwn(d.metadata || {}, source)) continue;
    const values = d.metadata[source];
    const same = (row, f) =>
      Object.hasOwn(values, f.label) && values[f.label] === row[f.id];
    const signature = JSON.stringify(fields.map((f) => values[f.label]));
    const candidates = byValues.get(signature) || [];
    // A filename may never have been used as the row identifier.
    if (candidates.length === 1) matches[source] = candidates[0][key];
    const oldRow = candidates[0] || rows.get(source);
    for (const f of fields.filter((f) => Object.hasOwn(values, f.label)))
      previousValues.push({
        source,
        field: f.label,
        value: values[f.label],
        suggested: Boolean(oldRow && same(oldRow, f)),
      });
  }
  return { identifiers: [...rows.keys()], matches, previousValues };
}

export function applyParticipantLinks(
  d,
  table,
  key,
  matches,
  previousValues,
  tableIds,
) {
  // Validate every identifier before changing the dataset.
  const values = linkage(d, table, key, matches);
  const old = d.participantLinks;
  const tables = old?.tables || [];
  const base = Object.fromEntries(
    Object.entries(d.metadata || {}).map(([source, attrs]) => [
      source,
      { ...attrs },
    ]),
  );
  // Strip the previous overlays. Independent values added in the meantime
  // remain in base, including manual groupings and new interview sources.
  for (const layer of tables)
    for (const [source, fields] of Object.entries(layer.values)) {
      for (const name of Object.keys(fields)) {
        if (Object.hasOwn(old.base?.[source] || {}, name))
          base[source][name] = old.base[source][name];
        else delete base[source][name];
      }
    }
  for (const { source, field } of previousValues) delete base[source][field];

  const layers = tables.filter((layer) => layer.id !== table.id);
  layers.push({ id: table.id, key, matches, values });
  const metadata = Object.assign(Object.create(null), base);
  for (const layer of layers)
    for (const [source, attrs] of Object.entries(layer.values))
      metadata[source] = { ...metadata[source], ...attrs };
  const legacyTables = (old ? old.legacyTables || [] : tableIds).filter(
    (id) => id !== table.id,
  );
  d.participantLinks = { base, tables: layers, legacyTables };
  d.metadata = metadata;
  return Object.keys(values).length;
}
