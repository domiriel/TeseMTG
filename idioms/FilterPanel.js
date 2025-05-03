//Issues fixed: 18, 22
import { updateState, getState } from "../state.js";


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
        if (card.originality) addToMap(filters["Originality"], card.originality);
        if (card.rarity) addToMap(filters["Rarity"], card.rarity);

    });

    for (const key in filters) {
        filters[key] = Array.from(filters[key].entries())
            .sort((a, b) => a[0].localeCompare(b[0]));
    }

    const uniqueCardNames = Array.from(cardNameSet).sort();

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

    // 1. Find all unique price attributes
const priceFields = new Set();
data.forEach(card => {
    Object.keys(card).forEach(key => {
        if (key.startsWith("price_")) {
            priceFields.add(key);
        }
    });
});

const sortedPriceFields = Array.from(priceFields).sort();

// 2. Add a dropdown for price selection
const priceWrapper = wrapper.append("div")
    .style("width", "100%")
    .style("margin-bottom", "16px");


priceWrapper.append("label")
    .text("Select Price Attribute:")
    .style("margin-right", "8px")
    .style("font-size", "16px")
    .style("font-weight", "bold");

const priceSelect = priceWrapper.append("select")
    .attr("id", "priceAttributeSelect")
    .style("padding", "6px")
    .style("width", "95%")
    .style("font-size", "16px");

priceSelect.selectAll("option")
    .data(sortedPriceFields)
    .enter()
    .append("option")
    .attr("value", d => d)
    .text(d => d.replace("price_", "").toUpperCase()); // Prettify option names

    priceSelect.on("change", function() {
        const selectedPriceAttribute = this.value;
        console.log("Selected price attribute:", selectedPriceAttribute);
        updateState({ selectedPriceAttribute });

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
            .style("box-sizing", "border-box")
            .style("overflow", "hidden")
            .style("text-overflow", "ellipsis");
            ;

            const content = section.append("div")
            .attr("class", "dropdown-content")
            .style("display", "none")
            .style("width", "100%")
            .style("box-sizing", "border-box")
            .style("overflow-x", "hidden")  
            .style("max-height", "160px")
            .style("overflow-y", "auto")
            .style("margin-top", "4px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "6px")
            .style("padding", "6px")
            .style("background", "#fff");
        
            const searchBox = section.insert("input", function() {
                return content.node(); // insert before the content div
            })  .attr("type", "text")
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

            const option = content.selectAll("div")
            .data(values.map(([value, count]) => ({
                category,
                value,
                count
            })))        
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
            .style("overflow", "hidden")
            .attr("data-category", category)
            .attr("data-value", d => d.value);
            updateFilterStyles();
            updatePills(category);
            updateFilterPanel(data);

        option.append("span")
            .text(d => `${d.value}. (${d.count})`)
            .style("margin-right", "10px");

            
            
            option
            .on("click", function(event, d) {
                const set = selectedFilters[category];
                const isSelected = set.has(d.value);
                if (isSelected) {
                    set.delete(d.value);
                } else {
                    set.add(d.value);
                }
                const updatedFilters = {};
                for (const key in selectedFilters) {
                updatedFilters[key] = new Set(selectedFilters[key]);
                }
                updateState({ selectedFilters: updatedFilters });
                updatePills(category);
                
                updateFilterStyles(); // new function to re-style selected options
                updateFilterPanel(data);
            });
        
            updateFilterStyles();
        updatePills(category);
            

            
            
        function updateFilterStyles() {
            content.selectAll(".filter-option")
                .style("background-color", d =>
                    selectedFilters[category].has(d.value) ? "#cce5ff" : "#fff"
                )
                .style("cursor", "pointer");
        }
        
        function updatePills(cat) {
            const set = selectedFilters[cat];
            const pills = pillContainer.selectAll(".pill")
                .data(Array.from(set), d => d);

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
                .text("✕")
                .on("click", function (event, value) {
                    selectedFilters[cat].delete(value);
                
                    // 🔁 Rebuild updated filter state
                    const updatedFilters = {};
                    for (const key in selectedFilters) {
                        updatedFilters[key] = new Set(selectedFilters[key]);
                    }
                
                    // 🔄 Update global state and UI
                    updateState({ selectedFilters: updatedFilters });
                    updatePills(cat);
                    updateFilterStyles(); // restore color styling
                    updateFilterPanel(data); // reapply filtered counts
                });
                

            pills.exit().remove();
        }
        
    });
}
export function updateFilterPanel(data, containerId = ".FilterPanel") {
    const { selectedFilters } = getState();
  
    const filters = {
      "Keywords": new Map(),
      "Supertypes": new Map(),
      "Types": new Map(),
      "Subtypes": new Map(),
      "Set Types": new Map(),
      "Originality": new Map(),
      "Rarity": new Map()
    };
  
    Object.keys(filters).forEach(category => {
      // Deep copy filters and exclude this category
      const partialFilters = {};
      for (const key in selectedFilters) {
        partialFilters[key] = new Set(selectedFilters[key]);
      }
      partialFilters[category] = new Set();
  
      const filtered = data.filter(card => {
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
          const match = cardValues.some(v => filterValues.has(v));
          if (!match) return false;
        }
        return true;
      });
  
      // Count values for this category
      filtered.forEach(card => {
        const cardValue = extractCardValue(card, category);
        if (!cardValue) return;
  
        const isSplittable = ["Supertypes", "Types", "Subtypes"].includes(category);
        const values = Array.isArray(cardValue)
          ? cardValue.map(v => v.trim())
          : (isSplittable
              ? cardValue.split(/[\s/]+/).map(v => v.trim())
              : [cardValue.trim()]);
  
        values.forEach(v => addToMap(filters[category], v));
      });
    });
  
    // ✅ Apply updated values to DOM
    d3.selectAll(".filter-option").each(function (d) {
      const el = d3.select(this);
      const category = el.attr("data-category");
      const value = el.attr("data-value");
  
      const count = filters[category]?.get(value) || 0;
      el.select("span").text(`${value}. (${count})`);
      el.style("opacity", count === 0 ? 0.4 : 1);
      el.style("pointer-events", count === 0 ? "none" : "auto");
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
      default: return null;
    }
  }
  
  