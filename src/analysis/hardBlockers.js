import { createEvidenceRef, createFinding, normalizeText } from "./schemas.js";
import { findCvClearanceEvidence, findCvLanguageEvidence, findLanguageEvidence, findProfileEvidence } from "../profile/evidence.js";
import { AUTHORIZATION_STATUS, needsFutureSponsorship } from "../profile/schema.js";

export function evaluateHardBlockers({ profile, job, requirements, sponsorship }) {
  const findings = [];
  const source = job.sourceText;
  const authorization = profile.authorization;
  const requiresSponsor = needsFutureSponsorship(authorization);

  if (requiresSponsor && sponsorship.state === "explicit_no_sponsorship") {
    findings.push(createFinding({
      category: "work_authorization", status: "confirmed_blocker", severity: "critical",
      claim: "The role states that sponsorship or future work authorization is not supported.",
      explanation: "The profile indicates a current or future sponsorship need, so this cannot be treated as an ordinary fit gap.", confidence: "high",
      evidenceRefs: [...sponsorship.evidenceRefs, createEvidenceRef("profile", authorization.statusType, { field: "authorization.statusType" })]
    }));
  } else if (requiresSponsor && sponsorship.state === "conflicting_evidence") {
    findings.push(createFinding({
      category: "work_authorization", status: "conditional_blocker", severity: "high",
      claim: "The JD contains conflicting sponsorship wording; restrictive wording controls until confirmed.",
      explanation: "Do not spend on a full application before a recruiter confirms sponsorship for this specific role.", confidence: "high",
      evidenceRefs: sponsorship.evidenceRefs
    }));
  } else if (requiresSponsor && sponsorship.state === "existing_authorization_required") {
    findings.push(createFinding({
      category: "work_authorization", status: "confirmed_blocker", severity: "critical",
      claim: "The role requires existing work authorization.",
      explanation: "The profile indicates a future sponsorship need.", confidence: "high",
      evidenceRefs: [...sponsorship.evidenceRefs, createEvidenceRef("profile", authorization.statusType, { field: "authorization.statusType" })]
    }));
  } else if (requiresSponsor && sponsorship.state === "ambiguous") {
    findings.push(createFinding({
      category: "work_authorization", status: "unknown", severity: "medium",
      claim: "Role-level sponsorship willingness is not stated.",
      explanation: "Employer eligibility, role willingness, and personal visa eligibility are different questions.", confidence: "medium",
      evidenceRefs: [createEvidenceRef("profile", authorization.statusType, { field: "authorization.statusType" })]
    }));
  }

  if (authorization.statusType === AUTHORIZATION_STATUS.STUDENT_OR_GRADUATE) {
    findings.push(createFinding({
      category: "authorization_route", status: "unknown", severity: "medium",
      claim: "A student or graduate route is present and should be verified for start date and transition timing.",
      explanation: "This is a distinct authorization route, not an unknown status. The extension does not determine visa eligibility.", confidence: "medium",
      evidenceRefs: [createEvidenceRef("profile", authorization.statusType, { field: "authorization.statusType" })]
    }));
  }

  const clearanceLine = findLine(source, /(?:must|require[ds]?|currently hold).{0,80}(?:active )?(?:ts\/sci|secret|top secret|security clearance|baseline clearance|sc clearance)|(?:active )?(?:ts\/sci|secret|top secret).{0,80}(?:required|must)/i);
  const cvClearance = clearanceLine ? findCvClearanceEvidence(profile.cvText, clearanceLine) : null;
  const suppliedClearance = clearanceLine && hasClearance(authorization.clearances, clearanceLine);
  if (clearanceLine && !suppliedClearance && !cvClearance?.isCurrent) {
    const evidenceRefs = [createEvidenceRef("job", clearanceLine, { field: "requirements" })];
    if (cvClearance) evidenceRefs.push(createEvidenceRef("cv", cvClearance.quote, { field: cvClearance.section }));
    else evidenceRefs.push(createEvidenceRef("profile", authorization.clearances || "No clearance supplied", { field: "authorization.clearances" }));
    findings.push(createFinding({
      category: "security_clearance", status: cvClearance ? "conditional_blocker" : "confirmed_blocker", severity: cvClearance ? "high" : "critical",
      claim: cvClearance ? "A clearance appears in the CV, but current active status is not evidenced." : "An active security clearance is explicitly required and is not evidenced in the profile.",
      explanation: cvClearance ? "Confirm that the listed clearance is active and satisfies the role's exact level." : "A current active clearance is a hard eligibility condition, not a skill score deduction.", confidence: cvClearance ? "medium" : "high",
      evidenceRefs
    }));
  }

  for (const requirement of requirements.filter((item) => item.category === "language")) {
    if (requirement.type === "preferred") {
      findings.push(createFinding({
        category: "language", status: "note", severity: "low",
        claim: `${capitalize(requirement.term)} is preferred, not required.`,
        explanation: "This can affect competitiveness but is not a hard blocker.", confidence: "high", evidenceRefs: requirement.evidenceRefs
      }));
    } else if (requirement.type === "required" && !findLanguageEvidence(profile.languages, requirement.term) && !findCvLanguageEvidence(profile.cvText, requirement.term)) {
      findings.push(createFinding({
        category: "language", status: "confirmed_blocker", severity: "high",
        claim: `${capitalize(requirement.term)} is explicitly required and is not evidenced in the profile.`,
        explanation: "The requirement is based on this JD, not a market-level assumption.", confidence: "high",
        evidenceRefs: [...requirement.evidenceRefs, createEvidenceRef("profile", profile.languages || "No languages supplied", { field: "languages" })]
      }));
    }
  }

  const licenceLine = findLine(source, /(?:active |current )?(?:licen[cs]e|registration|registered nurse|bar admission|professional engineer).{0,80}(?:required|must)|(?:required|must).{0,80}(?:licen[cs]e|registration)/i);
  if (licenceLine && !findProfileEvidence(authorization.licenses, "licence") && !findProfileEvidence(authorization.licenses, "license")) {
    findings.push(createFinding({
      category: "licence_registration", status: "conditional_blocker", severity: "high",
      claim: "The JD appears to require a licence or registration that is not recorded in the profile.",
      explanation: "Confirm the exact credential and whether an equivalent registration is accepted.", confidence: "medium",
      evidenceRefs: [createEvidenceRef("job", licenceLine, { field: "requirements" }), createEvidenceRef("profile", authorization.licenses || "No licences supplied", { field: "authorization.licenses" })]
    }));
  }

  const remoteOnly = /\bremote only\b|仅远程|只接受远程/i.test(profile.constraints);
  const onsiteLine = findLine(source, /\b(?:on[- ]site|in office|office based|must be based in)\b|必须到岗|坐班/i);
  if (remoteOnly && onsiteLine) {
    findings.push(createFinding({
      category: "location_work_model", status: "confirmed_blocker", severity: "high",
      claim: "The role requires an in-person location that conflicts with the profile's remote-only constraint.",
      explanation: "Change the profile constraint or confirm whether an exception exists before applying.", confidence: "high",
      evidenceRefs: [createEvidenceRef("job", onsiteLine, { field: "location/work model" }), createEvidenceRef("profile", profile.constraints, { field: "constraints" })]
    }));
  }
  return findings;
}

function findLine(text, pattern) {
  return String(text ?? "").split(/(?<=[.!?。！？])\s+|\n+/).find((line) => pattern.test(line))?.trim() || "";
}

function hasClearance(clearances, requirementLine) {
  const supplied = normalizeText(clearances);
  if (!supplied) return false;
  if (/ts\/sci/i.test(requirementLine)) return supplied.includes("ts/sci");
  if (/top secret/i.test(requirementLine)) return supplied.includes("top secret") || supplied.includes("ts/sci");
  return /clearance|baseline|sc/i.test(supplied);
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}
