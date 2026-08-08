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
 * runs before any match, so a substring cannot fold one market into another. It is
 * unconditional — nothing below, including an explicit country name, overrides it —
 * because Hong Kong, Taiwan and Macau are genuinely different hiring markets, not an
 * ambiguous reading of the same one.
 */
const SEPARATE_MARKETS = [
  /\bhong\s*kong\b/i, /\bhk\b/i, /香港/,
  /\btaiwan\b/i, /\btaipei\b/i, /台灣/, /台湾/, /台北/,
  /\bmacau\b/i, /\bmacao\b/i, /澳門/, /澳门/
];

// The matched market's own country/region name. Shared between MARKET_PATTERNS
// (which decides *whether* a market matched at all) and EXPLICIT_COUNTRY_NAMES
// (which decides whether that match is trustworthy enough to overrule a stray
// two-letter code — see the "Rule 1" comment below).
const CHINA_PATTERN = /\bchina\b/i;
const PRC_PATTERN = /\bp\.?r\.?c\.?\b/i;
const CHINA_HANS_PATTERN = /中国/;
const CHINA_HANT_PATTERN = /中國/;
const NETHERLANDS_PATTERN = /\bnetherlands\b/i;
const NEDERLAND_PATTERN = /\bnederland\b/i;
const HOLLAND_PATTERN = /\bholland\b/i;
const NL_PATTERN = /\bnl\b/i;
const NL_HANS_PATTERN = /荷兰/;
const NL_HANT_PATTERN = /荷蘭/;

const MARKET_PATTERNS = Object.freeze({
  cn: [
    CHINA_PATTERN, /\bchinese\s+mainland\b/i, PRC_PATTERN, CHINA_HANS_PATTERN, CHINA_HANT_PATTERN,
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
    NETHERLANDS_PATTERN, NEDERLAND_PATTERN, HOLLAND_PATTERN, NL_PATTERN, NL_HANS_PATTERN, NL_HANT_PATTERN,
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

// Every US state, as [full name, postal abbreviation]. Amsterdam, NY and Rotterdam,
// NY are real US towns, and Holland, MI is a real US city — three of the nl_weu city
// patterns above collide with an actual place in a market this table says nothing
// about. This table feeds two different checks below: the full name is matched
// case-insensitively anywhere in the string (CONFLICTING_COUNTRY_NAMES — a full name
// is never an ordinary word by accident), and the abbreviation is matched only in a
// delimiter slot (AMBIGUOUS_REGION_PATTERNS — a bare two-letter code is ambiguous
// with ordinary text, e.g. "or", "in", "de", "co", in a way a full name is not).
const US_STATES = [
  ["Alabama", "AL"], ["Alaska", "AK"], ["Arizona", "AZ"], ["Arkansas", "AR"],
  ["California", "CA"], ["Colorado", "CO"], ["Connecticut", "CT"], ["Delaware", "DE"],
  ["Florida", "FL"], ["Georgia", "GA"], ["Hawaii", "HI"], ["Idaho", "ID"],
  ["Illinois", "IL"], ["Indiana", "IN"], ["Iowa", "IA"], ["Kansas", "KS"],
  ["Kentucky", "KY"], ["Louisiana", "LA"], ["Maine", "ME"], ["Maryland", "MD"],
  ["Massachusetts", "MA"], ["Michigan", "MI"], ["Minnesota", "MN"], ["Mississippi", "MS"],
  ["Missouri", "MO"], ["Montana", "MT"], ["Nebraska", "NE"], ["Nevada", "NV"],
  ["New Hampshire", "NH"], ["New Jersey", "NJ"], ["New Mexico", "NM"], ["New York", "NY"],
  ["North Carolina", "NC"], ["North Dakota", "ND"], ["Ohio", "OH"], ["Oklahoma", "OK"],
  ["Oregon", "OR"], ["Pennsylvania", "PA"], ["Rhode Island", "RI"], ["South Carolina", "SC"],
  ["South Dakota", "SD"], ["Tennessee", "TN"], ["Texas", "TX"], ["Utah", "UT"],
  ["Vermont", "VT"], ["Virginia", "VA"], ["Washington", "WA"], ["West Virginia", "WV"],
  ["Wisconsin", "WI"], ["Wyoming", "WY"]
];

/**
 * Countries and full state names that flatly contradict a matched market — checked
 * unconditionally, anywhere in the string, and never overruled by anything below.
 *
 * A city pattern above is a substring match, and a substring cannot tell "Amsterdam"
 * the Dutch capital from "Amsterdam, New York" or "London, UK — China team" from an
 * actual China posting. Rather than enumerate every country a city name might
 * collide with, this list names the other side directly: if the location also names
 * a country that is not the one the matched market belongs to, the match is not
 * trustworthy, and null is safer than a guess dressed up as a fact.
 *
 * These are full names, or codes ("UK") that are never an ordinary English word, so
 * there is no ambiguity to resolve by position — unlike the bare two-letter US state
 * codes below, which are. That is also why an explicit country name for the matched
 * market (Rule 1, further down) cannot rescue a hit here: "London, UK — China team"
 * names an actual, unambiguous other country, and no amount of "China" elsewhere in
 * the string un-contradicts that. NL and CN's own names are deliberately absent —
 * they are what MARKET_PATTERNS already matches on, and two real markets in one
 * string is handled separately above (matched.length !== 1).
 */
const CONFLICTING_COUNTRY_NAMES = [
  // United States — full names only. The bare "US" code lives in
  // AMBIGUOUS_REGION_PATTERNS below, next to the state abbreviations, because it has
  // the exact same problem they do: "us" is an ordinary English word.
  /\busa\b/i, /\bu\.s\.a\.?(?!\w)/i, /\bunited states\b/i, /\bu\.s\.(?!\w)/i, /\bamerica\b/i,
  ...US_STATES.map(([name]) => new RegExp(`\\b${name}\\b`, "i")),
  // United Kingdom
  /\bUK\b/i, /\bu\.k\.(?!\w)/i, /\bunited kingdom\b/i, /\bengland\b/i, /\bbritain\b/i,
  // Canada
  /\bcanada\b/i,
  // Germany
  /\bgermany\b/i, /\bdeutschland\b/i,
  // Belgium. The diacritic form is matched without \b: JS's default \w does not
  // include "ë", so a boundary right before it never fires and the anchored form
  // would silently never match — the same reason the CJK patterns above use none.
  /\bbelgium\b/i, /\bbelgique\b/i, /\bbelgie\b/i, /belgië/i,
  // France
  /\bfrance\b/i,
  // Australia
  /\baustralia\b/i,
  // India
  /\bindia\b/i,
  // Japan
  /\bjapan\b/i,
  // Korea
  /\bkorea\b/i,
  // Singapore
  /\bsingapore\b/i
];

/**
 * The two-letter codes that collide with ordinary English words — every US state
 * postal abbreviation, plus the bare country code "US" — matched only where a code
 * actually reads as a code: immediately after a comma (optionally with whitespace),
 * or as the last standalone token in the string ("Rule 2"). A previous version of
 * this file tried to make the same distinction by capitalisation (a lowercase form
 * is "usually" the word, an uppercase form "usually" the code) and got both
 * directions wrong: "rotterdam, ny" is a lowercase code that still meant the region,
 * and "AMSTERDAM OR ROTTERDAM" is an all-caps word that never meant Oregon. Position
 * is what actually distinguishes them — a location field puts a real region code
 * right after a comma or at the end, not floating mid-phrase — so matching is
 * case-insensitive throughout and the slot does the discriminating instead.
 */
const AMBIGUOUS_REGION_PATTERNS = [...US_STATES.map(([, abbr]) => abbr), "US"].map(
  (abbr) => new RegExp(`,\\s*${abbr}\\b|\\b${abbr}\\s*$`, "i")
);

/**
 * The matched market's own country name, for each market this table covers — the
 * signal strong enough to overrule an AMBIGUOUS_REGION_PATTERNS hit ("Rule 1").
 *
 * "Lelystad, FL, Netherlands" types "FL" for Flevoland, a real Dutch province, and
 * that happens to collide with Florida's postal code — but the posting also prints
 * "Netherlands" outright, and an explicit country name is not the kind of thing a
 * two-letter code gets to contradict. The same reasoning covers "Haarlem, NH,
 * Netherlands" (NH = Noord-Holland) and "Utrecht, UT, NL" (UT = Utrecht province).
 */
const EXPLICIT_COUNTRY_NAMES = Object.freeze({
  cn: [CHINA_PATTERN, PRC_PATTERN, CHINA_HANS_PATTERN, CHINA_HANT_PATTERN],
  nl_weu: [NETHERLANDS_PATTERN, NEDERLAND_PATTERN, NL_PATTERN, NL_HANS_PATTERN, NL_HANT_PATTERN]
});

// Bare "Holland" also names the country, but "Holland, MI" is a real Michigan city,
// and unlike "Netherlands" or "NL" the word alone cannot tell the two apart. It only
// counts as the country name when something else in the string is independently
// Dutch too — another MARKET_PATTERNS.nl_weu hit — so "Holland, MI" (no other Dutch
// signal) still resolves to nothing, while "Amsterdam, Holland, FL" (Amsterdam is
// unambiguous) is allowed to read "Holland" as the country and let it confirm nl_weu.
function namesExplicitCountry(location, market) {
  if (EXPLICIT_COUNTRY_NAMES[market].some((pattern) => pattern.test(location))) return true;
  if (market !== "nl_weu" || !HOLLAND_PATTERN.test(location)) return false;
  return MARKET_PATTERNS.nl_weu.some((pattern) => pattern !== HOLLAND_PATTERN && pattern.test(location));
}

export function resolveMarket(location) {
  if (typeof location !== "string" || !location.trim()) return null;
  if (SEPARATE_MARKETS.some((pattern) => pattern.test(location))) return null;
  const matched = MARKET_KEYS.filter((key) => MARKET_PATTERNS[key].some((pattern) => pattern.test(location)));
  // Two markets in one string is a dual-site or a remote posting spanning both, and
  // there is no answer to give. Picking the first would be a guess presented as a fact.
  if (matched.length !== 1) return null;
  const market = matched[0];
  // An actual other country, named outright, is a contradiction nothing rescues.
  if (CONFLICTING_COUNTRY_NAMES.some((pattern) => pattern.test(location))) return null;
  // Rule 1: the matched market's own country, named outright, beats a mere
  // two-letter code — so a code conflict below gets ignored once this is true.
  const countryConfirmed = namesExplicitCountry(location, market);
  // Rule 2: an unconfirmed match is still vulnerable to a region code sitting in a
  // delimiter slot — the same kind of guess a conflicting country name would be,
  // just spelled two letters instead of a whole word.
  if (!countryConfirmed && AMBIGUOUS_REGION_PATTERNS.some((pattern) => pattern.test(location))) return null;
  return market;
}
