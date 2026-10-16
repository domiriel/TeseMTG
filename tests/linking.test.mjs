// Tests for the shared, card-level selection model (core/linking.js).
// Every result is checked against a brute-force evaluation over the cards.
import "./helpers/env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { loadDataset, filters } from "./helpers/data.mjs";
import { prepareCards, createFilterEngine, createLinker } from "../core/index.js";

const cards = prepareCards(loadDataset());
const engine = createFilterEngine(cards);
const linker = createLinker(cards, engine);
const all = engine.run(filters(), "price_eur", "AND-OR");
const rare = engine.run(filters({ Rarity: ["rare"] }), "price_eur", "AND-OR");

const FIELD = {
  identities: (c) => c._ci,
  numColors: (c) => c._nc,
  originalities: (c) => c._orig,
  rarities: (c) => c._rar,
  pairs: (c) => `${c._orig}|${c._rar}`,
  sets: (c) => c.set_name,
  setTypes: (c) => c.set_type?.toLowerCase(),
  years: (c) => c._year,
  names: (c) => c.name,
};

// A card matches a predicate if any listed value of any field matches.
const bruteMatch = (pred) => (c) =>
  Object.entries(pred).some(([f, values]) => values?.size > 0 && values.has(FIELD[f](c)));

const indicesOf = (mask) => {
  const out = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return out;
};

const PREDICATES = [
  { identities: new Set(["WU"]) },
  { identities: new Set(["Colorless", "WUBRG"]) },
  { numColors: new Set([0, 3]) },
  { originalities: new Set(["functional reprint"]) },
  { rarities: new Set(["mythic", "special"]) },
  { pairs: new Set(["original|rare", "reprint|common"]) },
  { sets: new Set(["Limited Edition Alpha", "Dominaria"]) },
  { setTypes: new Set(["masters"]) },
  { years: new Set([1993, 2020]) },
  { names: new Set(["Lightning Bolt", "Counterspell"]) },
  { sets: new Set(["Dominaria"]), setTypes: new Set(["core"]) },
];

for (const pred of PREDICATES) {
  const label = JSON.stringify(Object.fromEntries(Object.entries(pred).map(([k, v]) => [k, [...v]])));
  test(`predicate mask matches brute force: ${label}`, () => {
    const exp = cards.filter((c) => all.mask[c.index] && bruteMatch(pred)(c)).map((c) => c.index);
    assert.ok(exp.length > 0, "fixture predicate matches something");
    assert.deepEqual(indicesOf(linker.predicateMask(pred, all.mask)), exp);
  });
}

test("predicate mask is restricted to the filtered set", () => {
  const pred = { names: new Set(["Lightning Bolt"]) };
  const exp = cards.filter((c) => rare.mask[c.index] && c.name === "Lightning Bolt").map((c) => c.index);
  assert.deepEqual(indicesOf(linker.predicateMask(pred, rare.mask)), exp);
});

test("no active source → no selection", () => {
  assert.equal(linker.selectionMask(new Map(), all.mask), null);
  assert.equal(linker.selectionMask(new Map([["icicle", { identities: new Set() }]]), all.mask), null);
});

test("sources are AND-ed; values within a source are OR-ed", () => {
  const sources = new Map([
    ["icicle", { identities: new Set(["WU", "UB"]) }],
    ["years", { years: new Set([2019, 2020]) }],
  ]);
  const exp = cards
    .filter((c) => all.mask[c.index] && ["WU", "UB"].includes(c._ci) && [2019, 2020].includes(c._year))
    .map((c) => c.index);
  assert.ok(exp.length > 0);
  assert.deepEqual(indicesOf(linker.selectionMask(sources, all.mask)), exp);
});

test("card-level: a set AND a year select printings that satisfy both", () => {
  // Alpha (1993) AND 2020 → nothing, even though Alpha cards were reprinted in 2020.
  const sources = new Map([
    ["timeline", { sets: new Set(["Limited Edition Alpha"]) }],
    ["years", { years: new Set([2020]) }],
  ]);
  assert.deepEqual(indicesOf(linker.selectionMask(sources, all.mask)), []);
});

test("Scatterplot picks are added on top of the other sources", () => {
  const sources = new Map([
    ["icicle", { identities: new Set(["WU"]) }],
    ["scatter", { names: new Set(["Lightning Bolt"]) }],
  ]);
  const exp = cards
    .filter((c) => all.mask[c.index] && (c._ci === "WU" || c.name === "Lightning Bolt"))
    .map((c) => c.index);
  assert.deepEqual(indicesOf(linker.selectionMask(sources, all.mask)), exp);
});

test("only Scatterplot picks → exactly those cards", () => {
  const sources = new Map([["scatter", { names: new Set(["Lightning Bolt"]) }]]);
  const exp = cards.filter((c) => all.mask[c.index] && c.name === "Lightning Bolt").map((c) => c.index);
  assert.deepEqual(indicesOf(linker.selectionMask(sources, all.mask)), exp);
});

test("summary counts selected printings per field", () => {
  const mask = linker.predicateMask({ identities: new Set(["WU"]) }, all.mask);
  const s = linker.summarize(mask);
  const sel = cards.filter((c) => mask[c.index]);
  assert.equal(s.count, sel.length);
  for (const field of Object.keys(FIELD)) {
    const exp = new Map();
    for (const c of sel) exp.set(FIELD[field](c), (exp.get(FIELD[field](c)) || 0) + 1);
    const act = s.get(field);
    assert.equal(act.size, exp.size, field);
    for (const [k, n] of exp) assert.equal(act.get(k), n, `${field}=${k}`);
  }
});

test("summary of no selection is empty", () => {
  const s = linker.summarize(null);
  assert.equal(s.count, 0);
  assert.equal(s.get("sets").size, 0);
  assert.equal(s.has("sets", "Dominaria"), false);
});
