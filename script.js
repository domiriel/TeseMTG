import { getState, subscribe } from "./state.js";
import { createIcicleChart, highlightIcicleRect } from "./idioms/IcicleChart.js";
import { createAlluvialChart, highlightAlluvialElements} from "./idioms/AlluvialChart.js";
import { createTimelineView, highlightTimelineSets } from "./idioms/TimelineView.js";
import { createScatterPlot, updateScatterPlot, prepareScatterData} from "./idioms/Scatterplot.js";
import { createStackedLineChart } from "./idioms/LineChart.js";
import { createFilterPanel, updateFilterPanel } from "./idioms/FilterPanel.js";
function loadCardData() {
  const localPath = "./data/card_details.json";
  const googleDriveURL = "https://drive.google.com/uc?export=download&id=1q3PD40N8nLbpMBknczyxJhDqFahQr2d3";

  return d3.json(localPath)
    .catch((err) => {
      console.warn("Local JSON load failed, falling back to Google Drive:", err);
      return d3.json(googleDriveURL);
    });
}

function init() {
    d3.json("./data/dataset_card_details.json").then(function (data) {
      const originalData = JSON.parse(JSON.stringify(data));  
    let hoverTimeout = null;
      getState().onChange("hoveredCard", (hovered) => {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
            
          highlightAlluvialElements(hovered);
          highlightIcicleRect(hovered);
          highlightTimelineSets(hovered);
        }, 60);
      });      
      const { selectedFilters, selectedPriceAttribute } = getState();
      const filtered = filterData(originalData, selectedFilters, selectedPriceAttribute);
  
      createIcicleChart(filtered, ".IcicleChart");
      updateFilterPanel(originalData, selectedFilters);
      createAlluvialChart(filtered, ".AlluvialChart", false, selectedPriceAttribute);

      createTimelineView(filtered, ".TimelineView");
      let savedTransform = null;

      try {
          const svgNode = d3.select(".Scatterplot svg").node();
          if (svgNode) savedTransform = d3.zoomTransform(svgNode);
        } catch (e) {
          console.warn("Could not read zoom transform:", e);
        }

      createScatterPlot(filtered, ".Scatterplot", false, selectedPriceAttribute, savedTransform);

      createStackedLineChart(filtered, ".LineChart");
      createFilterPanel(originalData, ".FilterPanel", selectedFilters); 
  
      subscribe((state) => {
        const context = state.updateContext || "default";
        const { selectedFilters, selectedPriceAttribute } = state;

        
        const filteredData = filterData(originalData, selectedFilters, selectedPriceAttribute);

        
        if (window._prevFilteredLength === filteredData.length &&
            window._prevPriceAttribute === selectedPriceAttribute &&
            context === "default") {
          return;
        }
        window._prevFilteredLength = filteredData.length;
        window._prevPriceAttribute = selectedPriceAttribute;

       
        if (context !== "IcicleFilter") {
          createIcicleChart(filteredData, ".IcicleChart", true);
        }

        
        if (context !== "TimelineFilter") {
          createTimelineView(filteredData, ".TimelineView", true);
          createStackedLineChart(filteredData, ".LineChart", true);
        }

       
        createAlluvialChart(filteredData, ".AlluvialChart", true, selectedPriceAttribute);

        
        let savedTransform = null;
        try {
          const svgNode = d3.select(".Scatterplot svg").node();
          if (svgNode) savedTransform = d3.zoomTransform(svgNode);
        } catch (e) {
          console.warn("Could not read zoom transform:", e);
        }

      const processedData = prepareScatterData(filteredData, selectedPriceAttribute);
      updateScatterPlot(processedData, selectedPriceAttribute);



        
        setTimeout(() => {
          

          updateFilterPanel(originalData, selectedFilters, ".FilterPanel");

        }, 10);
        
      });

      
    
      
    });
  
    window.addEventListener("resize", () => {
      init();
    });
  }
  


  export function filterData(data, selectedFilters, selectedPriceAttribute) {
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
    