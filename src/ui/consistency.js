/**
 * Contradictions inside a single analysis, found in code rather than asked for in
 * prose. Pure, deterministic, and deliberately not the model's job to police.
 *
 * The prompt already states each of these rules to the model, and the model already
 * follows them most of the time. That is exactly the problem this file exists for:
 * a rule obeyed most of the time still ships the defect, and this one ships it
 * invisibly. Nothing about a strong_fit priced at three days looks broken on screen
 * — it looks like an analysis. The reader has no way to know the two halves of the
 * card were produced by a model contradicting itself, so they average them, and the
 * average is not a judgement anyone made.
 *
 * Every check here reports rather than repairs. Code can see that two fields
 * disagree; it cannot see which one is right, and picking silently would replace a
 * visible contradiction with an invisible guess. The one place this codebase does
 * override a model field — the work-authorization downgrade in analysisView.js —
 * says so on the card for the same reason.
 *
 * These are deliberately the checks that survive being wrong. Each one fires on a
 * countable fact, never on meaning, so a false positive costs the reader one line of
 * caution and never suppresses a finding.
 */

/**
 * A verdict that says the CV already covers what the posting screens on, beside an
 * effort estimate that says closing the gaps takes more than wording.
 *
 * The prompt (`prompts.js`) names evening and multi_day as the contradiction;
 * not_closable is included because it is strictly worse — it asserts a knockout the
 * candidate cannot honestly meet at all, which cannot coexist with a strong fit.
 *
 * @returns {boolean}
 */
export function verdictEffortConflict(recommendation) {
  if (!recommendation || recommendation.verdict !== "strong_fit") return false;
  return ["evening", "multi_day", "not_closable"].includes(recommendation.effort);
}

/**
 * How many requirements were marked as hard filters, when that count is high enough
 * to mean the rule was applied loosely.
 *
 * A knockout is meant to be a condition a recruiter can check without judgement and
 * which ends the application on its own — a licence, a clearance, a work-authorization
 * condition. Postings label half their list "required", and the whole point of the
 * screening axis is to be the smaller, harder list underneath that label. When it
 * stops being smaller it has collapsed back into the thing it was separating from,
 * and the requirement ordering built on it is no longer a screening order.
 *
 * Not reclassified: code can count them but cannot tell which one is genuine.
 *
 * @returns {number} 0 when the count is credible.
 */
export function looseKnockouts(requirements) {
  const count = (requirements || []).filter((item) => item?.screening === "knockout").length;
  return count > 2 ? count : 0;
}

/**
 * Gaps that claim a pre-application fix while the plan is too short to contain them.
 *
 * suggestedActions is the single authoritative to-do list — every instruction implied
 * by a gap's howToClose is supposed to appear there exactly once. Matching them by
 * meaning would need the model back, and would produce false positives on wording
 * alone, so only the degenerate case is checked: more closable gaps than there are
 * actions in total. That is narrower than the rule it guards, and it is the part of
 * the rule that can be checked without guessing.
 *
 * @returns {{gaps: number, actions: number}|null} null when the plan is long enough.
 */
export function uncoveredGapActions(gaps, suggestedActions) {
  const closable = (gaps || []).filter((item) => item?.closable === "before_apply" && item?.howToClose).length;
  const actions = (suggestedActions || []).length;
  return closable > actions ? { gaps: closable, actions } : null;
}
