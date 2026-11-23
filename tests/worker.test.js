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
  assert.equal(calls[0].response_format, undefined);
});

test("codebook requests pass grouped entries through intact and reject a truncated draft", async (t) => {
  const { token } = await (
    await worker.fetch(req("/session", { code: env.COURSE_CODE }), env)
  ).json();
  const document = "Frequency\n  Listening\n  - Rarely\n  Reading\n  - Rarely";
  const entries = ["Listening", "Reading"].map((branch) => ({
    label: "Rarely",
    category: "Frequency › " + branch,
    definition: "",
  }));
  let context = { document };
  let responseEntries = entries;
  let truncated = false;
  t.mock.method(globalThis, "fetch", async (_url, { body }) => {
    const upstream = JSON.parse(body);
    assert.deepEqual(JSON.parse(upstream.messages[1].content).context, context);
    assert.equal(upstream.temperature, 0);
    const row =
      upstream.response_format.json_schema.schema.properties.entries.items;
    assert.equal(upstream.response_format.json_schema.strict, true);
    assert.deepEqual(
      row.required,
      context.sections
        ? ["label", "category", "definition", "sectionId"]
        : ["label", "category", "definition"],
    );
    if (context.sections)
      assert.deepEqual(
        row.properties.sectionId.enum,
        context.sections.map((s) => s.id),
      );
    assert.match(
      upstream.messages[0].content,
      /identical label in two different categories/,
    );
    return Response.json({
      choices: [
        {
          finish_reason: truncated ? "length" : "stop",
          message: {
            content: JSON.stringify({
              entries: truncated
                ? responseEntries.slice(0, 1)
                : responseEntries,
            }),
          },
        },
      ],
    });
  });
  const ask = () =>
    worker.fetch(
      req(
        "/ask",
        {
          skill: "codebook",
          question: "Extract the labels for review.",
          context,
        },
        token,
      ),
      env,
    );
  const complete = await ask();
  assert.equal(complete.status, 200);
  assert.deepEqual(JSON.parse((await complete.json()).answer).entries, entries);
  context = {
    sections: entries.map((e, i) => ({
      id: "s" + i,
      category: e.category,
      text: e.label,
    })),
  };
  responseEntries = entries.map((e, i) => ({
    ...e,
    sectionId: context.sections[i].id,
  }));
  const sectioned = await ask();
  assert.deepEqual(
    JSON.parse((await sectioned.json()).answer).entries,
    responseEntries,
  );
  truncated = true;
  const partial = await ask();
  assert.equal(partial.status, 422);
  assert.equal((await partial.json()).answer, undefined);
});
