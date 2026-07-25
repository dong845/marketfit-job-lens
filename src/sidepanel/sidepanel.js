import { createManualJob, extractJob, hasUsableJobContent, validateCapturedJob } from "../extraction/extractJob.js";
import { captureActiveTab, isSameJobPage, requestOptionalSiteAccess, siteOriginForPermission } from "../extraction/tabCapture.js";
import { createDirectApiClient } from "../ai/directApiClient.js";
import { buildRemoteTransmissionPreview } from "../privacy/redaction.js";
import { createBridgeClient, isApiProvider, isCliProvider } from "../bridge/bridgeClient.js";
import { modelsForProvider } from "../../bridge/src/models.js";
import { configurePdfWorker, extractResumePdf } from "../profile/pdfResume.js";
import { applyTranslations, format, t } from "../ui/i18n.js";

const LOCALE_KEY = "marketfit.locale.v1";
const PERSONAL_STORAGE_KEYS = ["marketfit.state.v2", "marketfit.profile.v1", "marketfit.lastAnalysis.v1"];
const BRIDGE_COMMAND = "npm run bridge -- --port 8765";
const CLI_PROVIDER_LABELS = { codex: "codex", "claude-code": "claude" };

let locale = "en";
const fields = {
  interfaceLanguage: byId("interfaceLanguage"), cvPdf: byId("cvPdf"), cvFileStatus: byId("cvFileStatus"), market: byId("market"), workAuthorization: byId("workAuthorization"),
  status: byId("status"), result: byId("result"), currentJobSummary: byId("currentJobSummary"), currentJobMeta: byId("currentJobMeta"), currentJobQuality: byId("currentJobQuality"), temporaryNotice: byId("temporaryNotice"),
  redactionPreview: byId("redactionPreview"), bridgePort: byId("bridgePort"), pairingCode: byId("pairingCode"), bridgeState: byId("bridgeState"),
  agentProvider: byId("agentProvider"), apiKey: byId("apiKey"), cliBridgeMode: byId("cliBridgeMode"), apiProviderMode: byId("apiProviderMode"),
  apiModel: byId("apiModel"), accessRetryRow: byId("accessRetryRow"), jobEditorPanel: byId("jobEditorPanel"), jobTextEditor: byId("jobTextEditor"),
  jobTitleInput: byId("jobTitleInput"), jobCompanyInput: byId("jobCompanyInput"), jobLocationInput: byId("jobLocationInput"),
  bridgeCommand: byId("bridgeCommand"), copyBridgeCommand: byId("copyBridgeCommand")
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
byId("retryProviderAccess").addEventListener("click", grantProviderAccess);
fields.copyBridgeCommand.addEventListener("click", copyBridgeCommand);
fields.cvPdf.addEventListener("change", loadResumePdf);
fields.interfaceLanguage.addEventListener("change", changeLanguage);

fields.bridgeCommand.textContent = BRIDGE_COMMAND;
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

// --------------------------------------------------------- analysis rendering

/**
 * Ordered for the decision the panel exists to support: what the role is, how the
 * CV lines up requirement by requirement, then what to actually do. Evidence sits
 * in disclosures rather than inline, so quotes are one click away instead of
 * burying every conclusion they support.
 */
function renderAnalysis(evidence) {
  fields.result.innerHTML = [
    `<p class="analysis-note">${escapeHtml(t(locale, "aiSupplement"))}</p>`,
    renderOverview(evidence.overview),
    renderRequirements(evidence.requirements),
    renderCards(t(locale, "aiStrengths"), evidence.strengths, (item) => titleAndSummary(item.title, item.summary)),
    renderCards(t(locale, "aiGaps"), evidence.gaps, (item) => titleAndSummary(item.title, item.summary, severityTag(item.severity))),
    renderActions(evidence.suggestedActions),
    renderGroup(t(locale, "sectionPrepare"), [
      renderCards(t(locale, "resumeTailoring"), evidence.resumeTailoring, (item) => titleAndSummary(item.target, item.recommendation), "sub"),
      renderCards(t(locale, "interviewFocus"), evidence.interviewFocus, (item) => titleAndSummary(item.question, item.rationale), "sub")
    ]),
    renderGroup(t(locale, "sectionVerify"), [
      renderCards(t(locale, "aiRisks"), evidence.risks, (item) => titleAndSummary(item.title, item.summary, severityTag(item.severity)), "sub"),
      renderCards(t(locale, "employerQuestions"), evidence.uncertainties, (item) => titleAndSummary(item.type, item.message), "sub")
    ])
  ].filter(Boolean).join("");
}

function renderOverview(overview) {
  if (!overview) return "";
  return `<section class="result-card overview">
    ${textBlock(t(locale, "jobUnderstanding"), overview.jobFocus)}
    ${textBlock(t(locale, "candidatePositioning"), overview.candidatePositioning)}
    ${textBlock(t(locale, "fitNarrative"), overview.fitNarrative)}
    ${renderEvidence(overview.evidence)}
  </section>`;
}

const LEVEL_ORDER = { required: 0, preferred: 1, unclear: 2 };
const MATCH_ORDER = { gap: 0, no_evidence: 1, partial: 2, strong: 3 };
const MATCH_TONE = { strong: "ok", partial: "warn", gap: "bad", no_evidence: "muted" };

function renderRequirements(requirements = []) {
  if (!requirements.length) {
    return `<section class="result-card"><h3>${escapeHtml(t(locale, "evidenceRequirements"))}</h3><p class="meta">${escapeHtml(t(locale, "noRequirements"))}</p></section>`;
  }
  // Unmet required items first — that is what decides whether to apply at all.
  const sorted = [...requirements].sort((a, b) =>
    (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
    (MATCH_ORDER[a.match] ?? 9) - (MATCH_ORDER[b.match] ?? 9));

  const rows = sorted.map((item) => `<li class="requirement tone-${escapeHtml(MATCH_TONE[item.match] || "muted")}">
    <div class="requirement-head">
      <span class="requirement-name">${escapeHtml(item.name)}</span>
      <span class="tag tag-${escapeHtml(MATCH_TONE[item.match] || "muted")}">${escapeHtml(t(locale, matchKey(item.match)))}</span>
    </div>
    <p class="meta">${escapeHtml(t(locale, levelKey(item.level)))} · ${escapeHtml(item.explanation)}</p>
    ${renderEvidence(item.evidence)}
  </li>`).join("");

  return `<section class="result-card"><h3>${escapeHtml(t(locale, "evidenceRequirements"))}</h3><ul class="requirement-list">${rows}</ul></section>`;
}

const PRIORITY_ORDER = { now: 0, before_apply: 1, later: 2 };
const PRIORITY_TONE = { now: "bad", before_apply: "warn", later: "muted" };

function renderActions(actions = []) {
  if (!actions.length) return "";
  const sorted = [...actions].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  const rows = sorted.map((item) => `<li class="action">
    <span class="tag tag-${escapeHtml(PRIORITY_TONE[item.priority] || "muted")}">${escapeHtml(t(locale, priorityKey(item.priority)))}</span>
    <p>${escapeHtml(item.action)}</p>
    ${renderEvidence(item.evidence)}
  </li>`).join("");
  return `<section class="result-card"><h3>${escapeHtml(t(locale, "suggestedActions"))}</h3><ul class="action-list">${rows}</ul></section>`;
}

function renderCards(title, items, renderItem, variant = "") {
  if (!items?.length) return "";
  const rows = items.map((item) => `<li>${renderItem(item)}${renderEvidence(item.evidence)}</li>`).join("");
  return `<section class="result-card ${escapeHtml(variant)}"><h3>${escapeHtml(title)}</h3><ul class="finding-list">${rows}</ul></section>`;
}

function renderGroup(title, sections) {
  const body = sections.filter(Boolean).join("");
  if (!body) return "";
  return `<section class="result-group"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function titleAndSummary(title, summary, tag = "") {
  return `<div class="item-head"><strong>${escapeHtml(title)}</strong>${tag}</div><p>${escapeHtml(summary)}</p>`;
}

function severityTag(severity) {
  const tone = { material: "bad", moderate: "warn", unknown: "muted" }[severity] || "muted";
  return `<span class="tag tag-${escapeHtml(tone)}">${escapeHtml(t(locale, severityKey(severity)))}</span>`;
}

function textBlock(title, value) {
  if (!value) return "";
  return `<h4>${escapeHtml(title)}</h4><p>${escapeHtml(value)}</p>`;
}

function renderEvidence(evidence) {
  if (!evidence?.length) return "";
  const quotes = evidence.map((item) => `<blockquote><strong>${escapeHtml(item.source)}</strong><br />${escapeHtml(item.quote)}</blockquote>`).join("");
  return `<details class="evidence"><summary>${escapeHtml(format(locale, "evidenceToggle", { count: evidence.length }))}</summary>${quotes}</details>`;
}

function matchKey(match) {
  return { strong: "matchStrong", partial: "matchPartial", gap: "matchGap", no_evidence: "matchNoEvidence" }[match] || "unknown";
}
function levelKey(level) {
  return { required: "levelRequired", preferred: "levelPreferred", unclear: "levelUnclear" }[level] || "unknown";
}
function priorityKey(priority) {
  return { now: "priorityNow", before_apply: "priorityBeforeApply", later: "priorityLater" }[priority] || "unknown";
}
function severityKey(severity) {
  return { material: "severityMaterial", moderate: "severityModerate", unknown: "severityUnknown" }[severity] || "severityUnknown";
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
    setBridgeState(format(locale, "paired", { port: state.port, providers: available }));
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
    lastAgentEvidence = null;
    const task = {
      requestId: globalThis.crypto?.randomUUID?.() || `marketfit-${Date.now()}`, taskType: "analyze_job", provider, privacyMode: "provider_cloud",
      ...(isApiProvider(provider) ? { credential: { type: "session_api_key", apiKey } } : {}),
      options: { language: locale, ...(isApiProvider(provider) ? { model: fields.apiModel.value } : {}) },
      input: { resumeText: resume.text, job: { title: job.title, company: job.company, location: job.location, description: job.sourceText, url: job.url || "" }, candidate: { targetRole: "", workAuthorization: fields.workAuthorization.value, languages: [] } }
    };
    setStatus(t(locale, "requestingAi"));
    renderActionMessage(t(locale, "requestingAi"));
    const response = isApiProvider(provider) ? await directApiClient.runTask(task) : await bridgeClient.runTask(task);
    lastAgentEvidence = response.result;
    renderAnalysis(lastAgentEvidence);
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
