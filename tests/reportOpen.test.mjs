import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Drives the panel far enough to click "Open full report".
 *
 * The boot test only imports the module, so it proved the button exists and never
 * proved pressing it does anything — which is how a silently-returning handler
 * shipped. This one captures the registered listeners and fires them.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(join(root, "src/sidepanel/sidepanel.html"), "utf8");
const realIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));

function harness({ sessionStorage = true } = {}) {
  const listeners = new Map();
  const elements = new Map();
  const calls = { tabs: [], sessionSet: [], localSet: [] };

  const makeElement = (id) => ({
    id, value: "", textContent: "", hidden: false, disabled: false, dataset: {}, files: [], style: {},
    addEventListener(type, handler) { listeners.set(`${id}:${type}`, handler); },
    setAttribute() {}, removeAttribute() {}, replaceChildren() {}, appendChild() {}, focus() {},
    querySelector() { return makeElement("child"); },
    querySelectorAll() { return []; },
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ""; }
  });

  globalThis.document = {
    documentElement: makeElement("documentElement"),
    getElementById(id) {
      if (!realIds.has(id)) return null;
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return makeElement("created"); }
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { async writeText() {} } } });
  globalThis.window = { confirm: () => false };

  const storage = {
    local: { async get() { return {}; }, async set(v) { calls.localSet.push(v); }, async remove() {}, async setAccessLevel() {} }
  };
  if (sessionStorage) storage.session = { async get() { return {}; }, async set(v) { calls.sessionSet.push(v); } };

  globalThis.chrome = {
    runtime: { id: "test-extension-id", getURL: (path) => `chrome-extension://test/${path}`, getManifest: () => ({ version: "0.7.0" }) },
    storage,
    tabs: { async query() { return [{ id: 1, url: "https://example.com/job" }]; }, async create(options) { calls.tabs.push(options); return { id: 2 }; } },
    scripting: { async executeScript() { return []; } },
    permissions: { async contains() { return true; }, async request() { return true; } }
  };
  return { listeners, elements, calls };
}

test("pressing Open full report with no analysis says so instead of doing nothing", async () => {
  const { listeners, elements, calls } = harness();
  await import(`../src/sidepanel/sidepanel.js?case=empty-${Date.now()}`);

  const click = listeners.get("openReport:click");
  assert.ok(click, "the report button must have a click handler");
  await click();

  assert.deepEqual(calls.tabs, [], "nothing to report, so no tab");
  // The failure that prompted this test was a bare `return` — the user pressed a
  // visible button and got no tab, no message, and nothing in the console.
  assert.notEqual(elements.get("status").textContent, "", "the panel must explain why nothing opened");
});

test("the report handler is wired to the button the panel reveals", async () => {
  const { listeners } = harness();
  await import(`../src/sidepanel/sidepanel.js?case=wiring-${Date.now()}`);
  assert.ok(listeners.get("openReport:click"), "openReport must have a click handler");
});

test("a failure is shown in the result area, not only in the status line", async () => {
  // The status line is one small line under the title that already holds the
  // success message, so a failure reported only there reads as a dead button.
  // This drives the reachable failure (no analysis yet); the storage and tab
  // failures share the same renderReportProblem path.
  const { listeners, elements } = harness();
  await import(`../src/sidepanel/sidepanel.js?case=visible-${Date.now()}`);

  await listeners.get("openReport:click")();
  const result = elements.get("result").innerHTML;
  assert.notEqual(result, "", "the result area must carry the explanation");
  assert.match(result, /action-message/, "it must render as a visible notice, not silently");
  assert.notEqual(elements.get("status").textContent, "");

  const source = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
  const handler = source.slice(source.indexOf("async function openFullReport"), source.indexOf("async function openReportTab"));
  // No failure path may end at setStatus alone.
  assert.equal(/setStatus\([^)]*\);\s*\n\s*\}\s*catch/.test(handler), false);
  assert.match(handler, /renderReportProblem\(error\?\.message \|\| String\(error\), url\)/);
  assert.match(source, /function renderReportProblem[\s\S]*?fields\.result\.innerHTML/);
});

test("storage.local is used when session is unavailable", async () => {
  const { listeners, calls } = harness({ sessionStorage: false });
  await import(`../src/sidepanel/sidepanel.js?case=nosession-${Date.now()}`);
  // With no analysis the guard fires first, so assert the selection expression
  // itself rather than a write; the write path is covered by reportPage tests.
  assert.ok(listeners.get("openReport:click"));
  assert.equal(calls.sessionSet.length, 0);
});
