import assert from "node:assert/strict";
import test from "node:test";
import { looseKnockouts, uncoveredGapActions, verdictEffortConflict } from "../src/ui/consistency.js";

/**
 * The rules these enforce were already written into the prompt, and were already
 * followed most of the time. Each test therefore pins the quiet case as hard as the
 * firing one: a check that cries wolf on ordinary output is worse than no check,
 * because the reader learns to skip the line and it stops working on the run that
 * mattered.
 */

test("a strong fit priced above wording is reported, not repaired", () => {
  // The prompt names evening and multi_day; not_closable is strictly worse, since it
  // asserts a knockout that cannot be honestly met at all.
  for (const effort of ["evening", "multi_day", "not_closable"]) {
    assert.equal(verdictEffortConflict({ verdict: "strong_fit", effort }), true, effort);
  }
  assert.equal(verdictEffortConflict({ verdict: "strong_fit", effort: "quick" }), false);
  // Every other verdict may legitimately cost real work — that is what they mean.
  for (const verdict of ["worth_applying", "stretch", "weak_fit"]) {
    assert.equal(verdictEffortConflict({ verdict, effort: "multi_day" }), false, verdict);
  }
});

test("a verdict with no effort at all is not a contradiction", () => {
  // effort is additive: parseRecommendation drops it rather than failing the analysis,
  // so a model that omitted it must not be accused of disagreeing with itself.
  assert.equal(verdictEffortConflict({ verdict: "strong_fit" }), false);
  assert.equal(verdictEffortConflict(null), false);
  assert.equal(verdictEffortConflict({ verdict: "strong_fit", effort: "not-a-level" }), false);
});

test("hard filters are counted, and only an implausible count is called out", () => {
  const knockouts = (count) => Array.from({ length: count }, (_, index) => ({ name: `R${index}`, screening: "knockout" }));
  // Zero or one is the normal shape of a posting; two is unremarkable.
  assert.equal(looseKnockouts(knockouts(0)), 0);
  assert.equal(looseKnockouts(knockouts(1)), 0);
  assert.equal(looseKnockouts(knockouts(2)), 0);
  assert.equal(looseKnockouts(knockouts(3)), 3);
  // Weighted and nice_to_have items never count, however many there are.
  assert.equal(looseKnockouts([...knockouts(2), { screening: "weighted" }, { screening: "nice_to_have" }]), 0);
  // The axis is optional at parse time, so a requirement without it is not a knockout.
  assert.equal(looseKnockouts([{ name: "R" }, { name: "S" }, { name: "T" }, { name: "U" }]), 0);
  assert.equal(looseKnockouts(undefined), 0);
});

test("only the degenerate action shortfall is claimed", () => {
  const gap = (closable, howToClose = "Surface the 2023 port.") => ({ title: "g", closable, howToClose });
  const actions = (count) => Array.from({ length: count }, () => ({ action: "do a thing", priority: "before_apply" }));

  assert.deepEqual(uncoveredGapActions([gap("before_apply"), gap("before_apply")], actions(1)), { gaps: 2, actions: 1 });
  assert.equal(uncoveredGapActions([gap("before_apply"), gap("before_apply")], actions(2)), null);
  assert.equal(uncoveredGapActions([gap("before_apply")], actions(5)), null);

  // A gap with no honest pre-application fix implies no action, and neither does one
  // whose howToClose the parser softened away — counting either would fire on output
  // that is behaving exactly as designed.
  assert.equal(uncoveredGapActions([gap("not_before_apply"), gap("not_before_apply")], actions(0)), null);
  assert.equal(uncoveredGapActions([gap("before_apply", ""), gap("before_apply", "")], actions(0)), null);
  assert.equal(uncoveredGapActions([], []), null);
  assert.equal(uncoveredGapActions(undefined, undefined), null);
});
