// Models occasionally introduce or explain their JSON. Accept one unambiguous
// payload; existing task-specific validation still decides which actions can run.
export function structuredAnswer(answer, allowSurroundingText = true) {
  const text = answer.trim();
  try {
    return JSON.parse(text);
  } catch {
    const blocks = [
      ...text.matchAll(/```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/gi),
    ];
    if (
      blocks.length === 1 &&
      (allowSurroundingText || blocks[0][0] === text)
    ) {
      return JSON.parse(blocks[0][1].trim());
    }
    if (!blocks.length && allowSurroundingText) {
      const start = text.indexOf("{"),
        end = text.lastIndexOf("}");
      if (start >= 0 && end > start)
        return JSON.parse(text.slice(start, end + 1));
    }
    throw Error(
      "The bot returned an unreadable response. Try the request again.",
    );
  }
}
