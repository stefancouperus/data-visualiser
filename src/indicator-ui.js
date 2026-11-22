// A wide survey export and a coded spreadsheet can both store one flag per
// column. Keep the column label, but confirm what its actual cell values mean.
import { esc } from "./chart.js";

export function indicatorColumns(fields, name) {
  return fields
    .map(
      (f) =>
        `<div><label class="tick"><input name="${name}" type="checkbox" value="${f.id}">${esc(f.label)}</label><div data-markers-for="${f.id}" hidden></div></div>`,
    )
    .join("");
}

export function bindIndicatorColumns(d, name) {
  for (const box of document.querySelectorAll(`input[name="${name}"]`)) {
    const panel = box.closest("div").querySelector("[data-markers-for]");
    box.onchange = () => {
      panel.hidden = !box.checked;
      if (!box.checked || panel.childElementCount) return;
      const values = [
        ...new Set(d.rows.map((row) => row[box.value]).filter(Boolean)),
      ];
      const binary =
        values.length === 2 &&
        [
          ["0", "1"],
          ["false", "true"],
          ["no", "yes"],
        ].find((pair) =>
          pair.every((v) => values.some((s) => s.toLowerCase() === v)),
        );
      panel.innerHTML =
        "<fieldset><legend>Which recorded values mean selected?</legend>" +
        values
          .map(
            (s) =>
              `<label class="tick"><input type="checkbox" data-marker value="${esc(s)}" ${(binary ? s.toLowerCase() === binary[1] : values.length === 1 && !["0", "no", "false"].includes(s.toLowerCase())) ? "checked" : ""}>${esc(s)}</label>`,
          )
          .join("") +
        `<label class="tick"><input type="checkbox" data-none ${values.length ? "" : "checked"}>None of the recorded values</label></fieldset>`;
      panel.onchange = (e) => {
        if (!e.target.checked) return;
        if (e.target.hasAttribute("data-none"))
          panel.querySelectorAll("[data-marker]").forEach((c) => {
            c.checked = false;
          });
        else panel.querySelector("[data-none]").checked = false;
      };
    };
  }
}

export function readIndicators(fields, name) {
  const result = new Map();
  for (const f of fields) {
    const box = document.querySelector(
      `input[name="${name}"][value="${f.id}"]`,
    );
    if (!box?.checked) continue;
    const panel = box.closest("div").querySelector("[data-markers-for]");
    const markers = new Set(
      [...panel.querySelectorAll("[data-marker]:checked")].map((c) => c.value),
    );
    if (!markers.size && !panel.querySelector("[data-none]")?.checked)
      throw Error(
        "Choose which recorded values mean selected for “" +
          f.label +
          "”, or choose none.",
      );
    result.set(f.id, markers);
  }
  return result;
}
