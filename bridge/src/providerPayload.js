import { BridgeError } from "./schema.js";

export const PROVIDER_OUTPUT_TOKEN_BUDGET = 7000;

export function extractOpenAiJsonPayload(payload) {
  if (payload?.status === "incomplete" || payload?.incomplete_details) {
    const reason = payload.incomplete_details?.reason ? ` Reason: ${payload.incomplete_details.reason}.` : "";
    throw new BridgeError("OUTPUT_TRUNCATED", `The AI provider output was truncated before JSON finished.${reason}`, 502);
  }
  const refusal = collectTextByTypes(payload, new Set(["refusal"]));
  if (refusal) throw new BridgeError("PROVIDER_REFUSED", refusal.slice(0, 500), 502);
  const text = [
    typeof payload?.output_text === "string" ? payload.output_text : "",
    collectTextByTypes(payload, new Set(["output_text", "text"])),
    collectChatCompletionText(payload)
  ].filter(Boolean).join("\n").trim();
  if (!text) throw new BridgeError("OUTPUT_UNTRUSTED", "The AI provider returned no JSON text.", 502);
  return text;
}

export function extractAnthropicJsonPayload(payload) {
  if (payload?.stop_reason === "max_tokens") {
    throw new BridgeError("OUTPUT_TRUNCATED", "The AI provider output was truncated before JSON finished.", 502);
  }
  const refusal = String(payload?.stop_reason || "").includes("refusal") ? collectAnthropicText(payload) : "";
  if (refusal) throw new BridgeError("PROVIDER_REFUSED", refusal.slice(0, 500), 502);
  const text = collectAnthropicText(payload);
  if (!text) throw new BridgeError("OUTPUT_UNTRUSTED", "The AI provider returned no JSON text.", 502);
  return text;
}

function collectTextByTypes(value, wantedTypes) {
  const found = [];
  visit(value, (item) => {
    if (!item || typeof item !== "object" || !wantedTypes.has(item.type)) return;
    if (typeof item.text === "string") found.push(item.text);
    else if (typeof item.content === "string") found.push(item.content);
    else if (typeof item.refusal === "string") found.push(item.refusal);
  });
  return found.join("\n").trim();
}

function collectAnthropicText(payload) {
  return (payload?.content || [])
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function collectChatCompletionText(payload) {
  return (payload?.choices || [])
    .map((choice) => choice?.message?.content || choice?.text || "")
    .filter((text) => typeof text === "string")
    .join("\n")
    .trim();
}

function visit(value, callback) {
  if (!value || typeof value !== "object") return;
  callback(value);
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, callback));
    return;
  }
  Object.values(value).forEach((item) => visit(item, callback));
}
