//Issues fixed: 3, 9

function createTimelineView(data, containerId, isUpdate = false) {
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

    const chartWidth = containerWidth * 0.90;
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
        .call(xAxis)
        .selectAll("text")
        .style("text-anchor", "middle");


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
        .scaleExtent([1, 10]) // limit the zoom levels
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

    
    if (left + tooltipWidth > viewportWidth) {
        left = event.pageX - tooltipWidth - 10;
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

    console.log("X-axis and squares updated");
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
