import { AGENT_SYSTEM_POLICY, buildAnalyzePrompt, wireSchemaJson } from "./prompts.js";
import { parseAgentEvidence, parseJsonOutput, parseTaskRequest } from "./schema.js";
import { extractAnthropicJsonPayload, extractOpenAiJsonPayload } from "./providerPayload.js";
import { modelConfig } from "./models.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/**
 * Reasoning models can spend well over a minute thinking before emitting JSON,
 * and this path is deliberately non-streaming (one request, one parsed result).
 * The old 90s ceiling cut off slow-but-successful analyses.
 */
const REQUEST_TIMEOUT_MS = 150000;

export const DIRECT_PROVIDER_ORIGINS = Object.freeze({
  "openai-api": "https://api.openai.com/*",
  "anthropic-api": "https://api.anthropic.com/*",
  "deepseek-api": "https://api.deepseek.com/*"
});

export class DirectApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "DirectApiError";
  }
}

export function createDirectApiClient({ fetchImpl = globalThis.fetch, permissionsApi = globalThis.chrome?.permissions } = {}) {
  return {
    async hasAccess(provider) {
      return hasProviderAccess(provider, permissionsApi);
    },
    /** Must be called synchronously from a user gesture — see ensureProviderAccess. */
    async requestAccess(provider) {
      await ensureProviderAccess(provider, permissionsApi);
    },
    /**
     * Returns the same envelope the local bridge's /v1/tasks responds with, so the
     * panel has one contract regardless of which route produced the analysis.
     * Returning bare evidence here meant `response.result` was undefined on the
     * API-key path: the run was billed and reported as complete, but nothing
     * rendered and there was no analysis to build a report from.
     */
    async runTask(value) {
      const request = parseTaskRequest(value);
      if (!await hasProviderAccess(request.provider, permissionsApi)) {
        throw new DirectApiError("MarketFit cannot reach this provider yet. Select the provider again to grant access.");
      }
      const run = { "openai-api": runOpenAi, "anthropic-api": runAnthropic, "deepseek-api": runDeepSeek }[request.provider];
      if (!run) throw new DirectApiError("This provider is not supported.");
      const result = await run(request, fetchImpl);
      return {
        requestId: request.requestId,
        status: "completed",
        provider: request.provider,
        result,
        meta: { providerCloud: true, stored: false }
      };
    }
  };
}

/**
 * chrome.permissions.request() requires a live user gesture, and awaiting anything
 * beforehand — including permissions.contains() — can consume it. So this calls
 * request() directly with no preceding await. That costs nothing when access already
 * exists: request() resolves true without prompting if the origin is already granted.
 */
async function ensureProviderAccess(provider, permissionsApi) {
  const origin = DIRECT_PROVIDER_ORIGINS[provider];
  if (!origin) throw new DirectApiError("Direct API access is available only for API-key providers.");
  if (!permissionsApi?.request) return;
  const granted = await permissionsApi.request({ origins: [origin] });
  if (!granted) throw new DirectApiError("Direct access to the selected AI provider was not allowed.");
}

async function hasProviderAccess(provider, permissionsApi) {
  const origin = DIRECT_PROVIDER_ORIGINS[provider];
  if (!origin) return false;
  if (!permissionsApi?.contains) return true;
  return permissionsApi.contains({ origins: [origin] });
}

async function runOpenAi(request, fetchImpl) {
  const model = modelConfig("openai-api", request.options.model);
  const payload = await postJson(fetchImpl, OPENAI_URL, {
    headers: { "content-type": "application/json", authorization: `Bearer ${request.credential.apiKey}` },
    body: {
      model: model.id,
      store: false,
      max_output_tokens: model.maxOutputTokens,
      instructions: AGENT_SYSTEM_POLICY,
      input: buildAnalyzePrompt(request),
      text: { format: { type: "json_schema", name: "marketfit_agent_evidence", strict: true, schema: JSON.parse(wireSchemaJson()) } }
    },
    withoutStructuredOutput: ({ text, ...body }) => body
  });
  return parseAgentEvidence(parseJsonOutput(extractOpenAiJsonPayload(payload)), request);
}

async function runAnthropic(request, fetchImpl) {
  const model = modelConfig("anthropic-api", request.options.model);
  const outputConfig = model.structuredOutputs
    ? { format: { type: "json_schema", schema: JSON.parse(wireSchemaJson()) }, ...(model.effort ? { effort: model.effort } : {}) }
    : null;
  const payload = await postJson(fetchImpl, ANTHROPIC_URL, {
    headers: {
      "content-type": "application/json",
      "x-api-key": request.credential.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: {
      model: model.id,
      max_tokens: model.maxOutputTokens,
      system: AGENT_SYSTEM_POLICY,
      messages: [{ role: "user", content: buildAnalyzePrompt(request) }],
      ...(outputConfig ? { output_config: outputConfig } : {})
    },
    withoutStructuredOutput: ({ output_config: _dropped, ...body }) => body
  });
  return parseAgentEvidence(parseJsonOutput(extractAnthropicJsonPayload(payload)), request);
}

/**
 * DeepSeek exposes an OpenAI-compatible chat-completions endpoint. It supports
 * response_format json_object — valid JSON, but no schema — so the shape is
 * carried by the prompt and enforced afterwards by parseAgentEvidence, which
 * validates every reply anyway regardless of what the provider promised.
 */
async function runDeepSeek(request, fetchImpl) {
  const model = modelConfig("deepseek-api", request.options.model);
  const payload = await postJson(fetchImpl, DEEPSEEK_URL, {
    headers: { "content-type": "application/json", authorization: `Bearer ${request.credential.apiKey}` },
    body: {
      model: model.id,
      max_tokens: model.maxOutputTokens,
      messages: [
        { role: "system", content: AGENT_SYSTEM_POLICY },
        { role: "user", content: buildAnalyzePrompt(request) }
      ],
      ...(model.jsonObjectMode ? { response_format: { type: "json_object" } } : {})
    },
    withoutStructuredOutput: ({ response_format: _dropped, ...body }) => body
  });
  return parseAgentEvidence(parseJsonOutput(extractOpenAiJsonPayload(payload)), request);
}

/**
 * Posts JSON and, if the provider rejects the structured-output configuration,
 * retries once without it. Structured outputs are an accuracy optimisation, so a
 * provider that will not accept our schema should degrade to prompt-only JSON
 * rather than making the analysis unusable.
 */
async function postJson(fetchImpl, url, { headers, body, withoutStructuredOutput }) {
  try {
    return await sendJson(fetchImpl, url, headers, body);
  } catch (error) {
    if (!(error instanceof StructuredOutputRejected)) throw error;
    return sendJson(fetchImpl, url, headers, withoutStructuredOutput(body));
  }
}

async function sendJson(fetchImpl, url, headers, body) {
  const response = await fetchWithTimeout(fetchImpl, url, { method: "POST", headers, body: JSON.stringify(body) });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new DirectApiError("The selected AI provider returned an unreadable response.");
  }
  if (!response.ok) {
    const message = String(payload?.error?.message || payload?.message || "The selected AI provider rejected the request.").slice(0, 500);
    if (response.status === 400 && /schema|output_config|json_schema|format/i.test(message)) throw new StructuredOutputRejected(message);
    throw new DirectApiError(message);
  }
  return payload;
}

class StructuredOutputRejected extends Error {}

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new DirectApiError("The selected AI provider did not finish in time. Try a faster model, or shorten the job description.");
    throw new DirectApiError("The selected AI provider could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}
