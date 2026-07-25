import assert from "node:assert/strict";
import test from "node:test";
import { analyzeJobFit } from "../src/shared/analyzer.js";
import { extractRequirements } from "../src/analysis/requirements.js";
import { containsTerm } from "../src/profile/evidence.js";

const cv = "Experience\nBuilt Python and Kubernetes services, led delivery for 4 years, and increased reliability 28%. English C1.";
const baseProfile = { cvText: cv, targetRole: "Software Engineer", authorization: { statusType: "authorized" }, languages: "English C1" };
const jobIntro = "Software Engineer role with a collaborative team building reliable customer-facing systems. ";

function analyze(profile, jobText, marketId = "US") {
  return analyzeJobFit({ marketId, profile: { ...baseProfile, ...profile }, jobText: `${jobIntro}${jobText}` });
}

test("empty CV and JD returns insufficient with no fit estimate", () => {
  const result = analyzeJobFit({ marketId: "US", profile: { cvText: "" }, jobText: "" });
  assert.equal(result.applicationPriority, "insufficient");
  assert.equal(result.fitEstimateRange, null);
  assert.equal("totalScore" in result, false);
});

test("target role never contaminates candidate skill or domain evidence", () => {
  const profile = { cvText: "No relevant experience. I am changing careers and collecting information about roles.", authorization: { statusType: "authorized" }, languages: "English" };
  const jd = `${jobIntro} Requirements: Kubernetes required. Python required. Candidates should explain production experience.`;
  const plain = analyzeJobFit({ marketId: "US", profile: { ...profile, targetRole: "" }, jobText: jd });
  const stuffed = analyzeJobFit({ marketId: "US", profile: { ...profile, targetRole: "Senior ML Engineer Python AWS Kubernetes" }, jobText: jd });
  const state = (result) => result.findings.filter((item) => /requirement_skill/.test(item.category)).map((item) => item.status);
  assert.deepEqual(state(stuffed), state(plain));
  assert.ok(state(stuffed).every((item) => item === "gap"));
  assert.ok(stuffed.findings.some((item) => item.claim === "Required: kubernetes" && item.status === "gap"));
});

test("negated skills are gaps and learning evidence stays weak", () => {
  const result = analyze({ cvText: "Experience\nI do not have Kubernetes experience. I learned Python in a course. I built a small portfolio project.", targetRole: "" }, "Requirements: Kubernetes required. Python required. This role owns production infrastructure and delivery.");
  const kubernetes = result.findings.find((item) => item.claim === "Required: kubernetes");
  const python = result.findings.find((item) => item.claim === "Required: python");
  assert.equal(kubernetes.status, "gap");
  assert.equal(python.status, "weak_evidence");
});

test("conflicting sponsorship wording uses restrictive verify-first policy", () => {
  const result = analyze({ authorization: { statusType: "needs_sponsorship", futureSponsorshipNeed: true } }, "Requirements: Python required. Visa sponsorship available. We will not sponsor now or in the future. The team supports customer systems.");
  assert.equal(result.sponsorship.state, "conflicting_evidence");
  assert.equal(result.applicationPriority, "verify_first");
  assert.ok(result.uncertaintiesToVerify.some((item) => item.category === "work_authorization"));
});

test("an active TS/SCI condition is a confirmed blocker", () => {
  const result = analyze({}, "Requirements: Python required. Candidates must currently hold active TS/SCI security clearance. This is a secure systems role.");
  assert.equal(result.applicationPriority, "do_not_prioritize");
  assert.ok(result.confirmedBlockers.some((item) => item.category === "security_clearance"));
  assert.equal(result.fitEstimateRange, null);
});

test("student or graduate is a route, not an unknown authorization value", () => {
  const result = analyze({ authorization: { statusType: "student_or_graduate", route: "UK Graduate Route" } }, "Requirements: Python required. The team welcomes early-career engineers and offers mentorship.", "UK");
  const route = result.findings.find((item) => item.category === "authorization_route");
  assert.equal(route.status, "unknown");
  assert.match(route.explanation, /distinct authorization route/i);
});

test("Dutch preferred is a note rather than a blocker", () => {
  const result = analyze({ languages: "English C1" }, "Requirements: Python required. English required. Dutch preferred. The role works with an international product team.", "NL");
  const note = result.findings.find((item) => item.category === "language" && /Dutch/.test(item.claim));
  assert.equal(note.status, "note");
  assert.equal(result.confirmedBlockers.some((item) => item.category === "language"), false);
});

test("Dutch required for client meetings is a material language blocker", () => {
  const result = analyze({ languages: "English C1" }, "Requirements: Python required. English required. Dutch required for client meetings. This is a client-facing product role.", "NL");
  assert.ok(result.confirmedBlockers.some((item) => item.category === "language" && /Dutch/.test(item.claim)));
  assert.equal(result.applicationPriority, "do_not_prioritize");
});

test("CV length alone cannot raise the fit estimate", () => {
  const concise = analyze({ cvText: "Experience\nBuilt Python services and improved reliability 28% across 4 years of delivery.", targetRole: "Software Engineer" }, "Requirements: Python required. This role owns production service reliability and delivery.");
  const verbose = analyze({ cvText: `${"general background text ".repeat(180)} Built Python services and improved reliability 28% across 4 years of delivery.`, targetRole: "Software Engineer" }, "Requirements: Python required. This role owns production service reliability and delivery.");
  assert.deepEqual(verbose.fitEstimateRange, concise.fitEstimateRange);
});

test("low extraction confidence requests confirmation and does not silently score", () => {
  const job = { title: "Engineer", sourceText: `${jobIntro} Requirements: Python required. Build reliable production services for customers.`, extraction: { method: "generic_text", confidence: 0.2, needsConfirmation: true } };
  const result = analyzeJobFit({ marketId: "US", profile: baseProfile, job });
  assert.equal(result.applicationPriority, "needs_confirmation");
  assert.equal(result.fitEstimateRange, null);
});

test("a JD with no extracted requirements requests confirmation instead of showing a fit estimate", () => {
  const result = analyze({}, "This role owns broad customer journeys, coordinates teams across the company, and delivers outcomes every quarter. You will communicate with partners and plan work.");
  assert.equal(result.applicationPriority, "needs_confirmation");
  assert.equal(result.fitEstimateRange, null);
  assert.match(result.decision.reason, /No explicit job requirements/i);
});

test("explicit language evidence in the CV prevents a false language blocker", () => {
  const result = analyze({ cvText: "Experience\nFluent Dutch and English speaker. Built Python services and improved reliability 28% across four years.", languages: "" }, "Requirements: Python required. Dutch required for client meetings. The role supports customer delivery.", "NL");
  assert.equal(result.confirmedBlockers.some((item) => item.category === "language"), false);
  assert.ok(result.findings.some((item) => item.category === "requirement_language" && item.status === "match"));
});

test("current active clearance stated in the CV prevents a false clearance blocker", () => {
  const result = analyze({ cvText: "Experience\nCurrently hold active TS/SCI clearance. Built Python services and improved reliability 28% across four years.", clearances: "" }, "Requirements: Python required. Candidates must currently hold active TS/SCI security clearance. The role supports secure customer systems.");
  assert.equal(result.confirmedBlockers.some((item) => item.category === "security_clearance"), false);
});

test("later applied evidence overrides an older negated skill statement", () => {
  const result = analyze({ cvText: "Experience\nI did not have Kubernetes experience in 2020. In 2024 I built Kubernetes clusters and improved deployment reliability 30%.", targetRole: "" }, "Requirements: Kubernetes required. The engineer owns reliable customer infrastructure and delivery.");
  const kubernetes = result.findings.find((item) => item.claim === "Required: kubernetes");
  assert.equal(kubernetes.status, "match");
  assert.match(kubernetes.explanation, /outcome|applied/i);
});

test("required and preferred languages are classified independently within one JD line", () => {
  const result = analyze({ cvText: "Experience\nBuilt Python services and improved reliability 28% across four years.", languages: "" }, "Requirements: Python required. English required; Dutch preferred for local client collaboration. The role supports customer delivery.", "NL");
  const english = result.findings.find((item) => item.category === "language" && /English/.test(item.claim));
  const dutch = result.findings.find((item) => item.category === "language" && /Dutch/.test(item.claim));
  assert.equal(english.status, "confirmed_blocker");
  assert.equal(dutch.status, "note");
});

test("short skill names do not match within unrelated JD words", () => {
  const requirements = extractRequirements("Requirements: Python required. The team values clear documentation and collaboration.");
  assert.equal(requirements.some((item) => item.category === "skill" && item.term === "ui"), false);
});

test("local analysis recognizes explicit technical aliases and preserves evidence strength", () => {
  const result = analyze({
    cvText: "Experience\nBuilt retrieval-augmented generation systems with large language models and deployed them on k8s. Developed Go/C++ services for production customers.",
    targetRole: ""
  }, "Requirements: LLM required. RAG required. Kubernetes required. Go required. C++ required. The team owns production AI systems.");
  const statusFor = (term) => result.findings.find((item) => item.claim === `Required: ${term}`)?.status;
  assert.equal(statusFor("llm"), "match");
  assert.equal(statusFor("rag"), "match");
  assert.equal(statusFor("kubernetes"), "match");
  assert.equal(statusFor("go"), "match");
  assert.equal(statusFor("c++"), "match");
  assert.equal(containsTerm("I go to work every day.", "go"), false);
});

test("protected-attribute wording gets a compliance finding without a candidate penalty", () => {
  const result = analyze({}, "Requirements: Python required. Male candidates only. The role delivers reliable customer software.");
  assert.ok(result.findings.some((item) => item.category === "potential_compliance_sensitive_wording"));
});
