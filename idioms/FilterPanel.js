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
        "Keywords": new Set(),
        "Supertypes": new Set(),
        "Types": new Set(),
        "Subtypes": new Set(),
        "Set Types": new Set()
    };
    
    const cardNameSet = new Set();
    
    data.forEach(card => {
        if (card.name) cardNameSet.add(card.name);
        if (Array.isArray(card.keywords)) {
            card.keywords.forEach(k => filters["Keywords"].add(k));
        }
        if (card.supertype) {
            card.supertype.split(/[\s/]+/).forEach(su => filters["Supertypes"].add(su.trim()));
        }
        if (card.type) {
            card.type.split(/[\s/]+/).forEach(t => filters["Types"].add(t.trim()));
        }
        if (card.subtype) {
            card.subtype.split(/[\s/]+/).forEach(s => filters["Subtypes"].add(s.trim()));
        }
        
        if (card.set_type) filters["Set Types"].add(card.set_type);
    });
    

    for (const key in filters) {
        filters[key] = Array.from(filters[key]).sort();
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

        
        const option = content.selectAll("div")
            .data(values)
            .enter()
            .append("div")
            .style("display", "flex")
            .style("justify-content", "space-between")
            .style("align-items", "center")
            .style("padding", "4px 2px")
            .style("font-size", "0.9em");

        option.append("span")
            .text(d => d)
            .style("margin-right", "10px");

        option.append("input")
            .attr("type", "checkbox")
            .attr("value", d => d)
            .on("change", (event, d) => {
                const checked = event.target.checked;
                console.log(`${checked ? "Selected" : "Unselected"}: ${d}`);
                // TODO
            });
    });
}
