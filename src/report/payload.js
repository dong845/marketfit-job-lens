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

export function buildReportPayload({ evidence, job, provider, model, locale, generatedAt }) {
  return {
    evidence,
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

/** Keys for reports beyond the newest KEEP_REPORTS, oldest first. */
export function expiredReportKeys(storedKeys, keepNewest = KEEP_REPORTS) {
  const reports = storedKeys.filter((key) => key.startsWith(REPORT_PREFIX) && key !== LATEST_KEY);
  return reports.length <= keepNewest ? [] : reports.slice(0, reports.length - keepNewest);
}
