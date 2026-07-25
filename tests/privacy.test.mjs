import assert from "node:assert/strict";
import test from "node:test";
import { createStorageService, purgeExpired } from "../src/privacy/storageService.js";
import { buildRemoteTransmissionPreview } from "../src/privacy/redaction.js";

function memoryStorage() {
  const data = {};
  return {
    data,
    async get(key) { return { [key]: data[key] }; },
    async set(next) { Object.assign(data, next); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; }
  };
}

test("temporary mode does not save a profile and explicit save uses expiry", async () => {
  const storage = memoryStorage();
  const service = createStorageService(storage, () => new Date("2026-07-23T00:00:00.000Z"));
  const initial = await service.initialize();
  assert.equal(initial.mode, "temporary");
  assert.equal(initial.savedProfile, null);
  const saved = await service.saveProfile({ cvText: "Private CV evidence" }, 30);
  assert.equal(saved.mode, "local_profile");
  assert.equal(saved.savedProfile.expiresAt, "2026-08-22T00:00:00.000Z");
});

test("deleting all data leaves no CV/profile residue", async () => {
  const storage = memoryStorage();
  const service = createStorageService(storage);
  await service.initialize();
  await service.saveProfile({ cvText: "Sensitive resume text", targetRole: "Engineer" });
  await service.deleteAll();
  assert.equal(JSON.stringify(storage.data).includes("Sensitive resume text"), false);
  assert.equal(Object.keys(storage.data).some((key) => key.startsWith("marketfit.")), false);
});

test("expired saved profiles return to temporary mode", () => {
  const state = { mode: "local_profile", savedProfile: { profile: { cvText: "CV" }, expiresAt: "2026-01-01T00:00:00.000Z" } };
  const cleaned = purgeExpired(state, new Date("2026-07-23T00:00:00.000Z"));
  assert.equal(cleaned.mode, "temporary");
  assert.equal(cleaned.savedProfile, null);
});

test("initialization persists expiry cleanup instead of leaving CV data on disk", async () => {
  const storage = memoryStorage();
  storage.data["marketfit.state.v2"] = {
    mode: "local_profile",
    savedProfile: { profile: { cvText: "Expired private CV" }, expiresAt: "2026-01-01T00:00:00.000Z" },
    settings: { retentionDays: 90, remoteAnalysisEnabled: false, remoteConsent: false }
  };
  const service = createStorageService(storage, () => new Date("2026-07-23T00:00:00.000Z"));
  await service.initialize();
  assert.equal(JSON.stringify(storage.data).includes("Expired private CV"), false);
  assert.equal(storage.data["marketfit.state.v2"].savedProfile, null);
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
