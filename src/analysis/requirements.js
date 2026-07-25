import { cleanText, createEvidenceRef, normalizeText, uniqueBy } from "./schemas.js";
import { containsTerm, SKILL_CATALOG } from "../profile/evidence.js";

const LANGUAGE_TERMS = ["dutch", "english", "mandarin", "chinese", "french", "german", "荷兰语", "英语", "中文", "普通话", "法语", "德语"];
const REQUIRED = /\b(required|must|required qualification|minimum|need to|have to|you have|mandatory)\b|必须|要求|至少|需具备/i;
const PREFERRED = /\b(preferred|nice to have|bonus|plus|advantage)\b|优先|加分|最好/i;
const RESPONSIBILITY = /\b(responsibilit|what you('ll| will) do|you will|own|deliver)\b|职责|负责|工作内容/i;
const BENEFIT = /\b(benefits?|perks?|we offer|compensation|insurance|vacation)\b|福利|待遇|薪酬/i;

/** @typedef {Object} Requirement
 * @property {string} id
 * @property {'required'|'preferred'|'responsibility'|'benefit'|'context'} type
 * @property {string} category
 * @property {string} term
 * @property {string} text
 * @property {'low'|'medium'|'high'} confidence
 * @property {EvidenceRef[]} evidenceRefs
 */

export function extractRequirements(sourceText) {
  const units = splitJobUnits(sourceText);
  const requirements = [];
  for (const unit of units) {
    const type = classifyUnit(unit);
    const terms = extractTerms(unit.text, type);
    for (const term of terms) {
      const termType = classifyUnit({ section: unit.section, text: clauseForTerm(unit.text, term.term) });
      requirements.push({
        id: `req:${requirements.length}:${term.term}`,
        type: termType,
        category: term.category,
        term: term.term,
        text: unit.text,
        confidence: type === "context" ? "low" : "high",
        evidenceRefs: [createEvidenceRef("job", unit.text, { field: unit.section })]
      });
    }
  }
  return uniqueBy(requirements, (item) => `${item.type}:${item.category}:${item.term}`);
}

export function extractSponsorshipState(sourceText) {
  const text = cleanText(sourceText);
  const statements = sentenceList(text).filter((line) => /sponsor|visa|work authori[sz]|right to work|work permit|工签|工作许可/i.test(line));
  const positive = statements.filter((line) => /visa sponsorship (?:is )?(?:available|provided)|will sponsor|sponsorship available|sponsor(?:ship)? support|relocation and visa/i.test(line));
  const negative = statements.filter((line) => /will not sponsor|no (?:visa )?sponsorship|without sponsorship|required to work without sponsorship|unable to sponsor/i.test(line));
  const existingAuthorization = statements.filter((line) => /must (?:already )?(?:be )?(?:authorized|have .*right to work)|right to work .*required|current work authorization|required to work without/i.test(line));
  const evidenceRefs = statements.map((line) => createEvidenceRef("job", line, { field: "visa/work authorization" }));

  if (positive.length && (negative.length || existingAuthorization.length)) return { state: "conflicting_evidence", restrictiveState: negative.length ? "explicit_no_sponsorship" : "existing_authorization_required", evidenceRefs, positive, negative, existingAuthorization };
  if (negative.length) return { state: "explicit_no_sponsorship", restrictiveState: "explicit_no_sponsorship", evidenceRefs, positive, negative, existingAuthorization };
  if (existingAuthorization.length) return { state: "existing_authorization_required", restrictiveState: "existing_authorization_required", evidenceRefs, positive, negative, existingAuthorization };
  if (positive.length) return { state: "explicit_sponsorship", restrictiveState: "explicit_sponsorship", evidenceRefs, positive, negative, existingAuthorization };
  return { state: "ambiguous", restrictiveState: "ambiguous", evidenceRefs, positive, negative, existingAuthorization };
}

export function extractComplianceSensitiveWording(sourceText) {
  const lines = sentenceList(sourceText);
  const rules = [
    { category: "protected_attribute", pattern: /\b(male|female) candidates? only\b|男性优先|女性优先|限男性|限女性/i, claim: "Potential gender-specific wording" },
    { category: "protected_attribute", pattern: /\b(citizens?|nationals?) only\b|只招中国籍|限中国籍/i, claim: "Potential citizenship or nationality-specific wording" },
    { category: "language_necessity", pattern: /\bnative (?:speaker|english) only\b|母语者/i, claim: "Potential native-speaker-only wording" },
    { category: "security_export", pattern: /\b(us person|export control|itar)\b/i, claim: "Security or export-control wording" }
  ];
  return rules.flatMap((rule) => lines.filter((line) => rule.pattern.test(line)).map((line) => ({ ...rule, line })));
}

function splitJobUnits(sourceText) {
  const lines = String(sourceText ?? "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  let section = "Job description";
  const units = [];
  for (const line of lines) {
    if (/^(requirements?|qualifications?|what you bring|preferred qualifications?|responsibilities|what you('ll| will) do|benefits?|福利|职位要求|任职要求|岗位职责|工作内容)\s*:?$/i.test(line)) {
      section = line.replace(/:$/, "");
      continue;
    }
    for (const sentence of sentenceList(line)) units.push({ text: sentence, section });
  }
  return units;
}

function classifyUnit(unit) {
  if (BENEFIT.test(unit.text)) return "benefit";
  if (REQUIRED.test(unit.text)) return "required";
  if (PREFERRED.test(unit.text)) return "preferred";
  if (RESPONSIBILITY.test(unit.text)) return "responsibility";
  if (BENEFIT.test(unit.section)) return "benefit";
  if (PREFERRED.test(unit.section)) return "preferred";
  if (RESPONSIBILITY.test(unit.section)) return "responsibility";
  if (/requirements?|qualifications?|职位要求|任职要求/i.test(unit.section)) return "required";
  return "context";
}

function extractTerms(text, type) {
  const normalized = normalizeText(text);
  const terms = [];
  for (const term of SKILL_CATALOG) {
    if (containsTerm(normalized, term)) terms.push({ term, category: "skill" });
  }
  for (const language of LANGUAGE_TERMS) {
    if (normalized.includes(language)) terms.push({ term: normalizeLanguage(language), category: "language" });
  }
  if (/\b(active )?(?:ts\/sci|secret|top secret|security clearance|baseline clearance|sc clearance)\b/i.test(text)) terms.push({ term: "security clearance", category: "clearance" });
  if (/\b(licen[cs]e|registration|registered nurse|bar admission|professional engineer)\b/i.test(text)) terms.push({ term: "licence or registration", category: "licence" });
  if (/\b(bachelor|master|phd|degree)\b|本科|学士|硕士|博士/i.test(text)) terms.push({ term: "degree", category: "degree" });
  if (/\b\d+\+? years?\b|多年经验/i.test(text)) terms.push({ term: "years of experience", category: "seniority" });
  if (!terms.length && type === "required" && text.length < 220) terms.push({ term: text.slice(0, 120), category: "other" });
  return uniqueBy(terms, (item) => `${item.category}:${item.term}`);
}

function normalizeLanguage(value) {
  const map = { nederlands: "dutch", 荷兰语: "dutch", 英语: "english", 中文: "mandarin", 普通话: "mandarin", 法语: "french", 德语: "german", chinese: "mandarin" };
  return map[value] || value;
}

function sentenceList(value) {
  return String(value ?? "").split(/(?<=[.!?。！？;；])\s*|(?=\s[-*•]\s)/).map((item) => item.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
}

function clauseForTerm(text, term) {
  const clauses = String(text).split(/[;,；，]/).map((item) => item.trim()).filter(Boolean);
  return clauses.find((clause) => containsTerm(normalizeText(clause), term)) || text;
}
