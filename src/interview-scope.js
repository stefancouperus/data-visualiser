// Names come from this collection. Only preselect a source when its name can
// be resolved unambiguously. The student always sees and confirms the scope.
const words = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
const generic = new Set(
  "interview interviews transcript transcripts interviewee interviewees interviewdeel transcription participant respondent conversation gesprek interviewtranscript interviewtranscriptie transcriptie final draft revised edited coded uncoded recording copy audio doc docx txt csv the and from test version".split(
    " ",
  ),
);
const commonName = (token) => generic.has(token) || /^\d+$/u.test(token);

// A gap check uses the shared codebook even if the student calls the results
// "suggestions". It is a different request from discovering new labels.
export function requestsMissedLabels(message) {
  const text = message.toLowerCase().replace(/’/g, "'");
  const naming =
    /\b(?:codes?|labels?|themes?|coderingen|thema's|coding)\b/u.test(text);
  if (!naming) return false;
  return (
    /\b(?:miss(?:ed|ing)?|overlook(?:ed)?|omitted|forgotten|overgeslagen|gemist\w*|ontbreken\w*)\s+(?:(?:any|other|some|existing|approved|applicable)\s+){0,3}(?:codes?|labels?|themes?|coderingen)\b/i.test(
      text,
    ) ||
    /\b(?:codes?|labels?|themes?|coderingen)\b(?:\s+(?:that|which|did|have|were|we|i|you|the bot|been|may|might|had|zijn|we hebben)){0,6}\s+(?:miss(?:ed)?|overlook(?:ed)?|omit(?:ted)?|gemist|overgeslagen)\b/i.test(
      text,
    ) ||
    /\b(?:second (?:look|pass)|look again|double[- ]check|check again|recheck)\b/i.test(
      text,
    ) ||
    (/\b(?:additional|other|another|second)\b/i.test(text) &&
      /\b(?:already coded|already labelled|already labeled|also appl(?:y|ies)|also fit)\b/i.test(
        text,
      ))
  );
}

function mentionedSources(message, sources) {
  const aliases = new Map();
  let longest = 0;
  function add(alias, source) {
    if (!aliases.has(alias)) {
      aliases.set(alias, new Set());
      longest = Math.max(longest, alias.split(" ").length);
    }
    aliases.get(alias).add(source);
  }
  for (const name of sources) {
    const tokens = words(
      name.replace(/\.(?:docx?|txt|xlsx?|csv|tsv|pdf|rtf)$/iu, ""),
    );
    if (!tokens.length) continue;
    if (tokens.length > 1 || !commonName(tokens[0]))
      add(tokens.join(" "), name);
    for (const token of tokens) {
      if (token.length >= 3 && !commonName(token)) add(token, name);
    }
  }
  // Match the longest name at each position so "Sanne 2" need not select
  // a second file named simply "Sanne".
  const tokens = words(message),
    matches = new Set();
  let ambiguous = false;
  for (let i = 0; i < tokens.length; i++) {
    for (let size = Math.min(longest, tokens.length - i); size > 0; size--) {
      const candidates = aliases.get(tokens.slice(i, i + size).join(" "));
      if (!candidates) continue;
      if (candidates.size === 1) matches.add(candidates.values().next().value);
      else ambiguous = true;
      i += size - 1;
      break;
    }
  }
  return { names: sources.filter((source) => matches.has(source)), ambiguous };
}

export function interviewScopeRequest(message, sources, current) {
  // A student may already describe a later application to the whole
  // collection while asking to start discovery with just two interviews.
  const firstStep = message
    .replace(/^\s*(?:(?:and )?then|afterwards)\b[ ,]*/i, "")
    .split(
      /\b(?:and then|then|afterwards|and later|before applying)\b|\band\s+(?=(?:apply|use)\s+(?:them|those|these|the resulting|the same)\b)/i,
    )[0];
  const { names, ambiguous } = mentionedSources(firstStep, sources);
  const target =
    firstStep.match(/\b(?:from|between|using)\s+(.+?)(?:[?!;]|$)/i)?.[1] || "";
  // If only one named file resolves in a request for two, ask the student to
  // identify the other one instead of running on a single interview.
  const partlyNamedPair =
    names.length === 1 &&
    /\s+(?:and|&)\s+["“']?\p{Lu}[\p{L}’'-]*/u.test(target);
  const pair =
    partlyNamedPair ||
    /\b(?:both|two|2)\s+(?:(?:my|our|the|of the|other)\s+)?(?:interviews?|transcripts?)\b|\b(?:a second|an additional|another|one other|one more)\s+(?:interview|transcript)\b/i.test(
      firstStep,
    );
  const all =
    /\b(?:all|each|every)(?:\s+(?:of|my|our|the|these|those|loaded|uploaded|other|\d+|three|two))*\s+(?:interviews?|transcripts?)\b|\balle (?:interviews|transcripten)\b|\b(?:whole|entire) collection\b/i.test(
      firstStep,
    );
  const constrained =
    /\b(?:except|excluding|apart from|other than|all (?:the )?other|but not|leave out|don't include|do not include|not all|behalve|uitgezonderd|niet alle)\b/i.test(
      firstStep,
    );
  if (constrained)
    return {
      scope: "selected",
      sources: [],
      prompt: "Tick the interviews you want to include.",
    };
  if (all) return { scope: "all" };
  if (pair && sources.length === 2 && !ambiguous && !partlyNamedPair)
    return { scope: "all" };
  if (
    pair ||
    ambiguous ||
    names.length ||
    /\b(?:interviews|transcripts)\b/i.test(firstStep) ||
    (target &&
      !/^(?:this|the current|my current|the open|the selected|these)\b/i.test(
        target,
      ))
  ) {
    const picked = [...names];
    if (
      pair &&
      !picked.length &&
      /\b(?:this|current)\b/i.test(firstStep) &&
      sources.includes(current)
    )
      picked.push(current);
    const result = { scope: "selected", sources: picked };
    if (pair && picked.length < 2) {
      result.minimum = 2;
      result.prompt = picked.length
        ? "Tick the second interview you want to include."
        : "Tick the two interviews you want to include.";
    } else if (ambiguous)
      result.prompt =
        "More than one filename matches. Tick the interviews you mean.";
    return result;
  }
  return { scope: "current" };
}
