import { bisectRight, extent, ticks } from "d3";

// Use the full field's range so a filter never changes which band a score belongs to.
// Survey fields receive a new levels array when their data or labels change.
const byLevels = new WeakMap();

export function numberBands(field) {
  if (field?.type !== "number" || field.levels.length <= 30) return null;
  if (byLevels.has(field.levels)) return byLevels.get(field.levels);
  const values = field.levels.map(Number);
  if (!values.every(Number.isFinite)) return null;
  const [low, high] = extent(values);
  const cuts = ticks(low, high, 6).filter((n) => n > low && n < high);
  const bounds = [low, ...cuts, high];
  const integral =
    values.every(Number.isInteger) && cuts.every(Number.isInteger);
  const labels = bounds.slice(1).map((end, index) => {
    const start = bounds[index];
    const last = index === cuts.length;
    if (integral) {
      const stop = last ? end : end - 1;
      return start === stop ? String(start) : start + "–" + stop;
    }
    return start + (last ? " to " : " to <") + end;
  });
  const bands = {
    labels,
    forValue: (value) => labels[bisectRight(cuts, Number(value))],
  };
  byLevels.set(field.levels, bands);
  return bands;
}

export function surveyGroupReader(field) {
  const bands = numberBands(field);
  return (row) => {
    const raw = String(row[field.id] ?? "").trim();
    return bands && raw && Number.isFinite(Number(raw))
      ? bands.forValue(raw)
      : raw;
  };
}

export function orderedGroups(field, observed) {
  const bands = numberBands(field);
  const levels = bands?.labels ?? [
    ...new Set([...field.levels, ...(observed || [])]),
  ];
  if (!bands && field.type === "number")
    levels.sort((a, b) => Number(a) - Number(b));
  return observed ? levels.filter((key) => observed.has(key)) : levels;
}
