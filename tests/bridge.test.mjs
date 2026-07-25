import assert from "node:assert/strict";
import test from "node:test";
import { createBridgeServer } from "../bridge/src/server.js";
import { createProviderRouter } from "../bridge/src/providers.js";
import { BridgeError, parseAgentEvidence, parseTaskRequest } from "../bridge/src/schema.js";
import { createBridgeClient, isApiProvider, isCliProvider } from "../src/bridge/bridgeClient.js";

const extensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const extensionOrigin = `chrome-extension://${extensionId}`;

function apiRequest(provider = "openai-api", options = {}) {
  return parseTaskRequest({
    requestId: "test-request-1",
    taskType: "analyze_job",
    provider,
    privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    options,
    input: {
      resumeText: "Built Python services and improved reliability by 28%.",
      job: { title: "Engineer", description: "Python required. Improve service reliability." },
      candidate: { targetRole: "Engineer", workAuthorization: "authorized", languages: ["English C1"] }
    }
  });
}

function validEvidence() {
  return {
    overview: {
      jobFocus: "The role focuses on reliable Python services.",
      candidatePositioning: "The resume shows directly relevant service work.",
      fitNarrative: "The candidate has cited Python and reliability evidence for the stated role.",
      evidence: [
        { ref: "CV-001" },
        { ref: "JD-001" }
      ]
    },
    requirements: [{
      name: "Python",
      level: "required",
      match: "strong",
      evidence: [
        { ref: "CV-001" },
        { ref: "JD-001" }
      ],
      explanation: "The resume names relevant production work."
    }],
    strengths: [{
      title: "Service delivery evidence",
      summary: "The resume cites a measurable reliability improvement.",
      evidence: [{ ref: "CV-001" }]
    }],
    gaps: [{
      title: "Production scope",
      severity: "unknown",
      summary: "The job asks for reliability work but does not state service scale.",
      evidence: [{ ref: "JD-001" }]
    }],
    risks: [{
      title: "Role context needs verification",
      severity: "unknown",
      summary: "The supplied job text has limited operational context.",
      evidence: [{ ref: "JD-001" }]
    }],
    resumeTailoring: [{
      target: "Reliability outcome",
      recommendation: "Place the cited 28% reliability result near the Python service experience.",
      evidence: [{ ref: "CV-001" }]
    }],
    interviewFocus: [{
      question: "How did you improve service reliability?",
      rationale: "The role explicitly names reliability and the resume cites an outcome.",
      evidence: [{ ref: "JD-001" }, { ref: "CV-001" }]
    }],
    uncertainties: [{
      type: "scope",
      message: "Clarify the current service scale.",
      evidence: [{ ref: "JD-001" }]
    }],
    suggestedActions: [{
      action: "Ask about the production environment before applying.",
      priority: "before_apply",
      evidence: [{ ref: "JD-001" }]
    }]
  };
}

test("agent evidence resolves evidence block IDs to local quotes", () => {
  const request = apiRequest();
  const evidence = validEvidence();
  const parsed = parseAgentEvidence(evidence, request);
  assert.equal(parsed.overview.evidence[0].source, "resume");
  assert.match(parsed.overview.evidence[0].quote, /Built Python services/);
  assert.equal(parsed.overview.evidence[0].ref, "CV-001");
});

test("agent evidence drops fabricated evidence IDs without rejecting the full result", () => {
  const request = apiRequest();
  const evidence = validEvidence();
  evidence.requirements[0].evidence.unshift({ ref: "JD-999" });
  const parsed = parseAgentEvidence(evidence, request);
  assert.equal(parsed.requirements[0].evidence.length, 2);
  assert.equal(parsed.requirements[0].evidence.some((item) => item.ref === "JD-999"), false);
});

test("agent evidence rejects an incomplete full-CV/JD analysis", () => {
  const evidence = validEvidence();
  delete evidence.overview;
  assert.throws(() => parseAgentEvidence(evidence, apiRequest()), (error) => error instanceof BridgeError && error.code === "SCHEMA_INVALID");
});

test("agent evidence preserves narrative sections when one optional citation is invalid", () => {
  const evidence = validEvidence();
  evidence.resumeTailoring[0].evidence[0] = { ref: "CV-999" };
  const parsed = parseAgentEvidence(evidence, apiRequest());
  assert.equal(parsed.resumeTailoring[0].target, "Reliability outcome");
  assert.equal(parsed.resumeTailoring[0].evidence.length, 0);
});

test("OpenAI API request uses structured output and no server-side storage", async () => {
  const calls = [];
  const router = createProviderRouter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { output_text: JSON.stringify(validEvidence()) }; } };
    },
    runProcessImpl: async () => ({ stdout: "installed", stderr: "" })
  });
  const result = await router.runTask(apiRequest("openai-api"));
  assert.equal(result.requirements[0].name, "Python");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/responses$/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 7000);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(calls[0].options.headers.authorization.startsWith("Bearer "), true);
});

test("OpenAI API parser accepts nested Responses API output text", async () => {
  const router = createProviderRouter({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(validEvidence()) }] }] };
      }
    })
  });
  const result = await router.runTask(apiRequest("openai-api"));
  assert.equal(result.overview.evidence[0].ref, "CV-001");
});

test("OpenAI API parser reports truncation separately from invalid JSON", async () => {
  const router = createProviderRouter({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "{\"overview\":" };
      }
    })
  });
  await assert.rejects(() => router.runTask(apiRequest("openai-api")), /truncated/);
});

test("API request forwards an explicitly selected model for the current request", async () => {
  const calls = [];
  const router = createProviderRouter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { output_text: JSON.stringify(validEvidence()) }; } };
    }
  });
  await router.runTask(apiRequest("openai-api", { model: "gpt-5", language: "zh" }));
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "gpt-5");
  assert.match(body.input, /Write all analysis fields in Chinese/);
});

test("Anthropic API request uses the configured session key only for the request", async () => {
  const calls = [];
  const router = createProviderRouter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] }; } };
    },
    runProcessImpl: async () => ({ stdout: "installed", stderr: "" })
  });
  const result = await router.runTask(apiRequest("anthropic-api"));
  assert.equal(result.suggestedActions.length, 1);
  assert.match(calls[0].url, /\/v1\/messages$/);
  assert.equal(calls[0].options.headers["x-api-key"], "session-test-api-key-123");
  assert.equal(JSON.parse(calls[0].options.body).max_tokens, 7000);
});

test("Anthropic API parser accepts fenced JSON text", async () => {
  const router = createProviderRouter({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { content: [{ type: "text", text: `\`\`\`json\n${JSON.stringify(validEvidence())}\n\`\`\`` }] };
      }
    })
  });
  const result = await router.runTask(apiRequest("anthropic-api"));
  assert.equal(result.suggestedActions[0].priority, "before_apply");
});

test("provider modes distinguish local CLI authentication from session API keys", () => {
  assert.equal(isCliProvider("codex"), true);
  assert.equal(isCliProvider("claude-code"), true);
  assert.equal(isCliProvider("openai-api"), false);
  assert.equal(isApiProvider("openai-api"), true);
  assert.equal(isApiProvider("codex"), false);
});

test("loopback bridge requires a one-time origin-bound pairing and bearer token", async (t) => {
  const logs = [];
  const bridge = createBridgeServer({
    port: 0,
    pairCode: "pairing-code-123",
    logger: (event) => logs.push(event),
    router: {
      async health() { return { codex: { available: true } }; },
      async runTask() { return validEvidence(); }
    }
  });
  let started;
  try {
    started = await bridge.start();
  } catch (error) {
    if (error.code === "EPERM") return t.skip("The current sandbox does not permit loopback listeners.");
    throw error;
  }
  const { url } = started;
  try {
    const pair = await fetch(`${url}/v1/pair`, {
      method: "POST",
      headers: { origin: extensionOrigin, "content-type": "application/json" },
      body: JSON.stringify({ extensionId, code: "pairing-code-123" })
    });
    assert.equal(pair.status, 200);
    assert.equal(pair.headers.get("access-control-allow-origin"), extensionOrigin);
    const { token } = await pair.json();

    const denied = await fetch(`${url}/v1/health`, { headers: { origin: extensionOrigin } });
    assert.equal(denied.status, 401);
    const health = await fetch(`${url}/v1/health`, { headers: { origin: extensionOrigin, authorization: `Bearer ${token}` } });
    assert.equal(health.status, 200);

    const task = await fetch(`${url}/v1/tasks`, {
      method: "POST",
      headers: { origin: extensionOrigin, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "bridge-task-1", taskType: "analyze_job", provider: "codex", privacyMode: "provider_cloud",
        input: { resumeText: "Built Python services.", job: { description: "Python required." }, candidate: {} }
      })
    });
    assert.equal(task.status, 200);
    assert.equal((await task.json()).status, "completed");
    assert.equal(JSON.stringify(logs).includes("Built Python services"), false);
  } finally {
    await bridge.stop();
  }
});

test("loopback bridge accepts an originless extension request only with its matching identity header", async (t) => {
  const bridge = createBridgeServer({
    port: 0,
    pairCode: "pairing-code-456",
    router: { async health() { return { codex: { available: true } }; }, async runTask() { return validEvidence(); } }
  });
  let started;
  try {
    started = await bridge.start();
  } catch (error) {
    if (error.code === "EPERM") return t.skip("The current sandbox does not permit loopback listeners.");
    throw error;
  }
  try {
    const pair = await fetch(`${started.url}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-marketfit-extension-id": extensionId },
      body: JSON.stringify({ extensionId, code: "pairing-code-456" })
    });
    assert.equal(pair.status, 200);
    const { token } = await pair.json();

    const missingIdentity = await fetch(`${started.url}/v1/health`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(missingIdentity.status, 403);
    const health = await fetch(`${started.url}/v1/health`, { headers: { authorization: `Bearer ${token}`, "x-marketfit-extension-id": extensionId } });
    assert.equal(health.status, 200);
    const webOrigin = await fetch(`${started.url}/v1/health`, { headers: { origin: "https://example.test", authorization: `Bearer ${token}`, "x-marketfit-extension-id": extensionId } });
    assert.equal(webOrigin.status, 403);
  } finally {
    await bridge.stop();
  }
});

test("extension client stores only the loopback pairing token, never an API key", async () => {
  const data = {};
  const storage = {
    access: null,
    async setAccessLevel(value) { this.access = value; },
    async get(key) { return { [key]: data[key] }; },
    async set(value) { Object.assign(data, value); },
    async remove(key) { delete data[key]; }
  };
  const calls = [];
  const client = createBridgeClient({
    storageArea: storage,
    runtime: { id: extensionId },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return url.endsWith("/v1/pair") ? { token: "loopback-token" } : { status: "completed", result: validEvidence() }; } };
    }
  });
  await client.prepare();
  await client.pair({ port: 43123, pairingCode: "pairing-code-123" });
  await client.runTask({ credential: { type: "session_api_key", apiKey: "session-test-api-key-123" } });
  assert.deepEqual(storage.access, { accessLevel: "TRUSTED_CONTEXTS" });
  assert.equal(JSON.stringify(data).includes("session-test-api-key-123"), false);
  assert.match(calls[0].url, /^http:\/\/127\.0\.0\.1:43123\/v1\/pair$/);
  assert.match(calls[1].url, /^http:\/\/127\.0\.0\.1:43123\/v1\/tasks$/);
  assert.equal(calls[0].options.headers["x-marketfit-extension-id"], extensionId);
  assert.equal(calls[1].options.headers["x-marketfit-extension-id"], extensionId);
});
