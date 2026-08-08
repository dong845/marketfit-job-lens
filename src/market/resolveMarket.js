import { MARKET_KEYS } from "./conventions.js";

/**
 * Which hiring market this posting belongs to, or nothing.
 *
 * Reads job.location and nothing else. The market whose conventions matter is the
 * employer's, and the posting states it — the same principle already in force for CV
 * format convention at src/ai/prompts.js:110, reused rather than restated. Nothing
 * the candidate said about themselves is consulted, so a Chinese candidate applying
 * in Leiden gets Leiden's conventions.
 *
 * Conservative by construction. A null here means the whole feature says nothing:
 * no instruction in the prompt, no id the parser will accept, no card in the panel.
 * This matches how the request already treats absent inputs — the work-authorization
 * and location instructions are omitted rather than sent with nothing to act on
 * (src/ai/prompts.js:97-111) — and it is the right default because a wrong market
 * claim has no evidence block behind it for the reader to catch it with.
 */

/**
 * Markets that share a decisive substring with a listed one but are not it.
 *
 * "Hong Kong SAR, China" and "Macau, China" both contain the string that decides the
 * mainland market, and their hiring conventions are not the ones in that table. This
 * runs before any match, so a substring cannot fold one market into another.
 */
const SEPARATE_MARKETS = [
  /\bhong\s*kong\b/i, /香港/,
  /\btaiwan\b/i, /\btaipei\b/i, /台灣/, /台湾/, /台北/,
  /\bmacau\b/i, /\bmacao\b/i, /澳門/, /澳门/
];

const MARKET_PATTERNS = Object.freeze({
  cn: [
    /\bchina\b/i, /\bchinese\s+mainland\b/i, /\bp\.?r\.?c\.?\b/i, /中国/, /中國/,
    /\bbeijing\b/i, /北京/,
    /\bshanghai\b/i, /上海/,
    /\bshenzhen\b/i, /深圳/,
    /\bguangzhou\b/i, /广州/, /廣州/, /广东/,
    /\bhangzhou\b/i, /杭州/,
    /\bnanjing\b/i, /南京/,
    /\bsuzhou\b/i, /苏州/, /蘇州/,
    /\bchengdu\b/i, /成都/,
    /\bwuhan\b/i, /武汉/, /武漢/,
    /\btianjin\b/i, /天津/,
    /\bhefei\b/i, /合肥/,
    // 西安大略 is Western Ontario. It should not reach a location field, but the
    // substring is a real collision and the lookahead costs nothing.
    /\bxi'?an\b/i, /西安(?!大略)/,
    /\bqingdao\b/i, /青岛/, /青島/,
    /\bchangsha\b/i, /长沙/, /長沙/,
    /\bxiamen\b/i, /厦门/, /廈門/
  ],
  nl_weu: [
    /\bnetherlands\b/i, /\bnederland\b/i, /\bholland\b/i, /\bnl\b/i, /荷兰/, /荷蘭/,
    /\bamsterdam\b/i, /阿姆斯特丹/,
    /\brotterdam\b/i,
    /\butrecht\b/i,
    /\beindhoven\b/i,
    /\bleiden\b/i, /莱顿/, /萊頓/,
    /\bdelft\b/i,
    /\bthe\s+hague\b/i, /\bden\s+haag\b/i, /海牙/,
    /\bgroningen\b/i,
    /\bnijmegen\b/i,
    /\bmaastricht\b/i,
    /\btilburg\b/i,
    /\benschede\b/i,
    /\bwageningen\b/i
  ]
});

export function resolveMarket(location) {
  if (typeof location !== "string" || !location.trim()) return null;
  if (SEPARATE_MARKETS.some((pattern) => pattern.test(location))) return null;
  const matched = MARKET_KEYS.filter((key) => MARKET_PATTERNS[key].some((pattern) => pattern.test(location)));
  // Two markets in one string is a dual-site or a remote posting spanning both, and
  // there is no answer to give. Picking the first would be a guess presented as a fact.
  return matched.length === 1 ? matched[0] : null;
}
