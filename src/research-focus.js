import { chartFields } from "./question-matching.js";
import { filteredRows } from "./import.js";
import {
  groupChoices,
  groupValue,
  patternChoices,
  selectionLimit,
} from "./patterns.js";

export const focusLimit = 2000;
export const readFocus = (value) =>
  typeof value === "string" ? value.trim().slice(0, focusLimit) : "";

export function researchCatalogue(d, view, focus, question, keepItems) {
  const text = d.kind === "text";
  const items =
    view.task === "patterns"
      ? view.items || []
      : view.task === "two"
        ? [view.x, view.y]
        : view.x
          ? [view.x]
          : [];
  const selected = keepItems ? items : [];
  const records = (text ? d.sources : filteredRows(d)).filter(
    (r) =>
      !view.filter ||
      (text && view.filter === "source" ? r : groupValue(d, view.filter, r)) ===
        view.value,
  );
  const groupingFields = groupChoices(d, selected).filter(([key]) => {
    if (key === view.filter) return false;
    let first = "";
    for (const r of records) {
      const value = groupValue(d, key, r);
      if (value && first && value !== first) return true;
      if (value) first = value;
    }
    return false;
  });
  const choices = patternChoices(d);
  const definitions = new Map(
    [...(d.coding?.book || []), ...(d.coding?.meanings || [])].map((e) => [
      e.label,
      e.definition,
    ]),
  );
  return {
    projectFocus: focus,
    datasetKind: text ? "interviews" : "survey or table",
    questions: text ? undefined : chartFields(d.fields, focus + " " + question),
    themes: text
      ? choices.map(([label]) => ({
          label,
          meaning: definitions.get(label) || undefined,
        }))
      : undefined,
    selectableForPatterns: choices.map(([id]) => id),
    allowedModes: text
      ? ["sources", "passages", "interviews"]
      : ["separate", "together"],
    groupingFields,
    selectionToKeep: selected,
    groupRequested: keepItems,
    currentFilter: view.filter
      ? { field: view.filter, value: view.value }
      : undefined,
  };
}

// The model proposes measures. The browser checks their identities and chooses
// a supported chart before offering it to the student.
export function researchChart(pick, c) {
  const items = pick.items,
    group = pick.groupBy || "";
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > selectionLimit ||
    new Set(items).size !== items.length ||
    typeof pick.explanation !== "string" ||
    !pick.explanation.trim()
  )
    return null;
  if (
    c.groupRequested &&
    (!group ||
      !c.selectionToKeep.length ||
      items.length !== c.selectionToKeep.length ||
      !c.selectionToKeep.every((id) => items.includes(id)))
  )
    return null;
  const text = c.datasetKind === "interviews";
  if (
    group &&
    ((!text && items.includes(group)) ||
      !c.groupingFields.some(([id]) => id === group))
  )
    return null;
  const fields = items.map((id) => c.questions?.find((f) => f.id === id));
  if (
    !text &&
    !group &&
    fields.every((f) => f?.type === "number") &&
    items.length <= 2
  )
    return {
      task: items.length === 1 ? "one" : "two",
      x: items[0],
      y: items[1] || "",
      chart: items.length === 1 ? "hist" : "scatter",
    };
  if (!items.every((id) => c.selectableForPatterns.includes(id))) return null;
  const mode =
    text && pick.patternMode === "separate"
      ? "sources"
      : pick.patternMode || (text ? "sources" : "separate");
  if (
    !(
      text ? ["sources", "interviews", "passages"] : ["separate", "together"]
    ).includes(mode)
  )
    return null;
  return {
    task: "patterns",
    items,
    groupBy: group,
    patternMode: mode,
    themeUnit: "interviews",
    chart: text && !group && mode === "sources" ? "grid" : "bars",
  };
}

export function researchExplanation(sentence, catalogue) {
  const names = new Map((catalogue.questions || []).map((f) => [f.id, f.name]));
  return sentence.replace(
    / ?\((c\d+)\)|\b(c\d+)\b/gi,
    (match, parenthetical, standalone) => {
      const label = names.get((parenthetical || standalone).toLowerCase());
      if (!label) return match;
      return parenthetical ? "" : label;
    },
  );
}
