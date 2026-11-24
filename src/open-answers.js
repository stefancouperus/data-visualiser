// Written answers retain the original row identities when exclusions remove rows.
import { recordEligibility } from "./survey-answers.js";
import { corpus, texts, uid } from "./import.js";
import { groupChoices } from "./patterns.js";

export const isOpenQuestion = (field) =>
  field?.roles?.includes("open") === true;

export function setQuestionRoles(field, roles) {
  if (roles.includes("open")) {
    if (!isOpenQuestion(field)) field.typeBeforeOpen = field.type;
    field.type = "text";
  } else if (isOpenQuestion(field)) {
    field.type = field.typeBeforeOpen || field.type;
    delete field.typeBeforeOpen;
  }
  field.roles = roles;
}

function groupFields(survey, key) {
  const available = new Set(groupChoices(survey).map(([id]) => id));
  return survey.fields.filter((f) => f.id !== key && available.has(f.id));
}

function hasCoding(entries) {
  return entries.some(
    (p) => p.reviewed || p.codes.length || p.codingEvidence?.length,
  );
}

function answerPassages(passages) {
  const bySource = new Map();
  for (const p of passages) {
    if (!bySource.has(p.source)) bySource.set(p.source, []);
    bySource.get(p.source).push(p);
  }
  return bySource;
}

// Earlier versions created a collection per exclusion rule. Keep those snapshots
// accessible, including their saved figures. Seed the live collection with
// reviewed answers first, preferring the matching scope when two reviews differ.
function migrateSnapshots(project, copies, scope) {
  const preferred =
    copies.find((d) => d.openAnswers.scope === scope) || copies[0];
  const live = structuredClone(preferred);
  live.id = uid();
  const answers = new Map();
  for (const copy of [preferred, ...copies.filter((d) => d !== preferred)]) {
    for (const [source, entries] of answerPassages(copy.passages)) {
      if (
        !answers.has(source) ||
        (!hasCoding(answers.get(source)) && hasCoding(entries))
      )
        answers.set(source, entries);
    }
  }
  live.passages = structuredClone([...answers.values()].flat());
  live.openAnswers.hasEarlierSelections = true;
  copies.forEach((copy, i) => {
    copy.openAnswers.snapshot = true;
    copy.name += " (earlier selection " + (i + 1) + ")";
  });
  project.datasets.push(live);
  return live;
}

function updateGroupViews(project, d, before, fields, names) {
  const changed = new Map();
  for (const f of fields) {
    const previous = before[f.id] || f.raw;
    if (previous !== names[f.id] || f.answerLabels?.length)
      changed.set(previous, {
        name: names[f.id],
        answers: new Map(f.answerLabels),
      });
  }
  if (!changed.size) return;
  const views = [
    ...(project.active === d.id ? project.views || [] : []),
    ...(project.workingViews?.[d.id]?.views || []),
    ...(project.savedVisuals || [])
      .filter((s) => s.dataset === d.id)
      .map((s) => s.view),
    ...(project.saved || [])
      .filter((s) => s.dataset === d.id)
      .flatMap((s) => s.views),
  ];
  for (const v of new Set(views)) {
    const filter = changed.get(v.filter);
    if (filter && v.filter !== "source") {
      v.filter = filter.name;
      v.value = filter.answers.get(v.value) ?? v.value;
    }
    if (changed.has(v.groupBy)) v.groupBy = changed.get(v.groupBy).name;
  }
}

function syncCollection(project, d, survey, field, scope) {
  const link = d.openAnswers;
  const included = recordEligibility(survey);
  const fields = groupFields(survey, field.id);
  const nameCounts = new Map();
  for (const f of fields)
    nameCounts.set(f.label, (nameCounts.get(f.label) || 0) + 1);
  const names = Object.fromEntries(
    fields.map((f) => [
      f.id,
      nameCounts.get(f.label) > 1
        ? f.label + " (column " + (survey.fields.indexOf(f) + 1) + ")"
        : f.label,
    ]),
  );
  const oldNames = new Set(
    link.groups
      ? Object.values(link.groups)
      : survey.fields.flatMap((f) => [f.raw, f.label]),
  );
  const newNames = new Set(Object.values(names));
  const extras = Object.assign(Object.create(null), d.excludedWrittenMetadata);
  for (const [source, entry] of Object.entries(d.metadata || {})) {
    const attributes = Object.entries(entry).filter(
      ([name]) => !oldNames.has(name) && !newNames.has(name),
    );
    if (attributes.length) extras[source] = Object.fromEntries(attributes);
  }
  const grouped = answerPassages([
    ...d.passages,
    ...(d.excludedWrittenPassages || []),
  ]);
  const active = [],
    inactive = [],
    sources = [],
    metadata = Object.create(null);
  let eligible = 0;
  survey.rows.forEach((row, index) => {
    const keep = included(row);
    if (keep) eligible++;
    const answer = String(row[field.id] ?? "").trim();
    if (!answer) return;
    const source = link.idField ? row[link.idField] : "Record " + (index + 1);
    const previous = grouped.get(source);
    // One original answer per source. Attach saved quotations only to that answer.
    const matches = previous?.some((p) => !p.parent && p.text === answer);
    if (!keep) {
      if (matches) inactive.push(...previous);
      return;
    }
    if (!source || Object.hasOwn(metadata, source))
      throw Error("Choose a unique, complete identifier or use row numbers.");
    active.push(...(matches ? previous : texts(source, [answer])));
    sources.push(source);
    metadata[source] = {
      ...extras[source],
      ...Object.fromEntries(fields.map((f) => [names[f.id], row[f.id]])),
    };
    for (const layer of d.participantLinks?.tables || [])
      Object.assign(metadata[source], layer.values?.[source]);
    delete extras[source];
  });
  updateGroupViews(project, d, link.groups || {}, fields, names);
  d.name = survey.name + " · " + field.label;
  d.passages = active;
  d.sources = sources;
  d.metadata = metadata;
  if (Object.keys(extras).length) d.excludedWrittenMetadata = extras;
  else delete d.excludedWrittenMetadata;
  if (inactive.length) d.excludedWrittenPassages = inactive;
  else delete d.excludedWrittenPassages;
  Object.assign(link, {
    scope,
    groups: names,
    eligible,
    answered: sources.length,
    question: field.label,
  });
}

function selectedScope(survey) {
  return JSON.stringify(
    (survey.rules || [])
      .map((r) => (r.mode ? [r.field, r.value, r.mode] : [r.field, r.value]))
      .sort(),
  );
}

const lastSync = new WeakMap();
export function refreshWrittenAnswers(project, survey) {
  const sets = project.datasets.filter(
    (d) => d.openAnswers?.survey === survey.id && !d.openAnswers.snapshot,
  );
  if (!sets.length) return;
  const scope = selectedScope(survey);
  // Rows of an imported survey stay in order. A newly labelled survey is a new
  // object. Only changes affecting the open question or its groups need a scan.
  const state = JSON.stringify([
    scope,
    sets.map((d) => d.id),
    survey.fields.map((f) => [
      f.id,
      f.label,
      f.type,
      isOpenQuestion(f),
      f.levels.length,
    ]),
  ]);
  if (lastSync.get(survey) === state) return;
  for (const key of new Set(sets.map((d) => d.openAnswers.field))) {
    const field = survey.fields.find((f) => f.id === key);
    if (!field) continue;
    const copies = sets.filter((d) => d.openAnswers.field === key);
    const d =
      copies.length > 1 ? migrateSnapshots(project, copies, scope) : copies[0];
    syncCollection(project, d, survey, field, scope);
  }
  lastSync.set(survey, state);
}

export function copyWrittenAnswers(project, survey, labelled) {
  refreshWrittenAnswers(project, survey);
  const sets = project.datasets.filter(
    (d) => d.openAnswers?.survey === survey.id && !d.openAnswers.snapshot,
  );
  for (const prior of sets) {
    const copy = structuredClone(prior);
    copy.id = uid();
    copy.surveySource = copy.openAnswers.survey = labelled.id;
    delete copy.openAnswers.hasEarlierSelections;
    project.datasets.push(copy);
    if (project.confirmed?.includes(prior.id)) project.confirmed.push(copy.id);
  }
  refreshWrittenAnswers(project, labelled);
}

export function writtenAnswerSet(project, survey, key, id, openOnly) {
  const question = survey.fields.find((f) => f.id === key);
  if (!question) throw Error("Choose a survey question.");
  if (openOnly) {
    refreshWrittenAnswers(project, survey);
    let set = project.datasets.find(
      (d) =>
        d.openAnswers?.survey === survey.id &&
        d.openAnswers.field === key &&
        !d.openAnswers.snapshot,
    );
    if (!set) {
      set = corpus("", [], []);
      set.textPurpose = "documents";
      set.surveySource = survey.id;
      set.unit = "respondent";
      set.openAnswers = {
        survey: survey.id,
        field: key,
        ...(id && { idField: id }),
      };
      syncCollection(project, set, survey, question, selectedScope(survey));
      if (set.sources.length) project.datasets.push(set);
    }
    if (!set.sources.length)
      throw Error(
        "There are no written answers to this question among the included records.",
      );
    return set;
  }
  const details = survey.fields.filter(
    (f) => f.id !== key && f.type !== "metadata" && !isOpenQuestion(f),
  );
  const recordIncluded = recordEligibility(survey);
  const sources = [],
    passages = [],
    metadata = Object.create(null);
  survey.rows.forEach((row, index) => {
    if (!recordIncluded(row)) return;
    const answer = String(row[key] ?? "").trim();
    const source = id ? row[id] : "Record " + (index + 1);
    if (!source || Object.hasOwn(metadata, source))
      throw Error("Choose a unique, complete identifier or use row numbers.");
    sources.push(source);
    passages.push(...texts(source, [answer]));
    metadata[source] = Object.fromEntries(
      details.map((f) => [f.label, row[f.id]]),
    );
  });
  const data = corpus(survey.name + " · " + question.label, passages, sources);
  data.textPurpose = "documents";
  data.surveySource = survey.id;
  data.metadata = metadata;
  project.datasets.push(data);
  return data;
}
