import {
  fillCheckboxField,
  restoreLegacyCheckboxes,
} from "./survey-answers.js";
import { readFocus } from "./research-focus.js";
import { readTutorHistory } from "./tutor-history.js";
import { filteredRows } from "./import.js";
import { applyAnswerLabels } from "./survey-labels.js";
import { interviews, sharedBook, pruneEmptyQuotations } from "./interviews.js";
import { approvedBook, labelKey } from "./coding.js";

export const fresh = () => ({
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
  if (!p.settingsOnly)
    for (const d of p.datasets) {
      const review = d.coding?.bookDraft;
      if (
        review != null &&
        (!["upload", "manual"].includes(review.method) ||
          typeof review.name !== "string" ||
          typeof review.sourceText !== "string" ||
          review.sourceText.length > 65000 ||
          !Array.isArray(review.entries) ||
          review.entries.some(
            (entry) =>
              typeof entry?.label !== "string" ||
              typeof entry.definition !== "string",
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
              [draft.rejected, draft.manual, draft.withdrawnLabels].some(
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
    researchFocus: readFocus(p.researchFocus),
    includeBotChat: p.includeBotChat === true,
    tutorHistory: readTutorHistory(
      p.tutorHistory,
      p.datasets.map((d) => d.id),
    ),
  };
}
export function settingsProject(p) {
  const { tutorHistory, includeBotChat, datasets, ...settings } = p;
  const copy = { ...settings };
  copy.settingsOnly = true;
  copy.datasets = datasets.map((d) =>
    d.kind === "table"
      ? {
          id: d.id,
          name: d.name,
          kind: d.kind,
          unit: d.unit,
          rules: d.rules,
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
        },
  );
  return structuredClone(copy);
}
export function reattach(settings, actual) {
  if (settings.datasets.length !== actual.length)
    throw Error(
      "Import all original datasets first, then reopen this settings file.",
    );
  const seen = new Set();
  const datasets = settings.datasets.map((saved) => {
    const choices = actual.filter(
      (d) => d.kind === saved.kind && d.name === saved.name && !seen.has(d.id),
    );
    if (choices.length !== 1)
      throw Error(
        "Import matching files first. Could not uniquely match " + saved.name,
      );
    const d = structuredClone(choices[0]);
    seen.add(d.id);
    d.id = saved.id;
    d.unit = saved.unit;
    if (saved.textPurpose) d.textPurpose = saved.textPurpose;
    if (saved.openAnswers) d.openAnswers = structuredClone(saved.openAnswers);
    if (d.kind === "table") {
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
  return { ...settings, settingsOnly: false, datasets };
}
export function linkage(d, t, key, mapping) {
  if (d.kind !== "text" || t.kind !== "table")
    throw Error("Choose a text collection and a table.");
  const index = new Map();
  for (const row of filteredRows(t)) {
    const k = row[key];
    if (!k) continue;
    if (index.has(k)) throw Error("Repeated identifier in the table: " + k);
    index.set(k, row);
  }
  const attrs = {};
  for (const s of d.sources) {
    const row = index.get(mapping[s]);
    if (row)
      attrs[s] = Object.fromEntries(
        t.fields.filter((f) => f.id !== key).map((f) => [f.label, row[f.id]]),
      );
  }
  return attrs;
}
export function renameTheme(project, d, old, name, undoViews) {
  if (!old || !name) throw Error("Choose an existing code and enter a label.");
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
  rewriteThemeReferences(project, d, old, name, undoViews);
}

function rewriteThemeReferences(project, d, old, name, undoViews) {
  const previous = labelKey(old);
  const matches = (value) =>
    typeof value === "string" && labelKey(value) === previous;
  const rename = (value) => (matches(value) ? name : value);
  for (const p of d.passages) {
    p.codes = [...new Set(p.codes.map(rename).filter(Boolean))];
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
    if (matches(v.x)) v.x = name;
    if (matches(v.y)) v.y = name;
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
      if (name) v.highlight = name;
      else delete v.highlight;
    }
  }
}

// Save one dictionary edit atomically in the interview collection. A distinct
// collection in the same project can use the same label with its own meaning.
export function editInterviewLabel(
  project,
  d,
  { oldLabel, label, definition, remove = false },
  undoViews = [],
) {
  const book = sharedBook(d);
  const same = (a, b) => labelKey(a) === labelKey(b);
  const old =
    oldLabel == null ? undefined : book.find((e) => same(e.label, oldLabel));
  if ((oldLabel != null || remove) && !old)
    throw Error("Choose an existing label to change.");
  const name = remove ? "" : (label ?? old?.label ?? "").trim();
  const meaning = (definition ?? old?.definition ?? "").trim();
  if (!remove && !name) throw Error("Enter a name for the label.");
  if (!remove && book.some((e) => e !== old && same(e.label, name))) {
    throw Error("A label with that name already exists. Choose another name.");
  }
  if (old && old.label === name && old.definition === meaning && !remove)
    return false;
  const state = interviews(d);
  d.coding ||= {};
  const changedMeaning = old && (old.definition || "") !== meaning;
  const entry = { label: name, definition: meaning };
  // Imported labels can exist only on passages. Record their meaning even if
  // the last use on a passage is subsequently removed.
  const isApproved =
    state.established &&
    (!old || approvedBook(d).some((e) => same(e.label, old.label)));
  const primary = isApproved ? "book" : "meanings";
  for (const key of ["book", "meanings"]) {
    if (!d.coding[key] && key !== primary) continue;
    const entries = (d.coding[key] || []).map((e) =>
      typeof e === "string" ? { label: e, definition: "" } : e,
    );
    const index = old ? entries.findIndex((e) => same(e.label, old.label)) : -1;
    if (index >= 0) {
      d.coding[key] = entries.flatMap((e, i) => {
        if (i === index && !remove) return [{ ...entry }];
        return same(e.label, old.label) ? [] : [e];
      });
    } else if (!remove && key === primary) {
      d.coding[key] = [...entries, { ...entry }];
    }
  }
  if (old && (remove || old.label !== name)) {
    rewriteThemeReferences(project, d, old.label, name, undoViews);
  }
  if (state.draft) {
    // An already-sent request uses the former vocabulary. Swapping the draft
    // lets the job's identity check ignore the late reply and preserves the
    // checkpoint for resuming with the student's current choices.
    const draft = { ...state.draft };
    if (old) {
      const replacement = remove || changedMeaning ? "" : name;
      draft.matches = draft.matches.flatMap((m) => {
        if (!same(m.code, old.label)) return [m];
        return replacement
          ? [{ ...m, code: replacement, definition: meaning }]
          : [];
      });
      for (const key of ["manual", "rejected"]) {
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
          if (!same(pair[1], old.label)) return [choice];
          return replacement ? [JSON.stringify([pair[0], replacement])] : [];
        });
      }
    }
    const withdrawn = (draft.withdrawnLabels || []).filter(
      (term) => !name || !same(term, name),
    );
    if (old && (remove || !same(old.label, name))) withdrawn.push(old.label);
    draft.withdrawnLabels = [...new Set(withdrawn)];
    state.draft = draft;
  }
  if (
    remove &&
    (book.length === 1 || (state.established && !approvedBook(d).length))
  ) {
    state.established = false;
    if (state.method === "book" || state.method === "imported")
      state.method = "manual";
    d.coding.mode = "inductive";
    if (state.draft && !state.draft.sample) delete state.draft;
  }
  if (remove) pruneEmptyQuotations(d);
  if (!old || remove || changedMeaning) {
    state.done = [];
    state.finished = false;
  }
  return true;
}
export function dataCount(d) {
  return d.kind === "text"
    ? d.passages.length + " passages"
    : d.rows.length + " records";
}
