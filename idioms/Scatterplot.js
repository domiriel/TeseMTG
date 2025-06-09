
import { updateState, getState } from "../state.js";
const colorGroups = [
    { range: [1, 5691], color: "#594A3A" },  
    { range: [5692, 11382], color:  "#8a7a6a" },
    { range: [11383, 17074], color: "#bcab9a" },
    { range: [17075, 22765], color: "#dac9b9"},
    { range: [22766, 28456], color: "#efe6dc" }  
];
function getSymbolFromAttribute(attr) {
    if (attr.includes("eur")) return "€";
    if (attr.includes("usd")) return "$";
    return "";
}

let globalDots = null;

function updatePointPositions(xScale, yScale) {
    if (!globalDots) return;
    globalDots.each((d, i) => {
        if (isNaN(d.avg_price) || d.avg_price === undefined) {
            console.log("🚨 NaN or undefined avg_price detected!", d);
        }
    });
    globalDots.attr("cx", d => xScale(d.avg_price))
              .attr("cy", d => yScale(d.complexity));
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
        ? card.prices.reduce((sum, p) => sum + p, 0) / card.prices.length
        : 0;


    if (card.avg_price <= 0 ) {
    card.was_price_invalid = true;
    card.avg_price = 0.001;
} else {
    card.was_price_invalid = false;
}


    if (isNaN(card.avg_price)) {
        console.log("🚨 Invalid avg_price detected in prepareScatterData:", card);
    }

    card.all_sets = Array.from(card.all_sets.entries()).map(([name, type]) => ({ name, type }));
});

    return filteredForPlot
        .filter(card => cardMap.has(card.name))
        .map(card => cardMap.get(card.name));
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


    const allData = data; 
const filteredForPlot = allData.filter(card =>
    !excludedSetTypes.has(card.set_type) &&
    !excludedSetNames.some(keyword => card.set_name && card.set_name.includes(keyword)) &&
    !excludedTypes.includes(card.type) &&
    
    !card.digital
);

const cardMap = new Map();


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


    const price = isNaN(card[selectedPriceAttribute]) || card[selectedPriceAttribute] === null ? 0 : card[selectedPriceAttribute];
    if (!card.digital && !isNaN(card.complexity)) {
        cardMap.get(card.name).prices.push(price);
    }
});

cardMap.forEach(card => {
    card.avg_price = card.prices.length > 0
        ? card.prices.reduce((sum, p) => sum + p, 0) / card.prices.length
        : 0;
     if (isNaN(card.avg_price)) {
    console.log("Invalid avg_price detected", card);
  }


  if (card.avg_price <= 0 ) {
        card.was_price_invalid = true;
        card.avg_price = 0.001;
    } else {
        card.was_price_invalid = false;
    }
    card.all_sets = Array.from(card.all_sets.entries()).map(([name, type]) => ({ name, type }));
});


const filteredData = filteredForPlot
    .filter(card => cardMap.has(card.name))
    .map(card => cardMap.get(card.name));


    const sampledData = filteredData;

    const minPrice = d3.min(sampledData, d => d.avg_price);
const maxPrice = d3.max(sampledData, d => d.avg_price);
const safeMinPrice = Math.max(0.001, minPrice);
const pricePadding = (maxPrice - safeMinPrice) * 0.01;
const paddedMinPrice = 0.0009
const paddedMaxPrice = maxPrice + pricePadding;

sampledData.forEach(d => {
    if (d.avg_price <= 0 || isNaN(d.avg_price)) {
        console.log(`🚨 Replacing invalid avg_price for ${d.name}: was ${d.avg_price}, set to ${safeMinPrice}`);
        d.avg_price = safeMinPrice;
    }
});

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
    .domain([
        paddedMinPrice,
        paddedMaxPrice
    ])
    .range([0, chartWidth]);



        const minComplexity = d3.min(sampledData, d => d.complexity);
        const maxComplexity = d3.max(sampledData, d => d.complexity);
        const yPadding = (maxComplexity - minComplexity) * 0.01; 
        
        const originalYScale = d3.scaleLinear()
            .domain([minComplexity - yPadding, maxComplexity + yPadding])
            .range([chartHeight, 0]);
        

    const xScale = originalXScale.copy();
    const yScale = originalYScale.copy();

    const symbol = getSymbolFromAttribute(selectedPriceAttribute); 



    const xAxisG = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`);

    const yAxisG = g.append("g")
        .attr("class", "y-axis");

    const numTicks = 12;
function updateAxes(symbol) {
    const logMin = Math.log10(xScale.domain()[0]);
    const logMax = Math.log10(xScale.domain()[1]);


    let ticks = d3.range(numTicks).map(i => Math.pow(10, logMin + i / (numTicks - 1) * (logMax - logMin)));


    if (ticks.length > 0 && ticks[0] < 0.001) {
        ticks[0] = 0.001;
    }

    const formatPrice = d => {
        if (Math.abs(d - 0.001) < 1e-3) return '(NaN)';
        return `${symbol}${d.toFixed(3)}`;
    };
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
        })
        .on("mouseover", (event) => {
        d3.select("#tooltip")
            .style("display", "block")
            .html(() => {
                if (selectedPriceAttribute.includes("eur")) return "Price data is sourced from <b>Cardmarket</b> (EUR).";
                if (selectedPriceAttribute.includes("usd")) return "Price data is sourced from <b>TCGplayer</b> (USD).";
                if (selectedPriceAttribute.includes("thx")) return "Price data is sourced from <b>Scryfall</b>.";
                return "Price data source unknown.";
            });
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
        ;
        

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

    const brushOverlay = g.append("g")
    .attr("class", "brush-overlay")
    .attr("clip-path", "url(#chart-clip)");

const brush = d3.brush()
    .extent([[0, 0], [chartWidth, chartHeight]])
    .on("start", () => svg.on(".zoom", null))
    .on("end", function(event) {
        svg.call(zoom); // Re-enable zoom
        if (!event.selection) return;

        const [[x0, y0], [x1, y1]] = event.selection;

        const brushedCards = sampledData.filter(d => {
            const cx = xScale(d.avg_price);
            const cy = yScale(d.complexity);
            return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        });

        const { hoveredCards } = getState();
        const updatedHovered = new Map(hoveredCards.map(c => [c.name, c]));
        for (const card of brushedCards) {
            if (updatedHovered.has(card.name)) {
                updatedHovered.delete(card.name);
            } else {
                updatedHovered.set(card.name, card);
            }
        }

        const newHoveredCards = Array.from(updatedHovered.values());
        updateState({ hoveredCards: newHoveredCards });

        d3.selectAll(".dots circle")
            .style("stroke", d => newHoveredCards.some(c => c.name === d.name)
                ? "orange"
                : (+d.edhrec_rank > 0 ? "none" : "black"))
            .style("stroke-width", d => newHoveredCards.some(c => c.name === d.name)
                ? 2.5
                : (+d.edhrec_rank > 0 ? 0 : 1.2))
            .each(function (d) {
                if (newHoveredCards.some(c => c.name === d.name)) {
                    this.parentNode.appendChild(this);
                }
            });

        // ✅ Remove selection box after brush
        brushOverlay.call(brush.move, null);
    });



brushOverlay.call(brush).lower();


    const dots = gClip.selectAll("circle")
    .data(sampledData, d => d.name)
    .join("circle")
    .attr("r", 2.5)
    .style("cursor", "pointer")
    .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
.style("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
.style("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)

    .attr("opacity", 0.8);

sampledData.forEach((d, i) => {
    if (isNaN(d.avg_price) || d.avg_price <= 0 || typeof d.avg_price !== 'number') {
        console.log(`🚨 Invalid avg_price in sampledData at index ${i}:`, d.name, d.avg_price);
    }
});

    globalDots = dots;
console.log("🛠️ xScale domain:", xScale.domain());
console.log("🛠️ globalDots count:", globalDots.size());

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
                Avg Price: ${d.was_price_invalid ? "NaN" : symbol + d.avg_price.toFixed(3)}<br>
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
  .style("stroke", d => newHoveredCards.some(c => c.name === d.name)
    ? "orange"
    : (+d.edhrec_rank > 0 ? "none" : "black"))
  .style("stroke-width", d => newHoveredCards.some(c => c.name === d.name)
    ? 2.5
    : (+d.edhrec_rank > 0 ? 0 : 1.2));
});

        
        
        

        const legendWidth = 160;
const legendItemHeight = 20;
const legendSpacing = 0;
const legendX = margin.left + chartWidth -100;
const legendY = margin.top;

const legend = svg.append("g")
  .attr("class", "edhrec-legend")
  .attr("transform", `translate(${legendX}, ${legendY})`);


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

    console.log("Filtered Data:", filteredData.filter(d => d.edhrec_rank == 0));

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


    const newMinPrice = Math.max(0.001, d3.min(filteredData, d => d.avg_price));
    const newMaxPrice = d3.max(filteredData, d => d.avg_price);
    originalXScale.domain([newMinPrice, newMaxPrice]);


    const transform = d3.zoomTransform(svg.node());
    const newX = transform.rescaleX(originalXScale);
    xScale.domain(newX.domain());


    const symbol = getSymbolFromAttribute(selectedPriceAttribute);
    updateAxes(symbol);

    svg.select(".x-axis-label")
        .text(() => {
            if (selectedPriceAttribute.includes("eur")) return "Price (€)";
            if (selectedPriceAttribute.includes("thx")) return "Price";
            return "Price ($)";
        });

    gClip.selectAll("circle").remove();

    const tooltip = d3.select("#tooltip");

    gClip.selectAll("circle")
        .data(filteredData, d => d.name)
        .enter()
        .append("circle")
        .attr("r", 2.5)
        .style("cursor", "pointer")
       .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
    .style("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
.style("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)

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
                        Avg Price: ${d.was_price_invalid ? "NaN" : symbol + d.avg_price.toFixed(3)}<br>
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
  .style("stroke", d => newHoveredCards.some(c => c.name === d.name)
    ? "orange"
    : (+d.edhrec_rank > 0 ? "none" : "black"))
  .style("stroke-width", d => newHoveredCards.some(c => c.name === d.name)
    ? 2.5
    : (+d.edhrec_rank > 0 ? 0 : 1.2));
        });


    globalDots = gClip.selectAll("circle");
    updatePointPositions(xScale, yScale);


    const { hoveredCards } = getState();
d3.selectAll(".dots circle")
  .style("stroke", d => hoveredCards.some(c => c.name === d.name)
    ? "orange"
    : (+d.edhrec_rank > 0 ? "none" : "black"))
  .style("stroke-width", d => hoveredCards.some(c => c.name === d.name)
    ? 2.5
    : (+d.edhrec_rank > 0 ? 0 : 1.2))
  .each(function (d) {
    if (hoveredCards.some(c => c.name === d.name)) {
      this.parentNode.appendChild(this); 
    }
  });
}





