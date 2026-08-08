import assert from "node:assert/strict";
import test from "node:test";
import { MARKET_KEYS, conventionById, conventionsFor } from "../src/market/conventions.js";
import { resolveMarket } from "../src/market/resolveMarket.js";

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
