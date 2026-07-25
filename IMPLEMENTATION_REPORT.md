# Implementation Report

## Architecture

- `src/extraction`: normalised job schema, JSON-LD parser, Greenhouse/Lever/Workday/generic-SPA selection, and semantic fallback.
- `src/profile`: locally bundled PDF.js extraction, PDF safety limits, authorization schema, and CV evidence semantics.
- `src/analysis`: input quality, requirement classification, sponsorship state machine, hard blockers, decision policy, and result schema.
- `src/market`: dated claim store and a local-only employer-evidence interface.
- `src/privacy`: v2 storage lifecycle and redaction preview.
- `src/bridge` and `bridge/src`: optional origin-paired loopback Bridge client/server, provider adapters, and strict evidence schema.
- `src/ui`: English/Chinese message structure, accessible side-panel rendering, findings/evidence details, profile/privacy controls.

## P0 status

| Item | Status |
| --- | --- |
| Insufficient evidence without a score | Complete |
| Target-role evidence isolation | Complete |
| Negation, learning, applied, outcome semantics | Complete local rule set |
| Required vs preferred classification | Complete local rule set |
| Sponsorship conflict/restrictive policy | Complete |
| Independent hard blockers | Complete for authorization, clearance, language, licence, and explicit remote-only conflict |
| Structured authorization profile and graduate route | Complete, with legal-route outcome deliberately unknown |
| Compliance-sensitive wording and disclaimer | Complete |

## P1 status

| Item | Status |
| --- | --- |
| JSON-LD, ATS, semantic, generic, manual extraction | Complete local adapters/fallbacks |
| Decision-first output and optional range | Complete |
| Transparent application priority | Complete; deadline input remains a conservative extension point |
| Dated market claims | Complete for seven initial markets |
| Privacy controls | Complete local MVP |
| Local PDF CV flow | Complete: 15 MB/40-page guardrails, locally bundled PDF.js parser, no PDF/CV persistence, and image-only PDF warning |
| Current-tab job flow | Complete: the single AI analysis action captures the active job tab; manual JD fields and the separate rule-analysis action are removed from the UI |
| AI job analysis | Complete development/power-user Bridge for Codex CLI, Claude Code, OpenAI API, and Anthropic API; full-CV/full-JD cited role analysis, strengths, gaps, risks, tailoring, and interview preparation; API providers expose a session-only key and model choice only after selection |
| Accessible concise side panel and evidence drawers | Complete |
| Full empirical market/employer verification | Not implemented: deliberately returns unknown/manual verification |
| Real anonymised golden dataset | Not implemented; required before public claims of accuracy |

## Test evidence

At the PDF/current-tab checkpoint, `npm test` covers PDF validation, local page-text extraction semantics, image-only-PDF rejection, current-tab injection, failure recovery, precise per-site permission requests, technical-alias matching, and cited AI-output validation in addition to the existing analysis/Bridge cases. `npm run lint` parses extension/Bridge modules, requires the locally bundled PDF parser/worker, checks loopback-only fixed host access plus per-site optional web access, rejects direct remote provider calls from the extension, and checks subprocess shell use. Re-run both commands after any release change.

## Known limitations

- Capture is limited to the visible active page. On custom/low-confidence sites, open the full job page and retry; manual JD editing is deliberately not exposed in this workflow.
- Scanned, password-protected, corrupted, or image-only resumes are not supported; upload a text-based, unlocked PDF.
- ATS detection is adapter selection plus semantic fallback, not a complete DOM contract for every employer site.
- Market claim URLs are official context sources, but rules/statistics can become stale and require refresh.
- No legal, immigration, employer-registry, or visa-eligibility conclusion is made.
- AI enhancement is a local development/power-user Bridge, not a production Native Messaging integration; it requires fresh Chrome Web Store and privacy review before public release.
- No outcome calibration, applicant-tracking, automatic action, provider fallback, or legal/immigration conclusion exists.

## Recommended next steps

1. Validate extraction against anonymised real examples and tighten site-specific adapters.
2. Establish a claim-refresh owner and automated stale-claim report.
3. Replace the development loopback Bridge with Native Messaging before broad public distribution, then complete privacy/legal review.
4. Run a small consented beta before Chrome Web Store publication.
