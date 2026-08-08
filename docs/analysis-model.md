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
2. **Evidence blocks** — `src/ai/evidenceBlocks.js` splits the CV and job text
   into addressable `CV-nnn` / `JD-nnn` chunks. The model receives these blocks
   and may cite only their IDs, so it cannot invent a quote.
3. **Market** — `src/market/resolveMarket.js` resolves `job.location` to a market
   key or to `null`. On a hit, that market's conventions are added to the request
   and become the only `conventionId` values the parser will accept back.
4. **Request** — `src/ai/prompts.js` builds the prompt; the untrusted CV and
   job text are fenced and labelled as data, never instructions.
5. **Validation** — `src/ai/schema.js` re-validates the reply: enum states,
   list sizes, string lengths, and every evidence ref resolved back to a real
   block. An unresolvable ref is dropped rather than displayed.
6. **Render** — `src/ui/analysisView.js` turns validated evidence into markup:
   the verdict, the requirement-by-requirement comparison, the gaps and how to
   close them, and what to do next.

Source quotes are **not** rendered on either surface. Step 2 is what keeps the
model honest — it may only cite block IDs that exist, and step 4 resolves each
one back to real text and drops the rest — and that holds whether or not the
quotes are printed. Printing them as well put a block of source text under every
conclusion and buried the analysis.

## Market conventions

One section of the analysis is not derived from the CV or the posting.
`src/market/resolveMarket.js` maps `job.location` to a market key, and
`src/market/conventions.js` holds a hand-maintained, dated table of what that
market screens on that postings routinely leave unsaid. When a market resolves,
those conventions are injected into the prompt; the model returns only
`{conventionId, cvStanding, evidence}`, and `parseAgentEvidence` drops any note
whose `conventionId` was not injected on this request — the same mechanism that
drops an unresolvable evidence ref.

The convention text never makes a round trip through the model. The reader is
shown the table's own wording, so the model cannot strengthen a "usually" into a
"must", attach a number, or invent an entry. The only sentence it authors here is
`cvStanding`, which cites CV blocks like every other analytical statement — which
is why `AGENT_SYSTEM_POLICY` needs no exemption for this section.

Nothing in this section reaches the verdict. `requirements`, `screening`,
`verdict` and `effort` stay derived from the posting alone, and `marketNotes`
feeds neither `requirementScore` nor any check in `src/ui/consistency.js`.

`resolveMarket` returns `null` for an unrecognised location, a location naming two
markets, and any market outside the table — and a `null` means the feature says
nothing at all. Conventions carry no numbers (`scripts/static-check.mjs` fails the
build on a digit in one) and name no protected trait. Nothing automated can check
that a convention is *true*; `why` and `added` exist so a person can review it,
which is why the table covers only markets the maintainer can verify from
experience.

### Known limitation: the resolver can still name the wrong market

`resolveMarket` matches place names, and it has no notion that a place name may
exist in more than one country. Guards exist for the collisions that are known —
Hong Kong, Taiwan and Macau never resolve to the mainland; a conflicting country
name or a region abbreviation in a delimiter slot suppresses a match; and an
own-country token that is also a foreign place name (`China`, `Nederland`, `NL`,
`Holland`) only counts when the string carries independent corroboration. Each of
those is covered by a case in `tests/market.test.mjs`.

What remains uncovered is any city in the pattern lists that is also a city
somewhere else. Verified examples that resolve to the Dutch market and should
not: `Utrecht, South Africa`, `Delft, Cape Town, South Africa`,
`Groningen, Suriname`, `Wageningen, Suriname`, and strings where an ambiguous
city launders corroboration for an ambiguous country token, such as
`St. Johns, NL — Amsterdam Ave office`. A durable fix needs corroboration on
city matches too, not only on country tokens — or a real gazetteer.

This matters more here than a mis-parse elsewhere in the pipeline would. Every
other conclusion the panel shows cites source text the reader can check; a market
card cites nothing, so a wrong market reads exactly like a right one. Anyone
extending the pattern lists should assume a new city name collides until they
have checked that it does not.

## Schemas

`AGENT_EVIDENCE_SCHEMA` in `src/ai/schema.js` is the single source of truth
for the result shape and its bounds. Two derivations exist:

- **Full schema** (`outputSchemaJson`) documents the contract in one place.
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
