import { filteredRows } from "./import.js";
import { hasAnswer, optionLevels } from "./survey-answers.js";

// A comparison needs two groups with valid answers under the current filters.
// The codebook can legitimately contain additional, currently unobserved groups.
export function gapGroups(table, view, selectedRows) {
  if (table?.kind !== "table" || view.task !== "group" || view.x === view.y)
    return [];
  const answer = table.fields.find((f) => f.id === view.x);
  const group = table.fields.find((f) => f.id === view.y);
  if (
    ![answer, group].every(
      (f) =>
        f &&
        ["category", "ordered"].includes(f.type) &&
        !f.roles?.includes("open"),
    )
  )
    return [];
  const rows =
    selectedRows ??
    (view.filter || table.rules?.length
      ? filteredRows(table, view)
      : table.rows);
  const groups = new Set();
  for (const row of rows) {
    if (!hasAnswer(row, group) || !hasAnswer(row, answer)) continue;
    groups.add(row[group.id]);
    if (groups.size > 2) return [];
  }
  if (groups.size !== 2) return [];
  return [
    ...new Set([
      ...optionLevels(group).filter((key) => groups.has(key)),
      ...groups,
    ]),
  ];
}

// The symbol and the position of its label both identify the group, including
// in greyscale exports and when both marks fall on exactly the same percentage.
export function drawGap(
  root,
  {
    records,
    groups,
    named,
    width,
    margin,
    pos,
    palette,
    paper,
    scale,
    wrap,
    line,
  },
) {
  const byGroup = groups.map((group) => new Map());
  const indices = new Map(groups.map((group, i) => [group, i]));
  for (const record of records)
    byGroup[indices.get(record.group)].set(record.label, record);
  const labels = [...byGroup[0].keys()];
  const left = margin + 24 * scale,
    right = width - left;
  const at = (value) => left + ((right - left) * value) / 100;
  const round = (value) => +value.toFixed(1);
  const mark = (index, x, y) => {
    if (index === 0) {
      return root
        .append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 7 * scale)
        .attr("fill", paper)
        .attr("stroke", palette[0])
        .attr("stroke-width", 2.5);
    }
    const radius = 5 * scale;
    return root
      .append("path")
      .attr(
        "d",
        `M${x} ${y - radius}l${radius} ${radius}l${-radius} ${radius}l${-radius} ${-radius}Z`,
      )
      .attr("fill", palette[1])
      .attr("stroke", paper)
      .attr("stroke-width", 0.7);
  };
  for (const [i, group] of groups.entries()) {
    const denominator = byGroup[i].get(labels[0]).den;
    mark(i, margin + 7 * scale, pos - 4 * scale);
    for (const text of wrap(
      named("groups", group) + " (n = " + denominator + ")",
      Math.floor((width - 75) / (8 * scale)),
    )) {
      line(text, margin + 22 * scale, pos, 14, true);
      pos += 20 * scale;
    }
  }
  pos += 6;
  for (const tick of [0, 50, 100])
    line(tick + "%", at(tick), pos, 11).attr("text-anchor", "middle");
  pos += 18 * scale;
  for (const label of labels) {
    const [a, b] = byGroup.map((values) => values.get(label));
    const difference = round(Math.abs(a.value - b.value));
    const gap =
      difference === 0 && a.value !== b.value
        ? "less than 0.1 percentage points"
        : difference +
          (difference === 1 ? " percentage point" : " percentage points");
    for (const text of wrap(
      named("labels", label) + " · gap of " + gap,
      Math.floor((width - 2 * margin) / (8 * scale)),
    )) {
      line(text, margin, pos, 14, true);
      pos += 17 * scale;
    }
    const y = pos + 10 * scale;
    root
      .append("line")
      .attr("x1", left)
      .attr("x2", right)
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", "#b8bfc6")
      .attr("stroke-width", 1);
    root
      .append("line")
      .attr("x1", at(a.value))
      .attr("x2", at(b.value))
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", "#617078")
      .attr("stroke-width", 3.5 * scale);
    for (const [i, r] of [a, b].entries()) {
      const x = at(r.value),
        percent = round(r.value) + "%";
      mark(i, x, y)
        .append("title")
        .text(
          named("groups", r.group) +
            " · " +
            named("labels", r.label) +
            " · " +
            percent +
            " (" +
            r.n +
            " of " +
            r.den +
            ")",
        );
      line(percent, x, y + (i === 0 ? -10 : 20) * scale, 12).attr(
        "text-anchor",
        "middle",
      );
    }
    pos = y + 42 * scale;
  }
  return pos;
}
