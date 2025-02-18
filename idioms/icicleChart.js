function createIcicleChart(data, containerId, isUpdate = false) {
    // Step 1: Aggregate Data (Tracking original, reprints, and functional reprints)
    let groupedData = [];

    data.forEach(card => {
        const colors = Array.isArray(card.color_identity) ? card.color_identity : [];
        const numColors = colors.length;
        let colorKey = colors.sort().join("-") || "None";  

        let colorGroupName = numColors === 0 ? "Colorless" : `${numColors} Colors`;

        // Find or create `num_colors` group
        let colorGroup = groupedData.find(c => c.name === colorGroupName);
        if (!colorGroup) {
            groupedData.push({
                name: colorGroupName,
                numColors,
                originalCount: 0,   // Initialize count at parent level
                reprintCount: 0,
                functionalReprintCount: 0,
                children: []
            });
        }

        // Add color identity to the correct group
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
        .attr("fill", d => colorScale(d.depth))
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
                    Original: ${d.data.originalCount || 0} cards<br>
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