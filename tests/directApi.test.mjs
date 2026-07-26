import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDirectApiClient, DIRECT_PROVIDER_ORIGINS } from "../src/ai/directApiClient.js";
import { MODELS } from "../src/ai/models.js";

function apiRequest(provider = "openai-api", model = "gpt-5") {
  // model may be undefined; modelConfig then picks the provider default.
  return {
    requestId: "direct-api-test-1",
    taskType: "analyze_job",
    provider,
    privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    options: { model, language: "en" },
    input: {
      resumeText: "Built Python services and improved reliability by 28%.",
      job: { title: "Engineer", description: "Python required. Improve service reliability." },
      candidate: { targetRole: "Engineer", workAuthorization: "authorized", languages: ["English C1"] }
    }
  };
}

function validEvidence() {
  const resume = { ref: "CV-001" };
  const job = { ref: "JD-001" };
  const reliability = { ref: "JD-001" };
  return {
    recommendation: { verdict: "worth_applying", headline: "Apply after sharpening the reliability bullet.", rationale: "Python is directly evidenced; scale is not." },
    overview: { jobFocus: "The role focuses on reliable Python services.", candidatePositioning: "The resume shows relevant service work.", fitNarrative: "The cited evidence is relevant.", evidence: [resume, reliability] },
    requirements: [{ name: "Python", level: "required", match: "strong", evidence: [resume, job], explanation: "The resume names Python service work." }],
    strengths: [{ title: "Service delivery", summary: "The resume cites a result.", evidence: [{ source: "resume", quote: "improved reliability by 28%" }] }],
    gaps: [{ title: "Production scope", severity: "unknown", summary: "Scale is not stated.", evidence: [reliability] }],
    risks: [{ title: "Context", severity: "unknown", summary: "The job has limited context.", evidence: [job] }],
    resumeTailoring: [{ target: "Reliability result", recommendation: "Feature the reliability outcome.", evidence: [{ source: "resume", quote: "improved reliability by 28%" }] }],
    interviewFocus: [{ question: "How did you improve reliability?", rationale: "Both sources mention reliability work.", evidence: [reliability, { source: "resume", quote: "improved reliability by 28%" }] }],
    uncertainties: [{ type: "scope", message: "Clarify the service scale.", evidence: [reliability] }],
    suggestedActions: [{ action: "Ask about the production environment.", priority: "before_apply", evidence: [job] }]
  };
}

test("granting provider access never awaits anything before requesting it", async () => {
  // chrome.permissions.request() must run inside the user gesture that triggered it.
  // Awaiting permissions.contains() first can consume that gesture, so requestAccess
  // must reach request() as its first await — request() already resolves true without
  // prompting when the origin is granted, which is what the pre-check was for.
  const permissionCalls = [];
  const client = createDirectApiClient({
    permissionsApi: {
      async contains(request) { permissionCalls.push(["contains", request]); return false; },
      async request(request) { permissionCalls.push(["request", request]); return true; }
    },
    fetchImpl: async () => { throw new Error("must not fetch"); }
  });

  await client.requestAccess("openai-api");
  assert.deepEqual(permissionCalls, [["request", { origins: [DIRECT_PROVIDER_ORIGINS["openai-api"]] }]]);
});

test("direct OpenAI API flow requests only its API host and keeps the key request-only", async () => {
  const permissionCalls = [];
  const calls = [];
  const client = createDirectApiClient({
    permissionsApi: {
      async contains(request) { permissionCalls.push(["contains", request]); return true; },
      async request(request) { permissionCalls.push(["request", request]); return true; }
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { output_text: JSON.stringify(validEvidence()) }; } };
    }
  });

  const { result } = await client.runTask(apiRequest());
  assert.equal(result.requirements[0].name, "Python");
  // runTask verifies access but must never prompt: by the time it runs, the gesture
  // is long gone (job capture has already awaited).
  assert.deepEqual(permissionCalls, [["contains", { origins: [DIRECT_PROVIDER_ORIGINS["openai-api"]] }]]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /https:\/\/api\.openai\.com\/v1\/responses$/);
  assert.equal(calls[0].options.headers.authorization, "Bearer session-test-api-key-123");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "gpt-5");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, MODELS["gpt-5"].maxOutputTokens);
  assert.equal(JSON.stringify(body).includes("session-test-api-key-123"), false);
});

test("direct OpenAI API flow accepts nested Responses API output text", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(validEvidence()) }] }] };
      }
    })
  });
  const { result } = await client.runTask(apiRequest());
  assert.equal(result.requirements[0].name, "Python");
});

test("direct Anthropic API flow accepts fenced JSON text", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { content: [{ type: "text", text: `\`\`\`json\n${JSON.stringify(validEvidence())}\n\`\`\`` }] };
      }
    })
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(result.suggestedActions[0].priority, "before_apply");
});

test("direct provider access is rejected when the user declines the provider host", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return false; }, async request() { return false; } },
    fetchImpl: async () => { throw new Error("must not fetch"); }
  });
  await assert.rejects(() => client.requestAccess("anthropic-api"), /was not allowed/);
});

test("both routes answer with the same envelope the panel reads", async () => {
  // The panel does `lastAgentEvidence = response.result` for either route. The
  // direct client used to return bare evidence, so response.result was undefined:
  // the call was billed, the status said complete, the result area rendered blank,
  // and the report had nothing to build from. Shipped broken since 0.6.10.
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { output_text: JSON.stringify(validEvidence()) }; } })
  });
  const direct = await client.runTask(apiRequest());

  // The shape the local bridge's /v1/tasks responds with.
  const bridgeEnvelope = { requestId: "x", status: "completed", provider: "codex", result: {}, meta: { providerCloud: true, stored: false } };
  assert.deepEqual(Object.keys(direct).sort(), Object.keys(bridgeEnvelope).sort());

  assert.ok(direct.result, "response.result must carry the analysis");
  assert.equal(direct.result.requirements[0].name, "Python");
  assert.equal(direct.status, "completed");
  assert.equal(direct.provider, "openai-api");
  assert.equal(direct.requestId, "direct-api-test-1");
});

test("the panel treats a missing result as a failure, not a finished analysis", () => {
  const sidepanel = readFileSync(new URL("../src/sidepanel/sidepanel.js", import.meta.url), "utf8");
  const review = sidepanel.slice(sidepanel.indexOf("async function runAgentReview"), sidepanel.indexOf("function renderAnalysis"));
  const guard = review.indexOf("if (!response?.result)");
  const assign = review.indexOf("lastAgentEvidence = response.result");
  assert.ok(guard > 0, "a missing result must be rejected");
  assert.ok(guard < assign, "and rejected before it is treated as an analysis");
});

test("every Anthropic model returns the envelope, on both schema branches", async () => {
  // Claude 5 sends output_config (structured outputs); 4.6 predates it and uses
  // prompt-and-extract. Both must reach the panel through the same envelope.
  for (const [model, structured, budget] of [
    ["claude-sonnet-5", true, 24000], ["claude-opus-5", true, 24000],
    ["claude-sonnet-4-6", false, 16000], ["claude-opus-4-6", false, 16000]
  ]) {
    const calls = [];
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; } },
      fetchImpl: async (url, options) => {
        calls.push(JSON.parse(options.body));
        return { ok: true, status: 200, async json() { return { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] }; } };
      }
    });
    const response = await client.runTask(apiRequest("anthropic-api", model));
    assert.ok(response.result, `${model}: response.result must carry the analysis`);
    assert.equal(response.provider, "anthropic-api");
    assert.equal(calls[0].model, model);
    assert.equal(calls[0].max_tokens, budget, `${model}: wrong output budget`);
    assert.equal(Boolean(calls[0].output_config), structured, `${model}: wrong structured-output branch`);
    assert.match(calls[0].url ?? "https://api.anthropic.com/v1/messages", /anthropic/);
  }
});

test("a provider that rejects the schema is retried without it rather than failing", async () => {
  let attempts = 0;
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 400, async json() { return { error: { message: "output_config.format is not supported for this model" } }; } };
      return { ok: true, status: 200, async json() { return { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] }; } };
    }
  });
  const response = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-5"));
  assert.equal(attempts, 2, "it must retry once without the structured-output config");
  assert.ok(response.result, "and still deliver an analysis");
});

test("a truncated Anthropic reply says what to do about it", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { stop_reason: "max_tokens", content: [{ type: "text", text: '{"overview":' }] }; } })
  });
  await assert.rejects(() => client.runTask(apiRequest("anthropic-api", "claude-opus-5")), /ran out of output space/);
});

test("DeepSeek goes only to its own endpoint, with the key request-only", async () => {
  const calls = [];
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] }; } };
    }
  });
  const response = await client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash"));

  assert.ok(response.result, "the panel reads response.result for every provider");
  assert.equal(response.provider, "deepseek-api");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].headers.authorization, "Bearer session-test-api-key-123");
  assert.equal(calls[0].body.model, "deepseek-v4-flash");
  // json_object gives valid JSON but no schema; the shape is enforced by the parser.
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  assert.equal(JSON.stringify(calls[0].body).includes("session-test-api-key-123"), false);
});

test("DeepSeek falls back to plain prompting if json_object is refused", async () => {
  let attempts = 0;
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async (url, options) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 400, async json() { return { error: { message: "response_format is not supported" } }; } };
      assert.equal(JSON.parse(options.body).response_format, undefined, "the retry must drop response_format");
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] }; } };
    }
  });
  const response = await client.runTask(apiRequest("deepseek-api", "deepseek-v4-pro"));
  assert.equal(attempts, 2);
  assert.ok(response.result);
});

test("all three providers answer with the same envelope", async () => {
  const { API_PROVIDERS } = await import("../src/ai/models.js");
  const replies = {
    "openai-api": { output_text: JSON.stringify(validEvidence()) },
    "anthropic-api": { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] },
    "deepseek-api": { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] }
  };
  for (const provider of API_PROVIDERS) {
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; } },
      fetchImpl: async () => ({ ok: true, status: 200, async json() { return replies[provider]; } })
    });
    const response = await client.runTask(apiRequest(provider, undefined));
    assert.deepEqual(Object.keys(response).sort(), ["meta", "provider", "requestId", "result", "status"], `${provider} envelope`);
    assert.equal(response.result.requirements[0].name, "Python", `${provider} must deliver the analysis`);
  }
});

test("a transport failure keeps the underlying cause", () => {
  // "could not be reached" alone hides whether it was DNS, TLS, a proxy, or the
  // network — which is the entire diagnosis. Verified while debugging a real
  // UND_ERR_CONNECT_TIMEOUT that the message had swallowed.
  const source = readFileSync(new URL("../src/ai/directApiClient.js", import.meta.url), "utf8");
  assert.match(source, /error\?\.cause\?\.code \|\| error\?\.cause\?\.message \|\| error\?\.message/);
  assert.match(source, /could not be reached \(\$\{String\(cause\)/);
});

test("an HTTP error keeps its status when the body is not JSON", async () => {
  // Rate limits and outages usually arrive as an edge or proxy HTML page. Parsing
  // the body before checking the status erased the one fact that told the user
  // whether to wait, slow down, or fix their key.
  const failWith = async (status) => {
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; }, async request() { return true; } },
      fetchImpl: async () => ({ ok: false, status, async json() { throw new SyntaxError("Unexpected token <"); } })
    });
    return client.runTask(apiRequest()).then(() => "", (error) => error.message);
  };
  assert.match(await failWith(429), /429/);
  assert.match(await failWith(429), /rate limit/i);
  assert.match(await failWith(503), /503/);
  assert.match(await failWith(401), /key/i);
});

test("a chat-completions reply cut off by the token budget says so", async () => {
  // DeepSeek has the smallest output budget of any model offered and reports
  // truncation per choice, so it was the model most likely to truncate and the only
  // one that reported it as "did not return valid JSON".
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; }, async request() { return true; } },
    fetchImpl: async () => ({ ok: true, status: 200, async json() {
      return { choices: [{ finish_reason: "length", message: { content: '{"overview":' } }] };
    } })
  });
  await assert.rejects(() => client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash")), /ran out of output space/);
});

test("a body that never arrives is still bounded by the request timeout", async () => {
  // fetch() resolves on headers, so cancelling the abort there left a stalled body
  // with nothing to interrupt it: the panel's elapsed counter climbed past the
  // timeout forever and the run button never came back.
  const source = readFileSync(new URL("../src/ai/directApiClient.js", import.meta.url), "utf8");
  const send = source.slice(source.indexOf("async function sendJson"), source.indexOf("function statusMessage"));
  assert.match(send, /const timer = setTimeout/);
  assert.match(send, /await response\.json\(\)/);
  // One finally, after the body has been read — not one per phase.
  assert.equal((send.match(/clearTimeout\(timer\)/g) || []).length, 1);
  assert.ok(send.indexOf("await response.json()") < send.indexOf("clearTimeout(timer)"), "the body must be read while the deadline still applies");
});
