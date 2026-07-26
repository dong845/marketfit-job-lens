import assert from "node:assert/strict";
import test from "node:test";
import { conditionAlignment, overallAlignment } from "../src/ui/workAuthorization.js";
import { renderAnalysisHtml } from "../src/ui/analysisView.js";

/**
 * Comparing the employer's stated condition against what the candidate declared.
 *
 * This is arithmetic on two self-reported facts, not a legal determination, and it
 * has to be deterministic: the case where it matters is the one where the job is
 * impossible for the reader, and a model that gets that right most of the time is
 * not good enough. So it lives in code and is pinned here.
 */

const requiresExisting = { type: "work_authorization", stance: "requires_existing", statement: "You must already hold the right to work in the Netherlands." };
const offersSponsorship = { type: "sponsorship", stance: "offers_support", statement: "We sponsor work visas for this role." };
const onsite = { type: "onsite_location", stance: "requires_existing", statement: "Three days a week in the Leiden office." };

test("a condition requiring existing status conflicts with needing sponsorship", () => {
  assert.equal(conditionAlignment(requiresExisting, "needs_sponsorship"), "conflict");
  assert.equal(conditionAlignment(requiresExisting, "authorized"), null);
  assert.equal(conditionAlignment(requiresExisting, "open_work_permit"), null);
});

test("a time-limited route asks rather than concludes", () => {
  // A graduate or temporary route usually IS a right to work, but for a bounded
  // time and sometimes with conditions the posting never names. Calling that a
  // conflict would kill applications the reader could actually have made.
  assert.equal(conditionAlignment(requiresExisting, "student_or_graduate"), "verify");
  assert.equal(conditionAlignment(requiresExisting, "temporary_route"), "verify");
});

test("an employer offering sponsorship is good news, not a problem", () => {
  assert.equal(conditionAlignment(offersSponsorship, "needs_sponsorship"), "supported");
  // Someone who does not need it has nothing to read here.
  assert.equal(conditionAlignment(offersSponsorship, "authorized"), null);
});

test("the default selection never triggers anything", () => {
  // "Unknown" is the shipped default. A downgrade fired from a value the user never
  // chose would be the worst possible failure of this feature.
  for (const condition of [requiresExisting, offersSponsorship, onsite]) {
    assert.equal(conditionAlignment(condition, "unknown"), null);
    assert.equal(conditionAlignment(condition, ""), null);
    assert.equal(conditionAlignment(condition, undefined), null);
  }
});

test("only right-to-work conditions are compared against this selector", () => {
  // An on-site requirement or a clearance is a real condition, but it is not what
  // the work-authorization selector answers, so it must not be judged by it.
  assert.equal(conditionAlignment(onsite, "needs_sponsorship"), null);
  assert.equal(conditionAlignment({ type: "clearance", stance: "requires_existing", statement: "x" }, "needs_sponsorship"), null);
  assert.equal(conditionAlignment({ type: "licence", stance: "requires_existing", statement: "x" }, "needs_sponsorship"), null);
});

test("a stance the model left unclear is not treated as a refusal", () => {
  assert.equal(conditionAlignment({ type: "sponsorship", stance: "unclear", statement: "Visa sponsorship" }, "needs_sponsorship"), null);
  assert.equal(conditionAlignment({ type: "sponsorship", statement: "Visa sponsorship" }, "needs_sponsorship"), null);
});

test("one conflict outranks any number of conditions that look fine", () => {
  assert.equal(overallAlignment([offersSponsorship, requiresExisting], "needs_sponsorship"), "conflict");
  assert.equal(overallAlignment([onsite, offersSponsorship], "needs_sponsorship"), "supported");
  assert.equal(overallAlignment([], "needs_sponsorship"), null);
  assert.equal(overallAlignment(undefined, "needs_sponsorship"), null);
});

function evidenceWith(conditions, verdict = "worth_applying") {
  return {
    recommendation: { verdict, headline: "h", rationale: "r" },
    statedConditions: conditions,
    overview: { jobFocus: "f", candidatePositioning: "p", fitNarrative: "n", evidence: [] },
    requirements: [], strengths: [], gaps: [], risks: [], resumeTailoring: [], interviewFocus: [], uncertainties: [], suggestedActions: []
  };
}

test("a conflict lowers the verdict and says why on the card", () => {
  const html = renderAnalysisHtml(evidenceWith([requiresExisting]), "en", { workAuthorization: "needs_sponsorship" });
  assert.match(html, /result-card verdict tone-bad/);
  assert.match(html, /Probably skip/);
  // Never a silent swap: the model's rationale is still shown below, so the card has
  // to state that the word above it was changed and on what grounds.
  assert.match(html, /verdict-override/);
  assert.match(html, /conflicts with the work authorization you selected/i);
  assert.equal(html.includes("Worth applying"), false);
});

test("the same analysis is untouched when the reader is already authorized", () => {
  const html = renderAnalysisHtml(evidenceWith([requiresExisting]), "en", { workAuthorization: "authorized" });
  assert.match(html, /result-card verdict tone-go/);
  assert.match(html, /Worth applying/);
  assert.equal(html.includes("verdict-override"), false);
});

test("with no declaration the analysis reads exactly as the model returned it", () => {
  const declared = renderAnalysisHtml(evidenceWith([requiresExisting]), "en", { workAuthorization: "unknown" });
  const bare = renderAnalysisHtml(evidenceWith([requiresExisting]), "en");
  assert.equal(declared, bare);
  assert.equal(bare.includes("verdict-override"), false);
  assert.equal(bare.includes("condition-match"), false);
});

test("each condition carries its own verdict against the declaration, in both languages", () => {
  const zh = renderAnalysisHtml(evidenceWith([offersSponsorship]), "zh", { workAuthorization: "needs_sponsorship" });
  assert.match(zh, /condition-match tone-ok/);
  assert.match(zh, /雇主明确提供这一项/);
  const en = renderAnalysisHtml(evidenceWith([requiresExisting]), "en", { workAuthorization: "student_or_graduate" });
  assert.match(en, /condition-match tone-warn/);
  assert.match(en, /Ask the employer before applying/);
});
