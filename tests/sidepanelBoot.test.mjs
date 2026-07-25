import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Boots sidepanel.js against a DOM stub built from the real sidepanel.html.
 *
 * The module wires listeners at import time, so a single renamed or removed id
 * throws before anything renders and the panel comes up permanently blank —
 * a failure no string-matching test catches. getElementById here returns a stub
 * only for ids that actually exist in the markup, so a stale reference throws
 * exactly as it would in Chrome.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(join(root, "src/sidepanel/sidepanel.html"), "utf8");
const realIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));

function createElement(id = "") {
  return {
    id,
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    dataset: {},
    files: [],
    style: {},
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    replaceChildren() {},
    appendChild() {},
    focus() {},
    querySelector() { return createElement(); },
    querySelectorAll() { return []; },
    set innerHTML(value) { this._innerHTML = value; },
    get innerHTML() { return this._innerHTML || ""; }
  };
}

test("the side panel boots and wires every control it references", async () => {
  const requested = [];
  globalThis.document = {
    documentElement: createElement("documentElement"),
    getElementById(id) {
      requested.push(id);
      // Mirrors the browser: unknown ids are null, so byId(...).addEventListener throws.
      return realIds.has(id) ? createElement(id) : null;
    },
    querySelectorAll() { return []; },
    createElement() { return createElement(); }
  };
  // Node exposes navigator as a getter-only global, so it needs redefining.
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { async writeText() {} } }
  });
  globalThis.window = { confirm: () => false };
  globalThis.chrome = {
    runtime: { id: "test-extension-id", getURL: (path) => `chrome-extension://test/${path}`, getManifest: () => ({ version: "0.7.0" }) },
    storage: {
      local: { async get() { return {}; }, async set() {}, async remove() {}, async setAccessLevel() {} },
      session: { async get() { return {}; }, async set() {} }
    },
    tabs: { async query() { return [{ id: 1, url: "https://example.com/job" }]; }, async create() { return { id: 2 }; } },
    scripting: { async executeScript() { return []; } },
    permissions: { async contains() { return false; }, async request() { return false; } }
  };

  await assert.doesNotReject(async () => {
    await import("../src/sidepanel/sidepanel.js");
  }, "sidepanel.js must import without throwing");

  assert.ok(requested.length > 0, "expected the panel to look up its controls");
  const missing = requested.filter((id) => !realIds.has(id));
  assert.deepEqual(missing, [], `sidepanel.js references ids absent from sidepanel.html: ${missing.join(", ")}`);
});
