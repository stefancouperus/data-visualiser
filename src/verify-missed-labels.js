import { checkedSuggestions, labelKey } from "./coding.js";
import { structuredAnswer } from "./bot-response.js";

function codeMeaning(entry) {
  return {
    code: entry.label,
    category: entry.category || "",
    definition: entry.definition,
  };
}

export async function verifyMissedSuggestions(
  context,
  rawSuggestions,
  requestTutor,
  checkpoint,
) {
  const { guide, passages } = context;
  if (guide.mode !== "deductive" || guide.reviewPass !== "missed")
    throw Error(
      "Evidence verification requires a missed-label check with an approved codebook.",
    );
  const excluded = {};
  const valid = checkedSuggestions(rawSuggestions, passages, guide, excluded);
  await checkpoint?.(valid, excluded);
  if (!valid.length) return [];
  const book = new Map(guide.vocabulary.map((entry) => [entry.label, entry]));
  const leaf = (entry) => labelKey(entry.sourceLabel || entry.label);
  const candidates = valid.map((m, i) => {
    const entry = book.get(m.code);
    const alternatives = guide.vocabulary.filter(
      (other) => other !== entry && leaf(other) === leaf(entry),
    );
    return {
      id: "v" + (i + 1),
      passageId: m.id,
      ...codeMeaning(entry),
      quote: m.quote,
      ...(alternatives.length
        ? { alternatives: alternatives.map(codeMeaning) }
        : {}),
    };
  });
  const used = new Set(valid.map((m) => m.id));
  const answers = passages
    .filter((p) => used.has(p.id))
    .map(({ id, text, precedingQuestion }) => ({
      id,
      text,
      ...(precedingQuestion ? { precedingQuestion } : {}),
    }));
  const ids = new Set(candidates.map((c) => c.id));
  let question =
    'Independently verify these proposed assignments. Keep only candidate IDs whose exact code and branch are clearly supported by the quoted words read in their answer. Check the actor, activity, timing and any negation. A reference to a similar activity or a lack of information is insufficient. Prefer to leave a doubtful interpretation for manual coding. An empty keep array is valid. Return only {"keep":[...]} using supplied candidate IDs.';
  for (let attempt = 0; attempt < 2; attempt++) {
    // Transport failures pause the draft. Only an unreadable verdict triggers
    // a second request for the same, already checked candidates.
    const response = await requestTutor({
      skill: "verifyCoding",
      question,
      context: { passages: answers, candidates },
    });
    let verdict;
    try {
      verdict = structuredAnswer(response, false);
    } catch {
      /* Retry malformed output once. */
    }
    if (
      verdict &&
      Object.keys(verdict).length === 1 &&
      Array.isArray(verdict.keep) &&
      verdict.keep.every((id) => ids.has(id)) &&
      new Set(verdict.keep).size === verdict.keep.length
    ) {
      const keep = new Set(verdict.keep);
      return valid.filter((_, i) => keep.has(candidates[i].id));
    }
    question +=
      ' The previous verdict was unreadable. Return exactly one object with only a keep array of unique supplied candidate IDs. Use {"keep":[]} if none pass.';
  }
  throw Error(
    "The bot could not verify the evidence in this batch. Your pending candidates are saved for another check.",
  );
}
