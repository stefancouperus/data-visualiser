import { color, interpolateRgb } from "d3";

function interactiveWord(mark, record, interactive) {
  const count = record.n + (record.n === 1 ? " occurrence" : " occurrences");
  if (interactive)
    mark
      .attr("data-cloud-word", record.label)
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("cursor", "pointer")
      .attr(
        "aria-label",
        record.label + ", " + count + ". Read matching passages.",
      );
  mark.append("title").text(record.label + " · " + count);
}

// Centre the most frequent words and pack the others around them in horizontal
// lines. Each word keeps the size set by its count, including ties.
export function drawWordCloud({
  root,
  records,
  w,
  margin,
  pos,
  theme,
  ink,
  interactive,
}) {
  if (!records.length) return pos;
  const available = w - 2 * margin,
    gap = 13;
  const ctx = document.createElement("canvas").getContext("2d");
  const largest = records[0].n,
    smallest = records.at(-1).n;
  const rows = [];
  for (const [i, r] of records.entries()) {
    const weight =
      largest === smallest
        ? 0.48
        : (Math.sqrt(r.n) - Math.sqrt(smallest)) /
          (Math.sqrt(largest) - Math.sqrt(smallest));
    const size = (17 + 35 * weight) * theme.scale;
    ctx.font = "600 " + size + "px " + theme.font;
    const rawWidth = ctx.measureText(r.label).width;
    const width = Math.min(rawWidth, available);
    let row = rows.find(
      (candidate) => candidate.width + gap + width <= available,
    );
    if (!row) {
      row = { words: [], width: 0, height: 0 };
      rows.push(row);
    }
    const word = { r, size, width, rawWidth, i };
    if (row.words.length % 2 === 1) row.words.unshift(word);
    else row.words.push(word);
    row.width += (row.words.length > 1 ? gap : 0) + width;
    row.height = Math.max(row.height, size);
  }
  const arranged = [];
  for (const [i, row] of rows.entries()) {
    if (i % 2 === 1) arranged.unshift(row);
    else arranged.push(row);
  }
  for (const row of arranged) {
    pos += row.height;
    let x = (w - row.width) / 2;
    for (const { r, size, width, rawWidth, i } of row.words) {
      // Darken light palette swatches so words stay legible on the figure paper.
      const colour = color(ink(i, r.label)).rgb();
      const textInk =
        colour.r * 0.299 + colour.g * 0.587 + colour.b * 0.114 > 144
          ? interpolateRgb(colour, "#19232c")(0.44)
          : colour;
      const mark = root
        .append("text")
        .attr("class", "cloud-word")
        .attr("x", x + width / 2)
        .attr("y", pos)
        .attr("text-anchor", "middle")
        .attr("font-size", size)
        .attr("font-weight", 600)
        .attr("fill", textInk)
        .text(r.label);
      if (rawWidth > width)
        mark.attr("textLength", width).attr("lengthAdjust", "spacingAndGlyphs");
      interactiveWord(mark, r, interactive);
      x += width + gap;
    }
    pos += row.height * 0.23;
  }
  return pos + 8;
}

export function drawWordTable({
  root,
  records,
  w,
  margin,
  pos,
  theme,
  interactive,
  sourcesLabel,
}) {
  const countsX = [w * 0.59, w * 0.76, w - margin];
  function row(values, y, bold) {
    const line = root
      .append("g")
      .attr("font-size", theme.axis)
      .attr("font-weight", bold ? 650 : 400);
    for (const [index, value] of values.entries()) {
      const cell = line
        .append("text")
        .attr("x", index ? countsX[index - 1] : margin)
        .attr("y", y)
        .attr("text-anchor", index ? "end" : "start")
        .text(value);
      if (!index && !bold && value.length > 35) {
        cell
          .text(value.slice(0, 34) + "…")
          .append("title")
          .text(value);
      }
    }
    return line;
  }
  row(["Word", "Occurrences", "Passages", sourcesLabel], pos, true);
  pos += theme.row;
  for (const r of records) {
    const group = row(
      [r.label, r.n, r.passageCount, r.sourceCount],
      pos,
      false,
    );
    interactiveWord(group, r, interactive);
    pos += theme.row;
  }
  return pos;
}
