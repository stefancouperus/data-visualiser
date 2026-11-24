import { scaleLinear } from "d3";
import { seriesColour } from "./figure-styles.js";

const format = new Intl.NumberFormat("en-GB", { maximumSignificantDigits: 4 });

// Character counts do not predict the width of names in different scripts or fonts.
// Use the same font settings as the SVG, including on detached figures for export.
export function themeTextWrapper(doc) {
  const context = doc.createElement("canvas").getContext("2d");
  const cache = new Map();
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return (text, width, size, weight, font) => {
    const key = JSON.stringify([text, width, size, weight, font]);
    if (cache.has(key)) return cache.get(key);
    context.font = weight + " " + size + "px " + font;
    const fits = (part) => context.measureText(part).width <= width - 1;
    const result = [];
    let line = "";
    for (const word of String(text ?? "")
      .trim()
      .split(/\s+/u)) {
      const combined = line ? line + " " + word : word;
      if (fits(combined)) {
        line = combined;
        continue;
      }
      if (line) result.push(line);
      if (fits(word)) {
        line = word;
        continue;
      }
      line = "";
      for (const { segment } of segmenter.segment(word)) {
        if (line && !fits(line + segment)) {
          result.push(line);
          line = "";
        }
        line += segment;
      }
    }
    result.push(line);
    cache.set(key, result);
    return result;
  };
}

// Group labels and code names remain separate keys, even when they have identical text.
// The row index belongs to the underlying analysis and survives aliases and reordering.
export function drawThemeComparison({
  root,
  analysis,
  records,
  chart,
  width,
  margin,
  pos,
  theme,
  style,
  scheme,
  paper,
  highlighted,
  named,
  wrapText,
  interactive,
  pointMark,
  horizontalMark,
  readableText,
}) {
  const layer = root.append("g").attr("data-theme-view", chart);
  root
    .attr("data-theme-comparison", "")
    .style("--theme-figure-width", Math.min(width, 620) + "px");
  if (!records.length) return pos;
  const { grouped, unit } = analysis.themeComparison;
  const count = unit === "count";
  const reverse = unit === "themePassageShare";
  const original = new Map(analysis.records.map((r, i) => [r, i]));
  const groups = [...new Set(records.map((r) => r.groupValue))];
  const themes = new Map();
  for (const r of records) {
    if (!themes.has(r.label)) themes.set(r.label, new Map());
    themes.get(r.label).set(r.groupValue, r);
  }
  const themeName = (code) => named(grouped ? "groups" : "labels", code);
  const groupName = (group) => named(grouped ? "subgroups" : "groups", group);
  const number = (r) => (count ? String(r.n) : format.format(r.value) + "%");
  const missing = reverse ? "No matches" : "No passages";
  const amount = (r) =>
    r.undefinedShare
      ? missing
      : number(r) +
        (count
          ? " of " + r.den + " passages"
          : " (" + r.n + " of " + r.den + ")");
  const explain = reverse
    ? "Of all the included passages carrying each theme, which interviews or groups contributed them?"
    : unit === "interviewShare"
      ? "Each percentage shows the share of interviews in the group carrying the theme."
      : count
        ? "Each cell counts original passages carrying the theme. Longer interviews can have more passages."
        : "Each percentage shows the share of included original passages carrying the theme.";
  const max = count ? Math.max(1, ...records.map((r) => r.n)) : 100;
  const colour = scaleLinear([0, max / 2, max], scheme.ramp);
  const s = theme.scale,
    plotWidth = width - 2 * margin;
  const left = Math.min(175 * s, plotWidth * 0.34);
  const ink = (g, label, x, y, size = 12, weight = 400, anchor = "start") =>
    g
      .append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("font-size", size * s)
      .attr("font-weight", weight)
      .attr("text-anchor", anchor)
      .text(label);
  const lines = (value, space, size, weight = 650) =>
    wrapText(value, space, size * s, weight, theme.font);
  const write = (g, list, x, y, size, weight, anchor) =>
    list.forEach((line, i) =>
      ink(g, line, x, y + i * (size + 4) * s, size, weight, anchor),
    );
  const cell = (parent, r) => {
    const name = themeName(r.label) + " · " + groupName(r.groupValue);
    const g = parent
      .append("g")
      .attr("data-pattern-row", original.get(r))
      .attr("data-theme", r.label)
      .attr("data-comparison", r.groupValue)
      .attr("data-code", r.label)
      .attr("data-source", grouped ? null : r.groupValue)
      .attr("role", interactive ? "button" : null)
      .attr("tabindex", interactive ? 0 : null)
      .attr("cursor", interactive ? "pointer" : null)
      .attr("aria-label", interactive ? "Read evidence: " + name : null)
      .attr("aria-description", interactive ? amount(r) : null);
    g.append("title").text(name + " — " + amount(r));
    return g;
  };
  const cue = lines(explain, plotWidth, 13);
  write(layer, cue, margin, pos, 13);
  pos += (cue.length * 17 + 10) * s;
  const fills = new Map(
    analysis.groupSizes.map(({ group, colourIndex }, i) => [
      group,
      seriesColour(scheme.series, colourIndex ?? i),
    ]),
  );
  const heading = (code, row) =>
    themeName(code) +
    (reverse ? " (n = " + row.values().next().value.den + ")" : "");
  if (chart === "stack") {
    for (const [code, row] of themes) {
      const block = layer.append("g").attr("data-theme-heading", code);
      const title = lines(heading(code, row), plotWidth, 14);
      write(block, title, margin, pos, 14, 650);
      pos += ((title.length - 1) * 18 + 7) * s;
      let x = margin;
      for (const group of groups) {
        const r = row.get(group);
        if (!r.n) continue;
        const g = cell(block, r);
        const size = (r.value / 100) * plotWidth;
        g.append("rect")
          .attr("x", x)
          .attr("y", pos)
          .attr("width", size)
          .attr("height", 24 * s)
          .attr("fill", fills.get(group))
          .attr("stroke", paper)
          .attr("stroke-width", 0.8);
        if (size >= (number(r).length + 1) * 7 * s)
          ink(g, number(r), x + size / 2, pos + 16 * s, 11, 650, "middle").attr(
            "fill",
            readableText(fills.get(group)),
          );
        x += size;
      }
      if (x === margin)
        ink(block, "No matching passages", margin, pos + 16 * s, 12);
      pos += 42 * s;
    }
    for (const group of groups) {
      layer
        .append("rect")
        .attr("x", margin)
        .attr("y", pos - 9 * s)
        .attr("height", 10 * s)
        .attr("width", 10 * s)
        .attr("fill", fills.get(group));
      const label = lines(groupName(group), plotWidth - 17 * s, 12);
      write(
        layer,
        label,
        margin + 16 * s,
        pos,
        12,
        group === highlighted ? 700 : 400,
      );
      pos += label.length * 17 * s;
    }
    return pos + 9 * s;
  }
  if (chart === "dots" || chart === "bars") {
    const x0 = margin + 7 * s,
      x1 = width - margin - 16 * s;
    const x = scaleLinear([0, max], [x0, x1]);
    const ticks = count
      ? [...new Set([0, Math.round(max / 2), max])]
      : [0, 25, 50, 75, 100];
    for (const [code, row] of themes) {
      const block = layer.append("g").attr("data-theme-heading", code);
      const title = lines(heading(code, row), plotWidth, 15);
      write(block, title, margin, pos, 15, 650);
      pos += (title.length * 19 + 5) * s;
      for (const tick of ticks)
        ink(
          block,
          format.format(tick) + (count ? "" : "%"),
          x(tick),
          pos,
          10,
          500,
          "middle",
        );
      pos += 15 * s;
      for (const group of groups) {
        const r = row.get(group),
          g = cell(block, r);
        const marked =
          (grouped || groups.length > 1 ? group : code) === highlighted;
        const label = lines(
          groupName(group) + " — " + amount(r),
          plotWidth,
          12,
        );
        g.append("rect")
          .attr("x", margin)
          .attr("y", pos - 12 * s)
          .attr("width", plotWidth)
          .attr("height", (label.length * 16 + 16) * s)
          .attr("fill", "transparent");
        write(g, label, margin, pos, 12, marked ? 700 : 500);
        pos += ((label.length - 1) * 16 + 10) * s;
        if (!r.undefinedShare) {
          g.append("line")
            .attr("x1", x0)
            .attr("x2", x1)
            .attr("y1", pos)
            .attr("y2", pos)
            .attr("stroke", "#cdd4db");
          const fill = fills.get(group);
          if (chart === "dots")
            pointMark(g, style, x(r.value), pos, 4.8 * s, fill, paper);
          else
            horizontalMark(
              g,
              style,
              x0,
              pos,
              x(r.value) - x0,
              theme.bar * 0.75,
              fill,
              paper,
            );
        }
        pos += 20 * s;
      }
      pos += 14 * s;
    }
    return pos;
  }
  // Keep long interview collections readable in both the browser and a downloaded figure.
  // Repeat theme headings for each horizontal block of interviewees or groups.
  const across = Math.max(
    1,
    Math.floor((plotWidth - left) / ((chart === "table" ? 98 : 79) * s)),
  );
  for (let start = 0; start < groups.length; start += across) {
    const subset = groups.slice(start, start + across),
      cw = (plotWidth - left) / Math.min(across, groups.length);
    let headline = 1;
    const subject = grouped ? analysis.groupLabel : "Interview";
    const headers = lines(subject, left - 8, 12);
    write(layer, headers, margin, pos, 12, 650);
    headline = Math.max(headline, headers.length);
    for (const [i, group] of subset.entries()) {
      const names = lines(groupName(group), cw - 8, 12);
      const g = layer.append("g").attr("data-comparison-heading", group);
      write(g, names, margin + left + (i + 0.5) * cw, pos, 12, 650, "middle");
      const sample = themes.values().next().value.get(group);
      if (!reverse)
        ink(
          g,
          format.format(sample.den) +
            (unit === "interviewShare"
              ? sample.den === 1
                ? " interview"
                : " interviews"
              : sample.den === 1
                ? " passage"
                : " passages"),
          margin + left + (i + 0.5) * cw,
          pos + names.length * 16 * s,
          10,
          400,
          "middle",
        );
      headline = Math.max(headline, names.length + Number(!reverse));
    }
    pos += ((headline - 1) * 16 + 10) * s;
    for (const [code, row] of themes) {
      const block = layer.append("g").attr("data-theme-heading", code);
      const names = lines(heading(code, row), left - 12, 12);
      const h = Math.max(
        names.length * 16 * s + 10,
        (chart === "table" ? 47 : 36) * s,
      );
      write(block, names, margin, pos + 16 * s, 12, 550);
      for (const [i, group] of subset.entries()) {
        const r = row.get(group),
          g = cell(block, r);
        const x = margin + left + i * cw,
          cx = x + cw / 2,
          cy = pos + h / 2;
        const heat =
          chart === "grid" && !r.undefinedShare ? colour(r.value) : paper;
        const focus =
          (grouped || (chart === "table" && groups.length > 1)
            ? group
            : code) === highlighted;
        g.append("rect")
          .attr("x", x + 1)
          .attr("y", pos + 1)
          .attr("width", cw - 2)
          .attr("height", h - 2)
          .attr("rx", chart === "grid" ? Math.min(4, theme.radius) : 0)
          .attr("fill", heat)
          .attr("stroke", focus ? scheme.series[0] : "#cbd5df")
          .attr("stroke-width", focus ? 2 : 0.6);
        ink(
          g,
          r.undefinedShare ? missing : number(r),
          cx,
          cy + (chart === "table" && !r.undefinedShare ? -2 : 4) * s,
          12,
          600,
          "middle",
        ).attr("fill", chart === "grid" ? readableText(heat) : null);
        if (chart === "table" && !r.undefinedShare)
          ink(g, r.n + " of " + r.den, cx, cy + 13 * s, 10, 400, "middle");
      }
      pos += h;
    }
    pos += 18 * s;
  }
  return pos;
}
