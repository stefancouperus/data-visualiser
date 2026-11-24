import tutor from "./data-bot.md";
import charts from "./skills/charts.md";
import codebook from "./skills/codebook.md";
import coding from "./skills/coding.md";
import verifyCoding from "./skills/verify-coding.md";
import imports from "./skills/import.md";
import regression from "./skills/regression.md";
import recommend from "./skills/recommend.md";
import research from "./skills/research.md";
import variables from "./skills/variables.md";
const skills = {
  variables,
  research,
  charts,
  coding,
  verifyCoding,
  codebook,
  imports,
  regression,
  recommend,
};
const gateway = "https://llm.k8s.rug.nl/v1/chat/completions";
const models = ["gemma-26B-MoE", "Qwen3.6-35B-A3B-AWQ-4bit"];

function verificationFormat(ids) {
  return {
    type: "json_schema",
    json_schema: {
      name: "verified_interview_assignments",
      strict: true,
      schema: {
        type: "object",
        properties: {
          keep: { type: "array", items: { type: "string", enum: ids } },
        },
        required: ["keep"],
        additionalProperties: false,
      },
    },
  };
}

function codebookFormat(context) {
  const text = { type: "string" };
  const fields = { label: text, category: text, definition: text };
  if (Array.isArray(context?.sections) && context.sections.length) {
    const ids = context.sections.map((s) => s.id);
    fields.sectionId = { type: "string", enum: ids };
  }
  return {
    type: "json_schema",
    json_schema: {
      name: "codebook_entries",
      strict: true,
      schema: {
        type: "object",
        properties: {
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: fields,
              required: Object.keys(fields),
              additionalProperties: false,
            },
          },
        },
        required: ["entries"],
        additionalProperties: false,
      },
    },
  };
}

const enc = new TextEncoder();
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
async function sign(text, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}
function same(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < b.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin"),
      local = env.APP_ORIGIN || "https://stefancouperus.github.io";
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    if (origin === local)
      Object.assign(headers, {
        "Access-Control-Allow-Origin": local,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
    const reply = (s, data) =>
      new Response(JSON.stringify(data), { status: s, headers });
    if (origin !== local) return reply(403, { error: "Unrecognised website." });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (request.method !== "POST" || !["/session", "/ask"].includes(path))
      return reply(404, { error: "Unknown request." });
    if (!env.COURSE_CODE || !env.RUG_API_KEY || !env.SESSION_SECRET)
      return reply(503, { error: "The tutor has not been configured yet." });
    if (Number(request.headers.get("content-length")) > 160000)
      return reply(413, { error: "Choose a smaller selection." });
    try {
      const raw = await request.text();
      if (raw.length > 140000)
        return reply(413, { error: "Choose a smaller selection." });
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return reply(400, { error: "Invalid request." });
      }
      if (path === "/session") {
        const allowed = await env.ACCESS_LIMIT.limit({
          key: request.headers.get("CF-Connecting-IP") || "class",
        });
        if (!allowed.success)
          return reply(429, {
            error: "Too many attempts. Try again in a minute.",
          });
        if (!same(String(data.code || ""), env.COURSE_CODE))
          return reply(403, { error: "Check the course code." });
        const claims = crypto.randomUUID() + "." + (Date.now() + 12 * 3600000);
        return reply(200, {
          token: claims + "." + (await sign(claims, env.SESSION_SECRET)),
        });
      }
      const [id, exp, mac] = String(request.headers.get("Authorization") || "")
        .replace(/^Bearer /, "")
        .split(".");
      if (
        !mac ||
        Number(exp) < Date.now() ||
        !same(mac, await sign(id + "." + exp, env.SESSION_SECRET))
      )
        return reply(401, { error: "Enter your course code again." });
      if (!(await env.CHAT_LIMIT.limit({ key: id })).success)
        return reply(429, {
          error: "Please allow a minute before sending more questions.",
        });
      if (
        !Object.hasOwn(skills, data.skill) ||
        typeof data.question !== "string" ||
        data.question.length > 4000
      )
        return reply(400, { error: "Choose a task and a shorter question." });
      let verification;
      if (data.skill === "verifyCoding") {
        const candidates = data.context?.candidates;
        if (
          !Array.isArray(candidates) ||
          !candidates.length ||
          candidates.length > 12 ||
          candidates.some((c, i) => c?.id !== "v" + (i + 1))
        )
          return reply(400, {
            error: "Select a valid batch of coding suggestions.",
          });
        verification = verificationFormat(candidates.map((c) => c.id));
      }
      const messages = [
        {
          role: "system",
          content:
            tutor +
            "\n" +
            (data.skill === "recommend"
              ? charts + "\n" + regression + "\n" + recommend
              : skills[data.skill]) +
            "\nHelp mode: " +
            (["guided", "request", "hints"].includes(data.mode)
              ? data.mode
              : "hints"),
        },
        {
          role: "user",
          content: JSON.stringify({
            question: data.question,
            context: data.context,
            previousTurns: Array.isArray(data.history)
              ? data.history.slice(-4)
              : [],
          }),
        },
      ];
      for (const model of models) {
        let upstream;
        try {
          upstream = await fetch(gateway, {
            method: "POST",
            headers: {
              Authorization: "Bearer " + env.RUG_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: data.skill === "codebook" || verification ? 0 : 0.3,
              ...(verification && { response_format: verification }),
              ...(data.skill === "codebook" && {
                response_format: codebookFormat(data.context),
              }),
              max_tokens:
                data.skill === "codebook"
                  ? 6000
                  : ["coding", "variables"].includes(data.skill)
                    ? 2400
                    : 950,
            }),
            signal: AbortSignal.timeout(75000),
          });
        } catch {
          continue;
        }
        if (upstream.status === 429 || upstream.status >= 500) continue;
        if (!upstream.ok)
          return reply(502, {
            error: "The university gateway could not process this request.",
          });
        const choice = (await upstream.json()).choices?.[0];
        if (verification && choice?.finish_reason === "length")
          return reply(422, {
            error:
              "The evidence check returned an incomplete verdict. Retry this batch.",
          });
        if (data.skill === "codebook" && choice?.finish_reason === "length")
          return reply(422, {
            error:
              "The draft exceeded the response limit. Upload a shorter codebook section containing your coding labels and definitions.",
          });
        const answer = choice?.message?.content;
        if (typeof answer === "string" && answer.trim())
          return reply(200, { answer, model });
      }
      return reply(503, {
        error:
          "The university models are busy. Your project is available while you wait.",
      });
    } catch {
      return reply(500, {
        error: "The tutor could not complete this request.",
      });
    }
  },
};
