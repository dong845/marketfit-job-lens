import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { KEEP_REPORTS, LATEST_KEY, REPORT_PREFIX, buildReportPayload, expiredReportKeys, readReport, reportKey, reportUrl } from "../src/report/payload.js";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the query string is appended to the resolved URL, never handed to getURL", () => {
  // chrome.runtime.getURL() takes a path and percent-encodes reserved characters,
  // so getURL("report.html?id=x") yields ".../report.html%3Fid=x" — a file that
  // does not exist. The tab opened on nothing and the button looked dead.
  const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  assert.equal(/getURL\(`[^`]*\?/.test(sidepanel), false, "getURL must not be given a query string");
  assert.equal(/getURL\("[^"]*\?/.test(sidepanel), false, "getURL must not be given a query string");
  assert.match(sidepanel, /reportUrl\(chrome\.runtime\.getURL\("src\/report\/report\.html"\), id\)/);

  assert.equal(reportUrl("chrome-extension://abc/src/report/report.html", "id-1"),
               "chrome-extension://abc/src/report/report.html?id=id-1");
});

test("ids that need escaping survive the round trip", () => {
  const url = reportUrl("chrome-extension://abc/r.html", "a b&c=d");
  assert.equal(url, "chrome-extension://abc/r.html?id=a%20b%26c%3Dd");
  assert.equal(new URL(url).searchParams.get("id"), "a b&c=d");
});

test("the payload carries the job's identity and never the CV or page body", () => {
  const payload = buildReportPayload({
    evidence: { overview: {} },
    job: { title: "T", company: "C", location: "L", url: "https://x/y", sourceText: "FULL JOB PAGE BODY" },
    provider: "openai-api", model: "gpt-5-mini", locale: "en", generatedAt: "2026-07-25T10:00:00.000Z"
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("FULL JOB PAGE BODY"), false, "the raw page body must not be stored");
  assert.equal(payload.job.title, "T");
  assert.equal(payload.model, "gpt-5-mini");
  assert.equal(payload.generatedAt, "2026-07-25T10:00:00.000Z");
});

test("a job with missing fields still produces a renderable payload", () => {
  const payload = buildReportPayload({ evidence: {}, job: undefined, provider: "codex", model: "codex", locale: "zh", generatedAt: "" });
  assert.deepEqual(payload.job, { title: "", company: "", location: "", url: "" });
});

test("both ends agree on the storage keys", () => {
  const reportPage = readFileSync(join(root, "src/report/report.js"), "utf8");
  const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  for (const source of [reportPage, sidepanel]) {
    assert.match(source, /from "\.\.?\/(report|report)\/payload\.js"|from "\.\/payload\.js"/);
    assert.equal(/"marketfit\.report\./.test(source), false, "key names must come from payload.js, not be respelled");
  }
  assert.equal(reportKey("x"), `${REPORT_PREFIX}x`);
  assert.notEqual(LATEST_KEY, reportKey("latest-id"));
});

test("old reports are pruned but the newest and the latest pointer survive", () => {
  const stored = { [LATEST_KEY]: "r12", "marketfit.locale.v1": "en" };
  for (let i = 0; i < KEEP_REPORTS + 3; i += 1) {
    stored[reportKey(`r${i}`)] = { generatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() };
  }
  const stale = expiredReportKeys(stored);
  assert.deepEqual(stale, [reportKey("r0"), reportKey("r1"), reportKey("r2")]);
  assert.equal(stale.includes(LATEST_KEY), false);
  assert.equal(stale.includes("marketfit.locale.v1"), false);
});

test("pruning follows recorded time, not the order storage happens to return", () => {
  // chrome.storage returns a plain object and guarantees no iteration order, so
  // key order must never decide what gets deleted.
  const stored = {};
  const newest = new Date(Date.UTC(2026, 5, 1)).toISOString();
  const oldest = new Date(Date.UTC(2020, 0, 1)).toISOString();
  stored[reportKey("written-first-but-newest")] = { generatedAt: newest };
  // One over the cap in total, so exactly one report should be dropped.
  for (let i = 0; i < KEEP_REPORTS - 1; i += 1) {
    stored[reportKey(`mid${i}`)] = { generatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() };
  }
  stored[reportKey("written-last-but-oldest")] = { generatedAt: oldest };

  const stale = expiredReportKeys(stored);
  assert.deepEqual(stale, [reportKey("written-last-but-oldest")]);
  assert.equal(stale.includes(reportKey("written-first-but-newest")), false);
});

test("nothing is pruned while under the retention count", () => {
  assert.deepEqual(expiredReportKeys({ [reportKey("a")]: { generatedAt: "" }, [reportKey("b")]: {}, [LATEST_KEY]: "a" }), []);
});

/** A storage area that answers only for the keys it holds, like chrome.storage does. */
function storeOf(contents) {
  return { async get(key) { return key in contents ? { [key]: contents[key] } : {}; } };
}

test("a report link that names a pruned report expires rather than showing another job", async () => {
  // The fallback to "most recent" used to run even when an id was supplied, so a
  // bookmarked report tab quietly rendered a different company's analysis under the
  // URL the reader had saved, with nothing on the page admitting the substitution.
  const session = storeOf({ [reportKey("kept")]: { job: { company: "Zeta" } }, [LATEST_KEY]: "kept" });
  assert.equal(await readReport([session], "pruned"), null);
  assert.deepEqual(await readReport([session], "kept"), { job: { company: "Zeta" } });
});

test("a link with no id still falls back to the most recent report, across both stores", async () => {
  const empty = storeOf({});
  const local = storeOf({ [reportKey("r9")]: { job: { company: "Acme" } }, [LATEST_KEY]: "r9" });
  assert.deepEqual(await readReport([empty, local], ""), { job: { company: "Acme" } });
  assert.deepEqual(await readReport([empty, local], null), { job: { company: "Acme" } });
  // A latest pointer aiming at something already gone is not a report either.
  assert.equal(await readReport([storeOf({ [LATEST_KEY]: "gone" })], null), null);
});

test("the report says what it was working from, and still carries no content", () => {
  const payload = buildReportPayload({
    evidence: { gaps: [{ title: "Kubernetes", evidence: [{ ref: "CV-001", source: "resume", quote: "ldh@example.com — Kubernetes" }] }] },
    job: { title: "Engineer", extraction: { method: "manual_paste", removedLines: 31, removedSample: ["Sign in", "Cookie policy"] } },
    resumeTruncated: true,
    provider: "openai-api", model: "gpt-5-mini", locale: "en", generatedAt: "2026-07-29T10:00:00.000Z", candidate: {}
  });
  // The printed copy is the one reread weeks later, so it must not be the more
  // confident of the two documents on strictly less information.
  assert.deepEqual(payload.sourceQuality, { method: "manual_paste", removedLines: 31, resumeTruncated: true });
  // Counts and a capture token only — removedSample is page text and stays behind,
  // exactly like the CV quotes the payload already strips.
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("Cookie policy"), false, "removed page text must not ride along into storage");
  assert.equal(serialized.includes("ldh@example.com"), false, "resolved CV quotes are still stripped");
});
