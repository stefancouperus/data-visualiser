import test from "node:test";
import assert from "node:assert/strict";
import { fresh, verifyProject, settingsProject } from "../src/project.js";
import {
  tutorRecord,
  projectPackage,
  previousWork,
} from "../src/tutor-history.js";
test("per-dataset history can be revisited without leaking other datasets or exporting chat by default", () => {
  const p = fresh();
  p.datasets = ["a", "b"].map((id) => ({
    id,
    kind: "text",
    sources: [],
    passages: [],
  }));
  p.active = "a";
  const record = tutorRecord(p);
  record.activity.push("Created a year comparison.");
  record.messages.push(
    { role: "user", content: "Why group by year?" },
    { role: "assistant", content: "Each year is a comparison group." },
  );
  p.active = "b";
  assert.deepEqual(tutorRecord(p).messages, []);
  p.active = "a";
  assert.equal(projectPackage(p).tutorHistory.a.messages, undefined);
  p.includeBotChat = true;
  const copy = verifyProject(JSON.parse(JSON.stringify(projectPackage(p))));
  assert.deepEqual(tutorRecord(copy), record);
  assert.match(
    previousWork(
      tutorRecord(copy),
      "Why did we group by year?",
    ).earlierExchanges.join(" "),
    /comparison group/,
  );
  assert.equal(settingsProject(p).tutorHistory, undefined);
  const old = projectPackage(p);
  delete old.tutorHistory;
  assert.deepEqual(tutorRecord(verifyProject(old)).activity, []);
});
