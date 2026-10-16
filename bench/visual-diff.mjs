// Visual parity check: screenshots every view in a reference checkout and in
// the working tree (same Chrome, same viewport) and reports differing pixels.
//
//   node bench/visual-diff.mjs <path-to-reference-checkout> [outDir]
//
// Make a reference checkout with e.g. `git worktree add /tmp/ref main`.
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, startServer, launch, openApp } from "../tests/e2e/harness.mjs";

const refRoot = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || path.join(REPO_ROOT, "bench", "results", "visual"));
fs.mkdirSync(outDir, { recursive: true });

const VIEWS = [".FilterPanel", ".IcicleChart", ".AlluvialChart", ".TimelineView", ".LineChart", ".Scatterplot"];

async function shots(root, scenario) {
  const server = await startServer(root);
  const { browser, page } = await launch();
  await openApp(page, server.url);
  await scenario(page);
  await page.mouse.move(1, 1);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  const out = {};
  for (const v of VIEWS) out[v] = await (await page.$(v)).screenshot();
  await browser.close();
  server.close();
  return out;
}

async function diff(a, b) {
  const { browser, page } = await launch();
  const n = await page.evaluate(
    async ([x, y]) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return -1;
      const px = (img) => { const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
      const da = px(ia), db = px(ib);
      let d = 0;
      for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) d++;
      return d;
    },
    ["data:image/png;base64," + a.toString("base64"), "data:image/png;base64," + b.toString("base64")]
  );
  await browser.close();
  return n;
}

const SCENARIOS = {
  initial: async () => {},
  "rarity=mythic": async (page) => {
    await page.click(".FilterPanel .filter-section:has-text('Rarity') .dropdown-header");
    await page.click(".FilterPanel .filter-option[data-category='Rarity'][data-value='mythic']");
  },
};

let failed = false;
for (const [name, scenario] of Object.entries(SCENARIOS)) {
  const ref = await shots(refRoot, scenario);
  const cur = await shots(REPO_ROOT, scenario);
  for (const v of VIEWS) {
    const d = await diff(ref[v], cur[v]);
    const tag = `${name}${v}`.replace(/[^\w=-]+/g, "_");
    if (d !== 0) {
      failed = true;
      fs.writeFileSync(path.join(outDir, `${tag}-ref.png`), ref[v]);
      fs.writeFileSync(path.join(outDir, `${tag}-cur.png`), cur[v]);
    }
    console.log(`${name.padEnd(16)} ${v.padEnd(15)} ${d === 0 ? "identical" : d === -1 ? "SIZE DIFFERS" : `${d} px differ`}`);
  }
}
process.exitCode = failed ? 1 : 0;
