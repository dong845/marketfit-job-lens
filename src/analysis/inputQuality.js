import { cleanText } from "./schemas.js";

export function assessInputQuality({ profile, job, requirements = [] }) {
  const cvText = cleanText(profile.cvText);
  const jobText = cleanText(job.sourceText);
  const cvWords = cvText.split(/\s+/).filter(Boolean).length;
  const jobWords = jobText.split(/\s+/).filter(Boolean).length;
  const extractionConfidence = Number(job.extraction?.confidence ?? 0);
  const missing = [];
  const recoveryActions = [];

  if (cvText.length < 40 || cvWords < 6) {
    missing.push("CV/profile evidence is too short to assess skills, seniority, or work history.");
    recoveryActions.push("Paste a CV or profile with at least one role or project and concrete responsibilities or outcomes.");
  }
  if (jobText.length < 80 || jobWords < 12) {
    missing.push("Job description is too short to identify mandatory requirements.");
    recoveryActions.push("Capture the full role description or paste the requirements section.");
  }
  if (missing.length) {
    return { status: "insufficient", canScore: false, missing, recoveryActions, cvQuality: quality(cvText, 900), jobQuality: quality(jobText, 1400), extractionConfidence };
  }
  if (!requirements.some((requirement) => requirement.type === "required")) {
    return {
      status: "needs_confirmation",
      canScore: false,
      missing: ["No explicit job requirements could be extracted from the current JD."],
      recoveryActions: ["Paste the qualifications or requirements section, then review the extracted job text before rerunning analysis."],
      cvQuality: quality(cvText, 900),
      jobQuality: quality(jobText, 1400),
      extractionConfidence
    };
  }
  if (job.extraction?.needsConfirmation || extractionConfidence < 0.55) {
    return {
      status: "needs_confirmation",
      canScore: false,
      missing: ["The job extraction is low confidence; title, company, and requirements may include page noise."],
      recoveryActions: ["Review the extracted job fields, remove unrelated text, and rerun analysis."],
      cvQuality: quality(cvText, 900),
      jobQuality: quality(jobText, 1400),
      extractionConfidence
    };
  }
  return { status: "sufficient", canScore: true, missing: [], recoveryActions: [], cvQuality: quality(cvText, 900), jobQuality: quality(jobText, 1400), extractionConfidence };
}

function quality(text, targetLength) {
  const outcomeSignal = /\d+(?:\.\d+)?\s*(?:%|x|k|m)|increased|reduced|built|led|developed|提升|负责|开发/i.test(text) ? 12 : 0;
  return Math.min(100, Math.round((Math.min(text.length, targetLength) / targetLength) * 88) + outcomeSignal);
}
