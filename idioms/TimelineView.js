
import { updateState, getState } from "../state.js";
import { updateFilterPanel } from "./FilterPanel.js";


const timelineTooltipText = `
<strong>Timeline Interactions:</strong><br>
• <strong>Click</strong> a year: toggle filter by year.<br>
• <strong>Hover</strong> a year: see number of sets and types.<br>
• <strong>Click</strong> a set square: filter by set.<br>
• <strong>Click</strong> a set type label: filter by type.<br>
• <strong>Search</strong> for a set name using the bar above.<br>
• <strong>Brush</strong> to select multiple sets.<br>
• <strong>Scroll</strong> to focus a time range.
`;


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



function updateSetRectOpacity() {
    const yearFilter = getState().selectedFilters["Year"] || new Set();
    const setRects = d3.selectAll(".set-rect");

    setRects
        .interrupt()  // Stop any current transition to prevent stacking
        .transition()
        .duration(150)
        .style("opacity", d => {
            const year = d.releaseDate.getFullYear().toString();
            return yearFilter.size === 0 || yearFilter.has(year) ? 1 : 0.2;
        });
}


function getClonedFilters() {
    const currentState = getState();
    const cloned = {};
    for (const key in currentState.selectedFilters) {
        cloned[key] = new Set(currentState.selectedFilters[key]);
    }
    return cloned;
}

        
export function createTimelineView(data, containerId, isUpdate = false) {
    const tooltip = d3.select("#tooltip");
    d3.select(containerId).selectAll("*").remove();

    data.forEach(card => {
    if (!card._parsedDate) {
        card._parsedDate = new Date(card.release_date);
    }
});
    let setMap = new Map();

    data.forEach(card => {
        let setName = card.set_name;
        if (!setMap.has(setName)) {
            setMap.set(setName, {
                name: setName,
                releaseDate: card._parsedDate,
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
    const searchContainerwidth = containerBounds.width * 0.07;
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
        .style("left", "-4px")
        .style("margin", "10px")
        .style("white-space", "nowrap")
        .style("z-index", "9999")
        .style("padding", "5px")
        .style("overflow", "visible")
        .style("font-size", "14px")
        .style("width", "9.5%");


    const searchInput = container.select(".timeline-search-bar");
const searchBounds = searchInput.node().getBoundingClientRect();

const iconLeft = searchBounds.left + searchBounds.width + 8; // 8px spacing
const relativeLeft = iconLeft - containerBounds.left;
    const infoGroup = container.append("div")
  .attr("class", "timeline-info-icon")
  .style("position", "absolute")
  .style("top", "16px")
  .style("left", `${relativeLeft}px`)
  .style("width", "20px")
  .style("height", "20px")
  .style("background", "#ccc")
  .style("border", "1px solid #000")
  .style("border-radius", "50%")
  .style("text-align", "center")
  .style("line-height", "20px")
  .style("cursor", "help")
  .style("z-index", "10000")
  .text("i")
  .on("mouseover", function (event) {
    d3.select("#tooltip")
      .style("display", "block")
      .html(timelineTooltipText);
  })
  .on("mousemove", function (event) {
    const tooltip = d3.select("#tooltip");
    const tooltipWidth = tooltip.node().offsetWidth;
    const tooltipHeight = tooltip.node().offsetHeight;
    const padding = 10;

    let x = event.pageX + padding;
    let y = event.pageY + padding;

    if (x + tooltipWidth > window.innerWidth) {
      x = window.innerWidth - tooltipWidth - 10;
    }
    if (y + tooltipHeight > window.innerHeight) {
      y = window.innerHeight - tooltipHeight - 10;
    }

    tooltip
      .style("left", `${x}px`)
      .style("top", `${y}px`);
  })
  .on("mouseout", function () {
    d3.select("#tooltip").style("display", "none");
  });


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
        .data(matches, d => d.name)
        .join(
            enter => enter.append("div")
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
                .on("click", function (event, d) {             container.select(".timeline-search-bar").property("value", d.name);
                dropdown.style("display", "none");

                d3.selectAll(".set-rect").classed("search-match", false);

                d3.selectAll(".set-rect")
                    .filter(s => s.name === d.name)
                    .classed("search-match", true);

                setTimeout(() => {
                    d3.selectAll(".set-rect")
                        .filter(s => s.name === d.name)
                        .classed("search-match", false);
                }, 1000);

                const y = yScale(d.setType);
                scrollContainer.node().scrollTo({
                    top: y - 50,
                    behavior: "smooth"
                });}),
            update => update,
            exit => exit.remove()
        );
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
        .style("background", "hsl(44, 65%, 97%)")
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
        


            xAxisGroup.selectAll(".tick")
            .select("text")
            .classed("year-tick-timeline", true)
            .style("text-anchor", "middle")
            .style("cursor", "pointer")
            .on("click", function (event, d) {
                const year = d.getFullYear().toString();
                const updatedFilters = getClonedFilters();


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

                updateFilterPanel(getState().originalData, updatedFilters);
                updateYearTickStyles();
                updateSetRectOpacity();  
            })
            .on("mouseover", function (event, d) {

    const year = d.getFullYear().toString();
    const types = yearTypeCounts.get(year);
    let totalSets = 0;
    if (types) {
        totalSets = Array.from(types.values()).reduce((sum, count) => sum + count, 0);
    }
    const tooltipHtml = types
        ? `<strong>${year}</strong><br> <strong> Total Sets: ${totalSets} </strong><br>${Array.from(types.entries()).map(([t, count]) => `${t}: ${count}`).join("<br>")}`
        : `<strong>${year}</strong><br>No sets`;

    tooltip.style("display", "block").html(tooltipHtml);

const { width: tooltipWidth, height: tooltipHeight } = tooltip.node().getBoundingClientRect();
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

    const extraBrushPadding = 20;
const brush = d3.brush()
    .extent([[0, -extraBrushPadding], [chartWidth, adjustedChartHeight + extraBrushPadding]])
    .on("end", brushed);

chartGroup.append("g")
    .attr("class", "brush")
    .call(brush);


    const squares = chartGroup.selectAll(".set-square")
    .data(uniqueSets, d => d.name)  // key function improves performance
    .join(
        enter => enter.append("rect")
            .attr("class", "set-square set-rect")
            .attr("width", 8)
            .attr("height", 8)
            .attr("stroke", "black")
            .attr("fill", "#998066")
            .on("mouseover", function (event, d) {

                // Set content first so dimensions are accurate
                tooltip
                    .style("display", "block")
                    .html(`
                        <strong>${d.name}</strong><br>
                        ${d.releaseDate.toDateString()}<br>
                        Type: ${d.setType}<br>
                        Cards in Set: ${d.cardCount}
                    `);

                const { width: tooltipWidth, height: tooltipHeight } = tooltip.node().getBoundingClientRect();
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
                const updatedFilters = getClonedFilters();

            
                if (!updatedFilters["Set Names"]) {
                    updatedFilters["Set Names"] = new Set();
                }
            
                const isSelected = updatedFilters["Set Names"].has(d.name);
            
                if (isSelected) {
                    updatedFilters["Set Names"].delete(d.name);
                    d3.select(this).attr("fill", "#998066"); 
                } else {
                    updatedFilters["Set Names"].add(d.name);
                    d3.select(this).attr("fill", "#007bff"); 
                }
            
                updateState({
                    selectedFilters: updatedFilters,
                    updateContext: "TimelineFilter"
                });
            }),
        update => update, // leave unchanged
        exit => exit.remove()
    )
    .attr("x", d => xScale(d.releaseDate) - 2.5)
    .attr("y", d => yScale(d.setType) - 5);

                
        
        const selectedSetNames = getState().selectedFilters["Set Names"] || new Set();

        squares.attr("fill", d =>
            selectedSetNames.has(d.name) ? "#007bff" : "#998066"
        );
        
    
 
    chartGroup.selectAll(".set-type-label")
    .data(selectedSetTypes, d => d)  // key by type string
    .join(
        enter => enter.append("text")
            .attr("class", "set-type-label")
            .attr("x", -10)
            .attr("text-anchor", "end")
            .attr("font-size", "12px")
            .attr("fill", "black")
            .text(d => d)
            .on("click", function (event, type) {
                const updatedFilters = getClonedFilters();


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
                tooltip
                .style("display", "block")
                .html(`<strong>${type}</strong><br>${count} sets`);

                const { width: tooltipWidth, height: tooltipHeight } = tooltip.node().getBoundingClientRect();
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
            .on("mouseout", () => { d3.select("#tooltip").style("display", "none"); }),
        update => update,
        exit => exit.remove()
    )
    .attr("y", d => yScale(d) + 5);




    
    
    


function zoomed(event) {
    const transform = event.transform;

    let newXScale;
    if (transform.k === 1) {
        // Fully zoomed out — restore original domain
        newXScale = d3.scaleTime()
            .domain(xScale.domain())  // original domain
            .range(xScale.range());
    } else {
        // Apply zoom transform and clamp domain
        const rescaled = transform.rescaleX(xScale);
        const [minDate, maxDate] = xScale.domain();
        const [newStart, newEnd] = rescaled.domain();

        const clampedStart = d3.max([newStart, minDate]);
        const clampedEnd = d3.min([newEnd, maxDate]);

        if (clampedEnd < clampedStart) return;

        newXScale = d3.scaleTime()
            .domain([clampedStart, clampedEnd])
            .range(xScale.range());
    }

    fixedXAxis.select(".x-axis")
        .transition().duration(100)
        .call(xAxis.scale(newXScale));

    squares.transition().duration(100)
        .attr("x", d => newXScale(d.releaseDate) - 2.5)
        .style("opacity", d => {
            const date = d.releaseDate;
            const [start, end] = newXScale.domain();
            return (date >= start && date <= end) ? 1 : 0;
        });
}



function brushed(event) {
    if (!event.selection) return;

    const [[x0, y0], [x1, y1]] = event.selection;

    const selected = [];
        d3.selectAll(".set-rect").each(function (d) {
        const rect = d3.select(this);
        const x = +rect.attr("x");
        const y = +rect.attr("y");
        const width = +rect.attr("width");
        const height = +rect.attr("height");

        if (
            x + width >= x0 &&
            x <= x1 &&
            y + height >= y0 &&
            y <= y1
        ) {
            selected.push(d.name);
        }
    });


    const updatedFilters = getClonedFilters();


    if (!updatedFilters["Set Names"]) {
        updatedFilters["Set Names"] = new Set();
    }

    let changed = false;

    selected.forEach(name => {
        if (!updatedFilters["Set Names"].has(name)) {
            updatedFilters["Set Names"].add(name);
            changed = true;
        }
    });

    if (changed) {
        updateState({
            selectedFilters: updatedFilters,
            updateContext: "TimelineFilter"
        });

        updateSetRectOpacity();

        d3.selectAll(".set-rect")
            .attr("fill", d =>
                updatedFilters["Set Names"].has(d.name) ? "#007bff" : "#998066"
            );
    }

    d3.select(chartGroup.select(".brush").node()).call(brush.move, null); // Clear brush
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

export function highlightTimelineSetsHoverOnly(card) {
    if (!card?.all_sets) return;

    const hoveredSetNames = new Set(
        card.all_sets.map(set => set.name.toLowerCase())
    );

    d3.selectAll(".set-rect")
      .filter(d => hoveredSetNames.has(d.name.toLowerCase()))
      .classed("hover-temp", true);
}

export function clearTimelineHoverOnly() {
    d3.selectAll(".set-rect").classed("hover-temp", false);
}

