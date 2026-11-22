import * as d3 from "d3";
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const colours = [
  "#2859be",
  "#13806f",
  "#9d541e",
  "#8052aa",
  "#1d839a",
  "#bc5275",
  "#526c40",
  "#745c48",
];
const grey = ["#26333c", "#4b5863", "#697884", "#87929a", "#a5abb1"];
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
export function figure(a, v, { width = 700 } = {}) {
  const root = d3
    .create("svg")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("role", "img")
    .attr("aria-label", a.title)
    .attr("font-family", "Arial, sans-serif")
    .attr("font-size", 14)
    .attr("fill", "#253346");
  const w = width,
    margin = 22,
    palette = v.palette === "grey" ? grey : colours;
  let pos = 27;
  function line(t, x = margin, y = pos, size = 14, bold = false) {
    return root
      .append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("font-size", size)
      .attr("font-weight", bold ? 650 : 400)
      .text(t);
  }
  function block(s, n, size = 14, bold = false) {
    for (const t of wrap(s, n)) {
      line(t, margin, pos, size, bold);
      pos += size + 6;
    }
  }
  block(a.title, Math.floor((w - 48) / 10), 18, true);
  pos += 12;
  const records = a.records || [],
    groups = [...new Set(records.map((r) => r.group))],
    labels = [...new Set(records.map((r) => r.label))];
  const ink = (i) => palette[i % palette.length];
  function bars(list, mark) {
    if (!list.length) return;
    const max = Math.max(1, ...records.map((r) => r.value)),
      left = Math.min(w * 0.36, 215);
    const scale = d3.scaleLinear([0, max], [0, w - left - 85]);
    for (const r of list) {
      line(shorten(r.label, Math.floor(left / 8.1)), margin, pos + 5)
        .append("title")
        .text(r.label);
      const colour = ink(Math.max(0, groups.indexOf(r.group)));
      if (mark === "dots")
        root
          .append("circle")
          .attr("cx", left + scale(r.value))
          .attr("cy", pos)
          .attr("r", 4.6)
          .attr("fill", colour);
      else
        root
          .append("rect")
          .attr("x", left)
          .attr("y", pos - 7)
          .attr("width", scale(r.value))
          .attr("height", 13)
          .attr("rx", 2)
          .attr("fill", colour);
      line(
        num(r.value) + (a.unit.startsWith("%") ? "%" : ""),
        left + scale(r.value) + 9,
        pos + 5,
        13,
      );
      pos += 24;
    }
  }
  if (v.chart === "excerpts") {
    for (const p of a.excerpt) {
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
    for (const r of records) {
      block(
        (r.group ? r.group + "  /  " : "") +
          r.label +
          "     " +
          num(r.value) +
          (a.unit.startsWith("%") ? "%" : "") +
          (r.den != null ? "   (" + r.n + " of " + r.den + ")" : ""),
        Math.floor((w - 52) / 8),
      );
    }
  } else if (["grid", "presence"].includes(v.chart)) {
    const labelW = Math.min(175, w * 0.28),
      cw = Math.max(65, (w - labelW - 45) / Math.max(1, labels.length)),
      max = Math.max(1, ...records.map((r) => r.value));
    root.attr("data-width", Math.max(w, labelW + 45 + cw * labels.length));
    labels.forEach((name, i) =>
      line(
        shorten(name, Math.max(7, Math.floor(cw / 8))),
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
            .attr("cursor", "pointer");
          cell
            .append("rect")
            .attr("x", margin + labelW + i * cw)
            .attr("y", pos)
            .attr("width", cw - 3)
            .attr("height", 33)
            .attr("rx", 3)
            .attr("fill", d3.interpolate("#f1f4f8", ink(0))(value / max));
          cell
            .append("text")
            .attr("x", margin + labelW + (i + 0.5) * cw)
            .attr("y", pos + 22)
            .attr("text-anchor", "middle")
            .attr("fill", value / max > 0.55 ? "white" : "#253346")
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
      .call(d3.axisLeft(y).ticks(5));
    root
      .append("g")
      .attr("transform", "translate(0," + bottom + ")")
      .call(d3.axisBottom(x).ticks(6));
    for (const r of records) {
      const start = x(lo === hi ? lo - 0.5 : r.lo),
        end = x(lo === hi ? hi + 0.5 : r.hi);
      root
        .append("rect")
        .attr("x", start)
        .attr("y", y(r.value))
        .attr("width", Math.max(1, end - start - 1))
        .attr("height", bottom - y(r.value))
        .attr("fill", ink(0))
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
          .attr("height", 22)
          .attr("fill", ink(labels.indexOf(r.label)))
          .append("title")
          .text(r.label + " " + num(r.value) + "%");
        x += n;
      }
      pos += 44;
    }
    labels.forEach((l, i) => {
      root
        .append("circle")
        .attr("cx", margin + 4)
        .attr("cy", pos - 4)
        .attr("r", 4)
        .attr("fill", ink(i));
      line(l, margin + 17, pos, 13);
      pos += 20;
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
      let axis = d3.axisBottom(x).ticks(5);
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
        .call(d3.axisLeft(y).ticks(5));
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
            .attr("stroke", ink(i))
            .attr("stroke-width", 2);
        for (const p of points) {
          if (isModel)
            root
              .append("line")
              .attr("x1", x(p.a))
              .attr("x2", x(p.a))
              .attr("y1", y(p.low))
              .attr("y2", y(p.high))
              .attr("stroke", ink(i))
              .attr("stroke-width", 2);
          root
            .append("circle")
            .attr("cx", x(p.a))
            .attr("cy", y(p.b))
            .attr("r", 4)
            .attr("fill", ink(i))
            .attr("opacity", 0.85)
            .append("title")
            .text(
              [g, p.label || p.a, num(p.b)].filter((v) => v !== "").join(" · "),
            );
        }
      }
      pos = bottom + 43;
      line(a.x || "", left, pos, 13);
      pos += 21;
      for (const [i, g] of series.entries())
        if (g) {
          line(g, margin, pos, 13).attr("fill", ink(i));
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
        pos += 24;
      }
      bars(
        records.filter((r) => r.group === g),
        v.chart,
      );
      if (g) pos += 10;
    }
  }
  if (
    !records.length &&
    !a.excerpt?.length &&
    !a.points?.length &&
    !a.predictions?.length
  ) {
    block("No matching observations.", 65);
  }
  pos += 8;
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
    .attr("fill", "white");
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
