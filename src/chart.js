import {
  figureStyles,
  styleFor,
  highlightChoices,
  paletteFor,
} from "./figure-styles.js";
import * as d3 from "d3";
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (v) => d3.format("~g")(Number(v.toPrecision(4)));
const shorten = (v, n = 28) =>
  String(v).length > n ? String(v).slice(0, n - 1) + "…" : v;
function wrap(value, max) {
  let s = String(value || ""),
    lines = [];
  while (s.length > max) {
    let i = s.lastIndexOf(" ", max);
    if (i < max / 2) i = max;
    lines.push(s.slice(0, i));
    s = s.slice(i).trimStart();
  }
  return [...lines, s];
}
// Draw every quantity from the same baseline to the same endpoint in every style.
function horizontalMark(root, style, x, y, length, height, colour, paper) {
  if (!(length > 0)) return;
  const capped = style === "policy";
  const h = capped ? Math.max(2, height * 0.27) : height;
  const outline = style === "report" ? Math.min(1.6, length / 2) : 0;
  root
    .append("rect")
    .attr("class", "bar-mark")
    .attr("x", x + outline / 2)
    .attr("y", y - h / 2 + outline / 2)
    .attr("width", length - outline)
    .attr("height", h - outline)
    .attr("rx", Math.min(figureStyles[style].radius, h / 2, length / 2))
    .attr("fill", outline ? d3.interpolateRgb(paper, colour)(0.15) : colour)
    .attr("stroke", outline ? colour : "none")
    .attr("stroke-width", outline);
  if (capped) {
    const cap = Math.min(length, 3);
    root
      .append("line")
      .attr("x1", x + length - cap / 2)
      .attr("x2", x + length - cap / 2)
      .attr("y1", y - height / 2)
      .attr("y2", y + height / 2)
      .attr("stroke", colour)
      .attr("stroke-width", cap);
  }
}
function pointMark(root, style, x, y, r, colour, paper) {
  if (style === "report")
    return root
      .append("rect")
      .attr("x", x - r * 0.83)
      .attr("y", y - r * 0.83)
      .attr("width", r * 1.66)
      .attr("height", r * 1.66)
      .attr("fill", paper)
      .attr("stroke", colour)
      .attr("stroke-width", 1.8);
  if (style === "presentation")
    return root
      .append("path")
      .attr(
        "d",
        `M${x} ${y - r * 1.25}l${r * 1.25} ${r * 1.25}l${-r * 1.25} ${r * 1.25}l${-r * 1.25} ${-r * 1.25}Z`,
      )
      .attr("fill", colour);
  return root
    .append("circle")
    .attr("cx", x)
    .attr("cy", y)
    .attr("r", r)
    .attr("fill", style === "policy" ? paper : colour)
    .attr("stroke", style === "policy" ? colour : "none")
    .attr("stroke-width", 2.2);
}
function readableText(fill) {
  const c = d3.rgb(fill);
  const [r, g, b] = [c.r, c.g, c.b].map((channel) => {
    const n = channel / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#000000" : "#ffffff";
}
function paperFor(style, mono) {
  return style === "report" && !mono ? "#faf7f1" : "#ffffff";
}
export function styleSample(style, palette) {
  const svg = d3
    .create("svg")
    .attr("viewBox", "0 0 100 36")
    .attr("aria-hidden", "true");
  const scheme = paletteFor(style, palette),
    paper = paperFor(style, palette === "grey");
  svg.append("rect").attr("width", 100).attr("height", 36).attr("fill", paper);
  [66, 44, 55].forEach((n, i) =>
    horizontalMark(svg, style, 4, 7 + i * 11, n, 7, scheme.series[i], paper),
  );
  pointMark(svg, style, 85, 18, 5, scheme.series[0], paper);
  return svg.node();
}
export function figure(a, v, { width = 700, interactive = false } = {}) {
  const inspectable =
    interactive &&
    (v.task === "patterns" || ["grid", "presence"].includes(v.chart));
  const style = styleFor(v.style),
    theme = figureStyles[style],
    mono = v.palette === "grey";
  const scheme = paletteFor(style, v.palette),
    accent = scheme.series[0],
    paper = paperFor(style, mono);
  const highlighted =
    style === "policy" &&
    v.highlight &&
    highlightChoices(a, v).includes(v.highlight)
      ? v.highlight
      : null;
  const root = d3
    .create("svg")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("role", inspectable ? "group" : "img")
    .attr("aria-label", a.title)
    .attr("font-family", theme.font)
    .attr("data-style", style)
    .attr("font-size", 14)
    .attr("fill", mono || style === "report" ? "#252525" : "#253346");
  const w = width,
    margin = 22,
    palette = scheme.series;
  let pos = Math.max(27, theme.title + 8);
  function rule(y, x2, colour, weight) {
    root
      .append("line")
      .attr("x1", margin)
      .attr("x2", x2)
      .attr("y1", y)
      .attr("y2", y)
      .attr("stroke", colour)
      .attr("stroke-width", weight);
  }
  if (style === "policy" || style === "presentation") pos += 8;
  if (style === "report") {
    rule(8, w - margin, accent, 1.3);
    rule(11, w - margin, accent, 0.6);
    pos += 8;
  }
  const header = ["presentation", "policy"].includes(style)
    ? root
        .append("rect")
        .attr("width", "100%")
        .attr(
          "fill",
          style === "presentation"
            ? d3.interpolateRgb(mono ? "#171717" : "#15161f", accent)(0.21)
            : d3.interpolateRgb(paper, accent)(0.12),
        )
    : null;
  function line(t, x = margin, y = pos, size = 14, bold = false) {
    return root
      .append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("font-size", size * theme.scale)
      .attr("font-weight", bold ? 650 : 400)
      .text(t);
  }
  function block(s, n, size = 14, bold = false) {
    for (const t of wrap(s, Math.max(8, Math.floor(n / theme.scale)))) {
      line(t, margin, pos, size, bold);
      pos += size * theme.scale + 6;
    }
  }
  for (const t of wrap(a.title, Math.floor((w - 48) / (theme.title * 0.55)))) {
    line(t, margin, pos, theme.title / theme.scale, true)
      .attr("font-family", theme.headingFont)
      .attr(
        "fill",
        style === "presentation"
          ? "white"
          : style === "policy"
            ? accent
            : mono || style === "report"
              ? "#252525"
              : "#253346",
      );
    pos += theme.title + 6;
  }
  if (header) {
    header.attr("height", pos - 8);
    if (style === "policy")
      root
        .append("rect")
        .attr("width", 6)
        .attr("height", pos - 8)
        .attr("fill", accent);
  }
  if (style === "workshop") rule(pos - 7, w - margin, accent, 1.4);
  pos += 12;
  const records = a.records || [],
    groups = [...new Set(records.map((r) => r.group))],
    labels = [...new Set(records.map((r) => r.label))];
  const labelIndex = new Map(labels.map((key, i) => [key, i]));
  const ink = (i) => palette[i % palette.length];
  const muted = mono
    ? ["#858585", "#bcbcbc", "#9b9b9b", "#cecece", "#737373"]
    : ["#788b91", "#b7c4cb", "#8b9aa8", "#cad4d6", "#74818e"];
  const markInk = (i, key) =>
    highlighted
      ? key === highlighted
        ? accent
        : muted[i % muted.length]
      : ink(i);
  function bars(list, mark) {
    if (!list.length) return;
    const max = Math.max(1, ...records.map((r) => r.value)),
      left = Math.min(w * 0.36, 215);
    const scale = d3.scaleLinear([0, max], [0, w - left - 85]);
    for (const r of list) {
      line(
        shorten(r.label, Math.floor(left / (8.1 * theme.scale))),
        margin,
        pos + 5,
      )
        .append("title")
        .text(r.label);
      const colour = markInk(
        groups.length === 1 &&
          labels.length <= palette.length &&
          a.xType !== "ordered" &&
          a.xType !== "number"
          ? labelIndex.get(r.label)
          : Math.max(0, groups.indexOf(r.group)),
        groups.length > 1 ? r.group : r.label,
      );
      if (mark === "dots")
        pointMark(
          root,
          style,
          left + scale(r.value),
          pos,
          4.6 * theme.scale,
          colour,
          paper,
        );
      else
        horizontalMark(
          root,
          style,
          left,
          pos,
          scale(r.value),
          theme.bar,
          colour,
          paper,
        );
      line(
        num(r.value) + (a.unit.startsWith("%") ? "%" : ""),
        left + scale(r.value) + 9,
        pos + 5,
        13,
      );
      pos += theme.row;
    }
  }
  if (v.task === "patterns" && v.chart !== "grid") {
    const ranked = a.distinctPatterns != null;
    const namedQuestions = v.patternMode === "together";
    if (namedQuestions)
      for (const [i, name] of a.selectedLabels.entries())
        block(i + 1 + ". " + name, Math.floor((w - 52) / 8), 13);
    const max = Math.max(1, ...records.map((r) => r.value));
    const patternKeys = a.groupLabel
      ? [...new Set(records.map((r) => r.groupValue))]
      : groups.length > 1
        ? groups
        : labels;
    const patternIndex = new Map(patternKeys.map((key, i) => [key, i]));
    let group;
    for (const [index, r] of records.entries()) {
      if (r.group && group !== r.group) {
        group = r.group;
        pos += 8;
        block(group, Math.floor((w - 52) / 8), 15, true);
      }
      const rowStart = pos - 16;
      const names = namedQuestions
        ? r.parts.map((p, j) => j + 1 + ". " + p)
        : r.parts;
      const label = a.groupLabel
        ? r.groupValue
        : ranked
          ? names.join("   ·   ")
          : r.label;
      const amount = r.undefinedShare
        ? "No answers"
        : a.unit.startsWith("%")
          ? num(r.value) + "% (" + r.n + " of " + r.den + ")"
          : String(r.n);
      const key = a.groupLabel
        ? r.groupValue
        : groups.length > 1
          ? r.group
          : r.label;
      const colour = markInk(patternIndex.get(key), key);
      block(
        label + "   —   " + amount,
        Math.floor((w - 52) / 8),
        14,
        Boolean(highlighted && highlighted === key),
      );
      if (v.chart !== "table" && !r.undefinedShare) {
        const end =
          margin +
          ((w - 2 * margin) * r.value) / (a.unit.startsWith("%") ? 100 : max);
        const h = theme.bar * 0.75;
        if (v.chart === "dots") {
          rule(pos, w - margin, mono ? "#dddddd" : "#d6dfdf", 1);
          pointMark(root, style, end, pos, 4 * theme.scale, colour, paper);
        } else
          horizontalMark(
            root,
            style,
            margin,
            pos,
            end - margin,
            h,
            colour,
            paper,
          );
        pos += h / 2 + 10;
      }
      root
        .append("rect")
        .attr("x", margin)
        .attr("y", rowStart)
        .attr("width", w - 2 * margin)
        .attr("height", pos - rowStart)
        .attr("fill", "transparent")
        .attr("data-pattern-row", index)
        .attr("role", inspectable ? "button" : null)
        .attr("tabindex", inspectable ? 0 : null)
        .attr(
          "aria-label",
          "Read evidence: " + (a.groupLabel ? r.group + " · " : "") + label,
        )
        .attr("cursor", inspectable ? "pointer" : null)
        .append("title")
        .text("Read the evidence for " + label);
    }
  } else if (v.chart === "excerpts") {
    for (const p of a.excerpt) {
      rule(pos - 14, margin + 24, accent, 2);
      block(p.source + "  ·  " + (p.codes?.join(", ") || "Text"), 74, 13, true);
      block(p.text, Math.floor((w - 52) / 8));
      pos += 12;
    }
  } else if (v.chart === "table") {
    block(
      "Group  /  category                               Value",
      65,
      13,
      true,
    );
    for (const [index, r] of records.entries()) {
      const rowTop = pos - 14;
      const band =
        index % 2 === 0 && style !== "report"
          ? root
              .append("rect")
              .attr("x", margin - 3)
              .attr("y", rowTop)
              .attr("width", w - 2 * margin + 6)
              .attr("fill", d3.interpolateRgb(paper, accent)(0.075))
          : null;
      const emphasise = highlighted && r.label === highlighted;
      block(
        (r.group ? r.group + "  /  " : "") +
          r.label +
          "     " +
          num(r.value) +
          (a.unit.startsWith("%") ? "%" : "") +
          (r.den != null ? "   (" + r.n + " of " + r.den + ")" : ""),
        Math.floor((w - 52) / 8),
        14,
        emphasise,
      );
      band?.attr("height", pos - 14 - rowTop);
      if (style === "report")
        rule(pos - 14, w - margin, d3.interpolateRgb(paper, accent)(0.35), 0.7);
    }
  } else if (["grid", "presence"].includes(v.chart)) {
    const labelW = Math.min(175, w * 0.28),
      cw = Math.max(65, (w - labelW - 45) / Math.max(1, labels.length)),
      max = Math.max(1, ...records.map((r) => r.value));
    const heat = d3.scaleLinear([0, 0.5, 1], scheme.ramp);
    root.attr("data-width", Math.max(w, labelW + 45 + cw * labels.length));
    labels.forEach((name, i) =>
      line(
        shorten(name, Math.max(7, Math.floor(cw / (8 * theme.scale)))),
        margin + labelW + i * cw,
        pos,
        11,
      )
        .append("title")
        .text(name),
    );
    pos += 9;
    for (const g of groups) {
      line(shorten(g || a.unit, 19), margin, pos + 23, 13);
      records
        .filter((r) => r.group === g)
        .forEach((r, i) => {
          const value = r.value;
          const cell = root
            .append("g")
            .attr("data-code", r.label)
            .attr("data-source", g)
            .attr("role", inspectable ? "button" : null)
            .attr("tabindex", inspectable ? 0 : null)
            .attr(
              "aria-label",
              "Read evidence: " + g + " · " + r.label + " · " + value,
            )
            .attr("cursor", inspectable ? "pointer" : null);
          cell
            .append("rect")
            .attr("x", margin + labelW + i * cw)
            .attr("y", pos)
            .attr("width", cw - 3)
            .attr("height", 33)
            .attr("rx", theme.radius)
            .attr("fill", heat(value / max))
            .attr("stroke", r.label === highlighted ? accent : "none")
            .attr("stroke-width", 2);
          cell
            .append("text")
            .attr("x", margin + labelW + (i + 0.5) * cw)
            .attr("y", pos + 22)
            .attr("text-anchor", "middle")
            .attr("fill", readableText(heat(value / max)))
            .text(num(value));
          cell.append("title").text(g + " · " + r.label + " · " + value);
        });
      pos += 37;
    }
  } else if (v.chart === "hist" && records.length) {
    const lo = records[0].lo,
      hi = records.at(-1).hi;
    const x = d3.scaleLinear(
      [lo === hi ? lo - 0.5 : lo, lo === hi ? hi + 0.5 : hi],
      [65, w - 24],
    );
    const top = pos + 20,
      bottom = top + 180;
    const y = d3
      .scaleLinear([0, d3.max(records, (r) => r.value) || 1], [bottom, top])
      .nice();
    line(a.unit, margin, pos, 12);
    root
      .append("g")
      .attr("transform", "translate(65,0)")
      .call(d3.axisLeft(y).ticks(theme.ticks));
    root
      .append("g")
      .attr("transform", "translate(0," + bottom + ")")
      .call(d3.axisBottom(x).ticks(theme.ticks + 1));
    for (const r of records) {
      const start = x(lo === hi ? lo - 0.5 : r.lo),
        end = x(lo === hi ? hi + 0.5 : r.hi);
      const binInk = markInk(0, r.label);
      root
        .append("rect")
        .attr("x", start)
        .attr("y", y(r.value))
        .attr("width", Math.max(1, end - start - 1))
        .attr("height", bottom - y(r.value))
        .attr(
          "fill",
          style === "report" ? d3.interpolateRgb(paper, binInk)(0.18) : binInk,
        )
        .attr("stroke", style === "report" && r.value ? binInk : "none")
        .attr("stroke-width", 1)
        .append("title")
        .text(r.label + " · " + r.n + " of " + r.den);
    }
    pos = bottom + 38;
    block(a.x, Math.floor((w - 52) / 8), 13);
  } else if (v.chart === "stack") {
    for (const g of groups) {
      const series = records.filter((r) => r.group === g);
      const count = series[0]?.den;
      line(
        (g || a.x) + (count == null ? "" : " (n = " + count + ")"),
        margin,
        pos,
        13,
        true,
      );
      pos += 9;
      let x = margin;
      for (const r of series) {
        const n = ((w - 2 * margin) * r.value) / 100;
        root
          .append("rect")
          .attr("x", x)
          .attr("y", pos)
          .attr("width", n)
          .attr("height", theme.bar + 6)
          .attr("stroke", paper)
          .attr("stroke-width", 0.7)
          .attr("fill", markInk(labels.indexOf(r.label), r.label))
          .append("title")
          .text(r.label + " " + num(r.value) + "%");
        x += n;
      }
      pos += 44;
    }
    labels.forEach((l, i) => {
      pointMark(root, style, margin + 4, pos - 4, 4, markInk(i, l), paper);
      for (const t of wrap(l, Math.floor((w - 65) / (7.5 * theme.scale)))) {
        line(t, margin + 17, pos, 13, l === highlighted);
        pos += 20 * theme.scale;
      }
    });
  } else if (
    v.chart === "model" ||
    v.chart === "scatter" ||
    v.chart === "line"
  ) {
    const isModel = v.chart === "model",
      ps = isModel
        ? (a.predictions || []).map((p, i) => ({
            a: a.numericalPredictor ? Number(p.label) : i,
            b: p.value,
            g: "",
            ...p,
          }))
        : a.points;
    if (ps.length) {
      const h = 225,
        left = 68,
        right = w - 29,
        top = pos + 10,
        bottom = top + h;
      const x = d3
        .scaleLinear()
        .domain(d3.extent(ps, (p) => p.a))
        .nice()
        .range([left, right]);
      const y = d3
        .scaleLinear()
        .domain(d3.extent(ps.flatMap((p) => [p.low ?? p.b, p.high ?? p.b])))
        .nice()
        .range([bottom, top]);
      let axis = d3.axisBottom(x).ticks(theme.ticks);
      if (isModel && !a.numericalPredictor)
        axis = axis
          .tickValues(ps.map((p) => p.a))
          .tickFormat((i) => shorten(ps[i]?.label || "", 12));
      else if (a.date)
        axis = axis.tickFormat((n) => new Date(n).toISOString().slice(0, 10));
      root
        .append("g")
        .attr("transform", "translate(0," + bottom + ")")
        .call(axis);
      root
        .append("g")
        .attr("transform", "translate(" + left + ",0)")
        .call(d3.axisLeft(y).ticks(theme.ticks));
      line(a.y || a.unit, margin, pos - 4, 12);
      const series = [...new Set(ps.map((p) => p.g))];
      for (const [i, g] of series.entries()) {
        const points = ps.filter((p) => p.g === g).sort((a, b) => a.a - b.a);
        if (v.chart === "line")
          root
            .append("path")
            .attr(
              "d",
              d3
                .line()
                .x((p) => x(p.a))
                .y((p) => y(p.b))(points),
            )
            .attr("fill", "none")
            .attr("stroke", markInk(i, g))
            .attr("stroke-width", style === "presentation" ? 3.5 : 2)
            .attr(
              "stroke-dasharray",
              style === "report" && i % 2 ? "5 3" : null,
            );
        for (const p of points) {
          if (isModel)
            root
              .append("line")
              .attr("x1", x(p.a))
              .attr("x2", x(p.a))
              .attr("y1", y(p.low))
              .attr("y2", y(p.high))
              .attr("stroke", markInk(i, g))
              .attr("stroke-width", 2);
          pointMark(
            root,
            style,
            x(p.a),
            y(p.b),
            4 * theme.scale,
            markInk(i, g),
            paper,
          )
            .append("title")
            .text(
              [g, p.label || p.a, num(p.b)].filter((v) => v !== "").join(" · "),
            );
        }
      }
      pos = bottom + 43;
      block(a.x || "", Math.floor((w - 52) / 8), 13);
      for (const [i, g] of series.entries())
        if (g) {
          pointMark(
            root,
            style,
            margin + 4,
            pos - 4,
            4 * theme.scale,
            markInk(i, g),
            paper,
          );
          line(g, margin + 17, pos, 13, g === highlighted);
          pos += 18;
        }
    }
  } else if (groups.length > 1 && v.chart !== "small") {
    for (const label of labels) {
      line(label, margin, pos, 14, true);
      pos += 22;
      bars(
        records
          .filter((r) => r.label === label)
          .map((r) => ({ ...r, label: r.group })),
        v.chart,
      );
      pos += 6;
    }
  } else {
    for (const g of groups) {
      if (g) {
        line(g, margin, pos, 14, true);
        pos += theme.row;
      }
      bars(
        records.filter((r) => r.group === g),
        v.chart,
      );
      if (g) pos += 10;
    }
  }
  if (
    !(v.task === "patterns" && !a.selectedLabels.length) &&
    !records.length &&
    !a.excerpt?.length &&
    !a.points?.length &&
    !a.predictions?.length
  ) {
    block("No matching observations.", 65);
  }
  root
    .selectAll(".tick text")
    .attr("font-size", theme.axis)
    .attr("font-family", theme.font);
  root
    .selectAll(".domain, .tick line")
    .attr("stroke", style === "presentation" ? "#303030" : "#777");
  pos += 8;
  if (style === "report") {
    rule(pos - 3, w - margin, "#777", 0.8);
    pos += 14;
  }
  block(
    (a.unit ? a.unit + " · " : "") + a.note,
    Math.floor((w - 52) / 7.3),
    12,
  );
  if (v.annotation) {
    pos += 6;
    block(v.annotation, Math.floor((w - 52) / 8), 14);
  }
  const widthFinal = Number(root.attr("data-width")) || w;
  root
    .attr("viewBox", "0 0 " + widthFinal + " " + (pos + 14))
    .attr("width", widthFinal)
    .attr("height", pos + 14);
  root
    .insert("rect", ":first-child")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("fill", paper);
  return root.node();
}
export function combinedSVG(figures, layout = "horizontal") {
  const ns = "http://www.w3.org/2000/svg",
    out = document.createElementNS(ns, "svg");
  let dx = 0,
    dy = 0,
    width = 0,
    height = 0;
  for (const f of figures) {
    const copy = f.cloneNode(true),
      w = Number(f.getAttribute("width")),
      h = Number(f.getAttribute("height"));
    copy.setAttribute("x", dx);
    copy.setAttribute("y", dy);
    out.append(copy);
    width = Math.max(width, dx + w);
    height = Math.max(height, dy + h);
    if (layout === "horizontal") dx += w + 14;
    else dy += h + 14;
  }
  out.setAttribute("width", width);
  out.setAttribute("height", height);
  out.setAttribute("viewBox", "0 0 " + width + " " + height);
  return out;
}
export function blobSave(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.download = name;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export async function exportSVG(svg, type) {
  const xml = new XMLSerializer().serializeToString(svg),
    blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  if (type === "svg") {
    blobSave(blob, "data-visualiser.svg");
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const cv = document.createElement("canvas");
    const scale = Math.min(2, 12000 / Math.max(im.width, im.height));
    cv.width = im.width * scale;
    cv.height = im.height * scale;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    const png = await new Promise((r) => cv.toBlob(r, "image/png"));
    if (!png)
      throw Error("Could not create PNG. Select fewer records or use SVG.");
    if (type === "copy")
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
    else blobSave(png, "data-visualiser.png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
