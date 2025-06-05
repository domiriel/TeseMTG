
import { updateState, getState } from "../state.js";
let globalRects = null;  
let clickTimeout = null;

const colorScale = [
    { range: [0, 20], color: "#efe6dc" },
    { range: [21, 40], color: "#dac9b9" },
    { range: [41, 60], color: "#bcab9a" },
    { range: [61, 80], color: "#8a7a6a" },
    { range: [81, 100], color: "#594a3a" }
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
export function createIcicleChart(data, containerId, isUpdate = false) {
    const mtgColorOrder = { W: 0, U: 1, R: 2, B: 3, G: 4 };
    d3.select(containerId).selectAll("*").remove();

    let groupedData = [];
  
    data.forEach(card => {
        const colors = Array.isArray(card.color_identity) ? card.color_identity : [];
        let numColors = colors.length;

      
        if (numColors >= 4) numColors = 4; 

        
        let colorKey = colors
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("-") || "Colorless";

        let colorGroupName = 
    numColors === 0 ? "Colorless" :
    numColors === 1 ? "1 Color" :
    numColors === 4 ? "+4 Colors" :
    `${numColors} Colors`;


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
        group.children.sort((a, b) => {
            const aColors = a.name.split("-");
            const bColors = b.name.split("-");
    
            for (let i = 0; i < Math.max(aColors.length, bColors.length); i++) {
                const aVal = mtgColorOrder[aColors[i]] ?? 99;
                const bVal = mtgColorOrder[bColors[i]] ?? 99;
                if (aVal !== bVal) return aVal - bVal;
            }
    
            return 0;
        });
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
        .style("cursor", "pointer")
        .on("click", function(event, d) {

    clearTimeout(clickTimeout);
    clickTimeout = setTimeout(() => {
        clicked(event, d, false);  
    }, 150); 
})
.on("dblclick", function(event, d) {

    clearTimeout(clickTimeout);
    clickedFilter(event, d);  
})


        
        .on("mouseover", function(event, d) {
    const tooltip = d3.select("#tooltip");
    tooltip
        .style("display", "block")
        .html(`
            <strong>${d.data.name.replaceAll("-", "")}</strong><br>
            Total: ${d.value} cards<br>
            Original: ${d.data.originalCount || 0} (${((d.data.originalCount / d.value) * 100).toFixed(2)}%)<br>
            Reprint: ${d.data.reprintCount || 0} cards<br>
            Functional Reprint: ${d.data.functionalReprintCount || 0} cards
        `);
})
.on("mousemove", function(event) {
    const tooltip = d3.select("#tooltip");
    const tooltipNode = tooltip.node();

    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;

    let x = event.pageX + 10;
    let y = event.pageY + 10;

    if (x + tooltipWidth > window.innerWidth) {
        x = window.innerWidth - tooltipWidth - 10;
    }
    if (y + tooltipHeight > window.innerHeight) {
        y = window.innerHeight - tooltipHeight - 10;
    }

    tooltip
        .style("left", `${x}px`)
        .style("top", `${Math.max(y, 0)}px`);
})
.on("mouseout", function() {
    d3.select("#tooltip").style("display", "none");
});



        globalRects = rects;

        let hoverTimeout;



          
    
        const labels = zoomGroup.selectAll("text")
    .data(root.descendants().slice(1))
    .enter()
    .append("text")
    .attr("x", d => (xScale(d.x0) + xScale(d.x1)) / 2)
    .attr("y", d => yScale(d.depth))
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("fill", "#000")
    .attr("pointer-events", "none")
    .attr("transform", d => {
        if (d.depth === 2) {
            const x = (xScale(d.x0) + xScale(d.x1)) / 2;
            const y = yScale(d.depth);
            return `rotate(-90, ${x}, ${y})`; 
        }
        return null;
    })
    .style("font-size", d => {
        const rectWidth = xScale(d.x1) - xScale(d.x0);
        const baseSize = 15;
        if (rectWidth < 40) return `${14}px`;
        return `${baseSize}px`;
    })
    .style("opacity", d => {
    const rectWidth = xScale(d.x1) - xScale(d.x0);
    const rectHeight = levelHeight - 2;
    const textLength = d.data.name.replaceAll("-", "").length * 6;

    if (d.depth === 2) {

        return (rectHeight > textLength && rectWidth > 9) ? 1 : 0;
    } else {

        return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
    }
})

    .text(d => d.data.name.replaceAll("-", ""));

      
    
    

    
    function clicked(event, p, doubleClickFlag = false) {
        const wasFocused = (focus === p);
        focus = wasFocused ? root : p;
    
       
        xScale.domain([focus.x0, focus.x1]);
        yScale.domain([0, depth]);
    
        const t = zoomGroup.transition().duration(750);
    
        rects.transition(t)
            .attr("x", d => xScale(d.x0))
            .attr("y", d => yScale(d.depth) - (levelHeight / 2))
            .attr("width", d => xScale(d.x1) - xScale(d.x0))
            .attr("height", levelHeight - 2);
    
        labels.transition(t)
        .attr("x", d => {
            if (d.depth === 1 && focus.depth === 2 && focus.parent === d) {

                return (xScale(focus.x0) + xScale(focus.x1)) / 2;
            } else {
                return (xScale(d.x0) + xScale(d.x1)) / 2;
            }
        })
            .attr("y", d => yScale(d.depth))
            .attr("transform", d => {
        const x = (xScale(d.x0) + xScale(d.x1)) / 2;
        const y = yScale(d.depth);
        return d.depth === 2 ? `rotate(-90, ${x}, ${y})` : null;
    })
            .style("opacity", d => {
                const rectWidth = xScale(d.x1) - xScale(d.x0);
                const rectHeight = levelHeight - 2;
                const textLength = d.data.name.length * 7;
                return (rectWidth > textLength && rectHeight > 12) ? 1 : 0;
            });
    
        if (doubleClickFlag) {
            const currentFilters = getState().selectedFilters;
            const newFilters = structuredClone(currentFilters);
        
            if (wasFocused) {
                newFilters.IcicleColorGroups = new Set();
                newFilters.IcicleColorIdentity = new Set();
            } else if (p.depth === 1) {
                newFilters.IcicleColorGroups = new Set([p.data.name]);
                newFilters.IcicleColorIdentity = new Set(); 
            } else if (p.depth === 2) {
                newFilters.IcicleColorIdentity = new Set([p.data.name]);
                newFilters.IcicleColorGroups = new Set(); 
            }
        
            setTimeout(() => {
                updateState({ selectedFilters: newFilters, updateContext: "IcicleFilter" });
                
            }, 70);  
        }
    }

    function clickedFilter(event, d) {

    d3.select(event.currentTarget).classed("selected", !d3.select(event.currentTarget).classed("selected"));

    const wasFocused = false; 

    const currentFilters = getState().selectedFilters;
    const newFilters = structuredClone(currentFilters);

    const isAlreadySelected =
    (d.depth === 1 && currentFilters.IcicleColorGroups?.has(d.data.name)) ||
    (d.depth === 2 && currentFilters.IcicleColorIdentity?.has(d.data.name));

if (isAlreadySelected) {
    newFilters.IcicleColorGroups = new Set();
    newFilters.IcicleColorIdentity = new Set();
} else {
    if (d.depth === 1) {
        newFilters.IcicleColorGroups = new Set([d.data.name]);
        newFilters.IcicleColorIdentity = new Set(); 
    } else if (d.depth === 2) {
        newFilters.IcicleColorIdentity = new Set([d.data.name]);
        newFilters.IcicleColorGroups = new Set(); 
    }
}


    setTimeout(() => {
        updateState({ selectedFilters: newFilters, updateContext: "IcicleFilter" });
    }, 70);
}

    
    
    const legendX = margin.left + chartWidth + 15;
    const legendY = margin.top; 


    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${legendX}, ${legendY})`);


    const rectHeight = 20;
    const extraSpacing = 0

    legend.append("text")
    .attr("x", 0)
    .attr("y", 120)
    .text("Original")
    .attr("fill", "#000")
    .style("font-size", "12px")
    .style("font-weight", "bold");

legend.append("text")
    .attr("x", 0)
    .attr("y", 135)
    .text("Cards (%)")
    .attr("fill", "#000")
    .style("font-size", "12px")
    .style("font-weight", "bold");


    colorScale.slice().reverse().forEach((interval, i) => {
        const legendEntry = legend.append("g")
            .attr("transform", `translate(0, ${i * (rectHeight + extraSpacing)})`);

        legendEntry.append("rect")
            .attr("width", 20)
            .attr("class", "legend-box")
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

export function highlightIcicleRect(hoveredCards) {
    if (!globalRects) return;

    const identityMatches = new Set();
    const mtgColorOrder = { W: 0, U: 1, R: 2, B: 3, G: 4 };

    (hoveredCards || []).forEach(card => {
        if (card.color_identity && card.color_identity.length > 0) {
            const identity = card.color_identity
                .slice()
                .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
                .join("-");
            identityMatches.add(identity);
        }
    });

    globalRects.classed("highlighted", d =>
        d.depth === 2 && identityMatches.has(d.data.name)
    );
}




