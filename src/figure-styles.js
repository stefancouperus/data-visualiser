export const figureStyles = {
  workshop: {
    label: "Workshop",
    description: "Solid bars and round points on a clean white chart.",
    font: "Arial, sans-serif",
    headingFont: "Arial, sans-serif",
    title: 18,
    scale: 1,
    row: 24,
    radius: 2,
    bar: 13,
    axis: 11,
    ticks: 5,
    palette: "studio",
  },
  report: {
    label: "Research report",
    description:
      "Outlined bars, open squares and serif headings on warm paper.",
    font: "Arial, sans-serif",
    headingFont: "Georgia, serif",
    title: 19,
    scale: 0.94,
    row: 22,
    radius: 0,
    bar: 11,
    axis: 10,
    ticks: 5,
    palette: "archive",
  },
  policy: {
    label: "Policy brief",
    description:
      "Slim bars with end caps, ring markers and an optional highlight.",
    font: "Arial, sans-serif",
    headingFont: "Arial, sans-serif",
    title: 23,
    scale: 1,
    row: 26,
    radius: 0,
    bar: 15,
    axis: 12,
    ticks: 5,
    palette: "forest",
  },
  presentation: {
    label: "Presentation",
    description: "A dark title band, bold rounded bars and diamond markers.",
    font: "Arial, sans-serif",
    headingFont: "Arial, sans-serif",
    title: 27,
    scale: 1.22,
    row: 33,
    radius: 12,
    bar: 21,
    axis: 15,
    ticks: 4,
    palette: "bright",
  },
};

// Categorical colours distinguish named series; each heatmap uses a separate
// light-to-dark ramp so a larger number is always shown with a darker cell.
export const palettes = {
  studio: {
    label: "Studio blue",
    series: [
      "#2859be",
      "#10837c",
      "#c16a19",
      "#8754a3",
      "#50832f",
      "#bf4e78",
      "#477d96",
      "#725b46",
    ],
    ramp: ["#eff5ff", "#91b7ef", "#173d86"],
  },
  archive: {
    label: "Burgundy and slate",
    series: [
      "#823447",
      "#49627a",
      "#937638",
      "#4e7165",
      "#86627e",
      "#4e4257",
      "#ac6550",
      "#77796a",
    ],
    ramp: ["#faf3ef", "#d2a5a7", "#662238"],
  },
  forest: {
    label: "Forest and ochre",
    series: [
      "#086858",
      "#bc7716",
      "#427f98",
      "#84556f",
      "#73923d",
      "#9d5832",
      "#426b83",
      "#605344",
    ],
    ramp: ["#edf7ed", "#8cc9a3", "#075346"],
  },
  bright: {
    label: "Violet and coral",
    series: [
      "#7040ce",
      "#c44b51",
      "#007b98",
      "#ba7510",
      "#367446",
      "#b43c87",
      "#3d64bf",
      "#80553a",
    ],
    ramp: ["#f4efff", "#bb9bf2", "#50228d"],
  },
  coast: {
    label: "Ocean blues",
    series: [
      "#00658a",
      "#3784ad",
      "#16416c",
      "#008078",
      "#6664a0",
      "#517c89",
      "#2c5294",
      "#77577f",
    ],
    ramp: ["#eef9fb", "#80c8d1", "#123e68"],
  },
  grey: {
    label: "Greyscale",
    series: [
      "#303030",
      "#727272",
      "#959595",
      "#545454",
      "#ababab",
      "#656565",
      "#848484",
      "#474747",
    ],
    ramp: ["#f5f5f5", "#b0b0b0", "#333333"],
  },
};

export const paletteOptions = [
  ["colour", "Use the style’s colours"],
  ...Object.entries(palettes).map(([key, p]) => [key, p.label]),
];
export const paletteFor = (style, choice) =>
  palettes[
    Object.hasOwn(palettes, choice)
      ? choice
      : figureStyles[styleFor(style)].palette
  ];

export const styleFor = (name) =>
  Object.hasOwn(figureStyles, name) ? name : "workshop";

export function highlightChoices(a, v) {
  if (["scatter", "line"].includes(v.chart))
    return [...new Set(a.points.map((p) => p.g).filter(Boolean))];
  if (
    ![
      "bars",
      "dots",
      "stack",
      "small",
      "grid",
      "presence",
      "hist",
      "box",
      "table",
    ].includes(v.chart)
  )
    return [];
  if (v.task === "words" && v.chart === "table") return [];
  if (v.task === "patterns" && a.groupLabel)
    return [...new Set(a.records.map((r) => r.groupValue))];
  const groups = [...new Set(a.records.map((r) => r.group).filter(Boolean))];
  return (["bars", "dots", "small"].includes(v.chart) ||
    (v.task === "patterns" && v.chart === "table")) &&
    groups.length > 1
    ? groups
    : [...new Set(a.records.map((r) => r.label))];
}
