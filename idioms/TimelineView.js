
import { updateState, getState } from "../state.js";
function updateYearTickStyles() {
    const yearFilter = getState().selectedFilters["Year"] || new Set();
    d3.selectAll(".x-axis .tick text")
        .style("fill", d => yearFilter.has(d.getFullYear().toString()) ? "#007bff" : "black")
        .style("font-weight", d => yearFilter.has(d.getFullYear().toString()) ? "bold" : "normal");
}

export function createTimelineView(data, containerId, isUpdate = false) {
    d3.select(containerId).selectAll("*").remove();

    let setMap = new Map();

    data.forEach(card => {
        let setName = card.set_name;
        if (!setMap.has(setName)) {
            setMap.set(setName, {
                name: setName,
                releaseDate: new Date(card.release_date),
                setType: card.set_type,
                cardCount: 0 
            });
        }
        setMap.get(setName).cardCount += 1;
    });

 
    let uniqueSets = Array.from(setMap.values()).sort((a, b) => a.releaseDate - b.releaseDate);
    const yearTypeCounts = new Map();
const typeCounts = new Map();

uniqueSets.forEach(set => {
    const year = set.releaseDate.getFullYear().toString();
    const type = set.setType;

    if (!yearTypeCounts.has(year)) yearTypeCounts.set(year, new Map());
    if (!yearTypeCounts.get(year).has(type)) yearTypeCounts.get(year).set(type, 0);
    yearTypeCounts.get(year).set(type, yearTypeCounts.get(year).get(type) + 1);

    if (!typeCounts.has(type)) typeCounts.set(type, 0);
    typeCounts.set(type, typeCounts.get(type) + 1);
});


  
    let allSetTypes = Array.from(new Set(uniqueSets.map(set => set.setType))).sort();
    let selectedSetTypes = allSetTypes.slice(0, 50); 


    uniqueSets = uniqueSets.filter(set => selectedSetTypes.includes(set.setType));

    
    const container = d3.select(containerId);
    const containerBounds = container.node().getBoundingClientRect();

    const containerWidth = containerBounds.width * 0.89;
    const searchContainerwidth = containerBounds.width * 0.1;
    const containerHeight = containerBounds.height;

    const chartWidth = containerWidth * 0.927;
    const chartHeight = containerHeight;

    const margin = { 
        top: 50, 
        right: 50, 
        bottom: 10, 
        left: 100 
    };


    if (isUpdate) {
        d3.select(containerId).select(".chart-wrapper").remove();
    }
container.insert("input", ":first-child")
    .attr("type", "text")
    .attr("placeholder", "Search set...")
    .attr("class", "timeline-search-bar")
    .style("position", "absolute")
    .style("top", "0px")
    .style("left", "0px")
    .style("margin", "10px")
    .style("padding", "5px")
    .style("font-size", "14px")
    .style("width", searchContainerwidth);

container.insert("div", ":nth-child(2)")
    .attr("class", "search-dropdown")
    .style("position", "absolute")
    .style("top", "54px")
    .style("left", "10px")
    .style("width", "200px")
    .style("max-height", "100px")
    .style("overflow-y", "auto")
    .style("background", "white")
    .style("border", "1px solid #ccc")
    .style("display", "none")
    .style("z-index", "9999");
container.select(".timeline-search-bar").on("input", function () {
    const query = this.value.toLowerCase().trim();
    const dropdown = container.select(".search-dropdown");

    if (!query) {
        dropdown.style("display", "none");
        return;
    }

    const matches = uniqueSets.filter(d => d.name.toLowerCase().includes(query));

    dropdown.selectAll("div").remove();

    if (matches.length === 0) {
        dropdown.style("display", "none");
        return;
    }

    dropdown.style("display", "block");

    dropdown.selectAll("div")
        .data(matches)
        .enter()
        .append("div")
        .text(d => d.name)
        .style("padding", "5px")
        .style("cursor", "pointer")
        .style("border-bottom", "1px solid #eee")
        .on("mouseover", function () {
            d3.select(this).style("background", "#f0f0f0");
        })
        .on("mouseout", function () {
            d3.select(this).style("background", "white");
        })
        .on("click", function (event, d) {
            container.select(".timeline-search-bar").property("value", d.name);
            dropdown.style("display", "none");

            d3.selectAll(".set-rect").classed("search-match", false);

            d3.selectAll(".set-rect")
                .filter(s => s.name === d.name)
                .classed("search-match", true)
                .transition()
                .delay(1000)
                .on("end", function () {
                    d3.select(this).classed("search-match", false);
                });

            const y = yScale(d.setType);
            scrollContainer.node().scrollTo({
                top: y - 50,
                behavior: "smooth"
            });
        });
});



    const wrapper = container.append("div")
        .attr("class", "chart-wrapper")
        .style("position", "relative")
        .style("width", `${containerWidth}px`);

    
    const fixedXAxis = wrapper.append("svg")
        .attr("width", containerWidth)
        .attr("height", margin.top - 10)
        .style("position", "sticky")
        .style("top", "0px")
        .style("background", "white")
        .style("z-index", "10");

    const xScale = d3.scaleTime()
        .domain([d3.min(uniqueSets, d => d.releaseDate), d3.max(uniqueSets, d => d.releaseDate)])
        .range([0, chartWidth]);

    const xAxis = d3.axisTop(xScale)
        .ticks(d3.timeYear.every(1))
        .tickFormat(d3.timeFormat("%Y"));

        

        const xAxisGroup = fixedXAxis.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(${margin.left}, ${margin.top - 20})`)
            .call(xAxis);
        
            const yearFilter = getState().selectedFilters["Year"] || new Set();

            xAxisGroup.selectAll(".tick")
            .select("text")
            .classed("year-tick-timeline", true)
            .style("text-anchor", "middle")
            .style("cursor", "pointer")
            .on("click", function (event, d) {
                const year = d.getFullYear().toString();
                const currentState = getState();
                const updatedFilters = {};

                for (const key in currentState.selectedFilters) {
                    updatedFilters[key] = new Set(currentState.selectedFilters[key]);
                }

                if (!updatedFilters["Year"]) {
                    updatedFilters["Year"] = new Set();
                }

                const isSelected = updatedFilters["Year"].has(year);

                if (isSelected) {
                    updatedFilters["Year"].delete(year);
                } else {
                    updatedFilters["Year"].add(year);
                }

                updateState({
                    selectedFilters: updatedFilters,
                    updateContext: "TimelineFilter"
                });

                
                updateYearTickStyles();
                updateSetRectOpacity();  
            })
            .on("mouseover", function (event, d) {
    const tooltip = d3.select("#tooltip");
    const year = d.getFullYear().toString();
    const types = yearTypeCounts.get(year);
    const tooltipHtml = types
        ? `<strong>${year}</strong><br>${Array.from(types.entries()).map(([t, count]) => `${t}: ${count}`).join("<br>")}`
        : `<strong>${year}</strong><br>No sets`;

    tooltip.style("display", "block").html(tooltipHtml);

   const tooltipNode = tooltip.node();
const tooltipWidth = tooltipNode.offsetWidth;
const tooltipHeight = tooltipNode.offsetHeight;
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;
const padding = 10;

let left = event.pageX + padding;
if (left + tooltipWidth > viewportWidth) {
    left = event.pageX - tooltipWidth - padding;
}
if (left < 0) left = padding;

let top = event.pageY + padding;
if (top + tooltipHeight > viewportHeight) {
    top = event.pageY - tooltipHeight - padding;
}
if (top < 0) top = padding;

tooltip.style("left", `${left}px`)
       .style("top", `${top}px`);

})
.on("mouseout", () => {
    d3.select("#tooltip").style("display", "none");
});


function updateYearTickStyles() {
    const yearFilter = getState().selectedFilters["Year"] || new Set();

    d3.selectAll(".x-axis .tick text")
        .style("fill", function(d) {
            const year = (d instanceof Date) ? d.getFullYear().toString() : d.toString();
            return yearFilter.has(year) ? "#007bff" : "black";
        })
        .style("font-weight", function(d) {
            const year = (d instanceof Date) ? d.getFullYear().toString() : d.toString();
            return yearFilter.has(year) ? "bold" : "normal";
        });
}

function updateSetTypeLabelStyles() {
    const setTypeFilter = getState().selectedFilters["Set Types"] || new Set();

    d3.selectAll(".set-type-label")
        .style("fill", d => setTypeFilter.has(d) ? "#007bff" : "black")
        .style("font-weight", d => setTypeFilter.has(d) ? "bold" : "normal");
}


function updateSetRectOpacity() {
    const yearFilter = getState().selectedFilters["Year"] || new Set();

    d3.selectAll(".set-rect")
        .transition()
        .duration(200)
        .style("opacity", d => {
            const year = d.releaseDate.getFullYear().toString();
            return yearFilter.size === 0 || yearFilter.has(year) ? 1 : 0.2;
        });
}
        
        


    const scrollContainer = wrapper.append("div")
        .attr("class", "chart-container")
        .style("width", `${containerWidth}px`)
        .style("height", `${containerHeight*0.75}px`) 
        .style("overflow-y", "scroll") 
        .style("overflow-x", "hidden") 
        .style("border", "none");

    const lineSpacingFactor = 0.5;  

    const adjustedChartHeight = selectedSetTypes.length * lineSpacingFactor * 30;

    const svg = scrollContainer.append("svg")
        .attr("width", containerWidth)
        .attr("height", adjustedChartHeight + 20);
    

    const zoom = d3.zoom()
        .scaleExtent([1, 10]) 
        .translateExtent([[0, 0], [chartWidth, adjustedChartHeight]])
        .on("zoom", zoomed);
    
    svg.call(zoom);
    
    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, 10)`);

       

        let yScale = d3.scalePoint()
            .domain(selectedSetTypes)
            .range([0, selectedSetTypes.length * lineSpacingFactor * 30]); 
        

    selectedSetTypes.forEach(setType => {
        chartGroup.append("line")
            .attr("x1", 0)
            .attr("y1", yScale(setType))
            .attr("x2", chartWidth)
            .attr("y2", yScale(setType))
            .attr("stroke", "black")
            .attr("stroke-width", 2);
    });

 
    const squares = chartGroup.selectAll(".set-square")
        .data(uniqueSets)
        .enter()
        .append("rect")
        .attr("class", "set-square set-rect")
        .attr("x", d => xScale(d.releaseDate) - 2.5)
        .attr("y", d => yScale(d.setType) - 5)
        .attr("width", 8)
        .attr("height", 8)
        .attr("fill", "#C3C3C3")
        .attr("stroke", "black")
        .on("mouseover", function (event, d) {
    const tooltip = d3.select("#tooltip");

    // Set content first so dimensions are accurate
    tooltip
        .style("display", "block")
        .html(`
            <strong>${d.name}</strong><br>
            ${d.releaseDate.toDateString()}<br>
            Type: ${d.setType}<br>
            Cards in Set: ${d.cardCount}
        `);

    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const horizontalPadding = 10;
    const verticalPadding = 10;

    let left = event.pageX + horizontalPadding;
    if (left + tooltipWidth > viewportWidth) {
        // Flip to left side
        left = event.pageX - tooltipWidth - horizontalPadding;
    }
    if (left < 0) left = horizontalPadding;

    let top = event.pageY + verticalPadding;
    if (top + tooltipHeight > viewportHeight) {
        // Flip above
        top = event.pageY - tooltipHeight - verticalPadding;
    }
    if (top < 0) top = verticalPadding;

    tooltip
        .style("left", `${left}px`)
        .style("top", `${top}px`);
})


        .on("mouseout", function () {
                    d3.select("#tooltip").style("display", "none");
                })
        .on("click", function (event, d) {
            const currentState = getState();
            const updatedFilters = {};
        
            for (const key in currentState.selectedFilters) {
                updatedFilters[key] = new Set(currentState.selectedFilters[key]);
            }
        
            if (!updatedFilters["Set Names"]) {
                updatedFilters["Set Names"] = new Set();
            }
        
            const isSelected = updatedFilters["Set Names"].has(d.name);
        
            if (isSelected) {
                updatedFilters["Set Names"].delete(d.name);
                d3.select(this).attr("fill", "#C3C3C3"); 
            } else {
                updatedFilters["Set Names"].add(d.name);
                d3.select(this).attr("fill", "#007bff"); 
            }
        
            updateState({
                selectedFilters: updatedFilters,
                updateContext: "TimelineFilter"
            });
        });
                
        
        const selectedSetNames = getState().selectedFilters["Set Names"] || new Set();

        squares.attr("fill", d =>
            selectedSetNames.has(d.name) ? "#007bff" : "#C3C3C3"
        );
        
    
 
    chartGroup.selectAll(".set-type-label")
        .data(selectedSetTypes)
        .enter()
        .append("text")
        .attr("class", "set-type-label")
        .attr("x", -10)
        .attr("y", d => yScale(d) + 5)
        .attr("text-anchor", "end")
        .attr("font-size", "12px")
        .attr("fill", "black")
        .text(d => d)
        .on("click", function (event, type) {
    const currentState = getState();
    const updatedFilters = {};

    for (const key in currentState.selectedFilters) {
        updatedFilters[key] = new Set(currentState.selectedFilters[key]);
    }

    if (!updatedFilters["Set Types"]) {
        updatedFilters["Set Types"] = new Set();
    }

    if (updatedFilters["Set Types"].has(type)) {
        updatedFilters["Set Types"].delete(type);
    } else {
        updatedFilters["Set Types"].add(type);
    }

    updateState({
        selectedFilters: updatedFilters,
        updateContext: "TimelineFilter"
    });
})
        .on("mouseover", function (event, type) {
    const count = typeCounts.get(type) || 0;
    const tooltip = d3.select("#tooltip")
    .style("display", "block")
    .html(`<strong>${type}</strong><br>${count} sets`);

    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;

    let left = event.pageX + padding;
    if (left + tooltipWidth > viewportWidth) {
        left = event.pageX - tooltipWidth - padding;
    }
    if (left < 0) left = padding;

    let top = event.pageY + padding;
    if (top + tooltipHeight > viewportHeight) {
        top = event.pageY - tooltipHeight - padding;
    }
    if (top < 0) top = padding;

    tooltip.style("left", `${left}px`)
        .style("top", `${top}px`);


    })
    .on("mouseout", () => {
        d3.select("#tooltip").style("display", "none");
    });
    //updateSetTypeLabelStyles();

    ;


function clicked(selectedSet) {
    const selectedYear = selectedSet.releaseDate.getFullYear();
    const zoomStart = new Date(selectedYear, 0, 1);
    const zoomEnd = new Date(selectedYear + 1, 11, 31);


    xScale.domain([zoomStart, zoomEnd]);

    const t = d3.transition().duration(750);


    fixedXAxis.transition(t).select(".x-axis")
        .call(xAxis.scale(xScale));

    
    squares.transition(t)
        .style("opacity", d => (d.releaseDate >= zoomStart && d.releaseDate <= zoomEnd) ? 1 : 0)
        .attr("x", d => xScale(d.releaseDate) - 2.5);

   
}

    
    
    


function zoomed(event) {
    const transform = event.transform;

    
    const newXScale = transform.rescaleX(xScale);

    
    fixedXAxis.select(".x-axis")
        .transition().duration(100)
        .call(xAxis.scale(newXScale));

    
    squares.transition().duration(100)
    .attr("x", d => newXScale(d.releaseDate) - 2.5)
    .style("opacity", d => {
        const date = d.releaseDate;
        return (date >= newXScale.domain()[0] && date <= newXScale.domain()[1]) ? 1 : 0;
    });

}


}

export function highlightTimelineSets(hoveredCards) {
    const hoveredSets = new Set();

    (hoveredCards || []).forEach(card => {
        (card.all_sets || []).forEach(set => {
            hoveredSets.add(set.name.toLowerCase());
        });
    });

    d3.selectAll(".set-rect").classed("highlighted", d =>
        hoveredSets.has(d.name.toLowerCase())
    );
}


