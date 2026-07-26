import assert from "node:assert/strict";
import test from "node:test";
import { filterJobText } from "../src/extraction/jobText.js";

/**
 * The filter's contract is asymmetric, and these tests enforce the asymmetry.
 *
 * Leaving noise in costs tokens. Removing a line of the posting changes the answer
 * silently — so the assertions that matter here are the ones about what SURVIVES.
 * Removal rates are checked loosely; survival is checked line by line.
 */

// A posting with the shapes that decide a verdict: a knockout, a dated skill, a
// preferred item, salary, and a sponsorship line phrased as a refusal.
const POSTING = [
  "Senior MRI Reconstruction Engineer",
  "Leiden, Netherlands · Full-time",
  "About Example Health",
  "We build clinical imaging software used in 40 hospitals.",
  "About the role:",
  "You will own the reconstruction pipeline from research prototype to cleared product.",
  "Requirements:",
  "- Expert PyTorch for deep-learning reconstruction.",
  "- Production C++ experience with numerical solvers.",
  "- IEC 62304 regulatory submission experience.",
  "- You must already hold the right to work in the Netherlands; we do not sponsor visas for this role.",
  "Nice to have:",
  "- Kubernetes and CI experience.",
  "Compensation: EUR 75,000 - 95,000 depending on experience.",
  "We are an equal opportunity employer."
];

const PAGE_NOISE = [
  "Skip to main content",
  "Back to jobs",
  "Sign in",
  "We use cookies to improve your experience. Accept all",
  "Apply",
  "Share this job",
  "Save job",
  "Recommended jobs",
  "Create a Job Alert",
  "Interested in building your career at Example Health? Get future opportunities sent straight to your email.",
  "Create alert",
  "Apply for this job",
  "*",
  "indicates a required field",
  "Attach a resume",
  "Dropbox",
  "Your safety matters to us. To protect yourself from potential scams, remember that recruiters only contact you from example.com addresses and will never ask for money.",
  "Voluntary Self-Identification. For government reporting purposes, we ask candidates to identify their race and ethnicity.",
  "© 2026 Example Health. All rights reserved."
];

function noisyPage(posting = POSTING, noise = PAGE_NOISE) {
  // Furniture wraps the posting rather than only trailing it, which is how a page
  // that falls back to <body> actually arrives.
  const half = Math.ceil(noise.length / 3);
  return [...noise.slice(0, half), ...posting, ...noise.slice(half)].join("\n");
}

test("every line of the posting survives the filter", () => {
  const { text } = filterJobText(noisyPage());
  const lost = POSTING.filter((line) => !text.includes(line));
  // The equal-opportunity line is deliberately removable; nothing else is.
  assert.deepEqual(lost, ["We are an equal opportunity employer."]);
});

test("a sponsorship refusal survives even though it reads like boilerplate", () => {
  // This is the line that decides the verdict. It contains "opportunity"-adjacent
  // legalese on many pages, so it has to be protected unconditionally, not by luck.
  for (const line of [
    "You must already hold the right to work in the Netherlands; we do not sponsor visas for this role.",
    "We are an equal opportunity employer and do not provide visa sponsorship.",
    "本岗位不提供签证担保，需要你已具备在荷兰工作的合法身份。",
    "This position requires an active security clearance.",
    "Applicants must hold a valid professional licence."
  ]) {
    const { text } = filterJobText([...PAGE_NOISE, line, ...PAGE_NOISE].join("\n"));
    assert.ok(text.includes(line), `a screening condition was removed: ${line}`);
  }
});

test("page furniture is removed, in both languages", () => {
  const { text, removedLines } = filterJobText(noisyPage());
  for (const junk of ["Back to jobs", "Create a Job Alert", "indicates a required field", "Recommended jobs", "Skip to main content", "Dropbox"]) {
    assert.equal(text.includes(junk), false, `furniture survived: ${junk}`);
  }
  assert.ok(removedLines >= 12, `expected most furniture to go, removed ${removedLines}`);

  const zh = filterJobText([
    "登录", "立即投递", "收藏", "推荐职位", "举报该职位",
    "岗位职责：", "负责 4D cine MRI 重建算法的研发与工程化落地。",
    "任职要求：", "熟悉 PyTorch，具备三年以上深度学习重建经验。", "本岗位不提供签证担保。",
    "平等就业机会：本公司不因种族、性别、年龄区别对待。",
    "查看更多职位", "版权所有 © 2026"
  ].join("\n"));
  assert.match(zh.text, /4D cine MRI 重建/);
  assert.match(zh.text, /三年以上深度学习重建经验/);
  assert.match(zh.text, /不提供签证担保/);
  for (const junk of ["登录", "立即投递", "推荐职位", "举报该职位", "查看更多职位", "平等就业机会"]) {
    assert.equal(zh.text.includes(junk), false, `中文页面元素未被过滤：${junk}`);
  }
});

test("a sentence is never mistaken for a button because it mentions one", () => {
  // "Apply" alone is a control. A requirement that uses the word is not.
  const { text } = filterJobText([
    "Apply",
    "Apply your signal-processing background to clinical reconstruction problems every day.",
    "You will share this job's on-call rotation with two other engineers."
  ].join("\n"));
  assert.equal(text.includes("\nApply\n") || text.startsWith("Apply\n"), false);
  assert.match(text, /Apply your signal-processing background/);
  assert.match(text, /share this job's on-call rotation/);
});

test("what was removed is reported, so over-filtering is visible rather than silent", () => {
  const result = filterJobText(noisyPage());
  assert.ok(result.removedChars > 0);
  assert.equal(result.removed.length > 0, true);
  assert.ok(result.removed.length <= 12, "the sample is bounded for display");
  assert.deepEqual(filterJobText("").removed, []);
  assert.equal(filterJobText(null).text, "");
});

test("a posting with no furniture is passed through unchanged", () => {
  const clean = POSTING.slice(0, -1).join("\n");
  assert.equal(filterJobText(clean).text, clean);
  assert.equal(filterJobText(clean).removedLines, 0);
});

test("filtering is idempotent, so validation sees exactly what the model will", () => {
  // validateCapturedJob re-filters the text it is handed. If a second pass removed
  // anything new, the panel would be judging a different document from the one sent.
  const page = noisyPage();
  const once = filterJobText(page).text;
  assert.equal(filterJobText(once).text, once);
  assert.equal(filterJobText(once).removedLines, 0);
});
