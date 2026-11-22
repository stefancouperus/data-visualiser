// Written answers retain the original row identities when exclusions remove rows.
import { corpus, texts } from "./import.js";
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

export function writtenAnswerSet(project, survey, key, id, openOnly) {
  const question = survey.fields.find((f) => f.id === key);
  if (!question) throw Error("Choose a survey question.");
  const rules = survey.rules || [];
  const scope = JSON.stringify(rules.map((r) => [r.field, r.value]).sort());
  if (openOnly) {
    const existing = project.datasets.find(
      (d) =>
        d.openAnswers?.survey === survey.id &&
        d.openAnswers.field === key &&
        d.openAnswers.scope === scope,
    );
    if (existing) return existing;
  }
  const groups = new Set(groupChoices(survey).map(([field]) => field));
  const details = survey.fields.filter(
    (f) =>
      f.id !== key &&
      f.type !== "metadata" &&
      (!openOnly || (f.type !== "text" && groups.has(f.id))) &&
      !isOpenQuestion(f),
  );
  const sources = [],
    passages = [],
    metadata = Object.create(null);
  let eligible = 0;
  survey.rows.forEach((row, index) => {
    if (rules.some((r) => row[r.field] === r.value)) return;
    eligible++;
    const answer = String(row[key] ?? "").trim();
    if (openOnly && !answer) return;
    const source = id ? row[id] : "Record " + (index + 1);
    if (!source || Object.hasOwn(metadata, source))
      throw Error("Choose a unique, complete identifier or use row numbers.");
    sources.push(source);
    passages.push(...texts(source, [answer]));
    metadata[source] = Object.fromEntries(
      details.map((f) => [f.label, row[f.id]]),
    );
  });
  if (openOnly && !sources.length)
    throw Error(
      "There are no written answers to this question among the included records.",
    );
  const data = corpus(survey.name + " · " + question.label, passages, sources);
  data.textPurpose = "documents";
  data.metadata = metadata;
  if (openOnly) {
    data.unit = "respondent";
    data.openAnswers = {
      survey: survey.id,
      field: key,
      scope,
      eligible,
      answered: sources.length,
      question: question.label,
    };
  }
  project.datasets.push(data);
  return data;
}
