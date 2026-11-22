// Keep conversation and confirmed actions separate. A loaded conversation is
// background for the tutor, never a queue of commands to replay.
export function tutorRecord(project) {
  const key = project.active || "upload";
  return (project.tutorHistory[key] ??= { activity: [], messages: [] });
}

export function readTutorHistory(input, datasetIds) {
  const result = Object.create(null);
  for (const key of new Set(["upload", ...datasetIds])) {
    const entry = input?.[key];
    if (!entry) continue;
    result[key] = {
      activity: Array.isArray(entry.activity)
        ? entry.activity.filter((s) => typeof s === "string")
        : [],
      messages: Array.isArray(entry.messages)
        ? entry.messages
            .filter(
              (m) =>
                m &&
                ["user", "assistant"].includes(m.role) &&
                typeof m.content === "string",
            )
            .map(({ role, content }) => ({ role, content }))
        : [],
    };
  }
  return result;
}

export function projectPackage(project) {
  const tutorHistory = Object.fromEntries(
    Object.entries(project.tutorHistory).map(([key, entry]) => [
      key,
      {
        activity: entry.activity,
        ...(project.includeBotChat ? { messages: entry.messages } : {}),
      },
    ]),
  );
  return { ...project, tutorHistory };
}

export function previousWork(record, question) {
  const words = new Set(
    question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [],
  );
  const relevant = (text) =>
    [...words].reduce(
      (sum, w) => sum + Number(text.toLowerCase().includes(w)),
      0,
    );
  const pick = (entries, limit) =>
    entries
      .map((text, i) => ({ text, i, score: relevant(text) }))
      .sort((a, b) => b.score - a.score || b.i - a.i)
      .slice(0, limit)
      .sort((a, b) => a.i - b.i)
      .map((e) => e.text.slice(0, 1200));
  const history = { earlierActivity: pick(record.activity, 8) };
  if (
    record.messages.length &&
    /\b(earlier|previous\w*|before|last time|revisit|remember|why did|what did|what have we|recap|so far|discuss\w*|history)\b/i.test(
      question,
    )
  ) {
    const exchanges = [];
    for (const m of record.messages) {
      if (m.role === "user" || !exchanges.length) exchanges.push("");
      exchanges[exchanges.length - 1] +=
        (m.role === "user" ? "Student: " : "Tutor: ") + m.content + "\n";
    }
    history.earlierExchanges = pick(exchanges, 4);
  }
  return history;
}
