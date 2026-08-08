import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_KEYS, conventionById, conventionsFor } from "../src/market/conventions.js";
import { resolveMarket } from "../src/market/resolveMarket.js";
import { MARKET_NAME_KEY } from "../src/ui/analysisView.js";
import { t } from "../src/ui/i18n.js";

/**
 * The market layer, which decides whether this feature says anything at all.
 *
 * Every case here is a case where saying nothing is the correct answer. A wrong
 * market claim is worse than no market claim, and unlike a wrong requirement it has
 * no evidence block behind it for the reader to check it against.
 */

test("a Dutch location resolves to the Western European market", () => {
  for (const location of ["Leiden, NL", "Amsterdam", "荷兰", "Eindhoven, Netherlands", "Den Haag"]) {
    assert.equal(resolveMarket(location), "nl_weu", location);
  }
});

test("a mainland Chinese location resolves to the Chinese market", () => {
  for (const location of ["Shanghai, China", "上海", "深圳", "Beijing", "杭州市"]) {
    assert.equal(resolveMarket(location), "cn", location);
  }
});

test("an ambiguous location resolves to nothing rather than to a guess", () => {
  assert.equal(resolveMarket("Remote — Shanghai or Amsterdam"), null);
  assert.equal(resolveMarket("Amsterdam / Shenzhen dual site"), null);
});

test("a location with no place in it resolves to nothing", () => {
  for (const location of ["", "   ", "Remote", "Hybrid", "Remote (EU timezone)"]) {
    assert.equal(resolveMarket(location), null, JSON.stringify(location));
  }
});

test("a market outside the first batch resolves to nothing", () => {
  for (const location of ["Toronto, Canada", "London, UK", "Berlin, Germany", "Boston, MA"]) {
    assert.equal(resolveMarket(location), null, location);
  }
});

// "Hong Kong SAR, China" and "Taipei, Taiwan" contain the substring that decides the
// mainland market, and they are different hiring markets whose conventions are not
// the ones in this table. Excluded explicitly rather than left to substring luck.
test("a separate market is not folded into the mainland one on a substring", () => {
  for (const location of ["Hong Kong SAR, China", "香港", "Taipei, Taiwan", "台北", "Macau, China"]) {
    assert.equal(resolveMarket(location), null, location);
  }
});

// A city name is not unique to its market: Amsterdam, NY and Rotterdam, NY are real
// US towns, "HK" is the everyday abbreviation for Hong Kong, and a bare "China" can
// appear in a location line that is not about China at all. A wrong market claim here
// has no evidence block behind it for the reader to catch, so every one of these must
// resolve to nothing rather than to a guess.
test("a location naming a conflicting country is not folded into a market by city-name substring", () => {
  for (const location of [
    "Amsterdam, New York, USA",
    "Rotterdam, NY",
    "HK, China",
    "London, UK — China team"
  ]) {
    assert.equal(resolveMarket(location), null, location);
  }
});

// The same guard must not turn a plain match into a false negative: a location that
// names no conflicting country still has to resolve normally.
test("a plain city name with no conflicting country still resolves", () => {
  assert.equal(resolveMarket("Amsterdam"), "nl_weu");
  assert.equal(resolveMarket("Shanghai"), "cn");
  assert.equal(resolveMarket("Leiden, NL"), "nl_weu");
  assert.equal(resolveMarket("Shanghai, China"), "cn");
});

// A two-letter US postal code was once told apart from an ordinary English word by
// capitalisation, and that got both directions wrong: a lowercase code in a
// delimiter slot ("rotterdam, ny") still meant the region, and an all-caps word out
// of one ("AMSTERDAM OR ROTTERDAM") never meant Oregon. Position replaced case as
// the discriminator, so every one of these must resolve exactly as commented.
test("a region code only conflicts in a delimiter slot, regardless of case", () => {
  // Under-blocks: the code names a real US place sharing a name with a Dutch one,
  // and sits right after a comma or at the end — a genuine conflict, case aside.
  for (const location of ["rotterdam, ny", "amsterdam, ny", "amsterdam, ny, us", "holland, mi", "Holland, MI"]) {
    assert.equal(resolveMarket(location), null, location);
  }
  // Over-blocks: the "code" is an ordinary word floating mid-string, not in a
  // delimiter slot, so it never should have been read as a region in the first place.
  for (const location of ["AMSTERDAM OR ROTTERDAM", "REMOTE IN THE NETHERLANDS"]) {
    assert.equal(resolveMarket(location), "nl_weu", location);
  }
});

// Rule 1: the matched market's own country, printed outright, outweighs a
// two-letter code that merely happens to collide with a US state abbreviation. FL
// here is Flevoland, NH is Noord-Holland, UT is Utrecht province — real Dutch
// regions, not the US states of the same postal code — and "Netherlands"/"NL" is
// direct enough evidence that the code should not get to veto the match.
test("an explicit country name outweighs a same-string region-code collision", () => {
  for (const location of ["Lelystad, FL, Netherlands", "Haarlem, NH, Netherlands", "Utrecht, UT, NL"]) {
    assert.equal(resolveMarket(location), "nl_weu", location);
  }
});

// A different, unambiguous country name is not a collision Rule 1 can rescue: "UK"
// is never an ordinary English word the way a lowercase state code can be, so it
// keeps vetoing even though "China" is also printed in the same string — the two
// signals flatly contradict each other, and null is still the only honest answer.
test("a genuinely different country name still vetoes even with an explicit match elsewhere", () => {
  assert.equal(resolveMarket("London, UK — China team"), null);
});

// Bare "Holland" is ambiguous with Holland, Michigan, so it only counts as the
// country name (Rule 1) when something else in the string is independently Dutch.
// "Holland, MI" alone has no such corroboration and must still resolve to nothing
// (already covered above); "Amsterdam, Holland, FL" has Amsterdam, so "Holland" is
// read as the country and the FL/Flevoland-vs-Florida collision is rescued.
test("bare Holland counts as the country name only when corroborated elsewhere in the string", () => {
  assert.equal(resolveMarket("Amsterdam, Holland, FL"), "nl_weu");
});

// Two regex-correctness fixes that predate this change and have to keep working:
// \b fails right after a literal "." at the end of a string (both sides read as
// non-word), so the U.S. pattern uses (?!\w) instead; and JS's default \w excludes
// "ë", so \b right before it never fires and the België pattern is anchored without one.
test("the U.S.-at-end-of-string and non-ASCII-boundary regex fixes still work", () => {
  assert.equal(resolveMarket("Amsterdam, U.S."), null);
  assert.equal(resolveMarket("Amsterdam, België"), null);
});

test("a non-string location resolves to nothing", () => {
  for (const location of [undefined, null, 42, {}]) {
    assert.equal(resolveMarket(location), null, JSON.stringify(location));
  }
});

test("every market key has conventions and an unknown key has none", () => {
  for (const key of MARKET_KEYS) assert.ok(conventionsFor(key).length > 0, key);
  assert.deepEqual(conventionsFor("de"), []);
  assert.deepEqual(conventionsFor(undefined), []);
});

test("every convention id is unique and looks itself up", () => {
  const all = MARKET_KEYS.flatMap((key) => conventionsFor(key));
  const ids = all.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "convention ids must be globally unique");
  for (const item of all) assert.equal(conventionById(item.id), item, item.id);
  assert.equal(conventionById("no-such-convention"), null);
  assert.equal(conventionById(undefined), null);
});

test("every convention carries both languages, a condition, and a dated rationale", () => {
  for (const key of MARKET_KEYS) {
    for (const item of conventionsFor(key)) {
      assert.equal(item.market, key, `${item.id} is filed under the wrong market`);
      assert.ok(item.text.en.trim(), `${item.id} has no English text`);
      assert.ok(item.text.zh.trim(), `${item.id} has no Chinese text`);
      assert.ok(item.appliesWhen.trim(), `${item.id} has no appliesWhen`);
      assert.match(item.added, /^\d{4}-\d{2}-\d{2}$/, `${item.id} has no added date`);
      assert.ok(item.why.trim(), `${item.id} has no rationale for review`);
    }
  }
});

// Nothing automated can check that a convention is TRUE. This checks the one class of
// falsehood a machine can see: a fabricated statistic. The rest is why/added, which
// exist so a person can review the claim.
test("no convention states a number", () => {
  for (const key of MARKET_KEYS) {
    for (const item of conventionsFor(key)) {
      for (const field of [item.text.en, item.text.zh, item.appliesWhen]) {
        assert.equal(/[0-9%]/.test(field), false, `${item.id} states a number: ${field}`);
      }
    }
  }
});

// nl-credential-recognition and nl-working-language each restate a finding that
// statedConditions or a licence/language line in the posting already owns. The
// product rule against repeating one finding across sections means these two must
// answer only when the posting is silent on the point — checked here so the
// tightened wording cannot quietly drift back to the old, unconditional one.
test("the two conventions that could duplicate a stated condition are tightened to the silent case", () => {
  const credential = conventionById("nl-credential-recognition");
  assert.match(credential.appliesWhen, /does not itself state a licence or registration condition/);
  const workingLanguage = conventionById("nl-working-language");
  assert.match(workingLanguage.appliesWhen, /does not already state the team's working language/);
});

// Approved wording from the plan owner, copied byte-for-byte. Pinned here so a future
// edit to these two entries cannot silently revert to the earlier, more
// machine-translated phrasing without a test noticing.
test("the two Chinese convention strings use the plan owner's approved wording", () => {
  assert.equal(conventionById("nl-motivation-letter").text.zh, "即使招聘启事没有要求，多数申请也默认要附一封动机信。");
  assert.equal(conventionById("nl-references-contacted").text.zh, "到了发 offer 的阶段，推荐人通常是真的会被联系的。");
});

// MARKET_NAME_KEY is a hand-maintained map, not derived from MARKET_KEYS. Adding a
// third market to conventions.js without adding a line here would render "Common
// hiring conventions in ." with no test or audit failing — this is that test.
test("every market key has a display name in both locales", () => {
  for (const key of MARKET_KEYS) {
    const nameKey = MARKET_NAME_KEY[key];
    assert.ok(nameKey, `${key} has no entry in MARKET_NAME_KEY`);
    for (const locale of ["en", "zh"]) {
      assert.notEqual(t(locale, nameKey), nameKey, `${key} has no ${locale} display name`);
    }
  }
});

// The banned axes, checked against the table itself rather than only asked for in
// prose. src/ai/prompts.js:14-15 and :77 forbid these to the model; a convention
// naming one would smuggle it back in under the model's own fence.
test("no convention names a protected trait", () => {
  const banned = /\bage\b|\bnationality\b|\bcitizenship\b|年龄|国籍|户籍|性别|gender|\bmarital\b|婚姻|prestige|985|211/i;
  for (const key of MARKET_KEYS) {
    for (const item of conventionsFor(key)) {
      for (const field of [item.text.en, item.text.zh, item.appliesWhen, item.why]) {
        assert.equal(banned.test(field), false, `${item.id} names a protected trait: ${field}`);
      }
    }
  }
});
