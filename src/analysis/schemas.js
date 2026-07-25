/**
 * Runtime constructors for the documented local MVP schemas.
 *
 * @typedef {Object} EvidenceRef
 * @property {'cv'|'job'|'profile'|'market'|'employer'} source
 * @property {string} quote
 * @property {string} [field]
 * @property {string} [url]
 * @property {string} [capturedAt]
 *
 * @typedef {Object} Finding
 * @property {string} category
 * @property {string} status
 * @property {'info'|'low'|'medium'|'high'|'critical'} severity
 * @property {string} claim
 * @property {string} explanation
 * @property {'low'|'medium'|'high'} confidence
 * @property {EvidenceRef[]} evidenceRefs
 *
 * @typedef {Object} InputQuality
 * @property {'sufficient'|'needs_confirmation'|'insufficient'} status
 * @property {boolean} canScore
 * @property {string[]} missing
 * @property {string[]} recoveryActions
 * @property {number} cvQuality
 * @property {number} jobQuality
 * @property {number} extractionConfidence
 */

const FINDING_KEYS = ["category", "status", "severity", "claim", "explanation", "confidence", "evidenceRefs"];

export function createEvidenceRef(source, quote, extras = {}) {
  return { source, quote: String(quote ?? "").slice(0, 500), ...extras };
}

export function createFinding(input) {
  for (const key of FINDING_KEYS) {
    if (!(key in input)) throw new Error(`Finding requires ${key}`);
  }
  if (!Array.isArray(input.evidenceRefs)) throw new Error("Finding evidenceRefs must be an array");
  return {
    category: input.category,
    status: input.status,
    severity: input.severity,
    claim: input.claim,
    explanation: input.explanation,
    confidence: input.confidence,
    evidenceRefs: input.evidenceRefs
  };
}

export function hasFindingShape(value) {
  return Boolean(value) && FINDING_KEYS.every((key) => key in value) && Array.isArray(value.evidenceRefs);
}

export function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

export function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
