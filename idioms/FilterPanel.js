
import { updateState, getState, saveFilterSettings, loadFilterSettings, generateFilterShareURL} from "../state.js";
import { filterData } from "../script.js"; 

const optionMap = new Map();  
const pillMap = new Map();


function addToMap(map, key) {
    if (!key) return;
    const trimmed = key.trim();
    if (!trimmed) return;
    map.set(trimmed, (map.get(trimmed) || 0) + 1);
}

export function createFilterPanel(data, containerId, selectedFiltersFromState, isUpdate = false) {
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

    const filters = {
        "Keywords": new Map(),
        "Supertypes": new Map(),
        "Types": new Map(),
        "Subtypes": new Map(),
        "Set Types": new Map(),
        "Set Names": new Map(),
        "Originality": new Map(),
        "Rarity": new Map()
    };

    const selectedFilters = selectedFiltersFromState;
    const cardNameSet = new Set();

    data.forEach(card => {
        if (card.name) cardNameSet.add(card.name);
        if (Array.isArray(card.keywords)) card.keywords.forEach(k => addToMap(filters["Keywords"], k));
        if (card.supertype) {
            if (card.supertype.toLowerCase() === "no supertype") {
                addToMap(filters["Supertypes"], "No supertype");
            } else {
                card.supertype.split(/[\s/]+/).forEach(su => addToMap(filters["Supertypes"], su));
            }
        }
        if (card.type) card.type.split(/[\s/]+/).forEach(t => addToMap(filters["Types"], t));
        if (card.subtype) card.subtype.split(/[\s/]+/).forEach(s => addToMap(filters["Subtypes"], s));
        if (card.set_type) addToMap(filters["Set Types"], card.set_type);
        if (card.set_name) addToMap(filters["Set Names"], card.set_name);

        if (card.originality) addToMap(filters["Originality"], card.originality);
        if (card.rarity) addToMap(filters["Rarity"], card.rarity);
    });

    for (const key in filters) {
        filters[key] = Array.from(filters[key].entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }

const filteredCards = filterData(data, selectedFilters);
const uniqueCardNames = Array.from(new Set(filteredCards.map(card => card.name))).sort();


    const inputId = "searchInput_" + Math.random().toString(36).substring(2);
    wrapper.append("input")
        .attr("type", "text")
        .attr("list", inputId)
        .attr("placeholder", "Search cards...")
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

    updateState({ hoveredCards: newHoveredCards });

    // Immediately reflect in scatterplot
    const scatterSvg = d3.select(".Scatterplot svg");
    scatterSvg.selectAll(".dots circle")
        .attr("stroke", d => newHoveredCards.some(c => c.name === d.name) ? "#000" : "none")
        .attr("stroke-width", d => newHoveredCards.some(c => c.name === d.name) ? 2.5 : null);
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
        .text("Reset Filters")
        .style("padding", "6px 12px")
        .style("font-size", "14px")
        .style("background-color", "#dc3545")
        .style("color", "#fff")
        .style("border", "none")
        .style("border-radius", "4px")
        .style("cursor", "pointer")
        .on("click", () => {
            const clearedFilters = {};
            for (const key in selectedFilters) clearedFilters[key] = new Set();
            d3.selectAll(".set-square").attr("fill", "#C3C3C3").style("opacity", 1);
            d3.selectAll(".year-tick-timeline").style("fill", "black").style("font-weight", "normal");
            d3.selectAll(".data-point").attr("fill", "#C3C3C3").style("opacity", 1)
            .style("font-weight", "normal");
            updateState({ selectedFilters: clearedFilters });
            createFilterPanel(data, containerId, clearedFilters, true);
        });

    Object.entries(filters).forEach(([category, values]) => {
        const section = wrapper.append("div")
            .attr("class", "filter-section")
            .style("margin-top", "12px")
            .style("width", "95%");

        section.append("div")
            .attr("class", "dropdown-header")
            .text(category)
            .style("background", "#f0f0f0")
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
                pillContainer.style("display", isVisible ? "none" : "flex");
            });

        const pillContainer = section.append("div")
            .attr("class", "pill-container")
            .style("margin-top", "6px")
            .style("display", "none")
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
                .style("background", "#007bff")
                .style("color", "white")
                .style("padding", "2px 8px")
                .style("border-radius", "12px")
                .style("font-size", "12px")
                .text(d => d)
                .append("span")
                .style("margin-left", "6px")
                .style("cursor", "pointer")
                .text("\u2715")
                .on("click", function (event, value) {
                    selectedSet.delete(value);
                    const updatedFilters = {};
                    for (const key in selectedFilters) {
                        updatedFilters[key] = new Set(selectedFilters[key]);
                    }
                    updateState({ 
    selectedFilters: updatedFilters,
    updateContext: d.category === "Set Names" ? "TimelineFilter" : undefined
                    });
                    if (d.category === "Set Names") {
                    d3.selectAll(".set-rect")
                        .attr("fill", rectData =>
                        selectedFilters["Set Names"].has(rectData.name) ? "#007bff" : "#C3C3C3"
                        );
                    }

                    updatePills();
                    updateFilterStyles();
                    clearTimeout(window._filterPanelTimeout);
                    window._filterPanelTimeout = setTimeout(() => {
                        console.log("[pills] Selected filters now:", [...selectedSet]);
                        updateFilterPanel(data);
                    }, 50);
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
                const isSelected = selectedSet.has(d.value);
                isSelected ? selectedSet.delete(d.value) : selectedSet.add(d.value);
                const updatedFilters = structuredClone(selectedFilters);
                updateState({ selectedFilters: updatedFilters });
                updatePills();
                updateFilterStyles();
                clearTimeout(window._filterPanelTimeout);
                window._filterPanelTimeout = setTimeout(() => {
                    

                    updateFilterPanel(data, updatedFilters);
                }, 50);
            });

        option.append("span")
            .text(d => `${d.value} (${d.count})`)
            .attr("data-count", d => d.count)
            .style("margin-right", "10px");

        option.each(function (d) {
            const key = `${category}|${d.value}`;
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
const priceWrapper = settingsContent.append("div")
    .style("margin-bottom", "12px");

priceWrapper.append("label")
    .text("Select Price Attribute:")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("display", "block")
    .style("margin-bottom", "4px");

const priceSelect = priceWrapper.append("select")
    .attr("id", "priceAttributeSelect")
    .style("padding", "6px")
    .style("width", "100%")
    .style("font-size", "14px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px");

priceSelect.selectAll("option")
    .data(sortedPriceFields)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d.replace("price_", "").toUpperCase());

priceSelect.property("value", getState().selectedPriceAttribute);
priceSelect.on("change", function () {
    const selectedPriceAttribute = this.value;
    updateState({ selectedPriceAttribute });
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
        const filters = getState().selectedFilters;
        const json = JSON.stringify(Object.fromEntries(
            Object.entries(filters).map(([k, v]) => [k, Array.from(v)])
        ), null, 2);
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
                const loaded = JSON.parse(e.target.result);
                const newFilters = {};
                for (const key in loaded) {
                    newFilters[key] = new Set(loaded[key]);
                }
                updateState({ selectedFilters: newFilters });
                createFilterPanel(data, containerId, newFilters, true);
            } catch (err) {
                alert("Failed to load filters.");
            }
        };
        reader.readAsText(file);
    });

}

export function updateFilterPanel(originalData, selectedFilters, containerId = ".FilterPanel") {
    
    selectedFilters = selectedFilters || {};

     const filteredCards = filterData(originalData, selectedFilters);
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
    const filters = {
        "Keywords": new Map(),
        "Supertypes": new Map(),
        "Types": new Map(),
        "Subtypes": new Map(),
        "Set Types": new Map(),
        "Set Names": new Map(),
        "Originality": new Map(),
        "Rarity": new Map(),
        "IcicleColorGroups": new Map(),
        "IcicleColorIdentity": new Map()
    };

    Object.keys(filters).forEach(category => {
        // Partial filter: ignore the current category
        const partialFilters = {};
        for (const key in selectedFilters) {
            partialFilters[key] = new Set(selectedFilters[key]);
        }
        partialFilters[category] = new Set(); // empty for this category

        const partiallyFilteredData = originalData.filter(card => {
            for (const [cat, values] of Object.entries(partialFilters)) {
                if (!values || values.size === 0) continue;
                const cardValue = extractCardValue(card, cat);
                if (!cardValue) return false;

                const isSplittable = ["Supertypes", "Types", "Subtypes"].includes(cat);
                const cardValues = Array.isArray(cardValue)
                    ? cardValue.map(v => v.trim().toLowerCase())
                    : (isSplittable
                        ? cardValue.split(/[\s/]+/).map(v => v.trim().toLowerCase())
                        : [cardValue.trim().toLowerCase()]);

                const filterValues = new Set([...values].map(v => v.trim().toLowerCase()));
                if (!cardValues.some(v => filterValues.has(v))) return false;
            }
            return true;
        });

        // Count the values for this category using the partially filtered data
        partiallyFilteredData.forEach(card => {
            const cardValue = extractCardValue(card, category);
            if (!cardValue) return;

            const isSplittable = ["Supertypes", "Types", "Subtypes"].includes(category);
            const values = Array.isArray(cardValue)
                ? cardValue.map(v => v.trim())
                : (isSplittable ? cardValue.split(/[\s/]+/).map(v => v.trim()) : [cardValue.trim()]);

            values.forEach(v => addToMap(filters[category], v));
        });

        

    });

    window.requestAnimationFrame(() => {
        optionMap.forEach((el, key) => {
            const [category, value] = key.split("|");
            if (!filters[category]) return;

            const count = filters[category]?.get(value) || 0;
            const span = el.select("span");
            span.text(`${value} (${count})`).attr("data-count", count);

            const selectedSet = selectedFilters[category] || new Set();
            const isSelected = selectedSet.has(value);

            el.style("opacity", count === 0 && !isSelected ? 0.4 : 1);
            el.style("pointer-events", count === 0 && !isSelected ? "none" : "auto");
            el.style("background-color", isSelected ? "#cce5ff" : "#fff");
        });
    });

    Object.entries(selectedFilters).forEach(([category, selectedSet]) => {
        const pillContainer = pillMap.get(category);
        if (!pillContainer) return;
      
        const pills = pillContainer.selectAll(".pill")
          .data(Array.from(selectedSet), d => d);
      
        pills.enter()
          .append("div")
          .attr("class", "pill")
          .style("background", "#007bff")
          .style("color", "white")
          .style("padding", "2px 8px")
          .style("border-radius", "12px")
          .style("font-size", "12px")
          .text(d => d)
          .append("span")
          .style("margin-left", "6px")
          .style("cursor", "pointer")
          .text("\u2715")
          .on("click", function (event, value) {
              selectedSet.delete(value);
              const updatedFilters = {};
              for (const key in selectedFilters) {
                  updatedFilters[key] = new Set(selectedFilters[key]);
              }
              updateState({ selectedFilters: updatedFilters });
          });
      
        pills.exit().remove();
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
        case "Year": return card.release_date ? new Date(card.release_date).getFullYear().toString() : null;
        case "IcicleColorGroups":
            if (card.number_of_colours >= 4) return "+4 Colors";
            if (card.number_of_colours === 0) return "Colorless";
            return `${card.number_of_colours} Colors`;
        case "IcicleColorIdentity":
            if (!Array.isArray(card.color_identity) || card.color_identity.length === 0) return "Colorless";
            return card.color_identity.sort().join("-");
        default: return null;
    }
} 




