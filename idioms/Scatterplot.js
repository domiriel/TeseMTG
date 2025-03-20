const colorGroups = [
    { range: [1, 5691], color: "#efefef" },  // Most popular (lower rank)
    { range: [5692, 11382], color: "#dadada" },
    { range: [11383, 17074], color: "#c3c3c3" },
    { range: [17075, 22765], color: "#a9a9a9" },
    { range: [0, Infinity], color: "#787878" }  // Least popular (higher rank)
];


// Function to determine color based on `edhrec_rank`
function getGroupColor(rank) {
    for (let group of colorGroups) {
        if (rank >= group.range[0] && rank <= group.range[1]) {
            return group.color;
        }
    }
    return colorGroups[colorGroups.length - 1].color; // Default to last color if out of range
}



function createScatterPlot(data, containerId, isUpdate = false) {
    // Ensure unique cards by name, prioritizing price_usd > 0
    const excludedSetTypes = new Set(["promo", "funny", "memorabilia", "alchemy", "token", "minigame"]); // Add the set types to exclude
    const excludedSetNames = ["Arena", "Alchemy", "Digital"]; // Add keywords to exclude certain sets
    data = data.filter(card => 
        !excludedSetTypes.has(card.set_type) && 
        !excludedSetNames.some(keyword => card.set_name && card.set_name.includes(keyword)) &&
        !card.digital
    );

    const cardMap = new Map();

    data.forEach(card => {
        let price = isNaN(card.price_usd) || card.price_usd === null ? 0 : card.price_usd; // Treat null as 0
        
        if (!isNaN(card.complexity)) {
            if (!cardMap.has(card.name)) {
                cardMap.set(card.name, {
                    ...card, 
                    prices: [],  // Store all price values
                    avg_price: 0 // Initialize average price
                });
            }
            cardMap.get(card.name).prices.push(price);
        }
        if (card.name === "Zenkidar") {
            console.log(`Price Type`, typeof(cardMap.get(card.name).prices[0]));
            console.log(`Card Info Before Calcs:`, cardMap.get(card.name));
        }
    });

    // Compute average price for each card
    cardMap.forEach(card => {
        if (card.prices.length > 0) {
            const total = card.prices.reduce((sum, p) => sum + p, 0);
            card.avg_price = total / card.prices.length;
        } else {
            card.avg_price = 0; // Ensure avg_price is never NaN
        }
        if (card.name === "Willow Elf") {
            console.log(`Card Info After Calcs:`, cardMap.get(card.name));
        }
    });

    const filteredData = Array.from(cardMap.values());

    // Sample data for performance
    const sampledData = filteredData.length > 1000 ? d3.shuffle(filteredData).slice(0, 7000) : filteredData;
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
        Math.max(0, d3.min(sampledData, d => d.avg_price || 0.01)), // Ensure min is at least 0.01
        d3.max(sampledData, d => d.avg_price)
    ])
    .range([0.01, chartWidth]);

    const yScale = d3.scaleLinear()
        .domain([d3.min(sampledData, d => d.complexity), d3.max(sampledData, d => d.complexity)])
        .range([chartHeight, 0]);

    // Define color scale based on EDH rank
    const edhRanks = sampledData.map(d => d.edhrec_rank).filter(r => r !== null);
    const colorScale = d3.scaleSequential(d3.interpolateCool)
        .domain([d3.min(edhRanks), d3.max(edhRanks)]);

    const formatPrice = d3.format("$,.2f");
    
    // Create axes
    // Create axes with custom tick formatter
    const xAxis = svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(xScale).tickFormat(formatPrice)  // Reduce the number of tick marks  // Format large numbers like 10k, 100k
    
    );

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


        svg.append("defs").append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("width", chartWidth)
        .attr("height", chartHeight);
    // 🔹 Add zoomable background (transparent)
    const zoomArea = svg.append("rect")
        .attr("width", chartWidth)
        .attr("height", chartHeight)
        .attr("fill", "transparent") // Invisible but captures zoom events
        .attr("pointer-events", "all"); // Ensures all interactions work

    
    const gDot = svg.append("g").attr("class", "dots").attr("clip-path", "url(#clip)");

    
    const circles = gDot.selectAll("circle")
        .data(sampledData)
        .join("circle")
        .attr("cx", d => xScale(d.avg_price))
        .attr("cy", d => yScale(d.complexity))
        .attr("r", 1)  // Adjust point size
        .attr("fill", d => getGroupColor(d.edhrec_rank || 0)) // Default color if no EDH rank
        .attr("opacity", 0.8)
        .on("mouseover", function (event, d) {
            tooltip.style("display", "block")
                .html(`
                    <strong>${d.name}</strong><br>
                    Complexity: ${d.complexity}<br>
                    EDH Rank: ${d.edhrec_rank || "N/A"}<br>
                    Avg Price: $${d.avg_price.toFixed(2)}<br>
                `);
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function () {
            tooltip.style("display", "none");
        });
    ;

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
        circles.attr("cx", d => newX(d.avg_price))
               .attr("cy", d => newY(d.complexity))
               .attr("r", 3 * transform.k/3); // Adjust size dynamically

        // Update axes
        xAxis.call(d3.axisBottom(newX).tickFormat(formatPrice));
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
