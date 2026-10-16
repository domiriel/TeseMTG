// Differential tests: the refactored filter engine must return exactly what the
// pre-refactor pipeline (tests/legacy/legacy.js) returned — same cards, same
// order, same Filter Panel counts — on the real dataset.
import "./helpers/env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { loadDataset, filters, SCENARIOS, PRICE_ATTRS } from "./helpers/data.mjs";
import * as legacy from "./legacy/legacy.js";
import { prepareCards, createFilterEngine, inferTypeCategory } from "../core/index.js";

const legacyData = loadDataset();
const legacyGrouped = legacy.buildGroupedData(legacyData);
const data = prepareCards(loadDataset());
const engine = createFilterEngine(data);

const ids = (cards) => cards.map((c) => c.index);

function legacyRun(sel, priceAttr, mode) {
  const cards = legacy.getFilteredData(legacyData, legacyGrouped, sel, priceAttr, mode);
  const counts = legacy.filterPanelCounts(legacyData, legacyGrouped, cards, sel, priceAttr, mode);
  return { cards, counts };
}

function assertSameCounts(actual, expected, msg) {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), `${msg}: categories`);
  for (const [cat, exp] of expected) {
    const act = actual.get(cat);
    for (const [value, n] of exp) {
      assert.equal(act.get(value) ?? 0, n, `${msg}: count ${cat}=${value}`);
    }
    assert.equal(act.size, exp.size, `${msg}: number of ${cat} options`);
  }
}

test("index has the same categories and values as legacy groupedData", () => {
  for (const [cat, map] of Object.entries(legacyGrouped)) {
    const values = engine.values(cat);
    assert.deepEqual([...values].sort(), [...map.keys()].sort(), cat);
  }
});

for (const s of SCENARIOS) {
  for (const priceAttr of ["price_eur", "price_usd_foil", "price_tix"]) {
    const mode = s.mode || "AND-OR";
    test(`scenario "${s.name}" [${mode}, ${priceAttr}] matches legacy`, () => {
      const sel = filters(s.f);
      const exp = legacyRun(sel, priceAttr, mode);
      const act = engine.run(sel, priceAttr, mode);
      assert.deepEqual(ids(act.cards), ids(exp.cards), "filtered cards");
      assertSameCounts(act.counts, exp.counts, s.name);
    });
  }
}

// Seeded random filter combinations drawn from real values.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("200 random filter combinations match legacy (both logic modes)", () => {
  const rand = rng(42);
  const cats = Object.keys(legacyGrouped);
  const valuesByCat = Object.fromEntries(
    cats.map((c) => [c, [...legacyGrouped[c].entries()].sort((a, b) => b[1].length - a[1].length).map(([v]) => v)])
  );
  for (let i = 0; i < 200; i++) {
    const spec = {};
    const nCats = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < nCats; k++) {
      const cat = cats[Math.floor(rand() * cats.length)];
      // Bias towards common values so results are rarely empty.
      const pool = valuesByCat[cat].slice(0, 25);
      const nVals = 1 + Math.floor(rand() * 2);
      spec[cat] = Array.from({ length: nVals }, () => pool[Math.floor(rand() * pool.length)]);
    }
    if (rand() < 0.1) spec.FreeTextSearch = ["an"];
    const mode = rand() < 0.5 ? "AND-OR" : "AND-AND";
    const priceAttr = PRICE_ATTRS[Math.floor(rand() * PRICE_ATTRS.length)];
    const sel = filters(spec);
    const exp = legacyRun(sel, priceAttr, mode);
    const act = engine.run(sel, priceAttr, mode);
    const label = `#${i} ${JSON.stringify(spec)} ${mode} ${priceAttr}`;
    assert.deepEqual(ids(act.cards), ids(exp.cards), label);
    assertSameCounts(act.counts, exp.counts, label);
  }
});

test("run() returns the same object for repeated identical inputs (memo, bug B2)", () => {
  const a = engine.run(filters({ Rarity: ["rare"] }), "price_eur", "AND-OR");
  const b = engine.run(filters({ Rarity: ["rare"] }), "price_eur", "AND-OR");
  assert.equal(a, b);
  const c = engine.run(filters({ Rarity: ["rare"] }), "price_usd", "AND-OR");
  assert.notEqual(a, c, "price attribute is part of the key");
  const d = engine.run(filters({ Rarity: ["rare"] }), "price_eur", "AND-AND");
  assert.notEqual(a, d, "logic mode is part of the key");
});

test("inferTypeCategory matches the legacy full-scan inference", () => {
  for (const token of ["goblin", "Creature", "legendary", "dragon", "artifact", "equipment", "basic", "nonsense", " elf "]) {
    assert.equal(inferTypeCategory(engine, token), legacy.inferFilterCategoryFromValue(token, legacyData), token);
  }
});
