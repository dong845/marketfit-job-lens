import { createEvidenceRef, createFinding } from "./schemas.js";

export function decideApplication({ inputQuality, blockers, requirementFindings, roleValue = 3, job }) {
  if (inputQuality.status === "insufficient") return insufficientDecision(inputQuality);
  if (inputQuality.status === "needs_confirmation") return confirmationDecision(inputQuality);
  const confirmed = blockers.filter((item) => item.status === "confirmed_blocker");
  const conditional = blockers.filter((item) => item.status === "conditional_blocker");
  const unknown = blockers.filter((item) => item.status === "unknown");
  if (confirmed.length) {
    return {
      applicationPriority: "do_not_prioritize", confidence: "high", fitEstimateRange: null,
      reason: "A confirmed mandatory condition is not met or not evidenced.",
      nextAction: "Resolve the confirmed blocker only if its evidence is wrong; otherwise do not prioritize this application."
    };
  }
  if (conditional.length || unknown.some((item) => item.category === "work_authorization")) {
    return {
      applicationPriority: "verify_first", confidence: conditional.length ? "medium" : "low", fitEstimateRange: null,
      reason: "Eligibility has a material uncertainty that should be clarified before a full application.",
      nextAction: "Ask the role-specific eligibility question shown in the evidence details."
    };
  }
  const required = requirementFindings.filter((item) => item.requirementType === "required");
  const strong = required.filter((item) => item.status === "match").length;
  const weak = required.filter((item) => item.status === "weak_evidence").length;
  const missing = required.filter((item) => item.status === "gap").length;
  const total = Math.max(required.length, 1);
  const fit = (strong + weak * 0.4) / total;
  const effortPenalty = missing / total;
  const valueAdjustment = Math.max(-0.05, Math.min(0.05, (Number(roleValue) - 3) * 0.025));
  const midpoint = Math.round(Math.max(20, Math.min(92, (fit - effortPenalty * 0.18 + valueAdjustment) * 100)));
  const fitEstimateRange = { min: Math.max(0, midpoint - 9), max: Math.min(100, midpoint + 9), label: "Evidence-based fit estimate, not interview probability" };
  if (fit >= 0.72 && missing === 0) return { applicationPriority: "apply", confidence: "medium", fitEstimateRange, reason: "Required JD evidence is mostly supported and no hard blocker was found.", nextAction: "Tailor the summary and first bullets to the strongest required-evidence matches." };
  if (fit >= 0.48) return { applicationPriority: "tailor_then_apply", confidence: "medium", fitEstimateRange, reason: "The role is plausible, but required evidence should be made clearer before applying.", nextAction: "Rewrite the relevant CV bullets with direct project or outcome evidence, then apply." };
  return { applicationPriority: "stretch", confidence: "medium", fitEstimateRange, reason: "The current CV has material required-evidence gaps.", nextAction: "Apply only after deciding the role value justifies targeted preparation." };
}

export function qualityFindings(inputQuality) {
  if (inputQuality.status === "sufficient") return [];
  return inputQuality.missing.map((missing, index) => createFinding({
    category: "input_quality", status: inputQuality.status, severity: "high", claim: missing,
    explanation: inputQuality.recoveryActions[index] || inputQuality.recoveryActions[0] || "Provide clearer source text.", confidence: "high",
    evidenceRefs: [createEvidenceRef("job", "Input quality check")]
  }));
}

function insufficientDecision(inputQuality) {
  return { applicationPriority: "insufficient", confidence: "high", fitEstimateRange: null, reason: inputQuality.missing.join(" "), nextAction: inputQuality.recoveryActions[0] || "Provide CV and JD evidence." };
}

function confirmationDecision(inputQuality) {
  return { applicationPriority: "needs_confirmation", confidence: "low", fitEstimateRange: null, reason: inputQuality.missing.join(" "), nextAction: inputQuality.recoveryActions[0] || "Confirm the extracted job." };
}
