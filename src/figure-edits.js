// Presentation stays attached to the selected variables. The analysis and its
// evidence keys always retain the original responses, themes and quantities.
export function figureScope(v) {
  return JSON.stringify(
    [
      v.task,
      v.x,
      v.y,
      v.z,
      v.groupBy,
      v.items,
      v.patternMode,
      v.outcome,
      v.predictors,
    ].map((value) => value || null),
  );
}

export function figureParts(a, v) {
  const rows = a.records || [];
  const dimensions = [];
  function add(key, title, values, reorder = true) {
    const keys = [...new Set(values.filter((k) => k != null && k !== ""))];
    if (keys.length)
      dimensions.push({
        key,
        title,
        keys,
        reorder: reorder && keys.length > 1,
      });
  }
  if (["line", "scatter"].includes(v.chart))
    add(
      "series",
      "Lines and legend",
      (a.points || []).map((p) => p.g),
    );
  else if (v.chart === "model" && !a.numericalPredictor)
    add(
      "predictions",
      "Categories on the horizontal axis",
      (a.predictions || []).map((p) => p.label),
    );
  else if (v.chart === "excerpts") {
    add(
      "sources",
      "Source names",
      (a.excerpt || []).map((p) => p.source),
      false,
    );
    add(
      "codes",
      "Theme names",
      (a.excerpt || []).flatMap((p) => p.codes || []),
      false,
    );
  } else if (v.task === "words") {
    add(
      "headers",
      "Column headings",
      ["Word", "Occurrences", "Passages", a.sourcesLabel],
      false,
    );
  } else if (v.chart !== "hist") {
    if (a.groupLabel) {
      add(
        "groups",
        "Row headings",
        rows.map((r) => r.group),
      );
      add(
        "subgroups",
        "Subgroups",
        rows.map((r) => r.groupValue),
      );
    } else {
      add(
        "labels",
        v.chart === "box" ? "Group labels" : "Category labels",
        rows.map((r) => r.label),
      );
      if (v.chart !== "box")
        add(
          "groups",
          "Group or series names",
          rows.map((r) => r.group),
        );
    }
    if (
      v.task === "patterns" &&
      v.patternMode === "together" &&
      v.chart !== "grid"
    )
      add("questions", "Question headings", a.selectedLabels || [], false);
  }
  return dimensions;
}

export function figurePresentation(a, v, editing = false) {
  if (!editing && (!v.figureEdits || v.figureEdits.scope !== figureScope(v)))
    return {
      named: (_kind, name) => name,
      field: (_key, fallback) => fallback,
      order: (_kind, keys) => keys,
      records: a.records || [],
    };
  const edits = v.figureEdits?.scope === figureScope(v) ? v.figureEdits : {};
  const dimensions = figureParts(a, v);
  const aliases = new Map(),
    ranks = new Map();
  for (const { key, keys, reorder } of dimensions) {
    const setting = edits.dimensions?.[key];
    aliases.set(
      key,
      new Map(Array.isArray(setting?.names) ? setting.names : []),
    );
    if (reorder && Array.isArray(setting?.order) && setting.order.length) {
      const order = [...new Set([...setting.order, ...keys])];
      ranks.set(key, new Map(order.map((name, index) => [name, index])));
    }
  }
  const named = (kind, key) => aliases.get(kind)?.get(key) || key;
  const field = (key, fallback) => edits.text?.[key] || fallback;
  const order = (kind, keys) => {
    const rank = ranks.get(kind);
    return rank ? [...keys].sort((a, b) => rank.get(a) - rank.get(b)) : keys;
  };
  let records = a.records || [];
  if (["labels", "groups", "subgroups"].some((kind) => ranks.has(kind))) {
    // Keep each heading and its rows together. Every cell retains its original
    // index for opening the source evidence after reordering.
    const cols = a.groupLabel
      ? [
          ["groups", "group"],
          ["subgroups", "groupValue"],
        ]
      : v.chart === "box"
        ? [["labels", "label"]]
        : [
            ["groups", "group"],
            ["labels", "label"],
          ];
    const criteria = cols.map(([key, prop]) => [
      prop,
      ranks.get(key) ||
        new Map(
          [...new Set(records.map((r) => r[prop]))].map((name, index) => [
            name,
            index,
          ]),
        ),
    ]);
    records = [...records].sort((a, b) => {
      for (const [prop, rank] of criteria) {
        const diff = rank.get(a[prop]) - rank.get(b[prop]);
        if (diff) return diff;
      }
      return 0;
    });
  }
  return { edits, dimensions, named, field, order, records };
}

// A filter can use a different question with the same answer text. Only use
// aliases belonging to the filtered variable, never a global string replacement.
export function filterDisplayValue(dataset, view, analysis) {
  const value = view.value;
  if (!view.figureEdits || !value) return value;
  let dimension;
  if (view.filter === view.groupBy) dimension = "subgroups";
  else if (dataset.kind === "text" && view.filter === "source") {
    if (view.chart === "excerpts") dimension = "sources";
    else if (view.task === "group" || view.patternMode === "sources")
      dimension = "groups";
    else if (view.task === "one") dimension = "labels";
  } else if (dataset.kind === "table") {
    if (view.task === "model" && view.filter === view.predictors?.[0])
      dimension = "predictions";
    else if (view.filter === view.z) dimension = "series";
    else if (view.filter === view.x) dimension = "labels";
    else if (view.filter === view.y)
      dimension = view.chart === "box" ? "labels" : "groups";
  }
  return dimension
    ? figurePresentation(analysis, view).named(dimension, value)
    : value;
}

// The model uses the first predictor for the editable horizontal categories.
// Other predictors may contain identically named levels and retain their labels.
export function modelDisplayTerm(term, model, view) {
  const prefix = model.predictor + " = ";
  if (!view.figureEdits || model.numericalPredictor || !term.startsWith(prefix))
    return term;
  const value = term.slice(prefix.length);
  const { named } = figurePresentation(model, view);
  const exact = named("predictions", value);
  if (exact !== value) return prefix + exact;
  const level = (model.predictions || [])
    .map((prediction) => prediction.label)
    .filter((label) => value.startsWith(label + " × "))
    .sort((a, b) => b.length - a.length)[0];
  return level
    ? prefix + named("predictions", level) + value.slice(level.length)
    : term;
}
