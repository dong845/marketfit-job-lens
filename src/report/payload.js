/**
 * Shared contract between the panel that writes a report and the page that reads it.
 *
 * Kept pure and separate so both ends import the same key names and URL shape
 * rather than each spelling them out — a mismatch there fails silently, with a
 * tab that opens on nothing.
 */
export const REPORT_PREFIX = "marketfit.report.";
export const LATEST_KEY = "marketfit.report.latest";

/** Reports accumulate per analysis; keep the recent ones and drop the rest. */
export const KEEP_REPORTS = 10;

export function buildReportPayload({ evidence, job, provider, model, locale, generatedAt, candidate, resumeTruncated }) {
  return {
    evidence: withoutEvidenceQuotes(evidence),
    // What the user declared about themselves. Without it the report would render a
    // different verdict from the panel it was opened from.
    candidate: { workAuthorization: candidate?.workAuthorization || "" },
    // Counts and a capture token, never page or CV content. The report is the copy
    // that gets printed, kept and reread weeks later, so it is the one that most
    // needs to say what it was working from — dropping this here would leave the
    // durable document more confident than the panel it came from.
    sourceQuality: {
      method: job?.extraction?.method || "",
      removedLines: Number(job?.extraction?.removedLines || 0),
      resumeTruncated: Boolean(resumeTruncated)
    },
    // Only the job's identity travels — never the CV text or the captured page body.
    job: {
      title: job?.title || "",
      company: job?.company || "",
      location: job?.location || "",
      url: job?.url || ""
    },
    provider,
    model,
    locale,
    generatedAt
  };
}

/**
 * Drops the resolved source text from every evidence reference before storage.
 *
 * Parsing resolves each CV-nnn / JD-nnn ref to the literal block it names, so the
 * evidence arrays carry verbatim CV lines — name, email, phone, salary history.
 * Neither the panel nor the report renders them, so persisting them across a
 * browser session bought nothing and left the CV sitting in extension storage.
 * The ref itself stays: it is what makes a claim traceable, and it is not content.
 */
function withoutEvidenceQuotes(value) {
  if (Array.isArray(value)) return value.map(withoutEvidenceQuotes);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "quote")
      .map(([key, item]) => [key, withoutEvidenceQuotes(item)])
  );
}

/**
 * Reads one report out of whichever storage area holds it.
 *
 * The most-recent fallback applies ONLY when the link carries no id. A link naming
 * a report that has since been pruned used to fall through to it and render a
 * different company's analysis under the URL the reader had bookmarked, with
 * nothing on the page saying so. Returning null gets them "this report has
 * expired", which is both true and recoverable.
 *
 * Both areas are checked because the panel writes to local wherever session is
 * unavailable. Pure and separate so this rule can be tested without a DOM.
 */
export async function readReport(stores, id) {
  for (const store of stores.filter(Boolean)) {
    if (id) {
      const direct = await store.get(reportKey(id));
      if (direct?.[reportKey(id)]) return direct[reportKey(id)];
      continue;
    }
    const latest = await store.get(LATEST_KEY);
    const latestId = latest?.[LATEST_KEY];
    if (!latestId) continue;
    const fallback = await store.get(reportKey(latestId));
    if (fallback?.[reportKey(latestId)]) return fallback[reportKey(latestId)];
  }
  return null;
}

/** Every stored report key, so clearing a session can actually remove them. */
export function storedReportKeys(stored = {}) {
  return Object.keys(stored).filter((key) => key.startsWith(REPORT_PREFIX));
}

/**
 * chrome.runtime.getURL() takes a *path* and percent-encodes reserved characters,
 * so a "?" handed to it becomes "%3F" and the result points at a file that does
 * not exist. The query string has to be appended to the resolved URL instead.
 */
export function reportUrl(baseUrl, id) {
  return `${baseUrl}?id=${encodeURIComponent(id)}`;
}

export function reportKey(id) {
  return REPORT_PREFIX + id;
}

/**
 * Keys for reports beyond the newest KEEP_REPORTS.
 *
 * Ordered by each report's own generatedAt rather than by key order: storage
 * returns a plain object and guarantees nothing about iteration order, so
 * trusting it risks deleting the report that was just written.
 */
export function expiredReportKeys(stored = {}, keepNewest = KEEP_REPORTS) {
  const reports = Object.entries(stored)
    .filter(([key]) => key.startsWith(REPORT_PREFIX) && key !== LATEST_KEY)
    .map(([key, value]) => ({ key, at: Date.parse(value?.generatedAt ?? "") || 0 }))
    .sort((a, b) => a.at - b.at);
  return reports.length <= keepNewest ? [] : reports.slice(0, reports.length - keepNewest).map((item) => item.key);
}
