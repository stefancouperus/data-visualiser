export const figureStyles = {
  workshop: {
    label: "Workshop",
    description: "Clear labels for exploring your data.",
    font: "Arial, sans-serif",
    headingFont: "Arial, sans-serif",
    title: 18,
    scale: 1,
    row: 24,
    radius: 2,
    bar: 13,
    axis: 11,
    ticks: 5,
    accent: "#2859be",
  },
  report: {
    label: "Research report",
    description: "Compact spacing, serif headings and a ruled figure note.",
    font: "Arial, sans-serif",
    headingFont: "Georgia, serif",
    title: 19,
    scale: 0.94,
    row: 22,
    radius: 0,
    bar: 11,
    axis: 10,
    ticks: 5,
    accent: "#303030",
  },
  policy: {
    label: "Policy brief",
    description: "A headline and an optional highlight for one comparison.",
    font: "Arial, sans-serif",
    headingFont: "Arial, sans-serif",
    title: 23,
    scale: 1,
    row: 26,
    radius: 0,
    bar: 15,
    axis: 12,
    ticks: 5,
    accent: "#086858",
  },
  presentation: {
    label: "Presentation",
    description: "Large type and heavier marks for a classroom screen.",
    font: "Arial, sans-serif",
    headingFont: "Arial, sans-serif",
    title: 27,
    scale: 1.22,
    row: 33,
    radius: 3,
    bar: 19,
    axis: 15,
    ticks: 4,
    accent: "#224486",
  },
};

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
      "table",
    ].includes(v.chart)
  )
    return [];
  const groups = [...new Set(a.records.map((r) => r.group).filter(Boolean))];
  return ["bars", "dots", "small"].includes(v.chart) && groups.length > 1
    ? groups
    : [...new Set(a.records.map((r) => r.label))];
}
