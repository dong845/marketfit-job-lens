/**
 * The one place that knows what each selectable model needs.
 *
 * Both callers of the provider APIs read from here — the extension's direct
 * client (src/ai/directApiClient.js) and the local bridge (bridge/src/providers.js) —
 * so a model's token budget and schema support can't drift between the two paths.
 */

/**
 * Output budgets are deliberately generous. `max_tokens` is a ceiling, not a
 * spend: you pay for tokens generated, not tokens allowed. The previous shared
 * budget of 7000 was low enough that a full-length analysis hit the cap, and a
 * capped response is a hard error that returns nothing for a call the user paid
 * for. Reasoning models spend part of this budget on thinking before writing a
 * single character of JSON, so a thinking model needs the most headroom — its
 * thinking is billed against this same ceiling, and overrunning it produces a
 * truncated JSON object, which is a run charged in full that renders nothing.
 *
 * typicalSeconds is a rough starting estimate only, replaced by the duration this
 * machine actually measured for that model on its first successful run. It is a
 * progress hint, never presented as a measurement we have made.
 *
 * `thinking` is stated per model rather than left to the provider's default,
 * because the default reverses between generations and the reversal is silent:
 * omitting the field means adaptive thinking on Claude 5 and no thinking on 4.6,
 * so one absence asked opposite things of two models and nothing in the code said
 * so. No model here sets it today — see the note in MODELS — but the field is how
 * the answer gets written down when one does, rather than inherited.
 */
export const MODELS = Object.freeze({
  // Claude Opus 5 and Sonnet 5 were offered here and are not any more: they took
  // long enough that the answer stopped being worth waiting for. The cause is not
  // a mystery and it is not fixable from this file — both think by default, that
  // thinking is billed from the same output budget as the JSON, and a schema this
  // wide gives them a great deal to think about. Every lever short of restructuring
  // the request trades that latency against analysis quality, which is a bad trade
  // for a panel someone runs while deciding whether to spend an evening on one job.
  //
  // 4.6 is quick for exactly the reason its successors are slow: it does not think
  // unless asked, so the whole output budget goes to the answer. That is why these
  // two remain and why they are not a downgrade for this particular task.
  //
  // The capability flags the 5 pair used — `thinking`, `structuredOutputs`, `effort`
  // — are still honoured by directApiClient. They are how a model is described, not
  // a special case for two model ids, so a faster structured-output model can be
  // added back by adding a row here and nothing else.
  //
  // No `thinking` key on either: on 4.6 an omitted field already means no thinking,
  // and that is the behaviour these have shipped with. Sending {type:"disabled"}
  // would say the same thing, but it is a parameter this path has never carried and
  // a rejection costs a run rather than degrading — so the default stays, named in
  // this comment rather than in the request. 4.6 also predates Anthropic structured
  // outputs, so both keep the prompt-and-extract path.
  "claude-opus-4-6": {
    typicalSeconds: 60,
    provider: "anthropic-api",
    labelKey: "anthropicOpus46",
    maxOutputTokens: 16000,
    structuredOutputs: false
  },
  "claude-sonnet-4-6": {
    typicalSeconds: 45,
    provider: "anthropic-api",
    labelKey: "anthropicSonnet46",
    maxOutputTokens: 16000,
    structuredOutputs: false
  },
  "gpt-5": {
    typicalSeconds: 80,
    provider: "openai-api",
    labelKey: "openAiGpt5",
    maxOutputTokens: 24000,
    structuredOutputs: true
  },
  "gpt-5-mini": {
    typicalSeconds: 40,
    provider: "openai-api",
    labelKey: "openAiGpt5Mini",
    maxOutputTokens: 24000,
    structuredOutputs: true
  },
  // DeepSeek serves an OpenAI-compatible /chat/completions endpoint. It accepts
  // response_format json_object — valid JSON, but no shape — so the schema travels
  // in the prompt (see buildAnalyzePrompt) and is enforced on arrival by
  // parseAgentEvidence, which validates every reply regardless of provider.
  // deepseek-chat and deepseek-reasoner were retired on 2026-07-24 and the API now
  // rejects them outright, which cost a run rather than degrading. Both of these
  // default to thinking mode, and thinking spends the same output budget as the
  // answer — the old 8000 was already the smallest budget offered here and the one
  // most likely to truncate, so it goes up to match the most capable models.
  // Verified against api-docs.deepseek.com/quick_start/pricing on 2026-07-26:
  // 1M context, 384K maximum output, JSON output supported on both.
  "deepseek-v4-flash": {
    typicalSeconds: 60,
    thinking: false,
    provider: "deepseek-api",
    labelKey: "deepseekV4Flash",
    maxOutputTokens: 24000,
    structuredOutputs: false,
    jsonObjectMode: true
  },
  "deepseek-v4-pro": {
    typicalSeconds: 90,
    thinking: false,
    provider: "deepseek-api",
    labelKey: "deepseekV4Pro",
    maxOutputTokens: 24000,
    structuredOutputs: false,
    jsonObjectMode: true
  }
});

export const DEFAULT_MODEL = Object.freeze({
  "openai-api": "gpt-5-mini",
  "anthropic-api": "claude-sonnet-4-6",
  "deepseek-api": "deepseek-v4-flash"
});

export const API_PROVIDERS = Object.freeze(["openai-api", "anthropic-api", "deepseek-api"]);

/**
 * Where to get a key for each provider.
 *
 * Only Anthropic's deep link is verified reachable from here — OpenAI answers 403
 * to every path behind bot protection, and DeepSeek is a single-page app that
 * serves 200 for any path, so neither can confirm a route exists. Rather than ship
 * a remembered path that may 404, those two link to the console root and the panel
 * text says which section to open. Deep links in a shipped extension rot anyway;
 * the host outlives the route.
 *
 * keyPrefix is what that provider's keys are known to start with, used only to warn
 * about a key pasted under the wrong provider — never to reject one.
 */
export const PROVIDER_CONSOLES = Object.freeze({
  "openai-api": { url: "https://platform.openai.com/", keyPrefix: "sk-" },
  "anthropic-api": { url: "https://platform.claude.com/settings/keys", keyPrefix: "sk-ant-" },
  "deepseek-api": { url: "https://platform.deepseek.com/", keyPrefix: "sk-" }
});

export function modelsForProvider(provider) {
  return Object.entries(MODELS)
    .filter(([, model]) => model.provider === provider)
    .map(([id, model]) => ({ id, ...model }));
}

export function modelConfig(provider, requestedId) {
  const id = MODELS[requestedId]?.provider === provider ? requestedId : DEFAULT_MODEL[provider];
  return { id, ...MODELS[id] };
}
