import { escapeHtml, renderAnalysisHtml } from "../ui/analysisView.js";
import { applyTranslations, t } from "../ui/i18n.js";
import { readReport } from "./payload.js";

const LOCALE_KEY = "marketfit.locale.v1";

/**
 * Full-page view of one analysis.
 *
 * The side panel is a narrow column meant for deciding; this is the version you
 * read, print, or keep. The payload is handed over through chrome.storage.session
 * rather than a blob URL, because a blob URL is owned by the side-panel document
 * and dies the moment that panel closes — taking any tab still showing it with it.
 */
render();

async function render() {
  const root = document.getElementById("report");
  // Read the saved interface language first: the failure messages below are shown
  // before any payload exists, and would otherwise always be English.
  const uiLocale = await savedLocale();
  // The page ships with English markup and never ran a translation pass, so the
  // loading line stayed English no matter which language the panel was set to.
  applyTranslations(document, uiLocale);

  let payload;
  try {
    payload = await loadPayload(new URLSearchParams(location.search).get("id"));
  } catch {
    return fail(root, t(uiLocale, "reportUnreadable"));
  }
  if (!payload) {
    return fail(root, t(uiLocale, "reportExpired"));
  }

  const { evidence, job, provider, model, generatedAt, candidate, sourceQuality } = payload;
  const locale = payload.locale || uiLocale;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  const heading = job?.title || t(locale, "appTitle");
  document.title = job?.company ? `${heading} — ${job.company}` : heading;

  root.innerHTML = `
    <header class="report-head">
      <h1>${escapeHtml(heading)}</h1>
      <p class="report-meta">${metaLine(job, locale)}</p>
      <dl class="report-facts">
        ${fact(t(locale, "reportModel"), model || provider)}
        ${fact(t(locale, "reportGenerated"), formatTimestamp(generatedAt, locale))}
        ${fact(t(locale, "reportSource"), linkTo(job?.url))}
      </dl>
      <button id="printReport" class="print-button" type="button">${escapeHtml(t(locale, "reportPrint"))}</button>
    </header>
    <!-- renderAnalysisHtml already closes with the AI disclaimer; a footer repeating
         it printed the same paragraph twice, one line apart. -->
    <section class="report-body">${renderAnalysisHtml(evidence, locale, candidate, sourceQuality)}</section>`;

  document.getElementById("printReport").addEventListener("click", () => window.print());
}

async function savedLocale() {
  try {
    const stored = await chrome.storage.local.get(LOCALE_KEY);
    return stored[LOCALE_KEY] === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

/** The lookup rule itself lives in payload.js, where it is testable without a DOM. */
function loadPayload(id) {
  return readReport([chrome.storage?.session, chrome.storage?.local], id);
}

function fail(root, message) {
  root.innerHTML = `<p class="loading">${escapeHtml(message)}</p>`;
}

function metaLine(job, locale) {
  const parts = [job?.company, job?.location, hostname(job?.url)].filter(Boolean);
  return parts.length ? escapeHtml(parts.join(" · ")) : escapeHtml(t(locale, "unknown"));
}

function fact(label, value) {
  if (!value) return "";
  // `value` is either already-escaped markup from linkTo() or a plain string.
  const rendered = value.startsWith("<a ") ? value : escapeHtml(value);
  return `<div><dt>${escapeHtml(label)}</dt><dd>${rendered}</dd></div>`;
}

/**
 * Renders a source link, but only for http(s). The job URL comes from a captured
 * page, and a javascript: or data: value would otherwise become a live href.
 * Anything else is shown as plain text.
 */
function linkTo(url) {
  if (!url) return "";
  let parsed;
  try { parsed = new URL(url); } catch { return escapeHtml(url); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return escapeHtml(url);
  // rel keeps the opened page from reaching back into this one via window.opener.
  return `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(parsed.hostname || url)}</a>`;
}

function formatTimestamp(value, locale) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toISOString();
  }
}

function hostname(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}
