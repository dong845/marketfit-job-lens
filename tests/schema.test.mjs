import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_EVIDENCE_SCHEMA, BridgeError, FIELD_LIMITS, RESULT_LIMITS, extractJsonText, parseAgentEvidence, parseJsonOutput, parseTaskRequest } from "../src/ai/schema.js";
import { MODELS } from "../src/ai/models.js";

/**
 * The evidence and result-shape layer, independent of any provider.
 *
 * These lived in the bridge suite and were nearly lost with it when the CLI route
 * was removed — including the regression for a verbose reply being rejected
 * instead of trimmed, which had cost a user a paid analysis.
 */

function apiRequest(provider = "openai-api", options = {}) {
  // options doubles as the model/language pair for provider-specific prompt checks.
  return parseTaskRequest({
    requestId: "test-request-1",
    taskType: "analyze_job",
    provider,
    privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    options,
    input: {
      resumeText: "Built Python services and improved reliability by 28%.",
      job: { title: "Engineer", description: "Python required. Improve service reliability." },
      candidate: { targetRole: "Engineer", workAuthorization: "authorized", languages: ["English C1"] }
    }
  });
}

function validEvidence() {
  return {
    overview: {
      jobFocus: "The role focuses on reliable Python services.",
      candidatePositioning: "The resume shows directly relevant service work.",
      fitNarrative: "The candidate has cited Python and reliability evidence for the stated role.",
      evidence: [
        { ref: "CV-001" },
        { ref: "JD-001" }
      ]
    },
    requirements: [{
      name: "Python",
      level: "required",
      match: "strong",
      evidence: [
        { ref: "CV-001" },
        { ref: "JD-001" }
      ],
      explanation: "The resume names relevant production work."
    }],
    strengths: [{
      title: "Service delivery evidence",
      summary: "The resume cites a measurable reliability improvement.",
      evidence: [{ ref: "CV-001" }]
    }],
    gaps: [{
      title: "Production scope",
      severity: "unknown",
      summary: "The job asks for reliability work but does not state service scale.",
      evidence: [{ ref: "JD-001" }]
    }],
    risks: [{
      title: "Role context needs verification",
      severity: "unknown",
      summary: "The supplied job text has limited operational context.",
      evidence: [{ ref: "JD-001" }]
    }],
    resumeTailoring: [{
      target: "Reliability outcome",
      recommendation: "Place the cited 28% reliability result near the Python service experience.",
      evidence: [{ ref: "CV-001" }]
    }],
    interviewFocus: [{
      question: "How did you improve service reliability?",
      rationale: "The role explicitly names reliability and the resume cites an outcome.",
      evidence: [{ ref: "JD-001" }, { ref: "CV-001" }]
    }],
    uncertainties: [{
      type: "scope",
      message: "Clarify the current service scale.",
      evidence: [{ ref: "JD-001" }]
    }],
    suggestedActions: [{
      action: "Ask about the production environment before applying.",
      priority: "before_apply",
      evidence: [{ ref: "JD-001" }]
    }]
  };
}

test("agent evidence resolves evidence block IDs to local quotes", () => {
  const request = apiRequest();
  const evidence = validEvidence();
  const parsed = parseAgentEvidence(evidence, request);
  assert.equal(parsed.overview.evidence[0].source, "resume");
  assert.match(parsed.overview.evidence[0].quote, /Built Python services/);
  assert.equal(parsed.overview.evidence[0].ref, "CV-001");
});

test("agent evidence drops fabricated evidence IDs without rejecting the full result", () => {
  const request = apiRequest();
  const evidence = validEvidence();
  evidence.requirements[0].evidence.unshift({ ref: "JD-999" });
  const parsed = parseAgentEvidence(evidence, request);
  assert.equal(parsed.requirements[0].evidence.length, 2);
  assert.equal(parsed.requirements[0].evidence.some((item) => item.ref === "JD-999"), false);
});

test("agent evidence rejects an incomplete full-CV/JD analysis", () => {
  const evidence = validEvidence();
  delete evidence.overview;
  assert.throws(() => parseAgentEvidence(evidence, apiRequest()), (error) => error instanceof BridgeError && error.code === "SCHEMA_INVALID");
});

test("agent evidence preserves narrative sections when one optional citation is invalid", () => {
  const evidence = validEvidence();
  evidence.resumeTailoring[0].evidence[0] = { ref: "CV-999" };
  const parsed = parseAgentEvidence(evidence, apiRequest());
  assert.equal(parsed.resumeTailoring[0].target, "Reliability outcome");
  assert.equal(parsed.resumeTailoring[0].evidence.length, 0);
});

test("a verbose reply is trimmed to the caps, not rejected", () => {
  // Regression: the wire schema strips maxItems for strict/structured modes, so
  // the model is not told the caps. Enforcing them by throwing meant a user paid
  // for an analysis and got "Provider output exceeds the allowed result size".
  const cite = [{ ref: "CV-001" }];
  const many = (count, build) => Array.from({ length: count }, (_, index) => build(index));
  const oversized = {
    ...validEvidence(),
    requirements: many(RESULT_LIMITS.requirements + 15, (i) => ({ name: `R${i}`, level: "required", match: "gap", evidence: cite, explanation: "x" })),
    strengths: many(RESULT_LIMITS.strengths + 10, (i) => ({ title: `S${i}`, summary: "s", evidence: cite })),
    suggestedActions: many(RESULT_LIMITS.suggestedActions + 10, (i) => ({ action: `A${i}`, priority: "now", evidence: cite }))
  };
  const parsed = parseAgentEvidence(oversized, parseTaskRequest(apiRequest("openai-api")));
  assert.equal(parsed.requirements.length, RESULT_LIMITS.requirements);
  assert.equal(parsed.strengths.length, RESULT_LIMITS.strengths);
  assert.equal(parsed.suggestedActions.length, RESULT_LIMITS.suggestedActions);
  // Trimming keeps the leading items, which is the order the model prioritised.
  assert.equal(parsed.requirements[0].name, "R0");
});

test("an over-long string is trimmed to the cap, not thrown away with the analysis", () => {
  // Same regression as the list caps, one layer down: maxLength is stripped from the
  // wire schema too, so the provider is never told these ceilings. Rejecting a reply
  // for exceeding one lost the whole paid analysis over a single verbose sentence.
  const evidence = validEvidence();
  evidence.requirements[0].explanation = "x".repeat(FIELD_LIMITS.prose + 500);
  evidence.overview.fitNarrative = "y".repeat(FIELD_LIMITS.narrative + 500);
  const parsed = parseAgentEvidence(evidence, apiRequest());
  assert.equal(parsed.requirements[0].explanation.length, FIELD_LIMITS.prose);
  assert.equal(parsed.overview.fitNarrative.length, FIELD_LIMITS.narrative);
  // An empty or missing string is still a real error, not something to invent.
  evidence.requirements[0].explanation = "";
  assert.throws(() => parseAgentEvidence(evidence, apiRequest()), BridgeError);
});

test("an empty evidence array is accepted, exactly like one full of unresolvable refs", () => {
  // These were opposite: [] was rejected outright while an invented ref resolved to
  // [] and passed. That punished the honest shape and rewarded the fabricated one.
  const withEmpty = validEvidence();
  withEmpty.requirements[0].evidence = [];
  withEmpty.overview.evidence = [];
  const parsed = parseAgentEvidence(withEmpty, apiRequest());
  assert.deepEqual(parsed.requirements[0].evidence, []);
  assert.deepEqual(parsed.overview.evidence, []);
  assert.equal(parsed.requirements[0].name, "Python");

  const withFabricated = validEvidence();
  withFabricated.requirements[0].evidence = [{ ref: "CV-999" }];
  assert.deepEqual(parseAgentEvidence(withFabricated, apiRequest()).requirements[0].evidence, []);
});

test("the effort, decisive factor and level comparison survive, and never take the verdict down with them", () => {
  const request = apiRequest();
  const evidence = validEvidence();
  evidence.recommendation = { verdict: "stretch", headline: "h", rationale: "r", effort: "evening", effortNote: "Rewrite the C++ bullet.", decisiveFactor: "Ship a public C++ example." };
  evidence.overview.levelComparison = { direction: "step_up", note: "Owns a pipeline rather than a component." };
  const parsed = parseAgentEvidence(evidence, request);
  assert.equal(parsed.recommendation.effort, "evening");
  assert.equal(parsed.recommendation.decisiveFactor, "Ship a public C++ example.");
  assert.equal(parsed.overview.levelComparison.direction, "step_up");

  // A model that omits or mangles the additive axes has still answered the question
  // the panel exists for, so the verdict must survive them.
  const degraded = validEvidence();
  degraded.recommendation = { verdict: "weak_fit", headline: "h", rationale: "r", effort: "sometime", effortNote: 42, decisiveFactor: "z".repeat(5000) };
  degraded.overview.levelComparison = { direction: "sideways", note: "" };
  const fallback = parseAgentEvidence(degraded, request);
  assert.equal(fallback.recommendation.verdict, "weak_fit");
  assert.equal(fallback.recommendation.effort, undefined);
  assert.equal(fallback.recommendation.effortNote, "");
  assert.equal(fallback.recommendation.decisiveFactor.length, FIELD_LIMITS.note);
  assert.equal(fallback.overview.levelComparison, null);
});

test("JSON is recovered whether the model talks before it or after it", () => {
  const body = '{"ok":true}';
  assert.equal(extractJsonText(`Here you go:\n${body}`), body);
  assert.equal(extractJsonText(`${body}\n\nLet me know if you want it in another format.`), body);
  assert.equal(extractJsonText("```json\n" + body + "\n```"), body);
});

test("the caps the model is told match the caps applied to its reply", () => {
  const schema = AGENT_EVIDENCE_SCHEMA;
  for (const key of ["requirements", "strengths", "gaps", "risks", "resumeTailoring", "interviewFocus", "uncertainties", "suggestedActions"]) {
    assert.equal(schema.properties[key].maxItems, RESULT_LIMITS[key], `${key} cap drifted between schema and parser`);
  }
});

test("the shape is described to the model, not just demanded of it", async () => {
  // Four of the eight selectable models have no structured-output mode, and the
  // strict-mode retry strips the schema from the request for the ones that do. The
  // system policy tells every model to "match the supplied schema", so the schema
  // has to actually be supplied somewhere that always travels.
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const prompt = buildAnalyzePrompt(apiRequest("deepseek-api", { model: "deepseek-v4-flash", language: "zh" }));
  assert.match(prompt, /<output_schema>/);
  for (const field of ["recommendation", "statedConditions", "requirements", "suggestedActions", "levelComparison"]) {
    assert.ok(prompt.includes(`"${field}"`), `the schema in the prompt omits ${field}`);
  }
  assert.match(prompt, /"enum":\["strong_fit","worth_applying","stretch","weak_fit"\]/);
  // DeepSeek's json_object mode documents that the prompt must contain the word.
  assert.match(prompt, /\bjson\b/);
  assert.equal(prompt.includes("session-test-api-key-123"), false, "credentials must never reach the prompt");
});

test("one omitted list does not throw away the whole analysis", () => {
  // Without structured output a model follows the schema only because the prompt
  // shows it, and it will sometimes drop an empty section entirely. That is an
  // omission, not a corrupt reply, and the call was already billed.
  const partial = validEvidence();
  for (const key of ["risks", "resumeTailoring", "interviewFocus", "uncertainties", "suggestedActions", "strengths", "gaps"]) delete partial[key];
  const parsed = parseAgentEvidence(partial, apiRequest());
  assert.equal(parsed.requirements.length, 1);
  assert.deepEqual(parsed.risks, []);
  assert.deepEqual(parsed.suggestedActions, []);

  // But an answer with nothing in any list is a failure, not an empty analysis.
  const hollow = validEvidence();
  for (const key of ["requirements", "strengths", "gaps", "risks", "resumeTailoring", "interviewFocus", "uncertainties", "suggestedActions"]) hollow[key] = [];
  assert.throws(() => parseAgentEvidence(hollow, apiRequest()), (error) => error.code === "OUTPUT_UNTRUSTED");
});

test("effort is defined by the kind of work, not by a duration guess", async () => {
  // It came back "one evening" almost every time: quick was written as a clock
  // reading ("under thirty minutes") and evening had no criterion at all, so it was
  // an unanchored middle, and a middle is what a model settles on. The levels are
  // now separated by what closing the gaps actually requires.
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const prompt = buildAnalyzePrompt(apiRequest());
  assert.match(prompt, /closable=before_apply/, "effort must be derived from the gaps already listed");
  assert.match(prompt, /rewording, reordering or surfacing something the CV already contains/);
  assert.match(prompt, /Do not settle on evening as a middle default/);
  // strong_fit means the required areas are evidenced, so the work is wording.
  assert.match(prompt, /alongside a strong_fit verdict is a contradiction/);
});

test("CV conventions come from the posting's location, not from a selector", async () => {
  // The target-market selector was inert: an A/B run with NL and US against the same
  // posting produced the same three tailoring items and not one word about market
  // convention. The market that decides how a CV should read is the employer's, and
  // the posting always states it — so there was nothing to ask the user for.
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  // Built with a location, because that is the input the rule reads. The instruction
  // is only sent when there is one — its own closing clause used to tell the model to
  // omit the item without a location, which is a structural fact the request can
  // settle rather than 678 characters of asking.
  const prompt = buildAnalyzePrompt(parseTaskRequest({
    requestId: "conv-1", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    input: { resumeText: "Built Python services.", job: { title: "E", location: "Leiden, NL", description: "Python required." }, candidate: {} }
  }));
  assert.match(prompt, /read it from job\.location/);
  assert.match(prompt, /exactly one resumeTailoring item about convention/);
  // Omitting beats inventing: a convention that does not differ is not advice.
  assert.match(prompt, /omit the item rather than inventing one/);
  assert.match(prompt, /never turn this into a statement about visa or immigration policy/);
  assert.equal(/targetMarket/.test(prompt), false, "the selector is gone; nothing may still reference it");
});

test("every list is defined against the one it is confused with", async () => {
  // Placement errors come from undefined boundaries, not from the model. "Ask the
  // employer" filled up with CV gaps because nothing said what did NOT belong there.
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const prompt = buildAnalyzePrompt(apiRequest());
  assert.match(prompt, /A strength is not a requirement scored strong/);
  assert.match(prompt, /A risk is not a gap/);
  assert.match(prompt, /An interview topic is not an employer question/);
  assert.match(prompt, /Positioning does not mention the posting/);
  // And one rule for the case where two lists both fit.
  assert.match(prompt, /put it in the one the reader would act on first/);
});

test("the prose rules name the constructions to avoid, not just a tone", async () => {
  // "Write naturally" is unactionable. These are the specific tells: stacked hedges,
  // nominalised verbs, empty intensifiers, and advice that would fit any candidate.
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const prompt = buildAnalyzePrompt(apiRequest());
  assert.match(prompt, /if it would be equally true for a different candidate/);
  assert.match(prompt, /Do not hedge in stacks/);
  assert.match(prompt, /Do not nominalise a verb into a noun phrase/);
  assert.match(prompt, /Do not restate the question before answering/);
});

/**
 * Input quality reaches the model, because absence is the failure mode: a requirement
 * the filter removed and one the posting never had are the same silence, and the
 * second gets reported as a finding.
 */
test("source quality is normalised rather than trusted or refused", () => {
  const request = parseTaskRequest({
    requestId: "q-1", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    input: {
      resumeText: "Built Python services.",
      job: { title: "Engineer", description: "Python required." },
      candidate: {},
      sourceQuality: { method: "manual_paste", removedLines: "17", resumeTruncated: 1 }
    }
  });
  assert.deepEqual(request.input.sourceQuality, { method: "manual_paste", removedLines: 17, resumeTruncated: true });
});

test("a nonsense or absent count degrades to nothing to report, never to a failed run", () => {
  const build = (sourceQuality) => parseTaskRequest({
    requestId: "q-2", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    input: { resumeText: "Built Python services.", job: { title: "E", description: "Python required." }, candidate: {}, sourceQuality }
  }).input.sourceQuality;
  // The user has already paid by the time this runs; a bad count must not cost them the call.
  assert.equal(build({ removedLines: -4 }).removedLines, 0);
  assert.equal(build({ removedLines: NaN }).removedLines, 0);
  assert.equal(build({ removedLines: 1e9 }).removedLines, 100000);
  assert.deepEqual(build(undefined), { method: "", removedLines: 0, resumeTruncated: false });
});

test("the prompt carries a caveat only where one exists", async () => {
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const promptFor = (sourceQuality) => buildAnalyzePrompt(parseTaskRequest({
    requestId: "q-3", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    input: { resumeText: "Built Python services.", job: { title: "E", description: "Python required." }, candidate: {}, sourceQuality }
  }));

  // Each caveat exists to stop one silence being reported as a finding.
  assert.match(promptFor({ resumeTruncated: true }), /cut at a length limit/);
  assert.match(promptFor({ removedLines: 26 }), /26 lines of page furniture/);
  assert.match(promptFor({ method: "manual_paste" }), /pasted by the candidate/);

  // And silence when the inputs arrived whole: a caveat on every run teaches the
  // reader to skip caveats, and the prompt already forbids hedging in stacks.
  const clean = promptFor({ method: "schema_org_jsonld", removedLines: 3, resumeTruncated: false });
  assert.equal(/cut at a length limit|page furniture were removed|pasted by the candidate/.test(clean), false);
  assert.equal(/cut at a length limit/.test(promptFor(undefined)), false, "an older caller sending nothing must still build a prompt");
});

test("CV red flags are parsed, capped, and never fatal", () => {
  const risk = (title) => ({ title, severity: "moderate", summary: "s", howToAddress: "Say the true thing.", evidence: [{ ref: "CV-001" }] });
  const parse = (profileRisks) => parseAgentEvidence({ ...validEvidence(), profileRisks }, apiRequest());

  const parsed = parse([risk("Gap"), risk("Tenure")]);
  assert.equal(parsed.profileRisks.length, 2);
  assert.equal(parsed.profileRisks[0].howToAddress, "Say the true thing.");
  assert.equal(parsed.profileRisks[0].evidence[0].source, "resume");

  assert.equal(parse(Array.from({ length: 12 }, (_, i) => risk(`R${i}`))).profileRisks.length, RESULT_LIMITS.profileRisks);

  // Additive, never fatal — the list shipped after four selectable models did, so a
  // malformed entry must cost the entry rather than the paid analysis around it.
  const survived = parse([{ title: "no severity", summary: "s", evidence: [] }, risk("Real")]);
  assert.deepEqual(survived.profileRisks.map((item) => item.title), ["Real"]);
  assert.equal(survived.requirements.length > 0, true, "the rest of the analysis must survive");
  assert.deepEqual(parse(undefined).profileRisks, [], "a model that omits the field has still answered");
});

test("the prompt separates a CV red flag from the two lists it is confused with", async () => {
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const prompt = buildAnalyzePrompt(apiRequest());
  assert.match(prompt, /does not compare the CV against this posting/);
  // The fence that matters most: this is the list most likely to drift into inferring
  // things about a person from their name, age or where they studied.
  assert.match(prompt, /Never infer a profile risk from a name, a nationality/);
  assert.match(prompt, /An empty profileRisks list is a correct answer/);
});

test("wording coverage is parsed independently of the capability judgement", () => {
  const parsed = parseAgentEvidence({
    ...validEvidence(),
    screening: {
      titleMatch: { direction: "distant", note: "Engineer versus Analyst." },
      terms: [
        { term: "Python", presence: "verbatim", cvWording: "", evidence: [{ ref: "CV-001" }] },
        { term: "Kubernetes", presence: "absent", cvWording: "", evidence: [{ ref: "JD-001" }] },
        { term: "bad", presence: "not-a-state", cvWording: "", evidence: [] }
      ]
    }
  }, apiRequest());
  assert.equal(parsed.screening.titleMatch.direction, "distant");
  // The unparseable term goes; the ones around it stay.
  assert.deepEqual(parsed.screening.terms.map((item) => item.term), ["Python", "Kubernetes"]);
  // A requirement scored strong beside a term marked absent is the pairing this
  // section exists to expose, so nothing may reconcile the two.
  assert.equal(parsed.requirements[0].match, "strong");
});

test("half a screening section is better than none, and none is not an error", () => {
  const parse = (screening) => parseAgentEvidence({ ...validEvidence(), screening }, apiRequest()).screening;
  assert.equal(parse({ titleMatch: { direction: "same", note: "Identical." }, terms: [] }).terms.length, 0);
  assert.equal(parse({ titleMatch: { direction: "same", note: "Identical." }, terms: [] }).titleMatch.direction, "same");
  assert.equal(parse({ titleMatch: { direction: "nonsense" }, terms: [{ term: "Go", presence: "absent", cvWording: "", evidence: [] }] }).titleMatch, null);
  assert.equal(parse(undefined), null);
  assert.equal(parse({ titleMatch: null, terms: [] }), null);
  assert.equal(parse({ terms: Array.from({ length: 30 }, () => ({ term: "T", presence: "absent", cvWording: "", evidence: [] })) }).terms.length, RESULT_LIMITS.screeningTerms);
});

/**
 * Every rule the prompt is responsible for, pinned by a phrase that only it carries.
 *
 * A slimming pass shrinks a file and reports a smaller number, and the number is not
 * evidence: bytes can move, merge or vanish and the diff is too large to review by
 * eye. This is the check that a rule which stopped being sent fails a test instead of
 * quietly changing what the analysis says.
 */
const ALWAYS_SENT = [
  ["list placement", /which list it CANNOT belong to/],
  ["anti-generic test", /equally true for a different candidate/],
  ["no hedge stacks", /Do not hedge in stacks/],
  ["knockout definition", /A knockout is a condition a recruiter can check without judgement/],
  ["required is not a knockout", /do NOT by themselves make a skill a knockout/],
  ["verdict from screening", /Set recommendation.verdict from screening roles/],
  ["effort from gaps", /Set recommendation.effort from the gaps you just listed/],
  ["quick is expected", /quick is the expected answer/],
  ["level comparison", /Set overview.levelComparison/],
  ["recency", /set recency from the CV's own dates/],
  ["gap closability", /Every gap needs closable and howToClose/],
  ["tailoring honesty", /must never: add a skill or tool the CV does not evidence/],
  ["vocabulary alignment", /add a tailoring item naming both wordings/],
  ["profile risk definition", /does not compare the CV against this posting/],
  ["profile risk trait fence", /Never infer a profile risk from a name, a nationality/],
  ["profile risk may be empty", /An empty profileRisks list is a correct answer/],
  ["screening vs requirements", /the two are meant to disagree/],
  ["absent is about the document", /absent is a statement about the document/],
  ["title distance", /Set screening.titleMatch/],
  ["conditions reported", /report the employer's own statement in statedConditions/],
  ["condition stance", /Set each stated condition's stance/],
  ["condition typing", /Type each stated condition by what the sentence is about/],
  ["condition question", /the one question whose answer settles it/],
  ["no odds", /never state odds or probabilities/],
  ["who answers", /Every open question must say who holds the answer/],
  ["thin CV entries are yours", /Never file a thin CV entry under employer/],
  ["one to-do list", /suggestedActions is the single authoritative to-do list/],
  ["screening feeds the plan", /a screening term the CV states in other words must appear there exactly once/],
  ["block IDs stay out of prose", /Block IDs belong in the evidence arrays and nowhere else/],
  ["caps", /Prefer fewer, well-evidenced items over padding/]
];

test("no rule leaves the prompt, whatever the inputs", async () => {
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  // The sparsest possible request: no declared status, no location, whole inputs.
  const prompt = buildAnalyzePrompt(apiRequest());
  for (const [name, pattern] of ALWAYS_SENT) {
    assert.match(prompt, pattern, `the ${name} rule is no longer sent`);
  }
});

test("the two conditional rules travel exactly when they apply", async () => {
  const { buildAnalyzePrompt } = await import("../src/ai/prompts.js");
  const build = (candidate, location) => buildAnalyzePrompt(parseTaskRequest({
    requestId: "c-1", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    input: { resumeText: "Built Python services.", job: { title: "E", location, description: "Python required." }, candidate }
  }));
  const COMPARISON = /candidate.workAuthorization is what the candidate said about themselves/;
  const CONVENTIONS = /The market whose CV conventions matter is the employer's/;

  // unknown is the markup's default and workAuthorization.js treats it as nothing to
  // say, so a comparison instruction on that run has nothing to compare.
  assert.equal(COMPARISON.test(build({ workAuthorization: "unknown" }, "")), false);
  assert.equal(COMPARISON.test(build({}, "")), false);
  assert.match(build({ workAuthorization: "needs_sponsorship" }, ""), COMPARISON);

  // The conventions rule itself ends by saying to omit the item without a location.
  assert.equal(CONVENTIONS.test(build({}, "")), false);
  assert.match(build({}, "Leiden, NL"), CONVENTIONS);

  // Neither condition may take the other's rule down with it.
  assert.match(build({ workAuthorization: "authorized" }, "Leiden, NL"), COMPARISON);
  assert.match(build({ workAuthorization: "authorized" }, "Leiden, NL"), CONVENTIONS);
});

test("no model's output budget is smaller than the longest answer the schema allows", () => {
  // The schema's caps multiply out to a worst-case answer size. A budget below it
  // means the longest legal reply cannot fit — and the result is not a shorter
  // analysis, it is a JSON object cut off mid-write that parses as nothing, on a run
  // billed in full. Several budgets sat under this line and the symptom reached
  // users as "the AI replied, but not with a usable analysis", which points at the
  // model rather than at the arithmetic here.
  const widest = (node) => {
    if (!node || typeof node !== "object") return 0;
    if (node.type === "string") return node.maxLength ?? (node.enum ? Math.max(...node.enum.map((v) => v.length)) : 40);
    if (node.type === "array") return (node.maxItems ?? 8) * widest(node.items);
    if (node.type === "object") return Object.values(node.properties || {}).reduce((sum, p) => sum + widest(p) + 20, 0);
    return 0;
  };
  // ~3.2 characters per token is a deliberately conservative divisor: it OVERstates
  // the token count, so the check errs towards demanding more headroom, not less.
  const ceilingTokens = Math.round(widest(AGENT_EVIDENCE_SCHEMA) / 3.2);
  for (const [id, model] of Object.entries(MODELS)) {
    assert.ok(
      model.maxOutputTokens >= ceilingTokens,
      `${id}: budget ${model.maxOutputTokens} is below the schema's ${ceilingTokens}-token worst case — a full-length answer would be truncated`
    );
  }
});

test("an answer cut off partway says so, instead of blaming the model", () => {
  // These are different failures with different fixes, and collapsing them sent
  // people to try another model for something no model would have fixed.
  //
  // The cases below are the reason this reads the error's POSITION rather than its
  // wording: the same cut-off object reports "Unterminated string", "Unexpected end
  // of JSON input" or "Expected ',' or '}'" depending only on which byte it stopped
  // after. Matching the sentence caught the first two shapes and missed the rest.
  const truncated = {
    "mid-string": '{"overview":{"jobFocus":"the role foc',
    "after a key": '{"overview":{"jobFocus":',
    "after an inner object closed": '{"overview":{"jobFocus":"x"}, "requirements":[{"name":"y"',
    "inside an array": '{"a":1,"requirements":[{"name":"P"},{"name":',
    "inside an unclosed fence": '```json\n{"overview":{"jobFocus":"x"'
  };
  for (const [shape, text] of Object.entries(truncated)) {
    assert.throws(() => parseJsonOutput(text), (error) => error.code === "OUTPUT_TRUNCATED", `cut ${shape}`);
  }

  // Not JSON at all, and JSON that is malformed in the middle rather than at the
  // end, both remain the untrusted-output case: those are not size problems and
  // must not tell the reader to shorten the posting.
  for (const text of ["I am unable to analyse this posting.", '{"a":,"b":2}']) {
    assert.throws(() => parseJsonOutput(text), (error) => error.code === "OUTPUT_UNTRUSTED", text.slice(0, 20));
  }

  // Prose around a complete object is still recovered rather than failed.
  assert.deepEqual(parseJsonOutput('Here is the analysis:\n{"a":1}'), { a: 1 });
});
