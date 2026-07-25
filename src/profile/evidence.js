import { createEvidenceRef, normalizeText, uniqueBy } from "../analysis/schemas.js";

export const SKILL_CATALOG = Object.freeze([
  "javascript", "typescript", "react", "node", "python", "java", "go", "c++", "sql", "aws", "azure", "gcp", "kubernetes", "docker",
  "machine learning", "ml", "llm", "rag", "ai agent", "multi-agent", "mcp", "langchain", "llamaindex", "pytorch", "tensorflow", "spark", "airflow", "analytics",
  "product", "roadmap", "metrics", "strategy", "stakeholder", "user research", "growth", "experiment", "launch", "pricing",
  "figma", "ux", "ui", "prototype", "usability", "sales", "partnership", "operations", "finance", "consulting", "revenue", "crm"
]);

// These are explicit technical aliases, not fuzzy semantic matching. They let the
// local analysis recognize common CV/JD spellings while keeping each match explainable.
const TERM_ALIASES = Object.freeze({
  javascript: ["javascript", "js", "ecmascript"],
  typescript: ["typescript", "ts"],
  node: ["node", "node.js", "nodejs"],
  go: ["go", "golang"],
  "c++": ["c++", "cpp"],
  aws: ["aws", "amazon web services"],
  gcp: ["gcp", "google cloud", "google cloud platform"],
  kubernetes: ["kubernetes", "k8s"],
  "machine learning": ["machine learning", "machine-learning", "机器学习"],
  ml: ["ml", "machine learning", "机器学习"],
  llm: ["llm", "large language model", "large language models", "大模型", "大型语言模型"],
  rag: ["rag", "retrieval augmented generation", "retrieval-augmented generation", "检索增强生成", "检索增强"],
  "ai agent": ["ai agent", "ai agents", "agent", "agents", "智能体"],
  "multi-agent": ["multi-agent", "multi agent", "多智能体"],
  mcp: ["mcp", "model context protocol"],
  langchain: ["langchain", "lang chain"],
  llamaindex: ["llamaindex", "llama index"],
  pytorch: ["pytorch", "py torch"],
  tensorflow: ["tensorflow", "tensor flow"],
  sql: ["sql", "postgresql", "mysql", "sqlite"],
  ux: ["ux", "user experience", "用户体验"],
  ui: ["ui", "user interface", "用户界面"],
  crm: ["crm", "customer relationship management"]
});

const NEGATION = /\b(no|not|without|lack|lacking|never|cannot|can't|do not have|don't have)\b|未|没有|不具备|不会|无相关/gim;
const LEARNING = /\b(learn(?:ed|ing)?|coursework|course|stud(?:y|ied|ying)|familiar|exposure|beginner)\b|学习|课程|了解|入门/gim;
const APPLIED = /\b(built|developed|shipped|led|owned|managed|designed|implemented|delivered|worked on|created|launched|operated|maintained)\b|负责|开发|搭建|主导|交付|上线|设计/gim;
const OUTCOME = /\b(increased|reduced|improved|grew|saved|achieved|drove)\b|\d+(?:\.\d+)?\s*(?:%|x|k|m)\b|提升|降低|增长|节省|达成/gim;
const HEADING = /^(experience|work experience|projects?|education|skills?|summary|professional experience|经历|工作经历|项目经历|教育|技能|个人简介)\s*:?$/i;

export function extractCandidateEvidence(cvText, requestedTerms = SKILL_CATALOG) {
  const text = String(cvText ?? "");
  const normalized = normalizeText(text);
  const sentences = splitSentences(text);
  const evidence = [];

  for (const term of [...new Set(requestedTerms.map(normalizeText).filter(Boolean))]) {
    const candidates = sentences
      .filter((item) => containsTerm(normalizeText(item.text), term))
      .map((sentence) => candidateFromSentence(term, sentence));
    const selected = selectCandidateEvidence(candidates);
    if (selected) evidence.push(selected);
  }

  return uniqueBy(evidence, (item) => `${item.term}:${item.polarity}`);
}

export function evidenceRefFromCandidate(evidence) {
  return createEvidenceRef("cv", evidence.quote, { field: evidence.section });
}

export function findLanguageEvidence(languages, language) {
  const value = normalizeText(languages);
  const aliases = languageAliases(language);
  return aliases.some((term) => value.includes(term));
}

export function findCvLanguageEvidence(cvText, language) {
  const aliases = languageAliases(language);
  return splitSentences(cvText).find((sentence) => {
    const value = normalizeText(sentence.text);
    const hasLanguage = aliases.some((term) => value.includes(term));
    const languageSignal = /\b(native|fluent|proficient|professional|conversational|speak(?:s|ing)?|[bc][12])\b|母语|流利|熟练|语言/i.test(sentence.text);
    return hasLanguage && (languageSignal || /languages?|语言|技能/i.test(sentence.section));
  }) || null;
}

export function findCvClearanceEvidence(cvText, requirementLine) {
  const specificPattern = /ts\/sci/i.test(requirementLine) ? /ts\/sci/i : /security clearance|baseline clearance|sc clearance|secret|top secret/i;
  const sentence = splitSentences(cvText).find((item) => specificPattern.test(item.text));
  if (!sentence) return null;
  return { ...sentence, isCurrent: /\b(active|current(?:ly)?|hold(?:ing)?)\b|现持有|有效/i.test(sentence.text) };
}

export function findProfileEvidence(text, term) {
  return containsTerm(normalizeText(text), normalizeText(term));
}

function splitSentences(text) {
  const lines = String(text).split(/\n+/);
  let section = "CV/profile";
  let index = 0;
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (HEADING.test(trimmed.replace(/^[-*•]\s*/, ""))) {
      section = trimmed.replace(/:$/, "");
      continue;
    }
    for (const sentence of trimmed.split(/(?<=[.!?。！？])\s+/)) {
      if (sentence.trim()) result.push({ text: sentence.trim(), section, index: index++ });
    }
  }
  return result.length ? result : [{ text: String(text), section, index: 0 }];
}

function candidateFromSentence(term, sentence) {
  const context = sentence.text;
  const lower = normalizeText(context);
  const polarity = NEGATION.test(context) || NEGATION.test(lower) ? "negative" : "positive";
  NEGATION.lastIndex = 0;
  return {
    id: `cv:${term}:${sentence.index}`,
    kind: "skill",
    term,
    polarity,
    level: evidenceLevel(context, polarity),
    quote: context.slice(0, 500),
    section: sentence.section,
    recency: inferRecency(context),
    index: sentence.index
  };
}

function selectCandidateEvidence(candidates) {
  if (!candidates.length) return null;
  const strongPositive = candidates.filter((item) => item.polarity === "positive" && ["applied", "outcome"].includes(item.level));
  const negative = candidates.filter((item) => item.polarity === "negative");
  const bestStrong = chooseMostRecent(strongPositive);
  const bestNegative = chooseMostRecent(negative);
  if (bestStrong && (!bestNegative || isLater(bestStrong, bestNegative))) return bestStrong;
  if (bestNegative) return bestNegative;
  return chooseMostRecent(candidates);
}

function chooseMostRecent(items) {
  return items.reduce((best, item) => !best || isLater(item, best) ? item : best, null);
}

function isLater(left, right) {
  const leftYear = Number.parseInt(left.recency, 10) || 0;
  const rightYear = Number.parseInt(right.recency, 10) || 0;
  if (leftYear !== rightYear) return leftYear > rightYear;
  if (left.index !== right.index) return left.index > right.index;
  return evidenceRank(left.level) > evidenceRank(right.level);
}

function evidenceRank(level) {
  return { mentioned: 0, learning: 1, applied: 2, outcome: 3 }[level] ?? 0;
}

function evidenceLevel(text, polarity) {
  if (polarity === "negative") return "mentioned";
  if (OUTCOME.test(text)) {
    OUTCOME.lastIndex = 0;
    return "outcome";
  }
  OUTCOME.lastIndex = 0;
  if (APPLIED.test(text)) {
    APPLIED.lastIndex = 0;
    return "applied";
  }
  APPLIED.lastIndex = 0;
  if (LEARNING.test(text)) {
    LEARNING.lastIndex = 0;
    return "learning";
  }
  LEARNING.lastIndex = 0;
  return "mentioned";
}

export function containsTerm(text, term) {
  const normalizedText = normalizeText(text);
  return termVariants(term).some((variant) => containsLiteralTerm(normalizedText, variant));
}

function termVariants(term) {
  const normalized = normalizeText(term);
  return [...new Set([normalized, ...(TERM_ALIASES[normalized] || [])].map(normalizeText).filter(Boolean))];
}

function containsLiteralTerm(text, term) {
  if (!term) return false;
  if (term === "go" || term === "golang") return containsGoLanguage(text);
  if (/^[a-z0-9+#. ]+$/.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundaryCharacters = term.includes(".") ? "a-z0-9+#." : "a-z0-9+#";
    return new RegExp(`(^|[^${boundaryCharacters}])${escaped}($|[^${boundaryCharacters}])`, "i").test(text);
  }
  return text.includes(term);
}

function containsGoLanguage(text) {
  return /(^|[\s,;/:、(（])go(?:lang)?(?=$|[,;/:、+.)）]|\s*[/,:;+]|\s+(?:language|languages|required|preferred|experience|skills?|开发|编程|后端|服务))/i.test(text);
}

function inferRecency(text) {
  const match = text.match(/\b(20\d{2}|\d+\s*(?:years?|months?))\b/i);
  return match?.[1] || "";
}

function languageAliases(language) {
  const value = normalizeText(language);
  const map = {
    dutch: ["dutch", "nederlands", "荷兰语"],
    english: ["english", "英语"],
    mandarin: ["mandarin", "chinese", "中文", "普通话"],
    french: ["french", "français", "法语"],
    german: ["german", "deutsch", "德语"]
  };
  return map[value] || [value];
}
