// main.js
//
// Purpose
// -------
// App bootstrap & orchestration:
// • Loads dataset and (optionally) grouped-data cache from OPFS
// • Builds + caches groupedData for fast filtering
// • Wires global state + subscriptions + resize handling
// • Computes filtered views and instantiates/updates all coordinated charts
// • Manages price attribute resolution and “illegal” (unpriced) cards
//
// Key Concepts
// ------------
// groupedData: { [Category]: Map<Value, Card[]> } precomputed index to accelerate filtering
// selectedFilters: { [Category]: Set<string> } active filter values per category
// filterApplicationOrder: deterministic order to combine categories
// filter logic: "AND-OR" (AND across categories, OR within) or "AND-AND"
//
// External Modules
// ----------------
// • state.js: global state (getState / updateState / subscribe / loadFiltersFromURL)
// • idioms/*: chart modules (create*/update*), HiddenDrawer
// • LoadingAnimation.js: showLoader/hideLoader
//

// -----------------------------------------------------------------------------


import {
  getState,
  subscribe,
  updateState,
  loadFiltersFromURL,
} from "./state.js";
// @ts-ignore
import { createIcicleChart } from "./idioms/IcicleChart.js";
import { createAlluvialChart } from "./idioms/AlluvialChart.js";
import { createTimelineView } from "./idioms/TimelineView.js";
import {
  createScatterPlot,
  updateScatterPlot,
  prepareScatterData,
} from "./idioms/Scatterplot.js";
import { createStackedLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";
import {
  createHiddenDrawer,
  updateDrawer,
  createIllegalDrawer,
} from "./idioms/HiddenDrawer.js";
import { showLoader, hideLoader } from "./idioms/LoadingAnimation.js";

// Deterministic category order for filter application.
// (Across categories: AND; within a category: OR in AND-OR mode, AND in AND-AND mode)
const filterApplicationOrder = [
  "FreeTextSearch",
  "Set Names",
  "Set Types",
  "Keywords",
  "Year",
  "Originality",
  "Rarity",
  "Nº of Colors",
  "Color Identity",
  "Supertypes",
  "Types",
  "Subtypes",
];

// Bump this when grouped-data schema changes to invalidate OPFS cache.
const GROUPED_DATA_VERSION = "v7";

/**
 * Resolve the effective price attribute from state.
 * - tix → price_tix
 * - eur/usd (+ optional suffix) → price_{currency}{suffix}
 */
export function getEffectivePriceAttribute(state) {
  const { selectedPriceCurrency, selectedPriceSuffix } = state;
  return selectedPriceCurrency === "tix"
    ? "price_tix"
    : `price_${selectedPriceCurrency}${selectedPriceSuffix}`;
}

/**
 * Persist groupedData to OPFS (Origin Private File System) as a compact JSON,
 * storing only card indices to reduce file size and hydration time.
 */
async function writeGroupedDataToOPFS(groupedData) {
  console.log("Saving grouped data to OPFS");
  const serializable = {
    __version: GROUPED_DATA_VERSION,
    data: {},
  };

  for (const [category, map] of Object.entries(groupedData)) {
    serializable.data[category] = {};
    for (const [key, cards] of map.entries()) {
      serializable.data[category][key] = cards.map((card) => card.index);
    }
  }

  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle("groupedData.json", { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(serializable));
  await writable.close();
}

/**
 * Attempt to hydrate groupedData from OPFS cache.
 * Returns `null` on cache miss or version mismatch (so we rebuild).
 */
async function readGroupedDataFromOPFS(originalData) {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("groupedData.json");
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);

    console.log(parsed.__version);
    if (parsed.__version !== GROUPED_DATA_VERSION) {
      console.warn("Grouped data version mismatch. Rebuilding cache.");
      return null;
    }

    const raw = parsed.data;
    const revived = {};
    for (const [category, obj] of Object.entries(raw)) {
      revived[category] = new Map();
      for (const [key, cards] of Object.entries(obj)) {
        revived[category].set(
          key,
          cards.map((index) => originalData[index])
        );
      }
    }
    return revived;
  } catch (err) {
    console.warn("OPFS cache miss or error:", err);
    return null;
  }
}

/** Manually clear the OPFS groupedData cache (dev/force refresh). */
async function clearOPFSCache() {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry("groupedData.json");
    console.log("OPFS cache cleared.");
  } catch (err) {
    console.warn("No groupedData.json found in OPFS.");
  }
}

let isUpdatingFilteredData = false; // guard to avoid re-entrancy inside subscribe()
const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

/**
 * App entry point:
 * 1) Load data & warm/hydrate groupedData (OPFS if possible)
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

  // 1) Load raw dataset
  let originalData;
  const raw = await d3.json("./data/dataset_card_details.json");
  originalData = JSON.parse(JSON.stringify(raw));

  // 2) Try to hydrate groupedData from OPFS; fallback to rebuilding
  let groupedData = await readGroupedDataFromOPFS(originalData);
  if (!groupedData) {
    const raw = await d3.json("./data/dataset_card_details.json");
    originalData = JSON.parse(JSON.stringify(raw));
    const tDataLoaded = performance.now();
    console.log("Data loaded in", (tDataLoaded - t0).toFixed(2), "ms");

    groupedData = buildGroupedData(originalData);
    await writeGroupedDataToOPFS(groupedData);

    const tgrouped = performance.now();
    console.log("Grouped data in", (tgrouped - t0).toFixed(2), "ms");
  }

  // Make data available in global state
  updateState({ originalData, groupedData });
  const t1 = performance.now();

  // 3) Reactive: when hoveredCards change, update the Drawer (and any cross-highlights)
  getState().onChange("hoveredCards", (hoveredCards) => {
    showLoader();
    const t0 = performance.now();

    // (Reserved timing checkpoints for other coordinated highlights)
    updateDrawer(hoveredCards);

    requestAnimationFrame(() => {
      updateState({
        isHoverUpdate: false,
        suppressGlobalNotify: true,
      });
    });

    hideLoader(); // fade out the loader (kept slight delay for UX consistency)
  });

  // 4) Initialize charts using either shared filters (URL) or current state
  const stateSnapshot = getState();
  const sharedFilters = loadFiltersFromURL();

  const selectedPriceAttribute = getEffectivePriceAttribute(stateSnapshot);
  const freeTextSearch = stateSnapshot.freeTextSearch;
  let selectedFilters = sharedFilters || stateSnapshot.selectedFilters;

  // Compute initial filtered dataset
  const filtered = getFilteredData(
    originalData,
    selectedFilters,
    selectedPriceAttribute,
    freeTextSearch
  );

  // Create all views (first render = !update)
  createIcicleChart(filtered, ".IcicleChart");
  createFilterPanel(originalData, filtered, ".FilterPanel", selectedFilters);
  updateFilterPanel(originalData, filtered, selectedFilters);
  createAlluvialChart(filtered, ".AlluvialChart", false, selectedPriceAttribute);

  // Illegal (unpriced) drawer content (prepared for the scatter’s shape)
  cardsInIllegalDrawer = computeIllegalCards(originalData);
  const processedIllegalData = prepareScatterData(
    cardsInIllegalDrawer,
    selectedPriceAttribute
  );

  createIllegalDrawer(processedIllegalData, ".IllegalDrawerArea");
  createHiddenDrawer(".HiddenDrawerArea");

  createTimelineView(filtered, ".TimelineView");
  const processedScatterData = prepareScatterData(filtered, selectedPriceAttribute);
  createScatterPlot(processedScatterData, ".Scatterplot", false, selectedPriceAttribute);
  createStackedLineChart(filtered, ".LineChart");

  // Start with an empty drawer
  updateDrawer([]);

  // Cache baseline inputs to support “no-op” short-circuiting later
  updateState({
    lastFilterInputs: {
      selectedFilters: cloneFilters(selectedFilters),
      selectedPriceCurrency: stateSnapshot.selectedPriceCurrency,
      selectedPriceSuffix: stateSnapshot.selectedPriceSuffix,
      freeTextSearch,
    },
    originalFilteredData: filtered,
    previousFilteredData: filtered,
    lastFilteredData: filtered,
    originalSelectedFilters: cloneFilters(selectedFilters),
  });

  const TFinal = performance.now();
  console.log("All charts created in", (TFinal - t1).toFixed(2), "ms");
  console.log("Total initialization time:", (TFinal - t0).toFixed(2), "ms");

  hideLoader(150);

  // 5) Global state subscription — recompute + update all views when filters/price/search change
  subscribe((state) => {
    showLoader();
    if (isUpdatingFilteredData) return; // guard during own updates
    if (state.isHoverUpdate) return;    // skip if only hover-side effects

    const t0 = performance.now();
    const context = state.updateContext || "default";
    const { selectedFilters, freeTextSearch } = state;
    const selectedPriceAttribute = getEffectivePriceAttribute(state);

    // Re-filter with current inputs
    const filteredData = getFilteredData(
      originalData,
      selectedFilters,
      selectedPriceAttribute,
      freeTextSearch
    );

    // Update filter panel counts + pills
    updateFilterPanel(originalData, filteredData, selectedFilters, ".FilterPanel");

    // Early exit: avoid redundant UI thrash if nothing material changed in default context
    if (
      window._prevFilteredLength === filteredData.length &&
      window._prevPriceAttribute === selectedPriceAttribute &&
      context === "default"
    ) {
      hideLoader(100);
      return;
    }

    window._prevFilteredLength = filteredData.length;
    window._prevPriceAttribute = selectedPriceAttribute;

    // Push updates to every coordinated view
    createIcicleChart(filteredData, ".IcicleChart", true);
    createTimelineView(filteredData, ".TimelineView", true);
    createStackedLineChart(filteredData, ".LineChart", true);
    createAlluvialChart(filteredData, ".AlluvialChart", true, selectedPriceAttribute);

    // Scatter needs pre-aggregation by card; then update only
    const processedData = prepareScatterData(filteredData, selectedPriceAttribute);
    updateScatterPlot(processedData, selectedPriceAttribute);

    // Keep drawer aligned with current hoveredCards
    const { hoveredCards } = getState();
    updateDrawer(hoveredCards);

    const total = (performance.now() - t0).toFixed(2);
    console.log(`[Total: ${total}ms] Full update cycle`);

    hideLoader(100);
  });

  // 6) Responsive: rebuild/update charts on resize (keeps layout crisp)
  window.addEventListener("resize", () => {
    const { selectedFilters, freeTextSearch, hoveredCards } = getState();
    const selectedPriceAttribute = getEffectivePriceAttribute(getState());
    const filteredData = getFilteredData(
      originalData,
      selectedFilters,
      selectedPriceAttribute,
      freeTextSearch
    );

    // On resize we re-create charts that depend on container size,
    // and update scatter (which caches scales/metadata)
    createAlluvialChart(filteredData, ".AlluvialChart", true, selectedPriceAttribute);
    createTimelineView(filteredData, ".TimelineView", true);
    createStackedLineChart(filteredData, ".LineChart", true);
    createIcicleChart(filteredData, ".IcicleChart", true);
    updateScatterPlot(prepareScatterData(filteredData, selectedPriceAttribute), selectedPriceAttribute);

    // Filter panel reflow (search inputs, option counts remain correct)
    createFilterPanel(originalData, filteredData, ".FilterPanel", selectedFilters);

    // Keep the drawer’s items visible
    updateDrawer(hoveredCards);
  });
}

/**
 * Core filtering pipeline.
 * - Applies category filters per filterApplicationOrder
 * - Combines category matches per current logic mode
 * - Applies FreeTextSearch as a final pass (card name)
 * Returns a materialized array of cards.
 */
export function filterData(groupedData, selectedFilters, options = {}) {
  const { excludeCategory } = options;
  const mode = getState().filterLogicMode || "AND-OR";
  const applyAndWithin = mode.endsWith("AND");

  let filteredSet = new Set();
  const perCategoryMatches = [];

  // Respect the deterministic order. If missing, fallback to object keys.
  for (const category of filterApplicationOrder || Object.keys(selectedFilters)) {
    if (excludeCategory && category === excludeCategory) continue;

    const values = selectedFilters[category];
    if (!values || values.size === 0) continue;

    const group = groupedData[category];
    if (!group) continue;

    let matched = new Set();

    if (applyAndWithin) {
      // Strict AND within a category
      const sets = Array.from(values)
        .map((val) => group.get(val))
        .filter((set) => set);

      if (sets.length === 1) {
        matched = new Set(sets[0]);
      } else if (sets.length > 1) {
        matched = sets.reduce((a, b) => intersectSets(new Set(a), new Set(b)));
      } else {
        matched = new Set();
      }
    } else {
      // OR within a category
      values.forEach((val) => {
        const set = group.get(val);
        if (set) set.forEach((card) => matched.add(card));
      });
    }

    perCategoryMatches.push(matched);
  }

  // AND across categories (empty perCategoryMatches = "no filters" → start from originalData)
  filteredSet = perCategoryMatches.reduce(
    (a, b) => intersectSets(a, b),
    new Set(getState().originalData || [])
  );

  // Free text search (simple name contains)
  const textTerms = selectedFilters["FreeTextSearch"];
  if (textTerms?.size > 0) {
    const searchTerms = Array.from(textTerms).map((t) => t.toLowerCase());
    filteredSet = new Set(
      [...filteredSet].filter((card) => {
        const cardText = [card.name?.toLowerCase() || ""];
        return searchTerms.some((term) =>
          cardText.some((text) => text.includes(term))
        );
      })
    );
  }

  return Array.from(filteredSet);
}

/** Set intersection helper. */
function intersectSets(setA, setB) {
  return new Set([...setA].filter((x) => setB.has(x)));
}



/**
 * Precompute groupedData indexes for all supported categories.
 * This runs once (or when OPFS cache invalidates).
 */
function buildGroupedData(data) {
  const grouped = {
    Originality: new Map(),
    Keywords: new Map(),
    Rarity: new Map(),
    Supertypes: new Map(),
    Types: new Map(),
    Subtypes: new Map(),
    "Set Types": new Map(),
    "Set Names": new Map(),
    Year: new Map(),
    "Nº of Colors": new Map(),
    "Color Identity": new Map(),
  };

  data.forEach((card) => {
    for (const category of Object.keys(grouped)) {
      const values = extractCardValues(card, category);
      values.forEach((value) => {
        if (!grouped[category].has(value)) {
          grouped[category].set(value, []);
        }
        grouped[category].get(value).push(card);
      });
    }
  });
  return grouped;
}

/** Extract *all* values for a category (for indexing). */
function extractCardValues(card, category) {
  switch (category) {
    case "Originality":
      return card.originality ? [card.originality] : [];
    case "Keywords":
      return Array.isArray(card.keywords)
        ? card.keywords.map((k) => k.trim())
        : [];
    case "Rarity":
      return card.rarity ? [card.rarity] : [];
    case "Supertypes":
      return card.supertype
        ? card.supertype.split(/[\s/]+/).map((v) => v.trim())
        : [];
    case "Types":
      return card.type ? card.type.split(/[\s/]+/).map((v) => v.trim()) : [];
    case "Subtypes":
      return card.subtype
        ? card.subtype.split(/[\s/]+/).map((v) => v.trim())
        : [];
    case "Set Types":
      return card.set_type ? [card.set_type] : [];
    case "Set Names":
      return card.set_name ? [card.set_name] : [];
    case "Year":
      if (!card.release_date) return [];
      return [new Date(card.release_date).getFullYear().toString()];
    case "Nº of Colors":
      if (card.number_of_colours === 1) return ["1 color"];
      if (card.number_of_colours === 0) return ["colorless"];
      return [`${card.number_of_colours} colors`];
    case "Color Identity":
      if (!Array.isArray(card.color_identity) || card.color_identity.length === 0)
        return ["colorless"];
      const sortedColors = card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("");
      return [sortedColors.toLowerCase()];
    default:
      return [];
  }
}

/** Extract a *single* value (string) for a category (for predicate checks). */
function extractCardValue(card, category) {
  switch (category) {
    case "Keywords":
      return Array.isArray(card.keywords) ? card.keywords.join(" ") : null;

    case "Supertypes":
      return card.supertype;
    case "Types":
      return card.type;
    case "Subtypes":
      return card.subtype;
    case "Set Types":
      return card.set_type;
    case "Originality":
      return card.originality;
    case "Rarity":
      return card.rarity;
    case "Set Names":
      return card.set_name;
    case "Year":
      if (!card.release_date) return null;
      return new Date(card.release_date).getFullYear().toString();

    case "Nº of Colors":
      if (card.number_of_colours === 0) return "colorless";
      if (card.number_of_colours === 1) return "1 color";
      return `${card.number_of_colours} colors`;

    case "Color Identity":
      if (!Array.isArray(card.color_identity) || card.color_identity.length === 0) {
        return "colorless";
      }
      return card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("")
        .toLowerCase();

    default:
      return null;
  }
}

/**
 * Filter pipeline façade:
 * - Short-circuits for “no filters” and common input-equality cases
 * - Applies filterData + price-only constraint
 * - Updates memo inputs in state to enable incremental performance wins
 */
export function getFilteredData(
  originalData,
  selectedFilters,
  selectedPriceAttribute,
  freeTextSearch = ""
) {
  const state = getState();
  const groupedData = state.groupedData || buildGroupedData(originalData);

  console.log("Filtering with", selectedFilters, freeTextSearch);

  // Case 1: No filters, no freetext → just filter by price availability
  if (isFilterEmpty(selectedFilters) && freeTextSearch === "") {
    console.log("No filters applied, returning original data");
    return filterPriceOnly(originalData, selectedPriceAttribute);
    }

  // Case 2: Inputs identical to the original baseline → use originalFilteredData
  const currentPriceAttribute = getEffectivePriceAttribute(state);
  if (
    shallowCompareFilters(selectedFilters, state.originalSelectedFilters) &&
    !freeTextSearch &&
    currentPriceAttribute ===
      getEffectivePriceAttribute({
        selectedPriceCurrency: state.lastFilterInputs?.selectedPriceCurrency,
        selectedPriceSuffix: state.lastFilterInputs?.selectedPriceSuffix,
      })
  ) {
    console.log("Reverting to original filtered data");
    return (
      state.originalFilteredData ||
      filterPriceOnly(originalData, selectedPriceAttribute)
    );
  }

  // Case 3: Inputs equal to last invocation → reuse lastFilteredData
  const lastInputs = state.lastFilterInputs || {};
  const inputsMatch =
    shallowCompareFilters(selectedFilters, lastInputs.selectedFilters) &&
    lastInputs.selectedPriceCurrency === state.selectedPriceCurrency &&
    lastInputs.selectedPriceSuffix === state.selectedPriceSuffix &&
    freeTextSearch === lastInputs.freeTextSearch &&
    lastInputs.filterLogicMode === state.filterLogicMode;

  if (inputsMatch && state.lastFilteredData) {
    return state.lastFilteredData;
  }

  // Compute new filtered set
  isUpdatingFilteredData = true;

  const filtered = filterData(groupedData, selectedFilters);
  const cleaned = filterPriceOnly(filtered, selectedPriceAttribute);

  updateState({
    lastFilterInputs: {
      selectedFilters: cloneFilters(selectedFilters),
      selectedPriceAttribute,
      freeTextSearch,
      filterLogicMode: state.filterLogicMode,
    },
    lastFilteredData: cleaned,
  });

  isUpdatingFilteredData = false;

  return cleaned;
}

/** Post-filter constraint: keep only cards with a positive numeric value in `priceAttr`. */
export function filterPriceOnly(cards, priceAttr) {
  return cards.filter(
    (card) => typeof card[priceAttr] === "number" && card[priceAttr] > 0
  );
}

/** Shallow compare two `{ [category]: Set }` maps. */
function shallowCompareFilters(a, b) {
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => {
    const aSet = a[key];
    const bSet = b[key];
    if (aSet?.size !== bSet?.size) return false;
    for (const val of aSet) {
      if (!bSet.has(val)) return false;
    }
    return true;
  });
}

/** True iff all categories are empty (no active filters). */
export function isFilterEmpty(selectedFilters) {
  return Object.values(selectedFilters).every((set) => set.size === 0);
}

/** Deep clone a `{ [category]: Set }` map (values remain strings). */
function cloneFilters(filters) {
  const cloned = {};
  for (const key in filters) {
    cloned[key] = new Set(filters[key]);
  }
  return cloned;
}

/** Predicate for “priceless” cards: no valid EUR/USD/TIX value > 0 across any variant. */
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

let cardsInIllegalDrawer = [];

/** Extract all cards that fail the pricing requirement. */
function computeIllegalCards(data) {
  return data.filter(isCardPriceless);
}

// Kick off the app
init().catch(console.error);
