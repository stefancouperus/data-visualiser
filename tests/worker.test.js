import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
registerHooks({
  load(url, context, next) {
    if (url.endsWith(".md"))
      return {
        format: "module",
        shortCircuit: true,
        source:
          "export default " +
          JSON.stringify(readFileSync(new URL(url), "utf8")),
      };
    return next(url, context);
  },
});
const worker = (await import("../worker/index.js")).default;
const env = {
  APP_ORIGIN: "https://class.example",
  COURSE_CODE: "test-only",
  SESSION_SECRET: "local-test-signature",
  RUG_API_KEY: "local-test-key",
  CHAT_LIMIT: { limit: async () => ({ success: true }) },
  ACCESS_LIMIT: { limit: async () => ({ success: true }) },
};
const req = (path, data, token) =>
  new Request("https://relay.example" + path, {
    method: "POST",
    headers: {
      Origin: env.APP_ORIGIN,
      Authorization: "Bearer " + (token || ""),
    },
    body: JSON.stringify(data),
  });
test("course unlock is required and transient upstream failure uses Qwen with the same instructions", async (t) => {
  assert.equal(
    (await worker.fetch(req("/session", { code: "incorrect" }), env)).status,
    403,
  );
  assert.equal(
    (await worker.fetch(req("/ask", { question: "hello" }), env)).status,
    401,
  );
  const login = await (
    await worker.fetch(req("/session", { code: "test-only" }), env)
  ).json();
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    return calls.length === 1
      ? new Response("", { status: 503 })
      : Response.json({
          choices: [{ message: { content: "Two of four records." } }],
        });
  });
  const result = await (
    await worker.fetch(
      req(
        "/ask",
        {
          question: "Explain this",
          skill: "charts",
          mode: "hints",
          context: { n: 4 },
        },
        login.token,
      ),
      env,
    )
  ).json();
  assert.equal(result.model, "Qwen3.6-35B-A3B-AWQ-4bit");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].messages, calls[1].messages);
});
