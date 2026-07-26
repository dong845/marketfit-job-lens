const TAB_QUERY_TIMEOUT_MS = 4000;
const PAGE_CAPTURE_TIMEOUT_MS = 12000;

export async function captureActiveTab({ tabsApi, scriptingApi, tabQueryTimeoutMs = TAB_QUERY_TIMEOUT_MS, pageCaptureTimeoutMs = PAGE_CAPTURE_TIMEOUT_MS }) {
  let tab;
  try {
    [tab] = await withTimeout(tabsApi.query({ active: true, currentWindow: true }), tabQueryTimeoutMs, "Timed out while locating the active tab.");
  } catch (error) {
    return { tab: null, snapshot: null, error };
  }
  if (!tab?.id) return { tab: null, snapshot: null, error: null };
  try {
    const results = await withTimeout(
      scriptingApi.executeScript({ target: { tabId: tab.id, allFrames: true }, func: collectVisibleJobPage }),
      pageCaptureTimeoutMs,
      "Timed out while reading the current job page."
    );
    const snapshot = bestFrameSnapshot(results);
    return { tab, snapshot: snapshot || {}, error: null };
  } catch (error) {
    return { tab, snapshot: null, error };
  }
}

function bestFrameSnapshot(results = []) {
  return results
    .map((item) => item?.result)
    .filter(Boolean)
    .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0) || String(b.text || "").length - String(a.text || "").length)[0];
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export function siteOriginForPermission(url) {
  try {
    const parsed = new URL(url);
    // https only, matching optional_host_permissions. Requesting an origin the
    // manifest cannot grant produces a denial the user cannot act on, and a broad
    // http://*/* is the permission most likely to stall a Web Store review for a
    // capability real job boards never need.
    return parsed.protocol === "https:" ? `https://${parsed.host}/*` : "";
  } catch {
    return "";
  }
}

export async function requestOptionalSiteAccess(permissionsApi, origin) {
  if (!origin) return false;
  return permissionsApi.request({ origins: [origin] });
}

export function isSameJobPage(firstUrl, secondUrl) {
  try {
    const first = new URL(firstUrl);
    const second = new URL(secondUrl);
    first.hash = "";
    second.hash = "";
    return first.href === second.href;
  } catch {
    return firstUrl === secondUrl;
  }
}

// This function runs inside the active job page, so it must stay self-contained.
export async function collectVisibleJobPage() {
  /**
   * Containers that are never the posting, removed before any text is read.
   *
   * Doing this in the page rather than on the text afterwards is strictly better
   * where it applies: a "similar jobs" rail is one element, so it goes as a unit
   * instead of line by line, and removing it before scoring also stops it inflating
   * the score of a container that mostly is not the job.
   *
   * Every entry is a name that a job description is never given. Deliberately
   * absent: [class*='sidebar'] and a bare [class*='related'] — job pages routinely
   * put the salary, location and contract type in a sidebar, and losing those is
   * exactly the silent damage this whole path is built to avoid.
   */
  const NOISE_SELECTOR = [
    "script", "style", "noscript", "svg", "canvas", "iframe", "nav", "footer", "header", "form",
    "[role='navigation']", "[role='banner']", "[role='contentinfo']", "[role='search']", "[role='dialog']", "[role='alertdialog']",
    "[aria-hidden='true']", "[hidden]",
    "[class*='cookie']", "[id*='cookie']", "[class*='consent']", "[class*='breadcrumb']",
    "[class*='similar-job']", "[class*='similarJob']", "[class*='related-job']", "[class*='relatedJob']",
    "[class*='recommended-job']", "[class*='recommendedJob']", "[class*='other-jobs']", "[class*='more-jobs']",
    "[class*='social-share']", "[class*='newsletter']"
  ].join(", ");
  let previousLength = 0;
  let stableCount = 0;
  let best = null;

  for (let i = 0; i < 12; i += 1) {
    const snapshot = collectJobPageNow();
    if (!best || snapshot.qualityScore > best.qualityScore || (snapshot.qualityScore === best.qualityScore && snapshot.text.length > best.text.length)) best = snapshot;

    const length = snapshot.text.length;
    const stable = length > 300 && Math.abs(length - previousLength) < 30;
    stableCount = stable ? stableCount + 1 : 0;
    if (stableCount >= 2 || snapshot.qualityScore >= 0.88) break;

    previousLength = length;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return best || collectJobPageNow();


  function collectJobPageNow() {
    const selectors = [
      "[data-automation-id='jobPostingDescription']",
      "[data-automation-id='jobPostingPage']",
      "[data-qa='job-description']",
      "[data-testid*='job-description']",
      "[class*='job-description']",
      "[class*='jobDescription']",
      "[class*='JobDescription']",
      "[class*='job-detail']",
      "[class*='jobDetail']",
      "[class*='position-detail']",
      "[class*='positionDetail']",
      ".job__description",
      ".job-description",
      ".description",
      "#job-description",
      "#content",
      "main article",
      "main",
      "article",
      "body"
    ];
    const candidates = selectors.flatMap((selector) => textCandidates(selector)).filter((item) => item.text.length > 80);
    const bestCandidate = candidates.sort((a, b) => b.score - a.score || b.text.length - a.text.length)[0];
    const sourceText = (bestCandidate?.text || extractStructuredText(document.body || document.documentElement)).slice(0, 24000);
    const qualityScore = scoreText(sourceText);
    const valueAt = (selector) => oneLineText(document.querySelector(selector));
    return {
      url: location.href,
      capturedAt: new Date().toISOString(),
      documentTitle: document.title,
      siteHint: `${location.hostname} ${document.documentElement.className}`,
      text: sourceText,
      qualityScore,
      candidateCount: candidates.length,
      isLoading: isPageLoading(),
      jsonLd: [...document.querySelectorAll("script[type='application/ld+json']")].slice(0, 16).map((node) => node.textContent?.slice(0, 120000)).filter(Boolean),
      semantic: {
        title: valueAt("h1") || valueAt("[data-automation-id='jobPostingHeader'] h1") || valueAt("[class*='title']"),
        company: valueAt("[data-automation-id='company']") || valueAt("[class*='company']"),
        location: valueAt("[data-automation-id='locations']") || valueAt("[class*='location']"),
        sourceText
      }
    };
  }

  function textCandidates(selector) {
    return [...document.querySelectorAll(selector)].slice(0, 18).map((node) => {
      const text = extractStructuredText(node);
      return { text, score: scoreText(text) };
    });
  }

  function extractStructuredText(root) {
    if (!root) return "";
    const clone = root.cloneNode(true);
    clone.querySelectorAll(NOISE_SELECTOR).forEach((node) => node.remove());
    clone.querySelectorAll("br, p, li, dt, dd, h1, h2, h3, h4, h5, h6, section, article, tr, div").forEach((node) => {
      node.appendChild(document.createTextNode("\n"));
    });
    return normalizeBlockText(clone.textContent);
  }

  function normalizeBlockText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function oneLineText(node) {
    return normalizeBlockText(node?.textContent).replace(/\n+/g, " ").trim();
  }

  function scoreText(text) {
    const value = normalizeBlockText(text);
    const lower = value.toLowerCase();
    const lengthScore = Math.min(value.length / 1800, 0.45);
    const structureSignals = [
      /responsibilit/i, /requirement/i, /qualification/i, /preferred/i, /about the role/i,
      /岗位职责/, /任职要求/, /职位要求/, /加分项/, /职位描述/, /工作职责/, /我们希望/
    ].filter((pattern) => pattern.test(value)).length;
    const listSignals = (value.match(/\n\s*([0-9]+[.、)]|[-*•]|[一二三四五六七八九十]+[、.])/g) || []).length;
    const noiseSignals = [
      /sign in|log in|cookie|privacy policy|recommended jobs|related jobs|subscribe/i,
      /登录|注册|隐私|推荐职位|相似职位/
    ].filter((pattern) => pattern.test(value)).length;
    return Math.max(0, Math.min(1, lengthScore + Math.min(structureSignals, 4) * 0.12 + Math.min(listSignals, 8) * 0.025 - noiseSignals * 0.08));
  }

  function isPageLoading() {
    const text = oneLineText(document.body || document.documentElement).toLowerCase();
    return /loading|please wait|skeleton|加载中|正在加载/.test(text);
  }
}
