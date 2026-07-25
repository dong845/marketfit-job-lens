import assert from "node:assert/strict";
import test from "node:test";
import { createManualJob, extractJob, hasUsableJobContent, sanitizeCapturedText } from "../src/extraction/extractJob.js";
import { parseTaskRequest } from "../src/ai/schema.js";

test("extracts a Schema.org JobPosting before page-text fallbacks", () => {
  const job = extractJob({
    url: "https://careers.example/jobs/1",
    jsonLd: [JSON.stringify({ "@context": "https://schema.org", "@type": "JobPosting", title: "Platform Engineer", hiringOrganization: { name: "Example" }, jobLocation: { address: { addressLocality: "Amsterdam" } }, description: "<p>About the role: Build reliable services for customers.</p><p>Responsibilities: Own Kubernetes platform reliability, incident response, and production observability.</p><p>Requirements: Kubernetes required. Python required. SQL preferred. Experience with distributed systems, automation, and on-call operations.</p><p>Preferred qualifications: Cloud networking, Terraform, and developer tooling experience.</p>" })],
    text: "Noise"
  });
  assert.equal(job.extraction.method, "schema_org_jsonld");
  assert.equal(job.title, "Platform Engineer");
  assert.equal(job.company, "Example");
  // The model reads sourceText, so the JSON-LD description must survive HTML
  // stripping intact rather than being parsed into fields nothing consumes.
  assert.match(job.sourceText, /Kubernetes required/);
  assert.equal(job.sourceText.includes("<p>"), false);
});

test("falls back to DOM text when JobPosting JSON-LD has no usable description", () => {
  const job = extractJob({
    url: "https://careers.pddglobalhr.com/campus/grad/detail?t=qSPiTb83hh",
    documentTitle: "AI Agent研发工程师 - PDD校园招聘官网",
    jsonLd: [JSON.stringify({ "@context": "https://schema.org", "@type": "JobPosting", title: "AI Agent研发工程师", hiringOrganization: { name: "拼多多集团" }, description: "" })],
    text: [
      "AI Agent研发工程师",
      "岗位职责",
      "1、Agent核心架构开发：负责Agent核心模块、上下文管理、长期短期记忆、工具调用的设计与开发。",
      "2、应用效果调优：主导RAG知识库建设与交互环境构建，持续优化大模型在复杂业务场景下的生成效果。",
      "3、高性能工程链路建设：参与高并发、高可用分布式系统设计，优化Agent及RAG链路的系统性能。",
      "任职要求",
      "1、本科及以上学历，计算机、软件、人工智能、数学等相关专业优先。",
      "2、熟练使用 Python、Java、Go、C++ 中至少一门语言，编程基础扎实。",
      "3、具备 AI 原生思维，熟练使用 Cursor、Claude Code 等 AI 编程工具提效。",
      "4、深入理解 LLM、Agent、RAG 核心原理，熟悉 LangChain、LlamaIndex 等主流框架。",
      "加分项",
      "有大模型应用、智能体或 AI 开源项目核心贡献经验。"
    ].join("\n")
  });
  assert.equal(job.extraction.method, "semantic_selector");
  assert.equal(job.title, "AI Agent研发工程师");
  assert.equal(job.company, "拼多多集团");
  assert.equal(hasUsableJobContent(job), true);
  assert.match(job.sourceText, /岗位职责/);
});

test("recognises Greenhouse, Lever, Workday, and generic SPA adapters", () => {
  const urls = [["https://boards.greenhouse.io/example/jobs/1", "greenhouse_adapter"], ["https://jobs.lever.co/example/1", "lever_adapter"], ["https://example.myworkdayjobs.com/job/1", "workday_adapter"], ["https://example.com/react-spa-job", "generic_spa_adapter"]];
  for (const [url, method] of urls) {
    const job = extractJob({ url, documentTitle: "Data Engineer - Example", text: "Data Engineer\nRequirements: Python required. SQL required. Build data products for customers." });
    assert.equal(job.extraction.method, method);
  }
});

test("noisy page text removes repeated navigation, cookie, and recommended-job content", () => {
  const text = sanitizeCapturedText("Platform Engineer\nAccept all cookies\nRequirements: Python required\nRecommended jobs\nPrivacy policy\nRequirements: Python required\nBuild reliable systems");
  assert.equal(text.includes("cookies"), false);
  assert.equal(text.includes("Recommended"), false);
  assert.equal((text.match(/Python required/g) || []).length, 1);
});

test("empty pages require manual confirmation", () => {
  const job = extractJob({ url: "https://example.com" });
  assert.equal(job.extraction.needsConfirmation, true);
  assert.equal(job.extraction.confidence, 0);
});

test("identity fields are capped at capture, not left to fail request validation", () => {
  // Capture picks these with container-ish selectors ([class*='title'] and friends),
  // so a hero block or an all-offices location list arrives hundreds of characters
  // long. Uncapped, the run died at request validation naming an internal field, and
  // re-opening the editor pre-filled the same value so it could only happen again.
  const job = createManualJob({
    title: "T".repeat(600),
    company: "C".repeat(600),
    location: "Amsterdam, ".repeat(60),
    salary: "S".repeat(600),
    employmentType: "E".repeat(600),
    sourceText: "Requirements:\n- Python required for production services.\n- Kubernetes preferred.\nYou will own reliability for a clinical imaging pipeline and report to the platform lead."
  });
  assert.equal(job.title.length, 240);
  assert.equal(job.company.length, 240);
  assert.equal(job.location.length, 240);
  assert.equal(job.salary.length, 240);
  assert.equal(job.employmentType.length, 120);
  // The parser that used to reject these now accepts the captured job unchanged.
  assert.doesNotThrow(() => parseTaskRequest({
    requestId: "cap-test", taskType: "analyze_job", provider: "openai-api", privacyMode: "provider_cloud",
    credential: { type: "session_api_key", apiKey: "session-test-api-key-123" },
    options: { model: "gpt-5-mini", language: "en" },
    input: { resumeText: "Built Python services.", job: { title: job.title, company: job.company, location: job.location, employmentType: job.employmentType, salary: job.salary, description: job.sourceText }, candidate: {} }
  }));
});
