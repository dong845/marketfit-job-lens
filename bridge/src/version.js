import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The bridge is a long-running process that loads this code once at startup, so a
 * running bridge can be arbitrarily older than the extension talking to it. That
 * mismatch is invisible: the panel reports whatever the stale process does, and a
 * bug fixed minutes ago still reproduces. Reporting the version lets the panel say
 * "restart the bridge" instead of surfacing a failure that no longer exists.
 */
export const BRIDGE_VERSION = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")
).version;
