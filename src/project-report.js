import { esc } from "./chart.js";
import { filteredRows } from "./import.js";
import { transcriptIndex } from "./transcript-index.js";
import { sharedBook } from "./interviews.js";
import { labelAppearance } from "./label-appearance.js";
import { labelKey } from "./coding.js";
import { logTimestamp } from "./project-word-report.js";

function listing(headings, rows) {
  if (!rows.length) return "";
  return (
    "<table><thead><tr>" +
    headings.map((c) => "<th>" + esc(c) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows
      .map(
        (row) =>
          "<tr>" +
          row.map((c) => "<td>" + esc(c || "—") + "</td>").join("") +
          "</tr>",
      )
      .join("") +
    "</tbody></table>"
  );
}

export function projectReport(project, drawFigure) {
  const sections = [];
  if (project.researchFocus)
    sections.push(
      "<h2>Research question or puzzle</h2><p>" +
        esc(project.researchFocus) +
        "</p>",
    );
  for (const d of project.datasets) {
    const body = [];
    if (d.kind === "table") {
      body.push(
        "<p>" +
          filteredRows(d).length +
          " of " +
          d.rows.length +
          " records included after project exclusions.</p>",
      );
      if (d.explanation) body.push("<p>" + esc(d.explanation) + "</p>");
      body.push(
        listing(
          ["Question or variable", "Role in this project"],
          d.fields
            .filter((f) => f.type !== "metadata")
            .map((f) => [
              f.label,
              (f.roles || [])
                .map((r) =>
                  r === "open"
                    ? "Written answer"
                    : r.charAt(0).toUpperCase() + r.slice(1),
                )
                .join(", "),
            ]),
        ),
      );
      if (d.rules?.length)
        body.push(
          "<p>Excluded records matching " +
            d.rules
              .map(
                (r) =>
                  esc(
                    d.fields.find((f) => f.id === r.field)?.label || r.field,
                  ) +
                  " = " +
                  esc(r.value),
              )
              .join(" or ") +
            ".</p>",
        );
    } else {
      const index = transcriptIndex(d.passages);
      const counts = new Map();
      for (const p of index.originals)
        counts.set(p.source, (counts.get(p.source) || 0) + 1);
      body.push(
        listing(
          [
            "Interview or source",
            "Original passages",
            ...(d.interviews ? ["Coding review"] : []),
          ],
          d.sources.map((s) => [
            s,
            String(counts.get(s) || 0),
            ...(d.interviews
              ? [d.interviews.done?.includes(s) ? "Checked" : "In progress"]
              : []),
          ]),
        ),
      );
      const labels = sharedBook(d);
      const appearance = labelAppearance(d);
      if (labels.length)
        body.push(
          "<h3>Project labels</h3>",
          listing(
            ["Label", "Definition", "Category"],
            labels.map((e) => [
              e.label,
              e.definition,
              appearance.get(labelKey(e.label))?.category,
            ]),
          ),
        );
    }
    const drawings = [];
    const working =
      d.id === project.active ? project : project.workingViews?.[d.id];
    if (project.confirmed.includes(d.id) && working?.views?.length)
      drawings.push({
        name: "Current view" + (working.comparisonStarted ? "s" : ""),
        views: working.comparisonStarted
          ? working.views
          : working.views.slice(0, 1),
      });
    for (const item of project.savedVisuals || [])
      if (item.dataset === d.id)
        drawings.push({ name: item.name, views: [item.view] });
    for (const item of project.saved || [])
      if (item.dataset === d.id) drawings.push(item);
    for (const item of drawings) {
      body.push("<h3>" + esc(item.name) + "</h3>");
      if (item.note) body.push("<p>" + esc(item.note) + "</p>");
      for (const [i, v] of item.views.entries()) {
        try {
          body.push("<figure>" + drawFigure(d, v, i, item.views) + "</figure>");
        } catch (e) {
          body.push("<p>Figure unavailable. " + esc(e.message) + "</p>");
        }
      }
    }
    sections.push(
      "<section><h2>" + esc(d.name) + "</h2>" + body.join("") + "</section>",
    );
  }
  if (project.workLog?.length) {
    sections.push(
      "<section><h2>Activity and findings</h2>" +
        project.workLog
          .map(
            (entry) =>
              "<h3>" +
              esc(entry.title) +
              "</h3><p>" +
              esc(
                [logTimestamp(entry.at), entry.source]
                  .filter(Boolean)
                  .join(" · "),
              ) +
              "</p>" +
              entry.details
                .map((detail) => "<p>" + esc(detail) + "</p>")
                .join(""),
          )
          .join("") +
        "</section>",
    );
  }
  return (
    '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(project.name) +
    " — project report</title><style>body{font:16px/1.55 system-ui,sans-serif;color:#20252a;max-width:54rem;margin:3rem auto;padding:0 1.2rem}h1,h2,h3{line-height:1.2}h2{margin-top:2em}p,td,th{overflow-wrap:anywhere;white-space:pre-line}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;text-align:left;vertical-align:top;padding:.45rem .6rem}th{background:#f2f3f4}figure{margin:1rem 0}svg{max-width:100%;height:auto}@media print{body{font-size:10pt;margin:0}h2,h3{break-after:avoid}figure,tr{break-inside:avoid}thead{display:table-header-group}}</style></head><body><h1>" +
    esc(project.name) +
    "</h1><p>Data visualiser project report</p>" +
    sections.join("") +
    "</body></html>"
  );
}
