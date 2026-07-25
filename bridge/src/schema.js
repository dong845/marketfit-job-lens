import { resolveEvidenceRef } from "./evidenceBlocks.js";

const PROVIDERS = new Set(["codex", "claude-code", "openai-api", "anthropic-api"]);
const MATCH_STATES = new Set(["strong", "partial", "gap", "no_evidence"]);
const REQUIREMENT_LEVELS = new Set(["required", "preferred", "unclear"]);
const EVIDENCE_SOURCES = new Set(["resume", "job"]);
const GAP_SEVERITIES = new Set(["material", "moderate", "unknown"]);
const ACTION_PRIORITIES = new Set(["now", "before_apply", "later"]);
const OUTPUT_LANGUAGES = new Set(["en", "zh"]);
const MAX_RESUME_LENGTH = 60000;
const MAX_JOB_LENGTH = 60000;
const MAX_REQUEST_LENGTH = 140000;

/**
 * How many items of each kind a result may carry.
 *
 * These bound what we ask for and what we render — they are not a trust boundary.
 * A model that returns more than we want to show is being verbose, not hostile,
 * so parseAgentEvidence trims the extras rather than rejecting the whole reply.
 * Rejecting meant a user paid for an analysis and got an error instead.
 */
export const RESULT_LIMITS = Object.freeze({
  requirements: 20,
  strengths: 8,
  gaps: 8,
  risks: 8,
  resumeTailoring: 8,
  interviewFocus: 8,
  uncertainties: 8,
  suggestedActions: 8,
  evidencePerItem: 4,
  overviewEvidence: 6
});

/**
 * Per-field character ceilings, used by BOTH the schema we send and the parser that
 * validates what comes back. They were separate numbers, and the parser's were
 * lower: text() throws above its ceiling, so a reply the schema invited was
 * rejected on arrival and a paid analysis was lost. One table, one ceiling.
 */
export const FIELD_LIMITS = Object.freeze({
  headline: 220,
  rationale: 1200,
  narrative: 1200,
  name: 140,
  question: 360,
  shortLabel: 80,
  prose: 900
});

const EVIDENCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["ref"],
  properties: {
    ref: { type: "string", pattern: "^(CV|JD)-[0-9]{3}$" }
  }
});

const CITED_ITEM_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "evidence"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
    summary: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
    evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
  }
});

export const VERDICTS = Object.freeze(["strong_fit", "worth_applying", "stretch", "weak_fit"]);

export const AGENT_EVIDENCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["recommendation", "overview", "requirements", "strengths", "gaps", "risks", "resumeTailoring", "interviewFocus", "uncertainties", "suggestedActions"],
  properties: {
    recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "headline", "rationale"],
      properties: {
        verdict: { type: "string", enum: ["strong_fit", "worth_applying", "stretch", "weak_fit"] },
        headline: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.headline },
        rationale: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.rationale }
      }
    },
    overview: {
      type: "object",
      additionalProperties: false,
      required: ["jobFocus", "candidatePositioning", "fitNarrative", "evidence"],
      properties: {
        jobFocus: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.narrative },
        candidatePositioning: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.narrative },
        fitNarrative: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.narrative },
        evidence: { type: "array", minItems: 2, maxItems: 6, items: EVIDENCE_SCHEMA }
      }
    },
    requirements: {
      type: "array",
      maxItems: RESULT_LIMITS.requirements,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "level", "match", "evidence", "explanation"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
          level: { type: "string", enum: ["required", "preferred", "unclear"] },
          match: { type: "string", enum: ["strong", "partial", "gap", "no_evidence"] },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: EVIDENCE_SCHEMA
          },
          explanation: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose }
        }
      }
    },
    strengths: { type: "array", maxItems: RESULT_LIMITS.strengths, items: CITED_ITEM_SCHEMA },
    gaps: {
      type: "array",
      maxItems: RESULT_LIMITS.gaps,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "summary", "howToClose", "evidence"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
          severity: { type: "string", enum: ["material", "moderate", "unknown"] },
          summary: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          howToClose: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    },
    risks: {
      type: "array",
      maxItems: RESULT_LIMITS.risks,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "summary", "evidence"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
          severity: { type: "string", enum: ["material", "moderate", "unknown"] },
          summary: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    },
    resumeTailoring: {
      type: "array",
      maxItems: RESULT_LIMITS.resumeTailoring,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "recommendation", "evidence"],
        properties: {
          target: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
          recommendation: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    },
    interviewFocus: {
      type: "array",
      maxItems: RESULT_LIMITS.interviewFocus,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "rationale", "evidence"],
        properties: {
          question: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.question },
          rationale: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    },
    uncertainties: {
      type: "array",
      maxItems: RESULT_LIMITS.uncertainties,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "message", "evidence"],
        properties: {
          type: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.shortLabel },
          message: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    },
    suggestedActions: {
      type: "array",
      maxItems: RESULT_LIMITS.suggestedActions,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "priority", "evidence"],
        properties: {
          action: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          priority: { type: "string", enum: ["now", "before_apply", "later"] },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    }
  }
});

/**
 * Keywords both providers' strict/structured-output modes restrict. Sending them
 * risks the request being rejected outright rather than the constraint being
 * enforced, which would fail every analysis rather than trimming a long one.
 *
 * Dropping them means the provider is no longer told the bounds, so parseAgentEvidence
 * has to apply them itself — and it must apply them the way a provider would have,
 * by producing a shorter result rather than refusing one. It trims over-long lists
 * and rejects only genuinely malformed output. The schema above remains the single
 * source of truth for the limits; this only changes what travels on the wire.
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minLength", "maxLength", "pattern", "format",
  "minItems", "maxItems", "uniqueItems",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"
]);

export function wireSchema(schema = AGENT_EVIDENCE_SCHEMA) {
  if (Array.isArray(schema)) return schema.map((item) => wireSchema(item));
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
      .map(([key, value]) => [key, wireSchema(value)])
  );
}

export class BridgeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.status = status;
  }
}

export function parseTaskRequest(value) {
  const request = object(value, "Request body must be an object.");
  const requestId = text(request.requestId, "requestId", 128);
  const taskType = text(request.taskType, "taskType", 64);
  if (taskType !== "analyze_job") throw new BridgeError("TASK_NOT_ALLOWED", "Only analyze_job is available in this read-only release.", 403);

  const provider = text(request.provider, "provider", 40);
  if (!PROVIDERS.has(provider)) throw new BridgeError("PROVIDER_INVALID", "The selected provider is not supported.");
  const privacyMode = text(request.privacyMode, "privacyMode", 40);
  if (privacyMode !== "provider_cloud") throw new BridgeError("PRIVACY_MODE_INVALID", "AI analysis requires explicit provider_cloud consent.");

  const input = object(request.input, "input is required.");
  const resumeText = text(input.resumeText, "resumeText", MAX_RESUME_LENGTH);
  const job = object(input.job, "job is required.");
  const jobDescription = text(job.description, "job description", MAX_JOB_LENGTH);
  const candidate = object(input.candidate || {}, "candidate must be an object.");
  const options = object(request.options || {}, "options must be an object.");
  const model = optionalText(options.model, "options.model", 100);
  const language = optionalText(options.language, "options.language", 8) || "en";
  if (!OUTPUT_LANGUAGES.has(language)) throw new BridgeError("SCHEMA_INVALID", "options.language must be en or zh.");
  const credential = parseCredential(provider, request.credential);

  const normalized = {
    requestId,
    taskType,
    provider,
    privacyMode,
    credential,
    options: { model, language },
    input: {
      resumeText,
      job: {
        title: optionalText(job.title, "job.title", 240),
        company: optionalText(job.company, "job.company", 240),
        location: optionalText(job.location, "job.location", 240),
        description: jobDescription,
        url: optionalText(job.url, "job.url", 1200)
      },
      candidate: {
        targetRole: optionalText(candidate.targetRole, "candidate.targetRole", 240),
        workAuthorization: optionalText(candidate.workAuthorization, "candidate.workAuthorization", 80),
        languages: arrayOfText(candidate.languages || [], "candidate.languages", 20, 80)
      }
    }
  };

  if (JSON.stringify(normalized).length > MAX_REQUEST_LENGTH) throw new BridgeError("PAYLOAD_TOO_LARGE", "The AI request is too large. Shorten the CV or job description.", 413);
  return normalized;
}

export function parseAgentEvidence(value, request) {
  const result = object(value, "Provider output must be a JSON object.");
  const overview = object(result.overview, "overview must be an object.");
  const requirements = Array.isArray(result.requirements) ? result.requirements : invalid("requirements must be an array.");
  const strengths = Array.isArray(result.strengths) ? result.strengths : invalid("strengths must be an array.");
  const gaps = Array.isArray(result.gaps) ? result.gaps : invalid("gaps must be an array.");
  const risks = Array.isArray(result.risks) ? result.risks : invalid("risks must be an array.");
  const resumeTailoring = Array.isArray(result.resumeTailoring) ? result.resumeTailoring : invalid("resumeTailoring must be an array.");
  const interviewFocus = Array.isArray(result.interviewFocus) ? result.interviewFocus : invalid("interviewFocus must be an array.");
  const uncertainties = Array.isArray(result.uncertainties) ? result.uncertainties : invalid("uncertainties must be an array.");
  const suggestedActions = Array.isArray(result.suggestedActions) ? result.suggestedActions : invalid("suggestedActions must be an array.");
  // Trim rather than reject: an over-long list is verbosity, and discarding a
  // paid analysis over it is worse than showing the first N items. Providers are
  // told the caps via the schema, but strict/structured modes drop the keyword
  // that carries them, so the ceiling has to be enforced here too.
  const trim = (items, key) => items.slice(0, RESULT_LIMITS[key]);

  return {
    // Optional at parse time even though the schema asks for it: a model that
    // omits the verdict has still produced a usable analysis, and discarding a
    // paid result over a missing summary line would be the wrong trade.
    recommendation: parseRecommendation(result.recommendation),
    overview: {
      jobFocus: text(overview.jobFocus, "overview.jobFocus", FIELD_LIMITS.narrative),
      candidatePositioning: text(overview.candidatePositioning, "overview.candidatePositioning", FIELD_LIMITS.narrative),
      fitNarrative: text(overview.fitNarrative, "overview.fitNarrative", FIELD_LIMITS.narrative),
      evidence: parseEvidenceList(overview.evidence, request, "overview.evidence", 6, 2)
    },
    requirements: trim(requirements, "requirements").map((item) => parseRequirement(item, request)),
    strengths: trim(strengths, "strengths").map((item) => parseCitedItem(item, request, "strength")),
    gaps: trim(gaps, "gaps").map((item) => parseSeverityItem(item, request, "gap")),
    risks: trim(risks, "risks").map((item) => parseSeverityItem(item, request, "risk")),
    resumeTailoring: trim(resumeTailoring, "resumeTailoring").map((item) => parseTailoringItem(item, request)),
    interviewFocus: trim(interviewFocus, "interviewFocus").map((item) => parseInterviewItem(item, request)),
    uncertainties: trim(uncertainties, "uncertainties").map((item) => {
      const uncertainty = object(item, "Each uncertainty must be an object.");
      return {
        type: text(uncertainty.type, "uncertainty.type", FIELD_LIMITS.shortLabel),
        message: text(uncertainty.message, "uncertainty.message", FIELD_LIMITS.prose),
        evidence: parseEvidenceList(uncertainty.evidence, request, "uncertainty.evidence", 4)
      };
    }),
    suggestedActions: trim(suggestedActions, "suggestedActions").map((item) => parseAction(item, request))
  };
}

export function parseJsonOutput(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const textValue = extractJsonText(value);
  try {
    return JSON.parse(textValue);
  } catch {
    throw new BridgeError("OUTPUT_UNTRUSTED", "Provider did not return valid JSON.");
  }
}

export function extractJsonText(value) {
  const text = String(value || "").trim();
  if (!text) throw new BridgeError("OUTPUT_UNTRUSTED", "Provider returned no JSON text.");
  if (text.startsWith("```")) {
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (stripped.startsWith("{")) return stripped;
  }
  if (text.startsWith("{")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function parseRecommendation(value) {
  if (!value || typeof value !== "object") return null;
  const verdict = typeof value.verdict === "string" ? value.verdict.trim() : "";
  if (!VERDICTS.includes(verdict)) return null;
  try {
    return {
      verdict,
      headline: text(value.headline, "recommendation.headline", FIELD_LIMITS.headline),
      rationale: text(value.rationale, "recommendation.rationale", FIELD_LIMITS.rationale)
    };
  } catch {
    return null;
  }
}

function parseRequirement(value, request) {
  const requirement = object(value, "Each requirement must be an object.");
  const level = text(requirement.level, "requirement.level", 20);
  const match = text(requirement.match, "requirement.match", 20);
  if (!REQUIREMENT_LEVELS.has(level) || !MATCH_STATES.has(match)) throw new BridgeError("OUTPUT_UNTRUSTED", "Provider returned an invalid requirement state.");
  return {
    name: text(requirement.name, "requirement.name", FIELD_LIMITS.name),
    level,
    match,
    evidence: parseEvidenceList(requirement.evidence, request, "requirement.evidence", 4),
    explanation: text(requirement.explanation, "requirement.explanation", FIELD_LIMITS.prose)
  };
}

function parseCitedItem(value, request, label) {
  const item = object(value, `Each ${label} must be an object.`);
  return {
    title: text(item.title, `${label}.title`, FIELD_LIMITS.name),
    summary: text(item.summary, `${label}.summary`, FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, `${label}.evidence`, 4)
  };
}

function parseSeverityItem(value, request, label) {
  const item = object(value, `Each ${label} must be an object.`);
  const severity = text(item.severity, `${label}.severity`, 20);
  if (!GAP_SEVERITIES.has(severity)) throw new BridgeError("OUTPUT_UNTRUSTED", `Provider returned an invalid ${label} severity.`);
  return {
    title: text(item.title, `${label}.title`, FIELD_LIMITS.name),
    severity,
    summary: text(item.summary, `${label}.summary`, FIELD_LIMITS.prose),
    howToClose: optionalText(item.howToClose, `${label}.howToClose`, FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, `${label}.evidence`, 4)
  };
}

function parseTailoringItem(value, request) {
  const item = object(value, "Each resumeTailoring item must be an object.");
  return {
    target: text(item.target, "resumeTailoring.target", FIELD_LIMITS.name),
    recommendation: text(item.recommendation, "resumeTailoring.recommendation", FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, "resumeTailoring.evidence", 4)
  };
}

function parseInterviewItem(value, request) {
  const item = object(value, "Each interviewFocus item must be an object.");
  return {
    question: text(item.question, "interviewFocus.question", FIELD_LIMITS.question),
    rationale: text(item.rationale, "interviewFocus.rationale", FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, "interviewFocus.evidence", 4)
  };
}

function parseAction(value, request) {
  const item = object(value, "Each suggested action must be an object.");
  const priority = text(item.priority, "suggestedActions.priority", 30);
  if (!ACTION_PRIORITIES.has(priority)) throw new BridgeError("OUTPUT_UNTRUSTED", "Provider returned an invalid action priority.");
  return {
    action: text(item.action, "suggestedActions.action", FIELD_LIMITS.prose),
    priority,
    evidence: parseEvidenceList(item.evidence, request, "suggestedActions.evidence", 4)
  };
}

function parseEvidenceList(value, request, label, maxItems, minItems = 1) {
  const evidence = Array.isArray(value) ? value : [];
  const resolved = evidence.slice(0, maxItems).flatMap((item) => {
    try {
      const parsed = parseEvidence(item, request);
      return parsed ? [parsed] : [];
    } catch {
      return [];
    }
  });
  if (resolved.length < minItems && evidence.length === 0) throw new BridgeError("OUTPUT_UNTRUSTED", `${label} needs ${minItems}-${maxItems} evidence references.`);
  return resolved;
}

function parseEvidence(value, request) {
  const evidence = object(value, "Each evidence item must be an object.");
  if (evidence.ref !== undefined) {
    const block = resolveEvidenceRef(text(evidence.ref, "evidence.ref", 20), request);
    return block ? { source: block.source, quote: block.quote, ref: block.id } : null;
  }
  const source = text(evidence.source, "evidence.source", 20);
  const quote = text(evidence.quote, "evidence.quote", 500);
  if (!EVIDENCE_SOURCES.has(source)) return null;
  const sourceText = source === "resume" ? request.input.resumeText : request.input.job.description;
  return evidenceTextMatches(sourceText, quote) ? { source, quote } : null;
}

function evidenceTextMatches(sourceText, quote) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").replace(/[“”]/g, "\"").replace(/[‘’]/g, "'").trim().toLowerCase();
  return normalize(sourceText).includes(normalize(quote));
}

function parseCredential(provider, value) {
  const apiProvider = provider === "openai-api" || provider === "anthropic-api";
  if (!apiProvider && value !== undefined) throw new BridgeError("CREDENTIAL_NOT_ALLOWED", "Local CLI providers use their own local authentication.");
  if (!apiProvider) return null;
  const credential = object(value, "An API key is required for this provider.");
  if (credential.type !== "session_api_key") throw new BridgeError("CREDENTIAL_INVALID", "Only session_api_key credentials are accepted.");
  const apiKey = text(credential.apiKey, "API key", 500);
  if (apiKey.length < 12) throw new BridgeError("CREDENTIAL_INVALID", "The API key appears incomplete.");
  return { type: "session_api_key", apiKey };
}

function object(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeError("SCHEMA_INVALID", message);
  return value;
}

function text(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new BridgeError("SCHEMA_INVALID", `${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new BridgeError("SCHEMA_INVALID", `${label} is too long.`);
  return normalized;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return text(value, label, maxLength);
}

function arrayOfText(value, label, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) throw new BridgeError("SCHEMA_INVALID", `${label} must be a short list.`);
  return value.map((item) => text(item, label, maxLength));
}

function invalid(message) {
  throw new BridgeError("OUTPUT_UNTRUSTED", message);
}
