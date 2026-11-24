import { esc } from "./chart.js";
import { quotationRanges } from "./interview-manual.js";
import { groupValue } from "./patterns.js";
import { passageUnits, transcriptIndex } from "./transcript-index.js";
import { get, modal } from "./ui.js";

// Highlight only located assignments for the clicked theme. A whole-passage
// assignment or an ambiguous quotation remains readable in its original context.
function evidenceText(original, index, theme) {
  const ranges = quotationRanges(index, original).filter((r) =>
    r.labels.has(theme),
  );
  const output = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.end <= cursor) continue;
    const start = Math.max(cursor, range.start);
    output.push(
      esc(original.text.slice(cursor, start)),
      "<mark>",
      esc(original.text.slice(start, range.end)),
      "</mark>",
    );
    cursor = range.end;
  }
  return output.join("") + esc(original.text.slice(cursor));
}

export function showThemePassages(
  dataset,
  included,
  view,
  analysis,
  cell,
  openTranscript,
) {
  const theme = cell.label,
    comparison = cell.groupValue;
  const sources = included.sources.filter(
    (s) =>
      (!view.filter ||
        (view.filter === "source"
          ? s
          : included.metadata?.[s]?.[view.filter]) === view.value) &&
      (view.groupBy ? groupValue(included, view.groupBy, s) : s) === comparison,
  );
  const allowed = new Set(sources);
  const matches = passageUnits(
    included.passages.filter((p) => allowed.has(p.source)),
  ).filter((p) => p.codes.includes(theme));
  const index = transcriptIndex(dataset.passages);
  const interviews = new Set(matches.map((p) => p.source)).size;
  const unit = analysis.themeComparison.unit;
  const count =
    unit === "themePassageShare"
      ? `${comparison} contributed ${cell.n} of the ${cell.den} original passages coded with this theme across the displayed ${view.groupBy ? "groups" : "interviews"}.`
      : unit === "interviewShare"
        ? `${cell.n} of ${cell.den} interviews contained this theme.`
        : `${cell.n} of ${cell.den} original passages contained this theme.`;
  const title = `<p><strong>${esc(theme)}</strong> · ${esc(comparison)}</p><p>${esc(count)}</p>`;
  modal(
    "Passages behind this pattern",
    title + '<div id="theme-evidence"></div>',
  );
  const list = get("theme-evidence"),
    pageSize = 25;
  let start = 0;
  function render() {
    if (!matches.length) {
      list.textContent = cell.den
        ? "No matching coded passages in this selection."
        : "There are no passages behind this cell.";
      return;
    }
    const visible = matches.slice(start, start + pageSize);
    const total = matches.length;
    const caption = `${total} matching ${total === 1 ? "passage" : "passages"} from ${interviews} ${interviews === 1 ? "interview" : "interviews"}.`;
    list.innerHTML =
      `<p>${caption}</p><div class="scroll"><table><thead><tr><th>Interview</th><th>Original passage</th><th>Transcript</th></tr></thead><tbody>${visible
        .map((p, i) => {
          const original = index.positions.get(p.id).original;
          const number = index.numbers.get(p.id);
          return `<tr><td>${esc(p.source)}</td><td>${evidenceText(original, index, theme)}</td><td><button type="button" data-open-original="${start + i}" aria-label="Open passage ${number} in ${esc(p.source)}">Passage ${number}</button></td></tr>`;
        })
        .join("")}</tbody></table></div>` +
      (total > pageSize
        ? `<div class="bar"><button type="button" data-evidence-page="-1" ${!start ? "disabled" : ""}>Previous passages</button><span>${start + 1}–${start + visible.length} of ${total}</span><button type="button" data-evidence-page="1" ${start + visible.length >= total ? "disabled" : ""}>Next passages</button></div>`
        : "");
  }
  list.onclick = (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-open-original")) {
      openTranscript(matches[Number(button.dataset.openOriginal)]);
    } else if (button.hasAttribute("data-evidence-page")) {
      start += Number(button.dataset.evidencePage) * pageSize;
      render();
      list.querySelector("button")?.focus();
    }
  };
  render();
}
