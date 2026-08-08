import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKET_KEYS, conventionsFor } from "../src/market/conventions.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceFiles = collect(join(root, "src")).filter((file) => file.endsWith(".js"));
for (const file of sourceFiles) execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
// "permissions" is not a recognized Chrome permission — chrome.permissions needs no
// declaration, and declaring it makes Chrome show an "unknown permission" install warning.
assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting", "sidePanel", "storage", "tabs"].sort());
// No local bridge any more, so no loopback host permission is needed.
assert.equal("host_permissions" in manifest, false, "The extension must not request host permissions up front.");
assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"], "Website access must remain optional and requested per site.");

// The extension must not grow a second, non-AI scoring path: a keyword matcher
// presented as career advice is worse than no answer. Analysis comes from the
// model, with every claim tied to quoted CV or job-page text.
for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  assert.equal(/\btotalScore\b|\bfitScore\b/.test(source), false, `${file} reintroduces a local scoring path.`);
}
// The schema invites a length the parser must accept: text() throws above its own
// ceiling, so a lower parser limit silently rejects a reply we asked for.
const schemaSource = readFileSync(join(root, "src/ai/schema.js"), "utf8");
const bareCeilings = [...schemaSource.matchAll(/maxLength: (\d+)/g)].map((match) => match[1]);
assert.deepEqual(bareCeilings, [], `Field ceilings must come from FIELD_LIMITS, not literals: ${bareCeilings.join(", ")}`);
const bareParserCeilings = [...schemaSource.matchAll(/text\((?:item|overview|requirement|uncertainty|value)\.\w+,\s*[^,]+,\s*(\d{3,})\)/g)].map((match) => match[1]);
assert.deepEqual(bareParserCeilings, [], `Parser ceilings must come from FIELD_LIMITS: ${bareParserCeilings.join(", ")}`);

const directApiSource = readFileSync(join(root, "src/ai/directApiClient.js"), "utf8");
assert.match(directApiSource, /https:\/\/api\.openai\.com\/v1\/responses/, "OpenAI direct requests must target only the official API endpoint.");
assert.match(directApiSource, /https:\/\/api\.anthropic\.com\/v1\/messages/, "Anthropic direct requests must target only the official API endpoint.");
const directApiHosts = [...directApiSource.matchAll(/https:\/\/[^"`\s]+/g)].map((match) => match[0]);
assert.match(directApiSource, /https:\/\/api\.deepseek\.com\/chat\/completions/, "DeepSeek requests must target only the official API endpoint.");
assert.deepEqual(directApiHosts.sort(), [
  "https://api.anthropic.com/*", "https://api.anthropic.com/v1/messages",
  "https://api.deepseek.com/*", "https://api.deepseek.com/chat/completions",
  "https://api.openai.com/*", "https://api.openai.com/v1/responses"
], "Direct API code may contain only the three selected provider domains.");
assert.equal(existsSync(join(root, "vendor/pdfjs/pdf.mjs")), true, "The PDF parser must be bundled locally.");
assert.equal(existsSync(join(root, "vendor/pdfjs/pdf.worker.mjs")), true, "The PDF worker must be bundled locally.");
// Chrome ignores SVG icons, so every declared icon must exist as a rendered PNG.
for (const path of Object.values(manifest.icons)) {
  assert.equal(existsSync(join(root, path)), true, `Declared icon is missing: ${path}`);
  assert.match(path, /\.png$/, `Chrome cannot use a non-PNG icon: ${path}`);
}

console.log(`Static checks passed for ${sourceFiles.length} extension modules`);

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(join(directory, entry.name)) : [join(directory, entry.name)]);
}

// The conventions table is the one claim in the analysis with no evidence block
// behind it, so the one class of falsehood a machine can see is checked here rather
// than asked for in prose: a fabricated statistic. Nothing automated can check that
// a convention is TRUE — `why` and `added` exist so a person can review it — but a
// number in one of these could only have been invented, since no source is cited.
for (const marketKey of MARKET_KEYS) {
  for (const convention of conventionsFor(marketKey)) {
    for (const field of [convention.text.en, convention.text.zh, convention.appliesWhen]) {
      assert.equal(/[0-9%]/.test(field), false, `Market convention ${convention.id} states a number: ${field}`);
    }
  }
}
