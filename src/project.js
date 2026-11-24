import {
  fillCheckboxField,
  restoreLegacyCheckboxes,
} from "./survey-answers.js";
import { readFocus } from "./research-focus.js";
import { readTutorHistory } from "./tutor-history.js";
export { linkage } from "./participant-links.js";
import { passageUnits } from "./transcript-index.js";
import { applyAnswerLabels } from "./survey-labels.js";
import { interviews, sharedBook, pruneEmptyQuotations } from "./interviews.js";
import { approvedBook, bookEntries, labelKey } from "./coding.js";
import { editCategory, setLabelAppearance } from "./label-appearance.js";

import { readWorkLog } from "./work-log.js";

export const fresh = () => ({
  workLog: [],
  tutorHistory: Object.create(null),
  includeBotChat: false,
  researchFocus: "",
  format: "data-visualiser",
  version: 1,
  name: "Untitled project",
  datasets: [],
  active: "",
  views: [],
  saved: [],
  savedVisuals: [],
  linked: true,
  confirmed: [],
  mode: "hints",
});
// The project keeps the active pair at the top level for older project files.
export function switchDataset(p, id, makeView) {
  const previous = p.active;
  p.workingViews ||= {};
  if (
    previous !== id &&
    p.datasets.some((d) => d.id === previous) &&
    p.views.length === 2
  ) {
    p.workingViews[previous] = {
      views: p.views,
      linked: p.linked,
      comparisonStarted: p.comparisonStarted,
    };
  }
  p.active = id;
  const stored = p.workingViews[id];
  if (stored) {
    p.views = stored.views;
    p.linked = stored.linked;
    p.comparisonStarted = stored.comparisonStarted;
    delete p.workingViews[id];
  } else {
    const view = makeView(p.datasets.find((d) => d.id === id));
    p.views = [view, structuredClone(view)];
    p.comparisonStarted = false;
  }
}
export function verifyProject(p) {
  if (
    p?.format !== "data-visualiser" ||
    p.version !== 1 ||
    !Array.isArray(p.datasets) ||
    !Array.isArray(p.views) ||
    !Array.isArray(p.saved)
  )
    throw Error("Choose a Data visualiser project download.");
  const safeID = (id) =>
    typeof id === "string" &&
    /^[a-z0-9_-]+$/i.test(id) &&
    !["__proto__", "constructor", "prototype"].includes(id);
  for (const d of p.datasets) {
    if (
      !safeID(d.id) ||
      d.fields?.some((f) => !safeID(f.id)) ||
      d.passages?.some((p) => !safeID(p.id))
    )
      throw Error("Invalid dataset identifiers.");
  }
  const ids = p.datasets.map((d) => d.id);
  const validViews = (views) =>
    Array.isArray(views) &&
    views.every(
      (v) =>
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        (v.items == null || Array.isArray(v.items)) &&
        (v.predictors == null || Array.isArray(v.predictors)),
    );
  if (
    new Set(ids).size !== ids.length ||
    !validViews(p.views) ||
    (p.workingViews != null &&
      (typeof p.workingViews !== "object" ||
        Array.isArray(p.workingViews) ||
        Object.entries(p.workingViews).some(
          ([id, item]) =>
            !ids.includes(id) ||
            !validViews(item?.views) ||
            item.views.length !== 2,
        ))) ||
    (p.confirmed !== undefined && !Array.isArray(p.confirmed)) ||
    (p.savedVisuals !== undefined &&
      (!Array.isArray(p.savedVisuals) ||
        p.savedVisuals.some(
          (s) =>
            !s ||
            typeof s.name !== "string" ||
            !ids.includes(s.dataset) ||
            !validViews([s.view]),
        ))) ||
    p.saved.some(
      (s) =>
        !s ||
        !ids.includes(s.dataset) ||
        !validViews(s.views) ||
        s.views.length !== 2,
    )
  )
    throw Error(
      "The project file contains incomplete views or duplicate datasets. Open another saved copy.",
    );
  // Earlier versions displayed the same ranked word counts as a cloud.
  // Reopen every stored view as a table, keeping its original evidence scope.
  const views = [
    ...p.views,
    ...(p.savedVisuals || []).map((saved) => saved.view),
    ...p.saved.flatMap((saved) => saved.views),
    ...Object.values(p.workingViews || {}).flatMap((saved) => saved.views),
  ];
  for (const v of views) {
    if (v.chart === "wordcloud")
      Object.assign(v, { chart: "table", task: "words" });
  }
  if (!p.settingsOnly)
    for (const d of p.datasets) {
      const styles = d.coding?.labelStyles;
      const categories = d.coding?.categories;
      if (
        (styles !== undefined &&
          (!Array.isArray(styles) ||
            styles.some(
              (row) =>
                typeof row?.label !== "string" ||
                !/^#[0-9a-f]{6}$/i.test(row.colour) ||
                typeof row.category !== "string",
            ))) ||
        (categories !== undefined &&
          (!Array.isArray(categories) ||
            categories.some((c) => typeof c !== "string")))
      )
        throw Error(
          "This project contains unreadable label colours or categories.",
        );
      const review = d.coding?.bookDraft;
      if (
        review != null &&
        (!["upload", "manual"].includes(review.method) ||
          typeof review.name !== "string" ||
          typeof review.sourceText !== "string" ||
          review.sourceText.length > 65000 ||
          (review.categories !== undefined &&
            (!Array.isArray(review.categories) ||
              review.categories.some(
                (category) => typeof category !== "string",
              ))) ||
          !Array.isArray(review.entries) ||
          review.entries.some(
            (entry) =>
              typeof entry?.label !== "string" ||
              typeof entry.definition !== "string" ||
              (entry.category != null && typeof entry.category !== "string") ||
              (entry.originalLabel != null &&
                typeof entry.originalLabel !== "string") ||
              (entry.categoryIndex != null &&
                (!Number.isInteger(entry.categoryIndex) ||
                  entry.categoryIndex < 0 ||
                  entry.categoryIndex >= (review.categories?.length ?? 0))),
          ))
      ) {
        throw Error(
          "The saved codebook draft is incomplete. Open another project download.",
        );
      }
      const draft = d.interviews?.draft;
      if (
        d.interviews &&
        (!Array.isArray(d.sources) ||
          !Array.isArray(d.interviews.done) ||
          (d.interviews.established &&
            (!Array.isArray(d.coding?.book) || !d.coding.book.length)) ||
          (draft &&
            (!d.sources.includes(draft.source) ||
              (draft.sources !== undefined &&
                (!Array.isArray(draft.sources) ||
                  !draft.sources.length ||
                  new Set(draft.sources).size !== draft.sources.length ||
                  draft.sources.some((name) => !d.sources.includes(name)))) ||
              (draft.ids != null &&
                (!Array.isArray(draft.ids) ||
                  draft.ids.some((id) => !safeID(id)))) ||
              !Array.isArray(draft.matches) ||
              (draft.reviewPass !== undefined &&
                (draft.reviewPass !== "missed" ||
                  draft.sample ||
                  !draft.originalOnly)) ||
              (draft.verifying !== undefined &&
                (draft.reviewPass !== "missed" ||
                  draft.next >= draft.total ||
                  !Array.isArray(draft.verifying?.suggestions) ||
                  draft.verifying.suggestions.length > 12 ||
                  draft.verifying.suggestions.some(
                    (s) =>
                      !s ||
                      !/^p[1-6]$/.test(s.id) ||
                      typeof s.code !== "string" ||
                      typeof s.quote !== "string",
                  ) ||
                  !draft.verifying.excluded ||
                  Array.isArray(draft.verifying.excluded) ||
                  typeof draft.verifying.excluded !== "object" ||
                  Object.entries(draft.verifying.excluded).some(
                    ([kind, n]) =>
                      ![
                        "passage",
                        "quote",
                        "label",
                        "capacity",
                        "duplicate",
                        "declined",
                      ].includes(kind) ||
                      !Number.isSafeInteger(n) ||
                      n < 0,
                  ))) ||
              (draft.codeExamples !== undefined &&
                typeof draft.codeExamples !== "boolean") ||
              (draft.labelEdits !== undefined &&
                (!Array.isArray(draft.labelEdits) ||
                  draft.labelEdits.some(
                    (row) =>
                      typeof row?.original !== "string" ||
                      typeof row.label !== "string" ||
                      typeof row.definition !== "string" ||
                      typeof row.keep !== "boolean",
                  ))) ||
              [
                draft.rejected,
                draft.accepted,
                draft.manual,
                draft.withdrawnLabels,
              ].some(
                (choices) =>
                  choices !== undefined &&
                  (!Array.isArray(choices) ||
                    choices.some((x) => typeof x !== "string")),
              ) ||
              !Number.isInteger(draft.total) ||
              !Number.isInteger(draft.next) ||
              draft.next < 0 ||
              draft.next > draft.total)))
      ) {
        throw Error(
          "The interview review progress in this file is incomplete. Open another project download.",
        );
      }
      if (!d.id || !["text", "table"].includes(d.kind))
        throw Error("Invalid project dataset.");
      if (
        d.kind === "table" &&
        (!Array.isArray(d.rows) ||
          !Array.isArray(d.fields) ||
          !d.fields.length ||
          d.fields.some((f) => !Array.isArray(f.levels)) ||
          d.rows.some((r) => !r || typeof r !== "object"))
      )
        throw Error("Missing table data.");
      if (
        d.excludedWrittenPassages != null &&
        (!d.openAnswers ||
          !Array.isArray(d.excludedWrittenPassages) ||
          d.excludedWrittenPassages.some(
            (item) =>
              !safeID(item?.id) ||
              typeof item.source !== "string" ||
              typeof item.text !== "string" ||
              !Array.isArray(item.codes),
          ))
      )
        throw Error("Missing excluded written-answer data.");
      if (d.kind === "table") restoreLegacyCheckboxes(d);
      if (
        d.kind === "text" &&
        (!Array.isArray(d.passages) ||
          !Array.isArray(d.sources) ||
          d.passages.some(
            (p) => typeof p.text !== "string" || !Array.isArray(p.codes),
          ))
      )
        throw Error("Missing passage data.");
    }
  return {
    ...fresh(),
    ...p,
    workLog: readWorkLog(p.workLog),
    researchFocus: readFocus(p.researchFocus),
    includeBotChat: p.includeBotChat === true,
    tutorHistory: readTutorHistory(
      p.tutorHistory,
      p.datasets.map((d) => d.id),
    ),
  };
}
export function settingsProject(p) {
  const { tutorHistory, includeBotChat, workLog, datasets, ...settings } = p;
  const copy = { ...settings };
  copy.settingsOnly = true;
  copy.datasets = datasets.map((d) =>
    d.kind === "table"
      ? {
          id: d.id,
          name: d.name,
          kind: d.kind,
          unit: d.unit,
          ...(d.purpose ? { purpose: d.purpose } : {}),
          rules: d.rules,
          ...(d.previewDecision && { previewDecision: d.previewDecision }),
          explanation: d.explanation,
          fields: d.fields.map(({ levels, ...f }) => ({
            ...f,
            levels: f.type === "ordered" || f.checkboxIndicators ? levels : [],
          })),
        }
      : {
          id: d.id,
          name: d.name,
          kind: d.kind,
          unit: d.unit,
          ...(d.textPurpose ? { textPurpose: d.textPurpose } : {}),
          ...(d.openAnswers ? { openAnswers: d.openAnswers } : {}),
          ...(d.surveySource ? { surveySource: d.surveySource } : {}),
        },
  );
  return structuredClone(copy);
}
export function reattach(settings, actual) {
  if (settings.datasets.length !== actual.length)
    throw Error(
      "Import all original datasets first, then reopen this settings file.",
    );
  const restoredIds = new Map();
  const datasets = settings.datasets.map((saved) => {
    const choices = actual.filter(
      (d) =>
        d.kind === saved.kind &&
        d.name === saved.name &&
        !restoredIds.has(d.id),
    );
    if (choices.length !== 1)
      throw Error(
        "Import matching files first. Could not uniquely match " + saved.name,
      );
    const d = structuredClone(choices[0]);
    restoredIds.set(d.id, saved.id);
    d.id = saved.id;
    d.unit = saved.unit;
    if (saved.purpose) d.purpose = saved.purpose;
    if (saved.surveySource) d.surveySource = saved.surveySource;
    if (saved.textPurpose) d.textPurpose = saved.textPurpose;
    if (saved.openAnswers) d.openAnswers = structuredClone(saved.openAnswers);
    if (d.kind === "table") {
      if (saved.previewDecision) d.previewDecision = saved.previewDecision;
      // Settings can include checkbox fields derived after the original import.
      for (const field of saved.fields.slice(d.fields.length)) {
        if (
          !field.checkboxIndicators?.length ||
          !field.checkboxIndicators.every((option) =>
            d.fields.some((source) => source.id === option.id),
          )
        )
          break;
        const derived = structuredClone(field);
        fillCheckboxField(d, derived, true);
        d.fields.push(derived);
      }
      if (
        saved.fields.length !== d.fields.length ||
        saved.fields.some((f, i) => f.raw !== d.fields[i].raw)
      )
        throw Error("Columns differ in " + d.name);
      for (const [index, field] of d.fields.entries()) {
        const savedField = saved.fields[index];
        if (
          field.checkboxIndicators &&
          savedField.checkboxIndicators &&
          field.id !== savedField.id
        ) {
          // A student can rebuild the same checkbox group before opening settings.
          for (const row of d.rows) {
            row[savedField.id] = row[field.id];
            delete row[field.id];
          }
          field.id = savedField.id;
        }
        const entries = savedField.answerLabels;
        if (entries && !field.answerLabels)
          applyAnswerLabels(d, field, entries);
      }
      d.fields = d.fields.map((f, i) => ({
        ...f,
        ...saved.fields[i],
        levels: saved.fields[i].levels.length
          ? saved.fields[i].levels
          : f.levels,
      }));
      d.rules = saved.rules;
      d.explanation = saved.explanation;
    }
    return d;
  });
  for (const d of datasets) {
    const state = d.participantLinks;
    if (!state) continue;
    for (const table of state.tables)
      table.id = restoredIds.get(table.id) || table.id;
    if (state.legacyTables)
      state.legacyTables = state.legacyTables.map(
        (id) => restoredIds.get(id) || id,
      );
  }
  return { ...settings, settingsOnly: false, datasets };
}
export function renameTheme(project, d, old, name, undoViews = []) {
  if (!old || !name) throw Error("Choose an existing code and enter a label.");
  if (old === name) return;
  const recognised = sharedBook(d);
  if (
    d.interviews &&
    recognised.find((e) => e.label === old)?.sourceLabel &&
    !recognised.some(
      (e) =>
        labelKey(e.label) === labelKey(name) &&
        labelKey(e.label) !== labelKey(old),
    )
  ) {
    return editInterviewLabel(
      project,
      d,
      { oldLabel: old, label: name },
      undoViews,
    );
  }
  for (const entries of [d.coding?.book, d.coding?.meanings]) {
    if (!entries) continue;
    const from = entries.find((e) => e.label === old);
    const into = entries.find((e) => e.label === name);
    if (from && from !== into) {
      if (into) {
        if (!into.definition) into.definition = from.definition;
        entries.splice(entries.indexOf(from), 1);
      } else from.label = name;
    }
  }
  rewriteThemeReferences(
    project,
    d,
    new Map([[labelKey(old), name]]),
    undoViews,
  );
}

function rewriteThemeReferences(project, d, changes, undoViews) {
  const matches = (value) =>
    typeof value === "string" && changes.has(labelKey(value));
  const rename = (value) =>
    matches(value) ? changes.get(labelKey(value)) : value;
  if (d.coding?.labelStyles) {
    const unchanged = new Set(
      d.coding.labelStyles
        .filter((row) => !matches(row.label))
        .map((row) => labelKey(row.label)),
    );
    d.coding.labelStyles = d.coding.labelStyles.flatMap((row) => {
      if (!matches(row.label)) return [row];
      const label = rename(row.label);
      return label && !unchanged.has(labelKey(label))
        ? [{ ...row, label }]
        : [];
    });
  }
  for (const p of d.excludedWrittenPassages
    ? [...d.passages, ...d.excludedWrittenPassages]
    : d.passages) {
    p.codes = [...new Set(p.codes.map(rename).filter(Boolean))];
    if (Array.isArray(p.declinedCoding))
      p.declinedCoding = p.declinedCoding.flatMap((entry) => {
        if (typeof entry?.label !== "string") return [];
        const label = rename(entry.label);
        return label ? [{ ...entry, label }] : [];
      });
    if (p.codingEvidence) {
      p.codingEvidence = p.codingEvidence.filter((entry) => {
        entry.code = rename(entry.code);
        return !!entry.code;
      });
    }
  }
  const active = !project.active || project.active === d.id;
  const views = new Set([
    ...(active ? project.views : []),
    ...(active ? undoViews.flat() : []),
    ...(project.workingViews?.[d.id]?.views || []),
    ...(project.savedVisuals || [])
      .filter((s) => s.dataset === d.id)
      .map((s) => s.view),
    ...project.saved.filter((s) => s.dataset === d.id).flatMap((s) => s.views),
  ]);
  for (const v of views) {
    const affectedAxis = matches(v.x) || matches(v.y);
    // Keep an unavailable word-table theme until a student selects a replacement.
    // An empty x explicitly means all passages.
    if (matches(v.x) && (rename(v.x) || v.task !== "words")) v.x = rename(v.x);
    if (matches(v.y)) v.y = rename(v.y);
    if (v.items) v.items = [...new Set(v.items.map(rename).filter(Boolean))];
    if (affectedAxis && v.task === "two" && (!v.x || !v.y || v.x === v.y)) {
      v.task = "one";
      v.x ||= v.y || "";
      v.y = "";
      v.chart = v.x ? "bars" : "excerpts";
      v.title = "";
      v.annotation = "";
    } else if (affectedAxis && !v.x && v.task === "one") {
      v.chart = "excerpts";
      v.title = "";
      v.annotation = "";
    }
    // A highlight can also be a source or subgroup with the same name.
    if (
      !v.groupBy &&
      !d.sources.includes(v.highlight) &&
      matches(v.highlight)
    ) {
      if (rename(v.highlight)) v.highlight = rename(v.highlight);
      else delete v.highlight;
    }
  }
}

// Apply all renames together. A new sibling can qualify several existing codes,
// and a revised codebook can swap two names without swapping their evidence.
export function rewriteInterviewLabelReferences(
  project,
  d,
  renames,
  undoViews = [],
  { clearPending = [], activeLabels = [] } = {},
) {
  const changes = new Map(
    [...renames].map(([old, next]) => [labelKey(old), next]),
  );
  const replace = (value) => changes.get(labelKey(value)) ?? value;
  if (changes.size) {
    rewriteThemeReferences(project, d, changes, undoViews);
    if (d.coding?.meanings) {
      d.coding.meanings = d.coding.meanings.flatMap((entry) => {
        const name = typeof entry === "string" ? entry : entry.label;
        if (!changes.has(labelKey(name))) return [entry];
        const label = replace(name);
        return label
          ? [
              {
                ...(typeof entry === "string" ? { definition: "" } : entry),
                label,
              },
            ]
          : [];
      });
    }
  }
  const current = d.interviews?.draft;
  if (!current || !(changes.size || clearPending.length || activeLabels.length))
    return;
  // Replacing the draft also prevents a late model response to the old guide
  // from being applied after the student has edited the codebook.
  const draft = { ...current };
  delete draft.verifying;
  const clear = new Set(clearPending.map(labelKey));
  const pending = (value) => (clear.has(labelKey(value)) ? "" : replace(value));
  draft.matches = draft.matches.flatMap((match) => {
    const code = pending(match.code);
    return code ? [{ ...match, code }] : [];
  });
  for (const key of ["manual", "rejected", "accepted"]) {
    if (!draft[key]) continue;
    draft[key] = draft[key].flatMap((choice) => {
      let pair;
      try {
        pair = JSON.parse(choice);
      } catch {
        return [];
      }
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[1] !== "string"
      )
        return [];
      const code = pending(pair[1]);
      return code ? [JSON.stringify([pair[0], code])] : [];
    });
  }
  if (draft.labelEdits) {
    draft.labelEdits = draft.labelEdits.flatMap((edit) => {
      const original = pending(edit.original),
        label = pending(edit.label);
      return original && label ? [{ ...edit, original, label }] : [];
    });
  }
  const active = new Set(
    [...renames.values(), ...activeLabels].filter(Boolean).map(labelKey),
  );
  const withdrawn = [...(draft.withdrawnLabels || []), ...renames.keys()];
  draft.withdrawnLabels = [
    ...new Set(withdrawn.filter((name) => !active.has(labelKey(name)))),
  ];
  d.interviews.draft = draft;
}

function editableLabels(d) {
  const categories = new Map(
    (d.coding?.labelStyles || []).map((s) => [labelKey(s.label), s.category]),
  );
  return sharedBook(d).map((old) => ({
    old,
    label: old.sourceLabel || old.label,
    definition: old.definition,
    category: old.category || categories.get(labelKey(old.label)) || "",
  }));
}

function prepareLabelPlan(rows, removed) {
  const next = rows.length
    ? bookEntries(
        rows.map((row) => ({
          ...row,
          previousLabel:
            row.old?.sourceLabel === row.label &&
            row.category === (row.old?.category || "")
              ? row.old.label
              : undefined,
        })),
      )
    : [];
  const edits = new Map();
  const renames = new Map();
  if (removed) {
    edits.set(labelKey(removed.label), null);
    renames.set(removed.label, "");
  }
  rows.forEach(({ old }, i) => {
    if (!old) return;
    edits.set(labelKey(old.label), next[i]);
    if (old.label !== next[i].label) renames.set(old.label, next[i].label);
  });
  return { next, edits, renames };
}

function applyLabelPlan(
  project,
  d,
  plan,
  undoViews,
  { edited, target, clearPending } = {},
) {
  const { edits, renames } = plan;
  d.coding ||= {};
  // Use the old dictionary keys for both lists even where two identities swap.
  const lists = { book: d.coding.book, meanings: d.coding.meanings };
  rewriteInterviewLabelReferences(project, d, renames, undoViews, {
    clearPending,
    activeLabels: edited ? [edited.label] : [],
  });
  for (const [key, entries] of Object.entries(lists)) {
    if (!entries && key !== target) continue;
    const revised = (entries || []).flatMap((raw) => {
      const label = typeof raw === "string" ? raw : raw.label;
      const entry = edits.get(labelKey(label));
      if (entry === undefined) return [raw];
      if (!entry) return [];
      // Preserve an existing meaning on historical entries if the approved
      // book and the historical vocabulary happened to differ.
      const updated = typeof raw === "string" ? {} : { ...raw };
      delete updated.category;
      delete updated.sourceLabel;
      const definition =
        entry === edited
          ? entry.definition
          : (raw.definition ?? entry.definition);
      return [{ ...updated, ...entry, definition }];
    });
    if (
      edited &&
      key === target &&
      !revised.some((e) => labelKey(e.label) === labelKey(edited.label))
    )
      revised.push(edited);
    d.coding[key] = revised;
  }
  // A passage-only label may now need sourceLabel and category metadata.
  const declared = new Set(
    [...(d.coding.book || []), ...(d.coding.meanings || [])].map((e) =>
      labelKey(typeof e === "string" ? e : e.label),
    ),
  );
  for (const entry of plan.next) {
    if (entry.sourceLabel && !declared.has(labelKey(entry.label))) {
      (d.coding.meanings ||= []).push(entry);
    }
  }
}

function categoryPath(value) {
  return value
    .split("›")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" › ");
}

export function editInterviewCategory(project, d, old, name, undoViews = []) {
  const cleaned = categoryPath(name);
  if (name.trim() && !cleaned) throw Error("Enter a category name.");
  const rows = editableLabels(d);
  for (const row of rows)
    if (old && labelKey(row.category) === labelKey(old)) row.category = cleaned;
  // Validate the resulting codes before removing a category: two formerly
  // separate labels could end up in the same uncategorised branch.
  const plan = prepareLabelPlan(rows);
  editCategory(d, old, cleaned);
  if (old) applyLabelPlan(project, d, plan, undoViews);
}

// Store the leaf the student typed and use the same distinct project codes
// as an imported codebook when different categories contain that leaf.
export function editInterviewLabel(
  project,
  d,
  { oldLabel, label, definition, category, colour, remove = false },
  undoViews = [],
) {
  const rows = editableLabels(d);
  const same = (a, b) => labelKey(a) === labelKey(b);
  const row =
    oldLabel == null
      ? undefined
      : rows.find((e) => same(e.old.label, oldLabel));
  const old = row?.old;
  if ((oldLabel != null || remove) && !old)
    throw Error("Choose an existing label to change.");
  const name = (label ?? row?.label ?? "").trim();
  const meaning = (definition ?? row?.definition ?? "").trim();
  const enteredCategory = category ?? row?.category ?? "";
  let branch = categoryPath(enteredCategory);
  if (!remove && enteredCategory.trim() && !branch)
    throw Error("Enter a category name.");
  branch = (d.coding?.categories || []).find((c) => same(c, branch)) ?? branch;
  if (!remove && !name) throw Error("Enter a name for the label.");
  if (
    !row &&
    category == null &&
    rows.some((entry) => entry.old.sourceLabel && same(entry.label, name))
  ) {
    throw Error(
      "Choose the label with its category in the list. To add a label under a different category, use Manage labels.",
    );
  }
  if (colour != null && !/^#[0-9a-f]{6}$/i.test(colour))
    throw Error("Choose a label colour.");
  if (
    !remove &&
    rows.some(
      (e) => e !== row && same(e.label, name) && same(e.category, branch),
    )
  )
    throw Error(
      "A label with that name already exists in this category. Choose another name or category.",
    );

  const moved = row && row.category !== branch;
  const changedMeaning = row && row.definition !== meaning;
  const sameEntry = row && row.label === name && !moved && !changedMeaning;
  if (!remove && sameEntry) {
    if (!colour) return false;
    setLabelAppearance(d, old.label, colour, branch);
    return true;
  }
  const editedRow = { old, label: name, definition: meaning, category: branch };
  const plannedRows = remove
    ? rows.filter((e) => e !== row)
    : row
      ? rows.map((e) => (e === row ? editedRow : e))
      : [...rows, editedRow];
  const plan = prepareLabelPlan(plannedRows, remove ? old : null);
  const edited = remove ? undefined : plan.next[plannedRows.indexOf(editedRow)];
  const state = interviews(d);
  const approved =
    state.established &&
    (!old || approvedBook(d).some((e) => same(e.label, old.label)));
  applyLabelPlan(project, d, plan, undoViews, {
    edited,
    target: remove ? undefined : approved ? "book" : "meanings",
    clearPending: changedMeaning || moved ? [old.label] : [],
  });
  if (edited) {
    const appearance = d.coding.labelStyles?.find((s) =>
      same(s.label, edited.label),
    );
    if (colour || appearance)
      setLabelAppearance(d, edited.label, colour || appearance.colour, branch);
    else if (branch && !d.coding.categories?.includes(branch))
      (d.coding.categories ||= []).push(branch);
  }
  if (
    remove &&
    (rows.length === 1 || (state.established && !approvedBook(d).length))
  ) {
    state.established = false;
    if (state.method === "book" || state.method === "imported")
      state.method = "manual";
    d.coding.mode = "inductive";
    if (state.draft && !state.draft.sample) delete state.draft;
  }
  if (remove) pruneEmptyQuotations(d);
  if (!old || remove || changedMeaning || moved) {
    state.done = [];
    state.finished = false;
  }
  return true;
}
export function dataCount(d) {
  return d.kind === "text"
    ? passageUnits(d.passages).length + " passages"
    : d.rows.length + " records";
}
