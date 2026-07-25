import { AGENT_SYSTEM_POLICY, buildAnalyzePrompt, outputSchemaJson } from "../../bridge/src/prompts.js";
import { parseAgentEvidence, parseJsonOutput, parseTaskRequest } from "../../bridge/src/schema.js";
import { extractAnthropicJsonPayload, extractOpenAiJsonPayload, PROVIDER_OUTPUT_TOKEN_BUDGET } from "../../bridge/src/providerPayload.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const DIRECT_PROVIDER_ORIGINS = Object.freeze({
  "openai-api": "https://api.openai.com/*",
  "anthropic-api": "https://api.anthropic.com/*"
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
    async requestAccess(provider) {
      await ensureProviderAccess(provider, permissionsApi);
    },
    async runTask(value, { accessVerified = false } = {}) {
      const request = parseTaskRequest(value);
      if (!accessVerified) await ensureProviderAccess(request.provider, permissionsApi);
      if (request.provider === "openai-api") return runOpenAi(request, fetchImpl);
      if (request.provider === "anthropic-api") return runAnthropic(request, fetchImpl);
      throw new DirectApiError("Direct API access is available only for API-key providers.");
    }
  };
}

async function ensureProviderAccess(provider, permissionsApi) {
  const origin = DIRECT_PROVIDER_ORIGINS[provider];
  if (!origin) throw new DirectApiError("Direct API access is available only for API-key providers.");
  if (!permissionsApi?.contains || !permissionsApi?.request) return;
  const request = { origins: [origin] };
  if (await hasProviderAccess(provider, permissionsApi)) return;
  const granted = await permissionsApi.request(request);
  if (!granted) throw new DirectApiError("Direct access to the selected AI provider was not allowed.");
}

async function hasProviderAccess(provider, permissionsApi) {
  const origin = DIRECT_PROVIDER_ORIGINS[provider];
  if (!origin) return false;
  if (!permissionsApi?.contains) return true;
  return permissionsApi.contains({ origins: [origin] });
}

async function runOpenAi(request, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${request.credential.apiKey}` },
    body: JSON.stringify({
      model: request.options.model || "gpt-5-mini",
      store: false,
      max_output_tokens: PROVIDER_OUTPUT_TOKEN_BUDGET,
      instructions: AGENT_SYSTEM_POLICY,
      input: buildAnalyzePrompt(request),
      text: { format: { type: "json_schema", name: "marketfit_agent_evidence", strict: true, schema: JSON.parse(outputSchemaJson()) } }
    })
  });
  const payload = await jsonResponse(response);
  const output = extractOpenAiJsonPayload(payload);
  return parseAgentEvidence(parseJsonOutput(output), request);
}

async function runAnthropic(request, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": request.credential.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: request.options.model || "claude-sonnet-4-6",
      max_tokens: PROVIDER_OUTPUT_TOKEN_BUDGET,
      system: AGENT_SYSTEM_POLICY,
      messages: [{ role: "user", content: buildAnalyzePrompt(request) }]
    })
  });
  const payload = await jsonResponse(response);
  const output = extractAnthropicJsonPayload(payload);
  return parseAgentEvidence(parseJsonOutput(output), request);
}

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new DirectApiError("The selected AI provider did not finish in time.");
    throw new DirectApiError("The selected AI provider could not be reached.");
  } finally {
    clearTimeout(timer);
  }
}

async function jsonResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new DirectApiError("The selected AI provider returned an unreadable response.");
  }
  if (!response.ok) {
    const message = String(payload?.error?.message || payload?.message || "The selected AI provider rejected the request.").slice(0, 500);
    throw new DirectApiError(message);
  }
  return payload;
}
