// Define color intervals
const colorScale = [
    { range: [0, 20], color: "#efefef" },
    { range: [21, 40], color: "#dadada" },
    { range: [41, 60], color: "#C3C3C3" },
    { range: [61, 80], color: "#a9a9a9" },
    { range: [81, 100], color: "#787878" }
];

const colorScaleBlue = [
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
    
    const containerBounds = container.node().getBoundingClientRect();
    console.log("[1] Initial Icicle Container:", containerBounds);

    const containerWidth = container.node().getBoundingClientRect().width;
    const containerHeight = container.node().getBoundingClientRect().height;
    
    console.log("[2] Derived Container Width:", containerWidth);
    
    
    const chartWidth = containerWidth * 0.85;
    const chartHeight = containerHeight * 0.80;
    
    console.log("[3] Computed Chart Width:", chartWidth);

    const xOffset = (containerWidth - chartWidth)/2 -50; // Calculate the left margin to center it
    const yOffset = -(containerHeight - chartHeight)/2; // Calculate the top margin to center it


    const margin = { top: 20, right: 50, bottom: 20, left: 10 }; // Swap left and right margins
// Handle updates
if (isUpdate) {
    d3.select(containerId).select("svg").remove(); // Clear previous chart
}

const legendWidth = 100; // Adjust as needed

// Create SVG container with `viewBox` for proper scaling
const svg = container.append("svg")
    .attr("width", chartWidth +legendWidth)
    .attr("height", containerHeight)
    .attr("preserveAspectRatio", "xMidYMid meet");



const chartGroup = svg.append("g")
    .attr("class", "chart-group")
    .attr("transform", `translate(${xOffset}, ${yOffset})`);


chartGroup.append("clipPath")
    .attr("id", "chartClip")
    .append("rect")
    .attr("width", chartWidth)
    .attr("height", chartHeight + 300);
    

    const zoomGroup = chartGroup.append("g")
    .attr("clip-path", "url(#chartClip)");    






    // Step 7: Create a hierarchical root node
    const root = d3.hierarchy(hierarchy)
    .sum(d => d.value)
    .sort((a, b) => a.data.numColors - b.data.numColors);

    console.log("[4] Root Before Partition:", {
        x0: root.x0,
        x1: root.x1,
        width: root.x1 - root.x0
    });



const depth = Math.max(...root.descendants().map(d => d.depth)) ;


const partition = d3.partition().size([chartWidth, chartHeight]);
partition(root);

console.log("[5] Root After Partition:", {
    x0: root.x0,
    x1: root.x1,
    width: root.x1 - root.x0,
    expectedWidth: chartWidth
});



root.descendants().forEach((node, index) => {
    console.log(`[6] Node ${index} Partition Width:`, {
        name: node.data.name,
        x0: node.x0,
        x1: node.x1,
        width: node.x1 - node.x0
    });
});



const levelHeight = chartHeight / depth;




    // Step 9: Define scales
    let xScale = d3.scaleLinear().domain([0, chartWidth]).range([0, chartWidth]);
    let yScale = d3.scaleLinear().domain([0, depth]).range([0, chartHeight]);

    console.log("[7] Initial xScale Domain:", xScale.domain());

    let focus = root; // Track current focus node

    // Draw rectangles
    const rects = zoomGroup.selectAll("rect")
        .data(root.descendants().slice(1)) // Skip root node
        .enter()
        .append("rect")
        .attr("x", d => xScale(d.x0))
        .attr("y", d => yScale(d.depth) - levelHeight / 2) // Center bars properly


        .attr("width", d => xScale(d.x1) - xScale(d.x0))
        .attr("height", levelHeight-2)
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
    
    
    const labels = zoomGroup.selectAll("text")
    .data(root.descendants().slice(1)) // Skip root node
    .enter()
    .append("text")
    .attr("x", d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
    .attr("y", d => d.depth * levelHeight )
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("fill", d => (d.depth % 2 === 0 ? "#000" : "#fff"))
    .attr("font-size", "15px")
    .attr("pointer-events", "none")
    .style("opacity", d => {
        const rectWidth = xScale(d.x1) - xScale(d.x0);
        const rectHeight = levelHeight - 1;
        const textLength = d.data.name.length * 7;
        
        return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
    })
    .text(d => d.data.name);

    
    

    // Step 13: Click function for semantic zoom
    function clicked(event, p) {
        focus = (focus === p) ? root : p;
  
        console.log("[8] Before Zoom - Focus Node:", {
            name: focus.data.name,
            x0: focus.x0,
            x1: focus.x1,
            width: focus.x1 - focus.x0
        });
    

        // Update X scale for zooming horizontally
        xScale.domain([focus.x0, focus.x1]);
    
        console.log("[9] After Zoom - New xScale Domain:", xScale.domain());
        

        // Keep Y scale unchanged to preserve hierarchy
        yScale.domain([0, depth]); 
    
        const t = zoomGroup.transition().duration(750);
    
        rects.transition(t)
            .attr("x", d => xScale(d.x0))
            .attr("y", d => yScale(d.depth) - (levelHeight / 2)) // Adjust for centering
            .attr("width", d => xScale(d.x1) - xScale(d.x0))
            .attr("height", levelHeight - 2); // Ensure bars remain proportional
    
            labels.transition(t)
            .attr("x", d => (xScale(d.x0) + xScale(d.x1)) / 2)
            .attr("y", d => yScale(d.depth)) // Position inside the bars
            .style("opacity", d => {
                const rectWidth = xScale(d.x1) - xScale(d.x0);
                const rectHeight = levelHeight - 2;
                const textLength = d.data.name.length * 7;
        
                return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
            }
        
        
        
        
        );
        
    }
    
    const legendX = margin.left + chartWidth + 15;
    const legendY = margin.top + 54; // you can adjust this as needed

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
        .attr("x", 30)
        .attr("y", 5)
        .text(`${interval.range[1]}%`)
        .attr("fill", "#000")
        .style("font-size", "12px");
});

    
}



