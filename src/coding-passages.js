import { transcriptIndex } from "./transcript-index.js";
// A student's explicit choice overrides the suggested selection.
const interviewer =
  /^(?:interviewer|researcher|moderator|onderzoeker|interviewster|question|vraag|q)\s*:\s*/iu;
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
const withoutSpeaker = (text) =>
  text.replace(/^[\p{L}][\p{L} .’'-]{0,35}:\s*/u, "");
export function codingSelection(originals) {
  const included = new Set(),
    priorConsent = new Map();
  for (const p of originals) {
    const text = p.text.trim();
    const turn = interviewer.exec(text);
    const content = withoutSpeaker(text);
    const mixed = turn && secondTurn.test(text.slice(turn[0].length));
    const consent =
      !mixed &&
      administration.test(content) &&
      (turn || (content === text && interviewContext.test(content)));
    const excluded =
      !text ||
      heading.test(text) ||
      (turn && !mixed) ||
      consent ||
      explicitAnswer.test(content) ||
      (priorConsent.get(p.source) && shortReply.test(content));
    if (p.codingIncluded ?? (p.codes?.length || !excluded)) included.add(p.id);
    if (text) priorConsent.set(p.source, consent);
  }
  return included;
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
