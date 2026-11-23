import test from "node:test";
import assert from "node:assert/strict";
import { readHelpMode, saveHelpMode, helpSuggestion } from "../src/bot-help.js";

test("help preferences use the browser, reject invalid values and keep working when storage is blocked", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => values.get(key),
        setItem: (key, val) => values.set(key, val),
      },
    });
    assert.equal(readHelpMode(), "hints");
    saveHelpMode("request");
    assert.equal(values.get("dv-help-mode"), "request");
    saveHelpMode("unknown");
    assert.equal(readHelpMode(), "request");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw Error("Blocked");
      },
    });
    saveHelpMode("guided");
    assert.equal(readHelpMode(), "guided");
    saveHelpMode("hints");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("suggestions depend on the current stage, dataset and view", () => {
  const start = { step: 0 };
  assert.equal(helpSuggestion("request", start), "");
  assert.match(helpSuggestion("hints", start), /Which file/);
  const survey = {
    step: 2,
    dataset: { kind: "table" },
    view: { task: "one" },
    panel: 1,
  };
  assert.match(helpSuggestion("hints", survey), /data-next="choose"/);
  assert.match(
    helpSuggestion("guided", survey),
    /data-next="askview" data-i="1"/,
  );
  assert.match(
    helpSuggestion("hints", { ...survey, step: 3, both: true }),
    /data-next="askboth"/,
  );
  const dataset = {
    kind: "text",
    sources: ["A"],
    interviews: { source: "A", established: true, done: [] },
  };
  assert.match(
    helpSuggestion("hints", { step: 1, dataset }),
    /data-next="iv-auto"/,
  );
  dataset.interviews.draft = { next: 1, total: 2 };
  assert.equal(helpSuggestion("hints", { step: 1, dataset }), "");
  dataset.interviews.draft.next = 2;
  assert.match(
    helpSuggestion("hints", { step: 1, dataset }),
    /data-next="iv-review"/,
  );
});
