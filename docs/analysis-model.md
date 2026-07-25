# Analysis Model

Every conclusion the panel shows is produced by the selected model and tied to
quoted source text. There is no second, local scoring path — an earlier keyword
matcher was removed rather than kept as a fallback, because a heuristic presented
as career advice is worse than no answer. `scripts/static-check.mjs` fails the
build if one is reintroduced.

## Pipeline

1. **Capture** — `src/extraction/tabCapture.js` injects a self-contained extractor
   into the active tab, polls until the text stabilises, and keeps the best frame.
   `src/extraction/extractJob.js` prefers Schema.org `JobPosting` JSON-LD, then
   semantic selectors, then page text, and scores the result.
   `validateCapturedJob` decides whether the text is a usable job description at
   all; nothing is sent to a provider until it is.
2. **Evidence blocks** — `bridge/src/evidenceBlocks.js` splits the CV and job text
   into addressable `CV-nnn` / `JD-nnn` chunks. The model receives these blocks
   and may cite only their IDs, so it cannot invent a quote.
3. **Request** — `bridge/src/prompts.js` builds the prompt; the untrusted CV and
   job text are fenced and labelled as data, never instructions.
4. **Validation** — `bridge/src/schema.js` re-validates the reply: enum states,
   list sizes, string lengths, and every evidence ref resolved back to a real
   block. An unresolvable ref is dropped rather than displayed.
5. **Render** — `src/ui/analysisView.js` turns validated evidence into markup.

## Schemas

`AGENT_EVIDENCE_SCHEMA` in `bridge/src/schema.js` is the single source of truth
for the result shape and its bounds. Two derivations exist:

- **Full schema** (`outputSchemaJson`) goes to CLI providers, which accept the
  constraint keywords.
- **Wire schema** (`wireSchemaJson`) strips `minLength`, `maxLength`, `pattern`,
  `minItems`, and `maxItems`, which OpenAI strict mode and Anthropic structured
  outputs restrict. Nothing is lost: `parseAgentEvidence` enforces those bounds at
  parse time regardless of what the provider was told.

`src/extraction/schema.js` defines `NormalizedJob`. It carries only fields that
are actually consumed — the capture path deliberately does not parse requirements
into structured records, because the model reads the raw text.

## What it does not do

It does not predict interviews or offers, decide visa eligibility or legal status,
or reason about protected traits. `AGENT_SYSTEM_POLICY` states these limits to the
model, and the panel repeats them to the user next to every result.
