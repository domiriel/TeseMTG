import { getState, subscribe, updateState } from "./state.js";
import { createIcicleChart, highlightIcicleRect } from "./idioms/IcicleChart.js";
import { createAlluvialChart, highlightAlluvialElements} from "./idioms/AlluvialChart.js";
import { createTimelineView, highlightTimelineSets } from "./idioms/TimelineView.js";
import { createScatterPlot, updateScatterPlot, prepareScatterData} from "./idioms/Scatterplot.js";
import { createStackedLineChart, highlightLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";
import { createHiddenDrawer, updateDrawer } from "./idioms/HiddenDrawer.js";
function loadCardData() {
  const localPath = "./data/card_details.json";
  const googleDriveURL = "https://drive.google.com/uc?export=download&id=1q3PD40N8nLbpMBknczyxJhDqFahQr2d3";

  return d3.json(localPath)
    .catch((err) => {
      console.warn("Local JSON load failed, falling back to Google Drive:", err);
      return d3.json(googleDriveURL);
    });
}
let isUpdatingFilteredData = false;
function init() {
  showLoader();
  if (!d3.select("#tooltip").node()) {
    d3.select("body")
      .append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("background", "rgba(0, 0, 0, 0.7)")
      .style("color", "white")
      .style("padding", "5px")
      .style("border-radius", "3px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("display", "none");
  }
    d3.json("./data/dataset_card_details.json").then(function (data) {
      const originalData = JSON.parse(JSON.stringify(data));  
      const groupedData = buildGroupedData(originalData);
      console.log("Grouped data built:", groupedData);
      updateState({ originalData, groupedData });
    let hoverTimeout = null;
      getState().onChange("hoveredCards", (hoveredCards) => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
        showLoader();

        highlightAlluvialElements(hoveredCards);
        highlightIcicleRect(hoveredCards);
        highlightTimelineSets(hoveredCards);
        highlightLineChart(hoveredCards);
        updateDrawer(hoveredCards);

        d3.selectAll(".dots circle")
          .attr("stroke", d => hoveredCards.some(c => c.name === d.name) ? "orange" : "none")
          .attr("stroke-width", d => hoveredCards.some(c => c.name === d.name) ? 2.5 : null)
          .each(function (d) {
            if (hoveredCards.some(c => c.name === d.name)) {
              this.parentNode.appendChild(this); // raise
            }
          });

        // Delay hiding to allow animation to show without flickering
        setTimeout(hideLoader, 150);
      }, 60);

      });
 
      const { selectedFilters, selectedPriceAttribute, freeTextSearch } = getState();
      const { default: filtered, icicle: IcicleFiltered, timeline: TimelineFiltered } = 
      getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch);


  
      createIcicleChart(IcicleFiltered, ".IcicleChart");
      updateFilterPanel(originalData, selectedFilters);
      createAlluvialChart(filtered, ".AlluvialChart", false, selectedPriceAttribute);
      createHiddenDrawer(".HiddenDrawerArea");
      createTimelineView(filtered, ".TimelineView");


      createScatterPlot(filtered, ".Scatterplot", false, selectedPriceAttribute);

      createStackedLineChart(filtered, ".LineChart");
      createFilterPanel(originalData, ".FilterPanel", selectedFilters); 
      
      highlightAlluvialElements([]);
      highlightIcicleRect([]);
      highlightTimelineSets([]);
      highlightLineChart([]);
      updateDrawer([]);
        hideLoader();
      subscribe((state) => {
        showLoader();
        if (isUpdatingFilteredData) return;
        const context = state.updateContext || "default";
        const { selectedFilters, selectedPriceAttribute, freeTextSearch } = state;

        
const { default: filteredData, icicle: IcicleFiltered, timeline: TimelineFiltered } = 
  getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch);

        
        if (window._prevFilteredLength === filteredData.length &&
            window._prevPriceAttribute === selectedPriceAttribute &&
            context === "default") {
          return;
        }
        window._prevFilteredLength = filteredData.length;
        window._prevPriceAttribute = selectedPriceAttribute;

       
        if (context !== "IcicleFilter") {
          createIcicleChart(IcicleFiltered, ".IcicleChart", true);
        }
        if (context !== "TimelineFilter") {
          createTimelineView(TimelineFiltered, ".TimelineView", true);
          createStackedLineChart(TimelineFiltered, ".LineChart", true);
        }
        createAlluvialChart(filteredData, ".AlluvialChart", true, selectedPriceAttribute);

      const processedData = prepareScatterData(filteredData, selectedPriceAttribute);
      updateScatterPlot(processedData, selectedPriceAttribute);



        
        setTimeout(() => {
          

          updateFilterPanel(originalData, selectedFilters, ".FilterPanel");

        }, 10);
        hideLoader();
      });

      
    
      
    });
  
    window.addEventListener("resize", () => {

      const { selectedFilters, selectedPriceAttribute, freeTextSearch } = getState();
      const { hoveredCards } = getState();
      const originalData = getState().originalData;
      const { default: filteredData, icicle: IcicleFiltered, timeline: TimelineFiltered } = 
      getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch);
      createAlluvialChart(filteredData, ".AlluvialChart", true, selectedPriceAttribute);
      createTimelineView(TimelineFiltered, ".TimelineView", true);
      createStackedLineChart(filteredData, ".LineChart", true);
      createIcicleChart(IcicleFiltered, ".IcicleChart", true);
      updateScatterPlot(prepareScatterData(filteredData, selectedPriceAttribute), selectedPriceAttribute);
      createFilterPanel(getState().originalData, ".FilterPanel", selectedFilters); 

highlightAlluvialElements(hoveredCards);
highlightIcicleRect(hoveredCards);
highlightTimelineSets(hoveredCards);
highlightLineChart(hoveredCards);
updateDrawer(hoveredCards);


    });
  }
  


export function filterData(
  data,
  selectedFilters,
  selectedPriceAttribute,
  freeTextSearch = "",
  groupedData = null
) {
  // Prepare context-specific filter sets
  const contextFilters = {
    default: selectedFilters,
    icicle: omitFilters(selectedFilters, ["IcicleColorGroups", "IcicleColorIdentity"]),
    timeline: omitFilters(selectedFilters, ["Set Types", "Set Names", "Year"]),
  };

  const results = {
    default: [],
    icicle: [],
    timeline: [],
  };

  // For each context, apply filtering separately
  Object.entries(contextFilters).forEach(([context, filters]) => {
    let filteredSet = new Set(data);

    if (groupedData) {
      console.log(selectedFilters["IcicleColorGroups"], selectedFilters["IcicleColorIdentity"]);
      for (const [category, values] of Object.entries(filters)) {
        if (!values || values.size === 0) continue;
        const categoryGroup = groupedData[category];
        if (!categoryGroup) continue;

        let matched = new Set();
        values.forEach(value => {
          const normalizedValue = value.toLowerCase();
          const group = categoryGroup.get(normalizedValue);
          if (group) {
            group.forEach(card => matched.add(card));
          }
        });

        filteredSet = intersectSets(filteredSet, matched);
      }
    } else {
      filteredSet = new Set(
        data.filter(card => shouldIncludeCard(card, filters))
      );
    }

    // Apply free text search
    if (freeTextSearch) {
      const searchLower = freeTextSearch.toLowerCase();
      filteredSet = new Set([...filteredSet].filter(card => {
        return (
          card.name?.toLowerCase().includes(searchLower) ||
          (card.keywords && card.keywords.some(k => k.toLowerCase().includes(searchLower))) ||
          (card.subtype && card.subtype.toLowerCase().includes(searchLower))
        );
      }));
    }

    // Save results
    results[context] = Array.from(filteredSet);
  });

  console.log("Filtered results:", {
    default: results.default.length,
    icicle: results.icicle.length,
    timeline: results.timeline.length
  });

  return results;
}


// Helper to create a copy of selectedFilters omitting some categories
function omitFilters(filters, omitKeys) {
  const result = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!omitKeys.includes(key)) {
      result[key] = value;
    }
  }
  return result;
}

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
    console.log("FilterSelected:", selectedFilters["IcicleColorGroups"], "Group label:", groupLabel);
    if (!selectedFilters["IcicleColorGroups"].has(groupLabel.toLowerCase())) return false;
  }

  // IcicleColorIdentity
  if (selectedFilters["IcicleColorIdentity"]?.size > 0) {
    const identity = Array.isArray(card.color_identity)
      ? card.color_identity.sort().join("-") || "Colorless"
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

    const isSplittable = ["Supertypes", "Types", "Subtypes"].includes(category);
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


  
  
  function showLoader() {
  d3.select("#inlineLoader").style("display", "inline-block");
}

function hideLoader(delay = 0) {
  if (delay > 0) {
    setTimeout(() => {
      d3.select("#inlineLoader").style("display", "none");
    }, delay);
  } else {
    d3.select("#inlineLoader").style("display", "none");
  }
}


  
  

  
  function buildGroupedData(data) {
  const grouped = {
    Originality: new Map(),
    Rarity: new Map(),
    Supertypes: new Map(),
    Types: new Map(),
    Subtypes: new Map(),
    "Set Types": new Map(),
    "Set Names": new Map(),
    Year: new Map(),
    IcicleColorGroups: new Map(),
    IcicleColorIdentity: new Map(),
    "Foil Status": new Map()
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
      return card.originality ? [card.originality.toLowerCase()] : [];
    case "Rarity":
      return card.rarity ? [card.rarity.toLowerCase()] : [];
    case "Supertypes":
      return card.supertype ? card.supertype.split(/[\s/]+/).map(v => v.trim().toLowerCase()) : [];
    case "Types":
      return card.type ? card.type.split(/[\s/]+/).map(v => v.trim().toLowerCase()) : [];
    case "Subtypes":
      return card.subtype ? card.subtype.split(/[\s/]+/).map(v => v.trim().toLowerCase()) : [];
    case "Set Types":
      return card.set_type ? [card.set_type.toLowerCase()] : [];
    case "Set Names":
      return card.set_name ? [card.set_name.toLowerCase()] : [];
    case "Year":
      if (!card.release_date) return [];
      return [new Date(card.release_date).getFullYear().toString()];
    case "IcicleColorGroups":
      if (card.number_of_colours >= 4) return ["+4 colors"];
      if (card.number_of_colours === 1) return ["1 color"];
      if (card.number_of_colours === 0) return ["colorless"];
      return [`${card.number_of_colours} colors`];
    case "IcicleColorIdentity":
      if (!Array.isArray(card.color_identity) || card.color_identity.length === 0) return ["colorless"];
      return [card.color_identity.sort().join("-").toLowerCase()];
    case "Foil Status":
      return card.foil_status ? [card.foil_status.toLowerCase()] : [];
    default:
      return [];
  }
}

  function extractCardValue(card, category) {
    switch (category) {
      case "Keywords": return card.keywords;
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
    
      case "IcicleColorGroups":
        if (card.number_of_colours >= 4) return "+4 Colors";
        if (card.number_of_colours === 0) return "Colorless";
        return `${card.number_of_colours} Colors`;
  
      case "IcicleColorIdentity":
        if (!Array.isArray(card.color_identity) || card.color_identity.length === 0) {
          return "Colorless";
        }
        return card.color_identity.sort().join("-");  
      case "Foil Status": return card.foil_status;
        
      default: return null;
    }
  }
  export function getFilteredData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch = "") {
  const state = getState();
  const lastInputs = state.lastFilterInputs || {};
  const groupedData = state.groupedData || buildGroupedData(originalData);
  const inputsMatch = 
    shallowCompareFilters(selectedFilters, lastInputs.selectedFilters) &&
    selectedPriceAttribute === lastInputs.selectedPriceAttribute &&
    freeTextSearch === lastInputs.freeTextSearch;

  if (inputsMatch && state.lastFilteredData) {

    return state.lastFilteredData;
  }

  isUpdatingFilteredData = true;

  const filteredResults = filterData(originalData, selectedFilters, selectedPriceAttribute, freeTextSearch, groupedData);

  updateState({
    lastFilterInputs: { 
      selectedFilters: cloneFilters(selectedFilters),
      selectedPriceAttribute,
      freeTextSearch
    },
    lastFilteredData: filteredResults
  });
isUpdatingFilteredData = false;
  return filteredResults;
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

// Helper: deep clone filter sets
function cloneFilters(filters) {
  const cloned = {};
  for (const key in filters) {
    cloned[key] = new Set(filters[key]);
  }
  return cloned;
}
  
    init();
    