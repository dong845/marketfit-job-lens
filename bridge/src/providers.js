import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAnalyzePrompt, buildClaudeInstruction, AGENT_SYSTEM_POLICY, outputSchemaJson, wireSchemaJson } from "./prompts.js";
import { BridgeError, parseAgentEvidence, parseJsonOutput } from "./schema.js";
import { extractAnthropicJsonPayload, extractOpenAiJsonPayload } from "./providerPayload.js";
import { modelConfig } from "./models.js";
import { runProcess } from "./process.js";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export function createProviderRouter({ fetchImpl = globalThis.fetch, runProcessImpl = runProcess } = {}) {
  return {
    async health() {
      const [codex, claudeCode] = await Promise.all([
        commandHealth("codex", ["--version"], runProcessImpl),
        commandHealth("claude", ["--version"], runProcessImpl)
      ]);
      return { codex, "claude-code": claudeCode, "openai-api": { available: true }, "anthropic-api": { available: true } };
    },
    async runTask(request) {
      if (request.provider === "codex") return runCodex(request, runProcessImpl);
      if (request.provider === "claude-code") return runClaude(request, runProcessImpl);
      if (request.provider === "openai-api") return runOpenAi(request, fetchImpl);
      if (request.provider === "anthropic-api") return runAnthropic(request, fetchImpl);
      throw new BridgeError("PROVIDER_INVALID", "The selected provider is not supported.");
    }
  };
}

async function runCodex(request, runProcessImpl) {
  return withTaskDirectory("marketfit-codex-", async (directory) => {
    const schemaPath = join(directory, "result-schema.json");
    const outputPath = join(directory, "result.json");
    await writeFile(schemaPath, outputSchemaJson(), "utf8");
    await runProcessImpl("codex", [
      "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only", "--skip-git-repo-check",
      "--output-schema", schemaPath, "--output-last-message", outputPath, "-"
    ], {
      cwd: directory,
      env: minimalEnvironment(),
      stdin: `${AGENT_SYSTEM_POLICY}\n\n${buildAnalyzePrompt(request)}`
    });
    return parseAgentEvidence(parseJsonOutput(await readFile(outputPath, "utf8")), request);
  });
}

async function runClaude(request, runProcessImpl) {
  return withTaskDirectory("marketfit-claude-", async (directory) => {
    const mcpPath = join(directory, "mcp.json");
    await writeFile(mcpPath, JSON.stringify({ mcpServers: {} }), "utf8");
    const args = [
      "-p", "--no-session-persistence", "--tools", "", "--setting-sources", "local", "--strict-mcp-config", "--mcp-config", mcpPath,
      "--system-prompt", AGENT_SYSTEM_POLICY, "--json-schema", outputSchemaJson(), "--output-format", "text", buildClaudeInstruction()
    ];
    const env = minimalEnvironment();
    const result = await runProcessImpl("claude", args, { cwd: directory, env, stdin: buildAnalyzePrompt(request) });
    return parseAgentEvidence(parseJsonOutput(extractJson(result.stdout)), request);
  });
}

async function runOpenAi(request, fetchImpl) {
  const model = modelConfig("openai-api", request.options.model);
  const response = await fetchWithTimeout(fetchImpl, OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${request.credential.apiKey}` },
    body: JSON.stringify({
      model: model.id,
      store: false,
      max_output_tokens: model.maxOutputTokens,
      instructions: AGENT_SYSTEM_POLICY,
      input: buildAnalyzePrompt(request),
      text: { format: { type: "json_schema", name: "marketfit_agent_evidence", strict: true, schema: JSON.parse(wireSchemaJson()) } }
    })
  });
  const payload = await jsonResponse(response);
  const output = extractOpenAiJsonPayload(payload);
  return parseAgentEvidence(parseJsonOutput(output), request);
}

async function runAnthropic(request, fetchImpl) {
  const model = modelConfig("anthropic-api", request.options.model);
  const outputConfig = model.structuredOutputs
    ? { format: { type: "json_schema", schema: JSON.parse(wireSchemaJson()) }, ...(model.effort ? { effort: model.effort } : {}) }
    : null;
  const response = await fetchWithTimeout(fetchImpl, ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": request.credential.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model.id,
      max_tokens: model.maxOutputTokens,
      system: AGENT_SYSTEM_POLICY,
      messages: [{ role: "user", content: buildAnalyzePrompt(request) }],
      ...(outputConfig ? { output_config: outputConfig } : {})
    })
  });
  const payload = await jsonResponse(response);
  const output = extractAnthropicJsonPayload(payload);
  return parseAgentEvidence(parseJsonOutput(output), request);
}

async function commandHealth(command, args, runProcessImpl) {
  try {
    const result = await runProcessImpl(command, args, { timeoutMs: 3000, env: minimalEnvironment() });
    return { available: true, version: result.stdout.trim() || result.stderr.trim() || "detected" };
  } catch {
    return { available: false };
  }
}

async function jsonResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new BridgeError("PROVIDER_FAILED", "Provider returned an unreadable response.", 502);
  }
  if (!response.ok) throw new BridgeError("PROVIDER_FAILED", providerMessage(payload), response.status >= 400 && response.status < 500 ? 400 : 502);
  return payload;
}

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new BridgeError("TASK_TIMEOUT", "The provider did not finish in time.", 504);
    throw new BridgeError("PROVIDER_FAILED", "The selected provider could not be reached.", 502);
  } finally {
    clearTimeout(timer);
  }
}

function providerMessage(payload) {
  return String(payload?.error?.message || payload?.message || "The selected provider rejected the request.").slice(0, 500);
}

function extractJson(value) {
  const text = String(value || "").trim();
  if (text.startsWith("{")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

async function withTaskDirectory(prefix, operation) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function minimalEnvironment(extra = {}) {
  const allowed = ["HOME", "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR"];
  const environment = Object.fromEntries(allowed.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
  return { ...environment, ...extra };
}
