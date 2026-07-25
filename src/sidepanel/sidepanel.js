import { createManualJob, extractJob, hasUsableJobContent, validateCapturedJob } from "../extraction/extractJob.js";
import { captureActiveTab, isSameJobPage, requestOptionalSiteAccess, siteOriginForPermission } from "../extraction/tabCapture.js";
import { createDirectApiClient } from "../ai/directApiClient.js";
import { buildRemoteTransmissionPreview } from "../privacy/redaction.js";
import { createBridgeClient, isApiProvider, isCliProvider } from "../bridge/bridgeClient.js";
import { configurePdfWorker, extractResumePdf } from "../profile/pdfResume.js";
import { applyTranslations, format, t } from "../ui/i18n.js";

const LOCALE_KEY = "marketfit.locale.v1";
const PERSONAL_STORAGE_KEYS = ["marketfit.state.v2", "marketfit.profile.v1", "marketfit.lastAnalysis.v1"];
const API_MODELS = {
  "openai-api": [
    { value: "gpt-5-mini", labelKey: "openAiGpt5Mini" },
    { value: "gpt-5", labelKey: "openAiGpt5" }
  ],
  "anthropic-api": [
    { value: "claude-sonnet-4-6", labelKey: "anthropicSonnet" },
    { value: "claude-opus-4-6", labelKey: "anthropicOpus" }
  ]
};
let locale = "en";
const fields = {
  interfaceLanguage: byId("interfaceLanguage"), cvPdf: byId("cvPdf"), cvFileStatus: byId("cvFileStatus"), market: byId("market"), workAuthorization: byId("workAuthorization"),
  status: byId("status"), result: byId("result"), currentJobSummary: byId("currentJobSummary"), currentJobMeta: byId("currentJobMeta"), currentJobQuality: byId("currentJobQuality"), temporaryNotice: byId("temporaryNotice"),
  redactionPreview: byId("redactionPreview"), bridgePort: byId("bridgePort"), pairingCode: byId("pairingCode"), bridgeState: byId("bridgeState"),
  agentProvider: byId("agentProvider"), apiKey: byId("apiKey"), cliBridgeMode: byId("cliBridgeMode"), apiProviderMode: byId("apiProviderMode"),
  apiModel: byId("apiModel"), bridgeConnection: byId("bridgeConnection"), jobEditorPanel: byId("jobEditorPanel"), jobTextEditor: byId("jobTextEditor"),
  jobTitleInput: byId("jobTitleInput"), jobCompanyInput: byId("jobCompanyInput"), jobLocationInput: byId("jobLocationInput")
};
const bridgeClient = createBridgeClient();
const directApiClient = createDirectApiClient();
let resume = null;
let currentJob = null;
let lastAgentEvidence = null;
let pendingSiteOrigin = "";
let agentRunActive = false;

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
fields.cvPdf.addEventListener("change", loadResumePdf);
fields.interfaceLanguage.addEventListener("change", changeLanguage);

initialize();

async function initialize() {
  const saved = await chrome.storage.local.get(LOCALE_KEY);
  locale = saved[LOCALE_KEY] === "zh" ? "zh" : "en";
  fields.interfaceLanguage.value = locale;
  fields.agentProvider.value = "";
  await configurePdfWorker(chrome.runtime.getURL("vendor/pdfjs/pdf.worker.mjs"));
  try { await bridgeClient.prepare(); } catch { setStatus("Bridge token storage could not be restricted in this Chrome profile."); }
  applyLocale();
  updateAgentProviderUi();
  await refreshBridgeState(false);
}

async function changeLanguage() {
  locale = fields.interfaceLanguage.value === "zh" ? "zh" : "en";
  await chrome.storage.local.set({ [LOCALE_KEY]: locale });
  applyLocale();
  updateAgentProviderUi();
  await refreshBridgeState(false);
}

function applyLocale() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  applyTranslations(document, locale);
  fields.temporaryNotice.textContent = t(locale, "temporary");
  byId("clearSession").setAttribute("aria-label", t(locale, "clearSession"));
  byId("clearSession").setAttribute("title", t(locale, "clearSession"));
  byId("refreshJobCapture").setAttribute("aria-label", t(locale, "refreshJob"));
  byId("refreshJobCapture").setAttribute("title", t(locale, "refreshJob"));
  byId("editJob").setAttribute("aria-label", t(locale, "editJob"));
  byId("editJob").setAttribute("title", t(locale, "editJob"));
  byId("cancelJobEdit").setAttribute("aria-label", t(locale, "close"));
  byId("cancelJobEdit").setAttribute("title", t(locale, "close"));
  renderResumeStatus();
  renderCurrentJobSummary();
  if (lastAgentEvidence) renderAiAnalysis(lastAgentEvidence);
  else renderEmpty();
}

async function loadResumePdf() {
  const file = fields.cvPdf.files?.[0];
  resume = null;
  lastAgentEvidence = null;
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
    await runAgentReview();
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

function renderAiAnalysis(evidence) {
  fields.result.innerHTML = renderAgentEvidence(evidence);
}

function renderAgentEvidence(evidence) {
  if (!evidence) return "";
  const overview = evidence.overview;
  const requirements = evidence.requirements.map((item) => `<li><strong>${escapeHtml(item.name)}:</strong> ${escapeHtml(item.match)} (${escapeHtml(item.level)}) - ${escapeHtml(item.explanation)}${renderAgentQuotes(item.evidence)}</li>`).join("");
  const strengths = renderAgentCitedItems(evidence.strengths, (item) => `<strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.summary)}`);
  const gaps = renderAgentCitedItems(evidence.gaps, (item) => `<strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.summary)} <span class="meta">(${escapeHtml(item.severity)})</span>`);
  const risks = renderAgentCitedItems(evidence.risks, (item) => `<strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.summary)} <span class="meta">(${escapeHtml(item.severity)})</span>`);
  const tailoring = renderAgentCitedItems(evidence.resumeTailoring, (item) => `<strong>${escapeHtml(item.target)}:</strong> ${escapeHtml(item.recommendation)}`);
  const interviews = renderAgentCitedItems(evidence.interviewFocus, (item) => `<strong>${escapeHtml(item.question)}</strong><br />${escapeHtml(item.rationale)}`);
  const uncertainties = renderAgentCitedItems(evidence.uncertainties, (item) => `<strong>${escapeHtml(item.type)}:</strong> ${escapeHtml(item.message)}`);
  const actions = renderAgentCitedItems(evidence.suggestedActions, (item) => `<strong>${escapeHtml(item.priority)}:</strong> ${escapeHtml(item.action)}`);
  return `
    <section class="result-card agent-card"><h3>${escapeHtml(t(locale, "aiReview"))}</h3><p class="meta">${escapeHtml(t(locale, "aiSupplement"))}</p>
      ${renderAgentTextBlock(t(locale, "jobUnderstanding"), overview.jobFocus)}
      ${renderAgentTextBlock(t(locale, "candidatePositioning"), overview.candidatePositioning)}
      ${renderAgentTextBlock(t(locale, "fitNarrative"), overview.fitNarrative)}
      ${renderAgentQuotes(overview.evidence)}
    </section>
    ${renderAgentListCard(t(locale, "evidenceRequirements"), requirements)}
    ${renderAgentListCard(t(locale, "aiStrengths"), strengths)}
    ${renderAgentListCard(t(locale, "aiGaps"), gaps)}
    ${renderAgentListCard(t(locale, "aiRisks"), risks)}
    ${renderAgentListCard(t(locale, "resumeTailoring"), tailoring)}
    ${renderAgentListCard(t(locale, "interviewFocus"), interviews)}
    ${renderAgentListCard(t(locale, "employerQuestions"), uncertainties)}
    ${renderAgentListCard(t(locale, "suggestedActions"), actions)}`;
}

function renderAgentTextBlock(title, value) {
  return `<h4>${escapeHtml(title)}</h4><p>${escapeHtml(value)}</p>`;
}

function renderAgentCitedItems(items, renderText) {
  return items?.map((item) => `<li>${renderText(item)}${renderAgentQuotes(item.evidence)}</li>`).join("") || "";
}

function renderAgentListCard(title, rows) {
  return rows ? `<section class="result-card agent-card"><h3>${escapeHtml(title)}</h3><ul class="finding-list">${rows}</ul></section>` : "";
}

function renderAgentQuotes(evidence) {
  return evidence?.length ? `<div class="evidence">${evidence.map((item) => `<blockquote><strong>${escapeHtml(item.source)}</strong><br />${escapeHtml(item.quote)}</blockquote>`).join("")}</div>` : "";
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
    return;
  }
  fields.bridgePort.value = String(state.port);
  try {
    const health = await bridgeClient.health();
    const available = Object.entries(health.providers).filter(([, provider]) => provider.available).map(([name]) => name).join(", ") || t(locale, "unknown");
    setBridgeState(format(locale, "paired", { port: state.port, providers: available }));
    if (announce) setStatus(t(locale, "refreshStatus"));
  } catch (error) {
    setBridgeState(format(locale, "bridgeUnavailable", { port: state.port }));
    if (announce) setStatus(error.message);
  }
}

async function disconnectBridge() {
  await bridgeClient.disconnect();
  fields.pairingCode.value = "";
  setBridgeState(t(locale, "bridgeDisconnected"));
  setStatus(t(locale, "bridgeDisconnected"));
}

function updateAgentProviderUi() {
  const provider = fields.agentProvider.value;
  const apiProvider = isApiProvider(provider);
  const cliProvider = isCliProvider(provider);
  fields.cliBridgeMode.hidden = !cliProvider;
  fields.apiProviderMode.hidden = !apiProvider;
  fields.bridgeConnection.hidden = !cliProvider;
  if (cliProvider) fields.bridgeConnection.open = true;
  if (!apiProvider) {
    fields.apiKey.value = "";
    fields.apiModel.replaceChildren();
  }
  if (apiProvider) {
    updateApiModelOptions(provider);
  }
}

async function handleProviderChange() {
  updateAgentProviderUi();
  const provider = fields.agentProvider.value;
  if (!isApiProvider(provider)) return;
  try {
    await directApiClient.requestAccess(provider);
  } catch (error) {
    setStatus(error.message || t(locale, "directAccessDenied"));
  }
}

function updateApiModelOptions(provider) {
  const models = API_MODELS[provider] || [];
  const selected = fields.apiModel.value;
  fields.apiModel.replaceChildren(...models.map(({ value, labelKey }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t(locale, labelKey);
    return option;
  }));
  fields.apiModel.value = models.some((item) => item.value === selected) ? selected : models[0]?.value || "";
}

function setBridgeState(message) {
  fields.bridgeState.textContent = message;
}

async function runAgentReview() {
  if (agentRunActive) return;
  agentRunActive = true;
  byId("runAgentReview").disabled = true;
  try {
    const provider = fields.agentProvider.value;
    if (!provider) return setStatus(t(locale, "chooseProviderFirst"));
    if (!resume) {
      setStatus(t(locale, "missingResume"));
      return renderActionMessage(t(locale, "missingResume"));
    }
    const apiKey = fields.apiKey.value;
    if (isApiProvider(provider) && !apiKey.trim()) return setStatus(t(locale, "apiKeyNeeded"));
    if (isApiProvider(provider) && !await directApiClient.hasAccess(provider)) return setStatus(t(locale, "directAccessDenied"));
    const job = await resolveJobForAnalysis();
    if (!job) return;
    if (!hasUsableJobContent(job)) {
      setStatus(qualityMessage(job));
      renderJobNeedsConfirmation(job);
      return;
    }
    lastAgentEvidence = null;
    const task = {
      requestId: globalThis.crypto?.randomUUID?.() || `marketfit-${Date.now()}`, taskType: "analyze_job", provider, privacyMode: "provider_cloud",
      ...(isApiProvider(provider) ? { credential: { type: "session_api_key", apiKey } } : {}),
      options: { language: locale, ...(isApiProvider(provider) ? { model: fields.apiModel.value } : {}) },
      input: { resumeText: resume.text, job: { title: job.title, company: job.company, location: job.location, description: job.sourceText, url: job.url || "" }, candidate: { targetRole: "", workAuthorization: fields.workAuthorization.value, languages: [] } }
    };
    setStatus(t(locale, "requestingAi"));
    renderActionMessage(t(locale, "requestingAi"));
    const response = isApiProvider(provider) ? await directApiClient.runTask(task, { accessVerified: true }) : await bridgeClient.runTask(task);
    lastAgentEvidence = response.result;
    renderAiAnalysis(lastAgentEvidence);
    setStatus(format(locale, "aiFinished", { provider }));
  } catch (error) {
    const message = error.message || t(locale, "pdfFailed");
    setStatus(message);
    renderActionMessage(message);
  } finally {
    agentRunActive = false;
    byId("runAgentReview").disabled = false;
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
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function hostname(url) { try { return new URL(url).hostname; } catch { return "current page"; } }
