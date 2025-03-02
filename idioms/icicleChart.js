// Define color intervals
const colorScaleGray = [
    { range: [0, 20], color: "#efefef" },
    { range: [21, 40], color: "#dadada" },
    { range: [41, 60], color: "#C3C3C3" },
    { range: [61, 80], color: "#a9a9a9" },
    { range: [81, 100], color: "#787878" }
];

const colorScale = [
    { range: [0, 20], color: "#e0e3ff" },
    { range: [21, 40], color: "#bbc3f9" },
    { range: [41, 60], color: "#93a5f3" },
    { range: [61, 80], color: "#6587ec" },
    { range: [81, 100], color: "#0C6AE4"}
];

// Function to get color based on percentage
function getColorFromPercentage(percentage) {
    for (let i = colorScale.length - 1; i >= 0; i--) { // Iterate from highest to lowest
        if (percentage >= colorScale[i].range[0]) {
            return colorScale[i].color;
        }
    }
    return colorScale[0].color; // Default to lowest range if percentage is < 0
}

// Function to convert hex to RGB
function hexToRgb(hex) {
    let bigint = parseInt(hex.slice(1), 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}

// Function to convert RGB to hex
function rgbToHex(r, g, b) {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}
function createIcicleChart(data, containerId, isUpdate = false) {
    // Step 1: Aggregate Data (Tracking original, reprints, and functional reprints)
    let groupedData = [];

    data.forEach(card => {
        const colors = Array.isArray(card.color_identity) ? card.color_identity : [];
        let numColors = colors.length;

        // Merge 4-color and 5-color into a single category
        if (numColors >= 4) numColors = 4; // Group 4 and 5 colors together

        let colorKey = colors.sort().join("-") || "";  
        let colorGroupName = numColors === 0 ? "Colorless" : numColors === 4 ? "+4 Colors" : `${numColors} Colors`;

        let colorGroup = groupedData.find(c => c.name === colorGroupName);
        if (!colorGroup) {
            groupedData.push({
                name: colorGroupName,
                numColors,
                originalCount: 0,
                reprintCount: 0,
                functionalReprintCount: 0,
                children: []
            });
        }
    
        let targetGroup = groupedData.find(c => c.name === colorGroupName);
        let colorEntry = targetGroup.children.find(c => c.name === colorKey);
    
        if (colorEntry) {
            colorEntry.value += 1;
            if (card.originality === "original") colorEntry.originalCount += 1;
            if (card.originality === "reprint") colorEntry.reprintCount += 1;
            if (card.originality === "functional reprint") colorEntry.functionalReprintCount += 1;
        } else {
            targetGroup.children.push({ 
                name: colorKey, 
                value: 1, 
                originalCount: card.originality === "original" ? 1 : 0,
                reprintCount: card.originality === "reprint" ? 1 : 0,
                functionalReprintCount: card.originality === "functional reprint" ? 1 : 0
            });
        }
    });

    // Step 2: Sum up originality counts from children to parent nodes
    groupedData.forEach(group => {
        group.originalCount = group.children.reduce((sum, c) => sum + (c.originalCount || 0), 0);
        group.reprintCount = group.children.reduce((sum, c) => sum + (c.reprintCount || 0), 0);
        group.functionalReprintCount = group.children.reduce((sum, c) => sum + (c.functionalReprintCount || 0), 0);

        // Calculate percentage of original cards for each color identity
        group.children.forEach(c => {
            let originalPercentage = (c.originalCount / c.value) * 100 || 0;
            c.color = getColorFromPercentage(originalPercentage);
        });

        // Calculate average color for parent nodes
        if (group.children.length > 0) {
            let avgRGB = group.children.reduce((acc, c) => {
                let rgb = hexToRgb(c.color);
                acc.r += rgb.r;
                acc.g += rgb.g;
                acc.b += rgb.b;
                return acc;
            }, { r: 0, g: 0, b: 0 });

            let numChildren = group.children.length;
            group.color = rgbToHex(
                Math.round(avgRGB.r / numChildren),
                Math.round(avgRGB.g / numChildren),
                Math.round(avgRGB.b / numChildren)
            );
        } else {
            group.color = "#efefef"; // Default color if no children exist
        }
    });

    // **Step 3: Sort the bars correctly**
    groupedData.sort((a, b) => a.numColors - b.numColors); // Ensure order: Colorless → 1 → 2 → 3 → 4-5
    groupedData.forEach(group => group.children.sort((a, b) => a.name.localeCompare(b.name))); // Sort `color_identity`

    // Compute hierarchical structure
    const hierarchy = { children: groupedData };

    // Step 4: Define chart dimensions
    const margin = { top: 20, right: 20, bottom: 20, left: 70 };
    const chartWidth = 1000;
    const chartHeight = 500;
    const legendWidth = 150;
    const svgWidth = chartWidth + legendWidth;
    const svgHeight = chartHeight;
    const innerWidth = chartWidth - margin.left - margin.right;
    const innerHeight = chartHeight - margin.top - margin.bottom;


    // Step 5: Handle updates
    if (isUpdate) {
        d3.select(containerId).select("svg").remove(); // Clear previous chart
    }

    // Step 6: Create SVG container
    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", svgWidth)
        .attr("height", svgHeight);

    // Create a group for the chart (adjust margin as needed)
    const chartGroup = svg.append("g")
    .attr("class", "chart")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // Create a clip path for the chart area
    chartGroup.append("clipPath")
    .attr("id", "chartClip")
    .append("rect")
    .attr("width", innerWidth)
    .attr("height", innerHeight);

// Create a zoomGroup that is clipped to the chart area
    const zoomGroup = chartGroup.append("g")
    .attr("clip-path", "url(#chartClip)");

    // Step 7: Create a hierarchical root node
    const root = d3.hierarchy(hierarchy)
        .sum(d => d.value)
        .sort((a, b) => a.data.numColors - b.data.numColors);

    // Step 8: Define partition layout
    const partition = d3.partition().size([innerWidth, innerHeight]);
    partition(root);

    // Step 9: Define scales for zooming
    let xScale = d3.scaleLinear().domain([0, innerWidth]).range([0, innerWidth]);
    let yScale = d3.scaleLinear().domain([0, innerHeight]).range([0, innerHeight]);

    let focus = root; // Track current focus node

   

    // **Step 11: Tooltip Setup**
    if (!d3.select("#tooltip").node()) {
        d3.select("body").append("div")
            .attr("id", "tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.7)")
            .style("color", "white")
            .style("padding", "5px")
            .style("border-radius", "3px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("display", "none");
    }
    const tooltip = d3.select("#tooltip");

    // Step 12: Draw rectangles
    const rects = zoomGroup.selectAll("rect")
        .data(root.descendants().slice(1)) // Skip root node
        .enter()
        .append("rect")
        .attr("x", d => xScale(d.x0))
        .attr("y", d => yScale(d.y0))
        .attr("width", d => xScale(d.x1) - xScale(d.x0))
        .attr("height", d => yScale(d.y1) - yScale(d.y0))
        .attr("fill", d => d.data.color) // Use calculated color
        .style("stroke", "#fff")
        .style("cursor", "pointer")
        .on("click", clicked)
        .on("mouseover", function(event, d) {
            tooltip
                .style("display", "block")
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px")
                .html(`
                    <strong>${d.data.name}</strong><br>
                    Total: ${d.value} cards<br>
                    Original: ${d.data.originalCount || 0} cards (${((d.data.originalCount / d.value) * 100).toFixed(2)}%)<br>
                    Reprint: ${d.data.reprintCount || 0} cards<br>
                    Functional Reprint: ${d.data.functionalReprintCount || 0} cards
                `);
        })
        .on("mouseout", function() {
            tooltip.style("display", "none");
        });

        

// Initialize Fisheye Effect
/*const fisheye = d3.fisheye.circular()
    .radius(50)  // Smaller magnifying glass
    .distortion(3); // Controls zoom intensity

// Create a circular lens (magnifying glass)
const lens = svg.append("circle")
    .attr("r", 50)  // Match radius with fisheye
    .attr("fill", "none")
    .attr("stroke", "black") // Lens outline
    .attr("stroke-width", 2)
    .style("pointer-events", "none")  // Ignore mouse interactions
    .style("display", "none"); // Hidden initially

// Mouseover: Show the lens when hovering over the Icicle Chart
zoomGroup.on("mouseover", function () {
    lens.style("display", "block"); // Show the magnifying glass
});

// Mouseout: Hide the lens when leaving the Icicle Chart
zoomGroup.on("mouseout", function () {
    lens.style("display", "none"); // Hide the magnifying glass
    rects.transition().duration(200)
        .attr("x", d => xScale(d.x0))
        .attr("y", d => yScale(d.y0))
        .attr("width", d => xScale(d.x1) - xScale(d.x0))
        .attr("height", d => yScale(d.y1) - yScale(d.y0)); // Reset rectangles
});

// Apply Fisheye Effect on Mouse Move
zoomGroup.on("mousemove", function (event) {
    const [mx, my] = d3.pointer(event);

    // Update fisheye focus based on mouse position
    fisheye.focus([mx, my]);

    // Move the magnifying glass to follow the cursor
    lens.attr("cx", mx).attr("cy", my);

    rects.each(function (d) {
        let originalX = xScale(d.x0);
        let originalY = yScale(d.y0);
        let originalWidth = xScale(d.x1) - xScale(d.x0);
        let originalHeight = yScale(d.y1) - yScale(d.y0);

        // Apply fisheye transformation only if inside the lens
        let distance = Math.sqrt((mx - originalX) ** 2 + (my - originalY) ** 2);
        if (distance < 50) { // Only apply effect inside the lens
            let distorted = fisheye({ x: originalX, y: originalY });

            d3.select(this)
                .transition().duration(50) // Smooth effect
                .attr("x", distorted.x)
                .attr("y", distorted.y)
                .attr("width", originalWidth * fisheye.distortion())
                .attr("height", originalHeight); // Keep height unchanged
        } else {
            // Reset to original size if outside lens
            d3.select(this)
                .transition().duration(100)
                .attr("x", originalX)
                .attr("y", originalY)
                .attr("width", originalWidth)
                .attr("height", originalHeight);
        }
    });
});*/


  

     /// Step 12: Add text labels
    const labels = zoomGroup.selectAll("text")
        .data(root.descendants().slice(1)) // Skip root node
        .enter()
        .append("text")
        .attr("x", d => (xScale(d.x0) + xScale(d.x1)) / 2)
        .attr("y", d => (yScale(d.y0) + yScale(d.y1)) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "15px")
        .text(d => d.data.name)
        .style("opacity", d => (xScale(d.x1) - xScale(d.x0)) > 50 ? 1 : 0);

    // Step 13: Click function for semantic zoom
    function clicked(event, p) {
        if (focus === p) {
            focus = root; // Reset to original view
        } else {
            focus = p;
        }
    
        // Update xScale only
        xScale.domain([focus.x0, focus.x1]);
        yScale.domain([0, innerHeight]); // Keep Y scale unchanged
    
        const t = zoomGroup.transition().duration(750);
    
        rects.transition(t)
            .attr("x", d => xScale(d.x0))
            .attr("y", d => yScale(d.y0)) // Keeps Y unchanged
            .attr("width", d => xScale(d.x1) - xScale(d.x0))
            .attr("height", d => yScale(d.y1) - yScale(d.y0));
    
        labels.transition(t)
            .attr("x", d => (xScale(d.x0) + xScale(d.x1)) / 2)
            .attr("y", d => (yScale(d.y0) + yScale(d.y1)) / 2)
            .style("opacity", d => (xScale(d.x1) - xScale(d.x0)) > 50 ? 1 : 0);
    }
    

    // ... your existing code and the clicked function

    // Calculate legend position relative to the chart area:
const legendX = margin.left - 30 ; // 10px padding from the chart
const legendY = margin.top + 155; // you can adjust this as needed

// Append a group element for the legend to the outer SVG (outside the zoomable chartGroup)
const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

// Use a proper vertical spacing (using rectangle height plus extra spacing)
const rectHeight = 20;
const extraSpacing = 0

colorScale.slice().reverse().forEach((interval, i) => {
    const legendEntry = legend.append("g")
        .attr("transform", `translate(0, ${i * (rectHeight + extraSpacing)})`);

    legendEntry.append("rect")
        .attr("width", 20)
        .attr("height", rectHeight)
        .attr("fill", interval.color)
        .attr("stroke", "#000");

    legendEntry.append("text")
        .attr("x", - 30)
        .attr("y", 5)
        .text(`${interval.range[1]}%`)
        .attr("fill", "#000")
        .style("font-size", "12px");
});

    
}

