import test from "node:test";
import assert from "node:assert/strict";
import { filterRequest } from "../src/filter-request.js";
const table = {
  kind: "table",
  fields: [
    {
      id: "a",
      label: "Study year",
      type: "category",
      levels: ["First", "Second"],
    },
    { id: "b", label: "Priority", type: "category", levels: ["First", "Last"] },
  ],
};
test("resolve a cohort from the project's options and confirm an ambiguous answer", () => {
  const first = { filter: "a", value: "First", name: "Study year" };
  assert.deepEqual(
    filterRequest(
      table,
      "Show that just for first-years. Keep the percentages within year and update my visual.",
    ),
    first,
  );
  assert.deepEqual(filterRequest(table, "Filter Study year to First."), first);
  assert.match(
    filterRequest(table, "Keep only First in the chart.").message,
    /Study year.*Priority/,
  );
  assert.match(
    filterRequest(table, "Filter Study year to Third").message,
    /Which question/,
  );
  assert.equal(filterRequest(table, "How would filtering work?"), null);
  assert.equal(filterRequest(table, "Clear the filter").filter, "");
});
test("interview group values can filter a view", () => {
  const d = {
    kind: "text",
    sources: ["One", "Two"],
    metadata: { One: { Site: "North" }, Two: { Site: "South" } },
  };
  assert.deepEqual(filterRequest(d, "Could you show that just for North?"), {
    filter: "Site",
    value: "North",
    name: "Site",
  });
});
