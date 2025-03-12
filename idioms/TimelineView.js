function createTimelineView(data, containerId, isUpdate = false) {
    /*** STEP 1: EXTRACT UNIQUE SETS ***/
    let setMap = new Map();

    data.forEach(card => {
        let setName = card.set_name;
        if (!setMap.has(setName)) {
            setMap.set(setName, {
                name: setName,
                releaseDate: new Date(card.release_date),
                setType: card.set_type
            });
        }
    });

 
    let uniqueSets = Array.from(setMap.values()).sort((a, b) => a.releaseDate - b.releaseDate);

  
    let allSetTypes = Array.from(new Set(uniqueSets.map(set => set.setType))).sort();
    let selectedSetTypes = allSetTypes.slice(0, 50); 


    uniqueSets = uniqueSets.filter(set => selectedSetTypes.includes(set.setType));

    
    const container = d3.select(containerId);
    const containerBounds = container.node().getBoundingClientRect();

    const containerWidth = containerBounds.width;
    const containerHeight = containerBounds.height;

    const chartWidth = containerWidth * 0.9;
    const chartHeight = containerHeight;

    const margin = { 
        top: 50, 
        right: 50, 
        bottom: 30, 
        left: 120 
    };

    // Handle updates
    if (isUpdate) {
        d3.select(containerId).select(".chart-wrapper").remove();
    }

    /*** STEP 3: CREATE A WRAPPER FOR SCROLLABLE CHART & FIXED AXIS ***/
    const wrapper = container.append("div")
        .attr("class", "chart-wrapper")
        .style("position", "relative")
        .style("width", `${containerWidth}px`);

    /*** STEP 4: CREATE FIXED YEAR AXIS ***/
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
        .style("height", `${containerHeight}px`) 
        .style("overflow-y", "scroll") 
        .style("overflow-x", "hidden") 
        .style("border", "1px solid #ccc");

    
    const svg = scrollContainer.append("svg")
        .attr("width", containerWidth)
        .attr("height", chartHeight + margin.top + margin.bottom + 70);

    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);


    let yScale = d3.scaleBand()
        .domain(selectedSetTypes)
        .range([-40, chartHeight + 100]) 
        .padding(0.5);

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
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#C3C3C3")
        .attr("stroke", "black")
        .on("mouseover", function (event, d) {
            d3.select("#tooltip")
                .style("display", "block")
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY - 10}px`)
                .html(`<strong>${d.name}</strong><br>${d.releaseDate.toDateString()}<br>Type: ${d.setType}`);
        })
        .on("mouseout", function () {
            d3.select("#tooltip").style("display", "none");
        })
        .on("click", (event, d) => clicked(d));
    
 
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

    
    
    


    svg.on("dblclick", () => {
        xScale.domain([d3.min(uniqueSets, d => d.releaseDate), d3.max(uniqueSets, d => d.releaseDate)]);

        const t = d3.transition().duration(750);

        fixedXAxis.transition(t).select("g.x-axis")
        .call(xAxis.scale(xScale));

        squares.transition(t)
            .style("opacity", 1)
            .attr("x", d => xScale(d.releaseDate) - 2.5);

        
    });
}
