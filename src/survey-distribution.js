import { scaleLinear } from "d3";
import { seriesColour } from "./figure-styles.js";

const pct = (value) =>
  (value > 0 && value < 0.1
    ? "<0.1"
    : value < 100 && value > 99.9
      ? ">99.9"
      : String(+value.toFixed(1))) + "%";

// Work from the calculated cells, including the original index for drill-down.
// Layout also runs for downloaded SVGs, PNGs and saved side-by-side comparisons.
export function drawSurveyDistribution({
  root,
  records,
  analysis,
  chart,
  width,
  margin,
  pos,
  theme,
  style,
  paper,
  scheme,
  highlighted,
  named,
  wrap,
  interactive,
  pointMark,
  readableText,
}) {
  root
    .classed("survey-distribution", true)
    .style("--survey-figure-width", Math.min(width, 620) + "px");
  if (!records.length) return pos;
  const layer = root.append("g").attr("data-survey-view", chart);
  const scale = theme.scale;
  const groups = [...new Set(records.map((r) => r.groupValue))];
  const originals = new Map(analysis.records.map((r, i) => [r, i]));
  const questions = new Map();
  for (const r of records) {
    if (!questions.has(r.fieldId)) questions.set(r.fieldId, new Map());
    const answers = questions.get(r.fieldId);
    if (!answers.has(r.label)) answers.set(r.label, new Map());
    answers.get(r.label).set(r.groupValue, r);
  }
  const heat = scaleLinear([0, 50, 100], scheme.ramp);
  const ink = (parent, value, x, y, size = 12, weight = 400, align = "start") =>
    parent
      .append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("font-size", size * scale)
      .attr("font-weight", weight)
      .attr("text-anchor", align)
      .text(value);
  const linesIn = (value, space, size) =>
    wrap(value, Math.max(3, Math.floor(space / (size * scale * 0.61))));
  function multiline(parent, lines, x, y, size, weight = 400, align = "start") {
    lines.forEach((line, i) =>
      ink(parent, line, x, y + i * (size + 4) * scale, size, weight, align),
    );
  }
  // Earlier figures allowed the combined question/answer row to be renamed.
  const answerName = (r) => {
    const alias = named("groups", r.group);
    return alias === r.group ? r.label : alias;
  };
  const description = (r) =>
    [
      named("questions", r.question),
      answerName(r),
      named("subgroups", r.groupValue),
      r.undefinedShare
        ? "No answers for this percentage"
        : pct(r.value) + " (" + r.n + " of " + r.den + ")",
    ].join(" · ");
  const cellLayer = (parent, r) => {
    const g = parent
      .append("g")
      .attr("data-pattern-row", originals.get(r))
      .attr("data-group", r.groupValue)
      .attr("data-answer", r.label)
      .attr("tabindex", interactive ? 0 : null)
      .attr("role", interactive ? "button" : null)
      .attr("cursor", interactive ? "pointer" : null)
      .attr("aria-label", description(r));
    g.append("title").text(description(r));
    return g;
  };
  const faint = "#d1d6dc";
  const plotWidth = width - 2 * margin;
  const cellMin = (chart === "table" ? 102 : 87) * scale;
  const left = Math.min(plotWidth * 0.32, 169 * scale);
  const across = Math.max(1, Math.floor((plotWidth - left) / cellMin));

  const acrossAnswer = analysis.percentBase === "answer";
  const reading = acrossAnswer
    ? "Of the people who chose each answer, what percentage came from each group?"
    : "Of the people who answered in each group, what percentage chose each option?";
  const cue = linesIn(reading, plotWidth, 13);
  multiline(layer, cue, margin, pos, 13);
  pos += cue.length * 17 * scale + 12;
  const groupColours = new Map(
    analysis.groupSizes.map(({ group, colourIndex }, i) => [
      group,
      seriesColour(scheme.series, colourIndex ?? i),
    ]),
  );
  const colours = new Map(
    [...new Set(analysis.records.map((r) => r.label))].map((answer, i) => [
      answer,
      seriesColour(scheme.series, i),
    ]),
  );

  for (const [fieldId, answers] of questions) {
    const panel = layer.append("g").attr("data-survey-question", fieldId);
    const firstAnswer = answers.values().next().value;
    const first = firstAnswer.values().next().value;
    const heading = named("questions", first.question);
    const titles = linesIn(heading, plotWidth, 15);
    multiline(panel, titles, margin, pos, 15, 650);
    pos += titles.length * 19 * scale + 4;

    if (chart === "stack") {
      const strips = acrossAnswer
        ? [...answers].map(([key, row]) => ({
            key,
            name: answerName(row.values().next().value),
            cells: groups.map((group) => row.get(group)),
          }))
        : groups.map((key) => ({
            key,
            name: named("subgroups", key),
            cells: [...answers.values()].map((row) => row.get(key)),
          }));
      for (const { key, name, cells } of strips) {
        const den = cells[0].den;
        const names = linesIn(name + " (n = " + den + ")", plotWidth, 12);
        const row = panel
          .append("g")
          .attr(
            acrossAnswer ? "data-answer-heading" : "data-group-heading",
            key,
          );
        multiline(
          row,
          names,
          margin,
          pos,
          12,
          !acrossAnswer && key === highlighted ? 700 : 500,
        );
        pos += (names.length - 1) * 16 * scale + 7;
        let start = margin;
        const h = 21 * scale;
        if (!den) {
          ink(row, "No answers", margin, pos + h * 0.7, 12);
        } else {
          for (const r of cells) {
            const length = (r.value / 100) * plotWidth;
            if (!length) continue;
            const g = cellLayer(row, r);
            const colour = acrossAnswer
              ? groupColours.get(r.groupValue)
              : colours.get(r.label);
            g.append("rect")
              .attr("x", start)
              .attr("y", pos)
              .attr("width", length)
              .attr("height", h)
              .attr("fill", colour)
              .attr(
                "stroke",
                acrossAnswer && r.groupValue === highlighted ? "#222" : paper,
              )
              .attr(
                "stroke-width",
                acrossAnswer && r.groupValue === highlighted ? 2 : 0.8,
              );
            if (length >= (pct(r.value).length + 1) * 7 * scale)
              ink(
                g,
                pct(r.value),
                start + length / 2,
                pos + h * 0.67,
                11,
                600,
                "middle",
              ).attr("fill", readableText(colour));
            start += length;
          }
        }
        pos += h + 16 * scale;
      }
      const legend = acrossAnswer
        ? groups.map((group) => [
            named("subgroups", group),
            groupColours.get(group),
            group,
          ])
        : [...answers].map(([label, row]) => [
            answerName(row.values().next().value),
            colours.get(label),
          ]);
      for (const [name, colour, group] of legend) {
        const key = panel.append("g").attr("data-group-heading", group ?? null);
        const lines = linesIn(name, plotWidth - 21, 12);
        key
          .append("rect")
          .attr("x", margin)
          .attr("y", pos - 9 * scale)
          .attr("width", 10 * scale)
          .attr("height", 10 * scale)
          .attr("fill", colour);
        multiline(
          key,
          lines,
          margin + 16 * scale,
          pos,
          12,
          group && group === highlighted ? 700 : 400,
        );
        pos += lines.length * 16 * scale;
      }
    } else if (chart === "dots") {
      const x = scaleLinear([0, 100], [margin + left + 8, width - margin - 17]);
      const ticks = [0, 25, 50, 75, 100];
      const guides = panel.append("g").attr("aria-hidden", "true");
      const axis = panel.append("g").attr("data-percent-axis", "");
      const axisLabel = linesIn(analysis.groupLabel, left - 10, 11);
      multiline(axis, axisLabel, margin, pos, 11, 600);
      for (const tick of ticks)
        ink(axis, tick + "%", x(tick), pos, 11, 500, "middle");
      pos += 15 * scale * axisLabel.length;
      const top = pos - 10 * scale;
      for (const row of answers.values()) {
        const sample = row.values().next().value;
        const key =
          answerName(sample) +
          (acrossAnswer ? " (n = " + sample.den + ")" : "");
        const lines = linesIn(key, plotWidth, 13);
        multiline(panel, lines, margin, pos, 13, 650);
        pos += lines.length * 17 * scale;
        for (const group of groups) {
          const r = row.get(group);
          const g = cellLayer(panel, r);
          const colour = groupColours.get(group);
          const groupLabel =
            named("subgroups", group) +
            (acrossAnswer ? "" : " (n = " + r.den + ")");
          const names = linesIn(groupLabel, left - 18 * scale, 11);
          const h = (names.length * 15 + 4) * scale;
          const cy = pos + (h - 15 * scale) / 2;
          g.append("rect")
            .attr("x", margin)
            .attr("y", pos - 10 * scale)
            .attr("width", plotWidth)
            .attr("height", h)
            .attr("fill", "transparent");
          const key = g.append("g").attr("data-group-heading", group);
          pointMark(
            key,
            style,
            margin + 4 * scale,
            cy,
            3 * scale,
            colour,
            paper,
          );
          multiline(
            key,
            names,
            margin + 13 * scale,
            pos + 3 * scale,
            11,
            group === highlighted ? 700 : 400,
          );
          if (r.undefinedShare) {
            ink(g, "No answers", x(0) + 5, cy + 4 * scale, 11);
          } else {
            const nearEnd = r.value > 87;
            pointMark(g, style, x(r.value), cy, 4.5 * scale, colour, paper);
            ink(
              g,
              pct(r.value),
              x(r.value) + (nearEnd ? -8 : 8) * scale,
              cy + 4 * scale,
              11,
              500,
              nearEnd ? "end" : "start",
            );
          }
          pos += h;
        }
        pos += 9 * scale;
      }
      for (const tick of ticks) {
        guides
          .append("line")
          .attr("x1", x(tick))
          .attr("x2", x(tick))
          .attr("y1", top)
          .attr("y2", pos - 18 * scale)
          .attr("stroke", faint)
          .attr("stroke-width", tick === 0 || tick === 100 ? 1 : 0.65)
          .attr("stroke-dasharray", tick === 0 || tick === 100 ? null : "3 4");
      }
    } else {
      for (let offset = 0; offset < groups.length; offset += across) {
        const subset = groups.slice(offset, offset + across);
        const cw = (plotWidth - left) / Math.min(across, groups.length);
        const colX = (i) => margin + left + i * cw;
        let headerLines = 1;
        for (const [i, group] of subset.entries()) {
          const g = panel.append("g").attr("data-group-heading", group);
          const names = linesIn(named("subgroups", group), cw - 8, 12);
          multiline(
            g,
            names,
            colX(i) + cw / 2,
            pos,
            12,
            group === highlighted ? 750 : 600,
            "middle",
          );
          if (!acrossAnswer) {
            ink(
              g,
              "n = " + firstAnswer.get(group).den,
              colX(i) + cw / 2,
              pos + names.length * 16 * scale,
              11,
              400,
              "middle",
            );
          }
          headerLines = Math.max(
            headerLines,
            names.length + Number(!acrossAnswer),
          );
        }
        pos += (headerLines - 1) * 16 * scale + 8 * scale;
        for (const row of answers.values()) {
          const r0 = row.values().next().value;
          const name =
            answerName(r0) + (acrossAnswer ? " (n = " + r0.den + ")" : "");
          const names = linesIn(name, left - 10, 12);
          const h = Math.max(
            names.length * 16 * scale + 8,
            (chart === "grid" ? 32 : 45) * scale,
          );
          multiline(panel, names, margin, pos + 14 * scale, 12);
          for (const [i, group] of subset.entries()) {
            const r = row.get(group);
            const x = colX(i);
            const cx = x + cw / 2;
            const cy = pos + h / 2;
            const g = cellLayer(panel, r);
            const fill =
              chart === "grid" && !r.undefinedShare ? heat(r.value) : paper;
            g.append("rect")
              .attr("x", x + 1)
              .attr("y", pos + 1)
              .attr("width", cw - 2)
              .attr("height", h - 2)
              .attr("rx", chart === "grid" ? Math.min(theme.radius, 4) : 0)
              .attr("fill", fill)
              .attr("stroke", group === highlighted ? scheme.series[0] : faint)
              .attr("stroke-width", group === highlighted ? 1.6 : 0.6);
            if (r.undefinedShare) {
              ink(g, "No answers", cx, cy + 4 * scale, 11, 400, "middle");
            } else {
              const text = ink(
                g,
                pct(r.value),
                cx,
                cy + (chart === "grid" ? 4 : -2) * scale,
                12,
                600,
                "middle",
              );
              if (chart === "grid") text.attr("fill", readableText(fill));
              else
                ink(
                  g,
                  r.n + " of " + r.den,
                  cx,
                  cy + 12 * scale,
                  10,
                  400,
                  "middle",
                );
            }
          }
          pos += h;
        }
        pos += 17 * scale;
      }
    }
    pos += 13 * scale;
  }
  return pos;
}
