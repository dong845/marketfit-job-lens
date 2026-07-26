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
