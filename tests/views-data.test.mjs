// Differential tests for the per-view data preparation (Scatterplot prep and
// Icicle / Alluvial / Timeline / Line aggregations) against the legacy code.
import "./helpers/env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { loadDataset, filters } from "./helpers/data.mjs";
import * as legacy from "./legacy/legacy.js";
import {
  prepareCards,
  createFilterEngine,
  createScatterPrep,
  icicleAggregate,
  alluvialAggregate,
  timelineAggregate,
  lineAggregate,
} from "../core/index.js";

const data = prepareCards(loadDataset());
const engine = createFilterEngine(data);
const scatter = createScatterPrep(data);

const SUBSETS = [
  ["all, eur", {}, "price_eur"],
  ["rare, usd", { Rarity: ["rare"] }, "price_usd"],
  ["wu, tix", { "Color Identity": ["wu"] }, "price_tix"],
  ["expansion 2020, eur foil", { "Set Types": ["expansion"], Year: ["2020"] }, "price_eur_foil"],
  ["text dragon, usd etched", { FreeTextSearch: ["dragon"] }, "price_usd_etched"],
];

// Fresh, unmutated copies for the legacy side (legacy mutates/spreads cards).
function legacyCopy(cards) {
  const raw = loadDataset();
  return cards.map((c) => raw[c.index]);
}

// Deep-equal that treats Sets as sorted arrays and Dates as timestamps, and
// ignores the core's derived "_" fields.
function normalize(v) {
  if (v instanceof Set) return [...v].map(normalize).sort();
  if (v instanceof Map) return [...v].map(([k, x]) => [k, normalize(x)]);
  if (v instanceof Date) return { date: v.getTime() };
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) if (!k.startsWith("_")) o[k] = normalize(v[k]);
    return o;
  }
  return v;
}

for (const [name, spec, priceAttr] of SUBSETS) {
  const subset = engine.run(filters(spec), priceAttr, "AND-OR").cards;

  test(`scatter prep matches legacy: ${name}`, () => {
    const exp = legacy.prepareScatterData(legacyCopy(subset), priceAttr);
    const act = scatter.prepare(subset, priceAttr);
    assert.equal(act.length, exp.length);
    assert.deepEqual(normalize(act), normalize(exp));
  });

  test(`icicle aggregate matches legacy: ${name}`, () => {
    assert.deepEqual(normalize(icicleAggregate(subset)), normalize(legacy.icicleAggregate(legacyCopy(subset))));
  });

  test(`alluvial aggregate matches legacy: ${name}`, () => {
    const exp = legacy.alluvialAggregate(legacyCopy(subset), priceAttr);
    const act = alluvialAggregate(subset, priceAttr);
    assert.deepEqual(normalize(act), normalize(exp));
  });

  test(`timeline aggregate matches legacy: ${name}`, () => {
    assert.deepEqual(normalize(timelineAggregate(subset)), normalize(legacy.timelineAggregate(legacyCopy(subset))));
  });

  test(`line aggregate matches legacy: ${name}`, () => {
    assert.deepEqual(normalize(lineAggregate(subset)), normalize(legacy.lineAggregate(legacyCopy(subset))));
  });
}

test("scatter prep does not mutate its input cards", () => {
  const subset = engine.run(filters({ Rarity: ["mythic"] }), "price_eur", "AND-OR").cards;
  const before = JSON.stringify(subset);
  scatter.prepare(subset, "price_eur");
  assert.equal(JSON.stringify(subset), before);
});

test("scatter prep returns fresh objects each call (views mutate them)", () => {
  const subset = engine.run(filters({ Rarity: ["mythic"] }), "price_eur", "AND-OR").cards;
  const a = scatter.prepare(subset, "price_eur");
  const b = scatter.prepare(subset, "price_eur");
  assert.notEqual(a[0], b[0]);
  assert.notEqual(a[0].all_sets, b[0].all_sets);
});
