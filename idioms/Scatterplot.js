
import { updateState, getState } from "../state.js";
const colorGroups = [
    { range: [1, 5691], color: "#594A3A" },  
    { range: [5692, 11382], color:  "#736659" },
    { range: [11383, 17074], color: "#998066" },
    { range: [17075, 22765], color: "#b8997a"},
    { range: [22766, 28456], color: "#ceb397" }  
];
function getSymbolFromAttribute(attr) {
    if (attr.includes("eur")) return "€";
    if (attr.includes("usd")) return "$";
    return "";
}
const scatterTooltipText = `
<strong>Scatterplot Interactions:</strong><br>
• <strong>Hover</strong> on a dot: view card details.<br>
• <strong>Click</strong> a dot: toggle highlight.<br>
• <strong>Shift + Brush</strong>: multi-select cards.<br>
• <strong>Double-click Price/Complexity labels</strong>: view tooltip explanation.<br>
• <strong>Zoom</strong>: to reveal more cards.<br>
`;


const ZOOM_THRESHOLD = 6;
let currentZoomLevel = 1;
let wasZoomedOut = true;  
let isShowingFullData = false;
let initialDownsampledData = null;
let lastZoomedOut = currentZoomLevel < ZOOM_THRESHOLD;
let actualFIlteredData = null; // Store the actual filtered data for updates
    let isBrushing = false;
let brushOverlay = null;
let brush = null;
let shiftPressed = false;
let lastPriceAttribute = null;


function styleAndBindDots(selection) {
  return selection
    .attr("r", 2.5)
    .style("cursor", "pointer")
    .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
    .style("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
    .style("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)
    .attr("opacity", 0.8)
    .on("mouseover", mouseoverFn)
    .on("mousemove", mousemoveFn)
    .on("mouseout", mouseoutFn)
    .on("click", clickFn);
}



function downsamplePoints(data, xScale, yScale, cellSize = 6) {
  const grid = new Map();

  for (const d of data) {
    const cx = Math.floor(xScale(d.avg_price) / cellSize);
    const cy = Math.floor(yScale(d.complexity) / cellSize);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) {
      grid.set(key, d);  // Only one card per grid cell
    }
  }

  return Array.from(grid.values());
}
function tagZoomKeyPoints(data, xScale, yScale, cellSize = 6) {
  const zoomKeys = downsamplePoints(data, xScale, yScale, cellSize);
  const keepSet = new Set(zoomKeys.map(d => d.name)); // or d.id if more unique
  data.forEach(d => {
    d.isZoomKey = keepSet.has(d.name);
  });
  return data;
}


let globalDots = null;

function mouseoverFn(event, d) {
  d3.select("#tooltip").style("display", "block")
    .html(`
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <img src="${d.tooltip_image}" alt="${d.name}" width="200" style="border-radius: 4px; box-shadow: 0 0 4px rgba(0,0,0,0.5);" />
        <div>
          <strong>${d.name}</strong><br>
          Complexity: ${d.complexity}<br>
          EDH Rank: ${d.edhrec_rank || "N/A"}<br>
          Supertypes: ${d.supertype}<br>
          Type: ${d.type}<br>
          Subtype: ${d.subtype}<br>
          Colors: ${d.color_identity}<br>
          Avg Price: ${d.was_price_invalid ? "NaN" : "$" + d.avg_price.toFixed(3)}<br>
          All Sets: ${d.all_sets.map(set => `${set.name} (${set.type})`).join("<br>")}<br>
          Number of Prints: ${d.all_print_images.length}<br>
        </div>
      </div>
    `);
}

function mousemoveFn(event) {
  const tooltipNode = d3.select("#tooltip").node();
  const tooltipWidth = tooltipNode.offsetWidth;
  const padding = 10;
  let left = event.pageX + padding;
  if (left + tooltipWidth > window.innerWidth) {
    left = event.pageX - tooltipWidth - padding;
  }
  d3.select("#tooltip")
    .style("left", `${left}px`)
    .style("top", `${event.pageY + padding}px`);
}

function mouseoutFn() {
   d3.select("#tooltip").style("display", "none");
}


function clickFn(event, d) {
  const { hoveredCards } = getState();
  const isAlreadySelected = hoveredCards.some(c => c.name === d.name);
  let newHoveredCards;

  if (isAlreadySelected) {
    newHoveredCards = hoveredCards.filter(c => c.name !== d.name);
    d3.select(this).attr("stroke", "none").attr("stroke-width", null);
  } else {
    const matchingCard = actualFIlteredData.find(c => c.name === d.name);
if (matchingCard) {
  newHoveredCards = [...hoveredCards, matchingCard];
}
    d3.select(this).raise().attr("stroke", "orange").attr("stroke-width", 2.5);
  }

  updateState({ hoveredCards: newHoveredCards });

  d3.selectAll(".dots circle")
    .style("stroke", d => newHoveredCards.some(c => c.name === d.name) ? "orange" : (+d.edhrec_rank > 0 ? "none" : "black"))
    .style("stroke-width", d => newHoveredCards.some(c => c.name === d.name) ? 2.5 : (+d.edhrec_rank > 0 ? 0 : 1.2));
}


function updatePointPositions(xScale, yScale) {
  if (!globalDots) return;

  const svg = d3.select(".Scatterplot svg");
  const meta = svg.node().__scatterMeta__;
  if (!meta) return;

  const { chartWidth, chartHeight } = meta;

  globalDots
    .attr("cx", d => xScale(d.avg_price))
    .attr("cy", d => yScale(d.complexity))
    .style("display", d => {
      const cx = xScale(d.avg_price);
      const cy = yScale(d.complexity);
      const inBounds = cx >= 0 && cx <= chartWidth && cy >= 0 && cy <= chartHeight;
      const hoveredCards = getState().hoveredCards || [];
      const hoveredSet = new Set(hoveredCards.map(c => c.name));
      const showDot = currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey || hoveredSet.has(d.name);
      return (inBounds && showDot) ? null : "none";
    });
}




export function prepareScatterData(data, selectedPriceAttribute) {
  const excludedSetTypes = new Set(["promo", "funny", "memorabilia", "alchemy", "token", "minigame"]);
  const excludedSetNames = ["Arena", "Alchemy", "Digital"];
  const excludedTypes = ["Emblem", "Token"];

  const cardMap = new Map();

  for (const card of data) {
    // Skip if digital or excluded
    if (
      card.digital ||
      excludedSetTypes.has(card.set_type) ||
      excludedSetNames.some(keyword => card.set_name?.includes(keyword)) ||
      excludedTypes.includes(card.type)
    ) continue;

    // Initialize or retrieve card aggregate
    if (!cardMap.has(card.name)) {
      cardMap.set(card.name, {
        ...card,
        prices: [],
        setTypes: new Map(),
        printImages: [],
        tooltip_image: null,
        foundOriginal: false,
      });
    }

    const entry = cardMap.get(card.name);

    // Track all set types
    entry.setTypes.set(card.set_name, card.set_type);

    // Track price
    const price = isNaN(card[selectedPriceAttribute]) || card[selectedPriceAttribute] == null ? 0 : card[selectedPriceAttribute];
    if (!isNaN(card.complexity)) {
      entry.prices.push(price);
    }


    if(card.image_normal){
      entry.printImages.push(card.image_normal);
      if (!entry.foundOriginal && card.originality === "original") {
        entry.tooltip_image = card.image_normal;
        entry.foundOriginal = true;
      }

    } else if (Array.isArray(card.faces)) {
        for (const face of card.faces) {
            if(face.image_normal){
                entry.printImages.push(face.image_normal);
                if (!entry.foundOriginal && card.originality === "original") {
                    entry.tooltip_image = face.image_normal;
                    entry.foundOriginal = true;
                }
            }
        }
    }

    // Track image links for print
  }

  // Finalize values
  const result = [];
  for (const card of cardMap.values()) {
    card.all_sets = Array.from(card.setTypes.entries()).map(([name, type]) => ({ name, type }));
    card.all_print_images = card.printImages;
    card.tooltip_image = card.tooltip_image || card.image_normal;

    const sum = card.prices.reduce((a, b) => a + b, 0);
    card.avg_price = card.prices.length > 0 ? sum / card.prices.length : 0;

    card.was_price_invalid = card.avg_price <= 0;
    if (card.was_price_invalid) {
      card.avg_price = 0.001;
    }

    result.push(card);
  }

  return result;
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
const hoveredCards = getState().hoveredCards || [];
const hoveredSet = new Set(hoveredCards.map(c => c.name));

lastPriceAttribute = selectedPriceAttribute; // Store the last used price attribute
    
    d3.select(containerId).selectAll("*").remove();

   
const filteredData = data

   


    const minPrice = d3.min(filteredData, d => d.avg_price);
const maxPrice = d3.max(filteredData, d => d.avg_price);
const safeMinPrice = Math.max(0.001, minPrice);
const pricePadding = (maxPrice - safeMinPrice) * 0.01;
const paddedMinPrice = 0.0009
const paddedMaxPrice = maxPrice + pricePadding;

filteredData.forEach(d => {
    if (d.avg_price <= 0 || isNaN(d.avg_price)) {
        d.avg_price = safeMinPrice;
    }
});

    const container = d3.select(containerId).node();
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;



    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", width)
        .attr("height", height);


    const infoGroup = svg.append("g")
  .attr("class", "info-icon")
  .attr("transform", `translate(${width - 35}, 30)`);

infoGroup.append("circle")
  .attr("r", 10)
  .attr("fill", "#ccc")
  .attr("stroke", "#000");

infoGroup.append("text")
  .attr("text-anchor", "middle")
  .attr("dy", "0.35em")
  .attr("font-size", "12px")
  .attr("font-weight", "bold")
  .text("i")
  .attr("pointer-events", "none");
    



  infoGroup
  .on("mouseover", function(event) {
    d3.select("#tooltip")
      .style("display", "block")
      .html(scatterTooltipText);
  })
  .on("mousemove", function(event) {
    const tooltip = d3.select("#tooltip");
    const tooltipWidth = tooltip.node().offsetWidth;
    const tooltipHeight = tooltip.node().offsetHeight;

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
      .style("top", `${y}px`);
  })
  .on("mouseout", function() {
    d3.select("#tooltip").style("display", "none");
  });

    const g = svg.append("g").attr("transform", `translate(${margin.left - 8.5}, ${margin.top})`);

const originalXScale = d3.scaleLog()
    .domain([
        paddedMinPrice,
        paddedMaxPrice
    ])
    .range([0, chartWidth]);

    

        const minComplexity = d3.min(filteredData, d => d.complexity);
        const maxComplexity = d3.max(filteredData, d => d.complexity);
        const yPadding = (maxComplexity - minComplexity) * 0.01; 
        
        const originalYScale = d3.scaleLinear()
            .domain([minComplexity - yPadding, maxComplexity + yPadding])
            .range([chartHeight, 0]);
        



    const xScale = originalXScale.copy();
    const yScale = originalYScale.copy();

    tagZoomKeyPoints(filteredData, xScale, yScale);
    actualFIlteredData = filteredData; // Store the actual filtered data for updates
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

        const brushedCards = filteredData.filter(d => {
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



    //brushOverlay.call(brush).lower();
    let fullData = filteredData;



const visibleData = filteredData
    const dots = gClip.selectAll("circle")
    .data(visibleData, d => d.name)
  .join("circle")
  .attr("cx", d => xScale(d.avg_price))
  .attr("cy", d => yScale(d.complexity))
  .attr("r", 2.5)
  .style("cursor", "pointer")
  .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
  .style("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
  .style("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)
  .attr("opacity", 0.8)
  .style("display", d =>(currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey || hoveredSet.has(d.name)) ? null : "none");

    filteredData.forEach((d, i) => {
        if (isNaN(d.avg_price) || d.avg_price <= 0 || typeof d.avg_price !== 'number') {
        }
    });


    console.log(gClip.selectAll("circle").size(), "dots size");
    globalDots = dots;


    console.log(globalDots.size(), "globalDots size");
    updatePointPositions(xScale, yScale);


    const tooltip = d3.select("#tooltip");
    let hoverTimeout = null;


    dots.on("mouseover", mouseoverFn)
        .on("mousemove", mousemoveFn)
        .on("mouseout", mouseoutFn)
        .on("click", clickFn);

        
        
        

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
  .style("shape-rendering", "crispEdges")
  .attr("fill", "#000")
  .style("font-size", "12px")
  .style("font-weight", "bold");

  

colorGroups.forEach((group, i) => {
  const entry = legend.append("g")
    .attr("transform", `translate(0, ${(i + 1) * (legendItemHeight + legendSpacing)})`);

  entry.append("rect")
    .attr("width", 18)
    .attr("height", legendItemHeight)
    .style("shape-rendering", "crispEdges")
    .attr("fill", group.color)
    .attr("stroke", "#000");

  entry.append("text")
    .attr("x", 26)
    .attr("y", legendItemHeight / 2)
    .attr("dy", "0.35em")
    .style("shape-rendering", "crispEdges")
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
  .style("shape-rendering", "crispEdges")
  .text("No Rank")
  .style("font-size", "12px")
  .attr("fill", "#000");


        
        


    let zoomTimeout = null;
    const ZOOM_DELAY =0; 


    const zoom = d3.zoom()
        .scaleExtent([1, 24])
        .on("zoom", event => {


    const transform = event.transform;
    currentZoomLevel = transform.k;

    const newX = transform.rescaleX(originalXScale);
    const newY = transform.rescaleY(originalYScale);

    xScale.domain(newX.domain());
    yScale.domain(newY.domain());

    updateAxes(symbol);



    const nowZoomedOut = transform.k < ZOOM_THRESHOLD;

if (nowZoomedOut !== lastZoomedOut) {
  const newVisible = actualFIlteredData

  console.log(newVisible.length, "newVisible length");
gClip.selectAll("circle")
  .data(newVisible, d => d.name)
  .join(
    enter => styleAndBindDots(enter.append("circle")),
    update => styleAndBindDots(update),
    exit => exit.remove()
  )
  .attr("cx", d => xScale(d.avg_price))
  .attr("cy", d => yScale(d.complexity));

  lastZoomedOut = nowZoomedOut;
}

globalDots = gClip.selectAll("circle");

// Always update positions (even if no redraw)
updatePointPositions(xScale, yScale);


});



        svg.call(zoom);

        if (savedTransform) {
            svg.call(zoom.transform, savedTransform);
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

svg.node().__scatterMeta__ = {
  chartWidth,
  chartHeight
};


    function resetZoom() {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    }

    d3.select("#reset-button").on("click", resetZoom);
}

export function updateScatterPlot(filteredData, selectedPriceAttribute = "price_eur") {

  console.log("Updating scatter plot...");
  const hoveredCards = getState().hoveredCards || [];
const hoveredSet = new Set(hoveredCards.map(c => c.name));

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

    const gClip = svg.select(".dots .clip-group");



    const newMaxPrice = d3.max(filteredData, d => d.avg_price);

if (selectedPriceAttribute !== lastPriceAttribute) {
  // Recalculate full domain (min + max) if price attribute changed
  const newMinPrice = Math.max(0.001, d3.min(filteredData, d => d.avg_price));
  originalXScale.domain([newMinPrice, newMaxPrice]);
  lastPriceAttribute = selectedPriceAttribute;
} else {
  // Otherwise, keep old min and only update max
  const currentMin = originalXScale.domain()[0];
  originalXScale.domain([currentMin, newMaxPrice]);
}



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

    
    filteredData.forEach(d => delete d.isZoomKey);

    console.log(filteredData.length, "filteredData length");
    tagZoomKeyPoints(filteredData, xScale, yScale);
actualFIlteredData = filteredData; // Update the actual filtered data

console.log(gClip.selectAll("circle").size(), "before removing circles");
  gClip.selectAll("circle").remove();
console.log(gClip.selectAll("circle").size(), "after removing circles");
// ✨ Bind new data and create fresh dots
const dots = gClip.selectAll("circle")
  .data(filteredData, d => d.name)
  .enter()
  .append("circle")
  .attr("r", 2.5)
  .style("cursor", "pointer")
  .attr("opacity", 0.8)
  .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
  .style("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
  .style("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)
  .style("display", d => (currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey || hoveredSet.has(d.name)) ? null : "none")
  .attr("cx", d => xScale(d.avg_price))
  .attr("cy", d => yScale(d.complexity))
  .on("mouseover", mouseoverFn)
  .on("mousemove", mousemoveFn)
  .on("mouseout", mouseoutFn)
  .on("click", clickFn);



    globalDots = gClip.selectAll("circle");
    updatePointPositions(xScale, yScale);


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





