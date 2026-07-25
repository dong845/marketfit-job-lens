import { spawn } from "node:child_process";
import { BridgeError } from "./schema.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;

export function runProcess(command, args, options = {}) {
  const { cwd, env, stdin = "", timeoutMs = 90000, spawnImpl = spawn } = options;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    const child = spawnImpl(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const append = (key, chunk) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        stopProcessTree(child);
        finish(() => reject(new BridgeError("PROVIDER_OUTPUT_LIMIT", "Provider output exceeded the safety limit.", 502)));
        return;
      }
      if (key === "stdout") stdout += chunk;
      else stderr += chunk;
    };
    timer = setTimeout(() => {
      stopProcessTree(child);
      finish(() => reject(new BridgeError("TASK_TIMEOUT", "The local provider did not finish in time.", 504)));
    }, timeoutMs);

    child.on("error", (error) => finish(() => reject(new BridgeError("PROVIDER_NOT_INSTALLED", `Could not start ${command}: ${error.message}`, 503))));
    child.stdout.on("data", (chunk) => append("stdout", String(chunk)));
    child.stderr.on("data", (chunk) => append("stderr", String(chunk)));
    child.on("close", (code, signal) => finish(() => {
      if (code === 0) resolve({ stdout, stderr, code, signal });
      else reject(new BridgeError("PROVIDER_FAILED", `Provider exited with ${signal || `code ${code}`}.`, 502));
    }));
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}
