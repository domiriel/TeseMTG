// End-to-end tests for cross-view linking: interactions in one view must show
// up in every other view exactly as the shared selection model
// (core/linking.js) computes them in Node on the same data.

import "../helpers/env.mjs";
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startServer, launch, openApp } from "./harness.mjs";
import { loadDataset, filters } from "../helpers/data.mjs";
import { prepareCards, createFilterEngine, createLinker, createScatterPrep } from "../../core/index.js";

const cards = prepareCards(loadDataset());
const engine = createFilterEngine(cards);
const linker = createLinker(cards, engine);
const scatterPrep = createScatterPrep(cards);
const base = engine.run(filters(), "price_eur", "AND-OR");
const scatterNames = new Set(scatterPrep.prepare(base.cards, "price_eur").map((d) => d.name));

/** What every view should show for a selection (Map source → predicate). */
function expected(sources) {
  const s = linker.summarize(linker.selectionMask(sources, base.mask));
  return {
    names: [...s.get("names").keys()].filter((n) => scatterNames.has(n)).sort(),
    identities: [...s.get("identities").keys()].sort(),
    sets: [...s.get("sets").keys()].sort(),
    years: [...s.get("years").keys()].sort((a, b) => a - b),
    rarities: [...s.get("rarities").keys()].sort(),
    originalities: [...s.get("originalities").keys()].sort(),
  };
}

let server, session, page;

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

afterEach(async () => {
  await page.mouse.move(2, 2);
  await page.$eval("#clearAllButton", (b) => b.click());
  await settle();
});

const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 450)));

// --- reading what the views show ------------------------------------------------

async function shown() {
  return page.evaluate(() => {
    const sel = (els) => els.filter((e) => e.classList.contains("selectedHovered"));
    const rects = [...document.querySelectorAll(".IcicleChart rect.icicle-rect")];
    return {
      names: document
        .querySelector(".Scatterplot")
        .__scatter.points()
        .filter((p) => p.selected)
        .map((p) => p.name)
        .sort(),
      identities: sel(rects)
        .filter((e) => e.__data__.depth === 2)
        .map((e) => e.__data__.data.name)
        .sort(),
      sets: sel([...document.querySelectorAll(".TimelineView .set-rect")]).map((e) => e.__data__.name).sort(),
      years: [...document.querySelectorAll(".LineChart .selected-hover-line")]
        .map((e) => +e.getAttribute("data-year"))
        .sort((a, b) => a - b),
      rarities: sel([...document.querySelectorAll(".AlluvialChart g.node rect")])
        .filter((e) => e.__data__.x0 !== 0)
        .map((e) => e.__data__.name)
        .sort(),
      originalities: sel([...document.querySelectorAll(".AlluvialChart g.node rect")])
        .filter((e) => e.__data__.x0 === 0)
        .map((e) => e.__data__.name)
        .sort(),
      drawer: document.querySelector("#pagination-nav span")?.textContent.trim(),
    };
  });
}

/** Views only draw elements present in the filtered data; compare on those. */
function assertViewsMatch(act, exp) {
  assert.deepEqual(act.names, exp.names, "Scatterplot selected dots");
  assert.deepEqual(act.identities, exp.identities, "Icicle selected identities");
  assert.deepEqual(act.sets, exp.sets.filter((s) => act.allSets.has(s)), "Timeline selected sets");
  assert.deepEqual(act.rarities, exp.rarities, "Alluvial selected rarities");
  assert.deepEqual(act.originalities, exp.originalities, "Alluvial selected originalities");
}

async function shownWithUniverse() {
  const act = await shown();
  act.allSets = new Set(await page.$$eval(".TimelineView .set-rect", (els) => els.map((e) => e.__data__.name)));
  return act;
}

// --- interacting ----------------------------------------------------------------

async function clickDatum(selector, predicateSrc, arg) {
  const handle = await page.evaluateHandle(
    ([sel, src, a]) => {
      const pred = new Function("d", "a", `return (${src})(d, a);`);
      return [...document.querySelectorAll(sel)].find((el) => pred(el.__data__, a));
    },
    [selector, predicateSrc, arg]
  );
  const el = handle.asElement();
  assert.ok(el, `element for ${selector} ${arg}`);
  await el.scrollIntoViewIfNeeded();
  await el.click();
  await settle();
}

const clickIcicle = (name) =>
  clickDatum(".IcicleChart rect.icicle-rect", "(d, a) => d.depth === 2 && d.data.name === a", name);
const clickSet = (name) => clickDatum(".TimelineView .set-rect", "(d, a) => d.name === a", name);
const clickAlluvialNode = (name) => clickDatum(".AlluvialChart g.node rect", "(d, a) => d.name === a", name);
const clickYear = (year) =>
  clickDatum(".LineChart circle.data-point", "(d, a) => d.year.getFullYear() === a", year);

// --- tests ------------------------------------------------------------------------

test("Timeline set click selects that set's cards in every view", async () => {
  await clickSet("Dominaria");
  const exp = expected(new Map([["timeline", { sets: new Set(["Dominaria"]) }]]));
  assert.ok(exp.names.length > 0);
  assertViewsMatch(await shownWithUniverse(), exp);
});

test("Alluvial node click selects that rarity in every view", async () => {
  await clickAlluvialNode("mythic");
  const exp = expected(new Map([["alluvial", { rarities: new Set(["mythic"]) }]]));
  assertViewsMatch(await shownWithUniverse(), exp);
  assert.deepEqual((await shown()).years, exp.years, "Line chart selected years");
});

test("selections from different views combine with AND, on the same printings", async () => {
  await clickIcicle("WU");
  await clickYear(2019);
  const exp = expected(
    new Map([
      ["icicle", { identities: new Set(["WU"]) }],
      ["years", { years: new Set([2019]) }],
    ])
  );
  assert.ok(exp.names.length > 0);
  const act = await shownWithUniverse();
  assertViewsMatch(act, exp);
  assert.deepEqual(act.years, [2019]);
});

test("Scatterplot dot click selects exactly that card", async () => {
  const p = await page.$eval(".Scatterplot", (el) => {
    const pt = el.__scatter.points().find((q) => q.shown);
    const canvas = el.querySelector("canvas").getBoundingClientRect();
    return { name: pt.name, x: canvas.x + pt.x, y: canvas.y + pt.y };
  });
  await page.mouse.click(p.x, p.y);
  await settle();
  const act = await shown();
  assert.deepEqual(act.names, [p.name]);
  assert.equal(act.drawer, "Page 1 of 1");
});

test("selection survives a global filter change and is re-evaluated", async () => {
  await clickIcicle("WU");
  await page.click(".FilterPanel .filter-section:has-text('Rarity') .dropdown-header");
  await page.click(".FilterPanel .filter-option[data-category='Rarity'][data-value='mythic']");
  await settle();
  const filtered = engine.run(filters({ Rarity: ["mythic"] }), "price_eur", "AND-OR");
  const s = linker.summarize(linker.selectionMask(new Map([["icicle", { identities: new Set(["WU"]) }]]), filtered.mask));
  const names = new Set(scatterPrep.prepare(filtered.cards, "price_eur").map((d) => d.name));
  const expNames = [...s.get("names").keys()].filter((n) => names.has(n)).sort();
  assert.ok(expNames.length > 0);
  assert.deepEqual((await shown()).names, expNames);
  await page.click(".FilterPanel .filter-option[data-category='Rarity'][data-value='mythic']");
  await settle();
});

test("hovering an Alluvial link highlights exactly the matching elements elsewhere", async () => {
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".AlluvialChart path.link")].find(
      (e) => e.__data__.source.name === "original" && e.__data__.target.name === "mythic"
    );
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await settle();
  const hovered = await page.evaluate(() => ({
    identities: [...document.querySelectorAll(".IcicleChart rect.icicle-rect.hover-temp")]
      .filter((e) => e.__data__.depth === 2)
      .map((e) => e.__data__.data.name)
      .sort(),
    pairs: [...document.querySelectorAll(".AlluvialChart path.link.hover-temp")].map(
      (e) => `${e.__data__.source.name}|${e.__data__.target.name}`
    ),
  }));
  const s = linker.summarize(linker.predicateMask({ pairs: new Set(["original|mythic"]) }, base.mask));
  assert.deepEqual(hovered.identities, [...s.get("identities").keys()].sort());
  assert.deepEqual(hovered.pairs, ["original|mythic"]);
});

test("double-clicking empty space in a view clears every selection", async () => {
  await clickIcicle("WU");
  await clickSet("Dominaria");
  assert.ok((await shown()).names.length > 0);
  const box = await (await page.$(".AlluvialChart svg")).boundingBox();
  await page.mouse.dblclick(box.x + 5, box.y + box.height - 5);
  await settle();
  const act = await shown();
  assert.deepEqual([act.names, act.identities, act.sets, act.years], [[], [], [], []]);
});
