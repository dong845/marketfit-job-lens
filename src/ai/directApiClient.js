import { AGENT_SYSTEM_POLICY, buildAnalyzePrompt, wireSchemaJson } from "./prompts.js";
import { parseAgentEvidence, parseJsonOutput, parseTaskRequest } from "./schema.js";
import { extractAnthropicJsonPayload, extractOpenAiJsonPayload } from "./providerPayload.js";
import { modelConfig } from "./models.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/**
 * Two deadlines, because they answer different questions.
 *
 * REQUEST_TIMEOUT_MS is the absolute ceiling on one run. It used to be 300s, sized
 * against a measurement of a 3,459 character prompt — but the fixed part of the
 * prompt alone is now over 26,000 characters before a CV or a posting is added, so
 * that number was measuring something that no longer exists. A timeout costs the
 * user a call they already paid for, which is worse than waiting.
 *
 * STREAM_IDLE_TIMEOUT_MS is the one that can actually tell a slow answer from a
 * dead connection, and it only became available once these requests were streamed.
 * A non-streaming request sends nothing until it is finished, so "no bytes for 90
 * seconds" was indistinguishable from "still working" and the only safe rule was a
 * total-duration guess. With deltas arriving throughout, silence means silence.
 */
const REQUEST_TIMEOUT_MS = 600000;
const STREAM_IDLE_TIMEOUT_MS = 90000;

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
    reduceStream: OPENAI_RESPONSES_STREAM,
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
      // Stated, never inherited. Omitting this field means adaptive thinking on
      // Claude 5 and no thinking on 4.6 — the same absence asking for opposite
      // behaviour — and the thinking it silently switched on is spent from the
      // max_tokens above, which is what truncated the JSON. See MODELS.
      ...(model.thinking === "adaptive" ? { thinking: { type: "adaptive" } } : {}),
      ...(outputConfig ? { output_config: outputConfig } : {})
    },
    reduceStream: ANTHROPIC_STREAM,
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
    reduceStream: CHAT_COMPLETIONS_STREAM,
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
async function postJson(fetchImpl, url, { headers, body, withoutStructuredOutput, reduceStream }) {
  try {
    return await sendJson(fetchImpl, url, headers, body, reduceStream);
  } catch (error) {
    if (!(error instanceof StructuredOutputRejected)) throw error;
    return sendJson(fetchImpl, url, headers, withoutStructuredOutput(body), reduceStream);
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
 *
 * `reduceStream` asks the provider to stream, and reassembles the deltas into the
 * same payload shape the non-streaming reply has, so every extractor and every
 * error path downstream is unchanged. Streaming is not for showing tokens as they
 * arrive — it is so the connection carries traffic for the whole minute or two an
 * answer takes. A silent socket is what intermediaries drop, and a request holding
 * a 32,000-token budget open with nothing flowing is the shape most likely to be
 * dropped. A response with no readable body cannot be streamed whatever we asked
 * for, so it falls through to reading the whole thing at once.
 */
async function sendJson(fetchImpl, url, headers, body, reduceStream) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const wire = reduceStream ? { ...body, stream: true } : body;
  try {
    let response;
    try {
      response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(wire), signal: controller.signal });
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
    // A streamed reply carries server-sent events, not JSON, so it is read before
    // the parse below. `await` rather than a bare return: the finally clears the
    // deadline, and returning the promise unawaited would clear it before a single
    // event had been read — leaving the long request this exists to protect with no
    // deadline at all.
    if (reduceStream && response.ok && typeof response.body?.getReader === "function") {
      return await readEventStream(response.body, controller, reduceStream);
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

/**
 * Reads a server-sent event stream into the payload shape the extractors expect.
 *
 * Everything downstream — extractAnthropicJsonPayload, extractOpenAiJsonPayload,
 * the truncation and refusal checks, the empty-output retry — was written against
 * a whole reply. Reassembling the deltas into that same object keeps all of it,
 * and keeps one description of what each provider's answer looks like rather than
 * a streaming copy that can drift from the buffered one.
 *
 * The idle deadline is the point of streaming here. It aborts on ninety seconds of
 * silence rather than on total elapsed time, so a long answer runs as long as it
 * needs to and a dead connection is caught in a minute and a half instead of ten.
 *
 * It starts only once the first byte has arrived, and that is not a detail. A proxy
 * that buffers the whole stream sends nothing at all and then everything at once —
 * so before the first byte, silence carries no information and only the absolute
 * ceiling can judge it. Running the idle clock from the request instead would have
 * cut every buffered connection off at ninety seconds, making this change a
 * regression for exactly the setups that are already the most fragile.
 */
async function readEventStream(stream, controller, reducer) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const state = { text: "" };
  let buffer = "";
  let events = 0;
  let lastByteAt = 0;
  const idle = setInterval(() => {
    if (lastByteAt && Date.now() - lastByteAt >= STREAM_IDLE_TIMEOUT_MS) controller.abort();
  }, 1000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      lastByteAt = Date.now();
      buffer += decoder.decode(value, { stream: true });
      // Events are separated by a blank line, and a line ends with CRLF, LF or CR —
      // all three are legal and the sender chooses. Splitting on "\n\n" alone found
      // no boundary at all in a CRLF stream, because "\r\n\r\n" contains no two
      // consecutive newlines: every event accumulated here unparsed, the reply came
      // back empty, and an empty reply is retried — so the user waited through two
      // full generations to be told nothing had arrived.
      //
      // Splitting the accumulated buffer rather than each chunk is what makes this
      // safe across a chunk boundary: a chunk ending mid-terminator simply does not
      // match yet, and the trailing piece is held back until the rest of it lands.
      const frames = buffer.split(/\r\n\r\n|\n\n|\r\r/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseEventFrame(frame);
        if (!event) continue;
        events += 1;
        reducer.event(state, event);
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw new DirectApiError(TIMEOUT_MESSAGE, "providerTimeout");
    const cause = error?.cause?.code || error?.cause?.message || error?.message;
    throw new DirectApiError(
      `The selected AI provider stopped sending its answer (${String(cause || "connection closed").slice(0, 120)}).`,
      "providerStreamInterrupted",
      { cause: String(cause || "").slice(0, 120) }
    );
  } finally {
    clearInterval(idle);
  }
  // An error delivered mid-stream arrives with HTTP 200 already sent, so it cannot
  // reach the status handling above. Overload and rate limiting both arrive here on
  // a long request, which is exactly when they are most likely.
  if (state.error) {
    throw new DirectApiError(String(state.error.message || "").slice(0, 500) || "The AI provider stopped the response.", "");
  }
  // Answering a stream request with one whole JSON body is not what any of these
  // providers documents, but it is what some gateways in front of them do. The
  // symptom would otherwise be "returned no text at all" — twice, because an empty
  // reply is retried — which names nothing the reader could act on. JSON has no
  // blank line in it, so a body that yielded no events is still intact here.
  if (!events) {
    try {
      return JSON.parse(buffer);
    } catch {
      /* Not JSON either — so this is a format we failed to read. See below. */
    }
    // Zero events is our failure, not the provider's. A reply that genuinely says
    // nothing still arrives as events; parsing none of them means the stream was in
    // a shape this reader does not handle. That has to be its own error rather than
    // an empty result, because an empty result is retried once — and the retry reads
    // the same unreadable format, so the user pays for and waits through a second
    // full generation to be told the same thing. Failing here costs one run and
    // names the cause; falling through cost two and named nothing.
    throw new DirectApiError(
      "MarketFit could not read the streamed response from this provider.",
      "providerStreamUnreadable"
    );
  }
  return reducer.finish(state);
}

/** The `data:` payload of one event, or null for keep-alives and end sentinels. */
function parseEventFrame(frame) {
  const data = frame
    .split(/\r\n|\n|\r/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Only text deltas are accumulated. Thinking arrives on this same stream as
 * thinking_delta, and the buffered reader already drops thinking blocks — folding
 * them in would splice the model's reasoning into the middle of the JSON.
 */
const ANTHROPIC_STREAM = Object.freeze({
  event(state, event) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") state.text += event.delta.text || "";
    else if (event.type === "message_delta" && event.delta?.stop_reason) state.stopReason = event.delta.stop_reason;
    else if (event.type === "error") state.error = event.error || {};
  },
  finish(state) {
    return { content: [{ type: "text", text: state.text }], stop_reason: state.stopReason };
  }
});

/**
 * The Responses API reports truncation on the terminal event rather than per
 * delta, so status and incomplete_details are taken from whichever of completed,
 * incomplete or failed ends the stream.
 */
const OPENAI_RESPONSES_STREAM = Object.freeze({
  event(state, event) {
    if (event.type === "response.output_text.delta") state.text += event.delta || "";
    else if (event.type === "response.refusal.delta") state.refusal = (state.refusal || "") + (event.delta || "");
    else if (event.response) {
      state.status = event.response.status;
      state.incomplete = event.response.incomplete_details;
    }
    if (event.type === "error") state.error = event.error || event;
  },
  finish(state) {
    return {
      output_text: state.text,
      status: state.status,
      incomplete_details: state.incomplete,
      ...(state.refusal ? { output: [{ type: "message", content: [{ type: "refusal", refusal: state.refusal }] }] } : {})
    };
  }
});

/** DeepSeek's OpenAI-compatible stream: content deltas, truncation per choice. */
const CHAT_COMPLETIONS_STREAM = Object.freeze({
  event(state, event) {
    const choice = event.choices?.[0];
    if (!choice) {
      if (event.error) state.error = event.error;
      return;
    }
    state.text += choice.delta?.content || "";
    if (choice.finish_reason) state.finishReason = choice.finish_reason;
  },
  finish(state) {
    return { choices: [{ message: { content: state.text }, finish_reason: state.finishReason }] };
  }
});
