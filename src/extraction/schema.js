/** @typedef {Object} NormalizedJob
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {string} employmentType
 * @property {string} salary
 * @property {string} url
 * @property {string} capturedAt
 * @property {string} sourceText
 * @property {{method:string, confidence:number, needsConfirmation:boolean, textLength?:number, contentFingerprint?:string, qualityReasons?:string[]}} extraction
 */

export function createNormalizedJob(input = {}) {
  return {
    title: cleanText(input.title),
    company: cleanText(input.company),
    location: cleanText(input.location),
    employmentType: cleanText(input.employmentType),
    salary: cleanText(input.salary),
    url: cleanText(input.url),
    capturedAt: input.capturedAt || new Date().toISOString(),
    sourceText: cleanSourceText(input.sourceText),
    extraction: {
      method: input.extraction?.method || "manual_paste",
      confidence: Number(input.extraction?.confidence ?? 0.85),
      needsConfirmation: Boolean(input.extraction?.needsConfirmation),
      textLength: Number(input.extraction?.textLength ?? cleanSourceText(input.sourceText).length),
      contentFingerprint: cleanText(input.extraction?.contentFingerprint),
      qualityReasons: Array.isArray(input.extraction?.qualityReasons) ? input.extraction.qualityReasons.map(cleanText).filter(Boolean) : []
    }
  };
}


export function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Unlike cleanText, this keeps line breaks: they carry the section structure the model reads. */
function cleanSourceText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
