const RETRIEVED_AT = "2026-07-23";
const RULE_EXPIRY = "2026-10-23";
const STAT_EXPIRY = "2026-08-23";

/** @typedef {Object} MarketClaim
 * @property {string} claimId
 * @property {string} jurisdiction
 * @property {'official_rule'|'market_statistic'|'employer_evidence'} category
 * @property {string} claim
 * @property {string} sourceUrl
 * @property {string} effectiveAt
 * @property {string} retrievedAt
 * @property {string} expiresAt
 * @property {'official'|'reported'|'employer'} confidence
 * @property {Object} applicability
 */

const RULES = {
  US: [
    ["US_H1B_LCA", "Sponsored H-1B, H-1B1, and E-3 employment uses a Labor Condition Application process.", "https://flag.dol.gov/programs/lca"],
    ["US_H1B_RIGHTS", "H-1B employment has employer and worker obligations that should be checked from the official source.", "https://www.dol.gov/agencies/whd/workers/h1b"],
    ["US_LABOUR_DATA", "US occupational outlook data is a context signal, not a prediction for an individual application.", "https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm", "market_statistic"]
  ],
  UK: [
    ["UK_SKILLED_WORKER", "A Skilled Worker route needs a qualifying job offer from an approved sponsor and must meet current rules.", "https://www.gov.uk/skilled-worker-visa"],
    ["UK_SPONSOR_REGISTER", "The UK publishes a register of licensed worker sponsors; company registration does not prove a particular role is sponsored.", "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"],
    ["UK_LABOUR_DATA", "UK vacancy statistics are market context only and must be refreshed before public use.", "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/bulletins/jobsandvacanciesintheuk/july2026", "market_statistic"]
  ],
  CA: [
    ["CA_FOREIGN_WORKERS", "Hiring a foreign worker can require an employer process such as an LMIA unless another route applies.", "https://www.canada.ca/en/employment-social-development/services/foreign-workers.html"],
    ["CA_EMPLOYER_PERMIT", "Employer-specific work permits are distinct from open work permits and have different evidence requirements.", "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/employer-specific.html"],
    ["CA_LABOUR_DATA", "Canadian labour statistics are context only and must be refreshed before public use.", "https://www150.statcan.gc.ca/n1/daily-quotidien/260710/dq260710a-eng.htm", "market_statistic"]
  ],
  AU: [
    ["AU_SID_482", "Skills in Demand visa routes have employer nomination and current eligibility requirements.", "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skills-in-demand-visa-subclass-482/core-skills-stream"],
    ["AU_LABOUR_FORCE", "Australian labour-force statistics are market context only and must be refreshed before public use.", "https://www.abs.gov.au/statistics/labour/employment-and-unemployment/labour-force-australia/latest-release", "market_statistic"],
    ["AU_VACANCIES", "Australian job-vacancy statistics are market context only and must be refreshed before public use.", "https://www.abs.gov.au/statistics/labour/jobs/job-vacancies-australia/latest-release", "market_statistic"]
  ],
  NL: [
    ["NL_HSM_RECOGNISED_SPONSOR", "Highly Skilled Migrant applications require an IND-recognised sponsor under the applicable route.", "https://ind.nl/en/residence-permits/work/highly-skilled-migrant"],
    ["NL_RECOGNISED_REGISTER", "The IND publishes a recognised-sponsor register; registry presence does not prove role-level sponsorship willingness.", "https://ind.nl/en/public-register-recognised-sponsors"],
    ["NL_LABOUR_MARKET", "Dutch vacancy statistics are market context only and must be refreshed before public use.", "https://www.cbs.nl/nl-nl/visualisaties/dashboard-arbeidsmarkt/vacatures/", "market_statistic"]
  ],
  SG: [
    ["SG_EP_ELIGIBILITY", "Employment Pass eligibility is governed by current salary and eligibility rules, including COMPASS where applicable.", "https://www.mom.gov.sg/passes-and-permits/employment-pass/eligibility"],
    ["SG_WORK_PASSES", "Singapore work-pass routes and employer obligations must be confirmed from current Ministry of Manpower guidance.", "https://www.mom.gov.sg/en/passes-and-permits"],
    ["SG_FOREIGN_WORKFORCE", "Foreign-workforce rules are market context; they are not a proxy for a candidate's merit.", "https://www.mom.gov.sg/foreign-workforce-framework", "market_statistic"]
  ],
  CN: [
    ["CN_WORK_PERMIT", "Foreign employees generally need an employer-supported work permit and work-type residence process.", "https://www.shanghai.gov.cn/grgzxkgjj/20240924/4bd44aae199d4bf8b6e2a30ef13f8476.html"],
    ["CN_WORK_CATEGORIES", "Foreign work-permit categories and supporting requirements vary; confirm the current local rules for the role.", "https://jnsti.jinan.gov.cn/col97722/art/2025/art_97722_4779299.html"],
    ["CN_LABOUR_DATA", "China labour statistics are market context only and must be refreshed before public use.", "https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260716_1964147.html", "market_statistic"]
  ]
};

export const MARKET_NAMES = Object.freeze({ US: "United States", UK: "United Kingdom", CA: "Canada", AU: "Australia", NL: "Netherlands", SG: "Singapore", CN: "China" });
export const MARKET_IDS = Object.freeze(Object.keys(MARKET_NAMES));

export const MARKET_CLAIMS = Object.freeze(Object.entries(RULES).flatMap(([jurisdiction, items]) => items.map(([claimId, claim, sourceUrl, category = "official_rule"]) => ({
  claimId,
  jurisdiction,
  category,
  claim,
  sourceUrl,
  effectiveAt: RETRIEVED_AT,
  retrievedAt: RETRIEVED_AT,
  expiresAt: category === "market_statistic" ? STAT_EXPIRY : RULE_EXPIRY,
  confidence: category === "official_rule" ? "official" : "reported",
  applicability: { authorizationTypes: ["needs_sponsorship", "student_or_graduate", "temporary_route"] }
}))));

export function getMarketClaims(marketId, now = new Date()) {
  return MARKET_CLAIMS.filter((claim) => claim.jurisdiction === marketId).map((claim) => ({ ...claim, stale: new Date(claim.expiresAt) < now }));
}
