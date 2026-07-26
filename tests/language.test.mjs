import assert from "node:assert/strict";
import test from "node:test";
import { MESSAGES, errorText, optionKey, t } from "../src/ui/i18n.js";
import { DirectApiError } from "../src/ai/directApiClient.js";
import { ResumePdfError } from "../src/profile/pdfValidation.js";
import { BridgeError } from "../src/ai/schema.js";
import { CAPTURE_METHODS } from "../src/extraction/schema.js";

/**
 * Chinese means all Chinese; English means all English.
 *
 * Errors are built in the provider, PDF and schema layers, which have no locale, so
 * they used to carry an English sentence that the panel rendered verbatim — a
 * Chinese user hit an English wall the moment anything went wrong. They now carry a
 * code, and the sentence is chosen here.
 */

const HAS_LATIN_WORDS = /\b[A-Za-z]{3,}\b/;
// {placeholder} names are template slots, not prose the reader ever sees.
const PLACEHOLDERS = /\{\w+\}/g;
// Names that keep their own spelling in any language.
const PROPER_NOUNS = /MarketFit|OpenAI|Anthropic|DeepSeek V4 Flash|DeepSeek V4 Pro|DeepSeek|Claude|Sonnet|Opus|GPT-5 mini|GPT|PyTorch|Kubernetes|Greenhouse|Lever|Workday|API|Key|PDF|HTTP|JSON|JD|MB|AI|CV/g;
// Labels the reader will literally see on a third-party console, which renders in
// English whatever language this panel is in. Translating "Settings" would send a
// Chinese reader looking for a button that does not exist under that name.
const CONSOLE_LABELS = /API keys|Settings/g;
// Literal key prefixes. "sk-ant-" reads as the word "ant" once hyphens are treated
// as word boundaries, which is a quirk of the check rather than an English leak.
const KEY_PREFIXES = /sk-ant-|sk-/g;
const prose = (value) => String(value).replace(PLACEHOLDERS, "").replace(CONSOLE_LABELS, "").replace(KEY_PREFIXES, "").replace(PROPER_NOUNS, "");

test("every Chinese string is Chinese, apart from names that have no translation", () => {
  const leaks = Object.entries(MESSAGES.zh)
    .filter(([, value]) => HAS_LATIN_WORDS.test(prose(value)))
    .map(([key, value]) => `${key}: ${value}`);
  assert.deepEqual(leaks, [], "these zh strings still contain English prose");
});

test("both locales define exactly the same keys", () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.zh).sort());
});

test("a provider failure is reported in the reader's language, with its details", () => {
  const rateLimited = new DirectApiError("The AI provider is rate limiting this key (HTTP 429).", "providerRateLimited", { status: 429 });
  assert.match(errorText("zh", rateLimited), /限流/);
  assert.match(errorText("zh", rateLimited), /429/, "the status still has to reach the user");
  assert.match(errorText("en", rateLimited), /rate limiting/);
  assert.equal(HAS_LATIN_WORDS.test(prose(errorText("zh", rateLimited))), false);

  const unreachable = new DirectApiError("could not be reached", "providerUnreachableCause", { cause: "ENOTFOUND" });
  assert.match(errorText("zh", unreachable), /无法连接.*ENOTFOUND/);
});

test("PDF and schema failures are translated the same way", () => {
  assert.match(errorText("zh", new ResumePdfError("too large", "pdfTooLarge", { mb: 8 })), /太大.*8 MB/);
  assert.match(errorText("zh", new ResumePdfError("no text", "pdfNoText")), /扫描件/);
  assert.match(errorText("zh", new BridgeError("OUTPUT_TRUNCATED", "ran out of output space")), /输出空间/);
  assert.match(errorText("en", new BridgeError("OUTPUT_TRUNCATED", "ran out of output space")), /output space/);
});

test("an error with no code falls back to its own message rather than to a key name", () => {
  // A provider's refusal text is the model speaking, already in the language it was
  // asked to write in; replacing it with a generic would lose what it said.
  assert.equal(errorText("zh", new Error("模型拒绝作答的具体理由")), "模型拒绝作答的具体理由");
  assert.equal(errorText("zh", null), t("zh", "analysisFailed"));
  assert.equal(errorText("zh", {}, "pdfFailed"), t("zh", "pdfFailed"));
});

test("every capture method has a label, so none reaches the panel as a raw token", () => {
  for (const token of Object.values(CAPTURE_METHODS)) {
    const key = `method${token.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())}`;
    for (const locale of ["en", "zh"]) {
      assert.notEqual(t(locale, key), key, `${token} has no ${locale} label`);
      assert.equal(t(locale, key).includes("_"), false, `${token}'s ${locale} label is still a token`);
    }
  }
});

test("evidence block IDs never reach the prose the reader sees", async () => {
  // The prompt asks models not to cite CV-001 / JD-004 inline and they mostly comply,
  // which is the problem: a rule that holds most of the time still ships "（JD-001）"
  // into the middle of a Chinese sentence. Only this layer can guarantee it.
  const { parseAgentEvidence, parseTaskRequest } = await import("../src/ai/schema.js");
  const request = parseTaskRequest({
    requestId: "lang-1", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    options: { model: "gpt-5-mini", language: "zh" },
    input: { resumeText: "在 PyTorch 中实现 4D cine MRI 重建。", job: { title: "E", description: "必须精通 PyTorch。" }, candidate: {} }
  });
  const parsed = parseAgentEvidence({
    recommendation: { verdict: "stretch", headline: "值得一投（CV-001）", rationale: "r", effort: "evening", effortNote: "投递前无法满足（JD-001, CV-002）", decisiveFactor: "d" },
    overview: { jobFocus: "重建工程 CV-001", candidatePositioning: "b", fitNarrative: "c", evidence: [{ ref: "CV-001" }] },
    requirements: [{ name: "PyTorch", level: "required", match: "strong", explanation: "招聘要求明确列出（JD-001）；简历有对应记录 CV-001。", evidence: [{ ref: "CV-001" }] }],
    strengths: [], gaps: [], risks: [], resumeTailoring: [], interviewFocus: [], uncertainties: [], suggestedActions: []
  }, request);

  const prose = JSON.stringify([parsed.recommendation, parsed.overview.jobFocus, parsed.requirements[0].explanation]);
  assert.equal(/(?:CV|JD)-\d{3}/.test(prose), false, `block IDs survived into prose: ${prose}`);
  assert.equal(parsed.requirements[0].explanation, "招聘要求明确列出；简历有对应记录。");
  assert.equal(parsed.recommendation.headline, "值得一投");
  // Grounding is untouched: the refs still travel in the evidence arrays.
  assert.equal(parsed.requirements[0].evidence[0].ref, "CV-001");
  assert.match(parsed.requirements[0].evidence[0].quote, /PyTorch/);
});

test("every option of every select resolves to a real string, in both languages", async () => {
  // t() answers a missing key with the key itself, so a key built one word off from
  // the value that reaches it renders as "authHelpStudentOrGraduate" on screen and
  // throws nothing. This walks the actual markup rather than a remembered list.
  const { readFileSync } = await import("node:fs");
  const { optionKey } = await import("../src/ui/i18n.js");
  const html = readFileSync(new URL("../src/sidepanel/sidepanel.html", import.meta.url), "utf8");
  const optionsOf = (selectId) => {
    const start = html.indexOf(`id="${selectId}"`);
    assert.ok(start > 0, `no select #${selectId}`);
    return [...html.slice(start, html.indexOf("</select>", start)).matchAll(/<option value="([^"]*)"/g)]
      .map((match) => match[1]).filter(Boolean);
  };

  for (const [prefix, selectId] of [["authHelp", "workAuthorization"], ["apiKeyHelp", "agentProvider"]]) {
    const values = optionsOf(selectId);
    assert.ok(values.length >= 3, `#${selectId} should offer options`);
    for (const value of values) {
      const key = optionKey(prefix, value.replaceAll("-", "_"));
      for (const locale of ["en", "zh"]) {
        assert.notEqual(t(locale, key), key, `#${selectId} option "${value}" has no ${locale} text (${key})`);
      }
    }
  }
});

test("optionKey builds the same name the panel asks for", () => {
  assert.equal(optionKey("authHelp", "student_or_graduate"), "authHelpStudentOrGraduate");
  assert.equal(optionKey("authHelp", "unknown"), "authHelpUnknown");
  assert.equal(optionKey("method", "schema_org_jsonld"), "methodSchemaOrgJsonld");
  assert.equal(optionKey("apiKeyHelp", "openai_api"), "apiKeyHelpOpenaiApi");
});
