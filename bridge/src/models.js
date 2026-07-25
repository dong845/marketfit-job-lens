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
  }
});

/** CLI routes are addressed by provider name, not a model id. */
export const CLI_TYPICAL_SECONDS = Object.freeze({ codex: 180, "claude-code": 180 });

export const DEFAULT_MODEL = Object.freeze({
  "openai-api": "gpt-5-mini",
  "anthropic-api": "claude-sonnet-5"
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
