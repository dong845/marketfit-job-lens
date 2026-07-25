# Result Schema

This MVP uses JSDoc plus runtime constructors in `src/analysis/schemas.js` rather than TypeScript. Core documented records are `NormalizedJob`, `Requirement`, `CandidateEvidence`, `AuthorizationProfile`, `EvidenceRef`, `Finding`, `MarketClaim`, `InputQuality`, and `AnalysisResult`.

Every material `Finding` has `category`, `status`, `severity`, `claim`, `explanation`, `confidence`, and `evidenceRefs`. Evidence references point to CV text, JD text, profile data, employer evidence, or a dated market source.

`AnalysisResult` exposes `applicationPriority`, `confidence`, `confirmedBlockers`, `uncertaintiesToVerify`, `strongestEvidenceMatches`, `highestImpactGaps`, `recommendedNextAction`, and an optional `fitEstimateRange`. It intentionally has no legacy total score. If inputs are insufficient, extraction needs confirmation, or a hard blocker exists, `fitEstimateRange` is `null`.
