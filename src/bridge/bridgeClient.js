const BRIDGE_STATE_KEY = "marketfit.bridge.v1";
const BRIDGE_ORIGIN = "http://127.0.0.1";

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
      return request(fetchImpl, `${BRIDGE_ORIGIN}:${state.port}/v1/health`, authorized(state, runtime));
    },
    async runTask(task) {
      const state = await this.load();
      if (!state) throw new Error("Pair the Local AI Bridge before running an AI review.");
      return request(fetchImpl, `${BRIDGE_ORIGIN}:${state.port}/v1/tasks`, {
        ...authorized(state, runtime),
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${state.token}`, ...extensionIdentity(runtime) },
        body: JSON.stringify(task)
      });
    },
    async disconnect() {
      const state = await this.load();
      if (state) {
        try { await request(fetchImpl, `${BRIDGE_ORIGIN}:${state.port}/v1/unpair`, { ...authorized(state, runtime), method: "POST" }); } catch { /* The bridge may already be stopped. */ }
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

async function request(fetchImpl, url, options) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    throw new Error("Could not reach the Local AI Bridge. Start it and pair again.");
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
