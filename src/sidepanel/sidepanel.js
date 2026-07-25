import { createManualJob, extractJob, hasUsableJobContent, validateCapturedJob } from "../extraction/extractJob.js";
import { captureActiveTab, isSameJobPage, requestOptionalSiteAccess, siteOriginForPermission } from "../extraction/tabCapture.js";
import { createDirectApiClient } from "../ai/directApiClient.js";
import { buildRemoteTransmissionPreview } from "../privacy/redaction.js";
import { createBridgeClient, isApiProvider, isCliProvider } from "../bridge/bridgeClient.js";
import { CLI_TYPICAL_SECONDS, MODELS, modelsForProvider } from "../../bridge/src/models.js";
import { configurePdfWorker, extractResumePdf } from "../profile/pdfResume.js";
import { applyTranslations, format, t } from "../ui/i18n.js";
import { escapeHtml, renderAnalysisHtml } from "../ui/analysisView.js";
import { LATEST_KEY, buildReportPayload, expiredReportKeys, reportKey, reportUrl } from "../report/payload.js";

const LOCALE_KEY = "marketfit.locale.v1";
const PERSONAL_STORAGE_KEYS = ["marketfit.state.v2", "marketfit.profile.v1", "marketfit.lastAnalysis.v1"];
const BRIDGE_COMMAND = "npm run bridge -- --port 8765";
const TIMING_KEY = "marketfit.timing.v1";
const CLI_PROVIDER_LABELS = { codex: "codex", "claude-code": "claude" };

let locale = "en";
const fields = {
  interfaceLanguage: byId("interfaceLanguage"), cvPdf: byId("cvPdf"), cvFileStatus: byId("cvFileStatus"), market: byId("market"), workAuthorization: byId("workAuthorization"),
  status: byId("status"), result: byId("result"), currentJobSummary: byId("currentJobSummary"), currentJobMeta: byId("currentJobMeta"), currentJobQuality: byId("currentJobQuality"), temporaryNotice: byId("temporaryNotice"),
  redactionPreview: byId("redactionPreview"), bridgePort: byId("bridgePort"), pairingCode: byId("pairingCode"), bridgeState: byId("bridgeState"),
  agentProvider: byId("agentProvider"), apiKey: byId("apiKey"), cliBridgeMode: byId("cliBridgeMode"), apiProviderMode: byId("apiProviderMode"),
  apiModel: byId("apiModel"), accessRetryRow: byId("accessRetryRow"), jobEditorPanel: byId("jobEditorPanel"), jobTextEditor: byId("jobTextEditor"),
  jobTitleInput: byId("jobTitleInput"), jobCompanyInput: byId("jobCompanyInput"), jobLocationInput: byId("jobLocationInput"),
  bridgeCommand: byId("bridgeCommand"), copyBridgeCommand: byId("copyBridgeCommand"), appVersion: byId("appVersion"),
  reportRow: byId("reportRow"), openReport: byId("openReport"), runProgress: byId("runProgress")
};
const bridgeClient = createBridgeClient();
const directApiClient = createDirectApiClient();
let resume = null;
let currentJob = null;
let lastAgentEvidence = null;
let pendingSiteOrigin = "";
let agentRunActive = false;
let lastRunContext = null;

byId("clearSession").addEventListener("click", clearSession);
byId("previewRedaction").addEventListener("click", toggleRedactionPreview);
byId("pairBridge").addEventListener("click", pairBridge);
byId("refreshBridge").addEventListener("click", () => refreshBridgeState(true));
byId("disconnectBridge").addEventListener("click", disconnectBridge);
byId("agentProvider").addEventListener("change", handleProviderChange);
byId("runAgentReview").addEventListener("click", runAgentReview);
byId("refreshJobCapture").addEventListener("click", () => captureCurrentJob({ announceFailure: true }));
byId("editJob").addEventListener("click", openJobEditor);
byId("cancelJobEdit").addEventListener("click", closeJobEditor);
byId("saveJobEdit").addEventListener("click", saveEditedJob);
byId("retryProviderAccess").addEventListener("click", grantProviderAccess);
byId("openReport").addEventListener("click", openFullReport);
fields.copyBridgeCommand.addEventListener("click", copyBridgeCommand);
fields.cvPdf.addEventListener("change", loadResumePdf);
fields.interfaceLanguage.addEventListener("change", changeLanguage);

fields.bridgeCommand.textContent = BRIDGE_COMMAND;
// Chrome keeps running an unpacked extension's previous code until it is reloaded,
// so the loaded build has to be visible to tell "not fixed" from "not reloaded".
fields.appVersion.textContent = `v${chrome.runtime.getManifest?.()?.version || "?"}`;
initialize();

/**
 * Every step here is individually recoverable. A failure in one (a Chrome profile
 * that rejects storage access levels, a PDF runtime that will not load) used to
 * reject the whole function, leaving the panel untranslated with no bridge state
 * and no obvious cause.
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

  try { await bridgeClient.prepare(); } catch { setStatus("Bridge token storage could not be restricted in this Chrome profile."); }
  try { await configurePdfWorker(chrome.runtime.getURL("vendor/pdfjs/pdf.worker.mjs")); } catch { setStatus(t(locale, "pdfFailed")); }
  await refreshBridgeState(false);
}

async function changeLanguage() {
  locale = fields.interfaceLanguage.value === "zh" ? "zh" : "en";
  try { await chrome.storage.local.set({ [LOCALE_KEY]: locale }); } catch { /* Language still applies to this session. */ }
  applyLocale();
  updateAgentProviderUi();
  await refreshBridgeState(false);
}

function applyLocale() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  applyTranslations(document, locale);
  fields.temporaryNotice.textContent = t(locale, "temporary");
  renderResumeStatus();
  renderCurrentJobSummary();
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
    fields.cvFileStatus.textContent = error.message || t(locale, "pdfFailed");
    setStatus(t(locale, "pdfFailed"));
  }
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
  if (!currentJob?.url) return captureCurrentJob();
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
  if (!window.confirm(t(locale, "clearSession"))) return;
  resume = null;
  currentJob = null;
  lastAgentEvidence = null;
  fields.cvPdf.value = "";
  fields.apiKey.value = "";
  fields.redactionPreview.hidden = true;
  fields.redactionPreview.textContent = "";
  fields.reportRow.hidden = true;
  await bridgeClient.disconnect();
  await chrome.storage.local.remove(PERSONAL_STORAGE_KEYS);
  renderResumeStatus();
  renderCurrentJobSummary();
  renderEmpty();
  setBridgeState(t(locale, "bridgeUnpaired"));
  setStatus(t(locale, "clearSession"));
}

function renderCurrentJobSummary() {
  fields.currentJobSummary.hidden = !currentJob;
  if (!currentJob) return;
  fields.currentJobMeta.textContent = [currentJob.title || t(locale, "unknown"), currentJob.company, currentJob.location, hostname(currentJob.url)].filter(Boolean).join(" · ");
  fields.currentJobQuality.textContent = format(locale, "jobQualityLine", {
    chars: currentJob.extraction?.textLength || currentJob.sourceText.length,
    method: currentJob.extraction?.method || t(locale, "unknown"),
    confidence: Math.round((currentJob.extraction?.confidence || 0) * 100)
  });
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
    provider: provider || t(locale, "chooseProvider"),
    transport: isApiProvider(provider) ? "direct_provider_api" : isCliProvider(provider) ? "local_cli_bridge" : "provider_not_selected"
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
  const reasons = job?.extraction?.qualityReasons?.length ? job.extraction.qualityReasons.join(", ") : t(locale, "lowConfidence");
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

// ------------------------------------------------------------------- bridge

async function copyBridgeCommand() {
  try {
    await navigator.clipboard.writeText(BRIDGE_COMMAND);
    fields.copyBridgeCommand.textContent = t(locale, "copied");
    setTimeout(() => { fields.copyBridgeCommand.textContent = t(locale, "copyCommand"); }, 1500);
  } catch {
    // Clipboard access can be refused; the command stays selectable on screen.
    setStatus(BRIDGE_COMMAND);
  }
}

async function pairBridge() {
  try {
    const state = await bridgeClient.pair({ port: fields.bridgePort.value, pairingCode: fields.pairingCode.value });
    fields.pairingCode.value = "";
    fields.bridgePort.value = String(state.port);
    await refreshBridgeState(false);
    setStatus(t(locale, "bridgePaired"));
  } catch (error) {
    setBridgeState(error.message);
    setStatus(t(locale, "pairingFailed"));
  }
}

async function refreshBridgeState(announce) {
  const state = await bridgeClient.load();
  if (!state) {
    setBridgeState(t(locale, "bridgeUnpaired"));
    markCliAvailability(null);
    return;
  }
  fields.bridgePort.value = String(state.port);
  try {
    const health = await bridgeClient.health();
    const providers = health?.providers || {};
    const available = Object.entries(providers).filter(([, provider]) => provider.available).map(([name]) => name).join(", ") || t(locale, "unknown");
    // A bridge started before the last code change keeps running the old code, so
    // fixes appear not to work and old errors keep reproducing.
    const running = chrome.runtime.getManifest?.()?.version;
    setBridgeState(health?.version && running && health.version !== running
      ? format(locale, "bridgeOutdated", { running: health.version, expected: running })
      : format(locale, "paired", { port: state.port, providers: available }));
    markCliAvailability(providers);
    if (announce) setStatus(t(locale, "refreshStatus"));
  } catch (error) {
    setBridgeState(format(locale, "bridgeUnavailable", { port: state.port }));
    markCliAvailability(null);
    if (announce) setStatus(error.message);
  }
}

/**
 * The bridge reports which CLIs it can actually launch. Surfacing that on the
 * dropdown avoids letting someone pick Codex on a machine without it and only
 * discovering that after a failed analysis run.
 */
function markCliAvailability(providers) {
  for (const [value, labelKey] of Object.entries(CLI_PROVIDER_LABELS)) {
    const option = fields.agentProvider.querySelector(`option[value="${value}"]`);
    if (!option) continue;
    const base = t(locale, value === "codex" ? "codex" : "claudeCode");
    const known = providers && Object.hasOwn(providers, value);
    const missing = known && !providers[value].available;
    option.disabled = Boolean(missing);
    option.textContent = missing ? `${base} — ${t(locale, "providerNotInstalled")} (${labelKey})` : base;
  }
}

async function disconnectBridge() {
  await bridgeClient.disconnect();
  fields.pairingCode.value = "";
  setBridgeState(t(locale, "bridgeDisconnected"));
  setStatus(t(locale, "bridgeDisconnected"));
  markCliAvailability(null);
}

function setBridgeState(message) {
  fields.bridgeState.textContent = message;
}

// ----------------------------------------------------------------- providers

function updateAgentProviderUi() {
  const provider = fields.agentProvider.value;
  const apiProvider = isApiProvider(provider);
  fields.cliBridgeMode.hidden = !isCliProvider(provider);
  fields.apiProviderMode.hidden = !apiProvider;
  fields.accessRetryRow.hidden = true;
  if (!apiProvider) {
    fields.apiKey.value = "";
    fields.apiModel.replaceChildren();
    return;
  }
  updateApiModelOptions(provider);
}

/**
 * chrome.permissions.request() must run inside the user gesture, so this reaches
 * requestAccess as its first await — nothing may be awaited before it.
 */
async function handleProviderChange() {
  const provider = fields.agentProvider.value;
  if (!isApiProvider(provider)) return updateAgentProviderUi();
  try {
    await directApiClient.requestAccess(provider);
    updateAgentProviderUi();
  } catch (error) {
    updateAgentProviderUi();
    fields.accessRetryRow.hidden = false;
    setStatus(error.message || t(locale, "directAccessDenied"));
  }
}

async function grantProviderAccess() {
  const provider = fields.agentProvider.value;
  if (!isApiProvider(provider)) return;
  try {
    await directApiClient.requestAccess(provider);
    fields.accessRetryRow.hidden = true;
    setStatus(t(locale, "jobReadyForAi"));
  } catch (error) {
    setStatus(error.message || t(locale, "directAccessDenied"));
  }
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
    if (isApiProvider(provider) && !apiKey.trim()) return setStatus(t(locale, "apiKeyNeeded"));

    // Must be the first await: job capture below spends the click's user gesture,
    // and chrome.permissions.request() will not prompt once it is gone.
    if (isApiProvider(provider)) {
      try {
        await directApiClient.requestAccess(provider);
        fields.accessRetryRow.hidden = true;
      } catch (error) {
        fields.accessRetryRow.hidden = false;
        return setStatus(error.message || t(locale, "directAccessDenied"));
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
      ...(isApiProvider(provider) ? { credential: { type: "session_api_key", apiKey } } : {}),
      options: { language: locale, ...(isApiProvider(provider) ? { model: fields.apiModel.value } : {}) },
      input: { resumeText: resume.text, job: { title: job.title, company: job.company, location: job.location, description: job.sourceText, url: job.url || "" }, candidate: { targetRole: "", workAuthorization: fields.workAuthorization.value, languages: [] } }
    };
    const model = isApiProvider(provider) ? fields.apiModel.value : provider;
    renderActionMessage(t(locale, "requestingAi"));
    const startedAt = Date.now();
    const inputChars = (resume.text?.length || 0) + (job.sourceText?.length || 0);
    const stopTimer = startElapsedTimer(model, await estimateSeconds(model, inputChars));
    try {
      const response = isApiProvider(provider) ? await directApiClient.runTask(task) : await bridgeClient.runTask(task);
      // Both routes answer with the same envelope. A missing result means the
      // provider was paid and produced nothing usable, which must not be mistaken
      // for a completed analysis.
      if (!response?.result) throw new Error(t(locale, "analysisEmpty"));
      lastAgentEvidence = response.result;
      lastRunContext = { job, provider, model, generatedAt: new Date().toISOString() };
    } finally {
      stopTimer();
    }
    await recordDuration(model, Math.round((Date.now() - startedAt) / 1000), inputChars);
    renderAnalysis(lastAgentEvidence);
    fields.reportRow.hidden = false;
    setStatus(format(locale, "aiFinished", { provider }));
  } catch (error) {
    const message = error.message || t(locale, "analysisFailed");
    setStatus(message);
    renderActionMessage(message);
  } finally {
    agentRunActive = false;
    byId("runAgentReview").disabled = false;
  }
}

function renderAnalysis(evidence) { fields.result.innerHTML = renderAnalysisHtml(evidence, locale); }

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
  const fallback = MODELS[model]?.typicalSeconds || CLI_TYPICAL_SECONDS[model] || 60;
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
      [reportKey(id)]: buildReportPayload({ ...lastRunContext, evidence: lastAgentEvidence, locale }),
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
