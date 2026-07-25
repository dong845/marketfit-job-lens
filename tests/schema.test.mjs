import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_EVIDENCE_SCHEMA, BridgeError, FIELD_LIMITS, RESULT_LIMITS, extractJsonText, parseAgentEvidence, parseTaskRequest } from "../src/ai/schema.js";

/**
 * The evidence and result-shape layer, independent of any provider.
 *
 * These lived in the bridge suite and were nearly lost with it when the CLI route
 * was removed — including the regression for a verbose reply being rejected
 * instead of trimmed, which had cost a user a paid analysis.
 */

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

test("a verbose reply is trimmed to the caps, not rejected", () => {
  // Regression: the wire schema strips maxItems for strict/structured modes, so
  // the model is not told the caps. Enforcing them by throwing meant a user paid
  // for an analysis and got "Provider output exceeds the allowed result size".
  const cite = [{ ref: "CV-001" }];
  const many = (count, build) => Array.from({ length: count }, (_, index) => build(index));
  const oversized = {
    ...validEvidence(),
    requirements: many(RESULT_LIMITS.requirements + 15, (i) => ({ name: `R${i}`, level: "required", match: "gap", evidence: cite, explanation: "x" })),
    strengths: many(RESULT_LIMITS.strengths + 10, (i) => ({ title: `S${i}`, summary: "s", evidence: cite })),
    suggestedActions: many(RESULT_LIMITS.suggestedActions + 10, (i) => ({ action: `A${i}`, priority: "now", evidence: cite }))
  };
  const parsed = parseAgentEvidence(oversized, parseTaskRequest(apiRequest("openai-api")));
  assert.equal(parsed.requirements.length, RESULT_LIMITS.requirements);
  assert.equal(parsed.strengths.length, RESULT_LIMITS.strengths);
  assert.equal(parsed.suggestedActions.length, RESULT_LIMITS.suggestedActions);
  // Trimming keeps the leading items, which is the order the model prioritised.
  assert.equal(parsed.requirements[0].name, "R0");
});

test("an over-long string is trimmed to the cap, not thrown away with the analysis", () => {
  // Same regression as the list caps, one layer down: maxLength is stripped from the
  // wire schema too, so the provider is never told these ceilings. Rejecting a reply
  // for exceeding one lost the whole paid analysis over a single verbose sentence.
  const evidence = validEvidence();
  evidence.requirements[0].explanation = "x".repeat(FIELD_LIMITS.prose + 500);
  evidence.overview.fitNarrative = "y".repeat(FIELD_LIMITS.narrative + 500);
  const parsed = parseAgentEvidence(evidence, apiRequest());
  assert.equal(parsed.requirements[0].explanation.length, FIELD_LIMITS.prose);
  assert.equal(parsed.overview.fitNarrative.length, FIELD_LIMITS.narrative);
  // An empty or missing string is still a real error, not something to invent.
  evidence.requirements[0].explanation = "";
  assert.throws(() => parseAgentEvidence(evidence, apiRequest()), BridgeError);
});

test("an empty evidence array is accepted, exactly like one full of unresolvable refs", () => {
  // These were opposite: [] was rejected outright while an invented ref resolved to
  // [] and passed. That punished the honest shape and rewarded the fabricated one.
  const withEmpty = validEvidence();
  withEmpty.requirements[0].evidence = [];
  withEmpty.overview.evidence = [];
  const parsed = parseAgentEvidence(withEmpty, apiRequest());
  assert.deepEqual(parsed.requirements[0].evidence, []);
  assert.deepEqual(parsed.overview.evidence, []);
  assert.equal(parsed.requirements[0].name, "Python");

  const withFabricated = validEvidence();
  withFabricated.requirements[0].evidence = [{ ref: "CV-999" }];
  assert.deepEqual(parseAgentEvidence(withFabricated, apiRequest()).requirements[0].evidence, []);
});

test("the effort, decisive factor and level comparison survive, and never take the verdict down with them", () => {
  const request = apiRequest();
  const evidence = validEvidence();
  evidence.recommendation = { verdict: "stretch", headline: "h", rationale: "r", effort: "evening", effortNote: "Rewrite the C++ bullet.", decisiveFactor: "Ship a public C++ example." };
  evidence.overview.levelComparison = { direction: "step_up", note: "Owns a pipeline rather than a component." };
  const parsed = parseAgentEvidence(evidence, request);
  assert.equal(parsed.recommendation.effort, "evening");
  assert.equal(parsed.recommendation.decisiveFactor, "Ship a public C++ example.");
  assert.equal(parsed.overview.levelComparison.direction, "step_up");

  // A model that omits or mangles the additive axes has still answered the question
  // the panel exists for, so the verdict must survive them.
  const degraded = validEvidence();
  degraded.recommendation = { verdict: "weak_fit", headline: "h", rationale: "r", effort: "sometime", effortNote: 42, decisiveFactor: "z".repeat(5000) };
  degraded.overview.levelComparison = { direction: "sideways", note: "" };
  const fallback = parseAgentEvidence(degraded, request);
  assert.equal(fallback.recommendation.verdict, "weak_fit");
  assert.equal(fallback.recommendation.effort, undefined);
  assert.equal(fallback.recommendation.effortNote, "");
  assert.equal(fallback.recommendation.decisiveFactor.length, FIELD_LIMITS.note);
  assert.equal(fallback.overview.levelComparison, null);
});

test("JSON is recovered whether the model talks before it or after it", () => {
  const body = '{"ok":true}';
  assert.equal(extractJsonText(`Here you go:\n${body}`), body);
  assert.equal(extractJsonText(`${body}\n\nLet me know if you want it in another format.`), body);
  assert.equal(extractJsonText("```json\n" + body + "\n```"), body);
});

test("the caps the model is told match the caps applied to its reply", () => {
  const schema = AGENT_EVIDENCE_SCHEMA;
  for (const key of ["requirements", "strengths", "gaps", "risks", "resumeTailoring", "interviewFocus", "uncertainties", "suggestedActions"]) {
    assert.equal(schema.properties[key].maxItems, RESULT_LIMITS[key], `${key} cap drifted between schema and parser`);
  }
});
