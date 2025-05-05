import { getState, subscribe } from "./state.js";
import { createIcicleChart, highlightIcicleRect } from "./idioms/IcicleChart.js";
import { createAlluvialChart, highlightAlluvialElements} from "./idioms/AlluvialChart.js";
import { createTimelineView } from "./idioms/TimelineView.js";
import { createScatterPlot } from "./idioms/Scatterplot.js";
import { createStackedLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";

function init() {
    d3.json("./data/card_details.json").then(function (data) {
      const originalData = JSON.parse(JSON.stringify(data));  
    let hoverTimeout = null;
      getState().onChange("hoveredCard", (hovered) => {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
            
          highlightAlluvialElements(hovered);
          highlightIcicleRect(hovered);
        }, 60);
      });      
      const { selectedFilters, selectedPriceAttribute } = getState();
      const filtered = filterData(originalData, selectedFilters, selectedPriceAttribute);
  
      createIcicleChart(filtered, ".IcicleChart");
      createAlluvialChart(filtered, ".AlluvialChart", false, selectedPriceAttribute);

      createTimelineView(filtered, ".TimelineView");
      createScatterPlot(filtered, ".Scatterplot", true, selectedPriceAttribute);

      createStackedLineChart(filtered, ".LineChart");
      createFilterPanel(originalData, ".FilterPanel", selectedFilters); 
  
      subscribe((state) => {
        const filteredData = filterData(originalData, state.selectedFilters, state.selectedPriceAttribute);
        const context = state.updateContext || "default";
      
        // 🎯 Update charts conditionally based on context
        if (context !== "IcicleFilter") {
          createIcicleChart(filteredData, ".IcicleChart", true);
        }
      
        if (context !== "TimelineFilter") {
          createTimelineView(filteredData, ".TimelineView", true);
          createStackedLineChart(filteredData, ".LineChart", true);
        }
      
        // Always update these
        updateFilterPanel(filteredData, ".FilterPanel");
        createAlluvialChart(filteredData, ".AlluvialChart", true, state.selectedPriceAttribute);

        createScatterPlot(filteredData, ".Scatterplot", true, state.selectedPriceAttribute);

        
      });
      
    
      
    });
  
    window.addEventListener("resize", () => {
      init();
    });
  }
  


  function filterData(data, selectedFilters, selectedPriceAttribute) {
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
  
      if (selectedFilters["Year"]?.size > 0) {
        const releaseYear = new Date(card.release_date).getFullYear().toString();
        if (!selectedFilters["Year"].has(releaseYear)) {
          return false;
        }
      }
  
      for (const [category, values] of Object.entries(selectedFilters || {})) {
        if (!values || values.size === 0) continue;
        if (["IcicleColorGroups", "IcicleColorIdentity", "Year"].includes(category)) continue;
  
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
        
      default: return null;
    }
  }
  
  
    init();
    