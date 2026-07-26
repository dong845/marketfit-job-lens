import assert from "node:assert/strict";
import test from "node:test";
import { collectVisibleJobPage } from "../src/extraction/tabCapture.js";
import { extractJob, hasUsableJobContent } from "../src/extraction/extractJob.js";
import { element, installDom } from "./fixtures/domStub.mjs";

/**
 * Runs the extractor that is injected into the job page.
 *
 * Nothing else in the suite executes this function — it is handed to
 * chrome.scripting and only ever runs in a real tab — and that is exactly why it
 * has broken twice. Both failures were invisible to static checks: the code parsed,
 * imported and linted, and threw on its first line inside the page.
 */

const REQUIREMENTS = [
  "Requirements:",
  "Expert PyTorch for deep-learning reconstruction.",
  "Production C++ experience with numerical solvers.",
  "You must already hold the right to work in the Netherlands; we do not sponsor visas.",
  "Responsibilities: you will own the reconstruction pipeline end to end.",
  "Preferred qualifications: Kubernetes, CI, and clinical imaging exposure.",
  "Compensation: EUR 75,000 - 95,000 depending on experience."
];

/** A page shaped like the ones that fall back to broad containers. */
function jobPage() {
  return element("body", {}, [
    element("nav", {}, [element("a", {}, ["Back to jobs"]), element("a", {}, ["All openings"])]),
    element("div", { class: "cookie-banner" }, [element("p", {}, ["We use cookies. Accept all"])]),
    element("main", {}, [
      element("h1", {}, ["Senior MRI Reconstruction Engineer"]),
      element("div", { class: "company-name" }, ["Example Health"]),
      element("div", { class: "job-location" }, ["Leiden, Netherlands"]),
      element("article", { class: "job-description" }, REQUIREMENTS.map((line) => element("p", {}, [line])))
    ]),
    element("aside", { class: "similar-jobs-rail" }, [
      element("h2", {}, ["Similar jobs"]),
      ...Array.from({ length: 8 }, (_, index) => element("a", {}, [`Reconstruction Engineer at Company ${index}`]))
    ]),
    element("div", { "aria-hidden": "true" }, [element("p", {}, ["Hidden SPA template scaffolding that is not the posting."])]),
    element("footer", {}, [element("p", {}, ["© 2026 Example Health. Privacy policy"])]),
    element("script", { type: "application/ld+json" }, ['{"@type":"JobPosting","title":"Senior MRI Reconstruction Engineer"}'])
  ]);
}

test("the injected extractor runs at all", async () => {
  // Regression: NOISE_SELECTOR was a const declared after the function's return, so
  // it never initialised and every capture threw ReferenceError before reading a
  // single node. The panel reported "this page cannot be read yet" for every site.
  const restore = installDom({ body: jobPage() });
  try {
    const snapshot = await collectVisibleJobPage();
    assert.ok(snapshot, "the extractor must return a snapshot");
    assert.ok(snapshot.text.length > 200, `expected real page text, got ${snapshot.text.length} chars`);
    assert.equal(snapshot.url, "https://example.com/jobs/1");
    assert.match(snapshot.jsonLd[0], /JobPosting/);
  } finally {
    restore();
  }
});

test("the posting survives capture, and the furniture around it does not", async () => {
  const restore = installDom({ body: jobPage() });
  try {
    const { text } = await collectVisibleJobPage();
    for (const line of REQUIREMENTS) {
      assert.ok(text.includes(line), `capture lost a line of the posting: ${line}`);
    }
    for (const junk of ["Back to jobs", "Accept all", "Similar jobs", "Reconstruction Engineer at Company 3", "Hidden SPA template", "© 2026"]) {
      assert.equal(text.includes(junk), false, `capture kept page furniture: ${junk}`);
    }
  } finally {
    restore();
  }
});

test("the job title, company and location are picked up for the request", async () => {
  const restore = installDom({ body: jobPage() });
  try {
    const snapshot = await collectVisibleJobPage();
    assert.equal(snapshot.semantic.title, "Senior MRI Reconstruction Engineer");
    assert.equal(snapshot.semantic.company, "Example Health");
    assert.equal(snapshot.semantic.location, "Leiden, Netherlands");
  } finally {
    restore();
  }
});

test("a captured page becomes a job the panel will actually analyse", async () => {
  // The whole path in one go: page -> snapshot -> normalized job -> usability gate.
  // Each stage has its own tests; this is the one that fails when they stop composing.
  const restore = installDom({ body: jobPage() });
  try {
    const job = extractJob(await collectVisibleJobPage());
    assert.equal(hasUsableJobContent(job), true, `capture produced unusable text: ${job.extraction.qualityReasons.join(", ")}`);
    assert.match(job.sourceText, /right to work in the Netherlands/);
    assert.equal(job.title, "Senior MRI Reconstruction Engineer");
    assert.ok(job.extraction.contentFingerprint);
  } finally {
    restore();
  }
});

test("a page with no job description still returns rather than throwing", async () => {
  const restore = installDom({
    body: element("body", {}, [element("nav", {}, ["Home"]), element("main", {}, [element("p", {}, ["Sign in to continue."])])])
  });
  try {
    const snapshot = await collectVisibleJobPage();
    assert.ok(snapshot, "an unusable page must still produce a snapshot, not an exception");
    assert.equal(hasUsableJobContent(extractJob(snapshot)), false);
  } finally {
    restore();
  }
});
