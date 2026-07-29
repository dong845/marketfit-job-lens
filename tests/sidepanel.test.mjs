import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
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

test("no provider is preselected, and every offered provider is a real one", async () => {
  const { API_PROVIDERS } = await import("../src/ai/models.js");
  assert.match(html, /<option value="" data-i18n="chooseProvider">/);
  assert.match(script, /fields\.agentProvider\.value = ""/);

  // Scope to the provider select; the panel has other dropdowns.
  const select = html.slice(html.indexOf('id="agentProvider"'), html.indexOf("</select>", html.indexOf('id="agentProvider"')));
  const offered = [...select.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
  assert.deepEqual(offered.sort(), [...API_PROVIDERS].sort(), "the dropdown must match the registry exactly");
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

test("the local bridge is gone from every surface", () => {
  // The CLI route was removed: it needed a separate server, a pairing dance that
  // broke on restart, and it was far slower than the API path on a real posting.
  for (const source of [html, script, readFileSync(join(root, "src/sidepanel/sidepanel.css"), "utf8")]) {
    assert.equal(/bridge|pairing|codex|claude-code/i.test(source), false, "no bridge remnants may remain");
  }
  assert.equal(existsSync(join(root, "src/bridge")), false);
  assert.equal(existsSync(join(root, "bridge")), false);
});

test("selecting a provider requests only that provider's domain", async () => {
  const { DIRECT_PROVIDER_ORIGINS } = await import("../src/ai/directApiClient.js");
  const { API_PROVIDERS } = await import("../src/ai/models.js");
  for (const provider of API_PROVIDERS) {
    assert.ok(DIRECT_PROVIDER_ORIGINS[provider], `${provider} needs a declared origin`);
    assert.match(DIRECT_PROVIDER_ORIGINS[provider], /^https:\/\/[^/]+\/\*$/);
  }
  // Origins are optional and asked for per provider, never granted up front.
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal("host_permissions" in manifest, false);
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

test("analysis rendering lives in its own module, not inline in the panel", () => {
  // Kept pure and separate so the layout is testable without a live DOM;
  // tests/analysisView.test.mjs asserts the output itself.
  assert.match(script, /import \{ escapeHtml, renderAnalysisHtml \} from "\.\.\/ui\/analysisView\.js"/);
  assert.match(script, /function renderAnalysis\(evidence\) \{ fields\.result\.innerHTML = renderAnalysisHtml\(evidence, locale, declaredCandidate\(\)/);
  assert.equal(script.includes("function renderRequirements"), false);
});

test("pasted job text survives the analyze click that used to destroy it", () => {
  // The loop: capture fails, the panel offers "Edit job text", the user pastes the
  // JD — which has no URL because capture failed — and clicking Analyze sent it back
  // through the same capture, which cleared it. An unbreakable loop on exactly the
  // pages the manual fallback exists for.
  const resolve = script.slice(script.indexOf("async function resolveJobForAnalysis"), script.indexOf("function getProfile"));
  assert.match(resolve, /if \(!currentJob\) return captureCurrentJob\(\)/);
  assert.match(resolve, /manual_paste.*return currentJob/s);
  assert.ok(resolve.indexOf("manual_paste") < resolve.indexOf("if (!currentJob.url)"), "pasted text must be honoured before any URL check");
});

test("a finished analysis is brought into view instead of left below a screen of form", () => {
  // The result is the last element on the page, under roughly a full viewport of
  // provider, key, model and help text — so finishing left the reader looking at
  // their own API-key field.
  assert.match(script, /function revealResult/);
  assert.match(script, /panel\.open = false/);
  assert.match(script, /fields\.result\.scrollIntoView/);
  const run = script.slice(script.indexOf("async function runAgentReview"), script.indexOf("function renderAnalysis"));
  assert.match(run, /void recordDuration/, "timing bookkeeping must not be awaited");
  assert.ok(run.indexOf("renderAnalysis(lastAgentEvidence)") < run.indexOf("void recordDuration"), "the result must be shown before the timing bookkeeping");
});

test("a run in progress owns the result area", () => {
  // lastAgentEvidence is deliberately null while a run is in flight, so re-rendering
  // from either of these replaced the live progress message with an empty state —
  // or, on clear, put the cleared analysis back on screen with its report button.
  const locale = script.slice(script.indexOf("function applyLocale"), script.indexOf("async function loadResumePdf"));
  assert.match(locale, /if \(agentRunActive\) return/);
  const clear = script.slice(script.indexOf("async function clearSession"), script.indexOf("async function clearStoredReports"));
  assert.match(clear, /if \(agentRunActive\)/);
});

test("the version badge survives translation", () => {
  // applyTranslations assigns textContent, which deletes child elements: with
  // data-i18n on the h1, the version span inside it was destroyed at boot — and the
  // badge exists precisely to tell "not fixed" from "not reloaded".
  const heading = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
  assert.match(heading, /<span data-i18n="appTitle">/);
  assert.match(heading, /id="appVersion"/);
  assert.equal(/<h1[^>]*data-i18n/.test(heading), false, "data-i18n on the h1 wipes everything nested in it");
});

test("each provider explains where its key comes from, and what will block it", async () => {
  const { API_PROVIDERS, PROVIDER_CONSOLES } = await import("../src/ai/models.js");
  const { MESSAGES } = await import("../src/ui/i18n.js");
  for (const provider of API_PROVIDERS) {
    const key = `apiKeyHelp${provider.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`;
    for (const locale of ["en", "zh"]) {
      assert.ok(MESSAGES[locale][key], `${provider} has no ${locale} key hint`);
      // Creating a key is not the step that stops people — an unfunded account is.
      assert.match(MESSAGES[locale][key], locale === "zh" ? /余额|充值/ : /credit|balance/);
    }
    const console = PROVIDER_CONSOLES[provider];
    assert.ok(console?.url, `${provider} has no console URL`);
    assert.doesNotThrow(() => new URL(console.url));
    assert.equal(new URL(console.url).protocol, "https:");
  }
});

test("a console link is a link, never somewhere the extension sends data", () => {
  // The privacy claim is that the CV and job text reach exactly three API hosts.
  // These URLs must stay in the markup, not in a fetch.
  const client = readFileSync(join(root, "src/ai/directApiClient.js"), "utf8");
  for (const url of ["platform.openai.com", "platform.claude.com", "platform.deepseek.com"]) {
    assert.equal(client.includes(url), false, `${url} must never appear in the API client`);
  }
  // Built from DOM nodes, so a link is never assembled by string concatenation.
  const help = script.slice(script.indexOf("function renderApiKeyHelp"), script.indexOf("function renderApiKeyWarning"));
  assert.match(help, /document\.createElement\("a"\)/);
  assert.match(help, /link\.rel = "noopener noreferrer"/);
  assert.equal(/innerHTML/.test(help), false);
});

test("an Anthropic key pasted under another provider is called out, and nothing else is", () => {
  // OpenAI and DeepSeek keys share the sk- prefix, so no claim may be made there:
  // a warning that fires on a correct key is worse than no warning at all.
  const warn = script.slice(script.indexOf("function renderApiKeyWarning"), script.indexOf("function updateApiModelOptions"));
  assert.match(warn, /anthropic-api/);
  assert.equal(/startsWith\("sk-"\)/.test(warn), false, "sk- alone cannot identify a provider");
  assert.match(warn, /fields\.apiKeyWarning\.hidden = !mismatched/);
});

test("the profile asks only for what changes the analysis", () => {
  // A control that looks like it personalises the analysis and does not is worse
  // than no control. Target market was inert everywhere — model, renderer, report —
  // so it is gone, and CV conventions now follow the posting's own location.
  assert.equal(html.includes('id="market"'), false);
  assert.equal(script.includes("targetMarket"), false);
  // What remains must still reach the request.
  assert.match(script, /candidate: \{ workAuthorization: fields\.workAuthorization\.value \}/);
});
