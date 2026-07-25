import { assessInputQuality } from "./inputQuality.js";
import { extractComplianceSensitiveWording, extractRequirements, extractSponsorshipState } from "./requirements.js";
import { evaluateHardBlockers } from "./hardBlockers.js";
import { decideApplication, qualityFindings } from "./decisionPolicy.js";
import { createEvidenceRef, createFinding } from "./schemas.js";
import { extractCandidateEvidence, evidenceRefFromCandidate, findCvLanguageEvidence, findLanguageEvidence } from "../profile/evidence.js";
import { normalizeProfile } from "../profile/schema.js";
import { validateNormalizedJob } from "../extraction/schema.js";
import { createManualJob } from "../extraction/extractJob.js";
import { getMarketClaims, MARKET_NAMES } from "../market/claimStore.js";
import { employerEvidenceFromJob } from "../market/employerEvidence.js";

export function analyzeJob({ profile: rawProfile = {}, job: suppliedJob, jobText = "", marketId = "US" }) {
  const selectedMarketId = MARKET_NAMES[marketId] ? marketId : "US";
  const profile = normalizeProfile(rawProfile, selectedMarketId);
  const job = validateNormalizedJob(suppliedJob) ? suppliedJob : createManualJob({ jobText });
  const requirements = job.requirements?.length ? job.requirements : extractRequirements(job.sourceText);
  const sponsorship = extractSponsorshipState(job.sourceText);
  const inputQuality = assessInputQuality({ profile, job, requirements });
  const quality = qualityFindings(inputQuality);

  if (inputQuality.status !== "sufficient") {
    const decision = decideApplication({ inputQuality, blockers: [], requirementFindings: [], roleValue: profile.roleValue, job });
    return buildResult({ selectedMarketId, profile, job, requirements, inputQuality, decision, findings: quality, sponsorship, requirementFindings: [] });
  }

  const requirementFindings = matchRequirements(profile, requirements);
  const blockers = evaluateHardBlockers({ profile, job, requirements, sponsorship });
  const compliance = complianceFindings(job.sourceText);
  const careerDirection = careerDirectionFinding(profile, job);
  const decision = decideApplication({ inputQuality, blockers, requirementFindings, roleValue: profile.roleValue, job });
  return buildResult({ selectedMarketId, profile, job, requirements, inputQuality, decision, findings: [...quality, ...blockers, ...requirementFindings.map(stripRequirementMeta), ...compliance, careerDirection].filter(Boolean), sponsorship, requirementFindings });
}

function matchRequirements(profile, requirements) {
  const candidateEvidence = extractCandidateEvidence(profile.cvText, requirements.filter((item) => item.category === "skill").map((item) => item.term));
  return requirements.filter((item) => item.type === "required" || item.type === "preferred").map((requirement) => {
    if (requirement.category === "language") {
      const cvEvidence = findCvLanguageEvidence(profile.cvText, requirement.term);
      const matched = findLanguageEvidence(profile.languages, requirement.term) || Boolean(cvEvidence);
      const profileRef = cvEvidence
        ? createEvidenceRef("cv", cvEvidence.quote, { field: cvEvidence.section })
        : createEvidenceRef("profile", profile.languages || "No languages supplied", { field: "languages" });
      return requirementFinding(requirement, matched ? "match" : "gap", matched ? `${capitalize(requirement.term)} is evidenced in the candidate profile.` : `No ${requirement.term} evidence was found in the profile or CV.`, [...requirement.evidenceRefs, profileRef], "high");
    }
    if (requirement.category === "degree") {
      const matched = /\b(bachelor|master|phd|degree)\b|本科|学士|硕士|博士/i.test(profile.cvText);
      return requirementFinding(requirement, matched ? "match" : "gap", matched ? "Degree evidence appears in the CV." : "No degree evidence was found in the CV.", requirement.evidenceRefs, "medium");
    }
    if (requirement.category === "seniority") {
      const matched = /\b\d+\+? years?\b|\d+年(?:以上)?经验/i.test(profile.cvText);
      return requirementFinding(requirement, matched ? "match" : "weak_evidence", matched ? "Duration evidence appears in the CV." : "The CV does not state a duration; assess seniority manually.", requirement.evidenceRefs, "medium");
    }
    if (requirement.category !== "skill") return requirementFinding(requirement, "unknown", "Evidence requires a more specific profile field or manual review.", requirement.evidenceRefs, "medium");
    const evidence = candidateEvidence.find((item) => item.term === requirement.term);
    if (evidence?.polarity === "negative") return requirementFinding(requirement, "gap", `The CV explicitly says the candidate does not have ${requirement.term} experience.`, [evidenceRefFromCandidate(evidence), ...requirement.evidenceRefs], "high");
    if (!evidence) return requirementFinding(requirement, "gap", `No CV evidence was found for ${requirement.term}.`, requirement.evidenceRefs, "medium");
    if (evidence.level === "learning" || evidence.level === "mentioned") return requirementFinding(requirement, "weak_evidence", `${capitalize(requirement.term)} is mentioned, but the CV does not show applied project or outcome evidence.`, [evidenceRefFromCandidate(evidence), ...requirement.evidenceRefs], "medium");
    return requirementFinding(requirement, "match", `${capitalize(requirement.term)} has ${evidence.level} evidence in the CV.`, [evidenceRefFromCandidate(evidence), ...requirement.evidenceRefs], "high");
  });
}

function requirementFinding(requirement, status, explanation, evidenceRefs, confidence) {
  const requiredGap = requirement.type === "required" && status === "gap";
  const preferredGap = requirement.type === "preferred" && status === "gap";
  return {
    requirementType: requirement.type,
    ...createFinding({
      category: `requirement_${requirement.category}`,
      status,
      severity: requiredGap ? "high" : preferredGap ? "low" : status === "weak_evidence" ? "medium" : "info",
      claim: requirement.type === "required" ? `Required: ${requirement.term}` : `Preferred: ${requirement.term}`,
      explanation: preferredGap ? `${explanation} This is a preference, not a hard blocker.` : explanation,
      confidence,
      evidenceRefs
    })
  };
}

function complianceFindings(sourceText) {
  return extractComplianceSensitiveWording(sourceText).map((item) => createFinding({
    category: "potential_compliance_sensitive_wording", status: "review", severity: "medium", claim: item.claim,
    explanation: "This wording should be interpreted as an eligibility, business-necessity, or compliance question. It never reduces a candidate score based on protected identity.", confidence: "medium",
    evidenceRefs: [createEvidenceRef("job", item.line, { field: item.category })]
  }));
}

function careerDirectionFinding(profile, job) {
  if (!profile.targetRole) return null;
  const targetWords = profile.targetRole.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
  const aligned = targetWords.some((word) => job.title.toLowerCase().includes(word));
  return createFinding({
    category: "career_direction", status: aligned ? "match" : "unknown", severity: aligned ? "info" : "low",
    claim: aligned ? "The job title has a target-role alignment signal." : "Target-role alignment is unclear from the job title.",
    explanation: "Target role is used only as a career-direction preference; it is never used as CV skill, domain, seniority, degree, or years evidence.", confidence: "medium",
    evidenceRefs: [createEvidenceRef("profile", profile.targetRole, { field: "targetRole" }), createEvidenceRef("job", job.title || "No title extracted", { field: "title" })]
  });
}

function buildResult({ selectedMarketId, profile, job, requirements, inputQuality, decision, findings, sponsorship, requirementFindings }) {
  const marketClaims = getMarketClaims(selectedMarketId);
  const marketFindings = marketClaims.map((claim) => createFinding({
    category: "market_claim", status: claim.stale ? "stale" : "context", severity: claim.stale ? "medium" : "info",
    claim: claim.claim, explanation: claim.stale ? "This market claim has passed its refresh date; verify the official source." : "Market context only; it does not determine candidate quality or role-level sponsorship.", confidence: claim.confidence === "official" ? "high" : "medium",
    evidenceRefs: [createEvidenceRef("market", claim.claim, { url: claim.sourceUrl, capturedAt: claim.retrievedAt, field: claim.category })]
  }));
  const allFindings = [...findings, ...marketFindings];
  const blockers = allFindings.filter((item) => /blocker/.test(item.status));
  const uncertainties = allFindings.filter((item) => ["unknown", "weak_evidence", "review", "stale", "conditional_blocker"].includes(item.status));
  const evidenceMatches = allFindings.filter((item) => item.status === "match");
  const gaps = allFindings.filter((item) => item.status === "gap" || item.status === "confirmed_blocker");
  const employerEvidence = employerEvidenceFromJob(job, sponsorship);
  return {
    schemaVersion: 2,
    marketId: selectedMarketId,
    marketName: MARKET_NAMES[selectedMarketId],
    job,
    profileSummary: { targetRole: profile.targetRole, authorization: profile.authorization.statusType },
    inputQuality,
    applicationPriority: decision.applicationPriority,
    decision: { label: humanize(decision.applicationPriority), reason: decision.reason },
    confidence: decision.confidence,
    fitEstimateRange: decision.fitEstimateRange,
    confirmedBlockers: blockers.filter((item) => item.status === "confirmed_blocker"),
    uncertaintiesToVerify: uncertainties,
    strongestEvidenceMatches: evidenceMatches,
    highestImpactGaps: gaps,
    recommendedNextAction: decision.nextAction,
    findings: allFindings,
    requirements,
    sponsorship,
    employerEvidence,
    disclaimer: "This is an evidence-based job-search aid, not legal, immigration, employment, or hiring advice. Verify current official rules and employer terms."
  };
}

function stripRequirementMeta({ requirementType, ...finding }) { return finding; }
function capitalize(value) { return String(value).charAt(0).toUpperCase() + String(value).slice(1); }
function humanize(value) { return String(value).split("_").map((part) => capitalize(part)).join(" "); }
