
import { updateState, getState } from "../state.js";
const colorGroups = [
    { range: [1, 5691], color: "#787878" },  
    { range: [5692, 11382], color:  "#a9a9a9" },
    { range: [11383, 17074], color: "#c3c3c3" },
    { range: [17075, 22765], color: "#dadada"},
    { range: [22766, 28456], color: "#efefef" }  
];
function getSymbolFromAttribute(attr) {
    if (attr.includes("eur")) return "€";
    if (attr.includes("usd")) return "$";
    return "";
}

let globalDots = null;

function updatePointPositions(xScale, yScale) {
    if (!globalDots) return;
    globalDots.attr("cx", d => xScale(d.avg_price))
              .attr("cy", d => yScale(d.complexity));
}


function generateLogTicks2(min, max) {
    const ticks = [];

    
    const rangeSpan = Math.log10(max) - Math.log10(min);

    
    const bases = rangeSpan < 1
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9] 
        : [1, 2, 3, 5];              

    const minExp = Math.floor(Math.log10(min));
    const maxExp = Math.ceil(Math.log10(max));

    for (let e = minExp; e <= maxExp; e++) {
        for (let base of bases) {
            const value = base * Math.pow(10, e);
            if (value >= min && value <= max) {
                ticks.push(value);
            }
        }
    }

    return ticks;
}
export function prepareScatterData(data, selectedPriceAttribute) {
    const excludedSetTypes = new Set(["promo", "funny", "memorabilia", "alchemy", "token", "minigame"]);
    const excludedSetNames = ["Arena", "Alchemy", "Digital"];
    const excludedTypes = ["Emblem", "Token"];

    const filteredForPlot = data.filter(card =>
        !excludedSetTypes.has(card.set_type) &&
        !excludedSetNames.some(keyword => card.set_name?.includes(keyword)) &&
        !excludedTypes.includes(card.type) &&
        !card.digital
    );

    const cardMap = new Map();
    data.forEach(card => {
        if (!cardMap.has(card.name)) {
            cardMap.set(card.name, {
                ...card,
                prices: [],
                avg_price: 0,
                all_sets: new Map([[card.set_name, card.set_type]])
            });
        } else {
            cardMap.get(card.name).all_sets.set(card.set_name, card.set_type);
        }

        const price = isNaN(card[selectedPriceAttribute]) || card[selectedPriceAttribute] == null
            ? 0 : card[selectedPriceAttribute];
        if (!card.digital && !isNaN(card.complexity)) {
            cardMap.get(card.name).prices.push(price);
        }
    });

    cardMap.forEach(card => {
        card.avg_price = card.prices.length > 0
    ? Math.max(0.001, card.prices.reduce((sum, p) => sum + p, 0) / card.prices.length)
    : 0.001; // Smallest possible displayable value

        card.all_sets = Array.from(card.all_sets.entries()).map(([name, type]) => ({ name, type }));
    });

    return filteredForPlot
        .filter(card => cardMap.has(card.name))
        .map(card => cardMap.get(card.name));
}

function generateLogTicks(min, max) {
    const ticks = [];
    const logSpan = Math.log10(max) - Math.log10(min);

    if (logSpan < 0.5) {
        
        const step = (max - min) / 10;
        for (let i = min; i <= max; i += step) {
            ticks.push(i);
        }
    } else if (logSpan < 1) {
        
        const bases = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const minExp = Math.floor(Math.log10(min));
        const maxExp = Math.ceil(Math.log10(max));
        for (let e = minExp; e <= maxExp; e++) {
            for (let base of bases) {
                const value = base * Math.pow(10, e);
                if (value >= min && value <= max) {
                    ticks.push(value);
                }
            }
        }
    } else {
        
        const bases = [1, 2, 3, 5];
        const minExp = Math.floor(Math.log10(min));
        const maxExp = Math.ceil(Math.log10(max));
        for (let e = minExp; e <= maxExp; e++) {
            for (let base of bases) {
                const value = base * Math.pow(10, e);
                if (value >= min && value <= max) {
                    ticks.push(value);
                }
            }
        }
    }

    return ticks;
}



function getGroupColor(rank) {
    if (rank === 0) return "#efefef"; 
    for (let group of colorGroups) {
        if (rank >= group.range[0] && rank <= group.range[1]) {
            return group.color;
        }
    }
    return colorGroups[colorGroups.length - 1].color; 
}



export function createScatterPlot(data, containerId, isUpdate = false, selectedPriceAttribute = "price_usd", savedTransform = null) {

    
    d3.select(containerId).selectAll("*").remove();

    const excludedSetTypes = new Set(["promo", "funny", "memorabilia", "alchemy", "token", "minigame"]);
    const excludedSetNames = ["Arena", "Alchemy", "Digital"];
    const excludedTypes = ["Emblem", "Token"];


    const allData = data; // include digital for metadata
const filteredForPlot = allData.filter(card =>
    !excludedSetTypes.has(card.set_type) &&
    !excludedSetNames.some(keyword => card.set_name && card.set_name.includes(keyword)) &&
    !excludedTypes.includes(card.type) &&
    
    !card.digital
);

const cardMap = new Map();

// Include *all* sets in all_sets, but only non-digital prices in avg_price
allData.forEach(card => {
    if (!cardMap.has(card.name)) {
        cardMap.set(card.name, {
            ...card,
            prices: [],
            avg_price: 0,
            all_sets: new Map([[card.set_name, card.set_type]])
        });
    } else {
        cardMap.get(card.name).all_sets.set(card.set_name, card.set_type);
    }

    // Only collect price for non-digital cards
    const price = isNaN(card[selectedPriceAttribute]) || card[selectedPriceAttribute] === null ? 0 : card[selectedPriceAttribute];
    if (!card.digital && !isNaN(card.complexity)) {
        cardMap.get(card.name).prices.push(price);
    }
});

cardMap.forEach(card => {
    card.avg_price = card.prices.length > 0
        ? card.prices.reduce((sum, p) => sum + p, 0) / card.prices.length
        : 0;
    card.all_sets = Array.from(card.all_sets.entries()).map(([name, type]) => ({ name, type }));
});

// Only show non-digital cards in the plot
const filteredData = filteredForPlot
    .filter(card => cardMap.has(card.name))
    .map(card => cardMap.get(card.name));


    const sampledData = filteredData;

    const container = d3.select(containerId).node();
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    d3.select(containerId)
  .style("visibility", "hidden");

    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left - 8.5}, ${margin.top})`);

const originalXScale = d3.scaleLog()
    .domain([paddedXMin, paddedXMax])
    .range([0, chartWidth]);


        const minComplexity = d3.min(sampledData, d => d.complexity);
        const maxComplexity = d3.max(sampledData, d => d.complexity);
        const yPadding = (maxComplexity - minComplexity) * 0.01; // 5% padding
        
        const originalYScale = d3.scaleLinear()
            .domain([minComplexity - yPadding, maxComplexity + yPadding])
            .range([chartHeight, 0]);
        

    const xScale = originalXScale.copy();
    const yScale = originalYScale.copy();

    const symbol = getSymbolFromAttribute(selectedPriceAttribute); 
const formatPrice = d => `${symbol}${d.toFixed(2)}`;


    const xAxisG = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`);

    const yAxisG = g.append("g")
        .attr("class", "y-axis");

    const numTicks = 12;
    function updateAxes(symbol) {
    const logMin = Math.log10(xScale.domain()[0]);
    const logMax = Math.log10(xScale.domain()[1]);
    const ticks = d3.range(numTicks).map(i => Math.pow(10, logMin + i / (numTicks - 1) * (logMax - logMin)));

    const formatPrice = d => `${symbol}${d.toFixed(2)}`;
    xAxisG.call(d3.axisBottom(xScale).tickValues(ticks).tickFormat(formatPrice));
    yAxisG.call(d3.axisLeft(yScale).ticks(numTicks));
}


    updateAxes(symbol);


    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + chartWidth / 2)
        .attr("y", height - 15)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text(() => {
            if (selectedPriceAttribute.includes("eur")) return "Price (€)";
            if (selectedPriceAttribute.includes("thx")) return "Price";
            return "Price ($)";
        });
        

        svg.append("text")
    .attr("class", "y-axis-label")
    .attr("x", margin.left-15)
    .attr("y", margin.top - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("cursor", "help")
    .text("Complexity")
    .on("mouseover", (event) => {
        d3.select("#tooltip")
            .style("display", "block")
            .html(`An aggregated score representing the number <br> of non-flavor words a card has.`);
    })
    .on("mousemove", (event) => {
        const tooltip = d3.select("#tooltip");
        const tooltipWidth = tooltip.node().offsetWidth;
        const padding = 10;
        let left = event.pageX + padding;
        if (left + tooltipWidth > window.innerWidth) {
            left = event.pageX - tooltipWidth - padding;
        }

        tooltip
            .style("left", `${left}px`)
            .style("top", `${event.pageY + padding}px`);
    })
    .on("mouseout", () => {
        d3.select("#tooltip").style("display", "none");
    });


    
    
    svg.append("defs")
        .append("clipPath")
        .attr("id", "chart-clip")
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", chartWidth + 20)
        .attr("height", chartHeight);

    const gDot = g.append("g")
        .attr("class", "dots")
        .attr("clip-path", "url(#chart-clip)");

    const gClip = gDot.append("g").attr("class", "clip-group");

    const dots = gClip.selectAll("circle")
    .data(sampledData, d => d.name)
    .join("circle")
    .attr("r", 2.5)
    .style("cursor", "pointer")
    .attr("fill", d => d.edhrec_rank ? getGroupColor(d.edhrec_rank) : "transparent")
    .attr("stroke", d => d.edhrec_rank ? "none" : "black")
    .attr("stroke-width", d => d.edhrec_rank ? 0 : 1.2)
    .attr("opacity", 0.8);

    globalDots = dots;

    updatePointPositions(xScale, yScale);


    

    const tooltip = d3.select("#tooltip");
    let hoverTimeout = null;


    dots.on("mouseover", function (event, d) {
        tooltip.style("display", "block")
    .html(`
        <div style="display: flex; gap: 12px; align-items: flex-start;">
            <img src="${d.image_normal}" alt="${d.name}" width="200" style="border-radius: 4px; box-shadow: 0 0 4px rgba(0,0,0,0.5);" />
            <div>
                <strong>${d.name}</strong><br>
                Complexity: ${d.complexity}<br>
                EDH Rank: ${d.edhrec_rank || "N/A"}<br>
                Supertypes: ${d.supertype}<br>
                Type: ${d.type}<br>
                Subtype: ${d.subtype}<br>
                Colors: ${d.color_identity}<br>
                Avg Price: ${selectedPriceAttribute.includes("eur")
                    ? "€"
                    : selectedPriceAttribute.includes("thx")
                    ? ""
                    : "$"}${d.avg_price.toFixed(2)}<br>
                All Sets: ${d.all_sets.map(set => `${set.name} (${set.type})`).join("<br>")}<br>
            </div>
        </div>
    `);
 })
        .on("mousemove", function (event) {
            const tooltipNode = tooltip.node();
            const tooltipWidth = tooltipNode.offsetWidth;
            const pageX = event.pageX;
            const pageY = event.pageY;
            const padding = 10;

            let left = pageX + padding;
            if (left + tooltipWidth > window.innerWidth) {
                left = pageX - tooltipWidth - padding;
            }

            tooltip.style("left", left + "px")
                .style("top", (pageY + padding) + "px");
        })
        .on("mouseout", function () {
            tooltip.style("display", "none");
        })
        .on("click", function (event, d) {
    const { hoveredCards } = getState();
    const isAlreadySelected = hoveredCards.some(c => c.name === d.name);

    let newHoveredCards;
    if (isAlreadySelected) {
        newHoveredCards = hoveredCards.filter(c => c.name !== d.name);
        d3.select(this).attr("stroke", "none").attr("stroke-width", null);
    } else {
        newHoveredCards = [...hoveredCards, d];
        d3.select(this)
            .raise()
            .attr("stroke", "orange")
            .attr("stroke-width", 2.5);
    }

    updateState({ hoveredCards: newHoveredCards });

     d3.selectAll(".dots circle")
        .attr("stroke", d => newHoveredCards.some(c => c.name === d.name) ? "orange" : "none")
        .attr("stroke-width", d => newHoveredCards.some(c => c.name === d.name) ? 2.5 : null);
});

        
        
        

        const legendWidth = 160;
const legendItemHeight = 20;
const legendSpacing = 0;
const legendX = margin.left + chartWidth -100;
const legendY = margin.top;

const legend = svg.append("g")
  .attr("class", "edhrec-legend")
  .attr("transform", `translate(${legendX}, ${legendY})`);

// Title
legend.append("text")
  .attr("x", 0)
  .attr("y", 150)
  .text("EDHREC Rank")
  .attr("fill", "#000")
  .style("font-size", "12px")
  .style("font-weight", "bold");

  

colorGroups.forEach((group, i) => {
  const entry = legend.append("g")
    .attr("transform", `translate(0, ${(i + 1) * (legendItemHeight + legendSpacing)})`);

  entry.append("rect")
    .attr("width", 18)
    .attr("height", legendItemHeight)
    .attr("fill", group.color)
    .attr("stroke", "#000");

  entry.append("text")
    .attr("x", 26)
    .attr("y", legendItemHeight / 2)
    .attr("dy", "0.35em")
    .text(`${group.range[0]}–${group.range[1]}`)
    .style("font-size", "12px")
    .attr("fill", "#000");
});
// Add 'No EDHREC Rank' legend item
const noRankEntry = legend.append("g")
  .attr("transform", `translate(0, ${(colorGroups.length + 1) * (legendItemHeight + legendSpacing)})`);

noRankEntry.append("circle")
  .attr("r", 6)
  .attr("cx", 9)
  .attr("cy", legendItemHeight / 2)
  .attr("fill", "transparent")
  .attr("stroke", "black")
  .attr("stroke-width", 1.2);

noRankEntry.append("text")
  .attr("x", 26)
  .attr("y", legendItemHeight / 2)
  .attr("dy", "0.35em")
  .text("No Rank")
  .style("font-size", "12px")
  .attr("fill", "#000");


        
        
        
    let zoomTimeout = null;
    const ZOOM_DELAY = 60; 

    const zoom = d3.zoom()
        .scaleExtent([1, 24])
        .on("zoom", event => {
            if (zoomTimeout) clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                const transform = event.transform;
                const newX = transform.rescaleX(originalXScale);
                let newY = transform.rescaleY(originalYScale);
                const [yMin, yMax] = newY.domain();

                
                if (yMin < 0) {
                    const span = yMax - yMin;
                    newY = d3.scaleLinear()
                        .domain([0, Math.max(0.001, span)])
                        .range([chartHeight, 0]);
                }

                xScale.domain(newX.domain());
                yScale.domain(newY.domain());

                updateAxes(symbol);
                updatePointPositions(xScale, yScale);

                
            }, ZOOM_DELAY);
        });


        svg.call(zoom);

        if (savedTransform) {
            svg.call(zoom.transform, savedTransform);
        }
        
        // Wait 1 frame (~16ms) before revealing chart
        setTimeout(() => {
            d3.select(containerId).style("visibility", "visible");
        }, 20);
        
    

    function updatePointStyle(zoomLevel) {
        dots.attr("r", d => {
            if (zoomLevel < 2) return 1.5;
            if (zoomLevel < 6) return 3;
            return 5;
        });
    }
    
svg.node().__scales__ = {
    xScale,
    yScale,
    xAxisG,
    yAxisG,
    updateAxes,
    originalXScale,
    originalYScale
};


    function resetZoom() {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    }

    d3.select("#reset-button").on("click", resetZoom);
}

export function updateScatterPlot(filteredData, selectedPriceAttribute = "price_eur") {
    const svg = d3.select(".Scatterplot svg");
    if (svg.empty()) return;

    const {
        xScale,
        yScale,
        updateAxes,
        originalXScale,
        originalYScale
    } = svg.node().__scales__ || {};
    if (!xScale || !yScale || !updateAxes || !originalXScale || !originalYScale) return;

    const g = svg.select("g");
    const gClip = g.select(".dots .clip-group");

    // 1️⃣ Update the original xScale domain based on new price attribute
    const newMinPrice = Math.max(0.001, d3.min(filteredData, d => d.avg_price));
    const newMaxPrice = d3.max(filteredData, d => d.avg_price);
    originalXScale.domain([newMinPrice, newMaxPrice]);

    // 2️⃣ Apply the current zoom transform to the new domain
    const transform = d3.zoomTransform(svg.node());
    const newX = transform.rescaleX(originalXScale);
    xScale.domain(newX.domain());

    // 3️⃣ Format symbol and update axes
    const symbol = getSymbolFromAttribute(selectedPriceAttribute);
    updateAxes(symbol);

    // 4️⃣ Update x-axis label
    svg.select(".x-axis-label")
        .text(() => {
            if (selectedPriceAttribute.includes("eur")) return "Price (€)";
            if (selectedPriceAttribute.includes("thx")) return "Price";
            return "Price ($)";
        });

    // 5️⃣ Clear old dots
    gClip.selectAll("circle").remove();

    const tooltip = d3.select("#tooltip");

    // 6️⃣ Add new dots
    gClip.selectAll("circle")
        .data(filteredData, d => d.name)
        .enter()
        .append("circle")
        .attr("r", 2.5)
        .style("cursor", "pointer")
        .attr("fill", d => d.edhrec_rank ? getGroupColor(d.edhrec_rank) : "transparent")
        .attr("stroke", d => d.edhrec_rank ? "none" : "black")
        .attr("stroke-width", d => d.edhrec_rank ? 0 : 1.2)
        .attr("opacity", 0.8)
        .attr("cx", d => xScale(d.avg_price))
        .attr("cy", d => yScale(d.complexity))
        .on("mouseover", function (event, d) {
            tooltip.style("display", "block")
            .html(`
                <div style="display: flex; gap: 12px; align-items: flex-start;">
                    <img src="${d.image_normal}" alt="${d.name}" width="200" style="border-radius: 4px; box-shadow: 0 0 4px rgba(0,0,0,0.5);" />
                    <div>
                        <strong>${d.name}</strong><br>
                        Complexity: ${d.complexity}<br>
                        EDH Rank: ${d.edhrec_rank || "N/A"}<br>
                        Supertypes: ${d.supertype}<br>
                        Type: ${d.type}<br>
                        Subtype: ${d.subtype}<br>
                        Colors: ${d.color_identity}<br>
                        Avg Price: ${symbol}${d.avg_price.toFixed(2)}<br>
                        All Sets: ${d.all_sets.map(set => `${set.name} (${set.type})`).join("<br>")}<br>
                    </div>
                </div>
            `);
        })
        .on("mousemove", function (event) {
            const tooltipNode = tooltip.node();
            const tooltipWidth = tooltipNode.offsetWidth;
            const pageX = event.pageX;
            const pageY = event.pageY;
            const padding = 10;

            let left = pageX + padding;
            if (left + tooltipWidth > window.innerWidth) {
                left = pageX - tooltipWidth - padding;
            }

            tooltip.style("left", `${left}px`)
                   .style("top", `${pageY + padding}px`);
        })
        .on("mouseout", function () {
            tooltip.style("display", "none");
        })
        .on("click", function (event, d) {
            const { hoveredCards } = getState();
            const isAlreadySelected = hoveredCards.some(c => c.name === d.name);

            let newHoveredCards;
            if (isAlreadySelected) {
                newHoveredCards = hoveredCards.filter(c => c.name !== d.name);
                d3.select(this).attr("stroke", "none").attr("stroke-width", null);
            } else {
                newHoveredCards = [...hoveredCards, d];
                d3.select(this)
                    .raise()
                    .attr("stroke", "orange")
                    .attr("stroke-width", 2.5);
            }

            updateState({ hoveredCards: newHoveredCards });

            d3.selectAll(".dots circle")
                .attr("stroke", d => newHoveredCards.some(c => c.name === d.name) ? "orange" : "none")
                .attr("stroke-width", d => newHoveredCards.some(c => c.name === d.name) ? 2.5 : null);
        });

    // 7️⃣ Update global dots reference and position them
    globalDots = gClip.selectAll("circle");
    updatePointPositions(xScale, yScale);

    // 8️⃣ Highlight selected cards
    const { hoveredCards } = getState();
    d3.selectAll(".dots circle")
        .attr("stroke", d => hoveredCards.some(c => c.name === d.name) ? "orange" : "none")
        .attr("stroke-width", d => hoveredCards.some(c => c.name === d.name) ? 2.5 : null)
        .each(function (d) {
            if (hoveredCards.some(c => c.name === d.name)) {
                this.parentNode.appendChild(this); // bring to front
            }
        });
}





