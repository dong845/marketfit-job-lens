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
 * single character of JSON, so they get the most headroom.
 */
/**
 * typicalSeconds is a rough starting estimate only, replaced by the duration this
 * machine actually measured for that model on its first successful run. It is a
 * progress hint, never presented as a measurement we have made.
 */
export const MODELS = Object.freeze({
  "claude-opus-5": {
    typicalSeconds: 90,
    provider: "anthropic-api",
    labelKey: "anthropicOpus5",
    maxOutputTokens: 24000,
    structuredOutputs: true,
    effort: "medium"
  },
  "claude-sonnet-5": {
    typicalSeconds: 55,
    provider: "anthropic-api",
    labelKey: "anthropicSonnet5",
    maxOutputTokens: 24000,
    structuredOutputs: true,
    effort: "medium"
  },
  // Retained as the lower-cost option. 4.6 predates Anthropic structured
  // outputs, so it keeps the prompt-and-extract path.
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
  "anthropic-api": "claude-sonnet-5",
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
