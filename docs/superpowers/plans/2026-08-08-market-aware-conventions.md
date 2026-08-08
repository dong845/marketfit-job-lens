# Market-Aware Screening Conventions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the reader the screening conventions of the employer's market that the posting never states, and where their CV stands against each — without touching the verdict and without letting the model author the market claim.

**Architecture:** A new `src/market/` module resolves `job.location` to a market key (or `null`) and owns a hand-maintained conventions table. When a market resolves, the conventions are injected into the prompt; the model replies with `{conventionId, cvStanding, evidence[]}` only, and `parseAgentEvidence` drops any note whose `conventionId` was not injected on this request. The reader is shown the table's own text, so the market claim never makes a round trip through the model.

**Tech Stack:** Vanilla ES modules, `node --test` (Node ≥20), no build step, no dependencies.

## Global Constraints

- **The verdict is untouched.** No task may modify the `requirements`, `screening`, `verdict` or `effort` instructions in `src/ai/prompts.js`, and `marketNotes` must not feed `requirementScore` or any check in `src/ui/consistency.js`.
- **Protected traits stay banned.** No convention may reference age, nationality, country of education, gender, or institutional prestige. `src/ai/prompts.js:14-15` and `:77` stand unchanged.
- **`AGENT_SYSTEM_POLICY` is not edited.** The only sentence the model authors in this block is `cvStanding`, and it cites CV blocks like every other analytical statement.
- **Convention text is never model-authored.** `text.en` / `text.zh` reach the reader verbatim from `src/market/conventions.js`.
- **No numbers in conventions.** Convention `text` and `appliesWhen` must contain no digit and no `%`. Enforced by `scripts/static-check.mjs` in Task 1.
- **Field ceilings come from `FIELD_LIMITS`**, never from literals — `scripts/static-check.mjs` already fails the build on a bare `maxLength: <digits>` in `src/ai/schema.js`.
- **Verification command for every task:** `npm run check` (runs `static-check.mjs`, then `node --test tests/*.test.mjs`, then `smoke-test.mjs`, then `audit.mjs`).
  - **Exception, Task 1 only.** `scripts/audit.mjs:233-243` walks imports from the three extension entry points and fails on any unreachable `src/**/*.js`. Task 1 creates `src/market/` before anything imports it, so `audit.mjs` reports `unreachable src modules: src/market/conventions.js, src/market/resolveMarket.js` and nothing else. That is expected and self-resolving: Task 2 imports both from `src/ai/schema.js`, which is reachable from `src/sidepanel/sidepanel.js`. Task 1 therefore verifies with `npm run lint && npm test`, and **Task 2 must run the full `npm run check` and confirm the unreachable-modules failure is gone.** Any *other* audit failure at Task 1 is a real defect.
- **Commit locally only.** Do not `git push`. Do not `git add -A` — stage the named paths.
- Work happens on branch `market-aware-conventions`, which already carries the design doc at `docs/superpowers/specs/2026-08-08-market-aware-weighting-design.md`.

### Deviation from the spec, decided during planning

The spec said the view would key convention text by `marketKey + conventionId`. Instead every convention id is globally unique and its entry carries its own `market`, so a flat `conventionById(id)` lookup suffices and no market key has to be threaded into `renderAnalysisHtml`. Strictly simpler, same behaviour.

---

### Task 1: The market module and its conventions table

The one auditable asset in this feature, plus the resolver that decides whether any of it applies. Both ship together because a convention id that no market resolves to is dead code, and a market key with no conventions renders an empty card.

**Files:**
- Create: `src/market/conventions.js`
- Create: `src/market/resolveMarket.js`
- Create: `tests/market.test.mjs`
- Modify: `scripts/static-check.mjs` (append at end of file)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `resolveMarket(location: string) → "cn" | "nl_weu" | null`
  - `conventionsFor(marketKey: string) → Array<{id, market, text: {en, zh}, appliesWhen, added, why}>` (empty array for an unknown key)
  - `conventionById(id: string) → entry | null`
  - `MARKET_KEYS: readonly string[]` — `["cn", "nl_weu"]`

- [ ] **Step 1: Write the failing test**

Create `tests/market.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_KEYS, conventionById, conventionsFor } from "../src/market/conventions.js";
import { resolveMarket } from "../src/market/resolveMarket.js";

/**
 * The market layer, which decides whether this feature says anything at all.
 *
 * Every case here is a case where saying nothing is the correct answer. A wrong
 * market claim is worse than no market claim, and unlike a wrong requirement it has
 * no evidence block behind it for the reader to check it against.
 */

test("a Dutch location resolves to the Western European market", () => {
  for (const location of ["Leiden, NL", "Amsterdam", "荷兰", "Eindhoven, Netherlands", "Den Haag"]) {
    assert.equal(resolveMarket(location), "nl_weu", location);
  }
});

test("a mainland Chinese location resolves to the Chinese market", () => {
  for (const location of ["Shanghai, China", "上海", "深圳", "Beijing", "杭州市"]) {
    assert.equal(resolveMarket(location), "cn", location);
  }
});

test("an ambiguous location resolves to nothing rather than to a guess", () => {
  assert.equal(resolveMarket("Remote — Shanghai or Amsterdam"), null);
  assert.equal(resolveMarket("Amsterdam / Shenzhen dual site"), null);
});

test("a location with no place in it resolves to nothing", () => {
  for (const location of ["", "   ", "Remote", "Hybrid", "Remote (EU timezone)"]) {
    assert.equal(resolveMarket(location), null, JSON.stringify(location));
  }
});

test("a market outside the first batch resolves to nothing", () => {
  for (const location of ["Toronto, Canada", "London, UK", "Berlin, Germany", "Boston, MA"]) {
    assert.equal(resolveMarket(location), null, location);
  }
});

// "Hong Kong SAR, China" and "Taipei, Taiwan" contain the substring that decides the
// mainland market, and they are different hiring markets whose conventions are not
// the ones in this table. Excluded explicitly rather than left to substring luck.
test("a separate market is not folded into the mainland one on a substring", () => {
  for (const location of ["Hong Kong SAR, China", "香港", "Taipei, Taiwan", "台北", "Macau, China"]) {
    assert.equal(resolveMarket(location), null, location);
  }
});

test("a non-string location resolves to nothing", () => {
  for (const location of [undefined, null, 42, {}]) {
    assert.equal(resolveMarket(location), null, JSON.stringify(location));
  }
});

test("every market key has conventions and an unknown key has none", () => {
  for (const key of MARKET_KEYS) assert.ok(conventionsFor(key).length > 0, key);
  assert.deepEqual(conventionsFor("de"), []);
  assert.deepEqual(conventionsFor(undefined), []);
});

test("every convention id is unique and looks itself up", () => {
  const all = MARKET_KEYS.flatMap((key) => conventionsFor(key));
  const ids = all.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "convention ids must be globally unique");
  for (const item of all) assert.equal(conventionById(item.id), item, item.id);
  assert.equal(conventionById("no-such-convention"), null);
  assert.equal(conventionById(undefined), null);
});

test("every convention carries both languages, a condition, and a dated rationale", () => {
  for (const key of MARKET_KEYS) {
    for (const item of conventionsFor(key)) {
      assert.equal(item.market, key, `${item.id} is filed under the wrong market`);
      assert.ok(item.text.en.trim(), `${item.id} has no English text`);
      assert.ok(item.text.zh.trim(), `${item.id} has no Chinese text`);
      assert.ok(item.appliesWhen.trim(), `${item.id} has no appliesWhen`);
      assert.match(item.added, /^\d{4}-\d{2}-\d{2}$/, `${item.id} has no added date`);
      assert.ok(item.why.trim(), `${item.id} has no rationale for review`);
    }
  }
});

// Nothing automated can check that a convention is TRUE. This checks the one class of
// falsehood a machine can see: a fabricated statistic. The rest is why/added, which
// exist so a person can review the claim.
test("no convention states a number", () => {
  for (const key of MARKET_KEYS) {
    for (const item of conventionsFor(key)) {
      for (const field of [item.text.en, item.text.zh, item.appliesWhen]) {
        assert.equal(/[0-9%]/.test(field), false, `${item.id} states a number: ${field}`);
      }
    }
  }
});

// The banned axes, checked against the table itself rather than only asked for in
// prose. src/ai/prompts.js:14-15 and :77 forbid these to the model; a convention
// naming one would smuggle it back in under the model's own fence.
test("no convention names a protected trait", () => {
  const banned = /\bage\b|\bnationality\b|\bcitizenship\b|年龄|国籍|户籍|性别|gender|\bmarital\b|婚姻|prestige|985|211/i;
  for (const key of MARKET_KEYS) {
    for (const item of conventionsFor(key)) {
      for (const field of [item.text.en, item.text.zh, item.appliesWhen, item.why]) {
        assert.equal(banned.test(field), false, `${item.id} names a protected trait: ${field}`);
      }
    }
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/market.test.mjs`
Expected: FAIL — `Cannot find module '.../src/market/conventions.js'`

- [ ] **Step 3: Write the conventions table**

Create `src/market/conventions.js`:

```js
/**
 * What a market screens on that the posting does not say.
 *
 * This table is the one thing in the analysis that is not derived from the CV or
 * the posting, and it is deliberately the only one. Every other conclusion the panel
 * shows is traceable to an evidence block; a market convention has nothing to cite,
 * which is why it is written here by a person, dated, and rendered to the reader
 * verbatim rather than restated by the model. The model may say where this CV stands
 * against a convention — that claim cites CV blocks like any other — but it may not
 * author, strengthen or extend the convention itself.
 *
 * Nothing automated can check that an entry is true. `why` and `added` exist so a
 * person can review it. That is why the first batch covers only markets the
 * maintainer applies in, and resolveMarket returns null everywhere else: a wrong
 * market claim looks exactly like a right one on screen, and unlike a wrong
 * requirement the reader has no source text to check it against.
 *
 * Rules for adding an entry:
 *  - No numbers. A statistic here cannot be sourced and must not be invented;
 *    scripts/static-check.mjs fails the build on a digit or a percent sign.
 *  - No protected traits. Age, nationality, country of education, gender and
 *    institutional prestige stay out, exactly as src/ai/prompts.js:14-15 and :77
 *    require of the model.
 *  - No CV layout. Length, photographs and date formatting belong to the market
 *    convention instruction at src/ai/prompts.js:109-111, which produces a
 *    resumeTailoring item. This table is about what the market weighs.
 *  - Nothing already covered elsewhere. Work authorization is absent from nl_weu on
 *    purpose: statedConditions and uncertainties already carry it, and a third
 *    telling is the repetition src/ai/prompts.js:41-53 exists to prevent.
 */

export const MARKET_KEYS = Object.freeze(["cn", "nl_weu"]);

const CONVENTIONS = Object.freeze([
  {
    id: "cn-venue-names",
    market: "cn",
    text: {
      en: "For research and algorithm roles, named conference and journal venues are search terms in their own right — screening filters on the venue string even where the posting prints none of them.",
      zh: "研究与算法岗位上，会议和期刊的名称本身就是检索词——即使招聘启事一个都没写，筛选环节仍会按会议名过滤。"
    },
    appliesWhen: "The role involves research, algorithm development, or modelling work.",
    added: "2026-08-08",
    why: "The posting states the research area; the filter runs on venue strings the posting never prints, so a CV that describes the work without naming where it was published is invisible to it."
  },
  {
    id: "cn-named-internships",
    market: "cn",
    text: {
      en: "For early-career roles, internships at named companies are weighed as their own line rather than folded into general experience.",
      zh: "面向早期职业阶段的岗位，具名公司的实习会被单独作为一栏掂量，而不是并入一般工作经历。"
    },
    appliesWhen: "The posting targets graduates or candidates early in their career.",
    added: "2026-08-08",
    why: "A CV that folds internships into a single experience section reads as thinner than the same history split out, and the split is honest reordering rather than new material."
  },
  {
    id: "cn-verifiable-projects",
    market: "cn",
    text: {
      en: "Verifiable project evidence — public repositories, competition placings, released work — carries part of the load that references carry in Western European hiring.",
      zh: "可验证的项目证据——公开仓库、竞赛名次、已发布的成果——承担了西欧招聘中由推荐人承担的那部分作用。"
    },
    appliesWhen: "The role is technical.",
    added: "2026-08-08",
    why: "The two markets place the burden of proof differently, and a CV written for one leaves the other's proof unstated."
  },
  {
    id: "cn-chinese-cv",
    market: "cn",
    text: {
      en: "A posting written in Chinese generally expects a Chinese-language CV.",
      zh: "以中文撰写的招聘启事，通常期望收到中文简历。"
    },
    appliesWhen: "The posting itself is written in Chinese.",
    added: "2026-08-08",
    why: "Sending an English CV to a Chinese-language posting is a decision, and candidates applying across markets often make it without noticing."
  },
  {
    id: "nl-working-language",
    market: "nl_weu",
    text: {
      en: "\"Dutch is a plus\" often describes a team whose day-to-day working language is Dutch. What the phrase means for this role is a question for the employer, not something to read off the posting.",
      zh: "「会荷兰语者优先」往往描述的是一个日常工作语言就是荷兰语的团队。这句话对本岗位到底意味着什么，应当去问雇主，而不是从启事里读出来。"
    },
    appliesWhen: "The posting mentions Dutch or another local language, or says nothing about working language.",
    added: "2026-08-08",
    why: "The gap between the written requirement and the practice is the whole point, and no amount of re-reading the posting closes it."
  },
  {
    id: "nl-motivation-letter",
    market: "nl_weu",
    text: {
      en: "Most applications are expected to carry a motivation letter even where the posting does not ask for one.",
      zh: "多数申请都被默认附有一封动机信，即使招聘启事并未要求。"
    },
    appliesWhen: "always",
    added: "2026-08-08",
    why: "An omission the posting never flags, and one of the few conventions the candidate can act on the same evening."
  },
  {
    id: "nl-credential-recognition",
    market: "nl_weu",
    text: {
      en: "For regulated roles, formal recognition of a foreign degree is a separate procedure from holding the degree.",
      zh: "在受监管的岗位上，境外学位的对等认证是独立于「持有该学位」之外的一道手续。"
    },
    appliesWhen: "The role is regulated, or requires a specific degree or professional registration.",
    added: "2026-08-08",
    why: "A candidate who holds the degree reads the requirement as met, and the procedure surfaces after an offer rather than before one."
  },
  {
    id: "nl-references-contacted",
    market: "nl_weu",
    text: {
      en: "References are generally contacted in practice at offer stage.",
      zh: "推荐人在发放 offer 的阶段通常会被真的联系。"
    },
    appliesWhen: "always",
    added: "2026-08-08",
    why: "Treated as a formality in some markets and acted on in this one, which is a difference the candidate can prepare for."
  }
]);

const BY_ID = new Map(CONVENTIONS.map((item) => [item.id, item]));

/** The conventions for one market, or an empty list for a key that has none. */
export function conventionsFor(marketKey) {
  return CONVENTIONS.filter((item) => item.market === marketKey);
}

/**
 * One convention by id, or null.
 *
 * ids are globally unique, so the view can resolve a note without being told which
 * market produced it — one fewer value to thread through renderAnalysisHtml, and one
 * fewer place for the market to be recorded inconsistently.
 */
export function conventionById(id) {
  return BY_ID.get(id) || null;
}
```

- [ ] **Step 4: Write the resolver**

Create `src/market/resolveMarket.js`:

```js
import { MARKET_KEYS } from "./conventions.js";

/**
 * Which hiring market this posting belongs to, or nothing.
 *
 * Reads job.location and nothing else. The market whose conventions matter is the
 * employer's, and the posting states it — the same principle already in force for CV
 * format convention at src/ai/prompts.js:110, reused rather than restated. Nothing
 * the candidate said about themselves is consulted, so a Chinese candidate applying
 * in Leiden gets Leiden's conventions.
 *
 * Conservative by construction. A null here means the whole feature says nothing:
 * no instruction in the prompt, no id the parser will accept, no card in the panel.
 * This matches how the request already treats absent inputs — the work-authorization
 * and location instructions are omitted rather than sent with nothing to act on
 * (src/ai/prompts.js:97-111) — and it is the right default because a wrong market
 * claim has no evidence block behind it for the reader to catch it with.
 */

/**
 * Markets that share a decisive substring with a listed one but are not it.
 *
 * "Hong Kong SAR, China" and "Macau, China" both contain the string that decides the
 * mainland market, and their hiring conventions are not the ones in that table. This
 * runs before any match, so a substring cannot fold one market into another.
 */
const SEPARATE_MARKETS = [
  /\bhong\s*kong\b/i, /香港/,
  /\btaiwan\b/i, /\btaipei\b/i, /台灣/, /台湾/, /台北/,
  /\bmacau\b/i, /\bmacao\b/i, /澳門/, /澳门/
];

const MARKET_PATTERNS = Object.freeze({
  cn: [
    /\bchina\b/i, /\bchinese\s+mainland\b/i, /\bp\.?r\.?c\.?\b/i, /中国/, /中國/,
    /\bbeijing\b/i, /北京/,
    /\bshanghai\b/i, /上海/,
    /\bshenzhen\b/i, /深圳/,
    /\bguangzhou\b/i, /广州/, /廣州/, /广东/,
    /\bhangzhou\b/i, /杭州/,
    /\bnanjing\b/i, /南京/,
    /\bsuzhou\b/i, /苏州/, /蘇州/,
    /\bchengdu\b/i, /成都/,
    /\bwuhan\b/i, /武汉/, /武漢/,
    /\btianjin\b/i, /天津/,
    /\bhefei\b/i, /合肥/,
    // 西安大略 is Western Ontario. It should not reach a location field, but the
    // substring is a real collision and the lookahead costs nothing.
    /\bxi'?an\b/i, /西安(?!大略)/,
    /\bqingdao\b/i, /青岛/, /青島/,
    /\bchangsha\b/i, /长沙/, /長沙/,
    /\bxiamen\b/i, /厦门/, /廈門/
  ],
  nl_weu: [
    /\bnetherlands\b/i, /\bnederland\b/i, /\bholland\b/i, /\bnl\b/i, /荷兰/, /荷蘭/,
    /\bamsterdam\b/i, /阿姆斯特丹/,
    /\brotterdam\b/i,
    /\butrecht\b/i,
    /\beindhoven\b/i,
    /\bleiden\b/i, /莱顿/, /萊頓/,
    /\bdelft\b/i,
    /\bthe\s+hague\b/i, /\bden\s+haag\b/i, /海牙/,
    /\bgroningen\b/i,
    /\bnijmegen\b/i,
    /\bmaastricht\b/i,
    /\btilburg\b/i,
    /\benschede\b/i,
    /\bwageningen\b/i
  ]
});

export function resolveMarket(location) {
  if (typeof location !== "string" || !location.trim()) return null;
  if (SEPARATE_MARKETS.some((pattern) => pattern.test(location))) return null;
  const matched = MARKET_KEYS.filter((key) => MARKET_PATTERNS[key].some((pattern) => pattern.test(location)));
  // Two markets in one string is a dual-site or a remote posting spanning both, and
  // there is no answer to give. Picking the first would be a guess presented as a fact.
  return matched.length === 1 ? matched[0] : null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/market.test.mjs`
Expected: PASS, all 11 tests.

- [ ] **Step 6: Add the build-failing guard**

Append to the end of `scripts/static-check.mjs`:

```js
// The conventions table is the one claim in the analysis with no evidence block
// behind it, so the one class of falsehood a machine can see is checked here rather
// than asked for in prose: a fabricated statistic. Nothing automated can check that
// a convention is TRUE — `why` and `added` exist so a person can review it — but a
// number in one of these could only have been invented, since no source is cited.
const { MARKET_KEYS: marketKeys, conventionsFor: conventionsForMarket } = await import(new URL("../src/market/conventions.js", import.meta.url));
for (const marketKey of marketKeys) {
  for (const convention of conventionsForMarket(marketKey)) {
    for (const field of [convention.text.en, convention.text.zh, convention.appliesWhen]) {
      assert.equal(/[0-9%]/.test(field), false, `Market convention ${convention.id} states a number: ${field}`);
    }
  }
}
```

- [ ] **Step 7: Run the full check**

Run: `npm run check`
Expected: PASS — lint, all test files, smoke test, audit.

- [ ] **Step 8: Commit**

```bash
git add src/market/conventions.js src/market/resolveMarket.js tests/market.test.mjs scripts/static-check.mjs
git commit -m "Add the market conventions a posting never states"
```

---

### Task 2: Accept market notes from the model, and only the injected ids

The parser is where "the model cannot invent a convention" is actually enforced. The prompt's silence on a no-market run is not the guard — this is.

**Files:**
- Modify: `src/ai/schema.js` (RESULT_LIMITS at `:53-70`; `AGENT_EVIDENCE_SCHEMA.required` at `:126`; a new schema property; the return block of `parseAgentEvidence` at `:605-633`; a new `parseMarketNotes` function)
- Test: `tests/schema.test.mjs` (append)

**Interfaces:**
- Consumes: `resolveMarket(location)`, `conventionsFor(marketKey)` from Task 1.
- Produces: `parseAgentEvidence(...).marketNotes` — `Array<{conventionId: string, cvStanding: string, evidence: Array<{ref, source, quote}>}>`, always an array, possibly empty.

**Two facts that decide this task's shape:**

1. `marketNotes` goes in `AGENT_EVIDENCE_SCHEMA.required`, not left optional. OpenAI strict mode requires every key in `properties` to also appear in `required` (`src/ai/directApiClient.js:124` sends `strict: true`), so an optional property would fail the request outright. On a run with no market the model simply returns `[]`, and the parser drops anything else.
2. `marketNotes` is parsed in the **return block**, alongside `statedConditions` and `screening` — not inside the `parsed` object at `:583-592`. That object is what the `OUTPUT_NO_FINDINGS` check at `:596` tests. A reply carrying nothing but market notes is not a usable analysis and must still fail that check.

- [ ] **Step 1: Write the failing test**

Append to `tests/schema.test.mjs`:

```js
function marketRequest(location) {
  return parseTaskRequest({
    requestId: "market-1", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    input: {
      resumeText: "Built Python services and published at MICCAI.",
      job: { title: "Engineer", location, description: "Python required. Reconstruction research." },
      candidate: {}
    }
  });
}

// A minimal reply that survives the no-findings check on its own, so each test below
// isolates what it is actually about.
function replyWith(marketNotes) {
  return {
    requirements: [{ name: "Python", level: "required", match: "strong", explanation: "Named directly in the CV.", evidence: [{ ref: "CV-001" }] }],
    marketNotes
  };
}

test("a market note whose convention was injected on this request survives", () => {
  const parsed = parseAgentEvidence(replyWith([
    { conventionId: "cn-venue-names", cvStanding: "The CV names MICCAI, so the venue filter would find it.", evidence: [{ ref: "CV-001" }] }
  ]), marketRequest("Shanghai, China"));
  assert.equal(parsed.marketNotes.length, 1);
  assert.equal(parsed.marketNotes[0].conventionId, "cn-venue-names");
  assert.match(parsed.marketNotes[0].cvStanding, /MICCAI/);
});

// The guard that makes the whole design safe. An id the model invented, or borrowed
// from the other market, has no text behind it and would render as nothing at best.
test("a market note whose convention was not injected is dropped", () => {
  const invented = parseAgentEvidence(replyWith([
    { conventionId: "cn-invented-convention", cvStanding: "Anything at all.", evidence: [{ ref: "CV-001" }] }
  ]), marketRequest("Shanghai, China"));
  assert.deepEqual(invented.marketNotes, []);

  const wrongMarket = parseAgentEvidence(replyWith([
    { conventionId: "nl-motivation-letter", cvStanding: "Anything at all.", evidence: [{ ref: "CV-001" }] }
  ]), marketRequest("Shanghai, China"));
  assert.deepEqual(wrongMarket.marketNotes, []);
});

// The prompt says nothing about market notes when no market resolves, but the prompt
// is not the guard: with no market, no id is valid, so nothing can get through.
test("no market resolves means no market note survives, whatever the model sent", () => {
  const parsed = parseAgentEvidence(replyWith([
    { conventionId: "cn-venue-names", cvStanding: "Real id, wrong posting.", evidence: [{ ref: "CV-001" }] },
    { conventionId: "nl-motivation-letter", cvStanding: "Also real, also wrong.", evidence: [{ ref: "CV-001" }] }
  ]), marketRequest("Toronto, Canada"));
  assert.deepEqual(parsed.marketNotes, []);
});

test("a repeated convention id keeps only the first note", () => {
  const parsed = parseAgentEvidence(replyWith([
    { conventionId: "nl-motivation-letter", cvStanding: "First.", evidence: [{ ref: "CV-001" }] },
    { conventionId: "nl-motivation-letter", cvStanding: "Second.", evidence: [{ ref: "CV-001" }] }
  ]), marketRequest("Leiden, NL"));
  assert.equal(parsed.marketNotes.length, 1);
  assert.equal(parsed.marketNotes[0].cvStanding, "First.");
});

test("a malformed market note costs that note and not the analysis", () => {
  const parsed = parseAgentEvidence(replyWith([
    { conventionId: "nl-motivation-letter", cvStanding: "", evidence: [{ ref: "CV-001" }] },
    { conventionId: "nl-references-contacted", cvStanding: "The CV lists no referees.", evidence: [{ ref: "CV-001" }] }
  ]), marketRequest("Amsterdam"));
  assert.equal(parsed.marketNotes.length, 1);
  assert.equal(parsed.marketNotes[0].conventionId, "nl-references-contacted");
  assert.equal(parsed.requirements.length, 1, "the rest of the analysis is unaffected");
});

test("an absent or non-array marketNotes parses as empty", () => {
  for (const value of [undefined, null, "none", {}]) {
    const reply = replyWith([]);
    reply.marketNotes = value;
    assert.deepEqual(parseAgentEvidence(reply, marketRequest("Amsterdam")).marketNotes, [], JSON.stringify(value));
  }
});

// Market notes enrich an analysis; they do not constitute one. Counting them as a
// finding would let a reply with nothing else in it render as a page of empty
// sections, which is the failure OUTPUT_NO_FINDINGS exists to report.
test("market notes alone are not a usable analysis", () => {
  assert.throws(() => parseAgentEvidence({
    marketNotes: [{ conventionId: "nl-motivation-letter", cvStanding: "No letter is mentioned.", evidence: [{ ref: "CV-001" }] }]
  }, marketRequest("Amsterdam")), (error) => error instanceof BridgeError && error.code === "OUTPUT_NO_FINDINGS");
});

// Strict mode requires every property to be listed as required; an optional one is
// rejected by the provider before the model ever sees the request.
test("the schema lists marketNotes as required so strict mode accepts it", () => {
  assert.ok(AGENT_EVIDENCE_SCHEMA.required.includes("marketNotes"));
  assert.deepEqual(
    Object.keys(AGENT_EVIDENCE_SCHEMA.properties).sort(),
    [...AGENT_EVIDENCE_SCHEMA.required].sort(),
    "OpenAI strict mode requires every property to also be required"
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/schema.test.mjs`
Expected: FAIL — `parsed.marketNotes` is `undefined`, and the `required` assertion fails.

- [ ] **Step 3: Add the cap and the schema property**

In `src/ai/schema.js`, add to `RESULT_LIMITS` (after `screeningTerms: 10` at `:69`, adding a comma to that line):

```js
  screeningTerms: 10,
  // Short on purpose. These are conventions the posting never mentions, read after
  // the reader already has a verdict and a plan; a long list of them turns the one
  // section with no evidence behind it into the longest thing on the page.
  marketNotes: 4
```

Add `"marketNotes"` to the end of `AGENT_EVIDENCE_SCHEMA.required` at `:126`:

```js
  required: ["recommendation", "statedConditions", "overview", "requirements", "screening", "strengths", "gaps", "risks", "profileRisks", "resumeTailoring", "interviewFocus", "uncertainties", "suggestedActions", "marketNotes"],
```

Add the property inside `AGENT_EVIDENCE_SCHEMA.properties`, immediately after the `screening` block closes (after the `}` that ends `screening` at `:264`, before `strengths:` at `:265`):

```js
    /**
     * Where this CV stands against the conventions of the employer's market.
     *
     * The convention itself is not here and never comes back from the model —
     * src/market/conventions.js owns that text and the view renders it verbatim. All
     * that travels is which convention is being answered and what the CV shows
     * against it, which keeps this field inside the same evidence contract as every
     * other analytical statement: cvStanding cites CV blocks, and the market claim
     * is not the model's to make.
     */
    marketNotes: {
      type: "array",
      maxItems: RESULT_LIMITS.marketNotes,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["conventionId", "cvStanding", "evidence"],
        properties: {
          // A machine token, like a block ID: it is matched against the ids injected
          // into this request and never shown to the reader.
          conventionId: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.shortLabel },
          cvStanding: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          evidence: { type: "array", maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    },
```

- [ ] **Step 4: Add the parser**

In `src/ai/schema.js`, add `import { resolveMarket } from "../market/resolveMarket.js";` and `import { conventionsFor } from "../market/conventions.js";` beside the existing `import { resolveEvidenceRef } from "./evidenceBlocks.js";` at `:1`.

Add this function immediately after `parseStatedConditions` (which ends around `:930`):

```js
/**
 * Market notes, kept only where the convention was injected into THIS request.
 *
 * This is the guard that makes the design safe, and it is deliberately in code
 * rather than in the prompt. The prompt does not mention market notes at all when no
 * market resolves — but a prompt that omits a subject is not a prompt that prevents
 * it, and a model that answers anyway would be stating a market convention nobody
 * wrote, with no evidence block behind it and nothing on screen to mark it as
 * different from the rest of the analysis.
 *
 * Same mechanism as an evidence ref: an id that does not resolve is dropped rather
 * than displayed. An unknown id, an id belonging to the other market, and an id on a
 * posting with no market at all are all the same case here — not in the injected
 * set, so not shown.
 */
function parseMarketNotes(value, request) {
  if (!Array.isArray(value)) return [];
  const market = resolveMarket(request.input.job.location);
  const allowed = new Set(conventionsFor(market).map((item) => item.id));
  if (!allowed.size) return [];
  const seen = new Set();
  return value.slice(0, RESULT_LIMITS.marketNotes).flatMap((item) => {
    if (!item || typeof item !== "object" || !allowed.has(item.conventionId) || seen.has(item.conventionId)) return [];
    try {
      const note = {
        conventionId: item.conventionId,
        cvStanding: outputText(item.cvStanding, "marketNote.cvStanding", FIELD_LIMITS.prose),
        evidence: parseEvidenceList(item.evidence, request, "marketNote.evidence", RESULT_LIMITS.evidencePerItem)
      };
      seen.add(item.conventionId);
      return [note];
    } catch {
      // One malformed note costs that note, never the analysis — the rule perItem
      // already applies to every other list.
      return [];
    }
  });
}
```

Add to the return block of `parseAgentEvidence`, after `suggestedActions: parsed.suggestedActions` (at `:632`, adding a comma to that line):

```js
    suggestedActions: parsed.suggestedActions,
    // Outside `parsed` on purpose: that object is what the OUTPUT_NO_FINDINGS check
    // above tests, and a reply carrying nothing but market notes is not an analysis.
    marketNotes: parseMarketNotes(result.marketNotes, request)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/schema.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run the full check**

Run: `npm run check`
Expected: PASS. If `static-check.mjs` reports a bare `maxLength` literal, the `maxItems: 4` on `evidence` is fine — only `maxLength` is checked — but confirm `FIELD_LIMITS` supplied both string ceilings.

- [ ] **Step 7: Commit**

```bash
git add src/ai/schema.js tests/schema.test.mjs
git commit -m "Accept market notes, and only for conventions this request supplied"
```

---

### Task 3: Ask for market notes, only when a market resolved

**Files:**
- Modify: `src/ai/prompts.js` (add the import; add a conditional block after the `job.location` instruction at `:109-111`; edit the `suggestedActions` sentence at `:134`)
- Test: `tests/schema.test.mjs` (append)

**Interfaces:**
- Consumes: `resolveMarket`, `conventionsFor` from Task 1; the `marketNotes` schema from Task 2. **The tests below call `marketRequest(location)`, which Task 2 added to `tests/schema.test.mjs` — Task 2 must land first; do not redefine it.**
- Produces: no new export. `buildAnalyzePrompt(request)` gains the block.

- [ ] **Step 1: Write the failing test**

Append to `tests/schema.test.mjs`:

```js
test("a resolved market puts its conventions and their ids in the prompt", async () => {
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const prompt = buildAnalyzePrompt(marketRequest("Leiden, NL"));
  assert.match(prompt, /<market_conventions>/);
  assert.match(prompt, /nl-motivation-letter/);
  assert.match(prompt, /motivation letter/);
  // The other market's conventions are not sent. A model shown both would be choosing
  // the market, which is the resolver's job and is testable only where it happens.
  assert.equal(/cn-venue-names/.test(prompt), false, "the other market's ids must not be sent");
});

// The pattern the location and work-authorization instructions already follow: an
// instruction with nothing to act on is not sent, rather than sent and hedged.
test("an unresolved market sends no market-convention instruction at all", async () => {
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  for (const location of ["", "Remote", "Toronto, Canada", "Remote — Shanghai or Amsterdam"]) {
    const prompt = buildAnalyzePrompt(marketRequest(location));
    assert.equal(/<market_conventions>/.test(prompt), false, location);
    assert.equal(/marketNotes is about/.test(prompt), false, location);
  }
});

test("the market instruction fences off the CV-layout rule and the plan", async () => {
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const prompt = buildAnalyzePrompt(marketRequest("Shanghai, China"));
  assert.match(prompt, /never about CV layout/);
  assert.match(prompt, /Prefer the conventions where the CV stands weakly/);
  assert.match(prompt, /never conclude from silence/i);
  // suggestedActions stays the single authoritative to-do list, with market notes
  // named in its enumeration rather than carrying advice of their own.
  assert.match(prompt, /or a market note's cvStanding must appear there exactly once/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/schema.test.mjs`
Expected: FAIL — `<market_conventions>` is not in the prompt.

- [ ] **Step 3: Add the instruction block**

In `src/ai/prompts.js`, add to the imports at the top:

```js
import { conventionsFor } from "../market/conventions.js";
import { resolveMarket } from "../market/resolveMarket.js";
```

Add this function below `declaredStatus` (after `:31`):

```js
/**
 * The conventions of the employer's market, asked for only where there are any.
 *
 * Same shape as the two conditional blocks below it: an instruction with nothing to
 * act on is not sent. The conventions travel as data in their own fence, because
 * they are the one input here that is neither the CV nor the posting — and the model
 * is asked to place the CV against them, never to restate or extend them. What the
 * reader sees comes from src/market/conventions.js directly.
 */
function marketConventionInstructions(conventions, outputLanguage) {
  if (!conventions.length) return [];
  return [
    "marketNotes is about the hiring conventions of the employer's own market that this posting never states. It is not about the posting, and it is not about the candidate — never consider their nationality, age, country of education or any other protected attribute here or anywhere else.",
    "Answer only the conventions supplied in market_conventions below, only where that convention's appliesWhen holds for this role, and return an empty array when none of them do. Never add a convention of your own, never restate one as stronger or more absolute than it is written, and never attach a number to one.",
    "Return each answered convention's conventionId exactly as given. conventionId is a machine token of the same class as a block ID: it belongs in that field and must never appear in a sentence the reader sees.",
    `Write cvStanding in ${outputLanguage}: where THIS CV stands against that convention, citing the CV blocks that show it. Do not restate the convention itself — the reader is shown its wording already, so a cvStanding that paraphrases it says nothing.`,
    "Prefer the conventions where the CV stands weakly, or where its standing cannot be told from the document at all. A note reporting that the CV is already fine is the one the reader can do nothing with, and four of those turn this section into reassurance.",
    "Where the CV shows nothing about a convention, say that the CV does not show it — never conclude from silence that the candidate lacks the thing. This is the rule already in force for gaps and for an absent screening term.",
    "This section is about what the market weighs, never about CV layout. Length, photographs, dates and document format belong to the resume-tailoring item about market convention and must not be repeated here.",
    "<market_conventions>",
    JSON.stringify(conventions.map(({ id, text, appliesWhen }) => ({ conventionId: id, convention: text.en, appliesWhen }))),
    "</market_conventions>"
  ];
}
```

In `buildAnalyzePrompt`, resolve the market beside the other request-derived values at `:34-35`:

```js
export function buildAnalyzePrompt(request) {
  const outputLanguage = request.options.language === "zh" ? "Chinese" : "English";
  const evidenceBlocks = buildEvidenceBlockBundle(request);
  const conventions = conventionsFor(resolveMarket(request.input.job.location));
```

Insert the block into the array immediately after the existing `job.location` conditional closes (after the `] : []),` at `:111`):

```js
    ...marketConventionInstructions(conventions, outputLanguage),
```

- [ ] **Step 4: Keep suggestedActions the single to-do list**

In `src/ai/prompts.js:134`, replace this exact string:

```
"suggestedActions is the single authoritative to-do list. Every instruction implied by a gap's howToClose, a resumeTailoring item, an uncertainty whose answeredBy is you, or a screening term the CV states in other words must appear there exactly once. Those fields carry the reason and the specifics; they must not restate the instruction as a second imperative. Do not pad the list to fill it — three real actions beat eight overlapping ones.",
```

with:

```
"suggestedActions is the single authoritative to-do list. Every instruction implied by a gap's howToClose, a resumeTailoring item, an uncertainty whose answeredBy is you, a screening term the CV states in other words, or a market note's cvStanding must appear there exactly once. Those fields carry the reason and the specifics; they must not restate the instruction as a second imperative. Do not pad the list to fill it — three real actions beat eight overlapping ones.",
```

Also update the comment block directly above it (`:125-133`) by appending one sentence to its final line, so the enumeration's reasoning stays with it:

```
    // action word for word. profileRisks is deliberately absent —
    // howToAddress is the true sentence to say if asked, not a task, and forcing one
    // action per red flag would pad the plan with work nobody can do. marketNotes
    // joined for the first reason: a convention the CV stands weakly against implies
    // an edit, and an edit stated twice is one sentence charged to the reader twice.
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/schema.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run the full check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ai/prompts.js tests/schema.test.mjs
git commit -m "Ask where the CV stands against the market, where there is a market"
```

---

### Task 4: Show it, and say where it came from

**Files:**
- Modify: `src/ui/analysisView.js` (import; one call in `renderAnalysisHtml` after `renderScreening` at `:39`; a new `renderMarketNotes` after `renderScreening` at `:302`)
- Modify: `src/ui/i18n.js` (five keys in `en`, five in `zh`)
- Modify: `src/sidepanel/sidepanel.css` (after `.screening-word` at `:107`)
- Modify: `src/report/report.css` (after `.screening-word` at `:59`)
- Test: `tests/analysisView.test.mjs` (append)

**Interfaces:**
- Consumes: `conventionById(id)` from Task 1; `evidence.marketNotes` from Task 2.
- Produces: no new export. `renderAnalysisHtml` gains the section; `src/report/report.js:55` inherits it with no change.

- [ ] **Step 1: Write the failing test**

Append to `tests/analysisView.test.mjs`:

```js
test("market notes render the convention text from the table, not from the model", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    marketNotes: [{ conventionId: "nl-motivation-letter", cvStanding: "No letter is mentioned anywhere.", evidence: [] }]
  }), "en");
  assert.match(html, /motivation letter/);
  assert.match(html, /No letter is mentioned anywhere\./);
  // The id is a machine token and must not reach the reader, exactly like a block ID.
  assert.equal(/nl-motivation-letter/.test(html), false);
});

// Every other section on this page is derived from the posting, so a reader has every
// reason to assume this one is too. The line saying otherwise is load-bearing.
test("the market card always says the conventions are not from this posting", () => {
  for (const locale of ["en", "zh"]) {
    const html = renderAnalysisHtml(evidenceFixture({
      marketNotes: [{ conventionId: "cn-venue-names", cvStanding: "The CV names no venue.", evidence: [] }]
    }), locale);
    assert.match(html, locale === "zh" ? /不来自本次招聘启事/ : /do not come from this posting/);
    assert.match(html, locale === "zh" ? /中国内地/ : /mainland China/);
  }
});

test("no market notes means no card at all", () => {
  for (const marketNotes of [[], undefined]) {
    const html = renderAnalysisHtml(evidenceFixture({ marketNotes }), "en");
    assert.equal(/market-list/.test(html), false, JSON.stringify(marketNotes));
  }
});

// The parser drops unknown ids, so this should be unreachable — but the view must not
// render an empty bullet if it ever is.
test("a note whose convention has no entry renders nothing", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    marketNotes: [{ conventionId: "no-such-convention", cvStanding: "Orphaned.", evidence: [] }]
  }), "en");
  assert.equal(/market-list/.test(html), false);
  assert.equal(/Orphaned/.test(html), false);
});

test("the market card sits directly after the screening card", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    marketNotes: [{ conventionId: "nl-references-contacted", cvStanding: "No referees are listed.", evidence: [] }]
  }), "en");
  assert.ok(html.indexOf("screening-list") < html.indexOf("market-list"), "market notes read after the screening terms");
  assert.ok(html.indexOf("market-list") < html.indexOf("finding-list"), "and before the strengths");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/analysisView.test.mjs`
Expected: FAIL — no `market-list` in the output.

- [ ] **Step 3: Add the i18n keys**

In `src/ui/i18n.js`, inside the `en` block, on the line that currently begins `jobUnderstanding: "What this role is",` append these five keys at the end of that same line:

```js
marketConventions: "What this market also weighs", marketConventionsNote: "Common hiring conventions in {market}. These do not come from this posting.", marketYourStanding: "Where you stand:", marketCn: "mainland China", marketNlWeu: "the Netherlands and Western Europe",
```

Add the same five keys to the corresponding line in the `zh` block (which starts at `:94`):

```js
marketConventions: "这个市场还会看什么", marketConventionsNote: "以下是{market}的通行招聘惯例，不来自本次招聘启事。", marketYourStanding: "你的位置：", marketCn: "中国内地", marketNlWeu: "荷兰及西欧",
```

- [ ] **Step 4: Add the renderer**

In `src/ui/analysisView.js`, add to the imports at `:1-3`:

```js
import { conventionById } from "../market/conventions.js";
```

Add this after `renderScreening` ends at `:302`:

```js
const MARKET_NAME_KEY = { cn: "marketCn", nl_weu: "marketNlWeu" };

/**
 * What the employer's market screens on that this posting never said.
 *
 * Placed straight after the screening card because it is the same question from the
 * other side: whether this CV's wording survives the posting's own filter, then what
 * the market filters on that the posting never wrote down.
 *
 * The convention text comes from src/market/conventions.js and not from the reply.
 * The model returns an id and a standing; everything the reader reads about the
 * market itself was written by a person and dated. That is the whole reason this
 * section is allowed to exist beside twelve others that each cite source text.
 *
 * The note under the heading is not politeness. Every other card on this page is
 * derived from the posting, so without it a reader has every reason to read these as
 * things the employer said.
 */
function renderMarketNotes(notes, locale) {
  const rows = (notes || [])
    .map((note) => ({ note, convention: conventionById(note?.conventionId) }))
    .filter((row) => row.convention && row.note.cvStanding);
  if (!rows.length) return "";
  const marketName = t(locale, MARKET_NAME_KEY[rows[0].convention.market] || "");
  const items = rows.map(({ note, convention }) => `<li class="market-note">
      <p class="market-convention">${escapeHtml(convention.text[locale] || convention.text.en)}</p>
      <p class="market-standing"><strong>${escapeHtml(t(locale, "marketYourStanding"))}</strong> ${escapeHtml(note.cvStanding)}</p>
    </li>`).join("");
  return `<section class="result-card"><h3>${escapeHtml(t(locale, "marketConventions"))}</h3>
    <p class="meta">${escapeHtml(format(locale, "marketConventionsNote", { market: marketName }))}</p>
    <ul class="market-list">${items}</ul></section>`;
}
```

Add the call in `renderAnalysisHtml`, immediately after `renderScreening(evidence.screening, locale),` at `:39`:

```js
    renderScreening(evidence.screening, locale),
    // The screening card asks whether this CV survives the posting's own filter; this
    // one asks what the employer's market filters on that the posting never wrote
    // down. Same question, other side, so they read together.
    renderMarketNotes(evidence.marketNotes, locale),
```

- [ ] **Step 5: Add the styles**

In `src/sidepanel/sidepanel.css`, after `.screening-word` at `:107`:

```css
.market-list { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
.market-note { border-left: 2px solid var(--line); padding-left: 9px; }
.market-convention { font-size: 12px; line-height: 1.45; }
.market-standing { color: var(--muted); font-size: 12px; line-height: 1.45; margin-top: 3px; }
```

In `src/report/report.css`, after `.screening-word` at `:59`:

```css
.market-list { display: grid; gap: 14px; list-style: none; margin: 0; padding: 0; }
.market-note { border-left: 2px solid var(--line); padding-left: 12px; }
.market-convention { font-size: 14px; line-height: 1.55; }
.market-standing { color: var(--muted); font-size: 13px; line-height: 1.55; margin-top: 4px; }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tests/analysisView.test.mjs`
Expected: PASS.

- [ ] **Step 7: Run the full check**

Run: `npm run check`
Expected: PASS. `tests/language.test.mjs` compares the `en` and `zh` key sets — if it fails, a key was added to one block and not the other.

- [ ] **Step 8: Commit**

```bash
git add src/ui/analysisView.js src/ui/i18n.js src/sidepanel/sidepanel.css src/report/report.css tests/analysisView.test.mjs
git commit -m "Show what the market weighs, and say it is not from this posting"
```

---

### Task 5: Document it where the analysis is documented

`docs/analysis-model.md` is the file that describes what the analysis does and does not do. A section producing conclusions with no evidence block behind it must be described there, or the next person to read that file will believe every conclusion is JD-derived.

**Files:**
- Modify: `docs/analysis-model.md` (add to the Pipeline list at `:11-27`; add a section before "What it does not do" at `:50`)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing.

- [ ] **Step 1: Document the market layer**

In `docs/analysis-model.md`, insert this section immediately before the `## What it does not do` heading at `:50`:

```markdown
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
```

Add a step to the Pipeline list, between step 2 (Evidence blocks) and step 3 (Request):

```markdown
3. **Market** — `src/market/resolveMarket.js` resolves `job.location` to a market
   key or to `null`. On a hit, that market's conventions are added to the request
   and become the only `conventionId` values the parser will accept back.
```

Renumber the following steps to 4, 5 and 6.

- [ ] **Step 2: Verify the documented line references are still accurate**

Run: `grep -n "resolveMarket\|conventionsFor\|marketNotes" src/ai/schema.js src/ai/prompts.js src/ui/analysisView.js`
Expected: each file listed in the doc actually references the module.

- [ ] **Step 3: Run the full check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/analysis-model.md
git commit -m "Describe the one section that is not derived from the posting"
```

---

## Verification after all tasks

- [ ] `npm run check` passes from a clean tree.
- [ ] `git log --oneline main..HEAD` shows the design commit plus five implementation commits.
- [ ] Nothing is pushed. Report to the user which commits are local-only.
- [ ] **Live check is the user's call, not automatic.** `npm run verify:live -- --transport curl` spends real API credit. Ask before running it; if run, confirm on a real Dutch or Chinese posting that the market card appears, its text matches `src/market/conventions.js` byte for byte, and the verdict is unchanged from what the same posting produced before this branch.
