import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Keeps the bridge's identity across restarts.
 *
 * Without this, the token and pairing code were generated per process and the
 * paired extension was forgotten, so restarting the bridge silently invalidated
 * a pairing the user had already completed. The panel could only report that the
 * saved pairing "is unavailable", and the code needed to fix it existed solely in
 * the stdout of a terminal that may since have been closed.
 *
 * The file holds a loopback-only bearer token, so it is written 0600 in a 0700
 * directory — the same handling a CLI credential file gets. This remains a
 * development-grade transport; see the Native Messaging note in the docs.
 */
export const DEFAULT_STATE_PATH = join(homedir(), ".marketfit", "bridge.json");

export function createFileStore(path = DEFAULT_STATE_PATH) {
  return {
    path,
    async load() {
      try {
        const parsed = JSON.parse(await readFile(path, "utf8"));
        return isUsable(parsed) ? parsed : null;
      } catch {
        // Missing or unreadable state simply means "not paired yet".
        return null;
      }
    },
    async save(state) {
      try {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
        await chmod(path, 0o600);
        return true;
      } catch {
        // A bridge that cannot persist still works for this session.
        return false;
      }
    }
  };
}

export function createMemoryStore(initial = null) {
  let state = initial;
  return {
    path: "(memory)",
    async load() { return state; },
    async save(next) { state = next; return true; }
  };
}

function isUsable(state) {
  return Boolean(state)
    && typeof state.token === "string" && state.token.length >= 16
    && typeof state.pairCode === "string" && state.pairCode.length >= 8;
}
