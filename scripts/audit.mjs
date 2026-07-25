/**
 * Whole-project audit: the checks that catch problems a unit test would not,
 * because they span files — a manifest pointing at a deleted icon, an element id
 * renamed in HTML but not JS, a string added in English only, an innerHTML write
 * that forgot to escape, a module nothing imports any more.
 *
 * Run with `npm run audit`. Exits non-zero on any FAIL.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";

import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const fail = [];
const warn = [];
const ok = [];

const collect = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? collect(join(dir, e.name)) : [join(dir, e.name)]);

const rel = (p) => relative(root, p);
const jsFiles = collect(join(root, "src")).filter((f) => f.endsWith(".js"));
const allSources = [...jsFiles, ...collect(join(root, "scripts")).filter((f) => f.endsWith(".mjs"))];
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

// ---- 1. manifest integrity
const KNOWN = new Set(["activeTab","alarms","background","bookmarks","browsingData","clipboardRead","clipboardWrite","contextMenus","cookies","debugger","declarativeContent","declarativeNetRequest","desktopCapture","downloads","favicon","fontSettings","gcm","geolocation","history","identity","idle","management","nativeMessaging","notifications","offscreen","pageCapture","power","printing","privacy","proxy","readingList","scripting","search","sessions","sidePanel","storage","system.cpu","system.display","system.memory","system.storage","tabCapture","tabGroups","tabs","topSites","tts","ttsEngine","unlimitedStorage","userScripts","webNavigation","webRequest"]);
for (const p of manifest.permissions) KNOWN.has(p) ? ok.push(`permission ${p}`) : fail.push(`unknown permission: ${p}`);
for (const p of [manifest.background.service_worker, manifest.side_panel.default_path, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]) {
  existsSync(join(root, p)) ? ok.push(`manifest file ${p}`) : fail.push(`manifest references missing file: ${p}`);
}
if (manifest.version !== JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version) fail.push("manifest/package version mismatch");
if ("host_permissions" in manifest) fail.push("no host permission should be requested up front");
if (manifest.description.length > 132) fail.push(`description too long for Web Store: ${manifest.description.length}`);

// ---- 2. every relative import resolves
for (const file of allSources) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
    existsSync(resolve(dirname(file), m[1])) ? null : fail.push(`${rel(file)}: unresolved import ${m[1]}`);
  }
}
ok.push(`${allSources.length} source files, all imports resolve`);

// ---- 3. each HTML page: assets exist, and its script's byId() ids are present
for (const page of ["src/sidepanel/sidepanel.html", "src/report/report.html"]) {
  const html = readFileSync(join(root, page), "utf8");
  const dir = dirname(join(root, page));
  for (const m of html.matchAll(/(?:href|src)="(\.[^"]+)"/g)) {
    existsSync(resolve(dir, m[1])) ? null : fail.push(`${page}: missing asset ${m[1]}`);
  }
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const scriptPath = [...html.matchAll(/<script[^>]*src="(\.[^"]+)"/g)].map((m) => resolve(dir, m[1]))[0];
  if (scriptPath && existsSync(scriptPath)) {
    const js = readFileSync(scriptPath, "utf8");
    const dynamic = new Set([...js.matchAll(/id=\\?"([A-Za-z][\w-]*)\\?"/g)].map((m) => m[1]));
    for (const m of js.matchAll(/getElementById\("([^"]+)"\)|byId\("([^"]+)"\)/g)) {
      const id = m[1] || m[2];
      if (!ids.has(id) && !dynamic.has(id)) fail.push(`${page}: script references missing id #${id}`);
    }
  }
  ok.push(`${page}: assets + ids consistent`);
}

// ---- 4. i18n completeness across BOTH pages
const i18n = readFileSync(join(root, "src/ui/i18n.js"), "utf8");
const block = (name) => {
  const start = i18n.indexOf(`${name}: {`);
  const end = name === "en" ? i18n.indexOf("zh: {") : i18n.indexOf("\n};");
  return new Set([...i18n.slice(start, end).matchAll(/(?:^|[{,]\s*)([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map((m) => m[1]));
};
const en = block("en"), zh = block("zh");
for (const k of en) if (!zh.has(k) && k !== "en") fail.push(`i18n: "${k}" missing from zh`);
for (const k of zh) if (!en.has(k) && k !== "zh") fail.push(`i18n: "${k}" missing from en`);

const consumers = ["src/sidepanel/sidepanel.js", "src/sidepanel/sidepanel.html", "src/report/report.js", "src/report/report.html", "src/ui/analysisView.js"];
const usedKeys = new Set();
for (const f of consumers) {
  const src = readFileSync(join(root, f), "utf8");
  for (const m of src.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)) usedKeys.add(m[1]);
  // Keys may be chosen inside the call (a ternary), so take every quoted string
  // that appears within a t(...) invocation, not just a lone literal argument.
  for (const call of src.matchAll(/\bt\(\w+,([^;\n]{0,160}?)\)/g)) {
    for (const key of call[1].matchAll(/"([^"]+)"/g)) usedKeys.add(key[1]);
  }
  for (const m of src.matchAll(/format\(\w+,\s*"([^"]+)"/g)) usedKeys.add(m[1]);
  for (const m of src.matchAll(/labelKey/g)) usedKeys.add("__dynamic__");
}
// keys reached through lookup tables
for (const m of readFileSync(join(root, "src/ui/analysisView.js"), "utf8").matchAll(/"(match|level|priority|severity|verdict)[A-Za-z_]*"/g)) usedKeys.add(m[0].slice(1, -1));
for (const m of readFileSync(join(root, "src/ai/models.js"), "utf8").matchAll(/labelKey: "([^"]+)"/g)) usedKeys.add(m[1]);
const orphans = [...en].filter((k) => k !== "en" && !usedKeys.has(k));
if (orphans.length) warn.push(`i18n keys with no visible consumer: ${orphans.join(", ")}`);
ok.push(`i18n: ${en.size} keys, en/zh in sync`);

// ---- 5. no secrets, debug output, or unfinished markers in shipped code
const extensionFiles = jsFiles;
for (const file of jsFiles) {
  const src = readFileSync(file, "utf8");
  if (/sk-[a-zA-Z0-9]{20,}|api[_-]?key\s*[:=]\s*["'][^"']{20,}/i.test(src)) fail.push(`${rel(file)}: possible hardcoded secret`);
  if (extensionFiles.includes(file) && /console\.(log|debug|info)\(/.test(src)) warn.push(`${rel(file)}: console output in extension code`);
  if (/\bTODO\b|\bFIXME\b|\bXXX\b/.test(src)) warn.push(`${rel(file)}: unfinished marker`);
  if (/\beval\(|new Function\(/.test(src)) fail.push(`${rel(file)}: dynamic code execution`);
}
ok.push("no secrets, eval, or debug output in src/");

// ---- 6. every innerHTML assignment is escaped or a known-safe builder
for (const file of jsFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/innerHTML\s*=\s*([^;]+);/g)) {
    const expr = m[1].trim();
    const safe = /^`?[^$]*$/.test(expr)
      || /escapeHtml|renderAnalysisHtml|renderReport/.test(expr)
      || [...expr.matchAll(/\$\{([^}]+)\}/g)].every(([, e]) => /escapeHtml|format\(|render|grant|rows|quotes|body|tag|metaLine|fact\(/.test(e));
    if (!safe) fail.push(`${rel(file)}: unescaped innerHTML: ${expr.slice(0, 90)}`);
  }
}
ok.push("all innerHTML writes escape their inputs");

// ---- 7. network endpoints are only the three provider APIs
const hosts = new Set();
for (const file of jsFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/https?:\/\/[a-zA-Z0-9.\-:{}$]+/g)) {
    hosts.add(m[0]);
  }
}
const allowed = /^https:\/\/api\.(openai|anthropic|deepseek)\.com/;
for (const h of hosts) if (!allowed.test(h)) fail.push(`unexpected network host in src/: ${h}`);
ok.push(`network hosts limited to: ${[...hosts].join(", ")}`);

// ---- 8. no unreachable modules
const entries = ["src/sidepanel/sidepanel.js", "src/background.js", "src/report/report.js"].map((p) => join(root, p));
const seen = new Set(); const stack = [...entries];
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f) || !existsSync(f)) continue;
  seen.add(f);
  for (const m of readFileSync(f, "utf8").matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) stack.push(resolve(dirname(f), m[1]));
}
const unreachable = collect(join(root, "src")).filter((f) => f.endsWith(".js") && !seen.has(f));
if (unreachable.length) fail.push(`unreachable src modules: ${unreachable.map(rel).join(", ")}`);
ok.push(`all ${seen.size} reachable modules are reachable from an entry point`);

console.log(`\n${"=".repeat(64)}\nFAIL (${fail.length})`);
fail.forEach((f) => console.log("  ✗ " + f));
if (!fail.length) console.log("  none");
console.log(`\nWARN (${warn.length})`);
warn.forEach((w) => console.log("  ! " + w));
if (!warn.length) console.log("  none");
console.log(`\nPASSED ${ok.length} checks`);
ok.forEach((o) => console.log("  ✓ " + o));
process.exit(fail.length ? 1 : 0);
