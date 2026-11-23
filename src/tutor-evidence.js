import { filteredRows } from "./import.js";
import { passageUnits } from "./transcript-index.js";

function mentions(request, label) {
  if (!label) return false;
  const normalise = (text) =>
    " " +
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim() +
    " ";
  return normalise(request).includes(normalise(label));
}

// These are summaries of the selection used by this panel, including records
// beyond the preview limit. No original free-text answer is included here.
export function analyticalEvidence(d, v, question) {
  if (d.kind === "text") {
    const sources = new Set(
      d.sources.filter(
        (s) =>
          !v.filter ||
          (v.filter === "source" ? s : d.metadata?.[s]?.[v.filter]) === v.value,
      ),
    );
    const counts = new Map();
    let passages = 0,
      reviewed = 0;
    for (const p of passageUnits(
      d.passages.filter((p) => sources.has(p.source)),
    )) {
      passages++;
      if (p.reviewed) reviewed++;
      for (const code of new Set(p.codes)) {
        if (!counts.has(code)) counts.set(code, { n: 0, sources: new Set() });
        const count = counts.get(code);
        count.n++;
        count.sources.add(p.source);
      }
    }
    for (const entry of d.interviews?.established ? d.coding?.book || [] : [])
      if (!counts.has(entry.label))
        counts.set(entry.label, { n: 0, sources: new Set() });
    const requested = [...counts.keys()].filter(
      (code) => code === v.x || code === v.y || mentions(question, code),
    );
    const codes = [...new Set([...requested, ...counts.keys()])].slice(0, 120);
    return {
      listedSources: sources.size,
      importedPassages: passages,
      reviewedPassages: reviewed,
      codeCounts: codes.map((code) => ({
        code,
        matchingPassages: counts.get(code).n,
        distinctSourcesWithCode: counts.get(code).sources.size,
      })),
      totalCodes: counts.size,
    };
  }
  const fields = d.fields
    .filter(
      (f) =>
        f.type === "number" &&
        (f.id === v.x ||
          f.id === v.y ||
          mentions(question, f.label) ||
          mentions(question, f.raw)),
    )
    .slice(0, 8);
  if (!fields.length) return;
  const rows = filteredRows(d, v);
  const numericSummaries = fields.map((f) => {
    const values = rows
      .filter((row) => row[f.id] !== "" && Number.isFinite(Number(row[f.id])))
      .map((row) => Number(row[f.id]))
      .sort((a, b) => a - b);
    const n = values.length,
      middle = Math.floor(n / 2);
    return {
      question: f.label,
      valid: n,
      missingOrInvalid: rows.length - n,
      ...(n
        ? {
            min: values[0],
            max: values[n - 1],
            mean: values.reduce((sum, x) => sum + x, 0) / n,
            median:
              n % 2
                ? values[middle]
                : (values[middle - 1] + values[middle]) / 2,
          }
        : {}),
    };
  });
  return { selectedRecords: rows.length, numericSummaries };
}

export function pairedStatistics(points) {
  let n = 0,
    mx = 0,
    my = 0,
    sx = 0,
    sy = 0,
    c = 0;
  for (const { a, b } of points) {
    n++;
    const dx = a - mx,
      dy = b - my;
    mx += dx / n;
    my += dy / n;
    sx += dx * (a - mx);
    sy += dy * (b - my);
    c += dx * (b - my);
  }
  return {
    completePairs: n,
    pearsonR: n > 1 && sx > 0 && sy > 0 ? c / Math.sqrt(sx * sy) : null,
  };
}

// Rank the calculated categories across the whole chart, including cells beyond
// the display preview. Compare within-group shares when group sizes differ.
export function categoricalPattern(records) {
  if (
    !records.length ||
    !records.every((r) => r.den > 0 && Number.isFinite(r.n))
  )
    return;
  const ranges = new Map(),
    groups = new Set();
  let leader = null,
    ties = 0;
  for (const { group, label, n, den } of records) {
    const share = n / den,
      row = { group, label, n, den, share };
    groups.add(group);
    if (!leader || share > leader.share) {
      leader = row;
      ties = 1;
    } else if (share === leader.share) ties++;
    const range = ranges.get(label);
    if (!range) ranges.set(label, { low: row, high: row });
    else if (share < range.low.share) range.low = row;
    else if (share > range.high.share) range.high = row;
  }
  if (groups.size === 1)
    return { highestShare: leader, numberTiedForHighestShare: ties };
  let largest = null,
    gap = 0;
  for (const { low, high } of ranges.values()) {
    const delta = high.share - low.share;
    if (delta > gap) {
      gap = delta;
      largest = {
        label: low.label,
        lower: low,
        higher: high,
        percentagePointGap: 100 * delta,
      };
    }
  }
  return {
    groupsCompared: groups.size,
    largestObservedShareDifference: largest,
  };
}
