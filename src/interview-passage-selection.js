import {
  codingSelection,
  speakerTag,
  standardInterviewer,
} from "./coding-passages.js";
import { esc } from "./chart.js";
import { askForm, formselect, get, val } from "./ui.js";

export async function chooseCodingPassages(originals, source) {
  const currentTag =
    originals.find((p) => p.interviewerTag)?.interviewerTag || "";
  const customTags = [
    ...new Set(originals.map((p) => speakerTag(p.text))),
  ].filter((tag) => tag && !standardInterviewer(tag));
  const starting = codingSelection(originals);
  const checkboxes = () => [
    ...get("modalform").querySelectorAll("[name=iv-include]"),
  ];
  const previous = new Map();
  function withTag(tag) {
    return originals.map((p) => ({
      ...p,
      interviewerTag: tag && tag === speakerTag(p.text) ? tag : undefined,
    }));
  }
  const choice = askForm(
    "Choose passages for coding",
    "<p>Tick the passages you want to code and review in " +
      esc(source) +
      ". Clearly marked interviewer turns and consent exchanges start unticked. Your selection also applies to future bot runs.</p>" +
      (customTags.length
        ? formselect(
            "iv-interviewer-tag",
            "Which speaker is the interviewer?",
            [["", "Use standard interviewer labels"], ...customTags],
            currentTag,
          )
        : "") +
      '<div class="iv-pick">' +
      originals
        .map(
          (p, i) =>
            '<label class="tick"><input name="iv-include" type="checkbox" value="' +
            esc(p.id) +
            '" ' +
            (starting.has(p.id) ? "checked" : "") +
            ">Passage " +
            (i + 1) +
            " · " +
            esc(p.text) +
            "</label>",
        )
        .join("") +
      "</div>",
    () => ({
      tag: val("iv-interviewer-tag"),
      picks: new Set(
        checkboxes()
          .filter((n) => n.checked)
          .map((n) => n.value),
      ),
    }),
    "Save passage selection",
  );
  get("modalform").addEventListener("change", (event) => {
    if (event.target.name === "iv-include") {
      previous.set(event.target.value, event.target.checked);
    } else if (event.target.id === "iv-interviewer-tag") {
      const selection = codingSelection(withTag(event.target.value));
      for (const n of checkboxes())
        n.checked = previous.get(n.value) ?? selection.has(n.value);
    }
  });
  const result = await choice;
  if (!result) return null;
  const defaults = codingSelection(withTag(result.tag));
  return () => {
    let changed = result.tag !== currentTag;
    for (const p of originals) {
      if (result.tag && result.tag === speakerTag(p.text))
        p.interviewerTag = result.tag;
      else delete p.interviewerTag;
      const picked = result.picks.has(p.id);
      if (picked !== defaults.has(p.id)) p.codingIncluded = picked;
      changed ||= picked !== starting.has(p.id);
    }
    return changed;
  };
}

// Only questions attached to the answers still selected for this run appear here.
export function showQuestionPreview(container, ids, questions) {
  const selected = [
    ...new Set(ids.map((id) => questions.get(id)).filter(Boolean)),
  ];
  container.hidden = !selected.length;
  container.querySelector("[data-question-examples]").innerHTML = selected
    .map((question) => "<p>" + esc(question) + "</p>")
    .join("");
}
