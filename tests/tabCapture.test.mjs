import assert from "node:assert/strict";
import test from "node:test";
import { captureActiveTab, isSameJobPage, requestOptionalSiteAccess, siteOriginForPermission } from "../src/extraction/tabCapture.js";

test("current-tab capture injects the self-contained extractor into the active tab", async () => {
  const snapshot = { url: "https://careers.pddglobalhr.com/campus/grad/detail?t=qSPiTb83hh", text: "AI Agent development engineer", jsonLd: [] };
  let injected = null;
  const result = await captureActiveTab({
    tabsApi: { async query(query) { assert.deepEqual(query, { active: true, currentWindow: true }); return [{ id: 91, url: snapshot.url }]; } },
    scriptingApi: { async executeScript(options) { injected = options; return [{ result: snapshot }]; } }
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.snapshot, snapshot);
  assert.equal(injected.target.tabId, 91);
  assert.equal(injected.target.allFrames, true);
  assert.equal(typeof injected.func, "function");
  assert.match(injected.func.toString(), /document\.querySelectorAll/);
  assert.match(injected.func.toString(), /textContent/);
  assert.match(injected.func.toString(), /setTimeout/);
  assert.equal(injected.func.toString().includes("innerText"), false);
});

test("failed injection retains the active site for an explicit per-site retry", async () => {
  const tab = { id: 42, url: "https://careers.pddglobalhr.com/campus/grad/detail?t=qSPiTb83hh" };
  const result = await captureActiveTab({
    tabsApi: { async query() { return [tab]; } },
    scriptingApi: { async executeScript() { throw new Error("Missing host permission"); } }
  });
  assert.equal(result.tab, tab);
  assert.match(result.error.message, /host permission/);
  assert.equal(siteOriginForPermission(result.tab.url), "https://careers.pddglobalhr.com/*");
});

test("a stalled page injection returns the active site instead of leaving the panel in a reading state", async () => {
  const tab = { id: 43, url: "https://careers.pddglobalhr.com/campus/grad/detail?t=qSPiTb83hh" };
  const result = await captureActiveTab({
    tabsApi: { async query() { return [tab]; } },
    scriptingApi: { async executeScript() { return new Promise(() => {}); } },
    pageCaptureTimeoutMs: 5
  });
  assert.equal(result.tab, tab);
  assert.match(result.error.message, /Timed out while reading/);
});

test("site access requests only the current page origin", async () => {
  let request = null;
  const granted = await requestOptionalSiteAccess({ async request(value) { request = value; return true; } }, "https://careers.pddglobalhr.com/*");
  assert.equal(granted, true);
  assert.deepEqual(request, { origins: ["https://careers.pddglobalhr.com/*"] });
  assert.equal(await requestOptionalSiteAccess({ async request() { throw new Error("must not run"); } }, ""), false);
});

test("a captured job can be reused only for the same page", () => {
  assert.equal(isSameJobPage("https://careers.pddglobalhr.com/campus/grad/detail?t=qSPiTb83hh#section", "https://careers.pddglobalhr.com/campus/grad/detail?t=qSPiTb83hh"), true);
  assert.equal(isSameJobPage("https://careers.pddglobalhr.com/campus/grad/detail?t=qSPiTb83hh", "https://careers.pddglobalhr.com/campus/grad/detail?t=another-job"), false);
});
