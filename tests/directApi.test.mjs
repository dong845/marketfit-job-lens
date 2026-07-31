import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDirectApiClient, DIRECT_PROVIDER_ORIGINS } from "../src/ai/directApiClient.js";
import { MODELS, modelsForProvider } from "../src/ai/models.js";

function apiRequest(provider = "openai-api", model = "gpt-5") {
  // model may be undefined; modelConfig then picks the provider default.
  return {
    requestId: "direct-api-test-1",
    taskType: "analyze_job",
    provider,
    privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    options: { model, language: "en" },
    input: {
      resumeText: "Built Python services and improved reliability by 28%.",
      job: { title: "Engineer", description: "Python required. Improve service reliability." },
      candidate: { targetRole: "Engineer", workAuthorization: "authorized", languages: ["English C1"] }
    }
  };
}

function validEvidence() {
  const resume = { ref: "CV-001" };
  const job = { ref: "JD-001" };
  const reliability = { ref: "JD-001" };
  return {
    recommendation: { verdict: "worth_applying", headline: "Apply after sharpening the reliability bullet.", rationale: "Python is directly evidenced; scale is not." },
    overview: { jobFocus: "The role focuses on reliable Python services.", candidatePositioning: "The resume shows relevant service work.", fitNarrative: "The cited evidence is relevant.", evidence: [resume, reliability] },
    requirements: [{ name: "Python", level: "required", match: "strong", evidence: [resume, job], explanation: "The resume names Python service work." }],
    strengths: [{ title: "Service delivery", summary: "The resume cites a result.", evidence: [{ source: "resume", quote: "improved reliability by 28%" }] }],
    gaps: [{ title: "Production scope", severity: "unknown", summary: "Scale is not stated.", evidence: [reliability] }],
    risks: [{ title: "Context", severity: "unknown", summary: "The job has limited context.", evidence: [job] }],
    resumeTailoring: [{ target: "Reliability result", recommendation: "Feature the reliability outcome.", evidence: [{ source: "resume", quote: "improved reliability by 28%" }] }],
    interviewFocus: [{ question: "How did you improve reliability?", rationale: "Both sources mention reliability work.", evidence: [reliability, { source: "resume", quote: "improved reliability by 28%" }] }],
    uncertainties: [{ type: "scope", message: "Clarify the service scale.", evidence: [reliability] }],
    suggestedActions: [{ action: "Ask about the production environment.", priority: "before_apply", evidence: [job] }]
  };
}

test("granting provider access never awaits anything before requesting it", async () => {
  // chrome.permissions.request() must run inside the user gesture that triggered it.
  // Awaiting permissions.contains() first can consume that gesture, so requestAccess
  // must reach request() as its first await — request() already resolves true without
  // prompting when the origin is granted, which is what the pre-check was for.
  const permissionCalls = [];
  const client = createDirectApiClient({
    permissionsApi: {
      async contains(request) { permissionCalls.push(["contains", request]); return false; },
      async request(request) { permissionCalls.push(["request", request]); return true; }
    },
    fetchImpl: async () => { throw new Error("must not fetch"); }
  });

  await client.requestAccess("openai-api");
  assert.deepEqual(permissionCalls, [["request", { origins: [DIRECT_PROVIDER_ORIGINS["openai-api"]] }]]);
});

test("direct OpenAI API flow requests only its API host and keeps the key request-only", async () => {
  const permissionCalls = [];
  const calls = [];
  const client = createDirectApiClient({
    permissionsApi: {
      async contains(request) { permissionCalls.push(["contains", request]); return true; },
      async request(request) { permissionCalls.push(["request", request]); return true; }
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { output_text: JSON.stringify(validEvidence()) }; } };
    }
  });

  const { result } = await client.runTask(apiRequest());
  assert.equal(result.requirements[0].name, "Python");
  // runTask verifies access but must never prompt: by the time it runs, the gesture
  // is long gone (job capture has already awaited).
  assert.deepEqual(permissionCalls, [["contains", { origins: [DIRECT_PROVIDER_ORIGINS["openai-api"]] }]]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /https:\/\/api\.openai\.com\/v1\/responses$/);
  assert.equal(calls[0].options.headers.authorization, "Bearer session-test-api-key-123");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "gpt-5");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, MODELS["gpt-5"].maxOutputTokens);
  assert.equal(JSON.stringify(body).includes("session-test-api-key-123"), false);
});

test("direct OpenAI API flow accepts nested Responses API output text", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(validEvidence()) }] }] };
      }
    })
  });
  const { result } = await client.runTask(apiRequest());
  assert.equal(result.requirements[0].name, "Python");
});

test("direct Anthropic API flow accepts fenced JSON text", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { content: [{ type: "text", text: `\`\`\`json\n${JSON.stringify(validEvidence())}\n\`\`\`` }] };
      }
    })
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(result.suggestedActions[0].priority, "before_apply");
});

test("direct provider access is rejected when the user declines the provider host", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return false; }, async request() { return false; } },
    fetchImpl: async () => { throw new Error("must not fetch"); }
  });
  await assert.rejects(() => client.requestAccess("anthropic-api"), /was not allowed/);
});

test("both routes answer with the same envelope the panel reads", async () => {
  // The panel does `lastAgentEvidence = response.result` for either route. The
  // direct client used to return bare evidence, so response.result was undefined:
  // the call was billed, the status said complete, the result area rendered blank,
  // and the report had nothing to build from. Shipped broken since 0.6.10.
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { output_text: JSON.stringify(validEvidence()) }; } })
  });
  const direct = await client.runTask(apiRequest());

  // The shape the local bridge's /v1/tasks responds with.
  const bridgeEnvelope = { requestId: "x", status: "completed", provider: "codex", result: {}, meta: { providerCloud: true, stored: false } };
  assert.deepEqual(Object.keys(direct).sort(), Object.keys(bridgeEnvelope).sort());

  assert.ok(direct.result, "response.result must carry the analysis");
  assert.equal(direct.result.requirements[0].name, "Python");
  assert.equal(direct.status, "completed");
  assert.equal(direct.provider, "openai-api");
  assert.equal(direct.requestId, "direct-api-test-1");
});

test("the panel treats a missing result as a failure, not a finished analysis", () => {
  const sidepanel = readFileSync(new URL("../src/sidepanel/sidepanel.js", import.meta.url), "utf8");
  const review = sidepanel.slice(sidepanel.indexOf("async function runAgentReview"), sidepanel.indexOf("function renderAnalysis"));
  const guard = review.indexOf("if (!response?.result)");
  const assign = review.indexOf("lastAgentEvidence = response.result");
  assert.ok(guard > 0, "a missing result must be rejected");
  assert.ok(guard < assign, "and rejected before it is treated as an analysis");
});

test("every Anthropic model returns the envelope, whichever schema branch it takes", async () => {
  // Read from the registry rather than listed here. A hardcoded list is wrong twice:
  // it stops covering a model the moment one is added, and when one is REMOVED the
  // stale name silently resolves to the provider default — so the test keeps passing
  // while testing a different model than it names.
  for (const { id: model, structuredOutputs: structured } of modelsForProvider("anthropic-api")) {
    const calls = [];
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; } },
      fetchImpl: async (url, options) => {
        calls.push(JSON.parse(options.body));
        return { ok: true, status: 200, async json() { return { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] }; } };
      }
    });
    const response = await client.runTask(apiRequest("anthropic-api", model));
    assert.ok(response.result, `${model}: response.result must carry the analysis`);
    assert.equal(response.provider, "anthropic-api");
    assert.equal(calls[0].model, model);
    // From the registry, not a literal: the budget and the thinking mode are one
    // decision — thinking is billed from max_tokens — and a test that pins the
    // number here would have to be edited every time that decision is revisited.
    assert.equal(calls[0].max_tokens, MODELS[model].maxOutputTokens, `${model}: wrong output budget`);
    assert.equal(Boolean(calls[0].output_config), Boolean(structured), `${model}: wrong structured-output branch`);
    assert.match(calls[0].url ?? "https://api.anthropic.com/v1/messages", /anthropic/);
  }
});

test("Anthropic thinking is what the registry says, never what the default happens to be", async () => {
  // One omission asks opposite things of two generations: with `thinking` absent
  // Claude 5 thinks and 4.6 does not. So the guarantee is not "send adaptive" or
  // "send nothing" — it is that the request says exactly what the registry says,
  // and that reading either one tells you what the other does. That holds however
  // the registry changes, including when no model in it thinks at all.
  const sentFor = async (model) => {
    let body;
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; } },
      fetchImpl: async (url, options) => {
        body = JSON.parse(options.body);
        return { ok: true, status: 200, async json() { return { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] }; } };
      }
    });
    await client.runTask(apiRequest("anthropic-api", model));
    return body;
  };

  const anthropic = modelsForProvider("anthropic-api");
  assert.ok(anthropic.length, "the provider must offer at least one model");
  for (const { id: model, thinking } of anthropic) {
    const sent = (await sentFor(model)).thinking;
    if (thinking === "adaptive") assert.deepEqual(sent, { type: "adaptive" }, `${model} must ask for thinking explicitly`);
    else assert.equal(sent, undefined, `${model} must not send a thinking mode the registry does not give it`);
  }
});

test("every provider is asked to stream, and a streamed reply parses like a whole one", async () => {
  // Streaming is not for showing tokens as they arrive: it is so the connection
  // carries traffic while a two-minute answer is generated. A silent socket holding
  // a 32,000-token budget open is the shape intermediaries drop, and the drop looked
  // like a timeout on a run the user had already paid for.
  const frames = {
    "anthropic-api": (json) => [
      'event: message_start\ndata: {"type":"message_start"}',
      ...chunk(json).map((part) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: part } })}`),
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}'
    ],
    "openai-api": (json) => [
      ...chunk(json).map((part) => `data: ${JSON.stringify({ type: "response.output_text.delta", delta: part })}`),
      'data: {"type":"response.completed","response":{"status":"completed"}}'
    ],
    "deepseek-api": (json) => [
      ...chunk(json).map((part) => `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}`),
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      "data: [DONE]"
    ]
  };

  for (const [provider, toFrames] of Object.entries(frames)) {
    let body;
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; } },
      fetchImpl: async (url, options) => {
        body = JSON.parse(options.body);
        return { ok: true, status: 200, body: sseBody(toFrames(JSON.stringify(validEvidence()))) };
      }
    });
    const response = await client.runTask(apiRequest(provider, undefined));
    assert.equal(body.stream, true, `${provider} must ask for a stream`);
    assert.equal(response.result.requirements[0].name, "Python", `${provider}: a streamed reply must parse like a whole one`);
  }
});

test("a streamed reply cut off by the token budget still says so", async () => {
  // The truncation checks read stop_reason and finish_reason off a whole payload, so
  // the stream reader has to carry those through. Without it the most expensive
  // failure — a long answer that ran out of room — would arrive as invalid JSON.
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: sseBody([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"overview\\":"}}',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}'
      ])
    })
  });
  await assert.rejects(() => client.runTask(apiRequest("anthropic-api", "claude-opus-4-6")), /ran out of output space/);
});

test("a stream carries thinking and JSON on the same wire, and only the JSON is kept", async () => {
  // Claude 5 thinks by default and its thinking_delta events ride the same stream as
  // the answer. Folding them in would splice reasoning prose into the middle of the
  // JSON object, which parses as nothing at all.
  const json = JSON.stringify(validEvidence());
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: sseBody([
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Let me weigh the C++ requirement..."}}',
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: json } })}`,
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}'
      ])
    })
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-opus-4-6"));
  assert.equal(result.requirements[0].name, "Python");
});

test("an error delivered mid-stream is reported, not read as an empty answer", async () => {
  // HTTP 200 is already sent by then, so it cannot reach the status handling. Overload
  // and rate limiting arrive this way on exactly the long requests most likely to hit
  // them, and without this they surfaced as "the provider returned no text at all".
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: sseBody([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{"}}',
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'
      ])
    })
  });
  await assert.rejects(() => client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6")), /Overloaded/);
});

test("an event split across two network chunks is not lost", async () => {
  // Chunk boundaries fall wherever TCP puts them, not on event boundaries. Parsing
  // each chunk on arrival dropped whichever event straddled the seam — a silent hole
  // in the middle of the JSON rather than an error.
  const json = JSON.stringify(validEvidence());
  const frame = `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: json } })}\n\n`;
  const seam = Math.floor(frame.length / 2);
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: rawBody([frame.slice(0, seam), frame.slice(seam), 'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n'])
    })
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(result.requirements[0].name, "Python");
});

test("progress separates the time spent thinking from the time spent writing", async () => {
  // A count of seconds says a run is slow and nothing about why, and the two causes
  // need opposite fixes. Keep-alive pings and thinking blocks ride the same stream
  // and prove only that the socket is alive, so the moment worth reporting is the
  // first character of the ANSWER — everything before it was the model thinking.
  const json = JSON.stringify(validEvidence());
  const updates = [];
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: sseBody([
        'data: {"type":"ping"}',
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"weighing the C++ line"}}',
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: json.slice(0, 40) } })}`,
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: json.slice(40) } })}`,
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}'
      ])
    })
  });

  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"), {
    onProgress: (update) => updates.push(update)
  });
  assert.equal(result.requirements[0].name, "Python");

  // A ping and a thinking delta are traffic, not an answer: still thinking.
  assert.equal(updates[0].firstTextMs, null, "a keep-alive must not read as the answer starting");
  assert.equal(updates[1].firstTextMs, null, "and neither must a thinking block");
  assert.equal(updates[1].chars, 0);

  // The first answer text starts the clock, and it never restarts afterwards.
  const writing = updates.filter((update) => update.firstTextMs !== null);
  assert.ok(writing.length >= 2, "writing must be reported as it lands, not once at the end");
  assert.equal(writing[0].chars, 40, "and how much has arrived so far");
  assert.equal(writing.at(-1).chars, json.length);
  assert.deepEqual([...new Set(writing.map((update) => update.firstTextMs))].length, 1, "the start time is measured once");
});

test("progress is optional, and a caller that wants none still gets its analysis", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: sseBody([`data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: JSON.stringify(validEvidence()) } })}`])
    })
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(result.requirements[0].name, "Python");
});

test("the last event is read even when the stream ends without a blank line", async () => {
  // The reader holds back the trailing piece of the buffer because a chunk can end
  // mid-event — but on `done` that piece was dropped instead of parsed. A stream
  // that does not end with a blank line therefore lost its final event, and the
  // final event is where the closing braces of the JSON are: the answer arrived
  // complete and was handed on with its tail missing, reported as the provider not
  // returning valid JSON. The provider had; we had thrown the end of it away.
  const json = JSON.stringify(validEvidence());
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: rawBody([
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: json.slice(0, -30) } })}\n\n`,
        // No trailing blank line after this one — the stream just ends.
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: json.slice(-30) } })}`
      ])
    })
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(result.requirements[0].name, "Python");
});

test("a truncation flag in the final event still stops a partial answer", async () => {
  // Same tail, different cargo: when the last event is the one carrying
  // stop_reason, dropping it loses the only signal that the answer is incomplete.
  // The partial JSON then fails to parse and is reported as the model returning
  // nonsense, which sends the user to try another model for a budget problem.
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: rawBody([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"overview\\":"}}\n\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}'
      ])
    })
  });
  await assert.rejects(() => client.runTask(apiRequest("anthropic-api", "claude-opus-4-6")), /ran out of output space/);
});

test("a CRLF stream is read, and does not silently cost a second generation", async () => {
  // Line terminators in server-sent events may be CRLF, LF or CR, and the sender
  // picks. Splitting on "\n\n" alone found no event boundary at all in a CRLF
  // stream — "\r\n\r\n" holds no two consecutive newlines — so every event piled up
  // unparsed, the reply came back empty, and an empty reply is retried: the user
  // waited through two full generations to be told nothing arrived.
  const json = JSON.stringify(validEvidence());
  let attempts = 0;
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => {
      attempts += 1;
      return {
        ok: true,
        status: 200,
        body: rawBody([
          `event: content_block_delta\r\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: json } })}\r\n\r\n`,
          'event: message_delta\r\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\r\n\r\n'
        ])
      };
    }
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(result.requirements[0].name, "Python");
  assert.equal(attempts, 1, "and it must not have taken a second run to get there");
});

test("a stream shape we cannot read fails once, instead of being retried", async () => {
  // A reply that genuinely says nothing still arrives as events, so parsing none of
  // them means the format beat the reader — our bug, not the provider's. Reported as
  // emptiness it would be retried, and the retry reads the same unreadable format:
  // two full generations, two charges, and an error naming neither cause.
  let attempts = 0;
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => {
      attempts += 1;
      return { ok: true, status: 200, body: rawBody(["<html>a proxy said something else entirely</html>"]) };
    }
  });
  await assert.rejects(
    () => client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6")),
    (error) => error.code === "providerStreamUnreadable"
  );
  assert.equal(attempts, 1, "one run, not two");
});

test("a gateway that ignores the stream request is still read", async () => {
  // Some proxies answer a stream request with one whole JSON body. Left unhandled
  // that reads as an empty stream, and an empty reply is retried once — so the user
  // pays twice to be told "the provider returned no text at all", which names
  // nothing they can act on.
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: rawBody([JSON.stringify({ content: [{ type: "text", text: JSON.stringify(validEvidence()) }] })])
    })
  });
  const { result } = await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(result.requirements[0].name, "Python");
});

test("the idle deadline starts at the first byte, not at the request", () => {
  // A proxy that buffers the stream sends nothing and then everything. Running the
  // idle clock from the request would cut those connections off at 90s — making
  // streaming a regression for exactly the setups that are already most fragile.
  // Before the first byte, only the absolute ceiling can judge the silence.
  const source = readFileSync(new URL("../src/ai/directApiClient.js", import.meta.url), "utf8");
  const read = source.slice(source.indexOf("async function readEventStream"), source.indexOf("function parseEventFrame"));
  assert.match(read, /let lastByteAt = 0;/, "the clock must start unset, not at Date.now()");
  assert.match(read, /if \(lastByteAt && Date\.now\(\) - lastByteAt >= STREAM_IDLE_TIMEOUT_MS\)/);
  assert.match(read, /clearInterval\(idle\)/, "and the watchdog must be cleared however the read ends");
});

/** Splits a JSON body the way a provider splits it: into many small deltas. */
function chunk(text, size = 64) {
  return text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g")) || [];
}

function sseBody(frames) {
  return rawBody(frames.map((frame) => `${frame}\n\n`));
}

/** A minimal ReadableStream stand-in: what response.body exposes to the reader. */
function rawBody(pieces) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index >= pieces.length) return { done: true, value: undefined };
          return { done: false, value: encoder.encode(pieces[index++]) };
        }
      };
    }
  };
}

test("a provider that rejects the schema is retried without it rather than failing", async () => {
  // On OpenAI, because it is the provider that still sends a schema. Run against an
  // Anthropic model this asserted a retry that dropped a structured-output config
  // the request never carried — two attempts and a green tick, testing nothing.
  const sent = [];
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async (url, options) => {
      sent.push(JSON.parse(options.body));
      if (sent.length === 1) return { ok: false, status: 400, async json() { return { error: { message: "text.format json_schema is not supported for this model" } }; } };
      return { ok: true, status: 200, async json() { return { output_text: JSON.stringify(validEvidence()) }; } };
    }
  });
  const response = await client.runTask(apiRequest("openai-api", "gpt-5"));
  assert.equal(sent.length, 2, "it must retry once without the structured-output config");
  assert.ok(sent[0].text?.format, "the first attempt carries the schema");
  assert.equal(sent[1].text, undefined, "and the retry is the same request with the schema dropped");
  assert.ok(response.result, "and still delivers an analysis");
});

test("a truncated Anthropic reply says what to do about it", async () => {
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { stop_reason: "max_tokens", content: [{ type: "text", text: '{"overview":' }] }; } })
  });
  await assert.rejects(() => client.runTask(apiRequest("anthropic-api", "claude-opus-4-6")), /ran out of output space/);
});

test("DeepSeek goes only to its own endpoint, with the key request-only", async () => {
  const calls = [];
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body), headers: options.headers });
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] }; } };
    }
  });
  const response = await client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash"));

  assert.ok(response.result, "the panel reads response.result for every provider");
  assert.equal(response.provider, "deepseek-api");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].headers.authorization, "Bearer session-test-api-key-123");
  assert.equal(calls[0].body.model, "deepseek-v4-flash");
  // json_object gives valid JSON but no schema; the shape is enforced by the parser.
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  assert.equal(JSON.stringify(calls[0].body).includes("session-test-api-key-123"), false);
});

test("DeepSeek falls back to plain prompting if json_object is refused", async () => {
  let attempts = 0;
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: async (url, options) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 400, async json() { return { error: { message: "response_format is not supported" } }; } };
      assert.equal(JSON.parse(options.body).response_format, undefined, "the retry must drop response_format");
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] }; } };
    }
  });
  const response = await client.runTask(apiRequest("deepseek-api", "deepseek-v4-pro"));
  assert.equal(attempts, 2);
  assert.ok(response.result);
});

test("all three providers answer with the same envelope", async () => {
  const { API_PROVIDERS } = await import("../src/ai/models.js");
  const replies = {
    "openai-api": { output_text: JSON.stringify(validEvidence()) },
    "anthropic-api": { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] },
    "deepseek-api": { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] }
  };
  for (const provider of API_PROVIDERS) {
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; } },
      fetchImpl: async () => ({ ok: true, status: 200, async json() { return replies[provider]; } })
    });
    const response = await client.runTask(apiRequest(provider, undefined));
    assert.deepEqual(Object.keys(response).sort(), ["meta", "provider", "requestId", "result", "status"], `${provider} envelope`);
    assert.equal(response.result.requirements[0].name, "Python", `${provider} must deliver the analysis`);
  }
});

test("a transport failure keeps the underlying cause", () => {
  // "could not be reached" alone hides whether it was DNS, TLS, a proxy, or the
  // network — which is the entire diagnosis. Verified while debugging a real
  // UND_ERR_CONNECT_TIMEOUT that the message had swallowed.
  const source = readFileSync(new URL("../src/ai/directApiClient.js", import.meta.url), "utf8");
  assert.match(source, /error\?\.cause\?\.code \|\| error\?\.cause\?\.message \|\| error\?\.message/);
  assert.match(source, /could not be reached \(\$\{String\(cause\)/);
});

test("an HTTP error keeps its status when the body is not JSON", async () => {
  // Rate limits and outages usually arrive as an edge or proxy HTML page. Parsing
  // the body before checking the status erased the one fact that told the user
  // whether to wait, slow down, or fix their key.
  const failWith = async (status) => {
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; }, async request() { return true; } },
      fetchImpl: async () => ({ ok: false, status, async json() { throw new SyntaxError("Unexpected token <"); } })
    });
    return client.runTask(apiRequest()).then(() => "", (error) => error.message);
  };
  assert.match(await failWith(429), /429/);
  assert.match(await failWith(429), /rate limit/i);
  assert.match(await failWith(503), /503/);
  assert.match(await failWith(401), /key/i);
});

test("a chat-completions reply cut off by the token budget says so", async () => {
  // DeepSeek has the smallest output budget of any model offered and reports
  // truncation per choice, so it was the model most likely to truncate and the only
  // one that reported it as "did not return valid JSON".
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; }, async request() { return true; } },
    fetchImpl: async () => ({ ok: true, status: 200, async json() {
      return { choices: [{ finish_reason: "length", message: { content: '{"overview":' } }] };
    } })
  });
  await assert.rejects(() => client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash")), /ran out of output space/);
});

test("a body that never arrives is still bounded by the request timeout", async () => {
  // fetch() resolves on headers, so cancelling the abort there left a stalled body
  // with nothing to interrupt it: the panel's elapsed counter climbed past the
  // timeout forever and the run button never came back.
  const source = readFileSync(new URL("../src/ai/directApiClient.js", import.meta.url), "utf8");
  const send = source.slice(source.indexOf("async function sendJson"), source.indexOf("function statusMessage"));
  assert.match(send, /const timer = setTimeout/);
  assert.match(send, /await response\.json\(\)/);
  // One finally, after the body has been read — not one per phase.
  assert.equal((send.match(/clearTimeout\(timer\)/g) || []).length, 1);
  assert.ok(send.indexOf("await response.json()") < send.indexOf("clearTimeout(timer)"), "the body must be read while the deadline still applies");
});

test("DeepSeek is asked not to think, because the answer has to be the JSON", async () => {
  // Thinking defaults to enabled on V4 and its output goes to reasoning_content, not
  // content — and DeepSeek documents that JSON mode "may occasionally return empty
  // content". The retired deepseek-chat was this model's non-thinking mode, which is
  // the configuration that was working before the rename.
  const sent = [];
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; }, async request() { return true; } },
    fetchImpl: async (url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] }; } };
    }
  });
  await client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash"));
  assert.deepEqual(sent[0].thinking, { type: "disabled" });
  assert.deepEqual(sent[0].response_format, { type: "json_object" });
  assert.equal(sent[0].model, "deepseek-v4-flash");
});

test("an empty provider reply is retried exactly once, and nothing else is", async () => {
  const attempt = (replies) => {
    let calls = 0;
    const client = createDirectApiClient({
      permissionsApi: { async contains() { return true; }, async request() { return true; } },
      fetchImpl: async () => {
        const reply = replies[Math.min(calls, replies.length - 1)];
        calls += 1;
        return { ok: true, status: 200, async json() { return reply; } };
      }
    });
    return { client, calls: () => calls };
  };

  // Empty first, real answer second: the user gets the analysis they already paid for.
  const empty = { choices: [{ message: { content: "" } }] };
  const answered = { choices: [{ message: { content: JSON.stringify(validEvidence()) } }] };
  const recovering = attempt([empty, answered]);
  const response = await recovering.client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash"));
  assert.ok(response.result, "the retry's answer must be used");
  assert.equal(recovering.calls(), 2);

  // Empty twice: it fails rather than looping, and says the response was empty.
  const persistent = attempt([empty]);
  await assert.rejects(
    () => persistent.client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash")),
    (error) => error.code === "OUTPUT_EMPTY"
  );
  assert.equal(persistent.calls(), 2, "one retry, not a loop");

  // Malformed JSON is an answer, not an absence: repeating it costs twice for the same result.
  const garbage = attempt([{ choices: [{ message: { content: "not json at all" } }] }]);
  await assert.rejects(() => garbage.client.runTask(apiRequest("deepseek-api", "deepseek-v4-flash")));
  assert.equal(garbage.calls(), 1, "invalid JSON must not be retried");
});

test("Anthropic is called with the header a browser origin requires", async () => {
  // Without it the API refuses every request from the panel: "CORS requests must set
  // 'anthropic-dangerous-direct-browser-access' header". Confirmed against the live
  // preflight, which lists this name in access-control-allow-headers.
  let headers;
  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; }, async request() { return true; } },
    fetchImpl: async (url, options) => {
      headers = options.headers;
      return { ok: true, status: 200, async json() { return { content: [{ type: "text", text: JSON.stringify(validEvidence()) }] }; } };
    }
  });
  await client.runTask(apiRequest("anthropic-api", "claude-sonnet-4-6"));
  assert.equal(headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(headers["anthropic-version"], "2023-06-01");
  // The preflight allows exactly these four names; anything else fails CORS before
  // the request is ever sent, and the failure would look like a network error.
  assert.deepEqual(Object.keys(headers).sort(), ["anthropic-dangerous-direct-browser-access", "anthropic-version", "content-type", "x-api-key"]);
});

test("an Anthropic reply is read even if its text sits deeper than expected", async () => {
  // This is the one provider that cannot be run against its live endpoint from here,
  // so an unfamiliar response shape should degrade into a search rather than into
  // "the provider returned nothing". The deep pass reads the same block shape, so it
  // cannot invent text that was never sent.
  const { extractAnthropicJsonPayload } = await import("../src/ai/providerPayload.js");
  const body = '{"ok":1}';
  assert.equal(extractAnthropicJsonPayload({ content: [{ type: "text", text: body }] }), body);
  // Thinking blocks are skipped rather than concatenated into the JSON.
  assert.equal(extractAnthropicJsonPayload({ content: [{ type: "thinking", thinking: "…" }, { type: "text", text: body }] }), body);
  assert.equal(extractAnthropicJsonPayload({ output: { blocks: [{ type: "text", text: body }] } }), body);
  // An genuinely empty reply is still an error, not an empty analysis.
  assert.throws(() => extractAnthropicJsonPayload({ content: [] }), (error) => error.code === "OUTPUT_EMPTY");
});
