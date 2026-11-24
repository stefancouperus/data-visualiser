import { structuredAnswer } from "./bot-response.js";
import { approvedLabelLookup, labelKey } from "./coding.js";
import { verifyMissedSuggestions } from "./verify-missed-labels.js";

export async function requestInterviewCoding(
  context,
  requestTutor,
  verificationState,
) {
  const { guide } = context;
  const secondLook =
    guide.mode === "deductive" && guide.reviewPass === "missed";
  if (secondLook && verificationState?.pending)
    return verifyMissedSuggestions(
      context,
      verificationState.pending,
      requestTutor,
      verificationState.checkpoint,
    );
  const discovering =
    guide.mode === "inductive" && guide.limits.newPerBatch > 0;
  let question =
    'Check every supplied passage against each approved code, including when the speaker expresses its meaning in different words. For each supported assignment give the exact passage ID, an exact verbatim quotation and a reason. Check for a separate second meaning within the per-passage limit. Leave unsupported passages uncoded. Reply with the requested JSON object. When there is no supported assignment, return {"suggestions":[]}.';
  if (guide.mode === "deductive")
    question +=
      " Copy each code exactly from guide.vocabulary, in the codebook language. An existing passage label or a word in the research focus is eligible only if it appears in that list.";
  if (
    guide.mode === "deductive" &&
    guide.vocabulary?.some((entry) => entry.sourceLabel)
  )
    question +=
      " Some sublabels occur under different categories. Match the passage to the category as well as the sublabel, then return the full label from that entry. If the passage does not establish which category fits, omit that assignment.";
  if (discovering) {
    question = `Your task is open label discovery. The student has already requested new labels for new ideas and will decide which proposals to accept after this response. Read each participant’s words against the research focus. A previously unseen, well-supported answer belongs in suggestions: give it a new concise name, definition and exact quotation now. The ${guide.vocabulary.length} existing labels are available for genuinely equivalent meanings. You can create up to ${guide.limits.newPerBatch} NEW labels in this request. If an otherwise relevant passage does not fit an existing label, that is precisely when to create a new label. Return the requested JSON immediately.`;
  }
  if (context.passages?.some((p) => p.precedingQuestion))
    question +=
      " A precedingQuestion belongs to the interviewer. Read it only to identify the topic or category for its answer. The answer itself must support the code and supply the quotation. Never quote or code a precedingQuestion.";
  if (secondLook)
    question +=
      ' This is a second reading for missed approved labels. Read each answer, including answers that already have codes. First identify the distinct things the speaker actually says. Then reconsider each relevant codebook category and its criteria. An existing code may explain one part of the answer while another explicitly supported meaning remains uncovered. The codes and declinedCodes on each passage are already settled; omit them. Return only additional assignments, with a verbatim quotation and a reason explaining which distinct meaning and criteria it supports. The limit is two additional codes per passage for this check, irrespective of existing codes. There is no expected number of matches. Negation, a hypothetical example, the question alone or a shared keyword does not establish a code unless its definition specifically allows that interpretation. Abstain when the topic, category, or fit is uncertain. If nothing has been missed, return {"suggestions":[]}.';
  // Some replies contain valid empty JSON followed by a request for permission
  // to propose the new label the student already requested.
  const asksPermission = (response) =>
    /(?:would you like|do you want|shall I|may I|should I|please confirm).{0,120}\b(?:propos\w*|add|introduc\w*|creat\w*|suggest\w*)\b.{0,35}\b(?:labels?|codes?|categor\w*)\b/is.test(
      response,
    );
  let correction = "";
  const allowed = approvedLabelLookup(guide.vocabulary || []);
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await requestTutor({
      skill: "coding",
      question: question + correction,
      context,
    });
    let suggestions;
    try {
      suggestions = structuredAnswer(answer)?.suggestions;
    } catch {
      // Request a structured result for the same batch before pausing the draft.
    }
    if (!Array.isArray(suggestions)) {
      correction =
        ' Return only a JSON object with a suggestions array. If none of the passages qualify, return {"suggestions":[]}.';
      if (attempt)
        throw Error(
          "The bot could not format this batch for review. Your previous batches are saved.",
        );
      continue;
    }
    // Some models translate every label to the language of the transcript.
    // Give that batch one chance to use the original spellings. The ordinary
    // validator still checks each result against the exact approved book.
    if (
      !attempt &&
      guide.mode === "deductive" &&
      allowed.size &&
      suggestions.length &&
      suggestions.every(
        (s) => typeof s?.code === "string" && !allowed.get(labelKey(s.code)),
      )
    ) {
      correction =
        " The proposed names are outside the approved codebook. Recheck the evidence and copy the exact label from guide.vocabulary wherever it fits. Omit unsupported assignments.";
      continue;
    }
    if (secondLook)
      return verifyMissedSuggestions(
        context,
        suggestions,
        requestTutor,
        verificationState?.checkpoint,
      );
    if (!discovering || suggestions.length || !asksPermission(answer))
      return suggestions;
    correction =
      " The student has confirmed that you may draft new labels. Put every supported proposal in the suggestions array for review now. Leave it empty if the evidence does not support a code.";
    if (attempt)
      throw Error(
        "The bot asked for permission again instead of finishing this draft. Your coding choices are saved.",
      );
  }
}
