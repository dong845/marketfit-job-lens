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
  // Leading whitespace and underscores both matter: "^" does not skip indentation, so
  // every key that began a line was invisible here, and error codes are keys too. The
  // en/zh sync check missed both faults because it under-counted each side equally.
  return new Set([...i18n.slice(start, end).matchAll(/(?:^\s*|[{,]\s*)([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map((m) => m[1]));
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
// The renderer reaches most keys indirectly — a lookup table keyed by an enum, a
// ternary assigned to a variable, or a suffix appended to a computed key. Matching
// only literal t("…") arguments there reported live keys as orphans, which teaches
// people to ignore this warning; that is worse than not having it.
const view = readFileSync(join(root, "src/ui/analysisView.js"), "utf8");
for (const m of view.matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)) if (en.has(m[1])) usedKeys.add(m[1]);
// Keys assembled around a lookup value, derived exactly from the lookup itself.
// A suffix rule ("anything ending in Sub counts as used") hides the case where the
// key that gets built does not exist, which is the failure this must catch.
const mapValues = (name) => {
  const start = view.indexOf(name);
  if (start < 0) return [];
  return [...view.slice(start, view.indexOf("}", start)).matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map((m) => m[1]);
};
const mapKeys = (name) => {
  const start = view.indexOf(name);
  if (start < 0) return [];
  return [...view.slice(start, view.indexOf("}", start)).matchAll(/([a-z_]+):/g)].map((m) => m[1]);
};
const derived = [
  ...mapValues("function verdictKey").map((key) => `${key}Sub`),
  ...mapKeys("const ALIGNMENT_TONE").map((value) => `alignment${value[0].toUpperCase()}${value.slice(1)}`)
];
for (const key of derived) {
  usedKeys.add(key);
  const missing = ["en", "zh"].filter((loc) => !block(loc).has(key));
  if (missing.length) fail.push(`the renderer builds "${key}" but it is missing from ${missing.join("/")} — the raw key would render`);
}
// Keys built per option with optionKey(prefix, value). Derived exactly rather than
// matched by prefix: the loose version marked every authHelp* key as used, which
// meant a string filed one word off from the value that reaches it — and therefore
// never reachable — still counted as consumed. t() answers a missing key with the
// key itself, so it rendered "authHelpStudentOrGraduate" on screen and no check fired.
const panelSource = readFileSync(join(root, "src/sidepanel/sidepanel.js"), "utf8");
const panelHtml = readFileSync(join(root, "src/sidepanel/sidepanel.html"), "utf8");
const camel = (value) => String(value).replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase());
const optionValuesOf = (selectId) => {
  const start = panelHtml.indexOf(`id="${selectId}"`);
  if (start < 0) return [];
  return [...panelHtml.slice(start, panelHtml.indexOf("</select>", start)).matchAll(/<option value="([^"]*)"/g)]
    .map((m) => m[1]).filter(Boolean);
};
for (const [prefix, selectId] of [["authHelp", "workAuthorization"], ["apiKeyHelp", "agentProvider"]]) {
  if (!panelSource.includes(`optionKey("${prefix}"`)) continue;
  for (const value of optionValuesOf(selectId)) {
    const key = prefix + camel(value.replaceAll("-", "_"));
    usedKeys.add(key);
    const missing = ["en", "zh"].filter((loc) => !block(loc).has(key));
    if (missing.length) fail.push(`select #${selectId} option "${value}" needs ${key}, missing from ${missing.join("/")} — the raw key would render`);
  }
}
for (const m of readFileSync(join(root, "src/ai/models.js"), "utf8").matchAll(/labelKey: "([^"]+)"/g)) usedKeys.add(m[1]);
// t("typo") renders "typo" rather than failing, so every literal key referenced
// anywhere must actually exist. This is the backstop under all the rules above.
for (const f of consumers) {
  const src = readFileSync(join(root, f), "utf8");
  for (const m of src.matchAll(/\b(?:t|format)\(\w+,\s*"([A-Za-z][A-Za-z0-9_]*)"/g)) {
    if (!en.has(m[1])) fail.push(`${f}: t("${m[1]}") has no such string — the raw key would render`);
  }
  // applyTranslations assigns textContent from the key, so a mistyped data-i18n
  // prints the key on screen exactly the same way a mistyped t() call does.
  for (const m of src.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)) {
    if (!en.has(m[1])) fail.push(`${f}: data-i18n="${m[1]}" has no such string — the raw key would render`);
  }
}
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
// Two different things wear the same shape. A URL the code FETCHES is a place user
// data goes, and the privacy claim depends on there being exactly three. A URL the
// code puts in a link is somewhere the user chooses to navigate, and sends nothing.
// Collapsing them would either weaken the guarantee or ban console links; keeping
// them apart means the promise stays exact and stays checkable.
const fetched = new Set();
const linked = new Set();
const origins = new Set();
for (const file of jsFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/https?:\/\/[a-zA-Z0-9.\-:{}$]+/g)) {
    // PROVIDER_CONSOLES is the declared home for link destinations; anything else is
    // treated as an endpoint until someone says otherwise.
    const consoleBlock = src.slice(src.indexOf("PROVIDER_CONSOLES"), src.indexOf("});", src.indexOf("PROVIDER_CONSOLES")) + 3);
    // A third kind: the origin pattern handed to chrome.permissions. It is built from
    // the page the user is on, never fetched, and collapsing it into either of the
    // other two would weaken the "exactly three endpoints" guarantee or ban it.
    if (m[0].includes("${")) { origins.add(m[0]); continue; }
    (src.includes("PROVIDER_CONSOLES") && consoleBlock.includes(m[0]) ? linked : fetched).add(m[0]);
  }
}
const allowed = /^https:\/\/api\.(openai|anthropic|deepseek)\.com/;
const allowedLinks = /^https:\/\/(platform\.openai\.com|platform\.claude\.com|platform\.deepseek\.com)(\/|$)/;
for (const h of fetched) if (!allowed.test(h)) fail.push(`unexpected network host in src/: ${h}`);
for (const h of linked) if (!allowedLinks.test(h)) fail.push(`unexpected outbound link in src/: ${h}`);
ok.push(`network hosts limited to: ${[...fetched].join(", ")}`);
ok.push(`outbound links limited to: ${[...linked].join(", ")}`);
// Permission origins must be https: an http origin the manifest cannot grant yields
// a denial the user cannot act on.
for (const o of origins) if (!o.startsWith("https://")) fail.push(`permission origin is not https: ${o}`);
ok.push(`permission origins requested at runtime: ${[...origins].join(", ") || "none"}`);

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

// ---- 9. every class the renderer emits is styled on both surfaces
// The panel and the report share renderAnalysisHtml but keep separate stylesheets,
// so a new element lands unstyled on whichever one was not updated — and an unstyled
// class also catches the reverse mistake, a hook added and never given a rule.
const viewSource = readFileSync(join(root, "src/ui/analysisView.js"), "utf8");
const emitted = new Set();
for (const m of viewSource.matchAll(/class="([^"]*)"/g)) {
  // Interpolated class names split across quotes inside the template, so only
  // literal identifiers count; the computed ones are enumerated below.
  for (const cls of m[1].split(/\s+/)) if (/^[a-z][a-z0-9-]*$/i.test(cls)) emitted.add(cls);
}
// tone-* and tag-* are built from a variable; enumerate the tones they can take.
for (const tone of ["ok", "go", "warn", "bad", "muted"]) emitted.add(`tone-${tone}`).add(`tag-${tone}`);
for (const sheet of ["src/sidepanel/sidepanel.css", "src/report/report.css"]) {
  const css = readFileSync(join(root, sheet), "utf8");
  const missing = [...emitted].filter((cls) => !css.includes(`.${cls}`));
  if (missing.length) fail.push(`${rel(join(root, sheet))} has no rule for: ${missing.join(", ")}`);
}
ok.push(`both stylesheets cover all ${emitted.size} rendered classes`);

// ---- 10. nothing user-visible is available in only one language
// Errors are built in layers that have no locale, so they carry a code the panel
// translates. A code with no entry falls back to its English message, which is how
// a Chinese user used to hit an English wall the moment anything failed — silently,
// because the fallback works. This makes that silence fail instead.
const thrownCodes = new Set();
for (const file of jsFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/new (?:DirectApiError|ResumePdfError)\((?:[^;]*?),\s*"([a-zA-Z][\w]*)"/g)) thrownCodes.add(m[1]);
  for (const m of src.matchAll(/new BridgeError\("([A-Z_]+)"/g)) thrownCodes.add(m[1]);
}
// A BridgeError raised while validating our OWN request never reaches the panel as
// itself — parseTaskRequest runs before the call, on data the panel built.
const internalCodes = new Set(["TASK_NOT_ALLOWED", "PROVIDER_INVALID", "PRIVACY_MODE_INVALID", "PROVIDER_REFUSED"]);
for (const code of thrownCodes) {
  if (internalCodes.has(code)) continue;
  const missing = ["en", "zh"].filter((loc) => !block(loc).has(code));
  if (missing.length) fail.push(`error code "${code}" has no ${missing.join("/")} message — it would surface in English`);
}
ok.push(`all ${thrownCodes.size - internalCodes.size} user-facing error codes are translated`);

// Capture internals reach the panel as tokens too, and had the same problem. Read
// from the exported map rather than guessing at string literals: guessing invented a
// "json_ld" that does not exist and missed "schema_org_jsonld" and "empty", which do.
const captureTokens = [...readFileSync(join(root, "src/extraction/schema.js"), "utf8")
  .matchAll(/^\s*[a-zA-Z]+: "([a-z_]+)",?$/gm)].map((m) => m[1]);
const qualityReasons = [...readFileSync(join(root, "src/extraction/extractJob.js"), "utf8")
  .matchAll(/reasons\.push\("([A-Z_]+)"\)/g)].map((m) => m[1]);
for (const token of new Set(captureTokens)) {
  const key = `method${token.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())}`;
  const missing = ["en", "zh"].filter((loc) => !block(loc).has(key));
  if (missing.length) fail.push(`capture method "${token}" has no ${missing.join("/")} label (${key}) — it would print as a raw token`);
}
for (const reason of new Set(qualityReasons)) {
  const missing = ["en", "zh"].filter((loc) => !block(loc).has(reason));
  if (missing.length) fail.push(`capture quality reason "${reason}" has no ${missing.join("/")} label — it would print as a raw token`);
}
ok.push(`all ${new Set(captureTokens).size} capture methods and ${new Set(qualityReasons).size} quality reasons are labelled in both languages`);

// Codes and tokens are reached through errorText() and captureMethodLabel() rather
// than a literal t("…"), so they are only visibly consumed once those sets are known.
for (const code of thrownCodes) usedKeys.add(code);
for (const token of captureTokens) usedKeys.add(`method${token.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())}`);
for (const reason of qualityReasons) usedKeys.add(reason);
// A quoted string in an error-producing module that happens to be a key IS the key:
// statusMessage() returns codes, and a ternary picks between two of them.
for (const f of ["src/ai/directApiClient.js", "src/ai/providerPayload.js", "src/profile/pdfResume.js", "src/profile/pdfValidation.js", "src/sidepanel/sidepanel.js", "src/privacy/redaction.js"]) {
  for (const m of readFileSync(join(root, f), "utf8").matchAll(/"([A-Za-z][A-Za-z0-9_]*)"/g)) if (en.has(m[1])) usedKeys.add(m[1]);
}
const orphans = [...en].filter((k) => k !== "en" && !usedKeys.has(k));
if (orphans.length) warn.push(`i18n keys with no visible consumer: ${orphans.join(", ")}`);

// ---- 11. the injected page extractor has nothing in a temporal dead zone
// collectVisibleJobPage is handed to chrome.scripting, so its helpers are function
// declarations that hoist — but a const does not. One declared after the function's
// return never initialises, which parses, imports and lints cleanly and then throws
// ReferenceError on the first line that reads it, inside the page where nothing here
// can see. tests/pageCapture.test.mjs executes the function; this catches the shape
// even on a path that test does not reach.
const capture = readFileSync(join(root, "src/extraction/tabCapture.js"), "utf8");
const injected = capture.slice(capture.indexOf("export async function collectVisibleJobPage"));
const returnAt = injected.search(/^  return /m);
if (returnAt > 0) {
  const afterReturn = injected.slice(returnAt);
  for (const m of afterReturn.matchAll(/^  (const|let) (\w+)/gm)) {
    fail.push(`tabCapture.js: ${m[1]} ${m[2]} is declared after collectVisibleJobPage returns, so it never initialises`);
  }
}
ok.push("the injected page extractor initialises everything it reads");

// ---- 12. no visible English left in the markup itself
// The i18n checks all compare strings that ARE in i18n.js. Text hardcoded in HTML
// with no data-i18n never enters that set, so seven country names sat untranslated
// in the market dropdown while every language check passed.
const TRANSLATION_EXEMPT = [
  /^MarketFit/,                       // the product name
  /^(English|中文)$/,                  // language names are shown in their own language
  /^(activeTab|scripting|storage|sidePanel|tabs)$/ // literal Chrome permission ids
];
for (const page of ["src/sidepanel/sidepanel.html", "src/report/report.html"]) {
  const markup = readFileSync(join(root, page), "utf8");
  // Anything inside an element that carries data-i18n is replaced at runtime.
  const unmarked = markup.replace(/<(\w+)([^>]*\bdata-i18n(?:-title|-placeholder)?="[^"]*"[^>]*)>[\s\S]*?<\/\1>/g, " ");
  for (const m of unmarked.matchAll(/>([^<>{}]*[A-Za-z]{3,}[^<>]*)</g)) {
    const text = m[1].trim();
    if (!text || TRANSLATION_EXEMPT.some((pattern) => pattern.test(text))) continue;
    fail.push(`${page}: "${text.slice(0, 48)}" has no data-i18n, so it stays English in Chinese`);
  }
}
ok.push("no untranslated visible text in either page's markup");

// ---- 13. the README's model table matches the registry
// Every check so far looked at code. The README kept advertising DeepSeek V3 and R1
// for two days after the API retired those names, because nothing compared prose
// against the registry. Documentation goes stale in exactly the way code does; the
// difference is that only the code has anything watching it.
// Both translations, because the second one goes stale the same way the first did.
const readmes = ["README.md", "README.zh-CN.md"].map((file) => [file, readFileSync(join(root, file), "utf8")]);
const providerRow = (readme, name) => (readme.match(new RegExp(`^\\| ${name} \\|([^|]*)\\|`, "m")) || [, ""])[1];
const modelLabels = (provider) => [...i18n.matchAll(/labelKey: "([^"]+)"/g)] && [...readFileSync(join(root, "src/ai/models.js"), "utf8")
  .matchAll(new RegExp(`provider: "${provider}",\\s*\\n\\s*labelKey: "([^"]+)"`, "g"))].map((m) => m[1]);
for (const [file, readme] of readmes) {
  for (const [provider, rowName] of [["openai-api", "OpenAI"], ["anthropic-api", "Anthropic"], ["deepseek-api", "DeepSeek"]]) {
    const row = providerRow(readme, rowName);
    if (!row) { fail.push(`${file} has no model row for ${rowName}`); continue; }
    for (const key of modelLabels(provider)) {
      // The label carries a parenthetical hint the table omits; compare the name only.
      const name = (block("en").has(key) ? (i18n.match(new RegExp(`${key}: "([^"(]+)`)) || [, key])[1] : key).trim();
      if (!row.includes(name)) fail.push(`${file} lists no "${name}" for ${rowName} — the model table has drifted from the registry`);
    }
  }
  // Each translation has to be reachable from the other, or one of them is orphaned.
  const other = file === "README.md" ? "README.zh-CN.md" : "README.md";
  if (!readme.includes(`(${other})`)) fail.push(`${file} does not link to ${other}`);
}
ok.push(`both READMEs' model tables match the registry and link to each other`);

// ---- every card the panel renders is described in both READMEs
// The model table was checked against the registry and the prose was checked by
// nobody, so two whole analysis sections shipped and the "Using it" table still
// described the panel before them — through 29 green checks. The headings are derived
// from analysisView.js rather than listed here, so a card added later is covered
// without anyone remembering to extend this.
//
// Not in the table by decision, not by accident: the four below sit in the collapsed
// Prepare and Check-before-applying groups, and the table walks the decision path
// rather than enumerating every card. Adding a new key here needs a reason on the line.
const UNDOCUMENTED_BY_DESIGN = new Set(["aiStrengths", "resumeTailoring", "interviewFocus", "aiRisks"]);
const headingKeys = new Set();
for (const m of viewSource.matchAll(/renderCards\(t\(locale, "(\w+)"\)/g)) headingKeys.add(m[1]);
for (const m of viewSource.matchAll(/<h3>\$\{escapeHtml\(t\(locale, "(\w+)"\)\)\}<\/h3>/g)) headingKeys.add(m[1]);
if (headingKeys.size < 8) fail.push(`only ${headingKeys.size} card headings found in analysisView.js — the heading pattern changed and this check has gone blind`);
// block() answers which keys exist, not what they say, so the heading text is read
// from the locale's own slice — searching the whole file would find the en string when
// asked for the zh one, since en is declared first. JSON.parse decodes the escapes a
// raw capture would leave in, which no README contains literally.
const headingText = (locale, key) => {
  const from = i18n.indexOf(`${locale}: {`);
  const to = locale === "en" ? i18n.indexOf("zh: {") : i18n.indexOf("\n};");
  const m = i18n.slice(from, to).match(new RegExp(`\\b${key}: ("(?:[^"\\\\]|\\\\.)*")`));
  return m ? JSON.parse(m[1]).trim() : "";
};
for (const key of [...headingKeys].filter((key) => !UNDOCUMENTED_BY_DESIGN.has(key))) {
  for (const [file, readme] of readmes) {
    const locale = file === "README.md" ? "en" : "zh";
    const heading = headingText(locale, key);
    if (!heading) { fail.push(`${key} has no ${locale} string to document`); continue; }
    if (!readme.includes(heading)) fail.push(`${file} never mentions "${heading}" — the panel renders that card and the README does not describe it`);
  }
}
ok.push(`all ${headingKeys.size - UNDOCUMENTED_BY_DESIGN.size} documented card headings appear in both READMEs`);

console.log(`\n${"=".repeat(64)}\nFAIL (${fail.length})`);
fail.forEach((f) => console.log("  ✗ " + f));
if (!fail.length) console.log("  none");
console.log(`\nWARN (${warn.length})`);
warn.forEach((w) => console.log("  ! " + w));
if (!warn.length) console.log("  none");
console.log(`\nPASSED ${ok.length} checks`);
ok.forEach((o) => console.log("  ✓ " + o));
process.exit(fail.length ? 1 : 0);
