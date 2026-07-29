import { format, t } from "./i18n.js";
import { conditionAlignment, overallAlignment } from "./workAuthorization.js";
import { looseKnockouts, uncoveredGapActions, verdictEffortConflict } from "./consistency.js";

/**
 * Turns validated agent evidence into the analysis markup.
 *
 * Source quotes are deliberately not rendered. The model is still required to
 * cite real CV-nnn / JD-nnn block IDs and every reference is resolved back to
 * actual source text during parsing, with unresolvable ones dropped — that is
 * what stops it inventing quotes, and it is unaffected by not displaying them.
 * Printing the quotes as well buried the analysis the reader came for.
 *
 * Pure: evidence in, HTML string out, no DOM access — so the layout can be tested
 * directly rather than only through a live panel.
 *
 * Ordered for the decision this panel exists to support: the answer and what it
 * costs, then the conditions that can make the answer moot, then what the role is,
 * how the CV lines up requirement by requirement, and what to actually do about it.
 *
 * The disclaimer is last. Between the verdict and the substance it occupied the
 * spot the eye lands on after reading the answer, spending the reader's best
 * attention on small print.
 */
export function renderAnalysisHtml(evidence, locale, candidate = {}, sourceQuality = null) {
  if (!evidence) return "";
  // Computed once and passed down: the verdict card and the conditions card must
  // never disagree about whether the reader can take this job.
  const alignment = overallAlignment(evidence.statedConditions, candidate.workAuthorization);
  return [
    renderRecommendation(evidence.recommendation, evidence.requirements, locale, alignment, sourceQuality),
    renderStatedConditions(evidence.statedConditions, locale, candidate.workAuthorization),
    renderOverview(evidence.overview, locale),
    renderRequirements(evidence.requirements, locale),
    // Directly after the requirements, because it is the same list read the other way:
    // whether the CV can do the work, then whether its wording survives the search
    // that happens first. A term absent beside a requirement met is the pairing this
    // card exists to make visible, and separating them would hide it.
    renderScreening(evidence.screening, locale),
    renderCards(t(locale, "aiStrengths"), evidence.strengths, (item) => titleAndSummary(item.title, item.summary), locale, "positive"),
    renderCards(t(locale, "aiGaps"), evidence.gaps, (item) => gapItem(item, locale), locale, "negative"),
    // Between the gaps and the plan: what is missing against this posting, then what
    // reads oddly in the CV whatever the posting, then what to do about both. Filed
    // above the plan rather than under "check before applying" because unlike a role
    // risk these are the candidate's to act on, and acting on them is the plan.
    renderCards(t(locale, "profileRisks"), evidence.profileRisks, (item) => profileRiskItem(item, locale), locale, "negative"),
    renderActions(evidence.suggestedActions, locale, uncoveredGapActions(evidence.gaps, evidence.suggestedActions)),
    renderGroup(t(locale, "sectionPrepare"), [
      renderCards(t(locale, "resumeTailoring"), evidence.resumeTailoring, (item) => titleAndSummary(item.target, item.recommendation), locale, "sub"),
      renderCards(t(locale, "interviewFocus"), evidence.interviewFocus, (item) => titleAndSummary(item.question, item.rationale), locale, "sub")
    ]),
    renderGroup(t(locale, "sectionVerify"), [
      renderCards(t(locale, "aiRisks"), evidence.risks, (item) => titleAndSummary(item.title, item.summary, severityTag(item.severity, locale)), locale, "sub"),
      // Split by who can answer. One heading over both meant CV blind spots sat
      // under "ask the employer", where a reader either acts on them wrongly or,
      // more likely, skips the most actionable advice in the analysis.
      renderCards(t(locale, "employerQuestions"), openQuestions(evidence.uncertainties, "employer"), (item) => titleAndSummary(item.type, item.message), locale, "sub"),
      renderCards(t(locale, "cvBlindSpots"), openQuestions(evidence.uncertainties, "you"), (item) => titleAndSummary(item.type, item.message), locale, "sub")
    ]),
    `<p class="analysis-note">${escapeHtml(t(locale, "aiSupplement"))}</p>`
  ].filter(Boolean).join("");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// worth_applying had the same tone as strong_fit, collapsing a quarter of the
// taxonomy at the fastest-read point on the panel.
const VERDICT_TONE = { strong_fit: "ok", worth_applying: "go", stretch: "warn", weak_fit: "bad" };

/**
 * The answer to "should I spend an evening on this?", stated before the detail.
 *
 * The verdict word alone states a conclusion the reader cannot check, so the card
 * also carries what it cost to reach: how many required areas the CV evidences,
 * what applying would take, and the one thing that would change the answer.
 */
function renderRecommendation(recommendation, requirements, locale, alignment = null, sourceQuality = null) {
  const quality = sourceQualityNote(sourceQuality, locale);
  // Saying nothing here means the user paid for an analysis and the one thing they
  // came for is silently absent.
  if (!recommendation) {
    return `<section class="result-card verdict tone-muted"><p class="verdict-rationale">${escapeHtml(t(locale, "verdictMissing"))}</p>${quality}</section>`;
  }
  // A conflict between the employer's stated condition and the candidate's own
  // declared position outranks the model's verdict: no amount of skill match makes
  // an application viable when the posting refuses the one thing the reader needs.
  // The downgrade says so on the card — quietly swapping the word would leave a
  // rationale underneath arguing for a verdict that is no longer shown.
  const downgraded = alignment === "conflict" && recommendation.verdict !== "weak_fit";
  const verdict = downgraded ? "weak_fit" : recommendation.verdict;
  const tone = VERDICT_TONE[verdict] || "muted";
  const effort = recommendation.effort
    ? `<span class="tag tag-muted">${escapeHtml(t(locale, effortKey(recommendation.effort)))}</span>`
    : "";
  const decisive = recommendation.decisiveFactor
    ? `<p class="verdict-decisive"><strong>${escapeHtml(t(locale, "decisiveFactor"))}</strong> ${escapeHtml(recommendation.decisiveFactor)}</p>`
    : "";
  // Both halves stay on screen. Code can see that they disagree, not which is right,
  // and silently dropping one would trade a contradiction the reader can weigh for a
  // guess they cannot see. Suppressed under a downgrade: that card is already telling
  // them the verdict above it does not hold.
  const conflict = !downgraded && verdictEffortConflict(recommendation)
    ? `<p class="analysis-notice">${escapeHtml(t(locale, "noticeVerdictEffort"))}</p>`
    : "";
  return `<section class="result-card verdict tone-${escapeHtml(tone)}">
    <div class="verdict-head">
      <span class="verdict-word">${escapeHtml(t(locale, verdictKey(verdict)))}</span>
      ${downgraded ? "" : effort}
    </div>
    ${downgraded
      ? `<p class="verdict-override">${escapeHtml(t(locale, "verdictDowngraded"))}</p>`
      : VERDICT_TONE[verdict] ? `<p class="verdict-sub">${escapeHtml(t(locale, `${verdictKey(verdict)}Sub`))}</p>` : ""}
    ${requirementScore(requirements, locale)}
    ${quality}
    <p class="verdict-headline">${escapeHtml(recommendation.headline)}</p>
    ${recommendation.effortNote ? `<p class="verdict-effort">${escapeHtml(recommendation.effortNote)}</p>` : ""}
    <p class="verdict-rationale">${escapeHtml(recommendation.rationale)}</p>
    ${conflict}
    ${decisive}
  </section>`;
}

/**
 * The count behind the verdict. Without it the reader has to tally the requirement
 * list by hand to find out whether "worth applying" meant five matches or one, and
 * a conclusion they cannot check is a conclusion they cannot act on.
 */
function requirementScore(requirements, locale) {
  const required = (requirements || []).filter((item) => item.level === "required");
  if (!required.length) return "";
  const count = (states) => required.filter((item) => states.includes(item.match)).length;
  const met = count(["strong"]);
  const partial = count(["partial"]);
  const missing = count(["gap", "no_evidence"]);
  // Segments, not a percentage. Collapsing these into one number needs a weight for
  // a partial match, and any weight would be invented — the bar shows exactly what
  // was counted and claims nothing that was not.
  const segment = (value, tone) => (value ? `<span class="coverage-fill tone-${tone}" style="flex:${value}"></span>` : "");
  return `<div class="coverage">
    <div class="coverage-bar">${segment(met, "ok")}${segment(partial, "warn")}${segment(missing, "bad")}</div>
    <p class="verdict-score">${escapeHtml(format(locale, "verdictScore", { total: required.length, met, partial, missing }))}</p>
  </div>`;
}

/**
 * What this analysis could not see, stated where the verdict is read.
 *
 * Only limitations appear here, and only ones that change how far to trust the
 * answer. The job summary above the panel already reports every capture's size,
 * method and confidence on every run; repeating that under the verdict would be
 * furniture. A CV cut off before its last section, or a page most of which was
 * filtered away, is a different thing — it is a reason the analysis below may be
 * describing a hole rather than a fact, and it belongs against the conclusion it
 * qualifies rather than in a stats line the reader has already scrolled past.
 *
 * The report renders the same note from its own stored copy, because that is the
 * version that gets printed and reread when the panel is long gone.
 */
function sourceQualityNote(sourceQuality, locale) {
  if (!sourceQuality) return "";
  const notes = [];
  if (sourceQuality.resumeTruncated) notes.push(t(locale, "qualityCvTruncated"));
  if (Number(sourceQuality.removedLines) >= 20) notes.push(format(locale, "qualityFiltered", { count: Number(sourceQuality.removedLines) }));
  if (sourceQuality.method === "manual_paste") notes.push(t(locale, "qualityPasted"));
  if (!notes.length) return "";
  return `<p class="verdict-quality">${escapeHtml(notes.join(" "))}</p>`;
}

function effortKey(effort) {
  return { quick: "effortQuick", evening: "effortEvening", multi_day: "effortMultiDay", not_closable: "effortNotClosable" }[effort] || "unknown";
}

/**
 * What the employer stated, directly under the verdict: a sponsorship line can
 * make the whole fit question moot, so it must not sit below the fold.
 */
function renderStatedConditions(conditions, locale, declaredStatus) {
  if (!conditions?.length) return "";
  const rows = conditions.map((item) => {
    const alignment = conditionAlignment(item, declaredStatus);
    return `<li class="condition">
    <span class="tag tag-warn">${escapeHtml(t(locale, conditionKey(item.type)))}</span>
    <p>${escapeHtml(item.statement)}</p>
    ${alignment ? `<p class="condition-match tone-${escapeHtml(ALIGNMENT_TONE[alignment])}">${escapeHtml(t(locale, `alignment${alignment[0].toUpperCase()}${alignment.slice(1)}`))}</p>` : ""}
    ${item.question ? `<p class="condition-question"><strong>${escapeHtml(t(locale, "conditionAsk"))}</strong> ${escapeHtml(item.question)}</p>` : ""}
  </li>`;
  }).join("");
  return `<section class="result-card conditions">
    <h3>${escapeHtml(t(locale, "statedConditions"))}</h3>
    <ul class="condition-list">${rows}</ul>
    <p class="meta">${escapeHtml(t(locale, "conditionNote"))}</p>
  </section>`;
}

const ALIGNMENT_TONE = { conflict: "bad", verify: "warn", supported: "ok" };

function conditionKey(type) {
  return {
    sponsorship: "conditionSponsorship", work_authorization: "conditionWorkAuthorization",
    citizenship: "conditionCitizenship", clearance: "conditionClearance",
    onsite_location: "conditionOnsiteLocation", licence: "conditionLicence"
  }[type] || "conditionOther";
}

function verdictKey(verdict) {
  return { strong_fit: "verdictStrongFit", worth_applying: "verdictWorthApplying", stretch: "verdictStretch", weak_fit: "verdictWeakFit" }[verdict] || "unknown";
}

const LEVEL_DIRECTION_KEY = { step_up: "levelStepUp", lateral: "levelLateral", step_down: "levelStepDown", unclear: "levelUnclearScope" };

function renderOverview(overview, locale) {
  if (!overview) return "";
  // Whether the job is a step up, sideways or down is a different question from
  // whether the CV qualifies, and it is the one the requirement list cannot answer.
  const comparison = overview.levelComparison && LEVEL_DIRECTION_KEY[overview.levelComparison.direction]
    ? `<p class="level-compare"><span class="tag tag-muted">${escapeHtml(t(locale, LEVEL_DIRECTION_KEY[overview.levelComparison.direction]))}</span> ${escapeHtml(overview.levelComparison.note)}</p>`
    : "";
  return `<section class="result-card overview">
    ${comparison}
    ${textBlock(t(locale, "jobUnderstanding"), overview.jobFocus)}
    ${textBlock(t(locale, "candidatePositioning"), overview.candidatePositioning)}
    ${textBlock(t(locale, "fitNarrative"), overview.fitNarrative)}
  </section>`;
}

// A hard filter outranks everything: missing one ends the application regardless
// of how the rest of the list scores.
const SCREENING_ORDER = { knockout: 0, weighted: 1, nice_to_have: 2 };
const LEVEL_ORDER = { required: 0, preferred: 1, unclear: 2 };
const MATCH_ORDER = { gap: 0, no_evidence: 1, partial: 2, strong: 3 };
const MATCH_TONE = { strong: "ok", partial: "warn", gap: "bad", no_evidence: "muted" };

function renderRequirements(requirements, locale) {
  if (!requirements?.length) {
    return `<section class="result-card"><h3>${escapeHtml(t(locale, "evidenceRequirements"))}</h3><p class="meta">${escapeHtml(t(locale, "noRequirements"))}</p></section>`;
  }
  // Unmet required items first — that is what decides whether to apply at all.
  const sorted = [...requirements].sort((a, b) =>
    (SCREENING_ORDER[a.screening] ?? 1) - (SCREENING_ORDER[b.screening] ?? 1) ||
    (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
    (MATCH_ORDER[a.match] ?? 9) - (MATCH_ORDER[b.match] ?? 9));

  const rows = sorted.map((item) => {
    const tone = matchTone(item);
    const meta = requirementMeta(item, locale);
    return `<li class="requirement tone-${escapeHtml(tone)}">
      <div class="requirement-head">
        <span class="requirement-name">${escapeHtml(item.name)}</span>
        <span class="tag tag-level">${escapeHtml(t(locale, levelKey(item.level)))}</span>
        <span class="tag tag-${escapeHtml(tone)}">${escapeHtml(t(locale, matchKey(item.match)))}</span>
      </div>
      <p class="meta">${meta ? `${escapeHtml(meta)} · ` : ""}${escapeHtml(item.explanation)}</p>
    </li>`;
  }).join("");

  // The sort above is a screening order, and it is only a screening order while the
  // knockout set stays small. Said here rather than at the top of the card, because
  // it qualifies how to read this list and nothing else.
  const loose = looseKnockouts(requirements);
  const notice = loose
    ? `<p class="analysis-notice">${escapeHtml(format(locale, "noticeLooseKnockouts", { count: loose }))}</p>`
    : "";
  return `<section class="result-card"><h3>${escapeHtml(t(locale, "evidenceRequirements"))}</h3>${notice}<ul class="requirement-list">${rows}</ul></section>`;
}

const PRESENCE_TONE = { verbatim: "ok", variant: "warn", absent: "bad" };
const PRESENCE_KEY = { verbatim: "presenceVerbatim", variant: "presenceVariant", absent: "presenceAbsent" };
const TITLE_DIRECTION_KEY = { same: "titleSame", adjacent: "titleAdjacent", distant: "titleDistant" };
// Absent first, then variant: the order the candidate would fix them in, and the
// order in which they cost the application.
const PRESENCE_ORDER = { absent: 0, variant: 1, verbatim: 2 };

/**
 * Whether the CV's wording survives the search that happens before anyone reads it.
 *
 * Deliberately not a score. The states are the same met/partial/missing vocabulary
 * used everywhere else, because collapsing keyword coverage into a percentage needs
 * a weight per term and no weight here would be anything but invented — the same
 * reason the verdict carries a coverage bar rather than a match figure.
 */
function renderScreening(screening, locale) {
  if (!screening?.terms?.length && !screening?.titleMatch) return "";
  const title = screening.titleMatch && TITLE_DIRECTION_KEY[screening.titleMatch.direction]
    ? `<p class="level-compare"><span class="tag tag-${escapeHtml(screening.titleMatch.direction === "same" ? "ok" : screening.titleMatch.direction === "adjacent" ? "warn" : "bad")}">${escapeHtml(t(locale, TITLE_DIRECTION_KEY[screening.titleMatch.direction]))}</span> ${escapeHtml(screening.titleMatch.note)}</p>`
    : "";
  const sorted = [...(screening.terms || [])].sort((a, b) => (PRESENCE_ORDER[a.presence] ?? 9) - (PRESENCE_ORDER[b.presence] ?? 9));
  const rows = sorted.map((item) => `<li class="screening-term">
      <span class="tag tag-${escapeHtml(PRESENCE_TONE[item.presence] || "muted")}">${escapeHtml(t(locale, PRESENCE_KEY[item.presence] || "unknown"))}</span>
      <span class="screening-word">${escapeHtml(item.term)}</span>
      ${item.cvWording ? `<span class="meta">${escapeHtml(format(locale, "screeningCvWording", { wording: item.cvWording }))}</span>` : ""}
    </li>`).join("");
  const list = rows ? `<ul class="screening-list">${rows}</ul>` : "";
  return `<section class="result-card"><h3>${escapeHtml(t(locale, "screeningHeading"))}</h3>
    <p class="meta">${escapeHtml(t(locale, "screeningNote"))}</p>${title}${list}</section>`;
}

const PRIORITY_ORDER = { now: 0, before_apply: 1, later: 2 };
const PRIORITY_TONE = { now: "bad", before_apply: "warn", later: "muted" };

/**
 * The plan, grouped by when to do it and numbered within each group.
 *
 * One pill per action put a repeated label on its own row above every line, so a
 * list that was already in the right order did not read as an order at all.
 */
function renderActions(actions, locale, uncovered = null) {
  if (!actions?.length) return "";
  const sorted = [...actions].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  const groups = [];
  for (const item of sorted) {
    const priority = PRIORITY_ORDER[item.priority] === undefined ? "later" : item.priority;
    const last = groups[groups.length - 1];
    if (last && last.priority === priority) last.items.push(item);
    else groups.push({ priority, items: [item] });
  }
  const blocks = groups.map((group) => {
    const steps = group.items.map((item, index) => `<li class="action">
      <span class="action-index">${index + 1}</span>
      <p>${escapeHtml(item.action)}</p>
    </li>`).join("");
    return `<h4 class="action-group tone-${escapeHtml(PRIORITY_TONE[group.priority] || "muted")}">${escapeHtml(t(locale, priorityKey(group.priority)))}</h4>
      <ol class="action-list">${steps}</ol>`;
  }).join("");
  // The hint above claims this list is complete. Where it demonstrably is not, saying
  // so beats letting the claim stand — a reader who trusts it stops reading the gaps.
  const notice = uncovered
    ? `<p class="analysis-notice">${escapeHtml(format(locale, "noticeGapActions", uncovered))}</p>`
    : "";
  return `<section class="result-card"><h3>${escapeHtml(t(locale, "suggestedActions"))}</h3>
    <p class="meta">${escapeHtml(t(locale, "actionStepsHint"))}</p>${notice}${blocks}</section>`;
}

/**
 * Whether it is a hard filter and whether the CV's evidence is current. The level
 * itself is a tag beside the name rather than grey prose here: required versus
 * preferred is the structural fact in this list, and it was set in the same 12px
 * muted type as the explanation that follows it.
 */
function requirementMeta(item, locale) {
  const parts = [];
  if (item.screening === "knockout") parts.push(t(locale, "screeningKnockout"));
  if (item.recency === "dated") parts.push(t(locale, "recencyDated"));
  if (item.recency === "undated") parts.push(t(locale, "recencyUndated"));
  return parts.join(" · ");
}

/**
 * A required item the CV never mentions ranks above a partial match in the sort,
 * so drawing it grey made the higher-priority row the quieter one.
 */
function matchTone(item) {
  if (item.match === "no_evidence" && item.level === "required") return "warn";
  return MATCH_TONE[item.match] || "muted";
}

/** Items whose answer sits with one side or the other; absent audience reads as employer. */
function openQuestions(items, audience) {
  return (items || []).filter((item) => (item.answeredBy || "employer") === audience);
}

function renderCards(title, items, renderItem, locale, variant = "") {
  if (!items?.length) return "";
  const rows = items.map((item) => `<li>${renderItem(item)}</li>`).join("");
  return `<section class="result-card ${escapeHtml(variant)}"><h3>${escapeHtml(title)}</h3><ul class="finding-list">${rows}</ul></section>`;
}

function renderGroup(title, sections) {
  const body = sections.filter(Boolean).join("");
  if (!body) return "";
  return `<section class="result-group"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

/**
 * A red flag in the CV, with the honest thing to say about it.
 *
 * Same shape as a gap for the same reason — naming what a screener will hesitate
 * over, without the sentence that answers it, leaves the reader worse off than not
 * being told. Most of these have no fix, only a good answer.
 */
function profileRiskItem(item, locale) {
  const handle = item.howToAddress
    ? `<p class="how-to-close"><strong>${escapeHtml(t(locale, "howToAddress"))}</strong> ${escapeHtml(item.howToAddress)}</p>`
    : "";
  return titleAndSummary(item.title, item.summary, severityTag(item.severity, locale)) + handle;
}

/** A gap is only useful with a way to close it, so they render as one unit. */
function gapItem(item, locale) {
  const label = item.closable === "not_before_apply" ? "notClosableBefore" : "howToClose";
  const close = item.howToClose
    ? `<p class="how-to-close"><strong>${escapeHtml(t(locale, label))}</strong> ${escapeHtml(item.howToClose)}</p>`
    : "";
  return titleAndSummary(item.title, item.summary, severityTag(item.severity, locale)) + close;
}

function titleAndSummary(title, summary, tag = "") {
  return `<div class="item-head"><strong>${escapeHtml(title)}</strong>${tag}</div><p>${escapeHtml(summary)}</p>`;
}

function severityTag(severity, locale) {
  const tone = { material: "bad", moderate: "warn", unknown: "muted" }[severity] || "muted";
  return `<span class="tag tag-${escapeHtml(tone)}">${escapeHtml(t(locale, severityKey(severity)))}</span>`;
}

function textBlock(title, value) {
  if (!value) return "";
  return `<h4>${escapeHtml(title)}</h4><p>${escapeHtml(value)}</p>`;
}

function matchKey(match) {
  return { strong: "matchStrong", partial: "matchPartial", gap: "matchGap", no_evidence: "matchNoEvidence" }[match] || "unknown";
}
function levelKey(level) {
  return { required: "levelRequired", preferred: "levelPreferred", unclear: "levelUnclear" }[level] || "unknown";
}
function priorityKey(priority) {
  return { now: "priorityNow", before_apply: "priorityBeforeApply", later: "priorityLater" }[priority] || "unknown";
}
function severityKey(severity) {
  return { material: "severityMaterial", moderate: "severityModerate", unknown: "severityUnknown" }[severity] || "severityUnknown";
}
