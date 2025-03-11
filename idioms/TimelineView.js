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

    // Convert Map to an array and sort by **full release date**
    let uniqueSets = Array.from(setMap.values()).sort((a, b) => a.releaseDate - b.releaseDate);

    // Identify unique set types and filter only 5
    let allSetTypes = Array.from(new Set(uniqueSets.map(set => set.setType))).sort();
    
    let selectedSetTypes = allSetTypes.slice(0, 5); // **Choose the first 5 for now (modify as needed)**

    // Filter uniqueSets to include only those from selected set types
    uniqueSets = uniqueSets.filter(set => selectedSetTypes.includes(set.setType));

    /*** STEP 2: GET CONTAINER SIZE ***/
    const container = d3.select(containerId);
    const containerBounds = container.node().getBoundingClientRect();

    const containerWidth = containerBounds.width;
    const containerHeight = containerBounds.height;

    const chartWidth = containerWidth * 0.9;
    const chartHeight = containerHeight * 0.9; 

    const margin = { 
        top: 60,  
        right: 50, 
        bottom: 30, 
        left: 100 
    };

    // Handle updates
    if (isUpdate) {
        d3.select(containerId).select("svg").remove();
    }

    /*** STEP 3: CREATE SVG ***/
    const svg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight + margin.top + margin.bottom)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    /*** STEP 4: DEFINE SCALES ***/
    let xScale = d3.scaleTime()
        .domain([d3.min(uniqueSets, d => d.releaseDate), d3.max(uniqueSets, d => d.releaseDate)])
        .range([0, chartWidth]);

    let yScale = d3.scaleBand()
        .domain(selectedSetTypes)  // **Use the selected 5 set types**
        .range([-15, chartHeight + 40])
        .padding(0.9);
        

    /*** STEP 5: DRAW YEAR AXIS (X-AXIS) ON TOP ***/
    const xAxis = d3.axisTop(xScale)
        .ticks(d3.timeYear.every(1))
        .tickFormat(d3.timeFormat("%Y"));

    chartGroup.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, -20)`)
        .call(xAxis)
        .selectAll("text")
        .style("text-anchor", "middle");

    /*** STEP 6: DRAW TIMELINE LINES ***/
    selectedSetTypes.forEach(setType => {
        chartGroup.append("line")
            .attr("x1", 0)
            .attr("y1", yScale(setType))
            .attr("x2", chartWidth)
            .attr("y2", yScale(setType))
            .attr("stroke", "black")
            .attr("stroke-width", 2);
    });

    /*** STEP 7: DRAW SET SQUARES ***/
    chartGroup.selectAll(".set-square")
        .data(uniqueSets)
        .enter()
        .append("rect")
        .attr("class", "set-square")
        .attr("x", d => xScale(d.releaseDate) - 2.5)
        .attr("y", d => yScale(d.setType) - 5)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#4285F4") 
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

    /*** STEP 8: ADD LEGENDS (Set Type Labels) ***/
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

    /*** STEP 9: INTERACTIVITY - CLICK TO ZOOM ***/
    function clicked(selectedSet) {
        // Define zoomed domain around the selected set's year
        const selectedYear = selectedSet.releaseDate.getFullYear();
        const zoomStart = new Date(selectedYear, 0, 1);
        const zoomEnd = new Date(selectedYear + 1, 11, 31); // Show two years
    
        // Update the xScale domain
        xScale.domain([zoomStart, zoomEnd]);
    
        // Adjust x-axis ticks to **always show two years**
        xAxis.ticks(d3.timeYear.every(1)); // Ensure yearly ticks still appear
    
        const t = chartGroup.transition().duration(750);
    
        // Filter only squares within the zoomed interval
        chartGroup.selectAll(".set-square")
            .transition(t)
            .style("opacity", d => (d.releaseDate >= zoomStart && d.releaseDate <= zoomEnd) ? 1 : 0) // Hide out-of-range squares
            .attr("x", d => xScale(d.releaseDate) - 2.5);
    
        // Update the x-axis
        chartGroup.select(".x-axis")
            .transition(t)
            .call(xAxis.scale(xScale));
    }
    
    
    /*** STEP 10: RESET ZOOM ON DOUBLE CLICK ***/
    svg.on("dblclick", () => {
        xScale.domain([d3.min(uniqueSets, d => d.releaseDate), d3.max(uniqueSets, d => d.releaseDate)]);

        const t = chartGroup.transition().duration(750);

        chartGroup.selectAll(".set-square")
            .transition(t)
            .attr("x", d => xScale(d.releaseDate) - 2.5);

        chartGroup.select(".x-axis")
            .transition(t)
            .call(xAxis.scale(xScale));
    });
}
