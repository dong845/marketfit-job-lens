const BRIDGE_STATE_KEY = "marketfit.bridge.v1";
const BRIDGE_ORIGIN = "http://127.0.0.1";

/**
 * Every call to the bridge is bounded.
 *
 * There was no timeout at all here, so if the bridge stopped answering — killed,
 * restarted mid-request, wedged — the panel waited forever and the elapsed
 * counter just kept climbing with no error. Pairing and health are quick and get
 * a short bound; a task gets slightly longer than the bridge's own limit so its
 * error surfaces instead of ours, which says more about what went wrong.
 */
const CONTROL_TIMEOUT_MS = 10000;
const TASK_TIMEOUT_MS = 660000;

export const API_PROVIDERS = new Set(["openai-api", "anthropic-api"]);
export const CLI_PROVIDERS = new Set(["codex", "claude-code"]);

export function createBridgeClient({ storageArea = chrome.storage.local, runtime = chrome.runtime, fetchImpl = globalThis.fetch } = {}) {
  return {
    async prepare() {
      if (storageArea.setAccessLevel) await storageArea.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
    },
    async load() {
      return (await storageArea.get(BRIDGE_STATE_KEY))[BRIDGE_STATE_KEY] || null;
    },
    async pair({ port, pairingCode }) {
      const validPort = normalizePort(port);
      const response = await request(fetchImpl, `${BRIDGE_ORIGIN}:${validPort}/v1/pair`, {
        method: "POST",
        headers: { "content-type": "application/json", ...extensionIdentity(runtime) },
        body: JSON.stringify({ code: String(pairingCode || "").trim(), extensionId: runtime.id })
      });
      const state = { port: validPort, token: response.token, pairedAt: new Date().toISOString() };
      await storageArea.set({ [BRIDGE_STATE_KEY]: state });
      return state;
    },
    async health() {
      const state = await this.load();
      if (!state) return null;
      return request(fetchImpl, `${BRIDGE_ORIGIN}:${state.port}/v1/health`, authorized(state, runtime), CONTROL_TIMEOUT_MS);
    },
    async runTask(task) {
      const state = await this.load();
      if (!state) throw new Error("Pair the Local AI Bridge before running an AI review.");
      return request(fetchImpl, `${BRIDGE_ORIGIN}:${state.port}/v1/tasks`, {
        ...authorized(state, runtime),
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${state.token}`, ...extensionIdentity(runtime) },
        body: JSON.stringify(task)
      }, TASK_TIMEOUT_MS);
    },
    async disconnect() {
      const state = await this.load();
      if (state) {
        try { await request(fetchImpl, `${BRIDGE_ORIGIN}:${state.port}/v1/unpair`, { ...authorized(state, runtime), method: "POST" }, CONTROL_TIMEOUT_MS); } catch { /* The bridge may already be stopped. */ }
      }
      await storageArea.remove(BRIDGE_STATE_KEY);
    }
  };
}

export function isApiProvider(provider) {
  return API_PROVIDERS.has(provider);
}

export function isCliProvider(provider) {
  return CLI_PROVIDERS.has(provider);
}

function authorized(state, runtime) {
  return { headers: { authorization: `Bearer ${state.token}`, ...extensionIdentity(runtime) } };
}

function extensionIdentity(runtime) {
  return { "x-marketfit-extension-id": String(runtime.id || "") };
}

async function request(fetchImpl, url, options, timeoutMs = CONTROL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: controller.signal });
  } catch {
    throw new Error(controller.signal.aborted
      ? "The Local AI Bridge stopped responding. Check the terminal it is running in, then try again."
      : "Could not reach the Local AI Bridge. Start it and pair again.");
  } finally {
    clearTimeout(timer);
  }
  let payload = {};
  try { payload = await response.json(); } catch { /* Error handling below uses a generic message. */ }
  if (!response.ok) throw new Error(payload.error?.message || "The Local AI Bridge rejected the request.");
  return payload;
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Bridge port must be between 1024 and 65535.");
  return port;
}
