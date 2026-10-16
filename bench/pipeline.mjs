// Data-pipeline benchmark on the real dataset, legacy vs refactored core.
//
//   npm run bench -- [label]
//
// Times the work a filter change triggers (filter + Filter Panel counts +
// Scatterplot prep + view aggregations) for each scenario in
// tests/helpers/data.mjs. Median of N runs, in ms.

import "../tests/helpers/env.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { REPO_ROOT, DATASET_PATH, SCENARIOS, filters } from "../tests/helpers/data.mjs";
import * as legacy from "../tests/legacy/legacy.js";

const label = process.argv[2] || "run";
const N = Number(process.env.BENCH_N || 7);
const PRICE = "price_eur";

let core = null;
try {
  core = await import("../core/index.js");
} catch (e) {
  if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}

function time(fn) {
  const xs = [];
  let out;
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    out = fn();
    xs.push(performance.now() - t);
  }
  xs.sort((a, b) => a - b);
  return { ms: xs[Math.floor(xs.length / 2)], out };
}

const text = fs.readFileSync(DATASET_PATH, "utf8");
const results = { label, date: new Date().toISOString(), host: os.hostname(), arch: os.arch(), node: process.version, N, rows: [] };
const row = (name, impl, ms) => results.rows.push({ name, impl, ms: Math.round(ms * 10) / 10 });

// ---------- legacy ----------
{
  row("load (parse)", "legacy", time(() => JSON.parse(JSON.stringify(JSON.parse(text)))).ms);
  const data = JSON.parse(text);
  const { ms: gms, out: grouped } = time(() => legacy.buildGroupedData(data));
  row("build index", "legacy", gms);
  for (const s of SCENARIOS) {
    const sel = filters(s.f);
    const mode = s.mode || "AND-OR";
    const { ms } = time(() => {
      const filtered = legacy.getFilteredData(data, grouped, sel, PRICE, mode);
      legacy.filterPanelCounts(data, grouped, filtered, sel, PRICE, mode);
      return filtered;
    });
    row(`filter+counts: ${s.name}`, "legacy", ms);
  }
  const all = legacy.filterPriceOnly(data, PRICE);
  row("scatter prep (all)", "legacy", time(() => legacy.prepareScatterData(all, PRICE)).ms);
  row("view aggregates (all)", "legacy", time(() => {
    legacy.icicleAggregate(all);
    legacy.alluvialAggregate(all, PRICE);
    legacy.timelineAggregate(all);
    legacy.lineAggregate(all);
  }).ms);
}

// ---------- core ----------
if (core) {
  row("load (parse)", "core", time(() => core.prepareCards(JSON.parse(text))).ms);
  const data = core.prepareCards(JSON.parse(text));
  const { ms: ims, out: memoEngine } = time(() => core.createFilterEngine(data));
  // Time the uncached computation (the memo would make repeats ~0 ms).
  const engine = core.createFilterEngine(data, { index: memoEngine.index, memoSize: 0 });
  row("build index", "core", ims);
  for (const s of SCENARIOS) {
    const sel = filters(s.f);
    const mode = s.mode || "AND-OR";
    const { ms } = time(() => engine.run(sel, PRICE, mode));
    row(`filter+counts: ${s.name}`, "core", ms);
  }
  const all = engine.run(filters(), PRICE, "AND-OR").cards;
  const scatter = core.createScatterPrep(data);
  row("scatter prep (all)", "core", time(() => scatter.prepare(all, PRICE)).ms);
  row("view aggregates (all)", "core", time(() => {
    core.icicleAggregate(all);
    core.alluvialAggregate(all, PRICE);
    core.timelineAggregate(all);
    core.lineAggregate(all);
  }).ms);
}

// ---------- report ----------
const names = [...new Set(results.rows.map((r) => r.name))];
const table = {};
for (const n of names) {
  const l = results.rows.find((r) => r.name === n && r.impl === "legacy")?.ms;
  const c = results.rows.find((r) => r.name === n && r.impl === "core")?.ms;
  table[n] = { legacy: l, core: c ?? "-", speedup: c ? `${(l / c).toFixed(1)}×` : "-" };
}
console.table(table);
const dir = path.join(REPO_ROOT, "bench", "results");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `pipeline-${label}.json`);
fs.writeFileSync(file, JSON.stringify(results, null, 2));
console.log(`wrote ${path.relative(REPO_ROOT, file)}`);
