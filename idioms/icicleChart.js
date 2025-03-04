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

    // **Step 2: Sum up originality counts from children to parent nodes**
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
    // Sort parent groups based on the number of colors (Colorless -> 1 -> 2 -> 3 -> 4+)
    groupedData.sort((a, b) => a.numColors - b.numColors);

    // Sort child nodes (color identities) alphabetically
    groupedData.forEach(group => {
        group.children.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Compute hierarchical structure
    const hierarchy = { children: groupedData };

    // Step 4: Define chart dimensions dynamically
  

    const container = d3.select(containerId);
    const containerWidth = container.node().getBoundingClientRect().width;
    const containerHeight = container.node().getBoundingClientRect().height;
    
    console.log("Container Dimensions:", { width: containerWidth, height: containerHeight });
    
    const margin = { top: 20, right: 20, bottom: 20, left: 70 };
    const chartWidth = containerWidth - margin.left - margin.right;
    const chartHeight = containerHeight - margin.top - margin.bottom;
    
   
    

// Handle updates
if (isUpdate) {
    d3.select(containerId).select("svg").remove(); // Clear previous chart
}

// Create SVG container with `viewBox` for proper scaling
const svg = container.append("svg")
    .attr("width", "100%")
    .attr("height", containerHeight)
    .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`)
    .attr("preserveAspectRatio", "xMidYMid slice");


console.log("SVG Element Created with size:", { width: svg.attr("width"), height: svg.attr("height") });

const chartGroup = svg.append("g")
    





    // Step 7: Create a hierarchical root node
    const root = d3.hierarchy(hierarchy)
    .sum(d => d.value)
    .sort((a, b) => a.data.numColors - b.data.numColors);

console.log("Root Hierarchy:", root);

const depth = root.height + 1; // Maximum depth of hierarchy
console.log("Depth of Hierarchy:", depth);
const partition = d3.partition().size([containerWidth, containerHeight]); // Multiply height by depth
partition(root);

const levelHeight = containerHeight / depth;

root.descendants().forEach((node, index) => {
    console.log(`Node ${index}:`, { name: node.data.name, x0: node.x0, x1: node.x1, y0: node.y0, y1: node.y1, height: node.y1 - node.y0 });
});


    // Step 9: Define scales
    let xScale = d3.scaleLinear().domain([0, containerWidth]).range([0, containerWidth]);
    let yScale = d3.scaleLinear().domain([0, depth]).range([0, containerHeight]);


    let focus = root; // Track current focus node

    // Draw rectangles
    const rects = chartGroup.selectAll("rect")
        .data(root.descendants().slice(1)) // Skip root node
        .enter()
        .append("rect")
        .attr("x", d => xScale(d.x0))
        .attr("y", d => d.depth * levelHeight)
        .attr("width", d => xScale(d.x1) - xScale(d.x0))
        .attr("height", levelHeight-1)
        .attr("fill", d => d.data.color)
        .style("stroke", "#fff")
        .style("cursor", "pointer")
        .on("click", clicked)
        .on("mouseover", function(event, d) {
            d3.select("#tooltip")
                .style("display", "block")
                .style("left", `${event.pageX + 10}px`)
                .style("top", `${event.pageY - 10}px`)
                .html(`
                    <strong>${d.data.name}</strong><br>
                    Total: ${d.value} cards<br>
                    Original: ${d.data.originalCount || 0} (${((d.data.originalCount / d.value) * 100).toFixed(2)}%)<br>
                    Reprint: ${d.data.reprintCount || 0} cards<br>
                    Functional Reprint: ${d.data.functionalReprintCount || 0} cards
                `);
        })
        .on("mouseout", function() {
            d3.select("#tooltip").style("display", "none");
        });
        const labels = chartGroup.selectAll("text")
    .data(root.descendants().slice(1)) // Skip root node
    .enter()
    .append("text")
    .attr("x", d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
    .attr("y", d => d.depth * levelHeight + levelHeight / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("fill", d => (d.depth % 2 === 0 ? "#000" : "#fff"))
    .attr("font-size", "12px")
    .attr("pointer-events", "none")
    .style("opacity", d => {
        const rectWidth = xScale(d.x1) - xScale(d.x0);
        const rectHeight = levelHeight - 1;
        const textLength = d.data.name.length * 7;
        
        return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
    })
    .text(d => d.data.name);


    console.log("Container size:", containerWidth, containerHeight);
    console.log("SVG size before drawing:", chartWidth, chartHeight);
    


    // Step 13: Click function for semantic zoom
    function clicked(event, p) {
        focus = (focus === p) ? root : p;

        xScale.domain([focus.x0, focus.x1]);
        yScale.domain([0, containerHeight]); // Keep Y scale unchanged

        const t = chartGroup.transition().duration(750);

        rects.transition(t)
            .attr("x", d => xScale(d.x0))
            .attr("y", d => yScale(d.y0))
            .attr("width", d => xScale(d.x1) - xScale(d.x0))
            .attr("height", d => yScale(d.y1) - yScale(d.y0));
        
        labels.transition(t)
            .attr("x", d => (xScale(d.x0) + xScale(d.x1)) / 2)
            .attr("y", d => (yScale(d.y0) + yScale(d.y1)) / 2)
            .style("opacity", d => {
                const rectWidth = xScale(d.x1) - xScale(d.x0);
                const rectHeight = yScale(d.y1) - yScale(d.y0);
                const textLength = d.data.name.length * 7;
    
                return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
            });
    }
}


