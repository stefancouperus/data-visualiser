function interactiveWord(mark, record, interactive) {
  const count = record.n + (record.n === 1 ? " occurrence" : " occurrences");
  if (interactive)
    mark
      .attr("data-counted-word", record.label)
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("cursor", "pointer")
      .attr(
        "aria-label",
        record.label + ", " + count + ". Read matching passages.",
      );
  mark.append("title").text(record.label + " · " + count);
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
