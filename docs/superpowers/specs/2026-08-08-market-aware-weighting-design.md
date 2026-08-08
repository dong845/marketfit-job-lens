# Market-aware screening conventions

Date: 2026-08-08
Status: approved, not yet implemented

## The problem

Every weight in the analysis is derived from the posting's own text, and from
nothing else.

`requirement.screening` (`src/ai/schema.js:205`) is the only weighting axis, and
the rule that sets it (`src/ai/prompts.js:59-60`) reads the posting: a condition
counts as a knockout only where the posting says candidates without it will not
be considered. `recommendation.verdict` is then a function of the knockouts and
the weighted core (`src/ai/prompts.js:61`). `screening.titleMatch`, `recency`,
`gaps` and `effort` all follow from the same text.

`job.location` reaches the model but is consumed exactly once
(`src/ai/prompts.js:109-111`), and what it governs is **CV format convention** —
length, whether a photo or date of birth is normal, how dates are written. Not
what the market weighs. `statedConditions` (`src/ai/prompts.js:95-96`) is
market-adjacent but only repeats the employer's own sentence.

The candidate payload carries one field, `workAuthorization`
(`src/ai/schema.js:492-493`, `src/sidepanel/sidepanel.js:572`). There is no
notion of a target market anywhere.

The consequence: the same CV against two postings with similar wording produces
similar analyses whether the job is in Shanghai or Leiden, even though the two
markets screen on materially different things. A recruiter in mainland China
filtering for a research role searches venue names the posting never printed; a
Dutch employer's "Dutch is a plus" often describes a team that works in Dutch.
Neither is visible to an analysis that only reads the posting.

## What this adds

One new, clearly separated block: **the screening conventions of the employer's
market that the posting did not state**, and where this CV stands against each.

## What this deliberately does not do

- **It does not touch the verdict.** `requirements`, `screening`, `verdict` and
  `effort` keep their current instructions unchanged. `marketNotes` does not feed
  `requirementScore` and does not enter any check in `src/ui/consistency.js`.
  A market prior has no evidence block behind it, and the verdict is the one
  output that must stay fully JD-derived.
- **It does not touch protected traits.** Age, nationality, country of education
  and institutional prestige stay banned exactly as `src/ai/prompts.js:14-15`
  and `:77` state today. The conventions table covers only what can be discussed
  legitimately: internships and project evidence, publication record, language,
  years of experience, credential recognition, application customs.
- **It does not weaken the evidence contract.** See below — the design was chosen
  so that `AGENT_SYSTEM_POLICY:17` needs no amendment.

## Architecture

New directory `src/market/`, alongside `src/privacy/` and `src/extraction/`:

- `src/market/resolveMarket.js` — pure `resolveMarket(location) → marketKey | null`
- `src/market/conventions.js` — the conventions table; the one auditable asset here

### resolveMarket

Conservative by construction: it returns `null` wherever it is not certain.

- Reads `job.location` only, never anything about the candidate. This principle is
  already established at `src/ai/prompts.js:110` ("the market whose CV conventions
  matter is the employer's") and is reused rather than restated.
- Matches in both languages: `Leiden, NL` / `荷兰` / `Amsterdam` → `nl_weu`;
  `Shanghai, China` / `上海` / `深圳` → `cn`.
- Two different markets in one string → `null`. Do not guess.
- `Remote` / `Hybrid` with no place name → `null`.
- Anything outside the first two markets → `null`.

A `null` result means nothing happens anywhere: no instruction in the prompt, no
field expected in the reply, no block in the UI. This matches how the codebase
already treats absent inputs — the work-authorization and location instructions
are omitted from the request rather than sent with nothing to act on
(`src/ai/prompts.js:97-111`).

### Data flow

```
job.location
  └─ resolveMarket() ──> marketKey | null
        │
        ├─ null → nothing is emitted anywhere
        │
        └─ hit → conventionsFor(marketKey)
              ├─ prompts.js      conditional instruction block, reusing the
              │                  existing ...(cond ? [...] : []) pattern
              ├─ schema.js       validates conventionId against the injected id
              │                  set; drops any note that does not match
              └─ analysisView.js renders the convention text verbatim from the
                                 table, keyed by marketKey + conventionId
```

### The convention text never makes a round trip through the model

The model receives the English note only so it can judge where this CV stands.
The reader is shown the table's own text. Both come from the same entry, but the
render path does not pass through the model's output, so the model cannot
strengthen a "usually" into a "must", cannot attach a number, and cannot invent
an entry.

This is what keeps the evidence contract intact. The only sentence the model
authors in this block is `cvStanding`, and that must cite CV blocks like every
other analytical statement. **`AGENT_SYSTEM_POLICY:17` therefore needs no
exemption and no rewording.**

## The conventions table

```js
{
  id: "cn-venue-names",
  text: {                 // rendered to the reader verbatim; never model-touched
    en: "...",
    zh: "..."
  },
  appliesWhen: "...",     // English; the model's test for whether to answer at all
  added: "2026-08-08",
  why: "..."              // maintainer's rationale, for human review
}
```

First batch — qualitative only; no percentages, no counts, no protected traits.

**`cn`**

- Named venues are search terms in themselves for research and algorithm roles;
  screening filters on the venue string even when the posting never prints one.
- For early-career roles, internships at named companies are weighed as their own
  line rather than folded into general experience.
- Verifiable project evidence (public repositories, competition placings) carries
  part of the load that references carry in Western European hiring.
- A posting written in Chinese generally expects a Chinese-language CV.

**`nl_weu`**

- "Dutch is a plus" often describes a team whose working language is Dutch; this
  is a question for the employer rather than something to infer.
- Most applications are expected to carry a motivation letter even when the
  posting does not request one.
- For regulated roles, recognition of a foreign degree is a separate procedure
  from holding the degree.
- References are actually contacted at offer stage.

Work authorization is deliberately absent from `nl_weu`: it is already covered by
`statedConditions` (`src/ai/prompts.js:95-96`) and by
`uncertainties.answeredBy=employer`. Adding it here would state one finding three
times, which is the failure mode `src/ai/prompts.js:41-53` exists to prevent.

## Schema

New optional top-level field in `AGENT_EVIDENCE_SCHEMA`:

```js
marketNotes: [
  { conventionId: "cn-venue-names",
    cvStanding: "…",                 // one to two sentences, output language
    evidence: [{ ref: "CV-012" }] }
]
```

`conventionId` and `cvStanding` are both required on a note; `evidence` may be
empty and is resolved back to real blocks by the same pass that resolves every
other evidence array, with unresolvable refs dropped.

`parseAgentEvidence` validates `conventionId` against the id set injected into
*this* request and drops any note that does not match. This is the mechanism the
codebase already uses for evidence refs — an unresolvable ref is dropped rather
than displayed (`docs/analysis-model.md:24`). A duplicate id keeps the first note
only. A missing field or an empty array is a valid, common answer.

The model does not return the market key. Code decided it; a second copy is a
second thing that can disagree.

## Prompt

One conditional instruction block, emitted only when `resolveMarket` returns a
market. It must state four things:

1. Answer a convention only where its `appliesWhen` holds; return nothing for the
   others. An empty array is a correct answer.
2. Prefer the conventions where this CV stands weakly or where its standing
   cannot be told. Without this the model picks whichever convention lets it say
   something pleasant, and the block becomes reassurance.
3. `cvStanding` cites CV blocks. Where the CV shows nothing, say the CV does not
   show it — never infer that the candidate lacks the thing. This mirrors the rule
   already in force for gaps and for `screening.presence=absent`
   (`src/ai/prompts.js:87-91`).
4. `conventionId` is a machine token of the same class as a block ID: it belongs
   in its own field and must never appear in a sentence the reader sees
   (`src/ai/prompts.js:138`).

### Two boundaries against restating one finding twice

- **Against `src/ai/prompts.js:109-111`** — that instruction owns CV *format*
  convention (length, photo, date style) and produces a `resumeTailoring` item.
  This block owns *screening* convention: what the market actually weighs. The
  instruction says so explicitly; layout does not appear here.
- **Against `src/ai/prompts.js:134`** — `suggestedActions` is the single
  authoritative to-do list. `marketNotes` joins the enumeration in that sentence,
  so any action a market note implies appears there exactly once, and the note
  itself carries the reason rather than a second imperative.

## UI

Rendered in `src/ui/analysisView.js`, inserted after `renderScreening`
(`src/ui/analysisView.js:39`). `screening` answers "will this CV be read at all"
from the posting's side; market convention answers the same question from the
market's side, so they read together.

- New i18n key `marketConventions` — "这个市场还会看什么" / "What this market
  also weighs".
- A fixed line at the top of the card: **"以下是{市场}的通行招聘惯例，不来自本次
  招聘启事"** / the English equivalent. Not politeness — every other section on
  the page is JD-derived, so the reader has every reason to assume this one is
  too.
- Each entry: the convention text (verbatim from the table), then
  "你的位置：" + `cvStanding`.
- The report page shares `renderAnalysisHtml` (`src/report/report.js:55`) and
  inherits this automatically.

## Testing

- **`tests/market.test.mjs`** (new), table-driven over `resolveMarket`:
  `Leiden, NL` / `Amsterdam` / `荷兰` → `nl_weu`; `Shanghai, China` / `上海` /
  `深圳` → `cn`; `Remote` → null; `Remote — Shanghai or Amsterdam` → null;
  `""` → null; `Toronto, Canada` → null.
- **`tests/schema.test.mjs`**: an unknown `conventionId` is dropped; a valid one
  survives; a missing `marketNotes` parses; the instruction and the id set appear
  in the prompt only on a resolved market and are entirely absent otherwise —
  following the existing conditional-instruction test at `tests/schema.test.mjs:356`.
- **`tests/analysisView.test.mjs`**: no block at all without `marketNotes`; the
  "not from this posting" line is always present when the block renders; the
  convention text rendered comes from the table and not from the model's reply.
- **`scripts/static-check.mjs`**: fail the build if any convention `text` contains
  a percentage or a numeric statistic. The script already fails the build on a
  reintroduced keyword matcher; this puts "never fabricate a statistic" on the
  same footing.

### The guardrail that does not exist

Nothing automated can check whether a convention is *true*. `why` and `added`
exist so a person can review it, not so a machine can verify it. That is the
reason the first batch covers only the two markets the author applies in and
returns `null` everywhere else: a wrong market claim is worse than no market
claim, and it would look exactly like a right one on screen.
