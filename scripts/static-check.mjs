import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceFiles = collect(join(root, "src")).filter((file) => file.endsWith(".js"));
const bridgeFiles = collect(join(root, "bridge/src")).filter((file) => file.endsWith(".js"));
for (const file of [...sourceFiles, ...bridgeFiles]) execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
// "permissions" is not a recognized Chrome permission — chrome.permissions needs no
// declaration, and declaring it makes Chrome show an "unknown permission" install warning.
assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting", "sidePanel", "storage", "tabs"].sort());
assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1/*"], "Only the loopback Local AI Bridge is allowed.");
assert.deepEqual(manifest.optional_host_permissions, ["http://*/*", "https://*/*"], "Website access must remain optional and requested per site.");

const analyzer = readFileSync(join(root, "src/shared/analyzer.js"), "utf8");
assert.equal(analyzer.includes("totalScore"), false, "The legacy total-score entry point must stay removed.");
const bridgeClientSource = readFileSync(join(root, "src/bridge/bridgeClient.js"), "utf8");
const directApiSource = readFileSync(join(root, "src/ai/directApiClient.js"), "utf8");
assert.match(bridgeClientSource, /http:\/\/127\.0\.0\.1/, "CLI requests must target loopback only.");
assert.match(directApiSource, /https:\/\/api\.openai\.com\/v1\/responses/, "OpenAI direct requests must target only the official API endpoint.");
assert.match(directApiSource, /https:\/\/api\.anthropic\.com\/v1\/messages/, "Anthropic direct requests must target only the official API endpoint.");
const directApiHosts = [...directApiSource.matchAll(/https:\/\/[^"`\s]+/g)].map((match) => match[0]);
assert.deepEqual(directApiHosts.sort(), ["https://api.anthropic.com/*", "https://api.anthropic.com/v1/messages", "https://api.openai.com/*", "https://api.openai.com/v1/responses"], "Direct API code may contain only the two selected provider domains.");
const allBridge = bridgeFiles.map((file) => readFileSync(file, "utf8")).join("\n");
assert.equal(/shell\s*:\s*true/.test(allBridge), false, "Bridge subprocesses must never use a shell.");
assert.match(readFileSync(join(root, "bridge/src/server.js"), "utf8"), /host\s*=\s*"127\.0\.0\.1"/, "Bridge must bind loopback by default.");
assert.equal(existsSync(join(root, "vendor/pdfjs/pdf.mjs")), true, "The PDF parser must be bundled locally.");
assert.equal(existsSync(join(root, "vendor/pdfjs/pdf.worker.mjs")), true, "The PDF worker must be bundled locally.");
// Chrome ignores SVG icons, so every declared icon must exist as a rendered PNG.
for (const path of Object.values(manifest.icons)) {
  assert.equal(existsSync(join(root, path)), true, `Declared icon is missing: ${path}`);
  assert.match(path, /\.png$/, `Chrome cannot use a non-PNG icon: ${path}`);
}

console.log(`Static checks passed for ${sourceFiles.length} extension modules and ${bridgeFiles.length} bridge modules`);

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(join(directory, entry.name)) : [join(directory, entry.name)]);
}
