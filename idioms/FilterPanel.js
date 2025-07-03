
import { updateState, getState, saveFilterSettings, loadFilterSettings, generateFilterShareURL, resetState} from "../state.js";
import { filterData, filterPriceOnly, getEffectivePriceAttribute } from "../script.js"; 
import { showLoader, hideLoader } from "./LoadingAnimation.js";
const EXCLUDED_SET_TYPES = new Set(["alchemy", "minigame"]);
const optionMap = new Map();  
const pillMap = new Map();
const mtgColorOrder = { w: 0, u: 1, b: 2, r: 3, g: 4 };
            function getNormalizedKey(category, value) {
  return (category === "Color Identity" || category === "Nº of Colors")
    ? value.toLowerCase()
    : value;
}
const numColorsOrder = ["Colorless", "1 Color", "2 Colors", "3 Colors", "4 Colors", "+4 Colors"];
const colorIdentityOrder = ["colorless", 
                            "w", "u", "b", "r", "g", 
                            "wu", "wb", "wr", "wg", "ub", "ur", "ug", "br", "bg", "rg", 
                            "wub", "wur", "wug", "wbr", "wbg", "wrg", "ubr", "ubg", "urg", "brg",
                            "wubr", "wubg", "wurg", "wbrg", "ubrg",
                            "wubrg"];

function getSuffixOptionsForCurrency(currency) {
  if (currency === "eur") return ["", "_foil"];
  if (currency === "usd") return ["", "_foil", "_etched"];
  return [""]; // tix
}
function formatDisplayLabel(category, value) {
  if (category === "Color Identity") {
    if (value.toLowerCase() === "colorless") return "Colorless";
    return value.toUpperCase(); // WUB, UBR, etc.
  }

  if (category === "Nº of Colors") {
    // Capitalize each word, e.g., "1 color" → "1 Color", "+4 colors" → "+4 Colors"
    return value
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return value; // default fallback
}


const VISIBLE_FILTER_CATEGORIES = [
  "Keywords",
  "Supertypes",
  "Types",
  "Subtypes",
  "Set Types",
  "Set Names",
  "Originality",
  "Rarity",
  "Year", 
  "Nº of Colors",
  "Color Identity"
];


function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


function inferFilterCategoryFromValue(value, data, candidates = ["Supertypes", "Types", "Subtypes"]) {
  const valueLower = value.trim().toLowerCase();
  const counts = {};

  candidates.forEach(category => {
    counts[category] = 0;
  });

  data.forEach(card => {
    candidates.forEach(category => {
      const raw = extractCardValue(card, category);
      if (!raw) return;

      const isSplittable = ["Supertypes", "Types", "Subtypes"].includes(category);
      const values = Array.isArray(raw)
        ? raw.map(v => v.trim().toLowerCase())
        : (isSplittable
            ? raw.split(/[\s/]+/).map(v => v.trim().toLowerCase())
            : [raw.trim().toLowerCase()]);

      if (values.includes(valueLower)) {
        counts[category]++;
      }
    });
  });

  const maxCategory = Object.entries(counts).reduce(
    (a, b) => (b[1] > a[1] ? b : a),
    ["", 0]
  )[0];

  return maxCategory;
}


const scryfallMap = {
  "t": ["Types", "Supertypes", "Subtypes"],
  "type": ["Types"],
  "kw": ["Keywords"],
  "keyword": ["Keywords"],
  "r": ["Rarity"],
  "s": ["Set Names"],
  "st": ["Set Types"],
};
function addToMap(map, key) {
    if (!key) return;
    const trimmed = key.trim();
    if (!trimmed) return;
    map.set(trimmed, (map.get(trimmed) || 0) + 1);
}

function cloneFilters(filters) {
    return Object.fromEntries(
        Object.entries(filters).map(([k, v]) => [k, new Set(v)])
    );
}

export function createFilterPanel(data,filteredCards, containerId, selectedFiltersFromState, isUpdate = false) {
    d3.select(containerId).selectAll("*").remove();

    const container = d3.select(containerId)
        .style("position", "relative")
        .style("width", "100%")
        .style("height", "100%");

    if (isUpdate) {
        container.select(".filter-panel-wrapper").remove();
    }

    const wrapper = container.append("div")
        .attr("class", "filter-panel-wrapper")
        .style("width", "100%")
        .style("max-height", "100%")
        .style("overflow-y", "auto")
        .style("padding", "10px")
        .style("box-sizing", "border-box");

    const selectedFilters = selectedFiltersFromState;

    const suffixWrapper = wrapper.append("div")
  .style("margin-bottom", "12px");

suffixWrapper.append("label")
  .text("Select Price Suffix:")
  .style("font-size", "14px")
  .style("font-weight", "bold")
  .style("display", "block")
  .style("margin-bottom", "4px");

const suffixSelect = suffixWrapper.append("select")
  .style("padding", "6px")
  .style("width", "70%")
  .style("font-size", "14px")
  .style("border", "1px solid #ccc")
  .style("border-radius", "6px");

function renderSuffixOptions(currency) {
  const suffixOptions = getSuffixOptionsForCurrency(currency);
  suffixSelect.selectAll("option").remove();

  suffixSelect.selectAll("option")
    .data(suffixOptions)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d === "" ? "Regular" : d.replace("_", "").toUpperCase());

  suffixSelect.property("value", getState().selectedPriceSuffix);
}

renderSuffixOptions(getState().selectedPriceCurrency);

suffixSelect.on("change", function () {
  updateState({ selectedPriceSuffix: this.value });
});

    const groupedData = getState().groupedData;

const allFilters = Object.fromEntries(
  Object.entries(groupedData)
    .filter(([category]) => VISIBLE_FILTER_CATEGORIES.includes(category))
.map(([category, map]) => {
  let entries = Array.from(map.entries());

  if (category === "Set Types") {
    const excluded = new Set(["alchemy", "minigame"]);
    entries = entries.filter(([value]) => !excluded.has(value.toLowerCase()));
  }

  entries = entries.sort((a, b) => {
    if (category === "Nº of Colors") {
      return numColorsOrder.indexOf(a[0]) - numColorsOrder.indexOf(b[0]);
    }
    if (category === "Color Identity") {
      return colorIdentityOrder.indexOf(a[0]) - colorIdentityOrder.indexOf(b[0]);
    }
    return a[0].localeCompare(b[0]);
  });

  return [category, entries];
})
);

    const filters = Object.fromEntries(Object.entries(allFilters).filter(([category]) =>
            VISIBLE_FILTER_CATEGORIES.includes(category)
        )
);



    
    const uniqueCardNames = Array.from(new Set(filteredCards.map(card => card.name))).sort();



    const inputId = "searchInput_" + Math.random().toString(36).substring(2);
    wrapper.append("input")
        .attr("type", "text")
        .attr("list", inputId)
        .attr("placeholder", "Select a card...")
         .attr("title", "Type to select a card from the dataset")
        .style("width", "85%")
        .style("margin-bottom", "12px")
        .style("padding", "6px")
        .style("font-size", "16px");

wrapper.append("datalist")
    .attr("id", inputId)
    .selectAll("option")
    .data(uniqueCardNames)
    .enter()
    .append("option")
    .attr("value", d => d);

wrapper.append("input")
  .attr("type", "text")
  .attr("placeholder", "Filter by card name, keywords, or subtype...")
  .style("width", "85%")
  .attr("title", "Search by card name, keywords, or subtype (use e.g., t:Goblin or kw:Flying)")
  .style("margin-bottom", "12px")
  .style("padding", "6px")
  .style("font-size", "16px")
.on("keydown", function (event) {
  if (event.key === "Enter") {
    const searchText = this.value.trim().toLowerCase();
    if (!searchText) return;
    
   const terms = searchText.match(/(?:\w+\s*:\s*[^ ]+)|(?:[^\s]+)/g) || [];

const currentFilters = cloneFilters(getState().selectedFilters);

   if (!currentFilters["FreeTextSearch"]) currentFilters["FreeTextSearch"] = new Set();

terms.forEach(rawTerm => {
  const term = rawTerm.replace(/\s+/g, ""); // Remove inner spaces like 't: goblin' → 't:goblin'
  const match = term.match(/^(\w+):(.+)$/);

  if (match) {
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    const categories = scryfallMap[key];

  if (categories) {
  let matched = false;

  // Special case: t: → needs inference
  if (key === "t") {
    const inferredCat = inferFilterCategoryFromValue(value, data);
    if (VISIBLE_FILTER_CATEGORIES.includes(inferredCat)) {
      if (!currentFilters[inferredCat]) currentFilters[inferredCat] = new Set();
      currentFilters[inferredCat].add(capitalizeFirst(value));
      matched = true;
    }
  } else {
    categories.forEach(cat => {
      if (VISIBLE_FILTER_CATEGORIES.includes(cat)) {
        if (!currentFilters[cat]) currentFilters[cat] = new Set();
        currentFilters[cat].add(capitalizeFirst(value));
        matched = true;
      }
    });
  }

  if (!matched) {
    if (!currentFilters["FreeTextSearch"]) currentFilters["FreeTextSearch"] = new Set();
    currentFilters["FreeTextSearch"].add(term);
  }
}
 else {
      if (!currentFilters["FreeTextSearch"]) currentFilters["FreeTextSearch"] = new Set();
      currentFilters["FreeTextSearch"].add(term);
    }
  } else {
    if (!currentFilters["FreeTextSearch"]) currentFilters["FreeTextSearch"] = new Set();
    currentFilters["FreeTextSearch"].add(term);
  }
});
    
    updateState({ selectedFilters: currentFilters, updateContext: "TextSearch" });
    
    this.value = ""; // Clear input after
  }
});

wrapper.append("input")
  .attr("type", "text")
  .attr("placeholder", "Search set name...")
  .attr("title", "Type the name of a set and press Enter to scroll to it")
  .style("width", "85%")
  .style("margin-bottom", "12px")
  .style("padding", "6px")
  .style("font-size", "16px")
  .on("keydown", function (event) {
    if (event.key === "Enter") {
      const query = this.value.trim().toLowerCase();
      if (!query) return;

      const matchedSet = getState().groupedData["Set Names"];
      if (!matchedSet) return;

      // Try exact match
      const matched = Array.from(matchedSet.keys()).find(name =>
        name.toLowerCase() === query
      );
      if (!matched) return;

      // Scroll to matching set in timeline (must be visible)
      const setRects = d3.selectAll(".set-rect");
      const target = setRects.filter(d => d.name.toLowerCase() === matched.toLowerCase()).node();

      if (target) {
        const container = d3.select(".chart-container");  // must match your scroll container class
        const bbox = target.getBoundingClientRect();
        const containerBox = container.node().getBoundingClientRect();

        const offsetTop = bbox.top - containerBox.top + container.node().scrollTop;
        container.node().scrollTo({
          top: offsetTop - 40,
          behavior: "smooth"
        });

        // Optional: flash match
        d3.select(target)
          .classed("search-match", true);
        setTimeout(() => d3.select(target).classed("search-match", false), 1000);
      }

      this.value = "";
    }
  });


const freeTextPillContainer = wrapper.append("div")
  .attr("class", "pill-container free-text-pills")
  .style("display", "flex")
  .style("flex-wrap", "wrap")
  .style("gap", "4px")
  .style("margin-bottom", "12px");

pillMap.set("FreeTextSearch", freeTextPillContainer);




    const searchInput = wrapper.select(`input[list="${inputId}"]`);

searchInput.on("change", function () {
    const cardName = this.value.trim();
    if (!cardName) return;

   const circle = d3.selectAll(".Scatterplot .dots circle")
    .filter(d => d.name === cardName)
    .node();

    if (!circle) return;

    const card = d3.select(circle).datum();

    const { hoveredCards } = getState();
    const isAlreadySelected = hoveredCards.some(c => c.name === card.name);

    
    let newHoveredCards = isAlreadySelected
    ? hoveredCards
    : [...hoveredCards, card];

    updateState({ hoveredCards: newHoveredCards, isHoverUpdate: true });

    d3.selectAll(".dots circle")
  .filter(d => d.name === card.name)
  .classed("selected-hover", !isAlreadySelected);

});

    const priceFields = new Set();
    data.forEach(card => {
        Object.keys(card).forEach(key => {
            if (key.startsWith("price_")) {
                priceFields.add(key);
            }
        });
    });

    const sortedPriceFields = Array.from(priceFields).sort();

   

    const resetWrapper = wrapper.append("div")
        .style("margin-bottom", "12px")
        .style("text-align", "left");

    resetWrapper.append("button")
        .text("Clear Filters")
        .style("padding", "6px 12px")
        .style("font-size", "14px")
        .style("background-color", "#dc3545")
        .style("color", "#fff")
        .style("border", "none")
        .style("border-radius", "4px")
        .style("cursor", "pointer")
        .on("click", () => {
            showLoader();
            const clearedFilters = {};
            for (const key in selectedFilters) clearedFilters[key] = new Set();
            d3.selectAll(".set-square").attr("fill", "#998066").style("opacity", 1);
            d3.selectAll(".year-tick-timeline").style("fill", "black").style("font-weight", "normal");
            d3.selectAll(".data-point").attr("fill", "#998066").style("opacity", 1)
            .style("font-weight", "normal");
            d3.selectAll(".chart-group rect").classed("selected", false);
            updateState({ selectedFilters: clearedFilters });
            createFilterPanel(data,data, containerId, clearedFilters, true);
            hideLoader();
        });


    resetWrapper.append("button")
    .text("Reset State")
    .style("padding", "6px 12px")
    .style("font-size", "14px")
    .style("background-color", "#6c757d")
    .style("color", "#fff")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .style("margin-top", "8px")
    .on("click", () => {
        showLoader();
        resetState();  // calls the new reset function in state.js
        createFilterPanel(data,data, containerId, getState().selectedFilters, true);
        hideLoader();
    });

    Object.entries(filters).forEach(([category, values]) => {
        const section = wrapper.append("div")
            .attr("class", "filter-section")
            .style("margin-top", "12px")
            .style("width", "95%");

        section.append("div")
            .attr("class", "dropdown-header")
            .text(category)
            .style("background", "#B69677")
            .style("padding", "6px 10px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "6px")
            .style("cursor", "pointer")
            .style("font-weight", "bold")
            .style("width", "100%")
            .style("box-sizing", "border-box");

        const content = section.append("div")
            .attr("class", "dropdown-content")
            .style("display", "none")
            .style("max-height", "160px")
            .style("overflow-y", "auto")
            .style("margin-top", "4px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "6px")
            .style("padding", "6px")
            .style("background", "#fff");

        const searchBox = section.insert("input", function() {
            return content.node();
        })
            .attr("type", "text")
            .attr("placeholder", `Search ${category}...`)
            .style("display", "none")
            .style("width", "93.5%")
            .style("padding", "4px")
            .style("margin-top", "4px")
            .style("font-size", "14px")
            .on("input", function () {
                const query = this.value.toLowerCase();
                content.selectAll(".filter-option").style("display", d =>
                    d.value.toLowerCase().includes(query) ? "flex" : "none"
                );
            });

        section.select(".dropdown-header")
            .on("click", function () {
                const isVisible = content.style("display") === "block";
                content.style("display", isVisible ? "none" : "block");
                searchBox.style("display", isVisible ? "none" : "block");
            });

        const pillContainer = section.append("div")
            .attr("class", "pill-container")
            .style("margin-top", "6px")
            .style("display", "flex")
            .style("flex-wrap", "wrap")
            .style("gap", "4px");
        pillMap.set(category, pillContainer);


        const selectedSet = selectedFilters[category];

        function updateFilterStyles() {
            content.selectAll(".filter-option")
                .style("background-color", d => selectedSet.has(d.value) ? "#cce5ff" : "#fff")
                .style("cursor", "pointer");
        }

        function updatePills() {
            const pills = pillContainer.selectAll(".pill")
                .data(Array.from(selectedSet), d => d);

            pills.enter()
                .append("div")
                .attr("class", "pill")
                .style("background", "#8A9CE4")
                .style("color", "white")
                .style("padding", "2px 8px")
                .style("border-radius", "12px")
                .style("font-size", "12px")
                .text(d => formatDisplayLabel(category, d))
                .append("span")
                .style("margin-left", "6px")
                .style("cursor", "pointer")
                .text("\u2715")
                .on("click", function (event, value) {
                    showLoader();
                    selectedSet.delete(value);
                    const updatedFilters = cloneFilters(selectedFilters);
                    updateState({ 
                    selectedFilters: updatedFilters,
                    updateContext: category === "Set Names" ? "TimelineFilter" : undefined
                    });
                    if (category === "Set Names") {
                    d3.selectAll(".set-rect")
                        .attr("fill", rectData =>
                        selectedFilters["Set Names"].has(rectData.name) ? "#007bff" : "#998066"
                        );
                    }

                    updatePills();
                    updateFilterStyles();
                    hideLoader();
                });

            pills.exit().remove();

        }

        const option = content.selectAll("div")
            .data(values.map(([value, count]) => ({ category, value, count })))
            .enter()
            .append("div")
            .attr("class", "filter-option")
            .style("display", "flex")
            .style("justify-content", "space-between")
            .style("align-items", "center")
            .style("padding", "4px 2px")
            .style("font-size", "14px")
            .style("width", "100%")
            .style("box-sizing", "border-box")
            .attr("data-category", category)
            .attr("data-value", d => d.value)
            .on("click", function (event, d) {
                showLoader();
                const isSelected = selectedSet.has(d.value);
                isSelected ? selectedSet.delete(d.value) : selectedSet.add(d.value);
                const updatedFilters = structuredClone(selectedFilters);
                updateState({ selectedFilters: updatedFilters });
                updatePills();
                updateFilterStyles();
                clearTimeout(window._filterPanelTimeout);
                hideLoader();
            });

        option.append("span")
            .text(d => `${formatDisplayLabel(d.category, d.value)} (${d.count})`)
            .attr("data-count", d => d.count)
            .style("margin-right", "10px");

        option.each(function (d) {

            const key = `${category}|${getNormalizedKey(category, d.value)}`;
            optionMap.set(key, d3.select(this));
        });

        updateFilterStyles();
        updatePills();
    });


const settingsSection = wrapper.append("div")
    .attr("class", "filter-section")
    .style("margin-top", "20px")
    .style("width", "80%");

const settingsHeader = settingsSection.append("div")
    .attr("class", "dropdown-header")
    .html('Settings <span style="margin-right:10px;">&#9881;</span>')
    .style("background", "#4681f4")
    .style("color", "#fff")
    .style("padding", "6px 10px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px")
    .style("cursor", "pointer")
    .style("font-weight", "bold")
    .style("width", "100%")
    .style("box-sizing", "border-box");

const settingsContent = settingsSection.append("div")
    .attr("class", "dropdown-content")
    .style("display", "none")
    .style("margin-top", "4px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px")
    .style("padding", "6px")
    .style("background", "#fff");

settingsHeader.on("click", function () {
    const isVisible = settingsContent.style("display") === "block";
    settingsContent.style("display", isVisible ? "none" : "block");
});

// PRICE SELECT
const currencyWrapper = settingsContent.append("div")
  .style("margin-bottom", "12px");

currencyWrapper.append("label")
  .text("Select Currency:")
  .style("font-size", "14px")
  .style("font-weight", "bold")
  .style("display", "block")
  .style("margin-bottom", "4px");

const currencySelect = currencyWrapper.append("select")
  .style("padding", "6px")
  .style("width", "100%")
  .style("font-size", "14px")
  .style("border", "1px solid #ccc")
  .style("border-radius", "6px");

const currencyOptions = ["eur", "usd", "tix"];

currencySelect.selectAll("option")
  .data(currencyOptions)
  .enter()
  .append("option")
  .attr("value", d => d)
  .text(d => d.toUpperCase());

currencySelect.property("value", getState().selectedPriceCurrency);

currencySelect.on("change", function () {
  const selectedCurrency = this.value;
  const suffixOptions = getSuffixOptionsForCurrency(selectedCurrency);
  const currentSuffix = getState().selectedPriceSuffix;

  // Update state
  updateState({
    selectedPriceCurrency: selectedCurrency,
    selectedPriceSuffix: suffixOptions.includes(currentSuffix) ? currentSuffix : "", 
    priceAttributeChanged: true
  });

  // Re-render suffix dropdown
  renderSuffixOptions(selectedCurrency);
});

settingsContent.append("label")
  .text("Filter Logic Mode:")
  .style("display", "block")
  .style("margin", "8px 0 4px 0")
  .style("font-weight", "bold");

const logicModes = ["AND-OR", "AND-AND"];

const logicSelect = settingsContent.append("select")
  .style("padding", "6px")
  .style("font-size", "14px")
  .style("border", "1px solid #ccc")
  .style("border-radius", "6px")
  .style("width", "100%");

logicSelect.selectAll("option")
  .data(logicModes)
  .enter()
  .append("option")
  .attr("value", d => d)
  .text(d => d.replace("-", " across / ") + " within");

logicSelect.property("value", getState().filterLogicMode || "AND-OR");

logicSelect.on("change", function () {
  updateState({ filterLogicMode: this.value});
});


// BUTTONS
settingsContent.append("button")
    .text("Save Filters")
    .style("padding", "6px 12px")
    .style("font-size", "14px")
    .style("background-color", "#f0f0f0")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .style("margin-right", "8px")
    .on("click", () => {
        const json = saveFilterSettings();
        const blob = new Blob([json], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "filters.json";
        link.click();
    });

settingsContent.append("button")
    .text("Load Filters")
    .style("padding", "6px 12px")
    .style("font-size", "14px")
    .style("background-color", "#f0f0f0")
    .style("color", "#000")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .style("margin-top", "8px")
    .on("click", () => document.getElementById("loadFilterInput").click());

wrapper.append("input")
  .attr("type", "file")
  .attr("id", "loadFilterInput")
  .style("display", "none")
  .on("change", function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        loadFilterSettings(e.target.result);  // ✅ uses state.js logic
      } catch (err) {
        alert("Failed to load filters.");
      }
    };
    reader.readAsText(file);
  });

  settingsContent.append("button")
  .text("Share Filters")
  .style("padding", "6px 12px")
  .style("font-size", "14px")
  .style("background-color", "#f0f0f0")
  .style("color", "#000")
  .style("border", "none")
  .style("border-radius", "4px")
  .style("cursor", "pointer")
  .style("margin-top", "8px")
  .on("click", () => {
    const shareURL = generateFilterShareURL();
    navigator.clipboard.writeText(shareURL).then(() => {
      alert("Shareable URL copied to clipboard!");
    }).catch(() => {
      alert("Failed to copy URL. Here it is:\n" + shareURL);
    });
  });


  wrapper.append("div")
  .attr("class", "ist-logo-wrapper")
  .style("margin-top", "20px")
  .style("display", "flex")
  .style("justify-content", "center")
  .append("img")
  .attr("src", "images/IST logo.jpg")
  .style("max-width", "90%")
  .style("height", "auto");

}

export function updateFilterPanel(originalData, filteredCards, selectedFilters, containerId = ".FilterPanel") {


    selectedFilters = selectedFilters || {};
  function getOrderIndex(category, value) {
  if (category === "Nº of Colors") {
    return numColorsOrder.indexOf(value);
  }
  if (category === "Color Identity") {
    return colorIdentityOrder.indexOf(value.toLowerCase());
  }
  return value;
}


    

    const uniqueCardNames = Array.from(new Set(filteredCards.map(card => card.name))).sort();

    // Update datalist
    d3.select(containerId)
      .select("datalist")
      .selectAll("option")
      .data(uniqueCardNames, d => d)
      .join(
        enter => enter.append("option").attr("value", d => d),
        update => update.attr("value", d => d),
        exit => exit.remove()
      );
    const filters = new Map();
const t0 = performance.now();
const groupedData = getState().groupedData;
const priceAttr = getEffectivePriceAttribute(getState());

function getFilteredSetExcluding(categoryToIgnore, selectedFiltersArg) {
  const filtered = filterData(groupedData, selectedFiltersArg, { excludeCategory: categoryToIgnore });
  const cleaned = filterPriceOnly(filtered, priceAttr);

  return cleaned
}

const mode = getState().filterLogicMode || "AND-OR";
const applyAndWithin = mode.endsWith("AND");

let cachedFilteredSet = null;
VISIBLE_FILTER_CATEGORIES.forEach(category => {
  const categoryGroup = groupedData[category];
  if (!categoryGroup) return;

let filteredSet;
if (!applyAndWithin) {
  // AND-OR logic: exclude current category to keep values independent
  filteredSet = getFilteredSetExcluding(category, selectedFilters);
} else {
  // AND-AND logic: include current category
  if (!cachedFilteredSet) {
    const allFiltered = filterData(groupedData, selectedFilters);
    cachedFilteredSet = filterPriceOnly(allFiltered, priceAttr);
  }
  filteredSet = cachedFilteredSet;
}

const filteredIds = new Set(filteredSet.map(c => c.index));



const optionCounts = new Map();
categoryGroup.forEach((cards, value) => {
  const count = cards.reduce((acc, card) =>
    acc + filteredIds.has(card.index), 0);

  optionCounts.set(value, count);
});

  const sortedEntries = Array.from(optionCounts.entries()).sort((a, b) => {
  const aVal = getOrderIndex(category, a[0]);
  const bVal = getOrderIndex(category, b[0]);
  if (typeof aVal === "number" && typeof bVal === "number") {
    return aVal - bVal;
  }
  return a[0].localeCompare(b[0]);
});

filters.set(category, new Map(sortedEntries));

if (category === "Color Identity") {
  // console.log("Sorted filter keys for Color Identity:");
  // console.log(Array.from(filters.get(category).keys()));
}

// console.log("OptionMap keys:");
// console.log(Array.from(optionMap.keys()).filter(k => k.startsWith("Color Identity")));
});



const t1 = performance.now();
    window.requestAnimationFrame(() => {
        optionMap.forEach((el, key) => {
            const [category, value] = key.split("|");
            if (!filters.has(category)) return;

            const normValue = getNormalizedKey(category, value);
            const count = filters.get(category)?.get(normValue) || 0;
            const span = el.select("span");
            span.text(`${formatDisplayLabel(category, normValue)} (${count})`).attr("data-count", count);

            const selectedSet = selectedFilters[category] || new Set();
             const isSelected = selectedSet.has(value);

            el.style("opacity", count === 0 && !isSelected ? 0.4 : 1);
            el.style("pointer-events", count === 0 && !isSelected ? "none" : "auto");
            el.style("background-color", isSelected ? "#cce5ff" : "#fff");
        });
    });

    Object.entries(selectedFilters).forEach(([category, selectedSet]) => {
        if (!VISIBLE_FILTER_CATEGORIES.includes(category) && category !== "FreeTextSearch") return;

        const pillContainer = pillMap.get(category);
        if (!pillContainer) return;
      
        const pills = pillContainer.selectAll(".pill")
          .data(Array.from(selectedSet), d => d);
      
        pills.enter()
          .append("div")
          .attr("class", "pill")
          .style("background",  "#8A9CE4")
          .style("color", "white")
          .style("padding", "2px 8px")
          .style("border-radius", "12px")
          .style("font-size", "12px")
          .text(d => formatDisplayLabel(category, d))

          .append("span")
          .style("margin-left", "6px")
          .style("cursor", "pointer")
          .text("\u2715")
          .on("click", function (event, value) {
              selectedSet.delete(value);
              const updatedFilters = cloneFilters(selectedFilters);
              updateState({ selectedFilters: updatedFilters });
          });
      
        pills.exit().remove();
      });
    


}


function extractCardValue(card, category) {
    switch (category) {
        case "Keywords":
            return Array.isArray(card.keywords) ? card.keywords : null;
        case "Supertypes": return card.supertype;
        case "Types": return card.type;
        case "Subtypes": return card.subtype;
        case "Set Types": return card.set_type;
        case "Originality": return card.originality;
        case "Rarity": return card.rarity;
        case "Set Names": return card.set_name;
        case "Year": return card.release_date ? new Date(card.release_date).getFullYear().toString() : null;
        case "Nº of Colors":
            if (card.number_of_colours >= 4) return "+4 Colors";
            if (card.number_of_colours === 0) return "Colorless";
            return `${card.number_of_colours} Colors`;
        case "Color Identity":
            if (!Array.isArray(card.color_identity) || card.color_identity.length === 0) return "colorless";
            return card.color_identity
                .slice()
                .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
                .join("")
                .toLowerCase();

        default: return null;
    }
} 






