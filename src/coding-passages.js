import { transcriptIndex } from "./transcript-index.js";
// A student's explicit choice overrides the suggested selection.
export const standardInterviewer = (speaker) =>
  /^(?:interviewer|researcher|moderator|onderzoeker|interviewster|question|vraag|q)$/iu.test(
    speaker,
  );
const secondTurn = /(?:^|\s)[\p{L}][\p{L}\p{N} .'’-]{0,32}:\s*\S/u;
const heading =
  /^(?:(?:interview\s+)?transcript(?:ion)?|transcriptie|transcription|interview)\s*[:#–—-]?\s*\d*$/iu;
const administration =
  /\b(?:(?:do you (?:agree|consent)|are you (?:happy|comfortable)|is it (?:ok(?:ay)?|all right)|(?:can|may) (?:we|i))\b.{0,48}\b(?:record(?:ing|ed)?|participat(?:e|ion)|take part)|(?:geef (?:je|u) toestemming|(?:mag|mogen) (?:ik|wij|we)|(?:ga|gaat) (?:je|u) akkoord)\b.{0,45}\b(?:opneem|opnemen|opname|deelnemen)|(?:consent form|toestemmingsformulier)\s*[?.:]?\s*$)/iu;
const explicitAnswer =
  /^(?:i (?:agree|consent) to (?:be(?:ing)? recorded|(?:the|this) recording|participat(?:e|ing) in (?:this|the) (?:study|interview))|ik geef toestemming (?:voor|om) (?:de|deze|het|dit) (?:opname|interview))\b/iu;
const interviewContext =
  /\b(?:this|the|our) (?:interview|conversation|study|research)|\b(?:be(?:ing)? recorded|this recording)|\b(?:dit|deze|ons|onze) (?:interview|gesprek|onderzoek|opname)|(?:consent form|toestemmingsformulier)\b/iu;
const shortReply =
  /^(?:yes|yeah|sure|of course|i (?:agree|consent)|that(?:'s| is) (?:fine|ok(?:ay)?)|no|ja|nee|akkoord|prima|dat (?:mag|is goed))(?:[ ,.]+(?:that(?:'s| is) (?:fine|ok(?:ay)?)|i (?:agree|consent)|of course|dat (?:mag|is goed)|prima))?[.!\s]*$/iu;
// Recognise conventional speaker prefixes. A custom prefix becomes the
// interviewer only when the student identifies it for this transcript.
const speakerPrefix =
  /^(?:\[(?:\d{1,2}:){1,2}\d{2}(?:[.,]\d+)?\]\s*)?(?:\[([\p{L}][\p{L}\p{N} _.’’-]{0,35})\]\s*:?\s*|([\p{L}][\p{L}\p{N} _.'’()-]{0,35})\s*:\s*)/u;
export const speakerTag = (text) => {
  const match = speakerPrefix.exec(text.trim());
  return match?.[1] || match?.[2]?.trim() || "";
};

function originalTurns(originals) {
  const turns = [];
  for (const p of originals) {
    const last = turns.at(-1);
    if (p.turnId && p.turnId === last?.id && p.source === last.source)
      last.parts.push(p);
    else turns.push({ id: p.turnId || p.id, source: p.source, parts: [p] });
  }
  return turns;
}

// Evaluate a complete turn even when the reader displays it in several pieces.
// Only the immediately following answer in that interview can use its question.
export function interviewPassageScope(originals) {
  const included = new Set(),
    questions = new Map(),
    previous = new Map();
  for (const { source, parts } of originalTurns(originals)) {
    const text = parts
      .map((p) => p.text)
      .join("")
      .trim();
    const speaker = speakerTag(text);
    const content = text.replace(speakerPrefix, "");
    const prompt =
      speaker &&
      (standardInterviewer(speaker) || parts[0].interviewerTag === speaker);
    const mixed = prompt && secondTurn.test(content);
    const consent =
      !mixed &&
      administration.test(content) &&
      (prompt || (!speaker && interviewContext.test(content)));
    const prior = previous.get(source);
    const administrative =
      consent ||
      explicitAnswer.test(content) ||
      (prior?.consent && shortReply.test(content));
    const excluded =
      !text || heading.test(text) || (prompt && !mixed) || administrative;
    for (const p of parts) {
      if (p.codingIncluded ?? (p.codes?.length || !excluded))
        included.add(p.id);
      if (prior?.question && !excluded && !prompt)
        questions.set(p.id, prior.question);
    }
    // A long prompt or a mixed turn may contain unrelated or sensitive remarks.
    // Only a short, identifiable question is offered in the confirmation screen.
    const question =
      prompt &&
      !mixed &&
      !administrative &&
      text.length <= 1200 &&
      /[?？]/u.test(content) &&
      !proceduralQuestion.test(content)
        ? text
        : "";
    previous.set(source, { consent, question });
  }
  return { included, questions };
}
const proceduralQuestion =
  /\b(?:consent|confidentiality|informed consent|off the record|anon(?:ym|im)i[sz]|toestemming|vertrouwelijk)\p{L}*\b|\b(?:record|recording|opneem|opnemen|opname)\b.{0,45}\b(?:interview|conversation|gesprek|audio)\b|\b(?:interview|conversation|gesprek)\b.{0,45}\b(?:record|recorded|recording|opnemen|opname)\b/iu;

export function codingSelection(originals) {
  return interviewPassageScope(originals).included;
}

// Read-only projection for figures and supporting evidence. Original records
// always remain on the project, including earlier labels on excluded text.
export function includedInterview(d) {
  if (
    !d?.interviews ||
    d.openAnswers ||
    d.textPurpose === "documents" ||
    !d.passages.length ||
    typeof d.passages[0].text !== "string"
  )
    return d;
  const index = transcriptIndex(d.passages);
  const eligible = codingSelection(index.originals);
  if (eligible.size === index.originals.length) return d;
  const passages = d.passages.filter((p) =>
    eligible.has(index.positions.get(p.id).original.id),
  );
  const includedSources = new Set(passages.map((p) => p.source));
  const supplied = new Set(index.originals.map((p) => p.source));
  return {
    ...d,
    sources: d.sources.filter(
      (s) => !supplied.has(s) || includedSources.has(s),
    ),
    passages,
  };
}
