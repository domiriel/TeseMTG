
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

  
    let allSetTypes = Array.from(new Set(uniqueSets.map(set => set.setType))).sort();
    let selectedSetTypes = allSetTypes.slice(0, 50); 


    uniqueSets = uniqueSets.filter(set => selectedSetTypes.includes(set.setType));

    
    const container = d3.select(containerId);
    const containerBounds = container.node().getBoundingClientRect();

    const containerWidth = containerBounds.width * 0.98;
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
                    d3.select(this)
                        .style("fill", "black")
                        .style("font-weight", "normal");
                } else {
                    updatedFilters["Year"].add(year);
                    d3.select(this)
                        .style("fill", "#007bff")
                        .style("font-weight", "bold");
                }
        
                updateState({
                    selectedFilters: updatedFilters,
                    updateContext: "TimelineFilter"
                });
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

 
    const squares = chartGroup.selectAll(".set-square")
        .data(uniqueSets)
        .enter()
        .append("rect")
        .attr("class", "set-square")
        .attr("x", d => xScale(d.releaseDate) - 2.5)
        .attr("y", d => yScale(d.setType) - 5)
        .attr("width", 8)
        .attr("height", 8)
        .attr("fill", "#C3C3C3")
        .attr("stroke", "black")
        .on("mouseover", function (event, d) {
            const tooltip = d3.select("#tooltip");
            const tooltipWidth = 200; 
            const tooltipHeight = 50; 
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let left = event.pageX + 10; 
            let top = event.pageY - 10;

// If tooltip would go below the viewport, move it above the cursor
if (top + tooltipHeight > viewportHeight) {
    top = event.pageY - tooltipHeight - 10;
}

// Prevent it from going above the screen
if (top < 0) {
    top = 10;
}


            
            if (top + tooltipHeight > viewportHeight) {
                top = event.pageY - tooltipHeight - 10;
            }

            tooltip
                .style("display", "block")
                .style("left", `${left}px`)
                .style("top", `${top}px`)
                .html(`
                    <strong>${d.name}</strong><br>
                    ${d.releaseDate.toDateString()}<br>
                    Type: ${d.setType}<br>
                    Cards in Set: ${d.cardCount}
                `);
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
        .text(d => d);


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
