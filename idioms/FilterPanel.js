//Issues fixed: 18, 22


function addToMap(map, key) {
    if (!key) return;
    const trimmed = key.trim();
    if (!trimmed) return;
    map.set(trimmed, (map.get(trimmed) || 0) + 1);
}


function createFilterPanel(data, containerId, isUpdate = false) {
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
            "Set Types": new Map()
        };
        
    
    const cardNameSet = new Set();
    
    data.forEach(card => {
        if (card.name) cardNameSet.add(card.name);
    
        if (Array.isArray(card.keywords)) {
            card.keywords.forEach(k => addToMap(filters["Keywords"], k));
        }
        if (card.supertype) {
            card.supertype.split(/[\s/]+/).forEach(su => addToMap(filters["Supertypes"], su));
        }
        if (card.type) {
            card.type.split(/[\s/]+/).forEach(t => addToMap(filters["Types"], t));
        }
        if (card.subtype) {
            card.subtype.split(/[\s/]+/).forEach(s => addToMap(filters["Subtypes"], s));
        }
        if (card.set_type) {
            addToMap(filters["Set Types"], card.set_type);
        }
    });
    
    

    for (const key in filters) {
        filters[key] = Array.from(filters[key].entries())
            .sort((a, b) => a[0].localeCompare(b[0])); // entries() returns [key, count]
    }
    

    const uniqueCardNames = Array.from(cardNameSet).sort();

    
    const inputId = "searchInput_" + Math.random().toString(36).substring(2);
    wrapper.append("input")
        .attr("type", "text")
        .attr("list", inputId)
        .attr("placeholder", "Search cards...")
        .style("width", "90%")
        .style("margin-bottom", "12px")
        .style("padding", "6px")
        .style("font-size", "1em");

    wrapper.append("datalist")
        .attr("id", inputId)
        .selectAll("option")
        .data(uniqueCardNames)
        .enter()
        .append("option")
        .attr("value", d => d);

    
    Object.entries(filters).forEach(([category, values]) => {
        const section = wrapper.append("div")
            .attr("class", "filter-section")
            .style("margin-top", "12px");

        
        section.append("div")
            .attr("class", "dropdown-header")
            .text(category)
            .style("background", "#f0f0f0")
            .style("padding", "6px 10px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "6px")
            .style("cursor", "pointer")
            .style("font-weight", "bold")
            .on("click", function () {
                const content = d3.select(this.nextSibling);
                const visible = content.style("display") === "block";
                content.style("display", visible ? "none" : "block");
            });

        
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
        
        
        const searchBox = section.append("input")
            .attr("type", "text")
            .attr("placeholder", `Search ${category}...`)
            .style("display", "none")
            .style("width", "90%")
            .style("padding", "4px")
            .style("margin-top", "4px")
            .style("font-size", "0.9em")
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
        
        
        const option = content.selectAll("div")
            .data(values.map(([value, count]) => ({ value, count })))
            .enter()
            .append("div")
            .attr("class", "filter-option")
            .style("display", "flex")
            .style("justify-content", "space-between")
            .style("align-items", "center")
            .style("padding", "4px 2px")
            .style("font-size", "0.9em");
        
            option.append("span")
            .text(d => `${d.value}. ${d.count}`)
            .style("margin-right", "10px");
        
            option.append("input")
            .attr("type", "checkbox")
            .attr("value", d => d.value)
            .on("change", (event, d) => {
                const checked = event.target.checked;
                console.log(`${checked ? "Selected" : "Unselected"}: ${d.value}`);
                // TODO: Trigger filter logic
            });
        
    });
}
