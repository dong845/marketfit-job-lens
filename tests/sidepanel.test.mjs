import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { MESSAGES } from "../src/ui/i18n.js";

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
});

test("no provider is preselected, and the free CLI options come first", () => {
  assert.match(html, /<option value="" data-i18n="chooseProvider">/);
  assert.match(script, /fields\.agentProvider\.value = ""/);
  assert.ok(
    html.indexOf('id="cliProviderGroup"') < html.indexOf('id="apiProviderGroup"'),
    "CLI providers cost nothing to use, so they must be offered before the API-key ones."
  );
});

test("API credentials and model choice are hidden until an API provider is selected", () => {
  const apiMode = html.slice(html.indexOf('id="apiProviderMode"'), html.indexOf('id="runAgentReview"'));
  assert.match(apiMode, /hidden/);
  assert.match(apiMode, /id="apiKey"/);
  assert.match(apiMode, /id="apiModel"/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(script, /fields\.apiProviderMode\.hidden = !apiProvider/);
  assert.match(script, /fields\.apiModel\.replaceChildren\(\)/);
  // The key lives in the DOM for the session only; clearing it on run would break
  // repeat analyses, so assert it is never wiped inside the run path.
  const reviewFunction = script.slice(script.indexOf("async function runAgentReview"), script.indexOf("function setStatus"));
  assert.equal(reviewFunction.includes('fields.apiKey.value = ""'), false);
});

test("provider access is requested before anything else awaits in the run path", () => {
  // chrome.permissions.request() only prompts while the click's user gesture is
  // alive. Job capture awaits script injection, so a permission request ordered
  // after it silently fails and the user gets a dead end with no retry.
  const reviewFunction = script.slice(script.indexOf("async function runAgentReview"), script.indexOf("function setStatus"));
  const requestIndex = reviewFunction.indexOf("directApiClient.requestAccess");
  const captureIndex = reviewFunction.indexOf("await resolveJobForAnalysis");
  assert.ok(requestIndex > 0, "runAgentReview must request provider access itself");
  assert.ok(requestIndex < captureIndex, "provider access must be requested before job capture spends the gesture");

  // The change handler has the same constraint: its very first await must be the
  // permission request, or selecting a provider silently fails to prompt.
  const changeHandler = script.slice(script.indexOf("async function handleProviderChange"), script.indexOf("async function grantProviderAccess"));
  const firstAwait = changeHandler.indexOf("await ");
  assert.ok(firstAwait > 0, "handleProviderChange must await the permission request");
  assert.match(changeHandler.slice(firstAwait), /^await directApiClient\.requestAccess\(provider\)/);
});

test("a denied provider grant offers a retry instead of a dead end", () => {
  assert.match(html, /id="retryProviderAccess"/);
  assert.match(script, /byId\("retryProviderAccess"\)\.addEventListener\("click", grantProviderAccess\)/);
  assert.match(script, /fields\.accessRetryRow\.hidden = false/);
});

test("the free bridge route shows a runnable command and a default port", () => {
  assert.match(html, /id="bridgeCommand"/);
  assert.match(html, /id="copyBridgeCommand"/);
  // An empty port field meant the bridge picked a random one and the user had to
  // read it off stdout before pairing could work at all.
  assert.match(html, /id="bridgePort"[^>]*value="8765"/);
  assert.match(script, /const BRIDGE_COMMAND = "npm run bridge -- --port 8765"/);
  assert.match(script, /function markCliAvailability/);
});

test("every visible string is translatable in both locales", () => {
  const used = new Set([
    ...[...html.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)].map((match) => match[1]),
    ...[...script.matchAll(/\bt\(locale,\s*"([^"]+)"\)/g)].map((match) => match[1]),
    ...[...script.matchAll(/format\(locale,\s*"([^"]+)"/g)].map((match) => match[1])
  ]);
  for (const key of used) {
    assert.ok(MESSAGES.en[key], `missing English string: ${key}`);
    assert.ok(MESSAGES.zh[key], `missing Chinese string: ${key}`);
  }
  // The permission list used to be hardcoded English and stayed English in 中文.
  assert.match(html, /data-i18n="permActiveTab"/);
  assert.match(html, /data-i18n="permStorage"/);
});

test("every i18n key exists in both locales", () => {
  for (const key of Object.keys(MESSAGES.en)) assert.ok(MESSAGES.zh[key], `zh is missing ${key}`);
  for (const key of Object.keys(MESSAGES.zh)) assert.ok(MESSAGES.en[key], `en is missing ${key}`);
});

test("model choices come from the shared registry, not a second hardcoded list", () => {
  assert.match(script, /modelsForProvider\(provider\)/);
  assert.equal(script.includes("claude-sonnet-4-6"), false);
  assert.equal(script.includes("gpt-5-mini"), false);
});

test("analysis output escapes every model-supplied string", () => {
  const rendering = script.slice(script.indexOf("function renderAnalysis"), script.indexOf("// ------------------------------------------------------------------- bridge"));
  // Any ${...} interpolation in the rendering block must be wrapped or a
  // recognised safe helper; raw model text in innerHTML would be an injection.
  const interpolations = [...rendering.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1].trim());
  // renderItem is always one of the titleAndSummary-based callbacks, which escape
  // their own inputs; the rest either escape directly or compose escaped fragments.
  const safe = /^(escapeHtml|format|renderEvidence|renderCards|renderGroup|renderOverview|renderRequirements|renderActions|renderItem|textBlock|titleAndSummary|severityTag|rows|quotes|body|tag)\b/;
  for (const expression of interpolations) {
    assert.ok(safe.test(expression), `unescaped interpolation in analysis rendering: ${expression}`);
  }
});
