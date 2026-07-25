import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDirectApiClient, DIRECT_PROVIDER_ORIGINS } from "../src/ai/directApiClient.js";
import { MODELS } from "../bridge/src/models.js";

function apiRequest(provider = "openai-api", model = "gpt-5") {
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
