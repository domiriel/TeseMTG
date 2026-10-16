// End-to-end tests against the real app in Chrome.
//
//   npm run test:e2e
//
// One browser session is shared by all tests (the app takes a few seconds to
// load); tests that change state undo it at the end.

import "../helpers/env.mjs";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp } from "./harness.mjs";
import { loadDataset, filters } from "../helpers/data.mjs";
import { prepareCards, createFilterEngine } from "../../core/index.js";

let server, session, page;
const engine = createFilterEngine(prepareCards(loadDataset()));

before(async () => {
  server = await startServer();
  session = await launch();
  page = session.page;
  await openApp(page, server.url);
});

after(async () => {
  await session?.browser.close();
  server?.close();
});

// --- helpers -----------------------------------------------------------------

const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

async function openSection(category) {
  const open = await page.$eval(
    `.FilterPanel .filter-option[data-category='${category}']`,
    (el) => el.parentElement.style.display === "block"
  );
  if (!open) await page.click(`.FilterPanel .filter-section:has-text('${category}') .dropdown-header`);
}

async function optionLabel(category, value) {
  return page.$eval(
    `.FilterPanel .filter-option[data-category='${category}'][data-value='${value}'] span`,
    (el) => el.textContent
  );
}

async function toggleOption(category, value) {
  await openSection(category);
  await page.click(`.FilterPanel .filter-option[data-category='${category}'][data-value='${value}']`);
  await settle();
}

// The Scatterplot exposes what it draws on its container (`__scatter`), since
// dots are canvas pixels rather than DOM elements.
const scatterCount = () => page.$eval(".Scatterplot", (el) => el.__scatter.count());
const scatterPoints = () => page.$eval(".Scatterplot", (el) => el.__scatter.points());

const pillLabels = () => page.$$eval(".FilterPanel .pill .pill-label", (els) => els.map((e) => e.textContent));

async function icicleRectCenter(name) {
  const box = await page.evaluate((n) => {
    const r = [...document.querySelectorAll(".IcicleChart rect.icicle-rect")].find(
      (el) => el.__data__?.data?.name === n && el.__data__.depth === 2
    );
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, name);
  assert.ok(box, `icicle rect ${name} exists`);
  return box;
}

// --- tests ---------------------------------------------------------------------

test("app loads without console errors or missing files", () => {
  assert.deepEqual(session.consoleErrors, []);
  assert.deepEqual(session.notFound, [], "every <script> path resolves");
});

test("Filter Panel sections appear in their usual order", async () => {
  const headers = await page.$$eval(".FilterPanel .filter-section .dropdown-header > span:first-child", (els) =>
    els.map((e) => e.textContent).filter((t) => t !== "⚙")
  );
  assert.deepEqual(headers, [
    "Originality", "Keywords", "Rarity", "Supertypes", "Types", "Subtypes",
    "Set Types", "Set Names", "Year", "Nº of Colors", "Color Identity",
  ]);
});

test("Filter Panel counts on load match the filter engine", async () => {
  const { counts } = engine.run(filters(), "price_eur", "AND-OR");
  for (const value of ["common", "uncommon", "rare", "mythic"]) {
    assert.equal(await optionLabel("Rarity", value), `${value} (${counts.get("Rarity").get(value)})`);
  }
});

test("selecting a filter updates counts, pills and the Scatterplot; deselecting restores them", async () => {
  const before = {
    label: await optionLabel("Types", "Creature"),
    dots: await scatterCount(),
  };
  await toggleOption("Rarity", "mythic");

  const { counts } = engine.run(filters({ Rarity: ["mythic"] }), "price_eur", "AND-OR");
  assert.equal(await optionLabel("Types", "Creature"), `Creature (${counts.get("Types").get("Creature")})`);
  assert.deepEqual(await pillLabels(), ["mythic"]);
  const dots = await scatterCount();
  assert.ok(dots > 0 && dots < before.dots, `scatter shrinks (${dots} < ${before.dots})`);

  await toggleOption("Rarity", "mythic");
  assert.equal(await optionLabel("Types", "Creature"), before.label);
  assert.deepEqual(await pillLabels(), []);
  assert.equal(await scatterCount(), before.dots);
});

// Bug B1: after a resize the panel was rebuilt with the raw card arrays as
// "counts" and the active filter pills were lost.
test("B1: resizing keeps Filter Panel counts and pills intact", async () => {
  await toggleOption("Rarity", "rare");
  const label = await optionLabel("Types", "Creature");
  await page.setViewportSize({ width: 1400, height: 900 });
  await settle();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await settle();
  const texts = await page.$$eval(".FilterPanel .filter-option span", (els) => els.map((e) => e.textContent));
  assert.equal(texts.filter((t) => t.includes("[object")).length, 0, "no [object Object] labels");
  assert.equal(await optionLabel("Types", "Creature"), label);
  assert.deepEqual(await pillLabels(), ["rare"]);
  await toggleOption("Rarity", "rare");
});

// Bug B4: dots re-entering after a filter change got an alphabetically sorted
// identity class (ci-UW instead of ci-WU), so Icicle hovers missed them.
test("B4: Icicle hover highlights every visible dot of that identity, also after filter changes", async () => {
  await toggleOption("Rarity", "rare");
  await toggleOption("Rarity", "rare");
  const expected = (await scatterPoints()).filter((p) => p.shown && p.ci === "WU").map((p) => p.name).sort();
  assert.ok(expected.length > 0);
  const c = await icicleRectCenter("WU");
  await page.mouse.move(c.x, c.y);
  await settle();
  const hovered = (await scatterPoints()).filter((p) => p.hover).map((p) => p.name).sort();
  await page.mouse.move(5, 5);
  await settle();
  assert.deepEqual(hovered, expected);
  assert.equal((await scatterPoints()).filter((p) => p.hover).length, 0, "hover clears");
});

// Bug B6: the drawer kept its page number when the selection shrank.
test("B6: drawer page is clamped when the selection shrinks", async () => {
  const p = await icicleRectCenter("WU");
  await page.mouse.click(p.x, p.y);
  await settle();
  // The drawer is slid off-screen while closed; click its buttons directly.
  await page.$eval("#nextPage", (b) => b.click());
  await page.$eval("#nextPage", (b) => b.click());
  assert.match(await page.textContent("#pagination-nav span"), /Page 3 of \d+/);
  await page.$eval("#clearAllButton", (b) => b.click());
  await settle();
  assert.match(await page.textContent("#pagination-nav span"), /Page 1 of 1/);
});

const selectedDots = async () => (await scatterPoints()).filter((p) => p.selected).map((p) => p.ci);

// Bug B11: clicking an identity in the Icicle selected its whole color group
// in the Scatterplot/drawer, and deselecting it left the group selected.
test("B11: Icicle identity click selects exactly that identity, and toggles off", async () => {
  const p = await icicleRectCenter("WU");
  await page.mouse.click(p.x, p.y);
  await settle();
  const sel = await selectedDots();
  assert.ok(sel.length > 0, "something is selected");
  assert.deepEqual([...new Set(sel)], ["WU"]);
  await page.mouse.click(p.x, p.y);
  await settle();
  assert.equal((await selectedDots()).length, 0, "deselecting clears the selection");
});

// Suspected bug: clearing a cross-view hover re-positioned every dot with the
// *unzoomed* x scale, so after zooming the Scatterplot the dots jumped.
test("zoomed Scatterplot keeps its dot positions after a cross-view hover", async () => {
  const box = await (await page.$(".Scatterplot")).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200);
  await settle();
  const positions = async () => (await scatterPoints()).slice(0, 300).map((p) => `${p.x},${p.y}`);
  const before = await positions();
  const p = await icicleRectCenter("WU");
  await page.mouse.move(p.x, p.y);
  await page.mouse.move(5, 5);
  await settle();
  assert.deepEqual(await positions(), before);
  // Zoom back out.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 200);
  await settle();
});

test("right-clicking chart elements toggles the matching global filter", async () => {
  const rightClick = async (selector, predicateSrc, arg) => {
    const handle = await page.evaluateHandle(
      ([sel, src, a]) => {
        const pred = new Function("d", "a", `return (${src})(d, a);`);
        return [...document.querySelectorAll(sel)].find((el) => pred(el.__data__, a));
      },
      [selector, predicateSrc, arg]
    );
    const el = handle.asElement();
    assert.ok(el, `${selector} ${arg}`);
    await el.scrollIntoViewIfNeeded();
    await el.click({ button: "right" });
    await settle();
  };
  const cases = [
    [".AlluvialChart g.node rect", "(d, a) => d.name === a", "mythic", "mythic"],
    [".TimelineView .set-rect", "(d, a) => d.name === a", "Dominaria", "Dominaria"],
    [".LineChart circle.data-point", "(d, a) => d.year.getFullYear() === a", 2019, "2019"],
    [".IcicleChart rect.icicle-rect", "(d, a) => d.depth === 2 && d.data.name === a", "WU", "WU"],
  ];
  for (const [sel, pred, arg, pill] of cases) {
    await rightClick(sel, pred, arg);
    assert.deepEqual(await pillLabels(), [pill], `filter added from ${sel}`);
    // Remove it again through its pill.
    await page.click(".FilterPanel .pill .pill-close");
    await settle();
    assert.deepEqual(await pillLabels(), []);
  }
});

test("Line chart and Timeline keep their zoom across a filter change", async () => {
  const zoomIn = async (selector) => {
    const box = await (await page.$(selector)).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200);
    await settle();
  };
  const transforms = () =>
    page.evaluate(() => ({
      line: d3.zoomTransform(document.querySelector(".LineChart svg")).k,
      timeline: d3.zoomTransform(document.querySelector(".TimelineView .chart-container svg")).k,
    }));
  await zoomIn(".LineChart svg");
  await zoomIn(".TimelineView .chart-container svg");
  const before = await transforms();
  assert.ok(before.line > 1 && before.timeline > 1, "zoomed in");
  await toggleOption("Rarity", "rare");
  assert.deepEqual(await transforms(), before);
  await toggleOption("Rarity", "rare");
});

test("filters from a shared URL stay applied after further interaction", async () => {
  const params = new URLSearchParams({ Rarity: "mythic" }).toString();
  await page.goto(`${server.url}?filters=${encodeURIComponent(params)}`);
  await page.waitForFunction(() => document.querySelectorAll(".FilterPanel .pill").length > 0, null, { timeout: 120_000 });
  await settle();
  assert.deepEqual(await pillLabels(), ["mythic"]);
  await toggleOption("Originality", "original");
  assert.deepEqual((await pillLabels()).sort(), ["mythic", "original"]);
  const { counts } = engine.run(filters({ Rarity: ["mythic"], Originality: ["original"] }), "price_eur", "AND-OR");
  assert.equal(await optionLabel("Types", "Creature"), `Creature (${counts.get("Types").get("Creature")})`);
  // Back to a clean app for any later tests.
  await page.goto(server.url);
  await page.waitForFunction(() => document.querySelectorAll(".FilterPanel .filter-option").length > 0, null, { timeout: 120_000 });
  await settle();
});
