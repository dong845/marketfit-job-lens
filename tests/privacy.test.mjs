import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildRemoteTransmissionPreview } from "../src/privacy/redaction.js";
import { LATEST_KEY, buildReportPayload, reportKey, storedReportKeys } from "../src/report/payload.js";

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

test("the only persisted keys are the interface language and timing estimates", () => {
  const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  assert.match(sidepanel, /const LOCALE_KEY = "marketfit\.locale\.v1"/);
  assert.match(sidepanel, /const TIMING_KEY = "marketfit\.timing\.v1"/);
  // Reports live in session storage and go with the browser session.
  assert.match(sidepanel, /chrome\.storage\?\.session \|\| chrome\.storage\?\.local/);
});

test("clearing the session removes the API key and every stored report", () => {
  const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  const clear = sidepanel.slice(sidepanel.indexOf("async function clearSession"), sidepanel.indexOf("async function clearStoredReports"));
  assert.match(clear, /fields\.apiKey\.value = ""/);
  assert.match(clear, /resume = null/);
  // It used to remove three key names nothing ever wrote, so clearing cleared
  // nothing while reporting success. Reports are what an analysis leaves behind.
  assert.match(clear, /await clearStoredReports\(\)/);
  const removal = sidepanel.slice(sidepanel.indexOf("async function clearStoredReports"), sidepanel.indexOf("function renderCurrentJobSummary"));
  assert.match(removal, /chrome\.storage\.session/);
  assert.match(removal, /chrome\.storage\.local/);
  assert.match(removal, /storedReportKeys/);
});

test("stored report keys are found in both storage areas, and nothing else is touched", () => {
  assert.deepEqual(
    storedReportKeys({ [reportKey("a")]: {}, [LATEST_KEY]: "a", "marketfit.locale.v1": "en", "marketfit.timing.v1": {} }).sort(),
    [LATEST_KEY, reportKey("a")].sort()
  );
  assert.deepEqual(storedReportKeys({}), []);
});

test("a stored report carries no CV text, because nothing renders the quotes", () => {
  const evidence = {
    overview: { jobFocus: "Reconstruction.", evidence: [{ source: "resume", ref: "CV-001", quote: "A. User · user@example.com · +31 6 1234 5678" }] },
    requirements: [{ name: "PyTorch", match: "strong", evidence: [{ source: "resume", ref: "CV-002", quote: "Built PyTorch reconstruction at Example Health, 2019-2024" }] }]
  };
  const payload = buildReportPayload({ evidence, job: { title: "Engineer", url: "https://example.com/j/1" }, provider: "openai-api", model: "gpt-5-mini", locale: "en", generatedAt: "2026-07-25T00:00:00.000Z" });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("user@example.com"), false);
  assert.equal(serialized.includes("Example Health"), false);
  // The ref survives: it is what keeps a claim traceable, and it is not content.
  assert.equal(payload.evidence.requirements[0].evidence[0].ref, "CV-002");
  assert.equal(payload.evidence.requirements[0].name, "PyTorch");
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
