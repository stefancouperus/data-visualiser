import { esc } from "./chart.js";

export const terms = {
  group: "What is a group?",
  percent: "What does the percentage mean?",
  filter: "What is a filter?",
  theme: "What are codes and passages?",
};

export function termMeaning(term, d, view = {}) {
  if (term === "filter")
    return "A filter chooses which records go into this view. Comparing groups keeps several sets of records in the chart so you can see their results side by side. Filtering to one value shows just the records with that value. Your original data stay in the project.";
  if (term === "percent")
    return "A percentage tells you how many out of every 100. For example, 3 out of 10 is 30%. When you compare groups, each percentage uses the total that counts for that group and question. Check what the chart counts and how many observations the percentage is based on.";
  if (term === "theme" && d?.openAnswers)
    return "A code is a short label for an idea in a written answer. One respondent can mention several themes. Select a whole answer or highlight a passage to code it.";
  if (term === "theme")
    return "A passage is a piece of text from a transcript. The chart counts a theme once in each original passage where you labelled it, even if you highlighted several quotations. To see how many people mentioned a theme, count interviews when each source is one interview with a different person.";
  const text = d?.kind === "text";
  const survey = !d || d.unit === "response";
  const meaning = d?.openAnswers
    ? "Respondents who gave the same answer to another survey question form a group. Compare how often each group mentioned a theme in their written answers."
    : text
      ? "A group is a smaller set of interviews that share something you recorded about them. Choose a detail recorded for each interview, then compare how often a theme appears across the groups. One interview can mention a theme several times."
      : survey
        ? "Start with everyone who answered your survey. Choose one question to split respondents into smaller groups. People who gave the same answer form one group. You can then compare how those groups answered a different question."
        : "Start with the rows in your table. Choose one column to split them into smaller groups. Rows with the same value form one group. You can then compare another column across those groups.";
  const key =
    view.task === "patterns"
      ? view.groupBy
      : !text && view.task === "group"
        ? view.y
        : "";
  if (!key) return meaning;
  const field = d?.fields?.find((f) => f.id === key);
  const values = text ? d.sources : field?.levels || [];
  const examples = [];
  for (const value of values) {
    const label = String(
      (text ? d.metadata?.[value]?.[key] : value) ?? "",
    ).trim();
    if (label && label.length <= 65 && !examples.includes(label))
      examples.push(label);
    if (examples.length === 2) break;
  }
  return examples.length === 2
    ? meaning +
        " In your file, “" +
        examples.join("” and “") +
        "” are two groups for “" +
        (field?.label || key) +
        "”."
    : meaning;
}
export function termHelp(term, d, view) {
  return `<details class="term-help"><summary>${esc(terms[term])}</summary><p>${esc(termMeaning(term, d, view))}</p></details>`;
}

// Hover previews the definition. Activating its summary keeps it open using
// the same native disclosure control on touch screens and keyboards.
export function bindTermHelp(root) {
  for (const box of root.querySelectorAll(".term-help")) {
    let preview = false;
    const trigger = box.querySelector("summary");
    trigger.onpointerenter = (event) => {
      if (event.pointerType === "mouse" && !box.open) {
        preview = true;
        box.open = true;
      }
    };
    box.onpointerleave = () => {
      if (preview) box.open = false;
      preview = false;
    };
    trigger.onclick = (event) => {
      if (preview && box.open) event.preventDefault();
      preview = false;
    };
  }
}
