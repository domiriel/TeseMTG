import { getState, subscribe } from "./state.js";
import { createIcicleChart } from "./idioms/IcicleChart.js";
import { createAlluvialChart } from "./idioms/AlluvialChart.js";
import { createTimelineView } from "./idioms/TimelineView.js";
import { createScatterPlot } from "./idioms/Scatterplot.js";
import { createStackedLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";

function init() {
    d3.json("./data/card_details.json").then(function (data) {
      const originalData = JSON.parse(JSON.stringify(data));  // Store original unsorted data
  
      const { selectedFilters, selectedPriceAttribute } = getState();
      const filtered = filterData(originalData, selectedFilters, selectedPriceAttribute);
  
      createIcicleChart(filtered, ".IcicleChart");
      createAlluvialChart(filtered, ".AlluvialChart");
      createTimelineView(filtered, ".TimelineView");
      createScatterPlot(filtered, ".Scatterplot");
      createStackedLineChart(filtered, ".LineChart");
      createFilterPanel(originalData, ".FilterPanel", selectedFilters); // always use original here
  
      subscribe((state) => {
        const filteredData = filterData(originalData, state.selectedFilters, state.selectedPriceAttribute);
        updateFilterPanel(filteredData, ".FilterPanel");
        createFilterPanel(originalData, ".FilterPanel", state.selectedFilters,true); // always use original here
        createAlluvialChart(filteredData, ".AlluvialChart", true); // update
        createIcicleChart(filteredData, ".IcicleChart", true); // update
        createTimelineView(filteredData, ".TimelineView", true); // update
        createScatterPlot(filteredData, ".Scatterplot", true); // update
        createStackedLineChart(filteredData, ".LineChart", true); // update
      });
    });
  
    window.addEventListener("resize", () => {
      init();
    });
  }
  


  function filterData(data, selectedFilters, selectedPriceAttribute) {
    console.log("Originality filter values:", Array.from(selectedFilters["Originality"]));
  
    return data.filter(card => {
      for (const [category, values] of Object.entries(selectedFilters || {})) {
        if (!values || values.size === 0) continue;
  
        const cardValue = extractCardValue(card, category);
        if (!cardValue) return false;
  
        // Only split for categories with composite values
        const isSplittable = ["Supertypes", "Types", "Subtypes"].includes(category);
        const cardValues = Array.isArray(cardValue)
          ? cardValue.map(v => v.trim().toLowerCase())
          : (isSplittable
              ? cardValue.split(/[\s/]+/).map(v => v.trim().toLowerCase())
              : [cardValue.trim().toLowerCase()]);
  
        const filterValues = new Set(Array.from(values).map(v => v.trim().toLowerCase()));
        const match = cardValues.some(v => filterValues.has(v));
        if (!match) return false;
      }
  
      return true;
    });
  }
  
  
  
  function updateAlluvialChart() {
    const { selectedFilters, selectedPriceAttribute } = getState();
    const filtered = filterData(originalData, selectedFilters, selectedPriceAttribute); // originalData must be in scope
    createAlluvialChart(filtered, '#alluvialChart', true);
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
      default: return null;
    }
  }
  
    init();