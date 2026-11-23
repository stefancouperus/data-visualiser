import {
  axisBottom,
  axisTop,
  format,
  interpolateRgb,
  quantileSorted,
  scaleLinear,
} from "d3";

export function supportsBoxPlot(x, y, task) {
  return (
    x?.type === "number" &&
    !x.roles?.includes("open") &&
    (task === "one" ||
      (["two", "group"].includes(task) &&
        ["category", "ordered"].includes(y?.type) &&
        !y.roles?.includes("open")))
  );
}

export function boxPlotSummary(base, rows, view, x, y) {
  if (!supportsBoxPlot(x, y, view.task))
    throw Error(
      "Choose a numerical question. To compare groups, also choose a question with single-answer categories.",
    );
  const split = view.task !== "one";
  const grouped = new Map();
  let valid = 0;
  for (const row of rows) {
    const group = split ? String(row[y.id] ?? "").trim() : "";
    if (split && !group) continue;
    if (!grouped.has(group)) grouped.set(group, []);
    const raw = String(row[x.id] ?? "").trim();
    const number = Number(raw);
    if (raw && Number.isFinite(number)) {
      grouped.get(group).push(number);
      valid++;
    }
  }
  const order = split
    ? [...new Set([...(y.levels || []), ...grouped.keys()])].filter((g) =>
        grouped.has(g),
      )
    : [...grouped.keys()];
  const records = order.map((group) => {
    const sorted = grouped.get(group).sort((a, b) => a - b);
    const median = quantileSorted(sorted, 0.5) ?? null;
    return {
      group,
      label: group || "All selected records",
      n: sorted.length,
      value: median,
      minimum: sorted[0] ?? null,
      lowerQuartile: quantileSorted(sorted, 0.25) ?? null,
      median,
      upperQuartile: quantileSorted(sorted, 0.75) ?? null,
      maximum: sorted.at(-1) ?? null,
    };
  });
  return {
    ...base,
    title: view.title || (split ? x.label + " by " + y.label : x.label),
    unit: "Numerical answers",
    records,
    note:
      valid +
      " of " +
      rows.length +
      " selected records have a numerical answer" +
      (split ? " and a recorded group" : "") +
      ". The box spans the middle half of answers. " +
      "The centre mark shows the median. The ends show the lowest and highest observed answers.",
  };
}

const numberLabel = format(".5~g");

export function drawBoxPlot({
  root,
  records,
  width,
  margin,
  pos,
  theme,
  style,
  markInk,
  paper,
  line,
  wrap,
}) {
  const valid = records.filter((r) => r.n);
  const minimum = valid.reduce((v, r) => Math.min(v, r.minimum), Infinity);
  const maximum = valid.reduce((v, r) => Math.max(v, r.maximum), -Infinity);
  const x = scaleLinear()
    .domain([minimum, maximum])
    .range([margin + 12, width - margin - 12]);
  if (valid.length && minimum === maximum) {
    const pad = Math.max(1, Math.abs(minimum) * 0.05);
    x.domain([minimum - pad, maximum + pad]);
  }
  if (valid.length) x.nice(theme.ticks);
  if (valid.length > 3) {
    pos += 12;
    root
      .append("g")
      .attr("transform", "translate(0," + pos + ")")
      .call(axisTop(x).ticks(theme.ticks));
    pos += 24;
  }
  for (const [i, r] of records.entries()) {
    const label =
      r.label +
      (r.n
        ? "  ·  n = " + r.n + "  ·  median " + numberLabel(r.median)
        : "  ·  no numerical answers");
    for (const part of wrap(
      label,
      Math.max(12, Math.floor((width - margin * 2) / (7.5 * theme.scale))),
    )) {
      line(part, margin, pos, 13, true);
      pos += 13 * theme.scale + 5;
    }
    if (!r.n) continue;
    const mid = pos + 6,
      half = Math.max(7, theme.bar / 2),
      ink = markInk(i, r.label);
    const g = root.append("g").attr("class", "box-plot-mark");
    g.append("title").text(
      r.label +
        " (" +
        r.n +
        "): minimum " +
        numberLabel(r.minimum) +
        ", lower quartile " +
        numberLabel(r.lowerQuartile) +
        ", median " +
        numberLabel(r.median) +
        ", upper quartile " +
        numberLabel(r.upperQuartile) +
        ", maximum " +
        numberLabel(r.maximum),
    );
    const stroke = (a, b, c, d, weight = 1.5, colour = ink) =>
      g
        .append("line")
        .attr("x1", a)
        .attr("y1", b)
        .attr("x2", c)
        .attr("y2", d)
        .attr("stroke", colour)
        .attr("stroke-width", weight);
    stroke(x(r.minimum), mid, x(r.maximum), mid);
    for (const end of [r.minimum, r.maximum])
      stroke(x(end), mid - half * 0.7, x(end), mid + half * 0.7);
    g.append("rect")
      .attr("x", x(r.lowerQuartile))
      .attr("y", mid - half)
      .attr("width", Math.max(0, x(r.upperQuartile) - x(r.lowerQuartile)))
      .attr("height", half * 2)
      .attr(
        "fill",
        interpolateRgb(paper, ink)(style === "report" ? 0.12 : 0.28),
      )
      .attr("stroke", ink)
      .attr("stroke-width", 1.5);
    stroke(
      x(r.median),
      mid - half - 2,
      x(r.median),
      mid + half + 2,
      3,
      "#20262d",
    );
    pos = mid + half + 21;
  }
  if (!valid.length) return pos;
  root
    .append("g")
    .attr("transform", "translate(0," + pos + ")")
    .call(axisBottom(x).ticks(theme.ticks));
  return pos + 35;
}
