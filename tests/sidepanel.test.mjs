import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(join(root, "src/sidepanel/sidepanel.html"), "utf8");
const script = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
const css = readFileSync(join(root, "src/sidepanel/sidepanel.css"), "utf8");

test("side panel uses one AI-first current-tab action", () => {
  assert.equal(html.includes('id="analyzeCurrentJob"'), false);
  assert.match(html, /id="agentPanel" open/);
  assert.match(html, /id="runAgentReview"/);
  assert.match(html, /id="refreshJobCapture"/);
  assert.match(html, /id="jobTextEditor"/);
  assert.match(script, /const job = await resolveJobForAnalysis\(\)/);
  assert.equal(script.includes("analyzeJobFit"), false);
  assert.equal(script.includes("renderLocalAnalysisMethod"), false);
});

test("API credentials and model choice are hidden until an API provider is selected", () => {
  assert.match(html, /id="agentProvider"><option value=""/);
  assert.match(script, /fields\.agentProvider\.value = ""/);
  const apiModeStart = html.indexOf('id="apiProviderMode"');
  const apiModeEnd = html.indexOf("</div>", apiModeStart);
  const apiMode = html.slice(apiModeStart, apiModeEnd + 6);
  assert.match(apiMode, /hidden/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(apiMode, /id="apiKey"/);
  assert.match(apiMode, /id="apiModel"/);
  assert.equal(apiMode.includes("apiBridgeState"), false);
  assert.equal(apiMode.includes("showBridgeConnection"), false);
  assert.match(script, /fields\.apiProviderMode\.hidden = !apiProvider/);
  assert.match(script, /fields\.apiModel\.replaceChildren\(\)/);
  assert.match(script, /async function handleProviderChange\(\)/);
  assert.match(script, /directApiClient\.requestAccess\(provider\)/);
  assert.match(script, /directApiClient\.hasAccess\(provider\)/);
  assert.match(script, /async function resolveJobForAnalysis\(\)/);
  assert.match(script, /async function toggleRedactionPreview\(\)/);
  assert.match(script, /const job = await resolveJobForAnalysis\(\)/);
  assert.match(script, /transport: isApiProvider\(provider\) \? "direct_provider_api"/);
  assert.match(script, /isSameJobPage\(currentJob\.url, tab\?\.url \|\| ""\) && hasUsableJobContent\(currentJob\)/);
  assert.match(script, /if \(!hasUsableJobContent\(job\)\)/);
  assert.match(script, /createManualJob/);
  assert.match(script, /isApiProvider\(provider\) \? await directApiClient\.runTask\(task, \{ accessVerified: true \}\) : await bridgeClient\.runTask\(task\)/);
  assert.match(script, /if \(agentRunActive\) return;/);
  assert.match(script, /agentRunActive = true;/);
  assert.match(script, /runAgentReview"\)\.disabled = true/);
  assert.match(script, /runAgentReview"\)\.disabled = false/);
  assert.match(script, /renderActionMessage\(t\(locale, "requestingAi"\)\)/);
  assert.match(script, /renderActionMessage\(message\)/);
  const reviewFunction = script.slice(script.indexOf("async function runAgentReview"), script.indexOf("function setStatus"));
  assert.equal(reviewFunction.includes('fields.apiKey.value = ""'), false);
  assert.match(script, /gpt-5-mini/);
  assert.match(script, /claude-opus-4-6/);
});
