import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildRemoteTransmissionPreview } from "../src/privacy/redaction.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? collect(join(directory, entry.name)) : [join(directory, entry.name)]);
}

/**
 * The panel tells users their CV and API key never leave it. There is no longer a
 * storage service to hold them — the persistence layer was removed along with the
 * local analysis engine — so the guarantee now rests on nothing ever writing them.
 * These tests assert that at the source level, since a regression would be a
 * silent privacy break rather than a visible failure.
 */
test("nothing writes CV text or an API key to extension storage", () => {
  const sources = collect(join(root, "src")).filter((file) => file.endsWith(".js"));
  const writes = [];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/storage\.\w+\.set\(([^;]*?)\)\s*;/gs)) {
      writes.push({ file: file.replace(`${root}`, ""), argument: match[1] });
    }
  }
  assert.ok(writes.length > 0, "expected to find the storage writes this test guards");
  for (const { file, argument } of writes) {
    assert.equal(/resume|cvText|apiKey|pairingCode/i.test(argument), false, `${file} writes sensitive data to storage: ${argument}`);
  }
});

test("the only persisted keys are the interface language and the bridge pairing", () => {
  const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  const bridge = readFileSync(join(root, "src/bridge/bridgeClient.js"), "utf8");
  assert.match(sidepanel, /const LOCALE_KEY = "marketfit\.locale\.v1"/);
  assert.match(bridge, /const BRIDGE_STATE_KEY = "marketfit\.bridge\.v1"/);
  // The bridge state is a port and a token, never a credential the user typed.
  const pair = bridge.slice(bridge.indexOf("async pair("), bridge.indexOf("async health("));
  assert.match(pair, /const state = \{ port: validPort, token: response\.token, pairedAt/);
  assert.equal(pair.includes("pairingCode:"), false, "the one-time pairing code must not be persisted");
});

test("clearing the session removes the API key and every personal storage key", () => {
  const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  const clear = sidepanel.slice(sidepanel.indexOf("async function clearSession"), sidepanel.indexOf("function renderCurrentJobSummary"));
  assert.match(clear, /fields\.apiKey\.value = ""/);
  assert.match(clear, /resume = null/);
  assert.match(clear, /chrome\.storage\.local\.remove\(PERSONAL_STORAGE_KEYS\)/);
  assert.match(clear, /bridgeClient\.disconnect\(\)/);
});

test("optional AI payload preview redacts common PII", () => {
  const preview = buildRemoteTransmissionPreview({ profile: { cvText: "A. User user@example.com +1 415 555 0123" }, job: { sourceText: "Apply at https://example.com" }, provider: "openai-api", transport: "direct_provider_api" });
  assert.equal(preview.profile.includes("user@example.com"), false);
  assert.equal(preview.job.includes("https://example.com"), false);
  assert.match(preview.note, /Preview only/i);
  assert.equal(preview.transport, "direct_provider_api");
  assert.equal(preview.note.includes("Local AI Bridge"), false);
});

test("CLI payload preview identifies the local Bridge route", () => {
  const preview = buildRemoteTransmissionPreview({ profile: { cvText: "CV" }, job: { sourceText: "JD" }, provider: "codex", transport: "local_cli_bridge" });
  assert.equal(preview.transport, "local_cli_bridge");
  assert.match(preview.note, /Local AI Bridge/);
});
