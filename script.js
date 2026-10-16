// script.js
//
// Purpose
// -------
// App bootstrap & orchestration:
// • Loads the dataset once and prepares derived card fields (core/cards.js)
// • Builds the filter engine (core/filtering.js): index + memoized filtering
//   and Filter Panel counts in a single pass
// • Wires global state + subscriptions + (debounced) resize handling
// • Computes the filtered view and instantiates/updates all coordinated charts
// • Manages "illegal" (unpriced) cards
//
// Key Concepts
// ------------
// filterEngine.run(selectedFilters, priceAttr, mode) → { cards, counts, mask }
//   Memoized on its inputs: identical inputs return the *same* object, which is
//   how the subscriber below knows nothing relevant changed.
// selectedFilters: { [Category]: Set<string> } active filter values per category
// filter logic: "AND-OR" (AND across categories, OR within) or "AND-AND"
//
// External Modules
// ----------------
// • state.js: global state (getState / updateState / subscribe / loadFiltersFromURL)
// • core/*: pure data layer (tested in tests/)
// • idioms/*: chart modules (create*/update*), HiddenDrawer
// • LoadingAnimation.js: showLoader/hideLoader
//

// -----------------------------------------------------------------------------

import {
  getState,
  subscribe,
  updateState,
  loadFiltersFromURL,
  getEffectivePriceAttribute,
} from "./state.js";
import { prepareCards, createFilterEngine, createScatterPrep } from "./core/index.js";
// @ts-ignore
import { createIcicleChart } from "./idioms/IcicleChart.js";
import { createAlluvialChart } from "./idioms/AlluvialChart.js";
import { createTimelineView } from "./idioms/TimelineView.js";
import { createScatterPlot, updateScatterPlot } from "./idioms/Scatterplot.js";
import { createStackedLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";
import {
  createHiddenDrawer,
  updateDrawer,
  createIllegalDrawer,
} from "./idioms/HiddenDrawer.js";
import { showLoader, hideLoader } from "./idioms/LoadingAnimation.js";
import { initLinking, setFilteredMask } from "./idioms/Linking.js";

const RESIZE_DEBOUNCE_MS = 150;

/** Older versions cached the filter index in OPFS; remove the stale file. */
async function removeLegacyOPFSCache() {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry("groupedData.json");
  } catch {
    // Not there (or OPFS unavailable): nothing to do.
  }
}

// Prepared Scatterplot data per (filter result, price attribute). Filter
// results are memoized by the engine, so going back to an earlier filter state
// (e.g. clearing a filter) reuses the prepared data instead of rebuilding it.
const scatterCache = new Map();
const SCATTER_CACHE_SIZE = 8;

function scatterDataFor(scatterPrep, result, priceAttr) {
  let byPrice = scatterCache.get(result);
  if (!byPrice) scatterCache.set(result, (byPrice = new Map()));
  let data = byPrice.get(priceAttr);
  if (!data) {
    data = scatterPrep.prepare(result.cards, priceAttr);
    byPrice.set(priceAttr, data);
  }
  // Keep the most recently used results; drop the oldest.
  scatterCache.delete(result);
  scatterCache.set(result, byPrice);
  if (scatterCache.size > SCATTER_CACHE_SIZE) scatterCache.delete(scatterCache.keys().next().value);
  return data;
}

/** Run the memoized filter engine for the current state. */
function runFilters(state) {
  return state.filterEngine.run(
    state.selectedFilters,
    getEffectivePriceAttribute(state),
    state.filterLogicMode || "AND-OR"
  );
}

/**
 * App entry point:
 * 1) Load data, derive card fields, build the filter engine
 * 2) Initialize global state and register listeners
 * 3) Create all coordinated views
 * 4) Set up reactive updates and responsive resize handling
 */
async function init() {
  showLoader();

  // Ensure a single shared tooltip container exists (used by multiple views)
  if (!d3.select("#tooltip").node()) {
    d3.select("body")
      .append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("display", "none");
  }

  const t0 = performance.now();

  // 1) Load dataset (once) and build the index
  const originalData = prepareCards(await d3.json("./data/dataset_card_details.json"));
  const filterEngine = createFilterEngine(originalData);
  const scatterPrep = createScatterPrep(originalData);
  initLinking(originalData, filterEngine);
  removeLegacyOPFSCache();
  console.log("Data loaded and indexed in", (performance.now() - t0).toFixed(2), "ms");

  const sharedFilters = loadFiltersFromURL();
  if (sharedFilters) {
    // Keep every category present so views can rely on the full shape.
    const merged = { ...getState().selectedFilters };
    for (const [k, v] of Object.entries(sharedFilters)) merged[k] = v;
    updateState({ selectedFilters: merged });
  }

  updateState({
    originalData,
    filterEngine,
    scatterPrep,
    groupedData: filterEngine.index,
  });
  const t1 = performance.now();

  // 2) Hovered/selected cards → drawer only.
  getState().onChange("hoveredCards", (hoveredCards) => updateDrawer(hoveredCards));

  // 3) Initial render
  const state = getState();
  const selectedPriceAttribute = getEffectivePriceAttribute(state);
  let lastResult = runFilters(state);
  const filtered = lastResult.cards;
  setFilteredMask(lastResult.mask);

  createIcicleChart(filtered, ".IcicleChart");
  createFilterPanel(lastResult, ".FilterPanel", state.selectedFilters);
  updateFilterPanel(lastResult, state.selectedFilters, ".FilterPanel");
  createAlluvialChart(filtered, ".AlluvialChart", false, selectedPriceAttribute);

  // Illegal (unpriced) drawer content (prepared for the scatter’s shape)
  const cardsInIllegalDrawer = originalData.filter(isCardPriceless);
  createIllegalDrawer(scatterPrep.prepare(cardsInIllegalDrawer, selectedPriceAttribute), ".IllegalDrawerArea");
  createHiddenDrawer(".HiddenDrawerArea");

  createTimelineView(filtered, ".TimelineView");
  createScatterPlot(scatterDataFor(scatterPrep, lastResult, selectedPriceAttribute), ".Scatterplot", false, selectedPriceAttribute);
  createStackedLineChart(filtered, ".LineChart");

  updateDrawer([]);

  const TFinal = performance.now();
  console.log("All charts created in", (TFinal - t1).toFixed(2), "ms");
  console.log("Total initialization time:", (TFinal - t0).toFixed(2), "ms");
  hideLoader(150);

  function renderAll(result) {
    const s = getState();
    const priceAttr = getEffectivePriceAttribute(s);
    const data = result.cards;
    createIcicleChart(data, ".IcicleChart", true);
    createTimelineView(data, ".TimelineView", true);
    createStackedLineChart(data, ".LineChart", true);
    createAlluvialChart(data, ".AlluvialChart", true, priceAttr);
    updateScatterPlot(scatterDataFor(s.scatterPrep, result, priceAttr), priceAttr);
    updateDrawer(s.hoveredCards);
  }

  // 4) Filters / price / logic mode changed → re-filter and re-render.
  // Every updateState() reaches this subscriber (hover updates too); the
  // memoized engine returns the same result object when the filter inputs are
  // unchanged, so those calls stop here.
  subscribe((s) => {
    const result = runFilters(s);
    if (result === lastResult) return;
    lastResult = result;

    showLoader();
    const t = performance.now();
    updateFilterPanel(result, s.selectedFilters, ".FilterPanel");
    setFilteredMask(result.mask); // re-evaluate selection/hover on the new set
    renderAll(result);
    console.log(`[Total: ${(performance.now() - t).toFixed(2)}ms] Full update cycle`);
    hideLoader(100);
  });

  // 5) Responsive: re-render charts once the window stops resizing.
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderAll(lastResult), RESIZE_DEBOUNCE_MS);
  });
}

/** Predicate for “priceless” cards: no positive EUR/USD/TIX value in any variant. */
function isCardPriceless(card) {
  return (
    typeof card.price_usd !== "number" ||
    typeof card.price_usd_foil !== "number" ||
    typeof card.price_usd_etched !== "number" ||
    typeof card.price_eur !== "number" ||
    typeof card.price_eur_foil !== "number" ||
    typeof card.price_tix !== "number" ||
    (card.price_usd <= 0 &&
      card.price_usd_foil <= 0 &&
      card.price_usd_etched <= 0 &&
      card.price_eur <= 0 &&
      card.price_eur_foil <= 0 &&
      card.price_tix <= 0)
  );
}

// Kick off the app
init().catch(console.error);
