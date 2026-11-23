import { filteredRows } from "./import.js";
import { paragraph, run, wordDocumentBytes } from "./word-package.js";

const prepared = new WeakMap();
const line = (text, style) => paragraph(run(text), style);
const utc = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function logTimestamp(at) {
  const date = new Date(at);
  return Number.isFinite(date.getTime()) ? utc.format(date) : "";
}

function reportContent(p, describe) {
  const blocks = [];
  const add = (style, text) => {
    if (text) blocks.push([style, text]);
  };
  add("Title", "Project report");
  add("Heading2", p.name);
  if (p.researchFocus) {
    add("Heading1", "Research question or puzzle");
    add("Normal", p.researchFocus);
  }
  add("Heading1", "Project data");
  for (const d of p.datasets) {
    if (d.kind === "table") {
      const included = d.rules?.length ? filteredRows(d).length : d.rows.length;
      add(
        "Normal",
        d.name +
          " · " +
          included +
          " of " +
          d.rows.length +
          " records included.",
      );
    } else {
      const sources = d.sources.length;
      const unit = d.interviews ? "interview" : "source";
      add(
        "Normal",
        d.name +
          " · " +
          sources +
          " " +
          unit +
          (sources === 1 ? "" : "s") +
          "." +
          (d.interviews
            ? " Interviews marked as checked: " + d.interviews.done.length + "."
            : ""),
      );
    }
  }

  const saved = [...(p.savedVisuals || []), ...(p.saved || [])];
  if (saved.length) add("Heading1", "Saved visuals and comparisons");
  for (const item of saved) {
    const dataset = p.datasets.find((d) => d.id === item.dataset);
    if (!dataset) continue;
    add("Heading2", item.name);
    if (item.note) add("Normal", item.note);
    const views = item.views || [item.view];
    for (const [index, view] of views.entries()) {
      if (!view) continue;
      if (views.length > 1)
        add("LogMeta", index === 0 ? "Left view" : "Right view");
      if (view.annotation) add("Normal", view.annotation);
      if (describe) {
        try {
          for (const text of describe(dataset, view, index, views))
            add("Normal", text);
        } catch {
          add(
            "Normal",
            "This figure cannot currently be calculated. Open its saved view to review the selection.",
          );
        }
      }
    }
  }
  add("Heading1", "Activity and findings");
  for (const entry of p.workLog || []) {
    add(
      "LogMeta",
      [logTimestamp(entry.at), entry.source].filter(Boolean).join(" · "),
    );
    add("Heading2", entry.title);
    for (const detail of entry.details || []) add("Normal", detail);
  }
  if (!p.workLog?.length)
    add(
      "Normal",
      "The activity log begins when work is recorded in this version of Data visualiser.",
    );
  return blocks;
}

// The background copy stays in memory. The ZIP and Word download both request the
// current content again, which also covers a download before the idle callback.
export function projectWordReport(project, describe) {
  const blocks = reportContent(project, describe);
  const signature = JSON.stringify(blocks);
  let cached = prepared.get(project);
  if (!cached) prepared.set(project, (cached = {}));
  if (cached.signature !== signature) {
    cached.bytes = wordDocumentBytes(
      blocks.map(([style, text]) => line(text, style)),
    );
    cached.signature = signature;
  }
  return cached.bytes;
}

export function scheduleWordReport(project, describe) {
  if (!project.datasets.length) return;
  let state = prepared.get(project);
  if (!state) prepared.set(project, (state = {}));
  const log = project.workLog || [];
  const revision = JSON.stringify([
    project.name,
    project.researchFocus,
    log.length,
    log.at(-1),
    project.datasets.map((d) => [
      d.id,
      d.name,
      d.rules,
      d.rows?.length,
      d.sources?.length,
      d.interviews?.done.length,
    ]),
    project.savedVisuals,
    project.saved,
  ]);
  if (state.scheduledRevision === revision) return;
  state.scheduledRevision = revision;
  if (state.waiting) return;
  state.waiting = true;
  const prepare = () => {
    state.waiting = false;
    try {
      projectWordReport(project, describe);
    } catch {
      state.scheduledRevision = undefined;
    } // The download path can retry and report an error.
  };
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(prepare, { timeout: 1600 });
  else setTimeout(prepare, 200);
}
