import test from "node:test";
import assert from "node:assert/strict";
import { corpus, makeTable } from "../src/import.js";
import { fresh, settingsProject, reattach } from "../src/project.js";
import {
  reviewParticipantLinks,
  applyParticipantLinks,
} from "../src/participant-links.js";

const info = (name, values) => makeTable([["Person", "Site"], ...values], name);
function apply(d, table, matches, tables = [table], previousValues = []) {
  return applyParticipantLinks(
    d,
    table,
    "c0",
    matches,
    previousValues,
    tables.map((t) => t.id),
  );
}

test("changing or removing a match restores independent values and leaves links from other tables intact", () => {
  const d = corpus("Interviews", [], ["Dee", "Lee"]);
  const first = info("Home", [
    ["ID1", "East"],
    ["ID2", "West"],
  ]);
  const second = info("Placement", [["Dee", "North"]]);
  d.metadata.Dee = { Site: "Own answer" };
  apply(d, first, { Dee: "ID1", Lee: "ID2" });
  assert.equal(d.metadata.Dee.Site, "East");
  apply(d, first, { Dee: "ID2", Lee: "" });
  assert.equal(d.metadata.Dee.Site, "West");
  assert.deepEqual(
    { ...reviewParticipantLinks(d, first, "c0").matches },
    { Dee: "ID2", Lee: "" },
  );
  d.metadata.Dee.Year = "Year 2";
  apply(d, second, { Dee: "Dee", Lee: "" });
  assert.equal(d.metadata.Dee.Site, "North");
  const reopened = JSON.parse(JSON.stringify(d));
  apply(reopened, second, { Dee: "", Lee: "" });
  assert.deepEqual(reopened.metadata.Dee, { Site: "West", Year: "Year 2" });
  apply(reopened, first, { Dee: "", Lee: "" });
  assert.deepEqual(reopened.metadata.Dee, {
    Site: "Own answer",
    Year: "Year 2",
  });
  assert.equal(reopened.metadata.Lee.Site, undefined);
  assert.equal(reviewParticipantLinks(reopened, second, "c0").matches.Dee, "");
});

test("in older files only confirmed, previously linked values are removed", () => {
  const d = corpus("Interviews", [], ["Dee", "Lee"]);
  delete d.participantLinks;
  d.metadata = { Dee: { Site: "East", Year: "Year 2" }, Lee: { Site: "West" } };
  const table = info("Home", [
    ["D01", "East"],
    ["L01", "West"],
  ]);
  const review = reviewParticipantLinks(d, table, "c0");
  assert.deepEqual({ ...review.matches }, { Dee: "D01", Lee: "L01" });
  assert.equal(review.previousValues.length, 2);
  apply(
    d,
    table,
    { Dee: "", Lee: "" },
    [table],
    review.previousValues.filter((entry) => entry.source === "Dee"),
  );
  assert.deepEqual(d.metadata.Dee, { Year: "Year 2" });
  assert.deepEqual(d.metadata.Lee, { Site: "West" });
});

test("a fresh link preserves a manual group even if its value equals the linked row", () => {
  const d = corpus("Interviews", [], ["Dee"]);
  const table = info("Home", [["Dee", "East"]]);
  d.metadata.Dee = { Site: "East" };
  assert.deepEqual(reviewParticipantLinks(d, table, "c0").previousValues, []);
  apply(d, table, { Dee: "Dee" });
  apply(d, table, { Dee: "" });
  assert.deepEqual(d.metadata.Dee, { Site: "East" });
});

test("unmatching still uses the same table after restoring matching settings with different dataset IDs", () => {
  const d = corpus("Interviews", [], ["Dee"]);
  const table = info("Home", [["Dee", "East"]]);
  const settings = settingsProject({ ...fresh(), datasets: [d, table] });
  settings.datasets[0].id = "saved-interviews";
  settings.datasets[1].id = "saved-table";
  apply(d, table, { Dee: "Dee" });
  const [restored, infoTable] = reattach(settings, [d, table]).datasets;
  apply(restored, infoTable, { Dee: "" });
  assert.equal(restored.metadata.Dee.Site, undefined);
  assert.equal(restored.participantLinks.tables.length, 1);
});
