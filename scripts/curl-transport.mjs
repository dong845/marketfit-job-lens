/**
 * A `fetch`-shaped transport backed by curl, for live-verify only.
 *
 * Nothing the extension ships uses this. It exists because on some machines Node's
 * fetch cannot reach the provider at all: where an HTTPS proxy is required, fetch
 * ignores HTTP_PROXY/HTTPS_PROXY and the connection is refused by whatever sits in
 * front of it. That refusal arrives as an HTTP error from a host that is not the
 * provider — on this machine, a 403 "Request not allowed" — which reads exactly like
 * the provider rejecting the request and is not one. curl honours the proxy and the
 * same key then answers 401 from Anthropic itself, which is the difference between
 * debugging the network and debugging the wrong thing for an hour.
 *
 * It lived in a scratchpad and was rebuilt from directApiClient.js every time it was
 * needed, which is a tax paid repeatedly for a file that never changed. Here it is
 * checked, imported, and covered by the audit's import graph.
 *
 * The client needs three things from a response: `ok`, `status`, and either
 * `body.getReader()` for a streamed reply or `json()` for a buffered one. The status
 * is known before the body arrives, so the head is read first and then one of the two
 * is provided — a body can only be consumed once, and offering both would mean the
 * error path and the stream path silently competing for the same bytes.
 */
import { spawn } from "node:child_process";

export function curlFetch() {
  return async function fetchViaCurl(url, { method = "GET", headers = {}, body, signal } = {}) {
    // -i puts the head on stdout so the status can be read without a second channel;
    // -N turns off curl's own buffering, without which a streamed answer arrives in
    // one block at the end and the idle deadline this transport exists to exercise
    // would never see a byte until it was over.
    const args = ["-sS", "-N", "-i", "--max-time", "900", "-X", method, url];
    for (const [name, value] of Object.entries(headers)) args.push("-H", `${name}: ${value}`);
    if (body !== undefined) args.push("--data-binary", "@-");

    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    // The body goes in over stdin rather than as an argument: a prompt of this size
    // is past what an argument list will carry, and curl waits forever on an stdin
    // that is never closed — so it is written and ended in the same breath.
    child.stdin.on("error", () => {});
    child.stdin.end(body === undefined ? "" : body);
    signal?.addEventListener?.("abort", () => child.kill("SIGKILL"), { once: true });

    const stdout = pump(child);
    const { status, rest } = await readHead(stdout, () => stderr);
    const ok = status >= 200 && status < 300;

    if (!ok) {
      let text = rest.map((part) => part.toString("utf8")).join("");
      for await (const chunk of stdout) text += chunk.toString("utf8");
      return { ok, status, async json() { return JSON.parse(text); }, async text() { return text; }, body: null };
    }

    const remaining = (async function* () {
      for (const held of rest) yield held;
      for await (const chunk of stdout) yield chunk;
    })();

    return {
      ok,
      status,
      async json() {
        let text = "";
        for await (const chunk of remaining) text += chunk.toString("utf8");
        return JSON.parse(text);
      },
      body: {
        getReader() {
          return {
            async read() {
              const next = await remaining.next();
              return next.done ? { done: true, value: undefined } : { done: false, value: new Uint8Array(next.value) };
            },
            async cancel() { child.kill("SIGKILL"); }
          };
        }
      }
    };
  };
}

/**
 * curl's stdout as an async iterable of Buffers.
 *
 * A non-zero exit is raised rather than read as end-of-stream: curl failing partway
 * through — a dropped connection, a proxy hanging up — otherwise looks identical to a
 * reply that simply ended, and the reader downstream would report a truncated answer
 * as a complete one.
 */
function pump(child) {
  const queue = [];
  let waiting = null;
  let ended = false;
  let failure = null;

  const push = (item) => {
    if (waiting) { const resolve = waiting; waiting = null; resolve(item); }
    else queue.push(item);
  };
  child.stdout.on("data", (chunk) => push({ chunk }));
  child.stdout.on("end", () => { ended = true; push({ done: true }); });
  child.on("error", (error) => { failure = error; push({ done: true }); });
  child.on("close", (code) => {
    if (code !== 0 && !ended) failure = failure || new Error(`curl exited ${code}`);
    push({ done: true });
  });

  const iterator = {
    async next() {
      const item = queue.length ? queue.shift() : await new Promise((resolve) => { waiting = resolve; });
      if (failure) throw failure;
      return item.done ? { done: true, value: undefined } : { done: false, value: item.chunk };
    }
  };
  return { [Symbol.asyncIterator]: () => iterator, next: () => iterator.next() };
}

/** Reads head blocks until the body starts, returning the last status seen. */
async function readHead(stdout, stderr) {
  let buffer = Buffer.alloc(0);
  for (;;) {
    const parsed = splitHead(buffer);
    if (parsed) return parsed;
    const next = await stdout.next();
    if (next.done) {
      const detail = stderr().trim();
      throw new Error(`curl produced no HTTP response${detail ? `: ${detail}` : ""}`);
    }
    buffer = Buffer.concat([buffer, next.value]);
  }
}

/**
 * The status line and whatever body bytes already arrived with the head.
 *
 * More than one head can be there. A proxy answers CONNECT with its own 200 before
 * the provider has said anything, and a 100-continue arrives ahead of the real reply
 * — so the first status line can belong to the tunnel rather than to the API, and
 * reading it would report a rejected request as a successful one. The last one wins.
 */
function splitHead(buffer) {
  let offset = 0;
  for (;;) {
    const end = buffer.indexOf("\r\n\r\n", offset);
    if (end === -1) return null;
    const block = buffer.subarray(offset, end).toString("latin1");
    const match = /^HTTP\/[\d.]+\s+(\d{3})/.exec(block);
    if (!match) return null;
    const status = Number(match[1]);
    offset = end + 4;
    // Only a status line means another head follows. Fewer than five bytes cannot yet
    // say which it is, so wait for more rather than guess — guessing early on a
    // 1xx would hand the caller an interim reply as if it were the answer.
    const tail = buffer.subarray(offset, offset + 5).toString("latin1");
    if (tail === "HTTP/") continue;
    if (tail.length < 5 && status >= 100 && status < 200) return null;
    return { status, rest: [buffer.subarray(offset)].filter((part) => part.length) };
  }
}
