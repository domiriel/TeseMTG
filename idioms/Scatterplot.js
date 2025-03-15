function createScatterPlot(data, containerId, isUpdate = false) {
    // Ensure unique cards by name, prioritizing price_usd > 0
    const uniqueCards = new Map();
    data.forEach(card => {
        if (!isNaN(card.price_usd) && !isNaN(card.complexity)) {
            if (!uniqueCards.has(card.name) || (card.price_usd > 0 && uniqueCards.get(card.name).price_usd === 0)) {
                uniqueCards.set(card.name, card);
            }
        }
    });
    const filteredData = Array.from(uniqueCards.values());

    // Sample data for performance
    const sampledData = filteredData.length > 1000 ? d3.shuffle(filteredData).slice(0, 1000) : filteredData;
    console.log(`Scatterplot data size: ${sampledData.length}`);

    // Define chart dimensions
    const container = d3.select(containerId).node();
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Remove existing SVG if updating
    if (isUpdate) {
        d3.select(containerId).select("svg").remove();
    }

    // Create SVG container
    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Define scales
    const xScale = d3.scaleLog()
        .domain([
            Math.max(0, d3.min(sampledData, d => d.price_usd || 0.01)), // Ensure min is at least 0.01
            d3.max(sampledData, d => d.price_usd)
        ])
        .range([0, chartWidth]);

    const yScale = d3.scaleLinear()
        .domain([d3.min(sampledData, d => d.complexity), d3.max(sampledData, d => d.complexity)])
        .range([chartHeight, 0]);

    // Define color scale based on EDH rank
    const edhRanks = sampledData.map(d => d.edh_rank).filter(r => r !== null);
    const colorScale = d3.scaleSequential(d3.interpolateCool)
        .domain([d3.min(edhRanks), d3.max(edhRanks)]);

    // Create axes
    const xAxis = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(xScale).ticks(10, ",.2f"));

    const yAxis = svg.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale));

    // **🔹 Add X-Axis Label**
    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + margin.bottom - 10) // Position below axis
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Price (USD)");

    // **🔹 Add Y-Axis Label**
    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("x", -chartHeight / 2) // Center along Y-axis
        .attr("y", -50) // Position left of the Y-axis
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Complexity");

    // 🔹 Add zoomable background (transparent)
    const zoomArea = svg.append("rect")
        .attr("width", chartWidth)
        .attr("height", chartHeight)
        .attr("fill", "transparent") // Invisible but captures zoom events
        .attr("pointer-events", "all"); // Ensures all interactions work

    // Create scatter plot group
    const gDot = svg.append("g").attr("class", "dots");

    // Append circles
    const circles = gDot.selectAll("circle")
        .data(sampledData)
        .join("circle")
        .attr("cx", d => xScale(d.price_usd))
        .attr("cy", d => yScale(d.complexity))
        .attr("r", 3)  // Adjust point size
        .attr("fill", d => colorScale(d.edh_rank || d3.max(edhRanks))) // Default color if no EDH rank
        .attr("opacity", 0.8);

    // Tooltip setup
    if (!d3.select("#scatter-tooltip").node()) {
        d3.select("body")
            .append("div")
            .attr("id", "scatter-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.7)")
            .style("color", "white")
            .style("padding", "5px")
            .style("border-radius", "3px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("display", "none");
    }
    const tooltip = d3.select("#scatter-tooltip");

    // Tooltip events
    circles.on("mouseover", function (event, d) {
        tooltip.style("display", "block")
            .html(`
                <strong>${d.name}</strong><br>
                Complexity: ${d.complexity}<br>
                EDH Rank: ${d.edh_rank || "N/A"}<br>
                Price: $${d.price_usd}
            `);
    })
    .on("mousemove", function (event) {
        tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", function () {
        tooltip.style("display", "none");
    });

    // Zoom functionality
    const zoom = d3.zoom()
        .scaleExtent([0.5, 32]) // Allow zooming from 50% to 32x
        .on("zoom", zoomed);

    // 🔹 Apply zoom to the invisible background, not just the SVG
    zoomArea.call(zoom);

    function zoomed(event) {
        const transform = event.transform;
        const newX = transform.rescaleX(xScale);
        const newY = transform.rescaleY(yScale);

        // Update scatter points (Apply transform on cx, cy)
        circles.attr("cx", d => newX(d.price_usd))
               .attr("cy", d => newY(d.complexity))
               .attr("r", 3 * transform.k); // Adjust size dynamically

        // Update axes
        xAxis.call(d3.axisBottom(newX));
        yAxis.call(d3.axisLeft(newY));
    }

    // Reset zoom function
    function resetZoom() {
        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity);
    }

    // Attach reset function to a button
    d3.select("#reset-button").on("click", resetZoom);
}
