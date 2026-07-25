import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { MESSAGES } from "../src/ui/i18n.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(join(root, "src/report/report.html"), "utf8");
const script = readFileSync(join(root, "src/report/report.js"), "utf8");
const css = readFileSync(join(root, "src/report/report.css"), "utf8");
const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");

test("the report is handed over through session storage, not a blob URL", () => {
  // A blob URL is owned by the side-panel document and is revoked when that panel
  // closes, which would break any report tab still open on it.
  assert.equal(sidepanel.includes("createObjectURL"), false);
  assert.match(sidepanel, /chrome\.storage\?\.session \|\| chrome\.storage\?\.local/);
  assert.match(sidepanel, /store\.set\(/);
  // The page must read whichever store the panel was able to write to.
  assert.match(script, /\[chrome\.storage\?\.session, chrome\.storage\?\.local\]/);
  // Both sides import the key names from payload.js; see reportPayload.test.mjs
  // for the URL construction the dead button came from.
  assert.match(sidepanel, /from "\.\.\/report\/payload\.js"/);
  assert.match(script, /from "\.\/payload\.js"/);
});

test("the report ids the panel writes are unguessable per analysis", () => {
  assert.match(sidepanel, /crypto\?\.randomUUID\?\.\(\)/);
});

test("a missing or expired report explains itself instead of rendering blank", () => {
  assert.match(script, /t\(uiLocale, "reportExpired"\)/);
  assert.match(script, /t\(uiLocale, "reportUnreadable"\)/);
  // These are shown before any payload exists, so the language has to come from
  // the saved preference rather than from the report itself.
  assert.match(script, /async function savedLocale/);
  // The lookup rule itself is exercised in reportPayload.test.mjs, where it can be
  // run rather than pattern-matched; the page only wires the two storage areas to it.
  assert.match(script, /readReport\(\[chrome\.storage\?\.session, chrome\.storage\?\.local\], id\)/);
});

test("neither surface prints source quotes", () => {
  // Quotes are not rendered anywhere: they were long and buried the analysis.
  // The grounding they came from is untouched — see analysisView.test.mjs.
  assert.match(script, /renderAnalysisHtml\(evidence, locale\)/);
  const sidepanelSource = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  assert.match(sidepanelSource, /renderAnalysisHtml\(evidence, locale\)/);
  const view = readFileSync(join(root, "src/ui/analysisView.js"), "utf8");
  assert.equal(view.includes("blockquote"), false, "no quote markup may remain");
});

test("the report links out safely and stays printable", () => {
  assert.match(script, /rel="noopener noreferrer"/);
  assert.match(css, /@media print/);
  assert.match(css, /\.print-button \{ display: none; \}/);
});

test("every string the report shows exists in both locales", () => {
  const used = [
    ...[...script.matchAll(/\bt\(locale,\s*"([^"]+)"\)/g)].map((match) => match[1]),
    ...[...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1])
  ];
  assert.ok(used.length > 0);
  for (const key of used) {
    assert.ok(MESSAGES.en[key], `missing English string: ${key}`);
    assert.ok(MESSAGES.zh[key], `missing Chinese string: ${key}`);
  }
});

test("the report page loads its own script and stylesheet by relative path", () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/report\.css" \/>/);
  assert.match(html, /<script type="module" src="\.\/report\.js"><\/script>/);
  assert.match(html, /id="report"/);
});

test("only http(s) job URLs become links", () => {
  // job.url comes from a captured page; a javascript: value must never become an href.
  assert.match(script, /parsed\.protocol !== "http:" && parsed\.protocol !== "https:"/);
  assert.match(script, /catch \{ return escapeHtml\(url\); \}/);
});

test("a failed re-run retracts the previous run's report offer", () => {
  const sidepanel = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  const review = sidepanel.slice(sidepanel.indexOf("async function runAgentReview"), sidepanel.indexOf("function renderAnalysis"));
  const cleared = review.indexOf("fields.reportRow.hidden = true");
  const shown = review.indexOf("fields.reportRow.hidden = false");
  assert.ok(cleared > 0, "a new run must retract the previous report offer");
  assert.ok(cleared < shown, "it must be retracted before the run, not after it succeeds");
  assert.match(review, /lastRunContext = null;/);
});
