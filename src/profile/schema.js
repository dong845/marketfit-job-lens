import { cleanText } from "../analysis/schemas.js";

export const AUTHORIZATION_STATUS = Object.freeze({
  AUTHORIZED: "authorized",
  NEEDS_SPONSORSHIP: "needs_sponsorship",
  OPEN_WORK_PERMIT: "open_work_permit",
  STUDENT_OR_GRADUATE: "student_or_graduate",
  TEMPORARY_ROUTE: "temporary_route",
  UNKNOWN: "unknown"
});

/**
 * @typedef {Object} AuthorizationProfile
 * @property {string} country
 * @property {string} statusType
 * @property {string} [expiry]
 * @property {string} restrictions
 * @property {boolean} futureSponsorshipNeed
 * @property {string} route
 */

/** @typedef {Object} CandidateEvidence
 * @property {string} id
 * @property {string} kind
 * @property {string} term
 * @property {'negative'|'positive'} polarity
 * @property {'mentioned'|'learning'|'applied'|'outcome'} level
 * @property {string} quote
 * @property {string} section
 * @property {string} [recency]
 */

export function normalizeAuthorizationProfile(raw = {}, marketId = "US") {
  const legacy = raw.workAuthorization;
  const statusType = Object.values(AUTHORIZATION_STATUS).includes(raw.statusType)
    ? raw.statusType
    : Object.values(AUTHORIZATION_STATUS).includes(legacy)
      ? legacy
      : AUTHORIZATION_STATUS.UNKNOWN;
  const route = cleanText(raw.route);
  const inferredFutureNeed = statusType === AUTHORIZATION_STATUS.NEEDS_SPONSORSHIP || statusType === AUTHORIZATION_STATUS.STUDENT_OR_GRADUATE;

  return {
    country: cleanText(raw.country || marketId),
    statusType,
    expiry: cleanText(raw.expiry),
    restrictions: cleanText(raw.restrictions),
    futureSponsorshipNeed: raw.futureSponsorshipNeed === true || inferredFutureNeed,
    route,
    clearances: cleanText(raw.clearances),
    licenses: cleanText(raw.licenses)
  };
}

export function normalizeProfile(raw = {}, marketId = "US") {
  return {
    cvText: cleanText(raw.cvText),
    targetRole: cleanText(raw.targetRole),
    market: marketId,
    languages: cleanText(raw.languages),
    constraints: cleanText(raw.constraints),
    roleValue: Number.isFinite(Number(raw.roleValue)) ? Number(raw.roleValue) : 3,
    authorization: normalizeAuthorizationProfile(raw.authorization || raw, marketId)
  };
}

export function needsFutureSponsorship(authorization) {
  return authorization.statusType === AUTHORIZATION_STATUS.NEEDS_SPONSORSHIP || authorization.futureSponsorshipNeed === true;
}
