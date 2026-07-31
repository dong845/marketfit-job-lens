import { resolveEvidenceRef } from "./evidenceBlocks.js";

const PROVIDERS = new Set(["openai-api", "anthropic-api", "deepseek-api"]);
const MATCH_STATES = new Set(["strong", "partial", "gap", "no_evidence"]);
const SCREENING_ROLES = new Set(["knockout", "weighted", "nice_to_have"]);
const RECENCY_STATES = new Set(["current", "recent", "dated", "undated"]);
const CLOSABILITY = new Set(["before_apply", "not_before_apply"]);
const CONDITION_TYPES = new Set(["sponsorship", "work_authorization", "citizenship", "clearance", "onsite_location", "licence", "other"]);
/**
 * Which way a stated condition points. The type alone cannot tell "we sponsor
 * visas" from "we do not sponsor visas" — same subject, opposite consequence — so
 * nothing downstream could compare it against what the candidate said about
 * themselves without this.
 */
const CONDITION_STANCES = new Set(["requires_existing", "offers_support", "unclear"]);
/**
 * Who holds the answer to an open question. The field used to be called
 * uncertainties with no audience, so the model filled it with gaps in the CV while
 * the panel titled it "Ask the employer" — advice the reader could not act on,
 * because an employer cannot tell you what you did at your last job.
 */
const ANSWERED_BY = new Set(["employer", "you"]);
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
/**
 * How many items each list may carry.
 *
 * These are latency, not just taste. Output tokens are generated one after another,
 * so wall-clock time tracks how much JSON is asked for almost linearly — and the
 * caps sum to a ceiling that has to stay under the model's output budget, because
 * an answer that runs out of room is a total loss rather than a shorter answer.
 * At the previous numbers that sum was roughly twice the budget: nothing enforced
 * it, so how close a run came to truncating depended on how talkative the model
 * felt. These lower numbers are also the honest reading length — twelve requirement
 * rows and five items a list is more than anyone reads while deciding whether to
 * spend an evening on an application, which is the whole question this answers.
 */
export const RESULT_LIMITS = Object.freeze({
  requirements: 12,
  strengths: 5,
  gaps: 5,
  risks: 5,
  // Deliberately the shortest list here. A CV with six things wrong with it is a
  // different conversation from the one this panel is having, and a long list of
  // them reads as an attack rather than as advice.
  profileRisks: 4,
  resumeTailoring: 5,
  interviewFocus: 5,
  uncertainties: 5,
  suggestedActions: 5,
  statedConditions: 4,
  evidencePerItem: 4,
  overviewEvidence: 6,
  screeningTerms: 10
});

/**
 * Per-field character ceilings, used by BOTH the schema we send and the parser that
 * validates what comes back. They were separate numbers, and the parser's were
 * lower, so a reply the schema invited was rejected on arrival and a paid analysis
 * was lost. One table, one ceiling — and outputText trims rather than refuses,
 * because the wire schema cannot carry these limits to the provider at all.
 *
 * That last clause is the reason these are backstops and not the real control.
 * wireSchema strips maxLength before the schema is sent, because structured-output
 * modes reject it — so the model has never been told any of these numbers, and a
 * ceiling nobody can see does not shorten anything, it only decides where the text
 * gets cut. The instruction that does the work is the sentence budget in
 * buildAnalyzePrompt; these are sized to sit just above it, so a field that keeps
 * to the budget is never trimmed and only a runaway one is.
 */
export const FIELD_LIMITS = Object.freeze({
  headline: 180,
  rationale: 700,
  narrative: 700,
  name: 120,
  question: 300,
  shortLabel: 80,
  note: 220,
  prose: 500
});

const EFFORT_LEVELS = new Set(["quick", "evening", "multi_day", "not_closable"]);
const LEVEL_DIRECTIONS = new Set(["step_up", "lateral", "step_down", "unclear"]);

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
  required: ["recommendation", "statedConditions", "overview", "requirements", "screening", "strengths", "gaps", "risks", "profileRisks", "resumeTailoring", "interviewFocus", "uncertainties", "suggestedActions"],
  properties: {
    recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "headline", "rationale", "effort", "effortNote", "decisiveFactor"],
      properties: {
        verdict: { type: "string", enum: ["strong_fit", "worth_applying", "stretch", "weak_fit"] },
        headline: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.headline },
        rationale: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.rationale },
        // "Should I apply?" is really "is this worth tonight?". A verdict without a
        // price tag leaves the reader unable to answer that, however good the prose.
        effort: { type: "string", enum: ["quick", "evening", "multi_day", "not_closable"] },
        effortNote: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.note },
        // The one change that would move the answer, so a weak verdict still leaves
        // the reader with something to do rather than only a refusal.
        decisiveFactor: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.note }
      }
    },
    // Conditions the posting itself states. Reporting the employer's own sentence
    // is not a legal opinion, and it is the one thing that can make the verdict
    // irrelevant — a sponsorship line decides the application before fit does.
    statedConditions: {
      type: "array",
      maxItems: RESULT_LIMITS.statedConditions,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "stance", "statement", "question", "evidence"],
        properties: {
          type: { type: "string", enum: ["sponsorship", "work_authorization", "citizenship", "clearance", "onsite_location", "licence", "other"] },
          stance: { type: "string", enum: ["requires_existing", "offers_support", "unclear"] },
          statement: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          // The question whose answer settles this condition, kept with the condition
          // rather than in the general question list — a doubt that decides the whole
          // application should not be answered three screens below where it is raised.
          question: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.question },
          evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
        }
      }
    },
    overview: {
      type: "object",
      additionalProperties: false,
      required: ["jobFocus", "candidatePositioning", "fitNarrative", "levelComparison", "evidence"],
      properties: {
        jobFocus: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.narrative },
        candidatePositioning: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.narrative },
        fitNarrative: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.narrative },
        // Whether this is a step up, sideways or down against what the CV already
        // shows. Absent, the reader can tell whether they qualify but not whether
        // the job is worth having.
        levelComparison: {
          type: "object",
          additionalProperties: false,
          required: ["direction", "note"],
          properties: {
            direction: { type: "string", enum: ["step_up", "lateral", "step_down", "unclear"] },
            note: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.note }
          }
        },
        evidence: { type: "array", minItems: 2, maxItems: 6, items: EVIDENCE_SCHEMA }
      }
    },
    requirements: {
      type: "array",
      maxItems: RESULT_LIMITS.requirements,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "level", "screening", "match", "recency", "evidence", "explanation"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
          // What the posting calls it.
          level: { type: "string", enum: ["required", "preferred", "unclear"] },
          // What it actually does at screening time, which is a different question:
          // most "required" lists are wish-lists, and a handful of items are true
          // filters. Counting the label is what made a missing clearance read as a
          // score deduction rather than a stop.
          screening: { type: "string", enum: ["knockout", "weighted", "nice_to_have"] },
          match: { type: "string", enum: ["strong", "partial", "gap", "no_evidence"] },
          // A named skill last used in 2018 does not screen like one used daily.
          recency: { type: "string", enum: ["current", "recent", "dated", "undated"] },
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
    /**
     * Whether the CV will survive the read that happens before anyone judges it.
     *
     * Everything else in this schema compares capability: can this person do what the
     * posting asks. Screening is a different question with a different answer — does
     * the document contain the words that get searched for, and does its title look
     * like the one being hired. A candidate can match every requirement in this result
     * and never be read, and nothing in a requirement-by-requirement comparison can
     * see that happening. The two are deliberately independent: a requirement scored
     * strong while its term is absent is not a contradiction, it is the single most
     * useful thing this section reports.
     */
    screening: {
      type: "object",
      additionalProperties: false,
      required: ["titleMatch", "terms"],
      properties: {
        titleMatch: {
          type: "object",
          additionalProperties: false,
          required: ["direction", "note"],
          properties: {
            direction: { type: "string", enum: ["same", "adjacent", "distant"] },
            note: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.note }
          }
        },
        terms: {
          type: "array",
          maxItems: RESULT_LIMITS.screeningTerms,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["term", "presence", "cvWording", "evidence"],
            properties: {
              // The posting's own string, because that is what gets searched for.
              term: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.shortLabel },
              presence: { type: "string", enum: ["verbatim", "variant", "absent"] },
              // What the CV calls it instead. Empty unless the presence is variant.
              cvWording: { type: "string", maxLength: FIELD_LIMITS.shortLabel },
              evidence: { type: "array", minItems: 1, maxItems: 4, items: EVIDENCE_SCHEMA }
            }
          }
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
        required: ["title", "severity", "summary", "closable", "howToClose", "evidence"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
          severity: { type: "string", enum: ["material", "moderate", "unknown"] },
          summary: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          // Forcing a before-apply fix onto every gap manufactures the reframing a
          // recruiter reads as padded. Some gaps have no honest close this week.
          closable: { type: "string", enum: ["before_apply", "not_before_apply"] },
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
    /**
     * What a screener reads in the CV itself and hesitates over, whatever this
     * posting happens to ask for.
     *
     * The two lists next to this one both compare the CV against the posting: a gap
     * is the CV falling short of something asked for, a risk is the ROLE going wrong
     * for this person. Neither has anywhere to put the reasons applications are
     * actually binned — an unexplained year out, three eight-month jobs in a row, a
     * pivot with no bridging story, a claimed title the projects do not support, a
     * skills list with no work behind it. Those are invisible to a requirement-by-
     * requirement comparison and decisive at the fifteen-second read, so before this
     * existed the model could notice one and have no field to report it in.
     */
    profileRisks: {
      type: "array",
      maxItems: RESULT_LIMITS.profileRisks,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "severity", "summary", "howToAddress", "evidence"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.name },
          severity: { type: "string", enum: ["material", "moderate", "unknown"] },
          summary: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
          // Naming the problem without a way to handle it is the failure mode here:
          // most of these cannot be fixed at all, only explained well.
          howToAddress: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.prose },
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
        required: ["type", "answeredBy", "message", "evidence"],
        properties: {
          type: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.shortLabel },
          answeredBy: { type: "string", enum: ["employer", "you"] },
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
  /**
   * How much of each input actually survived to this point.
   *
   * Absence is what these describe. A requirement the furniture filter removed and a
   * requirement the posting never carried are the same silence to a model, and it
   * reports the second one as a finding — "the posting does not ask for X" — with no
   * way to know it is reading a hole rather than a fact.
   *
   * Capture confidence is deliberately not here. runAgentReview refuses to analyse
   * anything below hasUsableJobContent's floor, so by the time a request is built the
   * value never varies enough to change an answer, and a field no instruction consumes
   * is indistinguishable from one the model was told to ignore. The reader-facing
   * figure travels in the report payload instead, where something does read it.
   */
  const sourceQuality = object(input.sourceQuality || {}, "input.sourceQuality must be an object.");
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
        employmentType: optionalText(job.employmentType, "job.employmentType", 120),
        salary: optionalText(job.salary, "job.salary", 240),
        url: optionalText(job.url, "job.url", 1200)
      },
      // Only what a prompt instruction actually consumes. targetRole and languages
      // were sent on every request, hardcoded empty, and read by nothing — a payload
      // field no instruction mentions is indistinguishable from one the model was
      // told to ignore. Language requirements are matched from the CV like any other
      // requirement, so nothing was lost by dropping the field.
      candidate: {
        workAuthorization: optionalText(candidate.workAuthorization, "candidate.workAuthorization", 80)
      },
      // The method is our own capture token rather than anything read off the page,
      // so it is bounded rather than enumerated: enumerating it here would make the
      // ai layer import the extraction layer to learn a list it never branches on.
      sourceQuality: {
        method: optionalText(sourceQuality.method, "sourceQuality.method", 40),
        removedLines: wholeNumber(sourceQuality.removedLines),
        resumeTruncated: Boolean(sourceQuality.resumeTruncated)
      }
    }
  };

  if (JSON.stringify(normalized).length > MAX_REQUEST_LENGTH) throw new BridgeError("PAYLOAD_TOO_LARGE", "The AI request is too large. Shorten the CV or job description.", 413);
  return normalized;
}

export function parseAgentEvidence(value, request) {
  const result = object(value, "Provider output must be a JSON object.");
  const overview = object(result.overview, "overview must be an object.");
  // A missing list is an omission, not a corrupt reply. Four of the selectable
  // models have no structured-output mode and follow the schema only because the
  // prompt shows it, so rejecting the whole analysis because one list of eight was
  // absent discarded a call the user had already paid for. Empty is checked at the
  // end instead: an answer with nothing in any of them is the real failure.
  const list = (value) => (Array.isArray(value) ? value : []);
  const requirements = list(result.requirements);
  const strengths = list(result.strengths);
  const gaps = list(result.gaps);
  const risks = list(result.risks);
  const profileRisks = list(result.profileRisks);
  const resumeTailoring = list(result.resumeTailoring);
  const interviewFocus = list(result.interviewFocus);
  const uncertainties = list(result.uncertainties);
  const suggestedActions = list(result.suggestedActions);
  if (![requirements, strengths, gaps, risks, profileRisks, resumeTailoring, interviewFocus, uncertainties, suggestedActions].some((items) => items.length)) {
    invalid("Provider returned an analysis with no findings of any kind.");
  }
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
    statedConditions: parseStatedConditions(result.statedConditions, request),
    overview: {
      jobFocus: outputText(overview.jobFocus, "overview.jobFocus", FIELD_LIMITS.narrative),
      candidatePositioning: outputText(overview.candidatePositioning, "overview.candidatePositioning", FIELD_LIMITS.narrative),
      fitNarrative: outputText(overview.fitNarrative, "overview.fitNarrative", FIELD_LIMITS.narrative),
      levelComparison: parseLevelComparison(overview.levelComparison),
      evidence: parseEvidenceList(overview.evidence, request, "overview.evidence", RESULT_LIMITS.overviewEvidence)
    },
    requirements: trim(requirements, "requirements").map((item) => parseRequirement(item, request)),
    screening: parseScreening(result.screening, request),
    strengths: trim(strengths, "strengths").map((item) => parseCitedItem(item, request, "strength")),
    gaps: trim(gaps, "gaps").map((item) => parseSeverityItem(item, request, "gap")),
    risks: trim(risks, "risks").map((item) => parseSeverityItem(item, request, "risk")),
    profileRisks: parseProfileRisks(profileRisks, request),
    resumeTailoring: trim(resumeTailoring, "resumeTailoring").map((item) => parseTailoringItem(item, request)),
    interviewFocus: trim(interviewFocus, "interviewFocus").map((item) => parseInterviewItem(item, request)),
    uncertainties: trim(uncertainties, "uncertainties").map((item) => {
      const uncertainty = object(item, "Each uncertainty must be an object.");
      return {
        type: outputText(uncertainty.type, "uncertainty.type", FIELD_LIMITS.shortLabel),
        // Defaults to the employer: a question wrongly filed there is merely one you
        // need not send, while a CV gap hidden under "ask them" is never acted on.
        answeredBy: ANSWERED_BY.has(uncertainty.answeredBy) ? uncertainty.answeredBy : "employer",
        message: outputText(uncertainty.message, "uncertainty.message", FIELD_LIMITS.prose),
        evidence: parseEvidenceList(uncertainty.evidence, request, "uncertainty.evidence", RESULT_LIMITS.evidencePerItem)
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
  if (!text) throw new BridgeError("OUTPUT_EMPTY", "Provider returned no text at all.");
  if (text.startsWith("```")) {
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    if (stripped.startsWith("{")) return stripped;
  }
  // Take the outermost braces even when the text already starts with one: returning
  // early there handled a model that talks before the JSON but not one that talks
  // after it, which is the more common habit on the models with no structured-output
  // mode to hold them to it.
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
    // effort and decisiveFactor are additive: a model that omits them has still
    // answered the question the panel exists for, so they must not be able to
    // take the verdict down with them.
    const effort = EFFORT_LEVELS.has(value.effort) ? value.effort : null;
    return {
      verdict,
      headline: outputText(value.headline, "recommendation.headline", FIELD_LIMITS.headline),
      rationale: outputText(value.rationale, "recommendation.rationale", FIELD_LIMITS.rationale),
      ...(effort ? { effort } : {}),
      effortNote: softText(value.effortNote, FIELD_LIMITS.note),
      decisiveFactor: softText(value.decisiveFactor, FIELD_LIMITS.note)
    };
  } catch {
    return null;
  }
}

/** Same tolerance as the recommendation axes: additive, never fatal. */
function parseLevelComparison(value) {
  if (!value || typeof value !== "object" || !LEVEL_DIRECTIONS.has(value.direction)) return null;
  return { direction: value.direction, note: softText(value.note, FIELD_LIMITS.note) };
}

/**
 * For fields that enrich an answer rather than constitute it: an over-long or
 * malformed value becomes empty, never an exception. text() throwing here would
 * discard a whole paid analysis over an ornament.
 */
function softText(value, maxLength) {
  if (typeof value !== "string") return "";
  const normalized = withoutBlockIds(value);
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

/** Conditions the employer stated. Anything unrecognisable is dropped, not guessed. */
function parseStatedConditions(value, request) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, RESULT_LIMITS.statedConditions).flatMap((item) => {
    if (!item || typeof item !== "object" || !CONDITION_TYPES.has(item.type)) return [];
    try {
      return [{
        type: item.type,
        // Tolerated, like every other added axis: a model that omits it has still
        // reported the employer's sentence, which is the part that matters.
        stance: CONDITION_STANCES.has(item.stance) ? item.stance : "unclear",
        statement: outputText(item.statement, "statedCondition.statement", FIELD_LIMITS.prose),
        question: softText(item.question, FIELD_LIMITS.question),
        evidence: parseEvidenceList(item.evidence, request, "statedCondition.evidence", RESULT_LIMITS.evidencePerItem)
      }];
    } catch {
      return [];
    }
  });
}

const TERM_PRESENCE = new Set(["verbatim", "variant", "absent"]);
const TITLE_DIRECTIONS = new Set(["same", "adjacent", "distant"]);

/**
 * Whether the CV's wording will survive a keyword search, kept separate from whether
 * the candidate can do the job.
 *
 * Tolerant in both halves independently: a model that returns usable terms and a
 * malformed title comparison should lose the title comparison only. Absent entirely
 * is a valid reply — four of the selectable models predate this field.
 */
function parseScreening(value, request) {
  if (!value || typeof value !== "object") return null;
  const terms = (Array.isArray(value.terms) ? value.terms : []).slice(0, RESULT_LIMITS.screeningTerms).flatMap((item) => {
    if (!item || typeof item !== "object" || !TERM_PRESENCE.has(item.presence)) return [];
    try {
      return [{
        term: outputText(item.term, "screening.term", FIELD_LIMITS.shortLabel),
        presence: item.presence,
        cvWording: softText(item.cvWording, FIELD_LIMITS.shortLabel),
        evidence: parseEvidenceList(item.evidence, request, "screening.evidence", RESULT_LIMITS.evidencePerItem)
      }];
    } catch {
      return [];
    }
  });
  const title = value.titleMatch;
  const titleMatch = title && typeof title === "object" && TITLE_DIRECTIONS.has(title.direction)
    ? { direction: title.direction, note: softText(title.note, FIELD_LIMITS.note) }
    : null;
  return terms.length || titleMatch ? { titleMatch, terms } : null;
}

/**
 * Red flags in the CV itself. Unrecognisable items are dropped, never guessed at.
 *
 * Same tolerance as statedConditions rather than the same strictness as gaps: this
 * list arrived after four of the selectable models had shipped, so a model that
 * malforms one entry has still produced the rest of a paid analysis, and throwing it
 * away over the newest field would be the wrong trade.
 */
function parseProfileRisks(value, request) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, RESULT_LIMITS.profileRisks).flatMap((item) => {
    if (!item || typeof item !== "object" || !GAP_SEVERITIES.has(item.severity)) return [];
    try {
      return [{
        title: outputText(item.title, "profileRisk.title", FIELD_LIMITS.name),
        severity: item.severity,
        summary: outputText(item.summary, "profileRisk.summary", FIELD_LIMITS.prose),
        howToAddress: softText(item.howToAddress, FIELD_LIMITS.prose),
        evidence: parseEvidenceList(item.evidence, request, "profileRisk.evidence", RESULT_LIMITS.evidencePerItem)
      }];
    } catch {
      return [];
    }
  });
}

function parseRequirement(value, request) {
  const requirement = object(value, "Each requirement must be an object.");
  const level = text(requirement.level, "requirement.level", 20);
  const match = text(requirement.match, "requirement.match", 20);
  if (!REQUIREMENT_LEVELS.has(level) || !MATCH_STATES.has(match)) throw new BridgeError("OUTPUT_UNTRUSTED", "Provider returned an invalid requirement state.");
  // Tolerated rather than required: a model that omits the newer axes has still
  // produced a usable comparison, and rejecting it would discard a paid call.
  const screening = SCREENING_ROLES.has(requirement.screening) ? requirement.screening : null;
  const recency = RECENCY_STATES.has(requirement.recency) ? requirement.recency : null;
  return {
    name: outputText(requirement.name, "requirement.name", FIELD_LIMITS.name),
    level,
    ...(screening ? { screening } : {}),
    match,
    ...(recency ? { recency } : {}),
    evidence: parseEvidenceList(requirement.evidence, request, "requirement.evidence", RESULT_LIMITS.evidencePerItem),
    explanation: outputText(requirement.explanation, "requirement.explanation", FIELD_LIMITS.prose)
  };
}

function parseCitedItem(value, request, label) {
  const item = object(value, `Each ${label} must be an object.`);
  return {
    title: outputText(item.title, `${label}.title`, FIELD_LIMITS.name),
    summary: outputText(item.summary, `${label}.summary`, FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, `${label}.evidence`, RESULT_LIMITS.evidencePerItem)
  };
}

function parseSeverityItem(value, request, label) {
  const item = object(value, `Each ${label} must be an object.`);
  const severity = text(item.severity, `${label}.severity`, 20);
  if (!GAP_SEVERITIES.has(severity)) throw new BridgeError("OUTPUT_UNTRUSTED", `Provider returned an invalid ${label} severity.`);
  return {
    title: outputText(item.title, `${label}.title`, FIELD_LIMITS.name),
    severity,
    summary: outputText(item.summary, `${label}.summary`, FIELD_LIMITS.prose),
    ...(CLOSABILITY.has(item.closable) ? { closable: item.closable } : {}),
    howToClose: softText(item.howToClose, FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, `${label}.evidence`, RESULT_LIMITS.evidencePerItem)
  };
}

function parseTailoringItem(value, request) {
  const item = object(value, "Each resumeTailoring item must be an object.");
  return {
    target: outputText(item.target, "resumeTailoring.target", FIELD_LIMITS.name),
    recommendation: outputText(item.recommendation, "resumeTailoring.recommendation", FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, "resumeTailoring.evidence", RESULT_LIMITS.evidencePerItem)
  };
}

function parseInterviewItem(value, request) {
  const item = object(value, "Each interviewFocus item must be an object.");
  return {
    question: outputText(item.question, "interviewFocus.question", FIELD_LIMITS.question),
    rationale: outputText(item.rationale, "interviewFocus.rationale", FIELD_LIMITS.prose),
    evidence: parseEvidenceList(item.evidence, request, "interviewFocus.evidence", RESULT_LIMITS.evidencePerItem)
  };
}

function parseAction(value, request) {
  const item = object(value, "Each suggested action must be an object.");
  const priority = text(item.priority, "suggestedActions.priority", 30);
  if (!ACTION_PRIORITIES.has(priority)) throw new BridgeError("OUTPUT_UNTRUSTED", "Provider returned an invalid action priority.");
  return {
    action: outputText(item.action, "suggestedActions.action", FIELD_LIMITS.prose),
    priority,
    evidence: parseEvidenceList(item.evidence, request, "suggestedActions.evidence", RESULT_LIMITS.evidencePerItem)
  };
}

/**
 * Resolves each reference to the source block it names, dropping any that does not
 * resolve — that is what stops the model inventing support for a claim.
 *
 * An empty list is not an error. minItems is stripped from the wire schema like
 * every other constraint keyword, so a reply with "evidence": [] is schema-valid,
 * and rejecting it discarded the analysis while an INVENTED ref sailed through to
 * the same empty array. Punishing the honest shape and passing the dishonest one
 * is exactly backwards, so both now land on [].
 */
function parseEvidenceList(value, request, label, maxItems) {
  const evidence = Array.isArray(value) ? value : [];
  return evidence.slice(0, maxItems).flatMap((item) => {
    try {
      const parsed = parseEvidence(item, request);
      return parsed ? [parsed] : [];
    } catch {
      return [];
    }
  });
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
  // Every remaining provider is a direct API call, so a key is always required.
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

/**
 * A required string coming back FROM a provider.
 *
 * Same as text() except that over-long is trimmed rather than refused. The wire
 * schema has maxLength stripped out — strict modes reject the keyword — so the
 * provider is never told these ceilings and cannot be blamed for exceeding one.
 * Refusing then threw away a whole paid analysis because a single explanation ran
 * long, which is the one outcome the limits exist to avoid. Lists already trim;
 * strings now behave the same way.
 */
function outputText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new BridgeError("SCHEMA_INVALID", `${label} is required.`);
  const normalized = withoutBlockIds(value);
  if (!normalized) throw new BridgeError("SCHEMA_INVALID", `${label} is required.`);
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

/**
 * Removes CV-001 / JD-004 citations from prose the reader sees.
 *
 * The reader is never shown the block list, so an ID in a sentence is noise in an
 * alphabet that may not even be theirs — "（JD-001）" in the middle of a Chinese
 * explanation. The prompt asks models not to do this and they mostly comply, which
 * is exactly the problem: a rule that holds most of the time still ships the defect,
 * and only this layer can stop it. Grounding is unaffected — refs travel in the
 * evidence arrays, which is what parseEvidence resolves.
 */
function withoutBlockIds(value) {
  return String(value)
    .replace(/[（(\[【]\s*(?:CV|JD)-\d{3}(?:\s*[,、;；]\s*(?:CV|JD)-\d{3})*\s*[）)\]】]/g, "")
    .replace(/\s*(?:CV|JD)-\d{3}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:，。；：])/g, "$1")
    .trim();
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return text(value, label, maxLength);
}

/**
 * A count from our own capture, normalised rather than refused.
 *
 * Nothing branches on the exact number beyond a threshold, so a missing or absurd
 * value should degrade to "nothing to report" instead of failing a request the user
 * is about to pay for.
 */
function wholeNumber(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, 100000) : 0;
}

function arrayOfText(value, label, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) throw new BridgeError("SCHEMA_INVALID", `${label} must be a short list.`);
  return value.map((item) => text(item, label, maxLength));
}

function invalid(message) {
  throw new BridgeError("OUTPUT_UNTRUSTED", message);
}
