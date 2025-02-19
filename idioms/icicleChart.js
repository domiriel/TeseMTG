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
        const numColors = colors.length;
        let colorKey = colors.sort().join("-") || "";  
        let colorGroupName = numColors === 0 ? "Colorless" : `${numColors} Colors`;
    
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
    });


    groupedData.forEach(group => {
        let rgbSums = { r: 0, g: 0, b: 0 };
        let numChildren = group.children.length;
    
        group.children.forEach(child => {
            let rgb = hexToRgb(child.color);
            rgbSums.r += rgb.r;
            rgbSums.g += rgb.g;
            rgbSums.b += rgb.b;
        });
    
        if (numChildren > 0) {
            group.color = rgbToHex(
                Math.round(rgbSums.r / numChildren),
                Math.round(rgbSums.g / numChildren),
                Math.round(rgbSums.b / numChildren)
            );
        } else {
            group.color = "#efefef"; // Default color if no children exist
        }
    });

    // **Step 2: Sort the bars correctly**
    groupedData.sort((a, b) => a.numColors - b.numColors); // Sort by `numColors` (ensuring Colorless -> 1 -> 2 -> 3 -> 4 -> 5)
    groupedData.forEach(group => group.children.sort((a, b) => a.name.localeCompare(b.name))); // Sort `color_identity`

    // **Step 3: Convert to Hierarchical Format**
    const hierarchy = {
        children: groupedData
    };

    // Step 4: Define chart dimensions
    const width = 1000, height = 400;
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Step 5: Handle updates
    if (isUpdate) {
        d3.select(containerId).select("svg").remove(); // Clear previous chart
    }

    // Step 6: Create SVG container
    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Step 7: Create a hierarchical root node
    const root = d3.hierarchy(hierarchy)
        .sum(d => d.value)
        .sort((a, b) => a.data.numColors - b.data.numColors); // Sort by numColors to maintain order

    // Step 8: Define partition layout
    const partition = d3.partition().size([width, height]).padding(1);
    partition(root);

    // Step 9: Draw rectangles
    const rects = svg.selectAll("rect")
        .data(root.descendants().slice(1)) // Skip artificial root
        .enter()
        .append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("height", d => d.y1 - d.y0)
        .attr("fill", d => d.data.color) // Use calculated color
        .style("stroke", "#fff")
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select("#tooltip")
                .style("display", "block")
                .style("left", event.pageX + "px")
                .style("top", event.pageY + "px")
                .html(`
                    <strong>${d.data.name}</strong><br>
                    Total: ${d.value} cards<br>
                    Original: ${d.data.originalCount || 0} cards (${((d.data.originalCount / d.value) * 100).toFixed(2)}%)<br>
                    Reprint: ${d.data.reprintCount || 0} cards<br>
                    Functional Reprint: ${d.data.functionalReprintCount || 0} cards
                `);
        })
        .on("mouseout", function() {
            d3.select("#tooltip").style("display", "none");
        });

    // Step 10: Add text labels (Hides if the block is too small)
    svg.selectAll("text")
        .data(root.descendants().slice(1)) // Skip root node
        .enter()
        .append("text")
        .attr("x", d => (d.x0 + d.x1) / 2)
        .attr("y", d => (d.y0 + d.y1) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "12px")
        .text(d => {
            if (d.parent && d.parent.data.name === "Colorless") {
                return d.data.name === "None" ? "None" : d.data.name;
            }
            return d.parent && d.parent.data.name === "5 Colors" ? "" : d.data.name;
        })
        .style("opacity", d => (d.x1 - d.x0) > 50 ? 1 : 0); // Hide if small

    // Step 11: Tooltip setup
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
}