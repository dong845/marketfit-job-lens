import { createNormalizedJob } from "./schema.js";

export function extractJob(snapshot = {}) {
  const jsonLdJob = parseJobPosting(snapshot.jsonLd || []);
  if (jsonLdJob && isValidJobDescription(jsonLdJob.sourceText)) return enrich(jsonLdJob, snapshot, "schema_org_jsonld", 0.96, false);

  const adapter = detectAdapter(snapshot.url, snapshot.siteHint);
  const capturedText = longestText(snapshot.semantic?.sourceText, snapshot.text);
  if (capturedText) {
    const sourceText = sanitizeCapturedText(capturedText);
    const method = adapter || "semantic_selector";
    const quality = validateCapturedJob({ sourceText, extraction: { confidence: Number(snapshot.qualityScore || 0) } });
    return enrich({
      title: snapshot.semantic?.title || jsonLdJob?.title || titleFromSnapshot(snapshot),
      company: snapshot.semantic?.company || jsonLdJob?.company || companyFromSnapshot(snapshot),
      location: snapshot.semantic?.location || jsonLdJob?.location || "",
      employmentType: snapshot.semantic?.employmentType || jsonLdJob?.employmentType || "",
      salary: jsonLdJob?.salary || "",
      sourceText
    }, snapshot, method, confidenceFor(method, quality, snapshot), !quality.ok);
  }
  return enrich({ title: jsonLdJob?.title || titleFromSnapshot(snapshot), company: jsonLdJob?.company || "", location: jsonLdJob?.location || "", sourceText: "" }, snapshot, "empty", 0, true);
}

export function createManualJob(input = {}) {
  const sourceText = sanitizeCapturedText(input.sourceText || input.jobText || "");
  const quality = validateCapturedJob({ sourceText, extraction: { confidence: 0.86 } });
  return enrich({
    title: input.title || titleFromText(sourceText), company: input.company || "", location: input.location || "",
    employmentType: input.employmentType || "", salary: input.salary || "", sourceText
  }, input, "manual_paste", quality.ok ? 0.86 : 0.3, !quality.ok);
}

export function sanitizeCapturedText(value) {
  const seen = new Set();
  return String(value ?? "").split(/\n+/).map((line) => line.trim()).filter((line) => {
    if (!line || line.length < 2 || seen.has(line)) return false;
    if (/cookie|privacy policy|accept all|recommended jobs|related jobs|sign in|subscribe|copyright/i.test(line)) return false;
    seen.add(line);
    return true;
  }).join("\n").slice(0, 26000);
}

/**
 * Capture deliberately stops at "is this a usable job description?". Structured
 * requirement parsing used to run here too, but the analysis is done by the model
 * from the raw text, so those fields were computed on every capture and never read.
 */
function enrich(base, snapshot, method, confidence, needsConfirmation) {
  const sourceText = base.sourceText || "";
  const quality = validateCapturedJob({ sourceText, extraction: { confidence } });
  return createNormalizedJob({
    ...base,
    url: snapshot.url || "",
    capturedAt: snapshot.capturedAt || new Date().toISOString(),
    extraction: {
      method,
      confidence,
      needsConfirmation: needsConfirmation || !quality.ok,
      textLength: sourceText.length,
      contentFingerprint: jobContentFingerprint(sourceText),
      qualityReasons: quality.reasons
    }
  });
}

export function validateCapturedJob(jobOrText) {
  const sourceText = typeof jobOrText === "string" ? sanitizeCapturedText(jobOrText) : sanitizeCapturedText(jobOrText?.sourceText || "");
  const lower = sourceText.toLowerCase();
  const reasons = [];
  const structureSignals = [
    /responsibilit/i, /requirement/i, /qualification/i, /preferred/i, /about the role/i, /what you.?ll do/i,
    /岗位职责/, /任职要求/, /职位要求/, /加分项/, /职位描述/, /工作职责/, /任职资格/, /我们希望/, /岗位要求/
  ].filter((pattern) => pattern.test(sourceText)).length;
  const listSignals = (sourceText.match(/\n\s*([0-9]+[.、)]|[-*•]|[一二三四五六七八九十]+[、.])/g) || []).length;
  const sentenceSignals = (sourceText.match(/[。.!?]\s|\n/g) || []).length;
  const noiseSignals = [
    /sign in|log in|cookie|privacy policy|recommended jobs|related jobs|subscribe|create alert/i,
    /登录|注册|隐私|推荐职位|相似职位|分享职位/
  ].filter((pattern) => pattern.test(sourceText)).length;
  const hasJobSignals = structureSignals > 0 || listSignals >= 3 || sentenceSignals >= 5;
  const hasUsefulLength = sourceText.length >= 300 || (sourceText.length >= 180 && hasJobSignals);
  if (!sourceText) reasons.push("NO_JOB_CONTENT");
  else if (!hasUsefulLength) reasons.push("JOB_TEXT_TOO_SHORT");
  if (sourceText && !hasJobSignals) reasons.push("NO_JOB_STRUCTURE_SIGNALS");
  if (noiseSignals >= 3 && sourceText.length < 900) reasons.push("LIKELY_NAV_OR_LOGIN_TEXT");
  const confidence = Math.max(0, Math.min(1, Number(jobOrText?.extraction?.confidence || 0) || 0));
  const ok = hasUsefulLength && hasJobSignals && reasons.length === 0;
  return {
    ok,
    reasons,
    textLength: sourceText.length,
    structureSignals,
    listSignals,
    confidence
  };
}

export function isValidJobDescription(text) {
  return validateCapturedJob(text).ok;
}

export function hasUsableJobContent(job) {
  if (!job?.sourceText) return false;
  const quality = validateCapturedJob(job);
  return quality.ok && job.extraction?.confidence >= 0.45 && !job.extraction?.needsConfirmation;
}

export function jobContentFingerprint(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30000);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseJobPosting(rawValues) {
  const values = Array.isArray(rawValues) ? rawValues : [rawValues];
  for (const value of values) {
    try {
      const root = typeof value === "string" ? JSON.parse(value) : value;
      const candidate = flatten(root).find((item) => {
        const type = item?.["@type"];
        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      });
      if (!candidate) continue;
      return {
        title: candidate.title,
        company: candidate.hiringOrganization?.name || candidate.company,
        location: locationText(candidate.jobLocation),
        employmentType: Array.isArray(candidate.employmentType) ? candidate.employmentType.join(", ") : candidate.employmentType,
        salary: candidate.baseSalary?.value?.value ? `${candidate.baseSalary.currency || ""} ${candidate.baseSalary.value.value}`.trim() : "",
        sourceText: htmlToText(candidate.description || "")
      };
    } catch {
      // A malformed script tag should not prevent semantic or manual fallback.
    }
  }
  return null;
}

function longestText(...values) {
  return values.map((value) => String(value || "").trim()).sort((a, b) => b.length - a.length)[0] || "";
}

function confidenceFor(method, quality, snapshot) {
  const captureScore = Number(snapshot.qualityScore || 0);
  if (!quality.ok) return Math.max(0.25, Math.min(0.5, captureScore || quality.confidence || 0.35));
  if (method === "semantic_selector") return Math.max(0.66, Math.min(0.82, captureScore || 0.66));
  if (method.includes("adapter")) return Math.max(0.74, Math.min(0.9, captureScore || 0.74));
  return Math.max(0.6, Math.min(0.78, captureScore || 0.66));
}

function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (!value || typeof value !== "object") return [];
  return [value, ...flatten(value["@graph"] || [])];
}

function detectAdapter(url = "", siteHint = "") {
  const value = `${url} ${siteHint}`.toLowerCase();
  if (value.includes("greenhouse")) return "greenhouse_adapter";
  if (value.includes("lever.co") || value.includes("jobs.lever")) return "lever_adapter";
  if (value.includes("workday")) return "workday_adapter";
  if (value.includes("react") || value.includes("spa")) return "generic_spa_adapter";
  return "";
}

function titleFromSnapshot(snapshot) {
  return snapshot.semantic?.title || String(snapshot.documentTitle || "").replace(/\s*[|\-]\s*.+$/, "").trim() || titleFromText(snapshot.text || "");
}

function companyFromSnapshot(snapshot) {
  const match = String(snapshot.documentTitle || "").match(/[|\-]\s*(.+)$/);
  return snapshot.semantic?.company || match?.[1]?.trim() || "";
}

function titleFromText(text) {
  return String(text ?? "").split(/\n+/).map((line) => line.trim()).find((line) => line.length > 3 && line.length < 110) || "";
}

function locationText(value) {
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((item) => item?.address?.addressLocality || item?.address?.addressRegion || item?.address?.addressCountry || "").filter(Boolean).join(", ");
}

function htmlToText(value) {
  return String(value).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+\n/g, "\n").trim();
}
