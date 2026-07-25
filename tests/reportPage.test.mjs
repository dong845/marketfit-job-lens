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
  assert.match(sidepanel, /session\.set\(/);
  assert.match(script, /chrome\.storage\.session\.get/);
  // Both sides import the key names from payload.js; see reportPayload.test.mjs
  // for the URL construction the dead button came from.
  assert.match(sidepanel, /from "\.\.\/report\/payload\.js"/);
  assert.match(script, /from "\.\/payload\.js"/);
});

test("the report ids the panel writes are unguessable per analysis", () => {
  assert.match(sidepanel, /crypto\?\.randomUUID\?\.\(\)/);
});

test("a missing or expired report explains itself instead of rendering blank", () => {
  assert.match(script, /has expired/);
  assert.match(script, /could not be read from browser storage/);
  // A link without a usable id falls back to the most recent report rather than
  // dead-ending, since the id only travels in a query string.
  assert.match(script, /async function loadPayload/);
  assert.match(script, /LATEST_KEY/);
});

test("report evidence is expanded, unlike the panel's collapsed disclosures", () => {
  assert.match(script, /renderAnalysisHtml\(evidence, locale, \{ evidenceOpen: true \}\)/);
  assert.match(sidepanel, /renderAnalysisHtml\(evidence, locale\)/);
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
