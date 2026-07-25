import assert from "node:assert/strict";
import { analyzeJobFit } from "../src/shared/analyzer.js";
import { MARKET_IDS, getMarketClaims } from "../src/market/claimStore.js";

assert.equal(MARKET_IDS.length, 7);
for (const marketId of MARKET_IDS) {
  const claims = getMarketClaims(marketId, new Date("2026-07-23"));
  assert.ok(claims.length >= 3, `${marketId} needs dated market claims`);
  assert.ok(claims.every((claim) => claim.sourceUrl && claim.expiresAt), `${marketId} claims need sources and expiry`);
}

const result = analyzeJobFit({
  marketId: "NL",
  profile: {
    cvText: "Experience\nBuilt an AI SaaS product roadmap, led user research, and increased activation 18% through experiments and metrics.",
    targetRole: "AI Product Manager",
    authorization: { statusType: "needs_sponsorship", futureSponsorshipNeed: true },
    languages: "English C1"
  },
  jobText: "AI Product Manager in Amsterdam. Requirements: Product roadmap required. User research required. English required. Dutch preferred. Visa sponsorship available for qualified candidates. You will own product strategy, experiments, and launch outcomes."
});

assert.notEqual(result.applicationPriority, "insufficient");
assert.equal(result.sponsorship.state, "explicit_sponsorship");
assert.ok(result.findings.every((finding) => finding.category && finding.status && finding.claim && Array.isArray(finding.evidenceRefs)));
assert.ok(result.disclaimer.includes("not legal"));

console.log("Smoke tests passed");
