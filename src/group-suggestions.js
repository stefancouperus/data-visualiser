import { filteredRows } from "./import.js";
import { surveyGroupReader } from "./survey-grouping.js";
import { isInterview } from "./interviews.js";
import {
  groupChoices,
  groupValue,
  patternChoices,
  patternSummary,
} from "./patterns.js";

export function asksForGroupSuggestion(question) {
  return (
    /\b(?:any|which|what|some)\s+(?:(?:respondent|interviewee|student|survey|interview|participant)\s+)?(?:sub)?groups?\b.{0,55}\b(?:stand\s*out|differ|compare|comparison|worth|interesting|look at|explore|suggest)|\b(?:suggest|recommend|find|choose)\b.{0,35}\b(?:a group(?:ing)?|groups|group comparison|grouping variable)\b|\b(?:worth|interesting|useful)\b.{0,15}\bgroup comparisons?\b/i.test(
      question,
    ) &&
    !/\b(?:split|break down|group them) by\b|\b(?:only among|controlling for|adjusting for)\b/i.test(
      question,
    )
  );
}

export function suggestGrouping(d, view) {
  const text = d.kind === "text",
    options = new Map(patternChoices(d));
  const items =
    view.task === "patterns"
      ? view.items || []
      : view.task === "one"
        ? [view.x]
        : view.task === "two"
          ? [view.x, view.y]
          : [];
  if (!items.length || items.some((id) => !options.has(id)))
    return {
      message: text
        ? "Tick the themes you want to compare in Explore, then ask me again."
        : "Tick one or more survey questions in Explore, then ask me again.",
    };
  const mode =
    view.task === "patterns"
      ? view.patternMode
      : text
        ? view.task === "two"
          ? "passages"
          : "sources"
        : items.length > 1
          ? "together"
          : "separate";
  const groupingFields = groupChoices(d, items).filter(
    ([key, label]) =>
      key !== view.filter &&
      !/\b(?:identifier|id|email|e-mail|name|postcode|address)\b/i.test(label),
  );
  if (!groupingFields.length)
    return {
      message: text
        ? "I need a characteristic recorded for the interviews. Choose Add interview groups in Explore, enter a group for each interview, then ask again."
        : "I need a separate column that records group membership for the selected responses. Check the columns in your upload.",
    };
  const entries = text
    ? d.sources.filter(
        (s) =>
          !view.filter ||
          (view.filter === "source" ? s : d.metadata?.[s]?.[view.filter]) ===
            view.value,
      )
    : filteredRows(d, view);
  const candidates = [];
  for (const [key, label] of groupingFields) {
    const readGroup = text
      ? (entry) => groupValue(d, key, entry)
      : surveyGroupReader(d.fields.find((field) => field.id === key));
    const counts = new Map();
    let recorded = 0;
    // A copy of a selected answer would manufacture a contrast.
    const copies = new Set(text ? [] : items);
    for (const entry of entries) {
      const value = readGroup(entry);
      if (!value) continue;
      recorded++;
      for (const item of copies)
        if (
          String(entry[item] ?? "")
            .trim()
            .toLowerCase() !==
          String(entry[key] ?? "")
            .trim()
            .toLowerCase()
        )
          copies.delete(item);
      counts.set(value, (counts.get(value) || 0) + 1);
      if (counts.size > 12) break;
    }
    const groupSizes = [...counts.values()].sort((a, b) => b - a);
    if (copies.size || counts.size > 12 || !(groupSizes[1] >= 2)) continue;
    candidates.push({
      key,
      label,
      coverage: recorded / entries.length,
      comparisonBase: groupSizes[1],
    });
  }
  candidates.sort(
    (a, b) => b.coverage - a.coverage || b.comparisonBase - a.comparisonBase,
  );
  let best = null,
    checked = 0,
    usable = false;
  for (const c of candidates.slice(0, 12)) {
    const spec = {
      task: "patterns",
      items,
      patternMode: mode,
      groupBy: c.key,
      themeUnit: view.themeUnit === "passages" ? "passages" : "interviews",
      ...(!text && mode === "separate"
        ? { chart: "grid", percentBase: "group" }
        : { chart: isInterview(d) && mode === "sources" ? "grid" : "bars" }),
    };
    let a;
    try {
      a = patternSummary(d, { ...view, ...spec, title: "" });
    } catch (error) {
      if (/too large|smaller figure/.test(error.message)) continue;
      throw error;
    }
    checked++;
    const sizes = new Map(
      a.groupSizes.map((g) => [
        g.group,
        a.themeComparison && !g.passages ? 0 : g.selected,
      ]),
    );
    const rows = new Map();
    for (const r of a.records) {
      if (r.den < 2 || sizes.get(r.groupValue) < 2) continue;
      const key = JSON.stringify([r.fieldId, r.keyParts || r.label]);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(r);
    }
    for (const cells of rows.values()) {
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++) {
          usable = true;
          const [high, low] =
            cells[i].value >= cells[j].value
              ? [cells[i], cells[j]]
              : [cells[j], cells[i]];
          const gap = high.value - low.value;
          if (!gap) continue;
          const smallerBase = Math.min(
            high.den,
            low.den,
            sizes.get(high.groupValue),
            sizes.get(low.groupValue),
          );
          // Reduce the priority of sparse or incomplete comparisons. This is a
          // descriptive ranking, not a test or a probability of a true effect.
          const score = gap * Math.min(1, smallerBase / 5) * c.coverage;
          if (!best || score > best.score)
            best = { score, c, spec, high, low, gap, smallerBase };
        }
    }
  }
  if (!best)
    return {
      message: usable
        ? "I found the same shares across the groups I could compare for this selection. There is no observed difference to highlight."
        : "I couldn’t find two groups with at least two usable observations and two records or interviews in each. Check the filter or try a different grouping or selection.",
    };
  const { c, spec, high, low, gap, smallerBase } = best;
  const label =
    mode === "together" && high.parts
      ? high.parts.map((s, i) => options.get(items[i]) + " = " + s).join("; ")
      : high.group;
  const unit = text
    ? (mode === "sources" && spec.themeUnit === "passages") ||
      mode === "passages"
      ? "passages"
      : "interviews"
    : "responses";
  const pct = (x) => Number(x.toFixed(1));
  const counts = (r) =>
    r.n +
    " of " +
    r.den +
    " " +
    unit +
    " (" +
    pct(r.value) +
    "%) in “" +
    r.groupValue +
    "”";
  const message =
    "Try comparing by “" +
    c.label +
    "”. For “" +
    label +
    "”, the figure would show " +
    counts(high) +
    " and " +
    counts(low) +
    ". That is a " +
    pct(gap) +
    " percentage-point difference in this sample. " +
    "I checked " +
    checked +
    " possible grouping" +
    (checked === 1 ? "" : "s") +
    " for the selection" +
    (candidates.length > 12 ? " (limited to 12)" : "") +
    ". " +
    (smallerBase < 5
      ? "At least one group has fewer than five contributing observations or interviews, so one case can change the comparison substantially. "
      : "Treat this as a pattern to explore in your sample. ") +
    (checked > 1
      ? "Checking several groupings can turn up differences by chance. "
      : "") +
    "Shall I draw it?";
  const evidence = [high, low].map(({ group, groupValue, n, den }) => ({
    group,
    groupValue,
    n,
    den,
  }));
  return { spec, message, evidence };
}
