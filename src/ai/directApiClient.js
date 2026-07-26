import { AGENT_SYSTEM_POLICY, buildAnalyzePrompt, wireSchemaJson } from "./prompts.js";
import { parseAgentEvidence, parseJsonOutput, parseTaskRequest } from "./schema.js";
import { extractAnthropicJsonPayload, extractOpenAiJsonPayload } from "./providerPayload.js";
import { modelConfig } from "./models.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/**
 * Reasoning models spend a while thinking before emitting JSON, and this path is
 * deliberately non-streaming (one request, one parsed result). Measured against
 * the real APIs, a 3,459 character prompt took ~35s; a real CV and job page build
 * roughly 27,000 characters, so the ceiling has to leave room for several times
 * that. A timeout here costs the user a call they already paid for, which is far
 * worse than waiting — the panel shows elapsed time so the wait is visible.
 */
const REQUEST_TIMEOUT_MS = 300000;

export const DIRECT_PROVIDER_ORIGINS = Object.freeze({
  "openai-api": "https://api.openai.com/*",
  "anthropic-api": "https://api.anthropic.com/*",
  "deepseek-api": "https://api.deepseek.com/*"
});

/**
 * A provider failure the user has to read.
 *
 * The code is what the panel translates; the English message is the fallback for
 * anywhere without a locale (tests, the smoke test) and the last resort if a code
 * ever ships without a translation. Values interpolated into the sentence — an HTTP
 * status, a transport cause — travel in `params` rather than baked into the string,
 * because a baked-in sentence can only ever be one language.
 */
export class DirectApiError extends Error {
  constructor(message, code = "", params = {}) {
    super(message);
    this.name = "DirectApiError";
    this.code = code;
    this.params = params;
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
        throw new DirectApiError("MarketFit cannot reach this provider yet. Select the provider again to grant access.", "providerAccessMissing");
      }
      const run = { "openai-api": runOpenAi, "anthropic-api": runAnthropic, "deepseek-api": runDeepSeek }[request.provider];
      if (!run) throw new DirectApiError("This provider is not supported.", "providerUnsupported");
      const result = await withEmptyOutputRetry(() => run(request, fetchImpl));
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
  if (!origin) throw new DirectApiError("Direct API access is available only for API-key providers.", "providerUnsupported");
  if (!permissionsApi?.request) return;
  const granted = await permissionsApi.request({ origins: [origin] });
  if (!granted) throw new DirectApiError("Direct access to the selected AI provider was not allowed.", "directAccessDenied");
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
      "anthropic-version": "2023-06-01",
      // Anthropic refuses cross-origin requests without this, and a side panel is
      // cross-origin: "CORS requests must set 'anthropic-dangerous-direct-browser-
      // access' header". It is named for the case it usually enables — an API key
      // shipped inside a public web page, where every visitor's browser exposes it.
      // That is not this: the key is typed by its owner into their own panel, held
      // in memory for the session, never stored and never sent anywhere but here.
      // Confirmed against the live API: the preflight for /v1/messages returns this
      // name in access-control-allow-headers alongside the other three.
      "anthropic-dangerous-direct-browser-access": "true"
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
      // Thinking defaults to enabled on V4, at effort "high", and the chain of
      // thought comes back in reasoning_content rather than content. DeepSeek
      // documents that json_object "may occasionally return empty content" — and an
      // empty content field is exactly what this path cannot use, since the answer
      // is the JSON. The retired deepseek-chat was the non-thinking mode of
      // v4-flash, so turning it off restores the shape that was working.
      ...(model.thinking === false ? { thinking: { type: "disabled" } } : {}),
      ...(model.jsonObjectMode ? { response_format: { type: "json_object" } } : {})
    },
    withoutStructuredOutput: ({ response_format: _dropped, ...body }) => body
  });
  return parseAgentEvidence(parseJsonOutput(extractOpenAiJsonPayload(payload)), request);
}

/**
 * Runs a task, retrying once if the provider answered with nothing at all.
 *
 * DeepSeek documents that JSON output "may occasionally return empty content", and
 * an empty content field is unusable here because the answer IS the JSON. The call
 * was billed either way, so a single retry turns a wasted charge into an analysis;
 * bounded at one because a provider that is genuinely down should fail, not loop.
 * Only emptiness is retried — invalid JSON and truncation are answers, and repeating
 * the request would produce the same one at twice the price.
 */
async function withEmptyOutputRetry(run) {
  try {
    return await run();
  } catch (error) {
    if (error?.code !== "OUTPUT_EMPTY") throw error;
    return run();
  }
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

const TIMEOUT_MESSAGE = "The selected AI provider did not finish in time. Try a faster model, or shorten the job description.";

/**
 * One request, one deadline.
 *
 * The timeout covers reading the body as well as getting the headers. fetch()
 * resolves as soon as the headers land, so cancelling the abort at that point left
 * a stalled body with nothing to interrupt it — the panel's elapsed counter would
 * climb past the timeout forever and the run button never came back.
 */
async function sendJson(fetchImpl, url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) throw new DirectApiError(TIMEOUT_MESSAGE, "providerTimeout");
      // Keep the underlying cause: "could not be reached" alone hides whether it was
      // DNS, TLS, a proxy, or the network being down, which is the whole diagnosis.
      const cause = error?.cause?.code || error?.cause?.message || error?.message;
      throw new DirectApiError(
        cause ? `The selected AI provider could not be reached (${String(cause).slice(0, 120)}).` : "The selected AI provider could not be reached.",
        cause ? "providerUnreachableCause" : "providerUnreachable",
        { cause: String(cause || "").slice(0, 120) }
      );
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      if (controller.signal.aborted) throw new DirectApiError(TIMEOUT_MESSAGE, "providerTimeout");
    }
    // Status first. Parsing before checking it meant an edge or proxy page — which
    // is how rate limits and outages usually arrive — erased the one fact that
    // told the user whether to wait, slow down, or fix their key.
    if (!response.ok) {
      const message = String(payload?.error?.message || payload?.message || "").slice(0, 500);
      if (response.status === 400 && /schema|output_config|json_schema|format/i.test(message)) throw new StructuredOutputRejected(message);
      throw new DirectApiError(message || statusMessage(response.status).message, message ? "" : statusMessage(response.status).code, { status: response.status });
    }
    if (!payload) throw new DirectApiError("The selected AI provider returned an unreadable response.", "providerUnreadable");
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What an HTTP status means for someone who just paid for an analysis.
 *
 * Returns a code as well as the sentence: the provider's own error text is passed
 * through untranslated when it has one, but when it does not, this is the whole
 * message the user sees and it has to arrive in their language.
 */
function statusMessage(status) {
  if (status === 401 || status === 403) return { code: "providerKeyRejected", message: `The AI provider rejected the API key (HTTP ${status}). Check the key and try again.` };
  if (status === 429) return { code: "providerRateLimited", message: "The AI provider is rate limiting this key (HTTP 429). Wait a moment and try again." };
  if (status >= 500) return { code: "providerUnavailable", message: `The AI provider is unavailable right now (HTTP ${status}). Try again shortly.` };
  return { code: "providerRejected", message: `The AI provider rejected the request (HTTP ${status}).` };
}

class StructuredOutputRejected extends Error {}
