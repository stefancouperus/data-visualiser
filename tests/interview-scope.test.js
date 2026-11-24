import test from "node:test";
import assert from "node:assert/strict";
import {
  interviewScopeRequest,
  requestsMissedLabels,
} from "../src/interview-scope.js";
import { requestsCoding } from "../src/coding.js";

const sources = [
  "Interview 01 — Sanne.docx",
  "Noor.txt",
  "Transcrição – João.txt",
];
const scope = (q, files = sources) => interviewScopeRequest(q, files, files[0]);

test("checking for omissions is distinct from discovering new labels", () => {
  for (const request of [
    "Check for missed labels, including passages already coded.",
    "Were any approved codes overlooked in both interviews?",
    "Did we miss any applicable labels?",
    "Do any other approved codes also fit?",
    "Could you do a second pass on the coding?",
    "Controleer op gemiste labels in alle interviews.",
  ])
    assert.ok(requestsMissedLabels(request), request);
  for (const request of [
    "Propose new labels for this interview",
    "How do I remove the label ‘Missed appointment’?",
    "Create a table with theme counts.",
  ])
    assert.equal(requestsMissedLabels(request), false, request);
});

test("interview requests resolve two named sources from the current project before a later all-interview instruction", () => {
  assert.deepEqual(
    scope(
      "Suggest labels from joao and SANNE and then apply them to all interviews",
    ),
    { scope: "selected", sources: [sources[0], sources[2]] },
  );
  assert.deepEqual(
    scope(
      "Suggest codes from Noor and Sanne, and apply those labels to my entire collection",
    ),
    { scope: "selected", sources: sources.slice(0, 2) },
  );
  assert.deepEqual(scope("Use those same labels across all the interviews"), {
    scope: "all",
  });
  assert.ok(requestsCoding("Apply them to all interviews"));
  assert.deepEqual(scope("Then apply them to all interviews."), {
    scope: "all",
  });
  assert.deepEqual(
    scope(
      "Suggest labels from Sanne and a second interview",
      sources.slice(0, 2),
    ),
    { scope: "all" },
  );
  assert.equal(scope("Suggest labels from Sanne and Mia").minimum, 2);
  assert.deepEqual(scope("Suggest labels from Yara").sources, []);
});

test("ambiguous names and unnamed second interviews leave a visible choice", () => {
  assert.equal(
    scope("Suggest labels from Sanne and a second interview").minimum,
    2,
  );
  assert.deepEqual(
    scope("Suggest labels from Sanne and a second interview").sources,
    [sources[0]],
  );
  assert.deepEqual(
    scope("Suggest labels from both interviews", sources.slice(0, 2)),
    { scope: "all" },
  );
  assert.deepEqual(scope("Suggest labels from both interviews").sources, []);
  assert.equal(
    scope("Suggest labels from two interviews", [sources[0]]).minimum,
    2,
  );
  assert.deepEqual(
    scope("Suggest codes from Sanne", ["Sanne A.txt", "Sanne B.txt"]).sources,
    [],
  );
  assert.equal(
    scope("Suggest codes from Sanne B", ["Sanne A.txt", "Sanne B.txt"])
      .sources[0],
    "Sanne B.txt",
  );
  assert.deepEqual(
    scope("Apply labels to all interviews except Noor").sources,
    [],
  );
});
