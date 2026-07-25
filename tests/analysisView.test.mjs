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
  assert.match(html, /<span class="tag tag-bad">Gap<\/span>/);
});

test("evidence is collapsed behind a counted disclosure", () => {
  const html = renderAnalysisHtml(evidenceFixture(), "en");
  assert.match(html, /<details class="evidence"><summary>Evidence \(1\)<\/summary>/);
  assert.match(html, /Built 4D cine MRI reconstruction in PyTorch/);
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
  assert.match(html, /A stretch/);
  assert.match(html, /Worth applying once the C\+\+ bullet is specific\./);
});

test("each verdict maps to its own tone", () => {
  const tone = (verdict) => renderAnalysisHtml(evidenceFixture({
    recommendation: { verdict, headline: "h", rationale: "r" }
  }), "en").match(/result-card verdict tone-(\w+)/)[1];
  assert.equal(tone("strong_fit"), "ok");
  assert.equal(tone("worth_applying"), "ok");
  assert.equal(tone("stretch"), "warn");
  assert.equal(tone("weak_fit"), "bad");
});

test("an analysis without a verdict still renders everything else", () => {
  const html = renderAnalysisHtml(evidenceFixture({ recommendation: null }), "en");
  assert.equal(html.includes("result-card verdict"), false);
  assert.match(html, /Requirements/);
});

test("a gap carries the way to close it", () => {
  const html = renderAnalysisHtml(evidenceFixture({
    gaps: [{ title: "Regulatory", severity: "material", summary: "Absent from the CV.", howToClose: "Surface the verification documents you already wrote.", evidence: [] }]
  }), "en");
  assert.match(html, /How to close it:/);
  assert.match(html, /Surface the verification documents you already wrote\./);
});

test("the panel omits quotes while the report expands them", () => {
  const panel = renderAnalysisHtml(evidenceFixture(), "en", { showEvidence: false });
  const report = renderAnalysisHtml(evidenceFixture(), "en", { showEvidence: true, evidenceOpen: true });
  assert.equal((panel.match(/class="evidence"/g) || []).length, 0, "the panel must not repeat source text under every point");
  assert.ok((report.match(/class="evidence" open/g) || []).length > 0, "the report keeps them, expanded");
  // The analysis itself is unaffected by dropping the quotes.
  assert.match(panel, /FDA submissions/);
});
