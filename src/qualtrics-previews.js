// Qualtrics exports its Status metadata as a label or an integer. Only these two
// statuses mean preview; e.g. "Survey Test" and "Imported" are separate types.
const previewStatus = /^(?:survey preview|offline preview|1|17)$/i;

export function qualtricsPreviews(d) {
  if (!d?.qual) return;
  const metadata = (name) =>
    d.fields.find(
      (f) =>
        String(f.raw || "")
          .trim()
          .toLowerCase() === name,
    );
  const statusField = metadata("status");
  const field = statusField || metadata("distributionchannel");
  const recognised = statusField ? previewStatus : /^preview$/i;
  if (!field) return;
  const values = new Set();
  let count = 0;
  for (const row of d.rows) {
    const status = row[field.id];
    if (!recognised.test(status)) continue;
    values.add(status);
    count++;
  }
  if (!count) return;
  const excluded = new Set(
    (d.rules || [])
      .filter((rule) => rule.field === field.id && values.has(rule.value))
      .map((rule) => rule.value),
  );
  const decision =
    excluded.size === values.size
      ? "exclude"
      : !excluded.size && d.previewDecision === "keep"
        ? "keep"
        : "";
  return { field: field.id, values, count, decision };
}

export function setPreviewDecision(d, decision) {
  const preview = qualtricsPreviews(d);
  if (!preview || !["keep", "exclude"].includes(decision)) return;
  d.rules = (d.rules || []).filter(
    (rule) => rule.field !== preview.field || !preview.values.has(rule.value),
  );
  if (decision === "exclude") {
    for (const value of preview.values)
      d.rules.push({ field: preview.field, value });
  }
  d.previewDecision = decision;
  return preview.count;
}
