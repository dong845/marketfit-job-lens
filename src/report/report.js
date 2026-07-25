import { escapeHtml, renderAnalysisHtml } from "../ui/analysisView.js";
import { format, t } from "../ui/i18n.js";

/**
 * Full-page view of one analysis.
 *
 * The side panel is a narrow column meant for deciding; this is the version you
 * read, print, or keep. The payload is handed over through chrome.storage.session
 * rather than a blob URL, because a blob URL is owned by the side-panel document
 * and dies the moment that panel closes — taking any tab still showing it with it.
 */
const REPORT_PREFIX = "marketfit.report.";

render();

async function render() {
  const id = new URLSearchParams(location.search).get("id");
  const root = document.getElementById("report");
  if (!id) return fail(root, "This report link is missing its identifier.");

  let payload;
  try {
    const stored = await chrome.storage.session.get(REPORT_PREFIX + id);
    payload = stored[REPORT_PREFIX + id];
  } catch {
    return fail(root, "This report could not be read from browser storage.");
  }
  if (!payload) {
    return fail(root, "This report has expired. Reports are kept for the current browser session only — run the analysis again to make a new one.");
  }

  const { evidence, job, provider, model, locale, generatedAt } = payload;
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
        ${job?.url ? fact(t(locale, "reportSource"), linkTo(job.url)) : ""}
      </dl>
      <button id="printReport" class="print-button" type="button">${escapeHtml(t(locale, "reportPrint"))}</button>
    </header>
    <section class="report-body">${renderAnalysisHtml(evidence, locale, { evidenceOpen: true })}</section>
    <footer class="report-foot"><p>${escapeHtml(t(locale, "aiSupplement"))}</p></footer>`;

  document.getElementById("printReport").addEventListener("click", () => window.print());
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

function linkTo(url) {
  // rel keeps the opened page from reaching back into this one via window.opener.
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(hostname(url) || url)}</a>`;
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

export { formatTimestamp, hostname, metaLine };
