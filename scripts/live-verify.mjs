/**
 * Runs a real analysis against a real provider, and reports what it cost in time.
 *
 * Every other check in this repo runs against a stub: the unit tests hand the client
 * a fetch that returns a canned reply, and the smoke test composes the stages without
 * ever leaving the machine. That is the right default — it is fast, free, and it
 * catches contract breaks. But it cannot answer the two questions that actually
 * decide whether this feature works, because both are properties of the live API:
 * does the provider's stream parse, and how long does the answer take.
 *
 * Twice now a change passed every local check and failed in the browser — once on a
 * timeout sized against a prompt that no longer existed, once on a line terminator
 * no stub ever sent. A mock cannot disagree with you about the format; only the
 * provider can. So this drives the real createDirectApiClient over the real network
 * and reports what came back.
 *
 * It costs money to run, which is why it is not part of `npm run check`.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/live-verify.mjs --cv cv.txt --jd jd.txt
 *
 * The key is read from the environment, never written anywhere, and never printed.
 * The CV and job text are sent to the provider you are testing and to nobody else,
 * exactly as the panel would send them; their contents are never printed either.
 */
import { readFileSync } from "node:fs";
import { createDirectApiClient } from "../src/ai/directApiClient.js";
import { MODELS, modelsForProvider } from "../src/ai/models.js";

// Enough shape for the request to be valid and the model to have something to do.
// Not enough length to measure against — see the warning above.
const SYNTHETIC_CV = [
  "Experience",
  "Senior Software Engineer, Imaging Platform (2021-present)",
  "Built a 4D cine MRI reconstruction pipeline in PyTorch; ported the iterative solver to C++ and cut per-scan time 28%.",
  "Owned the deployment path onto clinical workstations, including the regulated release checklist.",
  "Software Engineer, Signal Processing (2018-2021)",
  "Wrote GPU kernels for real-time filtering. Maintained the Python bindings the research team used daily.",
  "Education",
  "MSc Computer Science, 2018.",
  "Skills",
  "Python, PyTorch, C++, CUDA, Docker, Git."
].join("\n");

const SYNTHETIC_JD = [
  "Senior MRI Reconstruction Engineer",
  "About the role: you will own reconstruction pipelines from research prototype to clinical deployment.",
  "Requirements:",
  "- Strong Python and PyTorch for deep-learning reconstruction.",
  "- C++ required for production solvers.",
  "- Experience with regulated medical software (IEC 62304) strongly preferred.",
  "- Kubernetes and CI experience preferred.",
  "- Fluent English; Dutch is a plus.",
  "Responsibilities: deliver throughput improvements, work with clinical physicists, own the release process.",
  "We do not sponsor visas for this position; candidates must already hold the right to work in the EU."
].join("\n");

const args = parseArgs(process.argv.slice(2));
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is not set. Nothing was sent.\n");
  console.error("  ANTHROPIC_API_KEY=sk-ant-... node scripts/live-verify.mjs --cv cv.txt --jd jd.txt\n");
  process.exit(2);
}

const cv = args.cv ? readFileSync(args.cv, "utf8") : SYNTHETIC_CV;
const jd = args.jd ? readFileSync(args.jd, "utf8") : SYNTHETIC_JD;
// Measuring on a toy input tells you nothing: duration tracks how much the model has
// to read and how much it decides to write, and a two-line CV produces neither.
if (!args.cv || !args.jd) {
  console.warn("! No --cv/--jd given, so this runs on synthetic text. Timings from it are");
  console.warn("  indicative only — point it at a real CV and a real posting for a number");
  console.warn("  you can trust.\n");
}

const models = args.model ? [args.model] : modelsForProvider("anthropic-api").filter((m) => m.thinking === "adaptive").map((m) => m.id);
const efforts = args.effort ? args.effort.split(",") : [null];
for (const model of models) {
  if (!MODELS[model]) {
    console.error(`Unknown model: ${model}`);
    process.exit(2);
  }
}

console.log(`CV ${cv.length} chars · job ${jd.length} chars · ${models.length * efforts.length} run(s)\n`);

const results = [];
for (const model of models) {
  for (const effort of efforts) {
    results.push(await run(model, effort));
  }
}

console.log("\n" + "-".repeat(78));
console.log(
  "model".padEnd(20) + "effort".padEnd(9) + "thinking".padStart(10) + "writing".padStart(10) +
  "total".padStart(9) + "output".padStart(10) + "  result"
);
for (const r of results) {
  console.log(
    r.model.padEnd(20) +
    String(r.effort ?? MODELS[r.model].effort ?? "-").padEnd(9) +
    seconds(r.firstTextMs).padStart(10) +
    // Not `total - firstText` when the answer never started: that arithmetic turns a
    // null into zero and reports a run that produced nothing as having written it
    // instantly, which is the opposite of what happened.
    seconds(r.firstTextMs === null ? null : r.totalMs - r.firstTextMs).padStart(10) +
    seconds(r.totalMs).padStart(9) +
    String(r.chars ? `${r.chars}c` : "-").padStart(10) +
    "  " + (r.ok ? `ok — ${r.verdict}, ${r.sections}` : `FAILED — ${r.error}`)
  );
}
console.log("-".repeat(78));
console.log("thinking = until the first character of the answer; writing = the rest.\n");

process.exit(results.every((r) => r.ok) ? 0 : 1);

async function run(model, effort) {
  const label = `${model}${effort ? ` @ ${effort}` : ""}`;
  process.stdout.write(`${label}: `);
  const startedAt = Date.now();
  const timing = { firstByteMs: null, firstTextMs: null, chars: 0 };

  const client = createDirectApiClient({
    permissionsApi: { async contains() { return true; } },
    fetchImpl: instrumentedFetch(timing, startedAt, effort)
  });

  try {
    const response = await client.runTask(task(model), {
      onProgress: ({ firstTextMs, chars }) => {
        if (timing.firstTextMs === null && firstTextMs !== null) timing.firstTextMs = firstTextMs;
        timing.chars = chars;
      }
    });
    const totalMs = Date.now() - startedAt;
    const r = response.result;
    const sections = [
      `${r.requirements?.length ?? 0} requirements`,
      `${r.gaps?.length ?? 0} gaps`,
      `${r.suggestedActions?.length ?? 0} actions`
    ].join(", ");
    console.log(`ok in ${seconds(totalMs)} (answer began at ${seconds(timing.firstTextMs)})`);
    return { model, effort, ok: true, totalMs, ...timing, verdict: r.recommendation?.verdict ?? "?", sections };
  } catch (error) {
    const totalMs = Date.now() - startedAt;
    console.log(`FAILED after ${seconds(totalMs)} — ${error.code || error.name}: ${error.message}`);
    return { model, effort, ok: false, totalMs, ...timing, error: `${error.code || error.name}: ${String(error.message).slice(0, 120)}` };
  }
}

/**
 * The real fetch, wrapped to time the first byte and — when sweeping — to rewrite the
 * effort level on the way out.
 *
 * Rewriting here rather than in models.js is deliberate: the point of this script is
 * to exercise the shipped path, and editing the registry to try a setting would mean
 * measuring a build nobody is running. The first-byte time is separate from the
 * first-text time the client reports, and the gap between them is the model opening
 * its response before it has decided what to say.
 */
function instrumentedFetch(timing, startedAt, effort) {
  return async (url, options) => {
    let body = options.body;
    if (effort) {
      const parsed = JSON.parse(body);
      if (parsed.output_config) parsed.output_config.effort = effort;
      body = JSON.stringify(parsed);
    }
    const response = await fetch(url, { ...options, body });
    if (!response.body) return response;
    const source = response.body.getReader();
    return {
      ok: response.ok,
      status: response.status,
      json: () => response.json(),
      body: {
        getReader() {
          return {
            async read() {
              const chunk = await source.read();
              if (!chunk.done && timing.firstByteMs === null) timing.firstByteMs = Date.now() - startedAt;
              return chunk;
            }
          };
        }
      }
    };
  };
}

function task(model) {
  return {
    requestId: `live-verify-${Date.now()}`,
    taskType: "analyze_job",
    provider: "anthropic-api",
    privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey },
    options: { model, language: args.language || "en" },
    input: {
      resumeText: cv,
      job: { title: args.title || "Senior Engineer", company: "Example", location: "Leiden, NL", description: jd, url: "" },
      candidate: { workAuthorization: "unknown" },
      sourceQuality: { method: "manual_paste", removedLines: 0, resumeTruncated: false }
    }
  };
}

function seconds(ms) {
  return ms === null || ms === undefined ? "-" : `${(ms / 1000).toFixed(1)}s`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    out[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") === false ? argv[++i] : true;
  }
  return out;
}
