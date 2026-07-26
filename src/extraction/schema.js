/**
 * How a capture was obtained. Named here rather than written inline at each call
 * site because these tokens are user-visible — the panel prints a label for each —
 * so something has to be able to enumerate them. A token with no label prints as
 * raw snake_case in both languages, which is how "schema_org_jsonld" reached the UI.
 */
export const CAPTURE_METHODS = Object.freeze({
  jsonLd: "schema_org_jsonld",
  semantic: "semantic_selector",
  manual: "manual_paste",
  empty: "empty",
  greenhouse: "greenhouse_adapter",
  lever: "lever_adapter",
  workday: "workday_adapter",
  genericSpa: "generic_spa_adapter"
});

/** @typedef {Object} NormalizedJob
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {string} employmentType
 * @property {string} salary
 * @property {string} url
 * @property {string} capturedAt
 * @property {string} sourceText
 * @property {{method:string, confidence:number, needsConfirmation:boolean, textLength?:number, contentFingerprint?:string, qualityReasons?:string[], removedLines?:number, removedSample?:string[]}} extraction
 */

/**
 * Identity fields are capped here to what the request parser accepts.
 *
 * Capture picks them with container-ish selectors ([class*='title'] and friends),
 * so a hero block or an every-office location list can arrive hundreds of
 * characters long. Uncapped, the run failed at request validation with a message
 * naming an internal field, and re-opening the editor pre-filled the same
 * over-long value — so the user could only hit it again.
 */
const MAX_IDENTITY_LENGTH = 240;

export function createNormalizedJob(input = {}) {
  return {
    title: identityText(input.title),
    company: identityText(input.company),
    location: identityText(input.location),
    employmentType: cleanText(input.employmentType).slice(0, 120),
    salary: identityText(input.salary),
    url: cleanText(input.url),
    capturedAt: input.capturedAt || new Date().toISOString(),
    sourceText: cleanSourceText(input.sourceText),
    extraction: {
      method: input.extraction?.method || CAPTURE_METHODS.manual,
      confidence: Number(input.extraction?.confidence ?? 0.85),
      needsConfirmation: Boolean(input.extraction?.needsConfirmation),
      textLength: Number(input.extraction?.textLength ?? cleanSourceText(input.sourceText).length),
      contentFingerprint: cleanText(input.extraction?.contentFingerprint),
      qualityReasons: Array.isArray(input.extraction?.qualityReasons) ? input.extraction.qualityReasons.map(cleanText).filter(Boolean) : [],
      removedLines: Number(input.extraction?.removedLines ?? 0),
      removedSample: Array.isArray(input.extraction?.removedSample) ? input.extraction.removedSample.slice(0, 12).map((line) => cleanText(line).slice(0, 120)) : []
    }
  };
}


export function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function identityText(value) {
  return cleanText(value).slice(0, MAX_IDENTITY_LENGTH).trim();
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
