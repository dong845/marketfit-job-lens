import { t } from "./i18n.js";

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
 * Ordered for the decision this panel exists to support: what the role is, how the
 * CV lines up requirement by requirement, then what to actually do about it.
 * Evidence sits in disclosures rather than inline, so quotes are one click away
 * instead of burying every conclusion they support.
 */
export function renderAnalysisHtml(evidence, locale) {
  if (!evidence) return "";
  return [
    renderRecommendation(evidence.recommendation, locale),
    `<p class="analysis-note">${escapeHtml(t(locale, "aiSupplement"))}</p>`,
    renderOverview(evidence.overview, locale),
    renderRequirements(evidence.requirements, locale),
    renderCards(t(locale, "aiStrengths"), evidence.strengths, (item) => titleAndSummary(item.title, item.summary), locale),
    renderCards(t(locale, "aiGaps"), evidence.gaps, (item) => gapItem(item, locale), locale),
    renderActions(evidence.suggestedActions, locale),
    renderGroup(t(locale, "sectionPrepare"), [
      renderCards(t(locale, "resumeTailoring"), evidence.resumeTailoring, (item) => titleAndSummary(item.target, item.recommendation), locale, "sub"),
      renderCards(t(locale, "interviewFocus"), evidence.interviewFocus, (item) => titleAndSummary(item.question, item.rationale), locale, "sub")
    ]),
    renderGroup(t(locale, "sectionVerify"), [
      renderCards(t(locale, "aiRisks"), evidence.risks, (item) => titleAndSummary(item.title, item.summary, severityTag(item.severity, locale)), locale, "sub"),
      renderCards(t(locale, "employerQuestions"), evidence.uncertainties, (item) => titleAndSummary(item.type, item.message), locale, "sub")
    ])
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

const VERDICT_TONE = { strong_fit: "ok", worth_applying: "ok", stretch: "warn", weak_fit: "bad" };

/** The answer to "should I spend an evening on this?", stated before the detail. */
function renderRecommendation(recommendation, locale) {
  if (!recommendation) return "";
  const tone = VERDICT_TONE[recommendation.verdict] || "muted";
  return `<section class="result-card verdict tone-${escapeHtml(tone)}">
    <div class="verdict-head">
      <span class="tag tag-${escapeHtml(tone)}">${escapeHtml(t(locale, verdictKey(recommendation.verdict)))}</span>
    </div>
    <p class="verdict-headline">${escapeHtml(recommendation.headline)}</p>
    <p class="verdict-rationale">${escapeHtml(recommendation.rationale)}</p>
  </section>`;
}

function verdictKey(verdict) {
  return { strong_fit: "verdictStrongFit", worth_applying: "verdictWorthApplying", stretch: "verdictStretch", weak_fit: "verdictWeakFit" }[verdict] || "unknown";
}

function renderOverview(overview, locale) {
  if (!overview) return "";
  return `<section class="result-card overview">
    ${textBlock(t(locale, "jobUnderstanding"), overview.jobFocus)}
    ${textBlock(t(locale, "candidatePositioning"), overview.candidatePositioning)}
    ${textBlock(t(locale, "fitNarrative"), overview.fitNarrative)}
  </section>`;
}

const LEVEL_ORDER = { required: 0, preferred: 1, unclear: 2 };
const MATCH_ORDER = { gap: 0, no_evidence: 1, partial: 2, strong: 3 };
const MATCH_TONE = { strong: "ok", partial: "warn", gap: "bad", no_evidence: "muted" };

function renderRequirements(requirements, locale) {
  if (!requirements?.length) {
    return `<section class="result-card"><h3>${escapeHtml(t(locale, "evidenceRequirements"))}</h3><p class="meta">${escapeHtml(t(locale, "noRequirements"))}</p></section>`;
  }
  // Unmet required items first — that is what decides whether to apply at all.
  const sorted = [...requirements].sort((a, b) =>
    (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
    (MATCH_ORDER[a.match] ?? 9) - (MATCH_ORDER[b.match] ?? 9));

  const rows = sorted.map((item) => {
    const tone = MATCH_TONE[item.match] || "muted";
    return `<li class="requirement tone-${escapeHtml(tone)}">
      <div class="requirement-head">
        <span class="requirement-name">${escapeHtml(item.name)}</span>
        <span class="tag tag-${escapeHtml(tone)}">${escapeHtml(t(locale, matchKey(item.match)))}</span>
      </div>
      <p class="meta">${escapeHtml(t(locale, levelKey(item.level)))} · ${escapeHtml(item.explanation)}</p>
    </li>`;
  }).join("");

  return `<section class="result-card"><h3>${escapeHtml(t(locale, "evidenceRequirements"))}</h3><ul class="requirement-list">${rows}</ul></section>`;
}

const PRIORITY_ORDER = { now: 0, before_apply: 1, later: 2 };
const PRIORITY_TONE = { now: "bad", before_apply: "warn", later: "muted" };

function renderActions(actions, locale) {
  if (!actions?.length) return "";
  const sorted = [...actions].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  const rows = sorted.map((item) => `<li class="action">
    <span class="tag tag-${escapeHtml(PRIORITY_TONE[item.priority] || "muted")}">${escapeHtml(t(locale, priorityKey(item.priority)))}</span>
    <p>${escapeHtml(item.action)}</p>
  </li>`).join("");
  return `<section class="result-card"><h3>${escapeHtml(t(locale, "suggestedActions"))}</h3><ul class="action-list">${rows}</ul></section>`;
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

/** A gap is only useful with a way to close it, so they render as one unit. */
function gapItem(item, locale) {
  const close = item.howToClose
    ? `<p class="how-to-close"><strong>${escapeHtml(t(locale, "howToClose"))}</strong> ${escapeHtml(item.howToClose)}</p>`
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
