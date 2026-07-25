import { spawn } from "node:child_process";
import { BridgeError } from "./schema.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;

export function runProcess(command, args, options = {}) {
  // A CLI pays process startup, model selection, and its own retries before the
  // first token, on top of the generation the HTTP path also does. A measured
  // Claude Code run on a small fixture took 221s; a real CV and job page are far
  // larger, so the ceiling is generous and the panel shows elapsed time instead.
  const { cwd, env, stdin = "", timeoutMs = 600000, spawnImpl = spawn } = options;
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
      if (code === 0) return resolve({ stdout, stderr, code, signal });
      // The CLI already explained itself on stderr. Reporting only the exit code
      // turned "your Codex usage limit is exhausted until Tuesday" into
      // "Provider exited with code 1", which tells the user nothing to act on.
      // Claude Code prints "Not logged in" to stdout and leaves stderr empty, so
      // reading only stderr would have thrown away that message too.
      const reason = lastMeaningfulLine(stderr) || lastMeaningfulLine(stdout);
      const detail = reason ? ` ${reason}` : "";
      reject(new BridgeError("PROVIDER_FAILED", `${command} failed (${signal || `exit ${code}`}).${detail}`, 502));
    }));
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

/**
 * The useful line is usually the last one, but CLIs also trail progress and
 * retry noise, and repeat their final error. Take the last distinct error-ish
 * line, capped so a stack trace cannot flood the panel.
 */
function lastMeaningfulLine(stderr) {
  const lines = String(stderr)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d{4}-\d{2}-\d{2}\S*\s+)?(?:ERROR|WARN|warning)[:\s]\s*/i, "").trim())
    .filter(Boolean)
    .filter((line) => !/^-+$/.test(line) && !/^Reconnecting\.{0,3}\s*\d*\/?\d*$/i.test(line));
  const last = lines.at(-1) || "";
  return last.length > 300 ? `${last.slice(0, 300)}…` : last;
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
