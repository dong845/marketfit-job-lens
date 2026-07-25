import assert from "node:assert/strict";
import test from "node:test";
import { createDirectApiClient, DIRECT_PROVIDER_ORIGINS } from "../src/ai/directApiClient.js";

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

test("direct OpenAI API flow requests only its API host and keeps the key request-only", async () => {
  const permissionCalls = [];
  const calls = [];
  const client = createDirectApiClient({
    permissionsApi: {
      async contains(request) { permissionCalls.push(["contains", request]); return false; },
      async request(request) { permissionCalls.push(["request", request]); return true; }
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { output_text: JSON.stringify(validEvidence()) }; } };
    }
  });

  const result = await client.runTask(apiRequest());
  assert.equal(result.requirements[0].name, "Python");
  assert.deepEqual(permissionCalls, [
    ["contains", { origins: [DIRECT_PROVIDER_ORIGINS["openai-api"]] }],
    ["request", { origins: [DIRECT_PROVIDER_ORIGINS["openai-api"]] }]
  ]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /https:\/\/api\.openai\.com\/v1\/responses$/);
  assert.equal(calls[0].options.headers.authorization, "Bearer session-test-api-key-123");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "gpt-5");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 7000);
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
  const result = await client.runTask(apiRequest(), { accessVerified: true });
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
  const result = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"), { accessVerified: true });
  assert.equal(result.suggestedActions[0].priority, "before_apply");
});

test("direct provider access is rejected when the user declines the provider host", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return false; }, async request() { return false; } },
    fetchImpl: async () => { throw new Error("must not fetch"); }
  });
  await assert.rejects(() => client.requestAccess("anthropic-api"), /was not allowed/);
});
