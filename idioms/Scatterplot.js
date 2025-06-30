
import { updateState, getState } from "../state.js";
import { emitHoverCard, emitClearHover,
          onSetHover, onClearSetHover, onRectHover, onClearRectHover,onClearLineYearHover, onLineYearHover, 
          onAlluvialHover, onClearAlluvialHover, onAlluvialClick, onAlluvialLinkClick, onIcicleClick, onLineChartClick,
          onTimelineSetClick, onYearClick} from "./Events.js";
import { getEffectivePriceAttribute } from "../script.js"; 
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

function updateSelectedHoverClass() {
  const hoveredCards = getState().hoveredCards || [];
  const hoveredMap = new Map(hoveredCards.map(c => [c.name, c]));
  const updatedNames = new Set(hoveredCards.map(c => c.name));
  applySelectedHoverClass(hoveredMap, updatedNames);
}

function applySelectedHoverClass(hoveredMap, updatedNames) {
  const t0 = performance.now();
  const dots = d3.selectAll(".dots circle")
    .filter(d => updatedNames.has(d.name));
  const t1 = performance.now();

  dots.classed("selected-hover", d => hoveredMap.has(d.name));
  const t2 = performance.now();

  // console.log(`[Perf] applySelectedHoverClass:
  //   • Select & filter dots: ${(t1 - t0).toFixed(2)} ms
  //   • Apply class toggle:   ${(t2 - t1).toFixed(2)} ms
  //   • TOTAL:                ${(t2 - t0).toFixed(2)} ms`);
}


const scatterTooltipText = `
<strong>Scatterplot Interactions:</strong><br>
• <strong>Hover on dots</strong>: view card details and highlight related data across views.<br>
• <strong>Click</strong>: toggle persistent highlight.<br>
• <strong>Brush</strong>: multi-select/deselect cards.<br>
• <strong>Hover on labels</strong>: view tooltip explanation.<br>
• <strong>Scroll</strong>: Zoom in/out.<br>
• <strong>Moving mouse while holding right-click</strong>: Panning<br>
`;

onAlluvialClick(({ category, value }) => {
  const dots = d3.selectAll(".dots circle").nodes();
  const hoveredMap = new Map(getState().hoveredCards?.map(c => [c.name, c]) || []);

  dots.forEach(el => {
    const d = d3.select(el).datum();
    const matches =
      category === "Originality"
        ? d.all_originalities?.includes(value)
        : d.rarity?.toLowerCase() === value;

    if (matches) {
      hoveredMap.set(d.name, d);
    }
  });

  updateState({ hoveredCards: Array.from(hoveredMap.values()), isHoverUpdate: true });
  updateSelectedHoverClass();
});
onYearClick(({ year }) => {

  console.log(year)
  const hoveredMap = new Map((getState().hoveredCards || []).map(c => [c.name, c]));

  d3.selectAll(".dots circle").each(function(card) {
    const cardYear = new Date(card.release_date).getFullYear().toString();
    if (cardYear === year) {
      hoveredMap.set(card.name, card);
    }
  });

  updateState({ hoveredCards: Array.from(hoveredMap.values()), isHoverUpdate: true });
  updateSelectedHoverClass();
});

onTimelineSetClick(setInfo => {
  const hoveredMap = new Map((getState().hoveredCards || []).map(c => [c.name, c]));

  d3.selectAll(".dots circle").each(function(card) {
    if ((card.set_name || "").toLowerCase() === setInfo.name.toLowerCase()) {
      hoveredMap.set(card.name, card);
    }
  });

  updateState({ hoveredCards: Array.from(hoveredMap.values()), isHoverUpdate: true });
  updateSelectedHoverClass();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  const dots = d3.selectAll(".dots circle").nodes();
  const hoveredMap = new Map(getState().hoveredCards?.map(c => [c.name, c]) || []);

  dots.forEach(el => {
    const d = d3.select(el).datum();
    if (
      d.rarity?.toLowerCase() === rarity &&
      d.all_originalities?.includes(originality)
    ) {
      hoveredMap.set(d.name, d);
    }
  });

  updateState({ hoveredCards: Array.from(hoveredMap.values()), isHoverUpdate: true });
  updateSelectedHoverClass();
});

onIcicleClick(({ colorIdentity }) => {
  const hovered = getState().hoveredCards || [];
  const hoveredMap = new Map(hovered.map(c => [c.name, c]));

  d3.selectAll(".dots circle").each(function(d) {
    const identityKey = d.color_identity?.length
      ? d.color_identity.slice().sort().join("")
      : "colorless";
    
    if (identityKey.toLowerCase() === colorIdentity) {
      hoveredMap.set(d.name, d);
    }
  });

  const newHoveredCards = Array.from(hoveredMap.values());
  updateState({ hoveredCards: newHoveredCards, isHoverUpdate: true });
  updateSelectedHoverClass();
});

onLineChartClick(({ year }) => {
  const hovered = getState().hoveredCards || [];
  const hoveredMap = new Map(hovered.map(c => [c.name, c]));

  d3.selectAll(".dots circle").each(function(card) {
    const cardYear = new Date(card.release_date).getFullYear().toString();
    if (cardYear === year) {
      hoveredMap.set(card.name, card);
    }
  });

  updateState({ hoveredCards: Array.from(hoveredMap.values()), isHoverUpdate: true });
  updateSelectedHoverClass();
});

onSetHover(setInfo => {

  highlightScatterDotsFromSet(setInfo.name);
})

onClearSetHover(() => {
  clearScatterHoverOnly();
})

onLineYearHover(yearInfo => {

  highlightScatterDotsFromYear(yearInfo.year)
})

onClearLineYearHover(() => {
  clearScatterHoverOnly();
})

onRectHover(rectInfo => {
  highlightScatterDotsFromIcicle(rectInfo);
})

onClearRectHover(() => {
  clearScatterHoverOnly();
})

onAlluvialHover(({ category, value }) => {
  highlightScatterDotsFromAlluvial(category, value);
});

onClearAlluvialHover(() => {
  clearScatterHoverOnly();
});

export function hoverOnlyHighlightCard(card) {
  emitHoverCard(card);
  
  // Add others if needed
}

export function clearHoverOnlyHighlight() {
  emitClearHover();
  // Add others if needed
}


function getColorIdentityBackground(colorIdentity) {
  if (!Array.isArray(colorIdentity) || colorIdentity.length === 0) return "#888";

  const colorMap = {
    W: "#f6f1d5",
    U: "#b3d9ff",
    R: "#f8b3a0",
    B: "#c8b4c0",
    G: "#b6d7b3",
  };

  const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

  // Sort identity based on defined order
  const sorted = [...colorIdentity].sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b]);
  const colors = sorted.map(c => colorMap[c]).filter(Boolean);

  if (colors.length === 1) {
    return colors[0];
  } else {
    const step = 100 / (colors.length - 1);
    const stops = colors.map((color, i) => `${color} ${i * step}%`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }
}
function getXValue(d) {
  return xMetric === "avg_price"
    ? d.avg_price
    : new Date(d.release_date);
}

function updateXMetricScale() {
    const svg = d3.select(".Scatterplot svg");
    const meta = svg.node().__scatterMeta__;
    const {
        xScale,
        yScale, 
        xAxisG,
        updateAxes,
        originalXScale
    } = svg.node().__scales__;

    const data = actualFIlteredData;
    if (!meta || !data) return;

    const { chartWidth } = meta;

    if (xMetric === "avg_price") {
        const newMin = Math.max(0.001, d3.min(data, d => d.avg_price));
        const newMax = d3.max(data, d => d.avg_price);
        originalXScale.domain([newMin, newMax]);
        xScale.domain([newMin, newMax]);
} else {
    const validDates = data
      .map(d => new Date(d.release_date))
      .filter(d => d instanceof Date && !isNaN(d));

    if (validDates.length > 0) {
        const timeScale = d3.scaleTime()
            .domain(d3.extent(validDates))
            .range([10, chartWidth]);

        // 🟡 Overwrite both the xScale and the originalXScale with time scale
        originalXScale.domain(timeScale.domain());
        originalXScale.range(timeScale.range());

        xScale.domain(timeScale.domain());
        xScale.range(timeScale.range());
    }
}

  data.forEach(d => delete d.isZoomKey);
  tagZoomKeyPoints(data, xScale, yScale);
    svg.select(".x-axis-label").text(getXLabelText());

    updateAxes(getSymbolFromAttribute(lastPriceAttribute));
    updatePointPositions(xScale, yScale);
}



const ZOOM_THRESHOLD = 6;
let currentZoomLevel = 1;
let wasZoomedOut = true;  
let isShowingFullData = false;
let initialDownsampledData = null;
let lastZoomedOut = currentZoomLevel < ZOOM_THRESHOLD;
let actualFIlteredData = null; // Store the actual filtered data for updates
    let isBrushing = false;
let brushOverlay = null;
let zoom = null;
let brush = null;
let shiftPressed = false;
let lastPriceAttribute = null;
let xMetric = "avg_price";


function getXLabelText() {
    if (xMetric === "release_date") return "Release Date";
    if (lastPriceAttribute?.includes("eur")) return "Avg Price (€)";
    if (lastPriceAttribute?.includes("thx")) return "Avg Price";
    return "Avg Price ($)";
}
function styleAndBindDots(selection) {
  return selection
    .attr("r", 2.5)
    .style("cursor", "pointer")
    .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
    .attr("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
    .attr("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)
    .attr("opacity", 0.8)
    .on("mouseover", mouseoverFn)
    .on("mousemove", mousemoveFn)
    .on("mouseout", mouseoutFn)
    .on("click", clickFn);
}




function tagZoomKeyPoints(data, xScale, yScale, cellSize = 6) {
  const grid = new Map();

  for (const d of data) {
    const cx = Math.floor(xScale(getXValue(d)) / cellSize);
    const cy = Math.floor(yScale(d.complexity) / cellSize);
    const key = `${cx},${cy}`;
    
    d.__x = cx * cellSize;  // optionally cache scaled pos
    d.__y = cy * cellSize;
    
    if (!grid.has(key)) {
      grid.set(key, true);
      d.isZoomKey = true;
    } else {
      d.isZoomKey = false;
    }
  }

  return data;
}


let globalDots = null;

function mouseoverFn(event, d) {
  const symbol = getSymbolFromAttribute(getEffectivePriceAttribute(getState()));
  d3.select("#tooltip").style("display", "block")
    .style("background", getColorIdentityBackground(d.color_identity))
    .style("color", "black")
    .html(`
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <img src="${d.tooltip_image}" alt="${d.name}" width="200" style="border-radius: 4px; box-shadow: 0 0 4px rgba(0,0,0,0.5);" />
        <div>
          <strong>${d.name}</strong><br>
          Release Date: ${d.release_date}<br>
          Complexity: ${d.complexity}<br>
          EDH Rank: ${d.edhrec_rank || "N/A"}<br>
          Supertypes: ${d.supertype}<br>
          Type: ${d.type}<br>
          Subtype: ${d.subtype}<br>
          Colors: ${d.color_identity.join("")}<br>
          Avg Price: ${symbol}${d.avg_price.toFixed(3)}<br>
          All Sets: ${d.all_sets.map(set => `${set.name} (${set.type})`).join("<br>")}<br>
          Number of Prints: ${d.all_print_images.length}<br>
        </div>
      </div>
    `);
  hoverOnlyHighlightCard(d);
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

function mouseoutFn(event, d) {
   d3.select("#tooltip").style("display", "none")
   .style("background", null)
   .style("color", null);
  clearHoverOnlyHighlight();
}


function clickFn(event, d) {
  const hoveredCards = getState().hoveredCards || [];
  const index = hoveredCards.findIndex(c => c.name === d.name);

  let newHoveredCards;
  if (index !== -1) {
    // Remove card
    newHoveredCards = [...hoveredCards.slice(0, index), ...hoveredCards.slice(index + 1)];
    d3.select(this).classed("selected-hover", false);
  } else {
    // Add card
    newHoveredCards = [...hoveredCards, d];
    d3.select(this).classed("selected-hover", true);
  }

  updateState({ hoveredCards: newHoveredCards, isHoverUpdate: true });
}


function updatePointPositions(xScale, yScale) {
  if (!globalDots) return;

  const svg = d3.select(".Scatterplot svg");
  const meta = svg.node().__scatterMeta__;
  if (!meta) return;

  const { chartWidth, chartHeight } = meta;

  globalDots
    .attr("cx", d => xScale(getXValue(d)))
    .attr("cy", d => yScale(d.complexity))
     .style("display", function(d) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      const inBounds = cx >= 0 && cx <= chartWidth && cy >= 0 && cy <= chartHeight;
      const hoveredCards = getState().hoveredCards || [];
      const hoveredSet = new Set(hoveredCards.map(c => c.name));
      const el = d3.select(this);
      const showDot =  el.classed("hover-temp") || currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey || hoveredSet.has(d.name);
      return (inBounds && showDot) ? null : "none";
    });
}




export function prepareScatterData(data, selectedPriceAttribute) {
  const excludedSetTypes = new Set([ "memorabilia", "alchemy", "token"]);
  const excludedSetNames = ["Arena", "Alchemy", "Digital"];
  const excludedTypes = [];

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
        all_years: new Set(), 
        all_originalities: new Set(),
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



if (card.release_date) {
  const releaseDate = new Date(card.release_date);
  const year = releaseDate.getFullYear();

  if (!isNaN(year)) {
    entry.all_years.add(year);

    // Track the earliest release date across all prints
    if (!entry.earliest_release_date || releaseDate < new Date(entry.earliest_release_date)) {
      entry.earliest_release_date = releaseDate; // Store as YYYY-MM-DD string
    }
  }
}
    if (card.originality) {
  entry.all_originalities.add(card.originality.toLowerCase());
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
     card.all_years = Array.from(card.all_years);
    card.all_originalities = Array.from(card.all_originalities);
    card.all_print_images = card.printImages;
    card.tooltip_image = card.tooltip_image || card.image_normal;

    const sum = card.prices.reduce((a, b) => a + b, 0);
    card.avg_price = card.prices.length > 0 ? sum / card.prices.length : 0;
    card.release_date = card.earliest_release_date || card.release_date;
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





    const container = d3.select(containerId).node();
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 35, right: 14, bottom: 35, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;



    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", width)
        .attr("height", height);


    d3.select(containerId)
  .on("contextmenu", event => event.preventDefault());



  const iconX = width * 0.97;
  const iconY = height * 0.07;
  const iconRadius = width*0.93 * 0.015;
  const infoTextSize = Math.min(width * 0.0187, 15);
  const infoGroup = svg.append("g")
  .attr("class", "info-icon")
  .attr("transform", `translate(${iconX},${iconY} )`);

infoGroup.append("circle")
  .attr("r", iconRadius)
  .attr("fill", "#8A9CE4")
  .attr("stroke", "#fff");


infoGroup.append("text")
  .attr("text-anchor", "middle")
  .attr("dy", "0.35em")
  .attr("font-size", `${infoTextSize}px`)
  .attr("font-weight", "bold")
  .attr("fill","#fff")
  .text("?")
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
        minPrice,
        maxPrice
    ])
    .range([10, chartWidth]);

    

        const minComplexity = d3.min(filteredData, d => d.complexity);
        const maxComplexity = d3.max(filteredData, d => d.complexity);
        const yPadding = (maxComplexity - minComplexity) * 0.01; 
        
        const originalYScale = d3.scaleLinear()
            .domain([minComplexity - yPadding, maxComplexity + yPadding])
            .range([chartHeight, 5]);
        



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

const formatPrice = d => `${symbol}${d.toFixed(3)}`;

if (xMetric === "avg_price") {
    xAxisG.call(d3.axisBottom(xScale).tickValues(ticks).tickFormat(formatPrice));
} else {
    xAxisG.call(d3.axisBottom(xScale).ticks(12).tickFormat(d3.timeFormat("%b %Y")));
}
    yAxisG.call(d3.axisLeft(yScale).ticks(numTicks));
}



    updateAxes(symbol);


    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + chartWidth / 2)
        .attr("y", height - 5)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("cursor", "pointer")
        .text(getXLabelText())
        .on("mouseover", (event) => {
          d3.select("#tooltip")
            .style("display", "block")
            .html(() => {
              if (xMetric === "release_date") {
                return "Cards are positioned along the X-axis by their <b>release date</b>.";
              }
              if (selectedPriceAttribute.includes("eur")) return "Cards are positioned by <b>average price</b> (EUR, from Cardmarket).";
              if (selectedPriceAttribute.includes("usd")) return "Cards are positioned by <b>average price</b> (USD, from TCGplayer).";
              if (selectedPriceAttribute.includes("thx")) return "Cards are positioned by <b>average price</b> (from Scryfall).";
              return "Cards are positioned by <b>average price</b>.";
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
        })
        .on("click", () => {
          xMetric = (xMetric === "avg_price") ? "release_date" : "avg_price";
          updateXMetricScale();
      });

        
        svg.append("foreignObject")
  .attr("x", 3 ) // Adjust as needed
  .attr("y", 0)
  .attr("width", 120)
  .attr("height", 30)
  .append("xhtml:div")
  .html(`
    <select id="xMetricDropdown" style="font-size:12px; padding:2px;">
      <option value="avg_price">Average Price</option>
      <option value="release_date">Release Date</option>
    </select>
  `);

  const dropdown = document.getElementById("xMetricDropdown");
if (dropdown) {
  dropdown.value = xMetric; // Reflect current state
  dropdown.addEventListener("change", function () {
    xMetric = this.value;
    updateXMetricScale(); // Already updates domain, axis, and point positions
  });
   dropdown.addEventListener("mouseover", (event) => {
    d3.select("#tooltip")
      .style("display", "block")
      .html("Change X-axis value");
  });

  dropdown.addEventListener("mousemove", (event) => {
    const tooltip = d3.select("#tooltip");
    const tooltipWidth = tooltip.node().offsetWidth;
    const tooltipHeight = tooltip.node().offsetHeight;
    const padding = 10;

    let x = event.pageX + padding;
    let y = event.pageY + padding;

    if (x + tooltipWidth > window.innerWidth) {
      x = event.pageX - tooltipWidth - padding;
    }
    if (y + tooltipHeight > window.innerHeight) {
      y = event.pageY - tooltipHeight - padding;
    }

    tooltip
      .style("left", `${x}px`)
      .style("top", `${y}px`);
  });

  dropdown.addEventListener("mouseout", () => {
    d3.select("#tooltip").style("display", "none");
  });
}

        svg.append("text")
    .attr("class", "y-axis-label")
    .attr("x", margin.left-15)
    .attr("y", margin.top )
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
  const t0 = performance.now();

  svg.call(zoom); // Re-enable zoom
  if (!event.selection) return;

  const [[x0, y0], [x1, y1]] = event.selection;

  const t1 = performance.now();
  // Collect brushed cards by name
  const brushedNames = new Set();
  for (const d of filteredData) {
    const cx = xScale(getXValue(d));
    const cy = yScale(d.complexity);
    if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
      brushedNames.add(d.name);
    }
  }

  const t2 = performance.now();
  const hoveredCards = getState().hoveredCards || [];
  const hoveredNames = new Set(hoveredCards.map(c => c.name));
  const hoveredMap = new Map(hoveredCards.map(c => [c.name, c]));

  const actualCardMap = new Map(actualFIlteredData.map(c => [c.name, c]));

for (const name of brushedNames) {
  if (hoveredMap.has(name)) {
    hoveredMap.delete(name);
  } else {
    const match = actualCardMap.get(name);
    if (match) hoveredMap.set(name, match);
  }
}

  const t3 = performance.now();
  const newHoveredCards = Array.from(hoveredMap.values());
  updateState({ hoveredCards: newHoveredCards, isHoverUpdate: true });

  const t4 = performance.now();
  const updatedNames = new Set([...brushedNames, ...hoveredNames]);
  applySelectedHoverClass(hoveredMap, updatedNames);

  const t5 = performance.now();

  brushOverlay.call(brush.move, null); // Clear brush selection

  const t6 = performance.now();

  // console.log(`Brush Interaction Timing:
  //   • Extract selection bounds:       ${(t1 - t0).toFixed(2)} ms
  //   • Collect brushed names:          ${(t2 - t1).toFixed(2)} ms
  //   • Toggle brushed cards:           ${(t3 - t2).toFixed(2)} ms
  //   • Update state:                   ${(t4 - t3).toFixed(2)} ms
  //   • Apply selected hover class:     ${(t5 - t4).toFixed(2)} ms
  //   • Clear brush selection:          ${(t6 - t5).toFixed(2)} ms
  //   • TOTAL:                          ${(t6 - t0).toFixed(2)} ms
  // `);
})





    brushOverlay.call(brush).lower();
    let fullData = filteredData;



const visibleData = filteredData
    const dots = gClip.selectAll("circle")
    .data(visibleData, d => d.name)
  .join("circle")
  .attr("cx", d => xScale(getXValue(d)))
  .attr("cy", d => yScale(d.complexity))
  .attr("class", d => `dots ci-${d.color_identity.join("")}`)
  .attr("r", 2.5)
  .style("cursor", "pointer")
  .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
  .attr("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
  .attr("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)
  .attr("opacity", 0.8)
  .style("display", d =>(currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey || hoveredSet.has(d.name)) ? null : "none");

    filteredData.forEach((d, i) => {
        if (isNaN(d.avg_price) || d.avg_price <= 0 || typeof d.avg_price !== 'number') {
        }
    });


    
    globalDots = dots;


    
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


  zoom = d3.zoom()
  .scaleExtent([1, 24])
  .translateExtent([[0, 0], [chartWidth, chartHeight]])
  .extent([[0, 0], [chartWidth, chartHeight]])
  .filter(event => {
    
    if (event.type === "wheel") return true;

    
    if (event.type === "mousedown" && event.button === 2) return true;

    return false;
  })
  .on("zoom", event => {
    applyZoomTransform(event.transform);
  });




function applyZoomTransform(transform) {
  currentZoomLevel = transform.k;

  const { xScale, yScale, updateAxes, originalXScale, originalYScale } = d3.select(".Scatterplot svg").node().__scales__;

  // 🔁 Dynamically create correct scale for zooming
  let baseXScale;
  if (xMetric === "avg_price") {
    baseXScale = d3.scaleLog()
      .domain(originalXScale.domain())
      .range(originalXScale.range());
  } else {
    baseXScale = d3.scaleTime()
      .domain(originalXScale.domain())
      .range(originalXScale.range());
  }

  const newX = transform.rescaleX(baseXScale);
  const newY = transform.rescaleY(originalYScale);

  xScale.domain(newX.domain());
  yScale.domain(newY.domain());

  updateAxes(getSymbolFromAttribute(lastPriceAttribute));

  const shouldShowDot = d => (currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey || getState().hoveredCards?.some(c => c.name === d.name));

  const gClip = d3.select(".clip-group");

  gClip.selectAll("circle")
    .attr("cx", d => xScale(getXValue(d)))
    .attr("cy", d => yScale(d.complexity))
    .style("display", d => shouldShowDot(d) ? null : "none");

  globalDots = gClip.selectAll("circle");
}



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



let baseXScale;
if (xMetric === "avg_price") {
  const newMin = Math.max(0.001, d3.min(filteredData, d => d.avg_price));
  const newMax = d3.max(filteredData, d => d.avg_price);
  originalXScale.domain([newMin, newMax]);
  baseXScale = d3.scaleLog()
    .domain(originalXScale.domain())
    .range(originalXScale.range());
} else {
  const validDates = filteredData
    .map(d => new Date(d.release_date))
    .filter(d => d instanceof Date && !isNaN(d));

  const [minDate, maxDate] = d3.extent(validDates);
  originalXScale.domain([minDate, maxDate]);
  baseXScale = d3.scaleTime()
    .domain(originalXScale.domain())
    .range(originalXScale.range());
}




 const transform = d3.zoomTransform(svg.node());
xScale.domain(transform.rescaleX(baseXScale).domain());


    const symbol = getSymbolFromAttribute(selectedPriceAttribute);
    updateAxes(symbol);

    svg.select(".x-axis-label")
        .text(() => {
            if (selectedPriceAttribute.includes("eur")) return "Avg Price (€)";
            if (selectedPriceAttribute.includes("thx")) return "Avg Price";
            return "Avg Price ($)";
        });

    
    filteredData.forEach(d => delete d.isZoomKey);

    
    tagZoomKeyPoints(filteredData, xScale, yScale);
actualFIlteredData = filteredData; // Update the actual filtered data


  gClip.selectAll("circle").remove();

// ✨ Bind new data and create fresh dots
const dots = gClip.selectAll("circle")
  .data(filteredData, d => d.name)
  .enter()
  .append("circle")
  .attr("class", d => `dots ci-${d.color_identity.join("")}`)
  .attr("r", 2.5)
  .style("cursor", "pointer")
  .attr("opacity", 0.8)
  .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
  .attr("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
  .attr("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)
  .style("display", d => (currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey || hoveredSet.has(d.name)) ? null : "none")
  .attr("cx", d => xScale(getXValue(d)))
  .attr("cy", d => yScale(d.complexity))
  .on("mouseover", mouseoverFn)
  .on("mousemove", mousemoveFn)
  .on("mouseout", mouseoutFn)
  .on("click", clickFn);



    globalDots = gClip.selectAll("circle");
    updatePointPositions(xScale, yScale);


updateSelectedHoverClass();
}

export function highlightScatterDotsFromSet(setName) {

  d3.select(".Scatterplot").selectAll(".dots circle")
    .each(function(d) {
  if (d.all_sets?.some(s => s.name === setName)) {
    
    d3.select(this).classed("hover-temp", true);
  }
});
const svg = d3.select(".Scatterplot svg");
const { xScale, yScale } = svg.node().__scales__;
updatePointPositions(xScale, yScale);
}

function highlightScatterDotsFromIcicle(rectInfo) {
const [targetIdentity] = [...rectInfo.colorIdentities];


  d3.selectAll(`.dots.ci-${targetIdentity}`).classed("hover-temp", true);

  // const svg = d3.select(".Scatterplot svg");
  // const { xScale, yScale } = svg.node().__scales__ || {};
  // if (xScale && yScale) updatePointPositions(xScale, yScale);
}


export function highlightScatterDotsFromYear(year) {
  const targetYear = year.getFullYear();
  d3.select(".Scatterplot").selectAll(".dots circle")
    .each(function(d) {
      if (d.all_years?.includes(targetYear)) {
        d3.select(this).classed("hover-temp", true);
      }
    });

  // const svg = d3.select(".Scatterplot svg");
  // const { xScale, yScale } = svg.node().__scales__ || {};
  // if (xScale && yScale) updatePointPositions(xScale, yScale);
}


function highlightScatterDotsFromAlluvial(category, value) {
  const lowerVal = value.toLowerCase();

  d3.select(".Scatterplot").selectAll(".dots circle")
    .each(function(d) {
      if (category === "Originality" && d.all_originalities?.includes(lowerVal)) {
        d3.select(this).classed("hover-temp", true);
      } else if (category === "Rarity" && d.rarity?.toLowerCase() === lowerVal) {
        d3.select(this).classed("hover-temp", true);
      }
    });

  // const svg = d3.select(".Scatterplot svg");
  // const { xScale, yScale } = svg.node().__scales__ || {};
  // if (xScale && yScale) updatePointPositions(xScale, yScale);
}
export function clearScatterHoverOnly() {
  d3.selectAll(".dots circle").classed("hover-temp", false);

  const svg = d3.select(".Scatterplot svg");
  const { xScale, yScale } = svg.node().__scales__ || {};
  if (xScale && yScale) {
    updatePointPositions(xScale, yScale);
  }
}


