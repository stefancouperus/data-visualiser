import { filteredRows } from "./import.js";

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
    for (const p of d.passages) {
      if (!sources.has(p.source)) continue;
      passages++;
      if (p.reviewed) reviewed++;
      for (const code of new Set(p.codes)) {
        if (!counts.has(code)) counts.set(code, { n: 0, sources: new Set() });
        const count = counts.get(code);
        count.n++;
        count.sources.add(p.source);
      }
    }
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
  const rows = filteredRows(d).filter(
    (row) => !v.filter || row[v.filter] === v.value,
  );
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
