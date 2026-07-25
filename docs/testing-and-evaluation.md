# Testing and Evaluation

Run:

```bash
npm test
npm run lint
```

The Node test suite covers input quality, target-role isolation, negation, weak evidence, sponsorship conflict, clearance blockers, graduate-route representation, Dutch required/preferred distinctions, length-only CV inflation, low extraction confidence, compliance wording, JSON-LD, Greenhouse, Lever, Workday, generic SPA, noisy/empty pages, local PDF validation/text extraction, legacy-storage cleanup, and redaction preview.

`scripts/static-check.mjs` parses every extension and Bridge source module, requires a locally bundled PDF.js parser/worker, permits only loopback `http://127.0.0.1/*` host access, rejects direct remote-provider URLs in network-capable extension code, rejects shell-enabled subprocesses, and rejects the legacy total-score entry point. The Bridge test suite uses fake providers for API payloads and a real loopback listener when the environment allows it.

Before any public release, build a human-labelled, anonymised evaluation set of 100-300 real JDs. Report blocker recall, false-blocker rate, evidence-citation accuracy, extraction-field accuracy, and recommendation agreement. This repository does not claim those metrics yet; synthetic regression coverage is not a substitute for real evaluation.
