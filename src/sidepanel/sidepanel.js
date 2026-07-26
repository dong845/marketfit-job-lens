import { createManualJob, extractJob, hasUsableJobContent, validateCapturedJob } from "../extraction/extractJob.js";
import { captureActiveTab, isSameJobPage, requestOptionalSiteAccess, siteOriginForPermission } from "../extraction/tabCapture.js";
import { createDirectApiClient } from "../ai/directApiClient.js";
import { buildRemoteTransmissionPreview } from "../privacy/redaction.js";
import { API_PROVIDERS, MODELS, PROVIDER_CONSOLES, modelsForProvider } from "../ai/models.js";
import { configurePdfWorker, extractResumePdf } from "../profile/pdfResume.js";
import { applyTranslations, errorText, format, t } from "../ui/i18n.js";
import { escapeHtml, renderAnalysisHtml } from "../ui/analysisView.js";
import { LATEST_KEY, buildReportPayload, expiredReportKeys, reportKey, reportUrl, storedReportKeys } from "../report/payload.js";

const LOCALE_KEY = "marketfit.locale.v1";
const TIMING_KEY = "marketfit.timing.v1";

let locale = "en";
const fields = {
  interfaceLanguage: byId("interfaceLanguage"), cvPdf: byId("cvPdf"), cvFileStatus: byId("cvFileStatus"), market: byId("market"), workAuthorization: byId("workAuthorization"),
  status: byId("status"), result: byId("result"), currentJobSummary: byId("currentJobSummary"), currentJobMeta: byId("currentJobMeta"), currentJobQuality: byId("currentJobQuality"), temporaryNotice: byId("temporaryNotice"),
  redactionPreview: byId("redactionPreview"), agentProvider: byId("agentProvider"), apiKey: byId("apiKey"), apiProviderMode: byId("apiProviderMode"),
  apiModel: byId("apiModel"), apiKeyHelp: byId("apiKeyHelp"), apiKeyWarning: byId("apiKeyWarning"), accessRetryRow: byId("accessRetryRow"), jobEditorPanel: byId("jobEditorPanel"), jobTextEditor: byId("jobTextEditor"),
  marketHelp: byId("marketHelp"), workAuthorizationHelp: byId("workAuthorizationHelp"), jobTitleInput: byId("jobTitleInput"), jobCompanyInput: byId("jobCompanyInput"), jobLocationInput: byId("jobLocationInput"), appVersion: byId("appVersion"),
  reportRow: byId("reportRow"), openReport: byId("openReport"), runProgress: byId("runProgress")
};
const directApiClient = createDirectApiClient();
let resume = null;
let currentJob = null;
let lastAgentEvidence = null;
let pendingSiteOrigin = "";
let agentRunActive = false;
let lastRunContext = null;

byId("clearSession").addEventListener("click", clearSession);
byId("previewRedaction").addEventListener("click", toggleRedactionPreview);
byId("agentProvider").addEventListener("change", handleProviderChange);
byId("runAgentReview").addEventListener("click", runAgentReview);
byId("refreshJobCapture").addEventListener("click", () => captureCurrentJob({ announceFailure: true }));
byId("editJob").addEventListener("click", openJobEditor);
byId("cancelJobEdit").addEventListener("click", closeJobEditor);
byId("saveJobEdit").addEventListener("click", saveEditedJob);
byId("retryProviderAccess").addEventListener("click", grantProviderAccess);
byId("openReport").addEventListener("click", openFullReport);
fields.cvPdf.addEventListener("change", loadResumePdf);
fields.interfaceLanguage.addEventListener("change", changeLanguage);
fields.market.addEventListener("change", renderProfileHelp);
fields.workAuthorization.addEventListener("change", renderProfileHelp);
fields.apiKey.addEventListener("input", renderApiKeyWarning);

// Chrome keeps running an unpacked extension's previous code until it is reloaded,
// so the loaded build has to be visible to tell "not fixed" from "not reloaded".
fields.appVersion.textContent = `v${chrome.runtime.getManifest?.()?.version || "?"}`;
initialize();

/**
 * Every step here is individually recoverable. A failure in one (a Chrome profile
 * that rejects storage access levels, a PDF runtime that will not load) used to
 * reject the whole function, leaving the panel untranslated with no obvious cause.
 */
async function initialize() {
  try {
    const saved = await chrome.storage.local.get(LOCALE_KEY);
    locale = saved[LOCALE_KEY] === "zh" ? "zh" : "en";
  } catch {
    locale = "en";
  }
  fields.interfaceLanguage.value = locale;
  fields.agentProvider.value = "";
  applyLocale();
  updateAgentProviderUi();
  try { await configurePdfWorker(chrome.runtime.getURL("vendor/pdfjs/pdf.worker.mjs")); } catch { setStatus(t(locale, "pdfFailed")); }
}

async function changeLanguage() {
  locale = fields.interfaceLanguage.value === "zh" ? "zh" : "en";
  try { await chrome.storage.local.set({ [LOCALE_KEY]: locale }); } catch { /* Language still applies to this session. */ }
  applyLocale();
  updateAgentProviderUi();
}

function applyLocale() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  applyTranslations(document, locale);
  fields.temporaryNotice.textContent = t(locale, "temporary");
  renderProfileHelp();
  renderResumeStatus();
  renderCurrentJobSummary();
  // A run in progress owns the result area: lastAgentEvidence is deliberately null
  // while one is running, so re-rendering here replaced the live progress message
  // with "upload a CV" — the panel looked like it had thrown the run away.
  if (agentRunActive) return;
  if (lastAgentEvidence) renderAnalysis(lastAgentEvidence);
  else renderEmpty();
}

async function loadResumePdf() {
  const file = fields.cvPdf.files?.[0];
  resume = null;
  lastAgentEvidence = null;
  fields.reportRow.hidden = true;
  renderEmpty();
  if (!file) return renderResumeStatus();
  fields.cvFileStatus.textContent = t(locale, "pdfReading");
  setStatus(t(locale, "pdfReading"));
  try {
    resume = await extractResumePdf(file);
    renderResumeStatus();
    setStatus(format(locale, "pdfReady", { name: resume.fileName, pages: resume.pageCount }));
  } catch (error) {
    fields.cvPdf.value = "";
    fields.cvFileStatus.textContent = errorText(locale, error, "pdfFailed");
    setStatus(t(locale, "pdfFailed"));
  }
}

/**
 * Explains the option currently selected, under the two selectors.
 *
 * "Needs sponsorship" versus "open work permit" is not obvious to everyone it
 * applies to, and since a stated condition is now checked against this choice, a
 * wrong pick costs the reader a job they could have taken.
 */
function renderProfileHelp() {
  const authKey = `authHelp${fields.workAuthorization.value.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`;
  fields.marketHelp.textContent = t(locale, "marketHelp");
  fields.workAuthorizationHelp.textContent = t(locale, authKey);
}

function renderResumeStatus() {
  if (!resume) {
    fields.cvFileStatus.textContent = t(locale, "noResume");
    return;
  }
  fields.cvFileStatus.textContent = resume.truncated
    ? format(locale, "pdfTruncated", { name: resume.fileName })
    : format(locale, "pdfReady", { name: resume.fileName, pages: resume.pageCount });
}

async function captureCurrentJob({ announceFailure = true } = {}) {
  setStatus(t(locale, "capturing"));
  renderActionMessage(t(locale, "capturing"));
  const capture = await captureActiveTab({ tabsApi: chrome.tabs, scriptingApi: chrome.scripting });
  if (!capture.tab) {
    setStatus(t(locale, "captureBlocked"));
    renderActionMessage(t(locale, "captureBlocked"));
    return null;
  }
  if (!capture.error) {
    try {
      currentJob = extractJob(capture.snapshot);
    } catch {
      currentJob = null;
      pendingSiteOrigin = siteOriginForPermission(capture.tab.url);
      renderCurrentJobSummary();
      setStatus(t(locale, "captureBlocked"));
      renderCaptureFailure();
      return null;
    }
    pendingSiteOrigin = "";
    renderCurrentJobSummary();
    if (!hasUsableJobContent(currentJob)) {
      setStatus(qualityMessage(currentJob));
      if (announceFailure) renderJobNeedsConfirmation(currentJob);
    } else {
      setStatus(format(locale, "capturedJobStats", {
        chars: currentJob.extraction.textLength || currentJob.sourceText.length,
        confidence: Math.round((currentJob.extraction.confidence || 0) * 100)
      }));
      if (announceFailure) renderActionMessage(t(locale, "jobReadyForAi"));
    }
    return currentJob;
  }
  currentJob = null;
  pendingSiteOrigin = siteOriginForPermission(capture.tab.url);
  renderCurrentJobSummary();
  setStatus(t(locale, "captureBlocked"));
  renderCaptureFailure();
  return null;
}

async function resolveJobForAnalysis() {
  if (!currentJob) return captureCurrentJob();
  // Text the user pasted themselves outranks anything re-capture could produce, and
  // it usually has no URL because capture had already failed. Gating on the URL sent
  // that text straight back through the capture that failed, which discarded it —
  // an unbreakable loop on exactly the pages the manual fallback exists for.
  if (currentJob.extraction?.method === "manual_paste") return currentJob;
  if (!currentJob.url) return captureCurrentJob();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (isSameJobPage(currentJob.url, tab?.url || "") && hasUsableJobContent(currentJob)) return currentJob;
    if (isSameJobPage(currentJob.url, tab?.url || "")) return captureCurrentJob();
  } catch {
    return hasUsableJobContent(currentJob) ? currentJob : captureCurrentJob();
  }
  return captureCurrentJob();
}

function getProfile() {
  return {
    cvText: resume?.text || "", targetRole: "", languages: "", constraints: "", roleValue: 3,
    authorization: { country: fields.market.value, statusType: fields.workAuthorization.value, futureSponsorshipNeed: ["needs_sponsorship", "student_or_graduate"].includes(fields.workAuthorization.value), clearances: "", licenses: "", route: "", restrictions: "" }
  };
}

async function clearSession() {
  // Clearing under a running analysis wiped the state the run then rendered back
  // onto the screen a moment later, report button and all.
  if (agentRunActive) return setStatus(t(locale, "requestingAi"));
  if (!window.confirm(t(locale, "clearSession"))) return;
  resume = null;
  currentJob = null;
  lastAgentEvidence = null;
  lastRunContext = null;
  fields.cvPdf.value = "";
  fields.apiKey.value = "";
  fields.redactionPreview.hidden = true;
  fields.redactionPreview.textContent = "";
  fields.reportRow.hidden = true;
  await clearStoredReports();
  renderResumeStatus();
  renderCurrentJobSummary();
  renderEmpty();
  setStatus(t(locale, "clearSession"));
}

/**
 * How the job text was obtained, in words.
 *
 * extraction.method is an internal token — semantic_selector, greenhouse_adapter,
 * manual_paste — and it was printed straight into the job summary line, so both
 * languages showed the same English snake_case. An unknown method falls back to the
 * token rather than to nothing: a label we forgot to add still beats a blank.
 */
/** The provider's display name, so the preview reads "OpenAI" rather than "openai-api". */
function providerLabelKey(provider) {
  return { "openai-api": "openaiApi", "anthropic-api": "anthropicApi", "deepseek-api": "deepseekApi" }[provider] || "provider";
}

function captureMethodLabel(method, uiLocale) {
  if (!method) return t(uiLocale, "unknown");
  const key = `method${method.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`;
  const label = t(uiLocale, key);
  return label === key ? method : label;
}

/**
 * Removes every stored report.
 *
 * This used to remove three key names that nothing in the extension ever writes,
 * so "Clear local session" cleared nothing at all while reporting success. The
 * reports are the only thing an analysis actually leaves behind.
 */
async function clearStoredReports() {
  for (const area of [chrome.storage.session, chrome.storage.local]) {
    try {
      const stored = await area.get(null);
      const keys = storedReportKeys(stored || {});
      if (keys.length) await area.remove(keys);
    } catch {
      // Storage areas differ by Chrome profile; one refusing must not abort the rest.
    }
  }
}

function renderCurrentJobSummary() {
  fields.currentJobSummary.hidden = !currentJob;
  if (!currentJob) return;
  fields.currentJobMeta.textContent = [currentJob.title || t(locale, "unknown"), currentJob.company, currentJob.location, hostname(currentJob.url)].filter(Boolean).join(" · ");
  const removed = currentJob.extraction?.removedLines || 0;
  fields.currentJobQuality.textContent = [
    format(locale, "jobQualityLine", {
      chars: currentJob.extraction?.textLength || currentJob.sourceText.length,
      method: captureMethodLabel(currentJob.extraction?.method, locale),
      confidence: Math.round((currentJob.extraction?.confidence || 0) * 100)
    }),
    removed ? format(locale, "filteredLines", { count: removed }) : ""
  ].filter(Boolean).join(" ");
  // Hovering shows exactly what was dropped. A filter you cannot inspect is one you
  // cannot catch being wrong, and being wrong here changes the analysis.
  fields.currentJobQuality.title = removed
    ? `${t(locale, "filteredTitle")}\n${(currentJob.extraction?.removedSample || []).join("\n")}`
    : "";
}

async function toggleRedactionPreview() {
  if (!fields.redactionPreview.hidden) {
    fields.redactionPreview.hidden = true;
    fields.redactionPreview.textContent = "";
    return;
  }
  const job = await resolveJobForAnalysis();
  if (!job) return;
  const provider = fields.agentProvider.value;
  const preview = buildRemoteTransmissionPreview({
    profile: getProfile(),
    job,
    provider: provider ? t(locale, providerLabelKey(provider)) : "",
    transport: API_PROVIDERS.includes(provider) ? "direct_provider_api" : "provider_not_selected",
    locale
  });
  fields.redactionPreview.textContent = JSON.stringify(preview, null, 2);
  fields.redactionPreview.hidden = false;
}

// ------------------------------------------------------------ result states

function renderEmpty() {
  fields.result.innerHTML = `<div class="empty">${escapeHtml(t(locale, "noData"))}</div>`;
}

function renderActionMessage(message) {
  fields.result.innerHTML = `<div class="empty action-message">${escapeHtml(message)}</div>`;
}

function renderCaptureFailure() {
  const grant = pendingSiteOrigin ? `<button id="grantSiteAccess" class="secondary" type="button">${escapeHtml(t(locale, "grantSiteAccess"))}</button>` : "";
  fields.result.innerHTML = `<div class="empty action-message"><p>${escapeHtml(t(locale, "captureBlocked"))}</p><div class="control-row">${grant}<button id="manualJobFallback" class="secondary" type="button">${escapeHtml(t(locale, "editJob"))}</button></div></div>`;
  byId("grantSiteAccess")?.addEventListener("click", grantSiteAccess);
  byId("manualJobFallback")?.addEventListener("click", openJobEditor);
}

function renderJobNeedsConfirmation(job) {
  // These arrive as NO_JOB_CONTENT-style tokens and were printed verbatim; they are
  // the panel's explanation of why a capture is unusable, so they have to be readable.
  const reasons = job?.extraction?.qualityReasons?.length
    ? job.extraction.qualityReasons.map((reason) => t(locale, reason)).join(locale === "zh" ? "；" : "; ")
    : t(locale, "lowConfidence");
  fields.result.innerHTML = `<div class="empty action-message"><p>${escapeHtml(qualityMessage(job))}</p><p class="meta">${escapeHtml(reasons)}</p><div class="control-row"><button id="retryJobCapture" class="secondary" type="button">${escapeHtml(t(locale, "refreshJob"))}</button><button id="manualJobFallback" class="secondary" type="button">${escapeHtml(t(locale, "editJob"))}</button></div></div>`;
  byId("retryJobCapture")?.addEventListener("click", () => captureCurrentJob({ announceFailure: true }));
  byId("manualJobFallback")?.addEventListener("click", openJobEditor);
}

async function grantSiteAccess() {
  if (!pendingSiteOrigin) return renderActionMessage(t(locale, "captureBlocked"));
  try {
    const granted = await requestOptionalSiteAccess(chrome.permissions, pendingSiteOrigin);
    if (!granted) {
      setStatus(t(locale, "accessDenied"));
      return renderActionMessage(t(locale, "accessDenied"));
    }
    await captureCurrentJob({ announceFailure: true });
  } catch {
    setStatus(t(locale, "accessDenied"));
    renderActionMessage(t(locale, "accessDenied"));
  }
}

function openJobEditor() {
  fields.jobTitleInput.value = currentJob?.title || "";
  fields.jobCompanyInput.value = currentJob?.company || "";
  fields.jobLocationInput.value = currentJob?.location || "";
  fields.jobTextEditor.value = currentJob?.sourceText || "";
  fields.jobEditorPanel.hidden = false;
  fields.jobTextEditor.focus();
}

function closeJobEditor() {
  fields.jobEditorPanel.hidden = true;
}

function saveEditedJob() {
  const url = currentJob?.url || "";
  currentJob = createManualJob({
    url,
    title: fields.jobTitleInput.value,
    company: fields.jobCompanyInput.value,
    location: fields.jobLocationInput.value,
    sourceText: fields.jobTextEditor.value
  });
  renderCurrentJobSummary();
  closeJobEditor();
  if (!hasUsableJobContent(currentJob)) {
    setStatus(qualityMessage(currentJob));
    renderJobNeedsConfirmation(currentJob);
    return;
  }
  setStatus(format(locale, "capturedJobStats", {
    chars: currentJob.extraction.textLength || currentJob.sourceText.length,
    confidence: Math.round((currentJob.extraction.confidence || 0) * 100)
  }));
  renderActionMessage(t(locale, "jobReadyForAi"));
}

// ----------------------------------------------------------------- providers

function updateAgentProviderUi() {
  const provider = fields.agentProvider.value;
  const apiProvider = API_PROVIDERS.includes(provider);
  fields.apiProviderMode.hidden = !apiProvider;
  fields.accessRetryRow.hidden = true;
  if (!apiProvider) {
    fields.apiKey.value = "";
    fields.apiModel.replaceChildren();
    fields.apiKeyWarning.hidden = true;
    return;
  }
  updateApiModelOptions(provider);
  renderApiKeyHelp(provider);
  renderApiKeyWarning();
}

/**
 * chrome.permissions.request() must run inside the user gesture, so this reaches
 * requestAccess as its first await — nothing may be awaited before it.
 */
async function handleProviderChange() {
  const provider = fields.agentProvider.value;
  if (!API_PROVIDERS.includes(provider)) return updateAgentProviderUi();
  try {
    await directApiClient.requestAccess(provider);
    updateAgentProviderUi();
  } catch (error) {
    updateAgentProviderUi();
    fields.accessRetryRow.hidden = false;
    setStatus(errorText(locale, error, "directAccessDenied"));
  }
}

async function grantProviderAccess() {
  const provider = fields.agentProvider.value;
  if (!API_PROVIDERS.includes(provider)) return;
  try {
    await directApiClient.requestAccess(provider);
    fields.accessRetryRow.hidden = true;
    setStatus(t(locale, "jobReadyForAi"));
  } catch (error) {
    setStatus(errorText(locale, error, "directAccessDenied"));
  }
}

/**
 * How to get a key for the provider just chosen.
 *
 * Built from DOM nodes rather than innerHTML: this is the one place in the panel
 * that renders a link, and a link assembled by string concatenation is the shape
 * that turns into an injection bug later even when today's inputs are constants.
 */
function renderApiKeyHelp(provider) {
  const console = PROVIDER_CONSOLES[provider];
  const helpKey = `apiKeyHelp${provider.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`;
  fields.apiKeyHelp.replaceChildren();
  fields.apiKeyHelp.append(`${t(locale, helpKey)} ${t(locale, "apiKeyOnceOnly")} ${t(locale, "apiKeyWhere")} `);
  if (!console) return;
  const link = document.createElement("a");
  link.href = console.url;
  link.textContent = new URL(console.url).host;
  link.target = "_blank";
  // Keeps the opened console from reaching back into this panel via window.opener.
  link.rel = "noopener noreferrer";
  fields.apiKeyHelp.append(link);
}

/**
 * Advisory only. An Anthropic key pasted under OpenAI fails with a bare 401 that
 * says nothing about which of the two things is wrong, and the prefixes make that
 * one case unambiguous. OpenAI and DeepSeek keys share a prefix, so no claim is
 * made about those — a warning that fires on a correct key would be worse than none.
 */
function renderApiKeyWarning() {
  const provider = fields.agentProvider.value;
  const value = fields.apiKey.value.trim();
  const anthropicPrefix = PROVIDER_CONSOLES["anthropic-api"].keyPrefix;
  const mismatched = value.startsWith(anthropicPrefix) && API_PROVIDERS.includes(provider) && provider !== "anthropic-api";
  fields.apiKeyWarning.textContent = mismatched ? t(locale, "apiKeyMismatch") : "";
  fields.apiKeyWarning.hidden = !mismatched;
}

function updateApiModelOptions(provider) {
  const models = modelsForProvider(provider);
  const selected = fields.apiModel.value;
  fields.apiModel.replaceChildren(...models.map(({ id, labelKey }) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = t(locale, labelKey);
    return option;
  }));
  fields.apiModel.value = models.some((item) => item.id === selected) ? selected : models[0]?.id || "";
}

async function runAgentReview() {
  if (agentRunActive) return;
  agentRunActive = true;
  byId("runAgentReview").disabled = true;
  try {
    const provider = fields.agentProvider.value;
    if (!provider) return setStatus(t(locale, "chooseProviderFirst"));
    const apiKey = fields.apiKey.value;
    if (API_PROVIDERS.includes(provider) && !apiKey.trim()) return setStatus(t(locale, "apiKeyNeeded"));

    // Must be the first await: job capture below spends the click's user gesture,
    // and chrome.permissions.request() will not prompt once it is gone.
    if (API_PROVIDERS.includes(provider)) {
      try {
        await directApiClient.requestAccess(provider);
        fields.accessRetryRow.hidden = true;
      } catch (error) {
        fields.accessRetryRow.hidden = false;
        return setStatus(errorText(locale, error, "directAccessDenied"));
      }
    }

    if (!resume) {
      setStatus(t(locale, "missingResume"));
      return renderActionMessage(t(locale, "missingResume"));
    }
    const job = await resolveJobForAnalysis();
    if (!job) return;
    if (!hasUsableJobContent(job)) {
      setStatus(qualityMessage(job));
      renderJobNeedsConfirmation(job);
      return;
    }
    // Retract the previous run's report before starting: if this run fails, a
    // visible button offering a report for a result no longer on screen is worse
    // than no button.
    lastAgentEvidence = null;
    lastRunContext = null;
    fields.reportRow.hidden = true;
    setStatus("");
    const task = {
      requestId: globalThis.crypto?.randomUUID?.() || `marketfit-${Date.now()}`, taskType: "analyze_job", provider, privacyMode: "provider_cloud",
      credential: { type: "session_api_key", apiKey },
      options: { language: locale, model: fields.apiModel.value },
      input: {
        resumeText: resume.text,
        // The capture already extracts these; withholding them hid decision facts
        // like a band far below the candidate's level or a named on-site pattern.
        job: {
          title: job.title, company: job.company, location: job.location,
          employmentType: job.employmentType || "", salary: job.salary || "",
          description: job.sourceText, url: job.url || ""
        },
        // The market selector was collected and never sent — a control that looked
        // like it personalised the analysis and did nothing.
        candidate: { targetRole: "", workAuthorization: fields.workAuthorization.value, targetMarket: fields.market.value, languages: [] }
      }
    };
    const model = fields.apiModel.value;
    renderActionMessage(t(locale, "requestingAi"));
    const startedAt = Date.now();
    const inputChars = (resume.text?.length || 0) + (job.sourceText?.length || 0);
    const stopTimer = startElapsedTimer(model, await estimateSeconds(model, inputChars));
    try {
      const response = await directApiClient.runTask(task);
      // Both routes answer with the same envelope. A missing result means the
      // provider was paid and produced nothing usable, which must not be mistaken
      // for a completed analysis.
      if (!response?.result) throw new Error(t(locale, "analysisEmpty"));
      lastAgentEvidence = response.result;
      lastRunContext = { job, provider, model, generatedAt: new Date().toISOString() };
    } finally {
      stopTimer();
    }
    // Show the result first. recordDuration only remembers how long this took, and
    // awaiting it put extension storage between a paid analysis and the reader: a
    // storage call that hangs rather than throws left the run stuck on "Requesting
    // AI analysis" with the answer already in hand.
    renderAnalysis(lastAgentEvidence);
    fields.reportRow.hidden = false;
    setStatus(format(locale, "aiFinished", { provider }));
    revealResult();
    void recordDuration(model, Math.round((Date.now() - startedAt) / 1000), inputChars);
  } catch (error) {
    const message = errorText(locale, error, "analysisFailed");
    setStatus(message);
    renderActionMessage(message);
  } finally {
    agentRunActive = false;
    byId("runAgentReview").disabled = false;
  }
}

function renderAnalysis(evidence) { fields.result.innerHTML = renderAnalysisHtml(evidence, locale, declaredCandidate()); }

/** What the user said about themselves — their words, never a finding about them. */
function declaredCandidate() {
  return { workAuthorization: fields.workAuthorization.value, targetMarket: fields.market.value };
}

/**
 * Brings the verdict into view.
 *
 * The result is the last element on the page, under roughly a full screen of form
 * chrome — provider, key, model, help text. Without this, finishing an analysis
 * left the reader looking at their own API-key field, hunting for the answer they
 * had just paid for. Collapsing the setup panel is part of the same move: it is
 * the thing standing between the button and the result.
 */
function revealResult() {
  const panel = byId("agentPanel");
  if (panel) panel.open = false;
  fields.result.scrollIntoView?.({ block: "start", behavior: "smooth" });
}

/**
 * Reasoning models routinely take a minute or more on this prompt. Without a
 * moving number the panel looks hung, and people reload or click again.
 */
function startElapsedTimer(model, estimate) {
  const startedAt = Date.now();
  const tick = () => {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    // Past the estimate, stop repeating a number that is now wrong.
    fields.runProgress.textContent = seconds > estimate
      ? format(locale, "analysingOvertime", { model, seconds })
      : format(locale, "analysing", { model, seconds, estimate });
  };
  fields.runProgress.hidden = false;
  tick();
  const handle = setInterval(tick, 1000);
  return () => {
    clearInterval(handle);
    fields.runProgress.hidden = true;
    fields.runProgress.textContent = "";
  };
}

/**
 * How long to say this will take.
 *
 * Duration tracks how much text the model has to read: a real CV and job page
 * build a prompt roughly eight times the size of a short one, and a flat
 * per-model number was badly wrong for exactly the jobs people actually analyse.
 * So each measurement is stored with the input size that produced it, and the
 * estimate scales from there. Until this machine has measured that model once,
 * it falls back to the registry's rough figure.
 */
async function estimateSeconds(model, chars) {
  const fallback = MODELS[model]?.typicalSeconds || 60;
  try {
    const stored = await chrome.storage.local.get(TIMING_KEY);
    const measured = stored[TIMING_KEY]?.[model];
    if (!measured?.seconds || !measured?.chars || !chars) return fallback;
    const scaled = measured.seconds * (chars / measured.chars);
    // Bounded: one unusual run should not produce an absurd prediction.
    return Math.round(Math.min(Math.max(scaled, 15), 900));
  } catch {
    return fallback;
  }
}

async function recordDuration(model, seconds, chars) {
  try {
    const stored = await chrome.storage.local.get(TIMING_KEY);
    const timings = stored[TIMING_KEY] || {};
    const previous = timings[model];
    // Smoothed against the previous measurement, so one slow run does not
    // dominate, while still tracking a genuine change in speed.
    timings[model] = previous?.seconds
      ? { seconds: Math.round(previous.seconds * 0.5 + seconds * 0.5), chars: Math.round(previous.chars * 0.5 + chars * 0.5) }
      : { seconds, chars };
    await chrome.storage.local.set({ [TIMING_KEY]: timings });
  } catch {
    // An estimate is a convenience; failing to remember one must not fail a run.
  }
}

/**
 * Hands the result to a full-page report.
 *
 * The payload goes through extension storage rather than a blob URL: a blob URL
 * belongs to this panel document and is revoked when the panel closes, which
 * would break any report tab still open on it.
 *
 * Nothing here may fail quietly. Every failure used to go to setStatus alone — a
 * single small line under the title that already held the success message — so a
 * real error looked exactly like a dead button.
 */
async function openFullReport() {
  if (!lastAgentEvidence || !lastRunContext) return renderReportProblem(t(locale, "reportNothingToShow"), "");

  let url = "";
  try {
    // session clears itself when the browser closes and is the right home for
    // this; local is a fallback for builds where session is unavailable.
    const store = chrome.storage?.session || chrome.storage?.local;
    if (!store) throw new Error("chrome.storage is unavailable in this context.");

    const id = globalThis.crypto?.randomUUID?.() || String(Date.now());
    await store.set({
      [reportKey(id)]: buildReportPayload({ ...lastRunContext, evidence: lastAgentEvidence, locale, candidate: declaredCandidate() }),
      // Lets the page recover if it is ever opened without a usable query string.
      [LATEST_KEY]: id
    });
    await pruneOldReports(store);
    url = reportUrl(chrome.runtime.getURL("src/report/report.html"), id);
    await openReportTab(url);
    setStatus(t(locale, "reportOpened"));
  } catch (error) {
    renderReportProblem(error?.message || String(error), url);
  }
}

/** Two routes to the page, because a side panel can be restricted where a plain extension page is not. */
async function openReportTab(url) {
  try {
    await chrome.tabs.create({ url });
  } catch (tabsError) {
    if (typeof globalThis.open !== "function") throw tabsError;
    if (!globalThis.open(url, "_blank")) throw tabsError;
  }
}

/**
 * Problems land in the result area, where the user is already looking, and carry
 * the report address so it can still be opened by hand. The analysis stays on
 * screen underneath rather than being replaced by an error.
 */
function renderReportProblem(detail, url) {
  const manual = url
    ? `<p class="meta">${escapeHtml(t(locale, "reportOpenManually"))}</p><pre class="redaction-preview">${escapeHtml(url)}</pre>`
    : "";
  fields.result.innerHTML =
    `<div class="empty action-message"><p><strong>${escapeHtml(t(locale, "reportFailed"))}</strong></p><p class="meta">${escapeHtml(detail)}</p>${manual}</div>`
    + renderAnalysisHtml(lastAgentEvidence, locale);
  setStatus(t(locale, "reportFailed"));
}

async function pruneOldReports(session) {
  try {
    const stored = await session.get(null);
    const stale = expiredReportKeys(stored || {});
    if (stale.length) await session.remove(stale);
  } catch {
    // Housekeeping only — never block opening the report the user asked for.
  }
}

function setStatus(message) { fields.status.textContent = message; }
function qualityMessage(job) {
  const quality = validateCapturedJob(job);
  if (!job?.sourceText) return t(locale, "noJobContent");
  if (!quality.ok) return format(locale, "lowQualityJob", { chars: quality.textLength });
  return t(locale, "lowConfidence");
}
function byId(id) { return document.getElementById(id); }
function hostname(url) { try { return new URL(url).hostname; } catch { return "current page"; } }
