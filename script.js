import { getState, subscribe, updateState, loadFiltersFromURL } from "./state.js";
import { createIcicleChart, highlightIcicleRect } from "./idioms/IcicleChart.js";
import { createAlluvialChart, highlightAlluvialElements } from "./idioms/AlluvialChart.js";
import { createTimelineView, highlightTimelineSets } from "./idioms/TimelineView.js";
import { createScatterPlot, updateScatterPlot, prepareScatterData } from "./idioms/Scatterplot.js";
import { createStackedLineChart, highlightLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";
import { createHiddenDrawer, updateDrawer } from "./idioms/HiddenDrawer.js";
import { showLoader, hideLoader } from "./idioms/LoadingAnimation.js";

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
  "Subtypes"
];
const GROUPED_DATA_VERSION = "v4";
export function getEffectivePriceAttribute(state) {
  const { selectedPriceCurrency, selectedPriceSuffix } = state;
  return selectedPriceCurrency === "tix"
    ? "price_tix"
    : `price_${selectedPriceCurrency}${selectedPriceSuffix}`;
}

async function writeGroupedDataToOPFS(groupedData) {
  console.log("Saving grouped data to OPFS");
  const serializable = {
    __version: GROUPED_DATA_VERSION, // Save the version
    data: {}
  };

  for (const [category, map] of Object.entries(groupedData)) {
    serializable.data[category] = {};
    for (const [key, cards] of map.entries()) {
      serializable.data[category][key] = cards.map(card => card.index);
    }
  }

  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle("groupedData.json", { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(serializable));
  await writable.close();
}


async function readGroupedDataFromOPFS(originalData) {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("groupedData.json");
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);

    console.log(parsed.__version)
    if (parsed.__version !== GROUPED_DATA_VERSION) {
      console.warn("Grouped data version mismatch. Rebuilding cache.");
      return null;
    }

    const raw = parsed.data;
    const revived = {};
    for (const [category, obj] of Object.entries(raw)) {
      revived[category] = new Map();
      for (const [key, cards] of Object.entries(obj)) {
        revived[category].set(key, cards.map(index => originalData[index]));
      }
    }
    return revived;
  } catch (err) {
    console.warn("OPFS cache miss or error:", err);
    return null;
  }
}


async function clearOPFSCache() {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry("groupedData.json");
    console.log("OPFS cache cleared.");
  } catch (err) {
    console.warn("No groupedData.json found in OPFS.");
  }
}

let isUpdatingFilteredData = false;
const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

async function init() {
  showLoader();

  if (!d3.select("#tooltip").node()) {
    d3.select("body")
      .append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("display", "none");
  }

  const t0 = performance.now();
 let originalData;
const raw = await d3.json("./data/dataset_card_details.json");
originalData = JSON.parse(JSON.stringify(raw));

let groupedData = await readGroupedDataFromOPFS(originalData);
console.log(groupedData)
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

  updateState({ originalData, groupedData });
  const t1 = performance.now();

  let hoverTimeout = null;
getState().onChange("hoveredCards", (hoveredCards) => {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    const t0 = performance.now();
    showLoader();

    const t1 = performance.now();
    highlightAlluvialElements(hoveredCards);
    const t2 = performance.now();

    highlightIcicleRect(hoveredCards);
    const t3 = performance.now();

    highlightTimelineSets(hoveredCards);
    const t4 = performance.now();

    highlightLineChart(hoveredCards);
    const t5 = performance.now();

    updateDrawer(hoveredCards);

    const t6 = performance.now();

    // console.log(`Hover update timings:
    // Alluvial: ${(t2 - t1).toFixed(2)}ms
    // Icicle: ${(t3 - t2).toFixed(2)}ms
    // Timeline: ${(t4 - t3).toFixed(2)}ms
    // Line chart: ${(t5 - t4).toFixed(2)}ms
    // Drawer: ${(t6 - t5).toFixed(2)}ms
    // Total: ${(t6 - t0).toFixed(2)}ms`);
    updateState({
  isHoverUpdate: false,
  suppressGlobalNotify: true
});
    setTimeout(hideLoader, 150);
  }, 0);
});


  const stateSnapshot = getState();
  const sharedFilters = loadFiltersFromURL();

  const selectedPriceAttribute = getEffectivePriceAttribute(stateSnapshot);
  const freeTextSearch = stateSnapshot.freeTextSearch;
  let selectedFilters = sharedFilters || stateSnapshot.selectedFilters;

  console.log("Effective price attr on load:", selectedPriceAttribute);
  const filtered = getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch);
 

  createIcicleChart(filtered, ".IcicleChart");
  createFilterPanel(originalData, filtered, ".FilterPanel", selectedFilters);
  updateFilterPanel(originalData, filtered, selectedFilters);
  createAlluvialChart(filtered, ".AlluvialChart", false, selectedPriceAttribute);
  createHiddenDrawer(".HiddenDrawerArea");
  createTimelineView(filtered, ".TimelineView");
  const processedScatterData = prepareScatterData(filtered, selectedPriceAttribute);
  createScatterPlot(processedScatterData, ".Scatterplot", false, selectedPriceAttribute);
  createStackedLineChart(filtered, ".LineChart");

  highlightAlluvialElements([]);
  highlightIcicleRect([]);
  highlightTimelineSets([]);
  highlightLineChart([]);
  updateDrawer([]);

  updateState({
    lastFilterInputs: {
      selectedFilters: cloneFilters(selectedFilters),
selectedPriceCurrency: stateSnapshot.selectedPriceCurrency,
    selectedPriceSuffix: stateSnapshot.selectedPriceSuffix,
      freeTextSearch
    },
    originalFilteredData: filtered,
    previousFilteredData: filtered,
    lastFilteredData: filtered,
    originalSelectedFilters: cloneFilters(selectedFilters)
  });

  const TFinal = performance.now();
  console.log("All charts created in", (TFinal - t1).toFixed(2), "ms");
  console.log("Total initialization time:", (TFinal - t0).toFixed(2), "ms");

  hideLoader();

  subscribe((state) => {

    if (isUpdatingFilteredData) return;
    const context = state.updateContext || "default";

    if (state.isHoverUpdate) return;

    console.log("Hi")
    const { selectedFilters, freeTextSearch } = state;

    const selectedPriceAttribute = getEffectivePriceAttribute(state)

    const filteredData = getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch);

    if (window._prevFilteredLength === filteredData.length &&
        window._prevPriceAttribute === selectedPriceAttribute &&
        context === "default") {
      return;
    }

    window._prevFilteredLength = filteredData.length;
    window._prevPriceAttribute = selectedPriceAttribute;


      createIcicleChart(filteredData, ".IcicleChart", true);


      createTimelineView(filteredData, ".TimelineView", true);
      createStackedLineChart(filteredData, ".LineChart", true);

    createAlluvialChart(filteredData, ".AlluvialChart", true, selectedPriceAttribute);
    const processedData = prepareScatterData(filteredData, selectedPriceAttribute);
    updateScatterPlot(processedData, selectedPriceAttribute);

    setTimeout(() => {
      updateFilterPanel(originalData, filteredData, selectedFilters, ".FilterPanel");
    }, 10);

     let { hoveredCards } = getState();

    highlightAlluvialElements(hoveredCards);
    highlightIcicleRect(hoveredCards);
    highlightTimelineSets(hoveredCards);
    highlightLineChart(hoveredCards);
    updateDrawer(hoveredCards);
  });

  window.addEventListener("resize", () => {
    const { selectedFilters, freeTextSearch, hoveredCards } = getState();
    const selectedPriceAttribute = getEffectivePriceAttribute(getState());
    const { default: filteredData, icicle: IcicleFiltered, timeline: TimelineFiltered } =
      getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch);
    createAlluvialChart(filteredData, ".AlluvialChart", true, selectedPriceAttribute);
    createTimelineView(TimelineFiltered, ".TimelineView", true);
    createStackedLineChart(filteredData, ".LineChart", true);
    createIcicleChart(IcicleFiltered, ".IcicleChart", true);
    updateScatterPlot(prepareScatterData(filteredData, selectedPriceAttribute), selectedPriceAttribute);
    createFilterPanel(originalData, filteredData, ".FilterPanel", selectedFilters);

    highlightAlluvialElements(hoveredCards);
    highlightIcicleRect(hoveredCards);
    highlightTimelineSets(hoveredCards);
    highlightLineChart(hoveredCards);
    updateDrawer(hoveredCards);
  });
}
  


export function filterData(groupedData, selectedFilters, options = {}) {
  const { excludeCategory } = options;
  const mode = getState().filterLogicMode || "AND-OR";
  const applyAndAcross = mode.startsWith("AND");
  const applyAndWithin = mode.endsWith("AND");

  let filteredSet = new Set();

  const perCategoryMatches = [];

  for (const category of getState().filterApplicationOrder || Object.keys(selectedFilters)) {
    if (excludeCategory && category === excludeCategory) continue;

    const values = selectedFilters[category];
    if (!values || values.size === 0) continue;

    const group = groupedData[category];
    if (!group) continue;

    let matched = new Set();

    if (applyAndWithin) {
      const sets = Array.from(values)
        .map(val => group.get(val))
        .filter(set => set);
      if (sets.length > 0) {
        matched = sets.reduce((a, b) => intersectSets(new Set(a), new Set(b)));
      }
    } else {
      values.forEach(val => {
        const set = group.get(val);
        if (set) set.forEach(card => matched.add(card));
      });
    }

    perCategoryMatches.push(matched);
  }

  if (applyAndAcross) {
    filteredSet = perCategoryMatches.reduce((a, b) => intersectSets(a, b), new Set(getState().originalData || []));
  } else {
    filteredSet = new Set(perCategoryMatches.flatMap(set => [...set]));
  }
  // Apply free text search
  const textTerms = selectedFilters["FreeTextSearch"];
  if (textTerms?.size > 0) {
    const searchTerms = Array.from(textTerms).map(t => t.toLowerCase());
    filteredSet = new Set([...filteredSet].filter(card => {
      const cardText = [
        card.name?.toLowerCase() || "",
        ...(card.keywords || []).map(k => k.toLowerCase()),
        card.subtype?.toLowerCase() || ""
      ];
      return searchTerms.some(term =>
        cardText.some(text => text.includes(term))
      );
    }));
  }

  return Array.from(filteredSet);
}


// Helper to create a copy of selectedFilters omitting some categories

// Helper for intersecting two sets
function intersectSets(setA, setB) {
  return new Set([...setA].filter(x => setB.has(x)));
}


// Helper: test if a single card passes the filters (except those ignored)
function shouldIncludeCard(card, selectedFilters) {
  // IcicleColorGroups
  if (selectedFilters["IcicleColorGroups"]?.size > 0) {
    const groupLabel =( card.number_of_colours >= 4
      ? "+4 Colors"
      : card.number_of_colours == 1 ? "1 Color"
      : card.number_of_colours === 0
        ? "Colorless"
        : `${card.number_of_colours} Colors`).toLowerCase();
    if (!selectedFilters["IcicleColorGroups"].has(groupLabel.toLowerCase())) return false;
  }

  // IcicleColorIdentity
  if (selectedFilters["IcicleColorIdentity"]?.size > 0) {
    const identity = Array.isArray(card.color_identity)
      ? card.color_identity.join("") || "Colorless"
      : "Colorless";
    if (!selectedFilters["IcicleColorIdentity"].has(identity)) return false;
  }

  // Year
  if (selectedFilters["Year"]?.size > 0) {
    const releaseYear = new Date(card.release_date).getFullYear().toString();
    if (!selectedFilters["Year"].has(releaseYear)) return false;
  }

  // Other categories
  for (const [category, values] of Object.entries(selectedFilters)) {
    if (!values || values.size === 0) continue;

    const cardValue = extractCardValue(card, category);
    if (!cardValue) return false;

    const isSplittable = ["Supertypes", "Types", "Subtypes", "Keywords"].includes(category);
    const cardValues = Array.isArray(cardValue)
      ? cardValue.map(v => v.trim().toLowerCase())
      : (isSplittable
          ? cardValue.split(/[\s/]+/).map(v => v.trim().toLowerCase())
          : [cardValue.trim().toLowerCase()]);

    const filterValues = new Set(Array.from(values).map(v => v.trim().toLowerCase()));
    if (!cardValues.some(v => filterValues.has(v))) return false;
  }

  return true;
}


  
  



  
  

  
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

  data.forEach(card => {
    for (const category of Object.keys(grouped)) {
      const values = extractCardValues(card, category);
      values.forEach(value => {
        if (!grouped[category].has(value)) {
          grouped[category].set(value, []);
        }
        grouped[category].get(value).push(card);
      });
    }
  });
  return grouped;
}



function extractCardValues(card, category) {
  switch (category) {
    case "Originality":
      return card.originality ? [card.originality] : [];
    case "Keywords":
      return Array.isArray(card.keywords) ? card.keywords.map(k => k.trim()) : [];
    case "Rarity":
      return card.rarity ? [card.rarity] : [];
    case "Supertypes":
      return card.supertype ? card.supertype.split(/[\s/]+/).map(v => v.trim()) : [];
    case "Types":
      return card.type ? card.type.split(/[\s/]+/).map(v => v.trim()) : [];
    case "Subtypes":
      return card.subtype ? card.subtype.split(/[\s/]+/).map(v => v.trim()) : [];
    case "Set Types":
      return card.set_type ? [card.set_type] : [];
    case "Set Names":
      return card.set_name ? [card.set_name] : [];
    case "Year":
      if (!card.release_date) return [];
      return [new Date(card.release_date).getFullYear().toString()];
    case "Nº of Colors":
      if (card.number_of_colours >= 4) return ["+4 colors"];
      if (card.number_of_colours === 1) return ["1 color"];
      if (card.number_of_colours === 0) return ["colorless"];
      return [`${card.number_of_colours} colors`];
    case "Color Identity":
      if (!Array.isArray(card.color_identity) || card.color_identity.length === 0) return ["colorless"];
      const sortedColors = card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("");
      return [sortedColors.toLowerCase()];


    default:
      return [];
  }
}


  function extractCardValue(card, category) {
    switch (category) {
      case "Keywords":
  return Array.isArray(card.keywords) ? card.keywords.join(" ") : null;

      case "Supertypes": return card.supertype;
      case "Types": return card.type;
      case "Subtypes": return card.subtype;
      case "Set Types": return card.set_type;
      case "Originality": return card.originality;
      case "Rarity": return card.rarity;
      case "Set Names": return card.set_name;
      case "Year":
        if (!card.release_date) return null;
        return new Date(card.release_date).getFullYear().toString();
    
      case "Nº of Colors":
        if (card.number_of_colours >= 4) return "+4 colors";
        if (card.number_of_colours === 0) return "colorless";
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


        
      default: return null;
    }
  }
export function getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch = "") {
  const state = getState();
  const groupedData = state.groupedData || buildGroupedData(originalData);

  if (isFilterEmpty(selectedFilters) && !freeTextSearch) {
    return filterPriceOnly(originalData, selectedPriceAttribute);
  }


  // Case 2: Same as original, no change
  const currentPriceAttribute = getEffectivePriceAttribute(state);
  if (
    shallowCompareFilters(selectedFilters, state.originalSelectedFilters) &&
    !freeTextSearch &&
    currentPriceAttribute === getEffectivePriceAttribute({
      selectedPriceCurrency: state.lastFilterInputs?.selectedPriceCurrency,
      selectedPriceSuffix: state.lastFilterInputs?.selectedPriceSuffix
    })
  ) {
    return state.originalFilteredData || filterPriceOnly(originalData, selectedPriceAttribute);
  }

  // Case 3: Same inputs as last time
  const lastInputs = state.lastFilterInputs || {};
  const inputsMatch = 
    shallowCompareFilters(selectedFilters, lastInputs.selectedFilters) &&
    lastInputs.selectedPriceCurrency === state.selectedPriceCurrency &&
    lastInputs.selectedPriceSuffix === state.selectedPriceSuffix &&
    freeTextSearch === lastInputs.freeTextSearch &&
    lastInputs.filterLogicMode === state.filterLogicMode;;

  if (inputsMatch && state.lastFilteredData) {
    return state.lastFilteredData;
  }

  isUpdatingFilteredData = true;

  const filtered = filterData(groupedData, selectedFilters);

  const cleaned = filterPriceOnly(filtered, selectedPriceAttribute);
  console.log(cleaned)
  updateState({
    lastFilterInputs: { 
      selectedFilters: cloneFilters(selectedFilters),
      selectedPriceAttribute,
      freeTextSearch,
      filterLogicMode: state.filterLogicMode
    },
    lastFilteredData: cleaned,
  });
  isUpdatingFilteredData = false;

  

  return cleaned;
}


export function filterPriceOnly(cards, priceAttr) {
  return cards.filter(card => typeof card[priceAttr] === "number" && card[priceAttr] > 0);
}




// Helper: shallow compare two filter sets
function shallowCompareFilters(a, b) {
  if (!a || !b) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => {
    const aSet = a[key];
    const bSet = b[key];
    if (aSet?.size !== bSet?.size) return false;
    for (const val of aSet) {
      if (!bSet.has(val)) return false;
    }
    return true;
  });
}

function isFilterEmpty(selectedFilters) {
  return Object.values(selectedFilters).every(set => set.size === 0);
}


// Helper: deep clone filter sets
function cloneFilters(filters) {
  const cloned = {};
  for (const key in filters) {
    cloned[key] = new Set(filters[key]);
  }
  return cloned;
}
  
    init().catch(console.error);
    