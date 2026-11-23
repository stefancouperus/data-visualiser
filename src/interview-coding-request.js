import { structuredAnswer } from "./bot-response.js";

export async function requestInterviewCoding(context, requestTutor) {
  const { guide } = context;
  const discovering =
    guide.mode === "inductive" && guide.limits.newPerBatch > 0;
  let question =
    "Check every supplied passage against each approved code, including when the speaker expresses its meaning in different words. For each supported assignment give the exact passage ID, an exact verbatim quotation and a reason. Check for a separate second meaning within the per-passage limit. Leave unsupported passages uncoded.";
  if (discovering) {
    question = `Your task is open label discovery. The student has already requested new labels for new ideas and will decide which proposals to accept after this response. Read each participant’s words against the research focus. A previously unseen, well-supported answer belongs in suggestions: give it a new concise name, definition and exact quotation now. The ${guide.vocabulary.length} existing labels are available for genuinely equivalent meanings. You can create up to ${guide.limits.newPerBatch} NEW labels in this request. If an otherwise relevant passage does not fit an existing label, that is precisely when to create a new label. Return the requested JSON immediately.`;
  }
  const send = (question) =>
    requestTutor({ skill: "coding", question, context });
  let answer = await send(question);
  let suggestions = structuredAnswer(answer).suggestions;
  // Some replies contain valid empty JSON followed by a request for permission
  // to propose the new label the student already requested.
  const asksPermission = (response) =>
    /(?:would you like|do you want|shall I|may I|should I|please confirm).{0,120}\b(?:propos\w*|add|introduc\w*|creat\w*|suggest\w*)\b.{0,35}\b(?:labels?|codes?|categor\w*)\b/is.test(
      response,
    );
  if (discovering && suggestions?.length === 0 && asksPermission(answer)) {
    answer = await send(
      question +
        " The student has confirmed that you may draft new labels. Put every supported proposal in the suggestions array for review now. Leave it empty if the evidence does not support a code.",
    );
    suggestions = structuredAnswer(answer).suggestions;
    if (suggestions?.length === 0 && asksPermission(answer)) {
      throw Error(
        "The bot asked for permission again instead of finishing this draft. Your coding choices are saved.",
      );
    }
  }
  return suggestions;
}
