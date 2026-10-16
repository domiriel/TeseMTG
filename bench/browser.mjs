// End-to-end interaction benchmark in real Chrome.
//
//   npm run bench:browser -- <label> [repeats]
//
// Each metric is "event start → second animation frame after it" measured inside
// the page (ms), median over `repeats`. "blocking" is the sum of long tasks
// (>50 ms) over the scenario. Results are written to bench/results/.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REPO_ROOT,
  startServer,
  launch,
  openApp,
  installProbes,
  measure,
  heapMB,
  median,
} from "../tests/e2e/harness.mjs";

const label = process.argv[2] || "run";
const repeats = Number(process.argv[3] || 5);

async function center(page, selector, pick = 0) {
  const handle = (await page.$$(selector))[pick];
  if (!handle) throw new Error(`No element for ${selector}[${pick}]`);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function blocking(page, fn) {
  const t = await page.evaluate(() => performance.now());
  await fn();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));
  return page.evaluate((t0) => window.__blockingSince(t0), t);
}

async function runOnce() {
  const server = await startServer();
  const { browser, page, consoleErrors } = await launch();
  const r = {};
  try {
    r.initWallMs = await openApp(page, server.url);
    r.heapMB = await heapMB(page);
    await installProbes(page);

    // --- Global filter: toggle Rarity = rare on, then off -------------------
    await page.click(".FilterPanel .filter-section:has-text('Rarity') .dropdown-header");
    const opt = ".FilterPanel .filter-option[data-category='Rarity'][data-value='rare']";
    r.filterOnMs = await measure(page, "click", () => page.click(opt));
    r.filterOffMs = await measure(page, "click", () => page.click(opt));

    // --- Hover: Icicle identity rect (fans out to every other view) ---------
    const rects = await page.$$eval(".IcicleChart rect.icicle-rect", (els) =>
      els.map((e, i) => [i, e.getBoundingClientRect().width]).filter(([, w]) => w > 12).map(([i]) => i)
    );
    const iciclePts = [];
    for (const i of rects.slice(0, 6)) iciclePts.push(await center(page, ".IcicleChart rect.icicle-rect", i));
    const icicleTimes = [];
    for (const p of iciclePts) {
      icicleTimes.push(await measure(page, "mousemove", () => page.mouse.move(p.x, p.y)));
    }
    r.icicleHoverMs = median(icicleTimes);
    // Move off the chart (hover-clear path).
    r.hoverClearMs = await measure(page, "mousemove", () => page.mouse.move(5, 5));

    // --- Hover: Timeline set rects ------------------------------------------
    const tlTimes = [];
    for (let i = 0; i < 6; i++) {
      const p = await center(page, ".TimelineView .set-rect", i * 7);
      tlTimes.push(await measure(page, "mousemove", () => page.mouse.move(p.x, p.y)));
    }
    r.timelineHoverMs = median(tlTimes);
    await page.mouse.move(5, 5);

    // --- Scatterplot: hover sweep + wheel zoom ------------------------------
    const sbox = await (await page.$(".Scatterplot")).boundingBox();
    const sweep = [];
    for (let i = 1; i <= 10; i++) {
      const x = sbox.x + (sbox.width * i) / 11;
      const y = sbox.y + sbox.height * 0.6;
      sweep.push(await measure(page, "mousemove", () => page.mouse.move(x, y)));
    }
    r.scatterHoverMs = median(sweep);
    const cx = sbox.x + sbox.width / 2;
    const cy = sbox.y + sbox.height / 2;
    await page.mouse.move(cx, cy);
    const zooms = [];
    for (let i = 0; i < 6; i++) zooms.push(await measure(page, "wheel", () => page.mouse.wheel(0, -150)));
    for (let i = 0; i < 6; i++) zooms.push(await measure(page, "wheel", () => page.mouse.wheel(0, 150)));
    r.scatterZoomMs = median(zooms);
    await page.mouse.move(5, 5);

    // --- Resize: simulated window drag (10 steps) ---------------------------
    r.resizeDragBlockingMs = await blocking(page, async () => {
      for (let i = 0; i < 10; i++) await page.setViewportSize({ width: 1600 - i * 20, height: 1000 - i * 10 });
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

    r.consoleErrors = consoleErrors.length;
  } finally {
    await browser.close();
    server.close();
  }
  return r;
}

const runs = [];
for (let i = 0; i < repeats; i++) {
  process.stdout.write(`run ${i + 1}/${repeats}…\n`);
  runs.push(await runOnce());
}

const keys = Object.keys(runs[0]);
const summary = Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))]));
const out = {
  label,
  date: new Date().toISOString(),
  host: os.hostname(),
  arch: os.arch(),
  cpu: os.cpus()[0]?.model,
  repeats,
  summary,
  runs,
};
const dir = path.join(REPO_ROOT, "bench", "results");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `browser-${label}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.table(Object.fromEntries(keys.map((k) => [k, { median: Math.round(summary[k] * 10) / 10 }])));
console.log(`wrote ${path.relative(REPO_ROOT, file)}`);
