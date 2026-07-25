import { cleanText } from "../analysis/schemas.js";

/** @typedef {Object} NormalizedJob
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {string} employmentType
 * @property {string} salary
 * @property {import('../analysis/requirements.js').Requirement[]} requirements
 * @property {string[]} responsibilities
 * @property {string[]} benefits
 * @property {string[]} visaStatements
 * @property {string[]} languageStatements
 * @property {string} url
 * @property {string} capturedAt
 * @property {string} sourceText
 * @property {{method:string, confidence:number, needsConfirmation:boolean, textLength?:number, requirementCount?:number, contentFingerprint?:string, qualityReasons?:string[]}} extraction
 */

export function createNormalizedJob(input = {}) {
  return {
    title: cleanText(input.title),
    company: cleanText(input.company),
    location: cleanText(input.location),
    employmentType: cleanText(input.employmentType),
    salary: cleanText(input.salary),
    requirements: Array.isArray(input.requirements) ? input.requirements : [],
    responsibilities: Array.isArray(input.responsibilities) ? input.responsibilities : [],
    benefits: Array.isArray(input.benefits) ? input.benefits : [],
    visaStatements: Array.isArray(input.visaStatements) ? input.visaStatements : [],
    languageStatements: Array.isArray(input.languageStatements) ? input.languageStatements : [],
    url: cleanText(input.url),
    capturedAt: input.capturedAt || new Date().toISOString(),
    sourceText: cleanSourceText(input.sourceText),
    extraction: {
      method: input.extraction?.method || "manual_paste",
      confidence: Number(input.extraction?.confidence ?? 0.85),
      needsConfirmation: Boolean(input.extraction?.needsConfirmation),
      textLength: Number(input.extraction?.textLength ?? cleanSourceText(input.sourceText).length),
      requirementCount: Number(input.extraction?.requirementCount ?? 0),
      contentFingerprint: cleanText(input.extraction?.contentFingerprint),
      qualityReasons: Array.isArray(input.extraction?.qualityReasons) ? input.extraction.qualityReasons.map(cleanText).filter(Boolean) : []
    }
  };
}

export function validateNormalizedJob(job) {
  return Boolean(job) && typeof job.sourceText === "string" && job.extraction && Number.isFinite(job.extraction.confidence);
}

function cleanSourceText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
