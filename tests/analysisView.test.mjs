import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, renderAnalysisHtml } from "../src/ui/analysisView.js";

function evidenceFixture(overrides = {}) {
  const cite = [{ source: "resume", quote: "Built 4D cine MRI reconstruction in PyTorch" }];
  return {
    overview: {
      jobFocus: "Reconstruction engineering for clinical throughput.",
      candidatePositioning: "Directly relevant reconstruction experience.",
      fitNarrative: "PyTorch and C++ are both evidenced.",
      evidence: cite
    },
    requirements: [
      { name: "Kubernetes", level: "preferred", match: "strong", evidence: cite, explanation: "Preferred and evidenced." },
      { name: "C++", level: "required", match: "partial", evidence: cite, explanation: "Mentioned without project depth." },
      { name: "FDA submissions", level: "required", match: "gap", evidence: cite, explanation: "Not present in the CV." },
      { name: "PyTorch", level: "required", match: "strong", evidence: cite, explanation: "Named directly." }
    ],
    strengths: [{ title: "Reconstruction depth", summary: "Cites a 28% improvement.", evidence: cite }],
    gaps: [{ title: "Regulatory", severity: "material", summary: "No submission experience.", evidence: cite }],
    risks: [{ title: "Scope", severity: "unknown", summary: "Clinical scope unstated.", evidence: cite }],
    resumeTailoring: [{ target: "Summary", recommendation: "Lead with the outcome.", evidence: cite }],
    interviewFocus: [{ question: "How did you cut scan time?", rationale: "The CV cites it.", evidence: cite }],
    uncertainties: [{ type: "sponsorship", message: "Confirm sponsorship.", evidence: cite }],
    suggestedActions: [
      { action: "Read the team's papers.", priority: "later", evidence: cite },
      { action: "Ask about sponsorship.", priority: "now", evidence: cite },
      { action: "Rewrite the summary.", priority: "before_apply", evidence: cite }
    ],
    ...overrides
  };
}

test("unmet required work sorts above satisfied and preferred work", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "en");
  // Read the rendered names rather than searching the whole document: every item
  // carries the same evidence quote, so a bare indexOf finds the quote instead.
  const rendered = [...html.matchAll(/requirement-name">([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(rendered, ["FDA submissions", "C++", "PyTorch", "Kubernetes"]);
});

test("actions follow the model's own priority, not its array order", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "en");
  const rendered = [...html.matchAll(/<li class="action">[\s\S]*?<p>([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(rendered, ["Ask about sponsorship.", "Rewrite the summary.", "Read the team&#039;s papers."]);
});

test("match state drives both the tag and the row accent", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "en");
  assert.match(html, /class="requirement tone-bad"/);   // gap
  assert.match(html, /class="requirement tone-warn"/);  // partial
  assert.match(html, /class="requirement tone-ok"/);    // strong
  assert.match(html, /<span class="tag tag-bad">Not met<\/span>/);
});

test("source quotes are never printed, on either surface", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "en");
  assert.equal(html.includes("Built 4D cine MRI reconstruction in PyTorch"), false, "quotes must not be rendered");
  assert.equal(html.includes("blockquote"), false);
  assert.equal(html.includes("<details"), false);
  // The analysis itself is unaffected.
  assert.match(html, /FDA submissions/);
  assert.match(html, /Requirements/);
});

test("an empty requirement list explains itself instead of rendering a blank card", () => {
  const html = renderAnalysisHtml(evidenceFixture({ requirements: [] }), "en");
  assert.match(html, /The model returned no specific requirements/);
});

test("sections with no items are omitted rather than left as empty headings", () => {
  const html = renderAnalysisHtml(evidenceFixture({ strengths: [], risks: [], uncertainties: [] }), "en");
  assert.equal(html.includes("Your strongest evidence"), false);
  // Both members of the verify group are empty, so the group heading goes too.
  assert.equal(html.includes("Check before applying"), false);
  assert.ok(html.includes("Prepare"), "a group with surviving members must remain");
});

test("Chinese renders section headings and status labels, not English fallbacks", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "zh");
  assert.match(html, /岗位要求/);
  assert.match(html, /接下来做什么/);
  assert.match(html, /缺口/);
  assert.equal(html.includes("Do this next"), false);
});

test("model-supplied text cannot inject markup", () => {
  const injection = '<img src=x onerror="alert(1)">';
  const html = renderAnalysisHtml(evidenceFixture({
    requirements: [{ name: injection, level: "required", match: "gap", evidence: [{ source: "job", quote: injection }], explanation: injection }],
    strengths: [{ title: injection, summary: injection, evidence: [] }]
  }), "en");
  assert.equal(html.includes("<img"), false);
  // "onerror=" survives inside the escaped text, which is fine — what must not
  // survive is an attribute the browser would parse, i.e. one with a real quote.
  assert.equal(/onerror="/.test(html), false);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("escapeHtml covers every character that can break out of markup", () => {
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#039;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("the verdict leads, so the apply decision is answerable without scrolling", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    recommendation: { verdict: "stretch", headline: "Worth applying once the C++ bullet is specific.", rationale: "Two of three required areas are evidenced." }
  }), "en");
  assert.ok(html.indexOf("verdict") < html.indexOf("Requirements"), "the verdict must come before the detail");
  assert.match(html, /class="result-card verdict tone-warn"/);
  assert.match(html, /Fix gaps first/);
  assert.match(html, /Worth applying once the C\+\+ bullet is specific\./);
  // The disclaimer used to sit between the verdict and the substance, spending the
  // reader's best attention on small print.
  assert.ok(html.indexOf("analysis-note") > html.indexOf("Requirements"), "the disclaimer belongs after the analysis");
});

test("each verdict maps to its own tone", () => {
  const tone = (verdict) => renderAnalysisHtml(evidenceFixture({
    recommendation: { verdict, headline: "h", rationale: "r" }
  }), "en").match(/result-card verdict tone-(\w+)/)[1];
  assert.equal(tone("strong_fit"), "ok");
  assert.equal(tone("worth_applying"), "go", "it must be distinguishable from strong_fit at a glance");
  assert.equal(tone("stretch"), "warn");
  assert.equal(tone("weak_fit"), "bad");
});

test("a missing verdict is explained, not silently dropped", () => {
  // The user paid for an analysis; the one thing they came for cannot just vanish.
  const html = renderAnalysisHtml(evidenceFixture({ recommendation: null }), "en");
  assert.match(html, /returned no overall verdict/);
  assert.match(html, /Requirements/);
});

test("a gap carries the way to close it", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    gaps: [{ title: "Regulatory", severity: "material", summary: "Absent from the CV.", howToClose: "Surface the verification documents you already wrote.", evidence: [] }]
  }), "en");
  assert.match(html, /How to close it:/);
  assert.match(html, /Surface the verification documents you already wrote\./);
});

test("dropping the display does not drop the grounding that produced it", async () => {
  // The model must still cite real CV-nnn / JD-nnn blocks, and every reference is
  // resolved back to actual source text — an unresolvable one is discarded. That
  // is what stops it inventing quotes, and it is independent of rendering them.
  const { parseAgentEvidence, parseTaskRequest } = await import("../src/ai/schema.js");
  const request = parseTaskRequest({
    requestId: "t", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-key-1234" },
    options: { model: "gpt-5-mini", language: "en" },
    input: { resumeText: "Built PyTorch reconstruction for clinical imaging systems.", job: { description: "PyTorch required. C++ required." }, candidate: {} }
  });
  const base = {
    recommendation: { verdict: "stretch", headline: "h", rationale: "r" },
    overview: { jobFocus: "a", candidatePositioning: "b", fitNarrative: "c", evidence: [{ ref: "CV-001" }, { ref: "JD-001" }] },
    requirements: [{ name: "PyTorch", level: "required", match: "strong", evidence: [{ ref: "CV-001" }], explanation: "x" }],
    strengths: [], gaps: [], risks: [], resumeTailoring: [], interviewFocus: [], uncertainties: [], suggestedActions: []
  };
  const real = parseAgentEvidence(base, request);
  assert.equal(real.requirements[0].evidence[0].source, "resume");
  assert.ok(request.input.resumeText.includes(real.requirements[0].evidence[0].quote), "a resolved ref must be literal source text");

  // A reference to a block that does not exist is discarded, not trusted.
  const invented = parseAgentEvidence({
    ...base,
    requirements: [{ name: "PyTorch", level: "required", match: "strong", evidence: [{ ref: "CV-999" }], explanation: "x" }]
  }, request);
  assert.deepEqual(invented.requirements[0].evidence, [], "an unresolvable citation must be dropped");
});

test("a hard filter sorts above everything and is labelled", () => {
  // Missing a knockout ends the application regardless of the rest of the list.
  const html = renderAnalysisHtml(evidenceFixture({
    requirements: [
      { name: "PyTorch", level: "required", screening: "weighted", match: "strong", recency: "current", evidence: [], explanation: "Evidenced." },
      { name: "EU work authorization", level: "required", screening: "knockout", match: "gap", recency: "undated", evidence: [], explanation: "Not evidenced." }
    ]
  }), "en");
  const names = [...html.matchAll(/requirement-name">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(names, ["EU work authorization", "PyTorch"]);
  assert.match(html, /Hard filter/);
});

test("dated and undated CV evidence is surfaced, because a screener checks it", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    requirements: [{ name: "C++", level: "required", screening: "weighted", match: "strong", recency: "dated", evidence: [], explanation: "Named." }]
  }), "en");
  assert.match(html, /dated in your CV/);
});

test("conditions the employer stated render above the analysis", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    statedConditions: [{ type: "sponsorship", statement: "We are unable to provide visa sponsorship for this position.", evidence: [] }]
  }), "en");
  assert.match(html, /unable to provide visa sponsorship/);
  assert.ok(html.indexOf("Conditions the employer states") < html.indexOf("Requirements"),
    "a sponsorship line can make the fit question moot, so it cannot sit below the fold");
  assert.match(html, /Check it against your own situation/);
});

test("a gap with no honest pre-application fix says so instead of inventing one", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    gaps: [{ title: "510(k) submissions", severity: "material", summary: "Absent.", closable: "not_before_apply", howToClose: "Say plainly in the cover letter which parts of the process you have seen.", evidence: [] }]
  }), "en");
  assert.match(html, /Cannot be closed before applying:/);
  assert.equal(html.includes("How to close it:"), false);
});

test("open questions are split by who can answer them, under headings that say so", () => {
  // The field was named uncertainties, the system policy asked for uncertainty, and
  // the panel titled it "Ask the employer". Three sources disagreed and the model
  // followed the name, so the section filled up with gaps in the reader's own CV —
  // filed under a heading telling them to send it to a hiring manager, who cannot
  // possibly know what they built at a previous job.
  const evidence = evidenceFixture({
    uncertainties: [
      { type: "Team size", answeredBy: "employer", message: "How many engineers are on the reconstruction team today?", evidence: [] },
      { type: "Scope of the Huawei role", answeredBy: "you", message: "Say what you built there and whether it shipped; 11 months with no detail reads as a blank.", evidence: [] },
      { type: "On-call", message: "Is there an on-call rotation for this role?", evidence: [] }
    ]
  });
  const html = renderAnalysisHtml(evidence, "en");
  assert.match(html, /What to ask them/);
  assert.match(html, /What your CV leaves unanswered/);
  // Each item sits under exactly one heading, and on the correct side of the split.
  const askIndex = html.indexOf("What to ask them");
  const cvIndex = html.indexOf("What your CV leaves unanswered");
  assert.ok(html.indexOf("How many engineers") > askIndex && html.indexOf("How many engineers") < cvIndex);
  assert.ok(html.indexOf("11 months with no detail") > cvIndex);
  // An item with no audience is a question for them, not silently dropped.
  assert.ok(html.indexOf("on-call rotation") > askIndex && html.indexOf("on-call rotation") < cvIndex);

  // Every heading states its direction, because two of these were read backwards.
  const zh = renderAnalysisHtml(evidence, "zh");
  assert.match(zh, /他们会问你什么/);
  assert.match(zh, /你该问他们什么/);
  assert.match(zh, /你的简历没说清楚的地方/);
});

test("a section with nothing on its side of the split is omitted", () => {
  const onlyEmployer = renderAnalysisHtml(evidenceFixture({
    uncertainties: [{ type: "Team size", answeredBy: "employer", message: "How big is the team?", evidence: [] }]
  }), "en");
  assert.match(onlyEmployer, /What to ask them/);
  assert.equal(onlyEmployer.includes("What your CV leaves unanswered"), false);
});

test("the coverage bar shows the counted requirements and claims nothing more", () => {
  // A single "87% match" would need a weight for a partial match, and any weight
  // would be invented. The bar is the three counts drawn to scale — same data as the
  // line beneath it, readable without being read, and no number that is not counted.
  const html = renderAnalysisHtml(evidenceFixture({
    recommendation: { verdict: "stretch", headline: "h", rationale: "r" },
    requirements: [
      { name: "A", level: "required", match: "strong", explanation: "x", evidence: [] },
      { name: "B", level: "required", match: "partial", explanation: "x", evidence: [] },
      { name: "C", level: "required", match: "gap", explanation: "x", evidence: [] },
      { name: "D", level: "required", match: "no_evidence", explanation: "x", evidence: [] },
      { name: "E", level: "preferred", match: "no_evidence", explanation: "x", evidence: [] }
    ]
  }), "en");
  assert.match(html, /class="coverage-bar"/);
  // met 1, partial 1, missing 2 — the preferred row is not a required area.
  assert.match(html, /coverage-fill tone-ok" style="flex:1"/);
  assert.match(html, /coverage-fill tone-warn" style="flex:1"/);
  assert.match(html, /coverage-fill tone-bad" style="flex:2"/);
  assert.match(html, /4 required areas · 1 evidenced · 1 partial · 2 missing/);
  // No percentage in the coverage element itself. A figure quoted from the CV — "28%
  // off scan time" — is real; a single match score would not be, because weighting a
  // partial match is a choice nothing in the data supports.
  const coverage = html.slice(html.indexOf('class="coverage"'), html.indexOf("</div>", html.indexOf('class="coverage"')) + 6);
  assert.equal(/\d+\s*%/.test(coverage), false, "a match percentage would be an invented weighting");
  assert.match(coverage, /coverage-bar/);
});

test("a segment with nothing in it is not drawn", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    recommendation: { verdict: "strong_fit", headline: "h", rationale: "r" },
    requirements: [{ name: "A", level: "required", match: "strong", explanation: "x", evidence: [] }]
  }), "en");
  // Scoped to the bar: tone-bad also styles severity tags elsewhere on the page.
  const bar = html.slice(html.indexOf('class="coverage-bar"'), html.indexOf("</div>", html.indexOf('class="coverage-bar"')));
  assert.match(bar, /coverage-fill tone-ok/);
  assert.equal(bar.includes("tone-warn"), false, "an empty segment must not be drawn");
  assert.equal(bar.includes("tone-bad"), false, "an empty segment must not be drawn");
});

/**
 * The caveats have to stay rare to keep working, so both directions are pinned:
 * a limitation that exists must reach the verdict, and one that does not must not
 * print a reassurance nobody asked for.
 */
const withVerdict = (overrides = {}) => evidenceFixture({
  recommendation: { verdict: "worth_applying", headline: "Worth an evening.", rationale: "The core is evidenced." },
  ...overrides
});

test("a truncated CV is disclosed against the verdict, not buried in a stats line", () => {
  const html = renderAnalysisHtml(withVerdict(), "en", {}, { method: "semantic_selector", removedLines: 0, resumeTruncated: true });
  const verdict = html.slice(0, html.indexOf("</section>"));
  assert.match(verdict, /verdict-quality/);
  assert.match(verdict, /60,000 characters/);
  // Above the headline: it qualifies everything below rather than adding a conclusion.
  assert.ok(verdict.indexOf("verdict-quality") < verdict.indexOf("verdict-headline"));
});

test("heavy filtering is disclosed, light filtering is not", () => {
  const heavy = renderAnalysisHtml(evidenceFixture(), "en", {}, { method: "semantic_selector", removedLines: 34, resumeTruncated: false });
  assert.match(heavy, /34 page elements were removed/);
  const light = renderAnalysisHtml(evidenceFixture(), "en", {}, { method: "semantic_selector", removedLines: 4, resumeTruncated: false });
  assert.equal(light.includes("verdict-quality"), false, "routine furniture filtering is not a caveat");
});

test("pasted job text says so, because the analysis cannot see the live page", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "en", {}, { method: "manual_paste", removedLines: 0, resumeTruncated: false });
  assert.match(html, /text you pasted/);
});

test("a clean run carries no caveat at all", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "en", {}, { method: "schema_org_jsonld", removedLines: 2, resumeTruncated: false });
  assert.equal(html.includes("verdict-quality"), false);
  // And an older stored report, written before the field existed, must still render.
  assert.equal(renderAnalysisHtml(evidenceFixture(), "en", {}).includes("verdict-quality"), false);
});

test("the caveat survives a verdict the model failed to return", () => {
  // The no-verdict card is a separate early return, and it is the case where the
  // reader most needs to know what the analysis was working from.
  const html = renderAnalysisHtml(evidenceFixture({ recommendation: null }), "en", {}, { method: "manual_paste", removedLines: 0, resumeTruncated: true });
  assert.match(html, /verdict-quality/);
});

test("caveats are written in the reader's language", () => {
  const html = renderAnalysisHtml(withVerdict(), "zh", {}, { method: "manual_paste", removedLines: 40, resumeTruncated: true });
  // Scoped to the paragraph itself: the fixture's own prose is English, so a looser
  // slice would fail on the sample data rather than on the strings under test.
  const note = html.match(/<p class="verdict-quality">([\s\S]*?)<\/p>/)[1];
  assert.match(note, /只读取了简历的前/);
  assert.match(note, /移除了 40 处元素/);
  assert.match(note, /你粘贴的职位文本/);
  assert.equal(/[A-Za-z]{3,}/.test(note), false, "no English may leak into the Chinese caveat");
});

test("a self-contradicting card keeps both halves and says they disagree", () => {
  const html = renderAnalysisHtml(withVerdict({
    recommendation: { verdict: "strong_fit", headline: "Strong match.", rationale: "Everything is evidenced.", effort: "multi_day" }
  }), "en", {}, null);
  assert.match(html, /analysis-notice/);
  assert.match(html, /verdict and the effort estimate disagree/);
  // Both survive: dropping one would trade a contradiction the reader can weigh for
  // a guess they cannot see.
  assert.match(html, /verdict-word">Apply</);
  assert.match(html, /More than one evening/);
});

test("the work-authorization downgrade suppresses the contradiction it would double up on", () => {
  // That card already tells the reader the verdict above it does not hold; a second
  // caution about the same word is noise at the most-read point on the panel.
  const html = renderAnalysisHtml(withVerdict({
    recommendation: { verdict: "strong_fit", headline: "h", rationale: "r", effort: "multi_day" },
    statedConditions: [{ type: "sponsorship", stance: "requires_existing", statement: "We do not sponsor visas.", evidence: [] }]
  }), "en", { workAuthorization: "needs_sponsorship" }, null);
  assert.match(html, /verdict-override/);
  assert.equal(html.includes("verdict and the effort estimate disagree"), false);
});

test("an implausible hard-filter count qualifies the list it orders", () => {
  const knockout = (name) => ({ name, level: "required", screening: "knockout", match: "gap", explanation: "x", evidence: [] });
  const html = renderAnalysisHtml(withVerdict({
    requirements: [knockout("Clearance"), knockout("Licence"), knockout("PhD"), knockout("Dutch")]
  }), "en", {}, null);
  assert.match(html, /4 requirements are marked hard filters/);
  // Inside the requirements card, where it qualifies how to read that order.
  const card = html.slice(html.indexOf("requirement-list") - 400, html.indexOf("requirement-list"));
  assert.match(card, /analysis-notice/);
});

test("a plan too short for its own gaps admits it", () => {
  const html = renderAnalysisHtml(withVerdict({
    gaps: [
      { title: "A", severity: "material", summary: "s", closable: "before_apply", howToClose: "Surface it.", evidence: [] },
      { title: "B", severity: "moderate", summary: "s", closable: "before_apply", howToClose: "Name it.", evidence: [] }
    ],
    suggestedActions: [{ action: "Rewrite the summary.", priority: "before_apply", evidence: [] }]
  }), "en", {}, null);
  assert.match(html, /2 gaps say they can be closed before applying, but the plan lists 1 actions/);
});

test("ordinary output carries no notices at all", () => {
  const html = renderAnalysisHtml(withVerdict({
    recommendation: { verdict: "worth_applying", headline: "h", rationale: "r", effort: "quick" }
  }), "en", {}, null);
  assert.equal(html.includes("analysis-notice"), false, "a check that cries wolf stops being read");
});

test("CV red flags render with the sentence that answers them", () => {
  const html = renderAnalysisHtml(withVerdict({
    profileRisks: [{
      title: "Fourteen months unaccounted for",
      severity: "moderate",
      summary: "The CV runs from the 2023 role straight to the 2025 one with nothing between them.",
      howToAddress: "Name the period and what you did in it, in one line under the 2025 role.",
      evidence: []
    }]
  }), "en", {}, null);
  assert.match(html, /What a screener may hesitate over/);
  assert.match(html, /Fourteen months unaccounted for/);
  assert.match(html, /What to say about it:/);
  // Between the gaps and the plan: what is missing here, what reads oddly, what to do.
  assert.ok(html.indexOf("Gaps to close") < html.indexOf("What a screener may hesitate over"));
  assert.ok(html.indexOf("What a screener may hesitate over") < html.indexOf("Do this next"));
});

test("a clean CV shows no red-flag section at all", () => {
  // Manufacturing one to fill the field would tell the reader their CV has a problem
  // it does not have, which is worse than the section never appearing.
  const html = renderAnalysisHtml(withVerdict({ profileRisks: [] }), "en", {}, null);
  assert.equal(html.includes("What a screener may hesitate over"), false);
  // And a stored report written before the field existed must still render.
  assert.equal(renderAnalysisHtml(withVerdict(), "en").includes("What a screener may hesitate over"), false);
});

test("a red flag with no honest answer still names itself", () => {
  const html = renderAnalysisHtml(withVerdict({
    profileRisks: [{ title: "Three tenures under a year", severity: "material", summary: "Consecutive short roles.", howToAddress: "", evidence: [] }]
  }), "en", {}, null);
  assert.match(html, /Three tenures under a year/);
  assert.equal(html.includes("What to say about it:"), false);
});

test("wording coverage is shown as states, never as a keyword score", () => {
  const html = renderAnalysisHtml(withVerdict({
    screening: {
      titleMatch: { direction: "adjacent", note: "The posting says Reconstruction Engineer; your CV says Research Engineer." },
      terms: [
        { term: "PyTorch", presence: "verbatim", cvWording: "", evidence: [] },
        { term: "MLOps", presence: "absent", cvWording: "", evidence: [] },
        { term: "CI/CD", presence: "variant", cvWording: "build pipelines", evidence: [] }
      ]
    }
  }), "en", {}, null);
  assert.match(html, /Whether your CV gets read/);
  assert.match(html, /Neighbouring title/);
  assert.match(html, /yours: build pipelines/);
  // A percentage here would need a weight per term, and no weight would be anything
  // but invented — the same reason the verdict shows a bar rather than a figure.
  const card = html.slice(html.indexOf("screening-list"), html.indexOf("</section>", html.indexOf("screening-list")));
  assert.equal(/\d+\s*%/.test(card), false, "a keyword score would be an invented weighting");
  // Absent first, then variant: the order they cost the application.
  const rendered = [...card.matchAll(/screening-word">([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(rendered, ["MLOps", "CI/CD", "PyTorch"]);
});

test("wording sits beside the requirement list it reads the other way", () => {
  const html = renderAnalysisHtml(withVerdict({
    screening: { titleMatch: null, terms: [{ term: "MLOps", presence: "absent", cvWording: "", evidence: [] }] }
  }), "en", {}, null);
  assert.ok(html.indexOf("Requirements") < html.indexOf("Whether your CV gets read"));
  assert.ok(html.indexOf("Whether your CV gets read") < html.indexOf("Where you are strongest"));
});

test("an analysis with no screening section renders without one", () => {
  // Four selectable models predate the field; a reply that omits it is still an analysis.
  assert.equal(renderAnalysisHtml(withVerdict(), "en").includes("Whether your CV gets read"), false);
  assert.equal(renderAnalysisHtml(withVerdict({ screening: { titleMatch: null, terms: [] } }), "en").includes("Whether your CV gets read"), false);
});

test("market notes render the convention text from the table, not from the model", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    marketNotes: [{ conventionId: "nl-motivation-letter", cvStanding: "No letter is mentioned anywhere.", evidence: [] }]
  }), "en");
  assert.match(html, /motivation letter/);
  assert.match(html, /No letter is mentioned anywhere\./);
  // The id is a machine token and must not reach the reader, exactly like a block ID.
  assert.equal(/nl-motivation-letter/.test(html), false);
});

// Every other section on this page is derived from the posting, so a reader has every
// reason to assume this one is too. The line saying otherwise is load-bearing.
test("the market card always says the conventions are not from this posting", () => {
  for (const locale of ["en", "zh"]) {
    const html = renderAnalysisHtml(evidenceFixture({
      marketNotes: [{ conventionId: "cn-venue-names", cvStanding: "The CV names no venue.", evidence: [] }]
    }), locale);
    assert.match(html, locale === "zh" ? /不来自本次招聘启事/ : /do not come from this posting/);
    assert.match(html, locale === "zh" ? /中国内地/ : /mainland China/);
  }
});

test("no market notes means no card at all", () => {
  for (const marketNotes of [[], undefined]) {
    const html = renderAnalysisHtml(evidenceFixture({ marketNotes }), "en");
    assert.equal(/market-list/.test(html), false, JSON.stringify(marketNotes));
  }
});

// The parser drops unknown ids, so this should be unreachable — but the view must not
// render an empty bullet if it ever is.
test("a note whose convention has no entry renders nothing", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    marketNotes: [{ conventionId: "no-such-convention", cvStanding: "Orphaned.", evidence: [] }]
  }), "en");
  assert.equal(/market-list/.test(html), false);
  assert.equal(/Orphaned/.test(html), false);
});

test("the market card sits directly after the screening card", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    marketNotes: [{ conventionId: "nl-references-contacted", cvStanding: "No referees are listed.", evidence: [] }]
  }), "en");
  assert.ok(html.indexOf("screening-list") < html.indexOf("market-list"), "market notes read after the screening terms");
  assert.ok(html.indexOf("market-list") < html.indexOf("finding-list"), "and before the strengths");
});
