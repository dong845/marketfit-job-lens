/**
 * End-to-end smoke test over the path a real analysis takes: a captured page
 * snapshot becomes a normalized job, that job becomes a validated provider
 * request, and a provider's JSON reply becomes evidence with refs resolved back
 * to the source text. Unit tests cover each stage; this checks they compose.
 */
import assert from "node:assert/strict";
import { extractJob, hasUsableJobContent } from "../src/extraction/extractJob.js";
import { buildAnalyzePrompt, wireSchemaJson } from "../src/ai/prompts.js";
import { parseAgentEvidence, parseJsonOutput, parseTaskRequest } from "../src/ai/schema.js";
import { modelConfig, modelsForProvider } from "../src/ai/models.js";

const RESUME = "Experience\nBuilt 4D cine MRI reconstruction in PyTorch and ported the solver to C++, cutting scan time 28%.";
const JOB_TEXT = [
  "Senior MRI Reconstruction Engineer",
  "Requirements:",
  "- PyTorch required for deep learning reconstruction.",
  "- C++ required for production solvers.",
  "- Kubernetes experience preferred.",
  "Responsibilities: You will own reconstruction pipelines and deliver clinical throughput improvements.",
  "We offer visa sponsorship for qualified candidates."
].join("\n");

// 1. Captured snapshot -> normalized job
const job = extractJob({
  url: "https://example.com/jobs/mri-recon",
  documentTitle: "Senior MRI Reconstruction Engineer | Example Health",
  text: JOB_TEXT,
  qualityScore: 0.82,
  semantic: { title: "Senior MRI Reconstruction Engineer", company: "Example Health", location: "Leiden, NL", sourceText: JOB_TEXT }
});
assert.equal(job.title, "Senior MRI Reconstruction Engineer");
assert.equal(job.company, "Example Health");
assert.ok(hasUsableJobContent(job), "a well-formed posting must pass the usability gate");
assert.ok(job.extraction.contentFingerprint, "captures need a fingerprint for change detection");

// 2. Normalized job -> validated provider request
const request = parseTaskRequest({
  requestId: "smoke-1",
  taskType: "analyze_job",
  provider: "openai-api",
  privacyMode: "provider_cloud",
  credential: { type: "session_api_key", apiKey: "session-smoke-api-key" },
  options: { model: "gpt-5-mini", language: "en" },
  input: {
    resumeText: RESUME,
    job: { title: job.title, company: job.company, location: job.location, description: job.sourceText, url: job.url },
    candidate: { targetRole: "", workAuthorization: "needs_sponsorship", languages: [] }
  }
});

const prompt = buildAnalyzePrompt(request);
assert.match(prompt, /CV-001/, "the prompt must expose addressable CV evidence blocks");
assert.match(prompt, /JD-001/, "the prompt must expose addressable JD evidence blocks");
assert.equal(prompt.includes("session-smoke-api-key"), false, "credentials must never reach the prompt");

// 3. Wire schema stays valid JSON Schema, minus the constrained keywords
const wire = JSON.parse(wireSchemaJson());
const serialized = JSON.stringify(wire);
for (const keyword of ["minLength", "maxLength", "pattern", "minItems", "maxItems"]) {
  assert.equal(serialized.includes(`"${keyword}"`), false, `${keyword} must be stripped before it reaches a provider`);
}
assert.equal(wire.additionalProperties, false, "strict mode requires additionalProperties:false");
assert.equal(wire.required.includes("requirements"), true);

// 4. Provider reply -> validated evidence, refs resolved to real source text
const reply = JSON.stringify({
  overview: {
    jobFocus: "Reconstruction engineering for clinical MRI throughput.",
    candidatePositioning: "The CV shows directly relevant reconstruction work.",
    fitNarrative: "PyTorch and C++ are both evidenced in the resume.",
    evidence: [{ ref: "CV-001" }, { ref: "JD-001" }]
  },
  requirements: [
    { name: "PyTorch", level: "required", match: "strong", evidence: [{ ref: "CV-001" }], explanation: "The CV names PyTorch reconstruction work." },
    { name: "Kubernetes", level: "preferred", match: "no_evidence", evidence: [{ ref: "JD-001" }], explanation: "The CV does not mention Kubernetes." }
  ],
  strengths: [{ title: "Reconstruction depth", summary: "Cites a measured 28% improvement.", evidence: [{ ref: "CV-001" }] }],
  gaps: [{ title: "Kubernetes", severity: "moderate", summary: "Not demonstrated in the CV.", evidence: [{ ref: "JD-001" }] }],
  risks: [{ title: "Clinical scope", severity: "unknown", summary: "Regulatory scope is unstated.", evidence: [{ ref: "JD-001" }] }],
  resumeTailoring: [{ target: "Summary", recommendation: "Lead with the reconstruction outcome.", evidence: [{ ref: "CV-001" }] }],
  interviewFocus: [{ question: "How did you cut scan time?", rationale: "The CV cites the result.", evidence: [{ ref: "CV-001" }] }],
  uncertainties: [{ type: "sponsorship", message: "Confirm sponsorship applies to this role.", evidence: [{ ref: "JD-001" }] }],
  suggestedActions: [{ action: "Ask the recruiter about sponsorship.", priority: "before_apply", evidence: [{ ref: "JD-001" }] }]
});

const evidence = parseAgentEvidence(parseJsonOutput(reply), request);
assert.equal(evidence.requirements.length, 2);
assert.equal(evidence.requirements[0].match, "strong");
// A resolved ref must carry the real source quote, not the model's paraphrase.
assert.equal(evidence.overview.evidence[0].source, "resume");
assert.ok(RESUME.includes(evidence.overview.evidence[0].quote), "resolved CV evidence must be literal resume text");
assert.equal(evidence.suggestedActions[0].priority, "before_apply");

// 5. Model registry stays coherent with what the panel offers
for (const provider of ["openai-api", "anthropic-api"]) {
  const models = modelsForProvider(provider);
  assert.ok(models.length >= 2, `${provider} needs selectable models`);
  for (const model of models) {
    assert.ok(model.maxOutputTokens >= 16000, `${model.id} needs room for a full structured answer`);
    assert.ok(model.labelKey, `${model.id} needs a translatable label`);
  }
  // An unknown model id must fall back rather than reach the provider verbatim.
  assert.equal(modelConfig(provider, "not-a-real-model").provider, provider);
}

console.log("Smoke tests passed");
