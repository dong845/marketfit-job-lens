import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * The service worker is what opens the panel at all.
 *
 * It was the only module no test referenced, and a failure here does not look like
 * a bug — it looks like an extension that does nothing when you click it.
 */
const source = readFileSync(new URL("../src/background.js", import.meta.url), "utf8");

test("clicking the extension icon opens the side panel", async () => {
  const calls = [];
  const listeners = {};
  globalThis.chrome = {
    runtime: { onInstalled: { addListener: (fn) => { listeners.installed = fn; } } },
    action: { onClicked: { addListener: (fn) => { listeners.clicked = fn; } } },
    sidePanel: {
      setPanelBehavior: (options) => { calls.push(["behavior", options]); },
      open: async (options) => { calls.push(["open", options]); }
    }
  };
  await import("../src/background.js");

  listeners.installed();
  assert.deepEqual(calls[0], ["behavior", { openPanelOnActionClick: true }]);

  await listeners.clicked({ id: 7 });
  assert.deepEqual(calls[1], ["open", { tabId: 7 }]);

  // A tab with no id would throw inside the handler and leave the click dead.
  await listeners.clicked({});
  await listeners.clicked(undefined);
  assert.equal(calls.length, 2, "a tab without an id must be ignored, not crash the worker");
});

test("the worker degrades on a Chrome without sidePanel rather than throwing", () => {
  // setPanelBehavior is guarded; open is guarded too, and both must stay that way —
  // an unguarded call in a service worker fails silently at install time.
  assert.match(source, /chrome\.sidePanel\?\.setPanelBehavior/);
  assert.match(source, /!chrome\.sidePanel\?\.open/);
});
