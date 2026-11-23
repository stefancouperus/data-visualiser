import { esc } from "./chart.js";
import { get, modal } from "./ui.js";
import { figurePresentation, figureScope } from "./figure-edits.js";

export function editFigure(analysis, view, apply) {
  const { edits, dimensions, named, field, order } = figurePresentation(
    analysis,
    view,
    true,
  );
  const axes = ["scatter", "line", "model", "hist"].includes(view.chart);
  const fields = [
    ["title", "Figure title", analysis.title, view.title || analysis.title],
    ["annotation", "Caption or annotation", "", view.annotation || ""],
    ...(axes
      ? [
          ["axisX", "Horizontal axis label", analysis.x || ""],
          ["axisY", "Vertical axis label", analysis.y || analysis.unit || ""],
        ]
      : []),
    ...(analysis.unit
      ? [["unit", "Unit shown below the visual", analysis.unit]]
      : []),
    ...(view.chart === "table" && !["patterns", "words"].includes(view.task)
      ? [
          [
            "tableHeading",
            "Table heading",
            "Group  /  category                               Value",
          ],
        ]
      : []),
  ];
  let reset = false;
  const drafts = dimensions.map((dim) => ({
    ...dim,
    ordered: [...order(dim.key, dim.keys)],
    names: new Map(dim.keys.map((key) => [key, named(dim.key, key)])),
    values:
      dim.key === "labels" &&
      dim.keys.length === analysis.records?.length &&
      analysis.records.every(
        (r) => Number.isFinite(r.value) && !r.undefinedShare,
      )
        ? new Map(analysis.records.map((r) => [r.label, r.value]))
        : null,
  }));
  const section = (
    d,
    i,
  ) => `<fieldset class="figure-label-edit"><legend>${esc(d.title)}</legend>
    <label>Choose a label<select data-edit-choice="${i}"></select></label>
    <label>Display this label as<input data-edit-name="${i}" maxlength="250"></label>
    ${d.reorder ? `<div class="action-row"><button type="button" data-move="-1">Move up</button><button type="button" data-move="1">Move down</button><button type="button" class="plain" data-sort>Sort A–Z</button>${d.values ? '<button type="button" class="plain" data-rank>Highest first</button>' : ""}</div><small data-position aria-live="polite"></small>` : ""}
    </fieldset>`;
  modal(
    "Edit visual",
    fields
      .map(
        ([key, label, fallback, value]) =>
          `<label>${esc(label)}<input id="fig-${key}" maxlength="${key === "annotation" ? 1000 : 300}" value="${esc(value ?? field(key, fallback))}" placeholder="${esc(fallback)}"></label>`,
      )
      .join("") +
      (dimensions.length
        ? `<details class="figure-labels"><summary>Edit labels and order</summary>${drafts.map(section).join("")}</details>`
        : "") +
      (["line", "scatter", "hist", "model"].includes(view.chart)
        ? "<p><small>Numerical and date axes follow their scale. You can change their titles.</small></p>"
        : "") +
      '<p><small>Counts, quotations and the note about filters and sample size come from your data.</small></p><button type="button" id="fig-reset" class="plain">Restore original text and order</button>',
    () => {
      const next = {
        scope: figureScope(view),
        text: reset ? {} : { ...edits.text },
        dimensions: {},
      };
      for (const [key, , fallback] of fields) {
        if (key === "title" || key === "annotation") continue;
        const value = get("fig-" + key).value.trim();
        if (value && value !== fallback) next.text[key] = value;
        else delete next.text[key];
      }
      for (const { key, title, keys, ordered, names, reorder } of drafts) {
        const previous = (!reset && edits.dimensions?.[key]) || {};
        const visible = new Set(keys);
        const labels = new Map(
          (previous.names || []).filter(([id]) => !visible.has(id)),
        );
        const seen = new Set();
        for (const id of keys) {
          const name = names.get(id)?.trim() || id;
          if (seen.has(name))
            throw Error("Give each label a distinct name in " + title + ".");
          seen.add(name);
          if (name !== id) labels.set(id, name);
        }
        // Keep names and positions of categories omitted by an active filter.
        const oldOrder = Array.isArray(previous.order) ? previous.order : [];
        const requested = [...ordered];
        const fullOrder = oldOrder
          .map((id) => (visible.has(id) ? requested.shift() : id))
          .concat(requested);
        const hasOrder =
          reorder &&
          (oldOrder.length || ordered.some((key, i) => key !== keys[i]));
        if (labels.size || hasOrder || (!reorder && oldOrder.length))
          next.dimensions[key] = {
            names: [...labels],
            order: hasOrder ? fullOrder : oldOrder,
          };
      }
      for (const [key, value] of Object.entries(
        (!reset && edits.dimensions) || {},
      ))
        if (!dimensions.some((d) => d.key === key))
          next.dimensions[key] = value;
      const title = get("fig-title").value.trim();
      apply({
        title: title === analysis.title ? "" : title,
        annotation: get("fig-annotation").value.trim(),
        figureEdits: next,
      });
    },
    "Apply to visual",
  );
  const resetLabels = [];
  for (const [i, d] of drafts.entries()) {
    const select = document.querySelector(`[data-edit-choice="${i}"]`);
    const input = document.querySelector(`[data-edit-name="${i}"]`);
    const group = select.closest("fieldset");
    let current = d.ordered[0];
    const update = () => {
      select.replaceChildren(
        ...d.ordered.map((key) => new Option(d.names.get(key) || key, key)),
      );
      select.value = current;
      input.value = d.names.get(current) || current;
      if (!d.reorder) return;
      const at = d.ordered.indexOf(current);
      group.querySelector('[data-move="-1"]').disabled = !at;
      group.querySelector('[data-move="1"]').disabled =
        at === d.ordered.length - 1;
      group.querySelector("[data-position]").textContent =
        "Position " + (at + 1) + " of " + d.ordered.length;
    };
    select.onchange = () => {
      current = select.value;
      update();
    };
    input.oninput = () => {
      d.names.set(current, input.value);
      select.selectedOptions[0].textContent = input.value || current;
    };
    for (const btn of group.querySelectorAll("[data-move]"))
      btn.onclick = () => {
        const at = d.ordered.indexOf(current),
          dest = at + Number(btn.dataset.move);
        if (dest < 0 || dest >= d.ordered.length) return;
        d.ordered.splice(dest, 0, d.ordered.splice(at, 1)[0]);
        update();
      };
    if (d.reorder)
      group.querySelector("[data-sort]").onclick = () => {
        d.ordered.sort((a, b) =>
          (d.names.get(a) || a).localeCompare(d.names.get(b) || b, undefined, {
            numeric: true,
          }),
        );
        update();
      };
    const rankButton = group.querySelector("[data-rank]");
    if (rankButton)
      rankButton.onclick = () => {
        d.ordered.sort((a, b) => d.values.get(b) - d.values.get(a));
        update();
      };
    resetLabels.push(() => {
      d.ordered = [...d.keys];
      d.names = new Map(d.keys.map((key) => [key, key]));
      current = d.ordered[0];
      update();
    });
    update();
  }
  get("fig-reset").onclick = () => {
    reset = true;
    for (const [key, , fallback] of fields) get("fig-" + key).value = fallback;
    for (const restore of resetLabels) restore();
  };
}
