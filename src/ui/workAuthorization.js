/**
 * Compares what the employer stated against what the candidate said about
 * themselves. Pure, deterministic, and deliberately not the model's job.
 *
 * This is arithmetic on two self-reported facts — a sentence quoted from the
 * posting and a category the user picked from a menu — not a determination of
 * anyone's legal status, which the system policy forbids and which no model can do
 * reliably: the rules differ by country, change every year, and turn on personal
 * details this extension never sees. So the output is always "these two appear to
 * conflict, check it yourself", never "you are not eligible".
 *
 * It lives in code rather than in the prompt because the answer must be the same
 * every run. A model asked to make this comparison gets it right most of the time,
 * and the case it gets wrong is the one where the job is impossible for the reader.
 */

/** How the candidate described their own position. Their words, not a finding. */
export const WORK_AUTHORIZATION = Object.freeze({
  authorized: "authorized",
  needsSponsorship: "needs_sponsorship",
  openWorkPermit: "open_work_permit",
  studentOrGraduate: "student_or_graduate",
  temporaryRoute: "temporary_route",
  unknown: "unknown"
});

/** Conditions about the right to work at all. A clearance or licence is a different question. */
const RIGHT_TO_WORK = new Set(["sponsorship", "work_authorization", "citizenship"]);

/**
 * @returns {"conflict"|"supported"|"verify"|null} null when there is nothing to say:
 * the condition is not about the right to work, or the candidate left the selector
 * on "unknown" — the default, which must never trigger a downgrade on its own.
 */
export function conditionAlignment(condition, declaredStatus) {
  if (!condition || !RIGHT_TO_WORK.has(condition.type)) return null;
  if (!declaredStatus || declaredStatus === WORK_AUTHORIZATION.unknown) return null;

  // An employer offering to sponsor turns the candidate's need into a match rather
  // than a problem, which is the single most useful thing this comparison can say.
  if (condition.stance === "offers_support") {
    return declaredStatus === WORK_AUTHORIZATION.needsSponsorship ? "supported" : null;
  }
  if (condition.stance !== "requires_existing") return null;

  switch (declaredStatus) {
    case WORK_AUTHORIZATION.needsSponsorship:
      return "conflict";
    // A graduate route or another temporary permit usually IS a right to work, but
    // for a bounded time and sometimes with conditions the posting does not name.
    // Calling that a conflict would wrongly kill viable applications, so it asks.
    case WORK_AUTHORIZATION.studentOrGraduate:
    case WORK_AUTHORIZATION.temporaryRoute:
      return "verify";
    default:
      return null;
  }
}

/**
 * The strongest alignment across every stated condition, for the verdict card.
 * A single conflict outranks any number of conditions that look fine.
 */
export function overallAlignment(conditions, declaredStatus) {
  const found = (conditions || []).map((condition) => conditionAlignment(condition, declaredStatus));
  if (found.includes("conflict")) return "conflict";
  if (found.includes("verify")) return "verify";
  if (found.includes("supported")) return "supported";
  return null;
}
