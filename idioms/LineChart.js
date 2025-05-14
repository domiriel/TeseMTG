
import { updateState, getState } from "../state.js";
export function createStackedLineChart(data, containerId, isUpdate = false) {
    d3.select(containerId).selectAll("*").remove();

    
    data = data.filter(card => card.name !== "Gleemax");

    const groupedData = d3.rollups(
        data,
        cards => {
            const reprints = cards.filter(c => c.originality === 'functional reprint').length;
            const avgComplexity = d3.mean(cards, c => +c.complexity || 0);
            const avgCMC = d3.mean(cards, c => +c.cmc || 0);
            

            if (cards[0] && new Date(cards[0].release_date).getFullYear() === 2004) {
                cards.forEach(c => {
                    const raw = c.cmc;
                    const numeric = +raw;
                    if (isNaN(numeric) || numeric > 100) {
                        console.warn("Suspicious CMC in 2004:", {
                            name: c.name,
                            cmc: c.cmc,
                            set: c.set_name
                        });
                    }
                });
            }
            return {
                
                reprints,
                avgComplexity,
                avgCMC
            };
        },
        d => new Date(d.release_date).getFullYear()
    )
    .map(([year, values]) => {
        /*console.log(`Year: ${year}`);
        console.log(`  Reprints: ${values.reprints}`);
        console.log(`  Avg Complexity: ${values.avgComplexity?.toFixed(2)}`);
        console.log(`  Avg CMC: ${values.avgCMC?.toFixed(2)}`);*/
        return {
            year: new Date(year, 0, 1),
            ...values
        };
    })
    .sort((a, b) => a.year - b.year);
    
    



    const metrics = [
        { key: "reprints", label: "Func. Reprints", color: "#c3c3c3" },
        { key: "avgComplexity", label: "Avg. Complexity", color: "#c3c3c3" },
        { key: "avgCMC", label: "Avg. MV", color: "#c3c3c3" }
    ];
    
    const container = d3.select(containerId);

    const containerBounds = container.node().getBoundingClientRect();
    const containerWidth = containerBounds.width;
    const containerHeight = containerBounds.height;

    const margin = { top: 20, right: 50, bottom: 30, left: 60 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = containerHeight*0.9 / 4; 
    const chartSpacing = 10;
    const height = (chartHeight + chartSpacing) * metrics.length - chartSpacing; 


    if (isUpdate) {
        container.select(".stacked-line-wrapper").remove();
    }
const tooltip = d3.select("#tooltip");

    const wrapper = container.append("div")
        .attr("class", "stacked-line-wrapper")
        .style("position", "relative")
        .style("width", `${containerWidth}px`);

    const svg = wrapper.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

        const xExtent = d3.extent(groupedData, d => d.year);

        
        const xPadding = (xExtent[1] - xExtent[0]) / 50;
        
        const xScale = d3.scaleTime()
            .domain([new Date(xExtent[0].getTime()), new Date(xExtent[1].getTime())])
            .range([10, width]);
        

    const allYears = groupedData.map(d => d.year);

    const xAxis = d3.axisBottom(xScale)
            .tickValues(allYears)
            .tickFormat(d3.timeFormat("%Y"));
        

    

   

metrics.forEach((metric, i) => {
    const y = d3.scaleLinear()
    .domain([
        0,
        d3.max(groupedData, d => d[metric.key])
    ])
    .nice()
    .range([chartHeight, 0]);


    const line = d3.line()
        .x(d => xScale(d.year))
        .y(d => y(d[metric.key]));

    const g = chartGroup.append("g")
        .attr("transform", `translate(0, ${i * (chartHeight + chartSpacing)})`);


       
        g.append("path")
            .datum(groupedData)
            .attr("fill", "none")
            .attr("stroke", metric.color)
            .attr("stroke-width", 2)
            .attr("d", line);

        




g.selectAll("circle")
    .data(groupedData)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.year))
    .attr("cy", d => y(d[metric.key]))
    .attr("r", 4)
    .attr("fill", metric.color)
    .attr("data-year", d => d.year.getFullYear()) 
    .style("cursor", "pointer")
    .attr("class", "data-point") 
    .on("mouseover", (event, d) => {
        const year = d.year.getFullYear();

        const allMetrics = metrics.map(m => {
            const value = d[m.key];
            const formatted = m.key === "reprints"
                ? Math.round(value)            // no decimals for reprints
                : (value?.toFixed(2) ?? "N/A");
            return `<strong>${m.label}:</strong> ${formatted}`;
        }).join("<br/>");
        

    tooltip
        .style("display", "block")
        .style("font-size", "16px")
        .html(`
            <strong>Year:</strong> ${year}<br/>
            ${allMetrics}
        `);

        
        d3.selectAll(`circle.data-point[data-year='${d.year.getFullYear()}']`)
            
            .attr("stroke", "#000")
            .attr("stroke-width", 1.5);
    })
    .on("mousemove", (event) => {
        const tooltipNode = tooltip.node();
        const tooltipWidth = tooltipNode.offsetWidth;
        const pageX = event.pageX;
        const pageY = event.pageY;
        const padding = 10;
    
        let left = pageX + padding;
    
        if (left + tooltipWidth > window.innerWidth) {
            left = pageX - tooltipWidth - padding;
        }
    
        tooltip
            .style("left", left + "px")
            .style("top", (pageY - 20) + "px");
    }) 
    .on("mouseout", () => {
        tooltip.style("display", "none");
        tooltip.style("font-size", "12px");

       
        d3.selectAll("circle.data-point")
            .attr("r", 4)
            .attr("stroke", "none");
    })
   .on("click", function(event, d) {
    const selectedYear = d.year.getFullYear().toString();

    const currentState = getState();
    const updatedFilters = {};

    // Copy the current filter state
    for (const key in currentState.selectedFilters) {
        updatedFilters[key] = new Set(currentState.selectedFilters[key]);
    }

    // Toggle year selection
    if (updatedFilters["Year"].has(selectedYear)) {
        updatedFilters["Year"].delete(selectedYear);
    } else {
        updatedFilters["Year"].add(selectedYear);
    }

    // Update all dot opacities based on selected years
    const selectedYears = updatedFilters["Year"];
    d3.selectAll("circle.data-point")
        .attr("opacity", function() {
            const year = this.getAttribute("data-year");
            return selectedYears.size === 0 || selectedYears.has(year) ? 1 : 0.5;
        });

    updateState({
        selectedFilters: updatedFilters,
        updateContext: "TimelineFilter"
    });
});

    
    
    ;



        
        g.append("g").call(d3.axisLeft(y).ticks(4));

       
        g.append("text")
    .attr("x", 5)
    .attr("y",8)
    .attr("text-anchor", "left")
    .text(metric.label)
    .attr("fill", "#000")
    .attr("font-size", "11px")
    .style("font-weight", "bold");

       
        
    
            const xAxisG = g.append("g")
    .attr("transform", `translate(0, ${chartHeight})`)
    .call(xAxis);

xAxisG.selectAll("text")
.text(function(d) {
    return d.getFullYear() % 2 === 1 ? d3.timeFormat("%Y")(d) : "";  
})
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .attr("font-size", "10px");


if (i !== metrics.length - 1) {
    xAxisG.selectAll("text").remove();
    xAxisG.selectAll("line").attr("stroke-opacity", 0.3); 
}

        
    });
}
