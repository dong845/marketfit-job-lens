import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createProviderRouter } from "./providers.js";
import { BridgeError, parseTaskRequest } from "./schema.js";
import { createMemoryStore } from "./state.js";
import { BRIDGE_VERSION } from "./version.js";

const MAX_BODY_BYTES = 256 * 1024;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const EXTENSION_ID = /^[a-p]{32}$/;

export function createBridgeServer({
  host = "127.0.0.1",
  port = 0,
  pairCode = randomSecret(18),
  token = randomSecret(32),
  router = createProviderRouter(),
  logger = () => {},
  store = createMemoryStore()
} = {}) {
  let pairedOrigin = null;
  let pairedExtensionId = null;
  let requiresIdentityHeader = false;
  let pairingAvailable = true;
  let listening = false;
  let restored = false;
  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      writeError(response, error, request.headers.origin, pairedOrigin);
    });
  });

  return {
    async start() {
      if (listening) return server.address();
      // Reuse the previous identity so a restart does not invalidate a pairing the
      // user already completed, and so the code they were given still works.
      const saved = await store.load();
      if (saved) {
        token = saved.token;
        pairCode = saved.pairCode;
        pairedOrigin = saved.pairedOrigin ?? null;
        pairedExtensionId = saved.pairedExtensionId ?? null;
        requiresIdentityHeader = Boolean(saved.requiresIdentityHeader);
        pairingAvailable = !pairedExtensionId;
        restored = true;
      } else {
        await persist();
      }
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host, port }, () => {
          server.off("error", reject);
          resolve();
        });
      });
      listening = true;
      const address = server.address();
      return {
        host,
        port: address.port,
        url: `http://${host}:${address.port}`,
        pairCode,
        alreadyPaired: Boolean(pairedExtensionId),
        restored
      };
    },
    async stop() {
      if (!listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      listening = false;
    },
    server
  };

  async function persist() {
    await store.save({ token, pairCode, pairedOrigin, pairedExtensionId, requiresIdentityHeader });
  }

  async function handleRequest(request, response) {
    const origin = String(request.headers.origin || "");
    const path = new URL(request.url || "/", "http://bridge.local").pathname;
    if (request.method === "OPTIONS") {
      if (canUseOrigin(origin, path)) return writeJson(response, 204, null, origin);
      throw new BridgeError("ORIGIN_DENIED", "This bridge only accepts the paired Chrome extension.", 403);
    }
    if (request.method === "POST" && path === "/v1/pair") {
      if (!pairingAvailable) throw new BridgeError("PAIRING_DENIED", "This Bridge has already been paired. Restart it to pair again.", 403);
      const body = await readJsonBody(request);
      const expectedOrigin = `chrome-extension://${String(body.extensionId || "")}`;
      const extensionId = String(body.extensionId || "");
      const identityHeader = String(request.headers["x-marketfit-extension-id"] || "");
      const standardOrigin = origin === expectedOrigin && EXTENSION_ORIGIN.test(expectedOrigin);
      const unavailableOrigin = origin === "" || origin === "null";
      const fallbackIdentity = unavailableOrigin && EXTENSION_ID.test(extensionId) && identityHeader === extensionId;
      if ((!standardOrigin && !fallbackIdentity) || (identityHeader && identityHeader !== extensionId) || !sameSecret(String(body.code || ""), pairCode)) {
        throw new BridgeError("PAIRING_DENIED", "The pairing code or extension identity is invalid.", 403);
      }
      pairedOrigin = origin || null;
      pairedExtensionId = extensionId;
      requiresIdentityHeader = fallbackIdentity;
      pairingAvailable = false;
      await persist();
      logger({ event: "paired", origin: origin || "extension-origin-unavailable" });
      return writeJson(response, 200, { bridgeVersion: BRIDGE_VERSION, token }, origin);
    }
    if (!isPairedExtensionRequest(request, origin)) throw new BridgeError("ORIGIN_DENIED", "This bridge only accepts the paired Chrome extension.", 403);
    if (!hasToken(request.headers.authorization, token)) throw new BridgeError("AUTH_REQUIRED", "Bridge authentication is required.", 401);
    if (request.method === "GET" && path === "/v1/health") {
      return writeJson(response, 200, { status: "ready", version: BRIDGE_VERSION, providers: await router.health() }, origin);
    }
    if (request.method === "POST" && path === "/v1/tasks") {
      const startedAt = Date.now();
      const task = parseTaskRequest(await readJsonBody(request));
      try {
        const evidence = await router.runTask(task);
        logger({ event: "task_completed", requestId: task.requestId, provider: task.provider, durationMs: Date.now() - startedAt });
        return writeJson(response, 200, {
          requestId: task.requestId,
          status: "completed",
          provider: task.provider,
          result: evidence,
          meta: { providerCloud: true, stored: false }
        }, origin);
      } catch (error) {
        logger({ event: "task_failed", requestId: task.requestId, provider: task.provider, durationMs: Date.now() - startedAt, code: error?.code || "PROVIDER_FAILED" });
        throw error;
      }
    }
    if (request.method === "POST" && path === "/v1/unpair") {
      pairedOrigin = null;
      pairedExtensionId = null;
      requiresIdentityHeader = false;
      pairingAvailable = false;
      // A new secret on unpair, so a disconnected extension's token is dead even
      // if it kept a copy.
      token = randomSecret(32);
      pairCode = randomSecret(18);
      await persist();
      logger({ event: "unpaired" });
      return writeJson(response, 200, { status: "unpaired" }, origin);
    }
    throw new BridgeError("NOT_FOUND", "The bridge endpoint was not found.", 404);
  }

  function canUseOrigin(origin, path) {
    if (path === "/v1/pair") return pairingAvailable && (EXTENSION_ORIGIN.test(origin) || origin === "null");
    return pairedOrigin !== null && origin === pairedOrigin;
  }

  function isPairedExtensionRequest(request, origin) {
    const identityHeader = String(request.headers["x-marketfit-extension-id"] || "");
    if (!pairedExtensionId) return false;
    if (pairedOrigin !== null && origin !== pairedOrigin) return false;
    if (pairedOrigin === null && origin !== "") return false;
    if (requiresIdentityHeader) return identityHeader === pairedExtensionId;
    return !identityHeader || identityHeader === pairedExtensionId;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new BridgeError("PAYLOAD_TOO_LARGE", "The request body is too large.", 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeError("SCHEMA_INVALID", "The request body must be valid JSON.");
  }
}

function hasToken(header, token) {
  const presented = String(header || "").replace(/^Bearer\s+/i, "");
  return sameSecret(presented, token);
}

function sameSecret(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function randomSecret(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function writeError(response, error, origin, pairedOrigin) {
  const known = error instanceof BridgeError ? error : new BridgeError("INTERNAL_ERROR", "The bridge could not complete the request.", 500);
  return writeJson(response, known.status, { error: { code: known.code, message: known.message } }, origin === pairedOrigin ? origin : "");
}

function writeJson(response, status, body, origin) {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "vary": "Origin"
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type, x-marketfit-extension-id";
    headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
  }
  response.writeHead(status, headers);
  response.end(body === null ? "" : JSON.stringify(body));
}
