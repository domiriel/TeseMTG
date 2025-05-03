import { getState, subscribe } from "./state.js";
import { createIcicleChart } from "./idioms/icicleChart.js";
import { createAlluvialChart } from "./idioms/AlluvialChart.js";
import { createTimelineView } from "./idioms/TimelineView.js";
import { createScatterPlot } from "./idioms/Scatterplot.js";
import { createStackedLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";

function init() {
    d3.json("./data/card_details.json").then(function (data) {
      const originalData = JSON.parse(JSON.stringify(data));  
  
      const { selectedFilters, selectedPriceAttribute } = getState();
      const filtered = filterData(originalData, selectedFilters, selectedPriceAttribute);
  
      createIcicleChart(filtered, ".IcicleChart");
      createAlluvialChart(filtered, ".AlluvialChart");
      createTimelineView(filtered, ".TimelineView");
      createScatterPlot(filtered, ".Scatterplot");
      createStackedLineChart(filtered, ".LineChart");
      createFilterPanel(originalData, ".FilterPanel", selectedFilters); 
  
      subscribe((state) => {
        const filteredData = filterData(originalData, state.selectedFilters, state.selectedPriceAttribute);
    
        const onlyIcicleFilters =
            state.selectedFilters.IcicleColorGroups?.size > 0 ||
            state.selectedFilters.IcicleColorIdentity?.size > 0;
    
        if (!onlyIcicleFilters) {
            
            createIcicleChart(filteredData, ".IcicleChart", true);
        }
    
        updateFilterPanel(filteredData, ".FilterPanel");
        createAlluvialChart(filteredData, ".AlluvialChart", true);
        createTimelineView(filteredData, ".TimelineView", true);
        createScatterPlot(filteredData, ".Scatterplot", true);
        createStackedLineChart(filteredData, ".LineChart", true);
    });
    
      
    });
  
    window.addEventListener("resize", () => {
      init();
    });
  }
  


  function filterData(data, selectedFilters, selectedPriceAttribute) {
    console.log("Originality filter values:", Array.from(selectedFilters["Originality"]));
  
    return data.filter(card => {
      
      if (selectedFilters["IcicleColorGroups"]?.size > 0) {
        const groupLabel = card.number_of_colours >= 4
          ? "+4 Colors"
          : card.number_of_colours === 0
            ? "Colorless"
            : `${card.number_of_colours} Colors`;
  
        if (!selectedFilters["IcicleColorGroups"].has(groupLabel)) {
          return false;
        }
      }
  
      
      if (selectedFilters["IcicleColorIdentity"]?.size > 0) {
        const identity = Array.isArray(card.color_identity)
          ? card.color_identity.sort().join("-") || "Colorless"
          : "Colorless";
  
        if (!selectedFilters["IcicleColorIdentity"].has(identity)) {
          return false;
        }
      }
  
      
      for (const [category, values] of Object.entries(selectedFilters || {})) {
        if (!values || values.size === 0) continue;
        if (category === "IcicleColorGroups" || category === "IcicleColorIdentity") continue;
  
        const cardValue = extractCardValue(card, category);
        if (!cardValue) return false;
  
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
  
  
  
  

  
  
  function extractCardValue(card, category) {
    switch (category) {
      case "Keywords": return card.keywords;
      case "Supertypes": return card.supertype;
      case "Types": return card.type;
      case "Subtypes": return card.subtype;
      case "Set Types": return card.set_type;
      case "Originality": return card.originality;
      case "Rarity": return card.rarity;
  
     
      case "IcicleColorGroups":
        if (card.number_of_colours >= 4) return "+4 Colors";
        if (card.number_of_colours === 0) return "Colorless";
        return `${card.number_of_colours} Colors`;
  
      case "IcicleColorIdentity":
        if (!Array.isArray(card.color_identity) || card.color_identity.length === 0) {
          return "Colorless";
        }
        return card.color_identity.sort().join("-");  
        
      default: return null;
    }
  }
  
  
    init();