import { getState, subscribe, updateState } from "./state.js";
import { createIcicleChart, highlightIcicleRect } from "./idioms/IcicleChart.js";
import { createAlluvialChart, highlightAlluvialElements} from "./idioms/AlluvialChart.js";
import { createTimelineView, highlightTimelineSets } from "./idioms/TimelineView.js";
import { createScatterPlot, updateScatterPlot, prepareScatterData} from "./idioms/Scatterplot.js";
import { createStackedLineChart } from "./idioms/LineChart.js";
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

function init() {
  showLoader();
    d3.json("./data/dataset_card_details.json").then(function (data) {
      const originalData = JSON.parse(JSON.stringify(data));  
      updateState({ originalData });
    let hoverTimeout = null;
      getState().onChange("hoveredCards", (hoveredCards) => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
        showLoader();

        highlightAlluvialElements(hoveredCards);
        highlightIcicleRect(hoveredCards);
        highlightTimelineSets(hoveredCards);
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
 
      const { selectedFilters, selectedPriceAttribute } = getState();
      const filtered = filterData(originalData, selectedFilters, selectedPriceAttribute);
      const IcicleFiltered = filterData(originalData, selectedFilters, selectedPriceAttribute, [
  "IcicleColorGroups", "IcicleColorIdentity"
]);
  
      createIcicleChart(IcicleFiltered, ".IcicleChart");
      updateFilterPanel(originalData, selectedFilters);
      createAlluvialChart(filtered, ".AlluvialChart", false, selectedPriceAttribute);
      createHiddenDrawer(".HiddenDrawerArea");
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
      
      highlightAlluvialElements([]);
      highlightIcicleRect([]);
      highlightTimelineSets([]);
      updateDrawer([]);
        hideLoader();
      subscribe((state) => {
        showLoader();
        const context = state.updateContext || "default";
        const { selectedFilters, selectedPriceAttribute } = state;

        
        const filteredData = filterData(originalData, selectedFilters, selectedPriceAttribute);
        const IcicleFiltered = filterData(originalData, selectedFilters, selectedPriceAttribute, [
  "IcicleColorGroups", "IcicleColorIdentity"]);
        const TimelineFiltered = filterData(originalData, selectedFilters, selectedPriceAttribute, ["Set Types", "Set Names", "Year"
]);
        
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
      console.log("Window resized, updating charts...");
      const { selectedFilters, selectedPriceAttribute } = getState();
      const { hoveredCards } = getState();
      const filtered = filterData(getState().originalData, selectedFilters, selectedPriceAttribute);
      createAlluvialChart(filtered, ".AlluvialChart", true, selectedPriceAttribute);
      createTimelineView(filtered, ".TimelineView", true);
      createStackedLineChart(filtered, ".LineChart", true);
      createIcicleChart(filtered, ".IcicleChart", true);
      updateScatterPlot(prepareScatterData(filtered, selectedPriceAttribute), selectedPriceAttribute);
      createFilterPanel(getState().originalData, ".FilterPanel", selectedFilters); 

highlightAlluvialElements(hoveredCards);
highlightIcicleRect(hoveredCards);
highlightTimelineSets(hoveredCards);
updateDrawer(hoveredCards);
console.log("Charts updated after resize.");

    });
  }
  


  export function filterData(data, selectedFilters, selectedPriceAttribute, ignoreFilters = []) {
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
  
      for (const [category, values] of Object.entries(selectedFilters)) {
      if (!values || values.size === 0) continue;
      if (ignoreFilters.includes(category)) continue;

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
    