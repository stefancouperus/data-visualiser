import { labelKey, labelVocabulary } from "./coding.js";

const palette = [
  "#315ea5",
  "#aa452d",
  "#267254",
  "#86499b",
  "#94651c",
  "#197683",
  "#b03e6a",
  "#585ca2",
  "#4f7428",
  "#8f4e40",
  "#486b89",
  "#776624",
];
const hex = /^#[0-9a-f]{6}$/i;
function nextColour(used) {
  for (const colour of palette) if (!used.has(colour)) return colour;
  for (let i = used.size; i < used.size + 20; i++) {
    // Rotate round the colour wheel after the classroom-sized starting palette.
    const hue = (i * 137.508) % 360;
    const channel = (n) => {
      const k = (n + hue / 30) % 12;
      const v = 0.38 - 0.21 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * v)
        .toString(16)
        .padStart(2, "0");
    };
    const colour = "#" + channel(0) + channel(8) + channel(4);
    if (!used.has(colour)) return colour;
  }
  // Odd multiplication visits each 24-bit RGB colour once. At most one more
  // candidate than the number already in use is needed to find a free one.
  const count = Math.min(used.size + 1, 0x1000000);
  for (let offset = 0; offset < count; offset++) {
    const rgb = Math.imul(used.size + offset, 0x9e3779) & 0xffffff;
    const colour = "#" + rgb.toString(16).padStart(6, "0");
    if (!used.has(colour)) return colour;
  }
  return palette[0];
}

// Use one map for a transcript and its legend, including any unapproved preview.
export function labelAppearance(d, additionalLabels = []) {
  const stored = new Map();
  for (const row of d.coding?.labelStyles || [])
    if (typeof row?.label === "string" && hex.test(row.colour))
      stored.set(labelKey(row.label), {
        label: row.label,
        colour: row.colour.toLowerCase(),
        category: typeof row.category === "string" ? row.category : "",
      });
  const entries = labelVocabulary([
    ...(d.coding?.book || []),
    ...(d.coding?.meanings || []),
    ...new Set(d.passages.flatMap((p) => p.codes)),
    ...additionalLabels,
  ]);
  const used = new Set(
    entries.map((e) => stored.get(labelKey(e.label))?.colour).filter(Boolean),
  );
  const styles = new Map();
  for (const { label, category } of entries) {
    const key = labelKey(label);
    const appearance = stored.get(key) || {
      label,
      colour: nextColour(used),
      category: category || "",
    };
    styles.set(key, { ...appearance, label });
    used.add(appearance.colour);
  }
  return styles;
}

// Preserve the source order of both the categories and the labels inside them.
export function groupCodebookEntries(
  entries,
  categoryFor = (entry) => entry.category,
) {
  const groups = new Map();
  for (const entry of entries) {
    const name = categoryFor(entry)?.trim() || "";
    const key = labelKey(name);
    if (!groups.has(key)) groups.set(key, [name, []]);
    groups.get(key)[1].push(entry);
  }
  return [...groups.values()];
}

// Native label appearance is also used by the transcript legend and Word export.
export function applyCodebookCategories(d, book) {
  const styles = labelAppearance(d);
  const names = new Map(
    (d.coding.categories || []).map((c) => [labelKey(c), c]),
  );
  for (const entry of book) {
    const style = styles.get(labelKey(entry.label));
    const category = entry.category?.trim() || "";
    if (category && !names.has(labelKey(category)))
      names.set(labelKey(category), category);
    style.category = names.get(labelKey(category)) || "";
  }
  d.coding.labelStyles = [...styles.values()];
  if (names.size) d.coding.categories = [...names.values()];
}

export function availableLabelColour(styles) {
  return nextColour(new Set([...styles.values()].map((e) => e.colour)));
}

export function rememberLabelAppearance(d) {
  const rows = [...labelAppearance(d).values()];
  if (rows.length || d.coding?.labelStyles?.length) {
    d.coding ||= {};
    d.coding.labelStyles = rows;
  }
}

export function setLabelAppearance(d, label, colour, category) {
  if (!hex.test(colour)) throw Error("Choose a label colour.");
  const styles = labelAppearance(d, [label]);
  const categories = d.coding?.categories || [];
  const existing = categories.find((c) => labelKey(c) === labelKey(category));
  const name = existing ?? category.trim();
  styles.set(labelKey(label), {
    label,
    colour: colour.toLowerCase(),
    category: name,
  });
  d.coding ||= {};
  d.coding.labelStyles = [...styles.values()];
  if (name && !existing) d.coding.categories = [...categories, name];
  for (const entry of d.coding.book || []) {
    if (typeof entry === "string" || labelKey(entry.label) !== labelKey(label))
      continue;
    if (name) entry.category = name;
    else delete entry.category;
  }
}

export function editCategory(d, old, name) {
  const categories = d.coding?.categories || [];
  if (old && !categories.includes(old))
    throw Error("Select a category to change.");
  const trimmed = name.trim();
  if (
    trimmed &&
    categories.some((c) => c !== old && labelKey(c) === labelKey(trimmed))
  )
    throw Error("A category with this name already exists.");
  if (!old && !trimmed) throw Error("Enter a category name.");
  d.coding ||= {};
  d.coding.categories = old
    ? categories.flatMap((c) => (c === old ? (trimmed ? [trimmed] : []) : [c]))
    : [...categories, trimmed];
  for (const row of d.coding.labelStyles || [])
    if (old && row.category === old) row.category = trimmed;
  for (const entry of d.coding.book || []) {
    if (!old || typeof entry === "string" || entry.category !== old) continue;
    if (trimmed) entry.category = trimmed;
    else delete entry.category;
  }
}
