import assert from "node:assert/strict";
import test from "node:test";
import { activeProjectSlot } from "../src/active-project.js";

test("active and newly opened tabs honour the last persisted claim even for a clock tie and a delayed message", (t) => {
  const channels = [];
  let stored;
  const environment = {
    window: new EventTarget(),
    localStorage: {
      getItem: () => stored ?? null,
      setItem: (_key, value) => {
        stored = value;
      },
    },
    BroadcastChannel: class {
      constructor() {
        channels.push(this);
      }
      postMessage() {}
    },
  };
  for (const [key, value] of Object.entries(environment)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  const first = activeProjectSlot(() => {}),
    second = activeProjectSlot(() => {});
  const earlier = { id: "one", nonce: "zzz", time: 100 },
    later = { id: "two", nonce: "aaa", time: 100 };
  stored = JSON.stringify(earlier);
  assert.equal(first.read().id, "one");
  stored = JSON.stringify(later);
  assert.equal(second.read().id, "two");
  for (const channel of channels)
    channel.onmessage({ data: { claim: earlier, stored: true } });
  assert.equal(first.read().id, "two");
  assert.equal(second.read().id, "two");
  assert.equal(activeProjectSlot(() => {}).read().id, "two");
});
