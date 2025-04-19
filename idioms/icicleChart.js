//Issues fixed: 1, 2, 4


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


function getColorFromPercentage(percentage) {
    for (let i = colorScale.length - 1; i >= 0; i--) { 
        if (percentage >= colorScale[i].range[0]) {
            return colorScale[i].color;
        }
    }
    return colorScale[0].color; 
}


function hexToRgb(hex) {
    let bigint = parseInt(hex.slice(1), 16);
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255
    };
}


function rgbToHex(r, g, b) {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}
function createIcicleChart(data, containerId, isUpdate = false) {
    
    
    let groupedData = [];
  
    data.forEach(card => {
        const colors = Array.isArray(card.color_identity) ? card.color_identity : [];
        let numColors = colors.length;

      
        if (numColors >= 4) numColors = 4; 

        let colorKey = colors.sort().join("-") || "Colorless";  
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

    
    groupedData.forEach(group => {
        group.originalCount = group.children.reduce((sum, c) => sum + (c.originalCount || 0), 0);
        group.reprintCount = group.children.reduce((sum, c) => sum + (c.reprintCount || 0), 0);
        group.functionalReprintCount = group.children.reduce((sum, c) => sum + (c.functionalReprintCount || 0), 0);

        
        group.children.forEach(c => {
            let originalPercentage = (c.originalCount / c.value) * 100 || 0;
            c.color = getColorFromPercentage(originalPercentage);
        });

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
            group.color = "#efefef"; 
        }
    });

    
    groupedData.sort((a, b) => a.numColors - b.numColors);

    
    groupedData.forEach(group => {
        group.children.sort((a, b) => a.name.localeCompare(b.name));
    });

    
    const hierarchy = { children: groupedData };
    
  

    const container = d3.select(containerId);
    
    const containerBounds = container.node().getBoundingClientRect();
 

    const containerWidth = container.node().getBoundingClientRect().width;
    const containerHeight = container.node().getBoundingClientRect().height;
    

    const chartWidth = containerWidth * 0.85;
    const chartHeight = containerHeight * 0.80;
    

    const xOffset = (containerWidth - chartWidth)/2 - 40; 
    const yOffset = -(containerHeight - chartHeight)/2; 


    const margin = { top: (containerHeight - chartHeight)/2 + 1 , right: 50, bottom: 20, left: (containerWidth - chartWidth)/2 - 40 }; 

if (isUpdate) {
    d3.select(containerId).select("svg").remove(); 
}

const legendWidth = 100;


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


    const root = d3.hierarchy(hierarchy)
    .sum(d => d.value)
    .sort((a, b) => a.data.numColors - b.data.numColors);

    

const depth = Math.max(...root.descendants().map(d => d.depth)) ;


const partition = d3.partition().size([chartWidth, chartHeight]);
partition(root);

const levelHeight = chartHeight / depth;

    let xScale = d3.scaleLinear().domain([0, chartWidth]).range([0, chartWidth]);
    let yScale = d3.scaleLinear().domain([0, depth]).range([0, chartHeight]);



    let focus = root; 

    
    const rects = zoomGroup.selectAll("rect")
        .data(root.descendants().slice(1)) 
        .enter()
        .append("rect")
        .attr("x", d => xScale(d.x0))
        .attr("y", d => yScale(d.depth) - levelHeight / 2) 


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
    .data(root.descendants().slice(1)) 
    .enter()
    .append("text")
    .attr("x", d => xScale(d.x0) + (xScale(d.x1) - xScale(d.x0)) / 2)
    .attr("y", d => d.depth * levelHeight )
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("fill", "#000")
    .attr("font-size", "15px")
    .attr("pointer-events", "none")
    .style("opacity", d => {
        const rectWidth = xScale(d.x1) - xScale(d.x0);
        const rectHeight = levelHeight - 1;
        const textLength = d.data.name.length * 7;
        
        return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
    })
    .text(d => d.data.name);

    
    

    
    function clicked(event, p) {
        focus = (focus === p) ? root : p;
  
    

        
        xScale.domain([focus.x0, focus.x1]);
    

        

        
        yScale.domain([0, depth]); 
    
        const t = zoomGroup.transition().duration(750);
    
        rects.transition(t)
            .attr("x", d => xScale(d.x0))
            .attr("y", d => yScale(d.depth) - (levelHeight / 2)) 
            .attr("width", d => xScale(d.x1) - xScale(d.x0))
            .attr("height", levelHeight - 2); 
    
            labels.transition(t)
            .attr("x", d => (xScale(d.x0) + xScale(d.x1)) / 2)
            .attr("y", d => yScale(d.depth)) 
            .style("opacity", d => {
                const rectWidth = xScale(d.x1) - xScale(d.x0);
                const rectHeight = levelHeight - 2;
                const textLength = d.data.name.length * 7;
        
                return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
            }
        
        
        
        
        );
        
    }
    
    const legendX = margin.left + chartWidth + 15;
    const legendY = margin.top; 


    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${legendX}, ${legendY})`);


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

    
const zeroLabel = legend.append("g")
.attr("transform", `translate(0, ${colorScale.length * rectHeight})`);


zeroLabel.append("text")
.attr("x", 30)
.attr("y", 5)
.text(`0%`)
.attr("fill", "#000")
.style("font-size", "12px");

    
}



