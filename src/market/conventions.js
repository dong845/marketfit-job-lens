/**
 * What a market screens on that the posting does not say.
 *
 * This table is the one thing in the analysis that is not derived from the CV or
 * the posting, and it is deliberately the only one. Every other conclusion the panel
 * shows is traceable to an evidence block; a market convention has nothing to cite,
 * which is why it is written here by a person, dated, and rendered to the reader
 * verbatim rather than restated by the model. The model may say where this CV stands
 * against a convention — that claim cites CV blocks like any other — but it may not
 * author, strengthen or extend the convention itself.
 *
 * Nothing automated can check that an entry is true. `why` and `added` exist so a
 * person can review it. That is why the first batch covers only markets the
 * maintainer applies in, and resolveMarket returns null everywhere else: a wrong
 * market claim looks exactly like a right one on screen, and unlike a wrong
 * requirement the reader has no source text to check it against.
 *
 * Rules for adding an entry:
 *  - No numbers. A statistic here cannot be sourced and must not be invented;
 *    scripts/static-check.mjs fails the build on a digit or a percent sign.
 *  - No protected traits. Age, nationality, country of education, gender and
 *    institutional prestige stay out, exactly as src/ai/prompts.js:14-15 and :77
 *    require of the model.
 *  - No CV layout. Length, photographs and date formatting belong to the market
 *    convention instruction at src/ai/prompts.js:109-111, which produces a
 *    resumeTailoring item. This table is about what the market weighs.
 *  - Nothing already covered elsewhere. Work authorization is absent from nl_weu on
 *    purpose: statedConditions and uncertainties already carry it, and a third
 *    telling is the repetition src/ai/prompts.js:41-53 exists to prevent.
 */

export const MARKET_KEYS = Object.freeze(["cn", "nl_weu"]);

const CONVENTIONS = Object.freeze([
  {
    id: "cn-venue-names",
    market: "cn",
    text: {
      en: "For research and algorithm roles, named conference and journal venues are search terms in their own right — screening filters on the venue string even where the posting prints none of them.",
      zh: "研究与算法岗位上，会议和期刊的名称本身就是检索词——即使招聘启事一个都没写，筛选环节仍会按会议名过滤。"
    },
    appliesWhen: "The role involves research, algorithm development, or modelling work.",
    added: "2026-08-08",
    why: "The posting states the research area; the filter runs on venue strings the posting never prints, so a CV that describes the work without naming where it was published is invisible to it."
  },
  {
    id: "cn-named-internships",
    market: "cn",
    text: {
      en: "For early-career roles, internships at named companies are weighed as their own line rather than folded into general experience.",
      zh: "面向早期职业阶段的岗位，具名公司的实习会被单独作为一栏掂量，而不是并入一般工作经历。"
    },
    appliesWhen: "The posting targets graduates or candidates early in their career.",
    added: "2026-08-08",
    why: "A CV that folds internships into a single experience section reads as thinner than the same history split out, and the split is honest reordering rather than new material."
  },
  {
    id: "cn-verifiable-projects",
    market: "cn",
    text: {
      en: "Verifiable project evidence — public repositories, competition placings, released work — carries part of the load that references carry in Western European hiring.",
      zh: "可验证的项目证据——公开仓库、竞赛名次、已发布的成果——承担了西欧招聘中由推荐人承担的那部分作用。"
    },
    appliesWhen: "The role is technical.",
    added: "2026-08-08",
    why: "The two markets place the burden of proof differently, and a CV written for one leaves the other's proof unstated."
  },
  {
    id: "cn-chinese-cv",
    market: "cn",
    text: {
      en: "A posting written in Chinese generally expects a Chinese-language CV.",
      zh: "以中文撰写的招聘启事，通常期望收到中文简历。"
    },
    appliesWhen: "The posting itself is written in Chinese.",
    added: "2026-08-08",
    why: "Sending an English CV to a Chinese-language posting is a decision, and candidates applying across markets often make it without noticing."
  },
  {
    id: "nl-working-language",
    market: "nl_weu",
    text: {
      en: "\"Dutch is a plus\" often describes a team whose day-to-day working language is Dutch. What the phrase means for this role is a question for the employer, not something to read off the posting.",
      zh: "「会荷兰语者优先」往往描述的是一个日常工作语言就是荷兰语的团队。这句话对本岗位到底意味着什么，应当去问雇主，而不是从启事里读出来。"
    },
    appliesWhen: "The posting mentions Dutch or another local language, or says nothing about working language.",
    added: "2026-08-08",
    why: "The gap between the written requirement and the practice is the whole point, and no amount of re-reading the posting closes it."
  },
  {
    id: "nl-motivation-letter",
    market: "nl_weu",
    text: {
      en: "Most applications are expected to carry a motivation letter even where the posting does not ask for one.",
      zh: "多数申请都被默认附有一封动机信，即使招聘启事并未要求。"
    },
    appliesWhen: "always",
    added: "2026-08-08",
    why: "An omission the posting never flags, and one of the few conventions the candidate can act on the same evening."
  },
  {
    id: "nl-credential-recognition",
    market: "nl_weu",
    text: {
      en: "For regulated roles, formal recognition of a foreign degree is a separate procedure from holding the degree.",
      zh: "在受监管的岗位上，境外学位的对等认证是独立于「持有该学位」之外的一道手续。"
    },
    appliesWhen: "The role is regulated, or requires a specific degree or professional registration.",
    added: "2026-08-08",
    why: "A candidate who holds the degree reads the requirement as met, and the procedure surfaces after an offer rather than before one."
  },
  {
    id: "nl-references-contacted",
    market: "nl_weu",
    text: {
      en: "References are generally contacted in practice at offer stage.",
      zh: "推荐人在发放 offer 的阶段通常会被真的联系。"
    },
    appliesWhen: "always",
    added: "2026-08-08",
    why: "Treated as a formality in some markets and acted on in this one, which is a difference the candidate can prepare for."
  }
]);

const BY_ID = new Map(CONVENTIONS.map((item) => [item.id, item]));

/** The conventions for one market, or an empty list for a key that has none. */
export function conventionsFor(marketKey) {
  return CONVENTIONS.filter((item) => item.market === marketKey);
}

/**
 * One convention by id, or null.
 *
 * ids are globally unique, so the view can resolve a note without being told which
 * market produced it — one fewer value to thread through renderAnalysisHtml, and one
 * fewer place for the market to be recorded inconsistently.
 */
export function conventionById(id) {
  return BY_ID.get(id) || null;
}
