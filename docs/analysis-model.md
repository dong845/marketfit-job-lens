# Analysis Model

The interactive side-panel flow is AI-first as of version 0.5: it captures the current job only when the user explicitly starts AI analysis, and it renders the cited AI result rather than a separate deterministic decision. The deterministic modules below remain documented and regression-tested as conservative internal evidence utilities; they are not exposed as a second user-facing analysis action.

## Decision order

1. Assess CV and JD quality. Missing or short inputs return `insufficient`; no estimate is shown.
2. Require confirmation when extraction confidence is low; no estimate is shown.
3. Evaluate work authorization, active clearance, mandatory language, licence/registration, and explicit work-model conflicts independently from fit.
4. Match only CV/profile evidence to explicit JD requirements. `targetRole` is used only as a career-direction preference.
5. Use a range only when there is enough evidence and no hard blocker. The range is labelled as an evidence-based fit estimate, not interview likelihood.

## Evidence semantics

CV evidence is classified as negative, mentioned, learning, applied, or outcome evidence. Examples: `I do not have Kubernetes experience` is negative evidence; a course is weak learning evidence; a project or work verb is applied evidence; an outcome plus a measurable result is outcome evidence. A bare keyword does not become verified expertise.

The local matcher recognizes a small, explicit alias set for common technical terms, including `k8s`/Kubernetes, RAG/retrieval-augmented generation, LLM/large language model, and Go/Golang. It does not use embedding similarity or infer unmentioned transferable experience. AI analysis is the full-CV/full-JD semantic interpretation path; its output is accepted only when every cited quote is present verbatim in the submitted CV or job text.

JD units are classified as required, preferred, responsibility, benefit, or context. Required gaps are high-impact gaps; preferred gaps are competitiveness notes and never hard blockers.

## Authorization and compliance

The sponsorship state machine is `explicit_no_sponsorship`, `existing_authorization_required`, `explicit_sponsorship`, or `ambiguous`. Contradictory positive and restrictive wording becomes `conflicting_evidence` and yields `verify_first`. A student/graduate status is a route to verify, not an unknown status. The extension does not decide OPT, STEM OPT, Graduate Route, orientation year, PGWP, or any other legal eligibility.

Potential compliance-sensitive wording is shown separately for protected-attribute, immigration, security/export-control, and language-necessity questions. It never lowers a candidate score based on identity.

## Limits

The local rules do not infer unstated requirements, validate employer registries, verify visa eligibility, or predict interviews. Deadline urgency is supported only when a structured source supplies it; the current visible-page MVP does not claim to detect every deadline reliably.
