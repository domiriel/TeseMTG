
import { updateState, getState } from "../state.js";
import { emitHoverCard, emitClearHover,
          onSetHover, onClearSetHover, onRectHover, onClearRectHover,onClearLineYearHover, onLineYearHover, onNumColorsHover, onClearNumColorsHover, emitScatterplotCards, emitScatterplotBrush, emitClearScatterplotBrush, 
          onAlluvialHover, onClearAlluvialHover, onAlluvialClick, onAlluvialLinkClick, onIcicleClick, onLineChartClick, onIcicleNumClick,onCardSearch, onClearAlluvialSelections,onClearIcicleSelections,
          onTimelineSetClick, onYearClick, onAlluvialLinkHover, onClearAlluvialLinkHover, onLineChartBrush, onClearLineChartBrush, onSetTypeHover, onTimelineSetTypeClick, onTimelineBrush, onClearTimelineBrush} from "./Events.js";
import { getEffectivePriceAttribute } from "../script.js"; 
const colorGroups = [
    { range: [1, 5691], color: "#594A3A" },  
    { range: [5692, 11382], color:  "#736659" },
    { range: [11383, 17074], color: "#998066" },
    { range: [17075, 22765], color: "#b8997a"},
    { range: [22766, 28456], color: "#ceb397" }  
];

const activeSelections = {
  originalities: new Set(),
  rarities: new Set(),
  colorIdentities: new Set(),
  numColors: new Set(),
  years: new Set(),
  sets: new Set(),
  setTypes: new Set(),
  cards: new Map()
};

onClearAlluvialSelections(() => {
  activeSelections.originalities.clear();
  activeSelections.rarities.clear();
  applySelectionToScatter();
});

onClearIcicleSelections(() => {
  activeSelections.colorIdentities.clear();
  activeSelections.numColors.clear();
  applySelectionToScatter();
});

function getCardsMatchingActiveSelections(data) {
  let result = data;

  if (activeSelections.originalities.size > 0) {
    result = result.filter(card =>
      card.all_originalities?.some(orig =>
        activeSelections.originalities.has(orig)
      )
    );
  }

  if (activeSelections.rarities.size > 0) {
    result = result.filter(card =>
      activeSelections.rarities.has(card.rarity?.toLowerCase())
    );
  }

  if (activeSelections.colorIdentities.size > 0) {
    result = result.filter(card => {
      const identityKey = card.color_identity?.join("") || "Colorless";
      return activeSelections.colorIdentities.has(identityKey);
    });
  }
  if (activeSelections.numColors.size > 0) {
    result = result.filter(card =>
      activeSelections.numColors.has(card.color_identity?.length || 0)
    );
  }
  if (activeSelections.years.size > 0) {
    result = result.filter(card => {
      const year = new Date(card.release_date).getFullYear();
      return activeSelections.years.has(year);
    });
  }
  if (activeSelections.sets.size > 0) {
    result = result.filter(card =>
      card.all_sets?.some(s => activeSelections.sets.has(s.name))
    );
  }
  if (activeSelections.setTypes.size > 0) {
    result = result.filter(card =>
      card.all_set_types?.some(type =>
        activeSelections.setTypes.has(type.toLowerCase())
      )
    );
  }
  return result;
}

function applySelectionToScatter() {
  const hasAnySelection = Object.entries(activeSelections)
    .filter(([key]) => key !== "cards") // exclude manual card selection
    .some(([, set]) => set.size > 0);

  let hoveredCards;

  if (!hasAnySelection) {
    // No filters: use only manually selected cards
    hoveredCards = Array.from(activeSelections.cards.values());
  } else {
    // Filters exist: get matches, then add manual cards
    const matching = getCardsMatchingActiveSelections(actualFIlteredData);
    const cardMap = new Map(matching.map(c => [c.name, c]));

    for (const [name, card] of activeSelections.cards) {
      cardMap.set(name, card);
    }

    hoveredCards = Array.from(cardMap.values());
  }

  updateState({
    hoveredCards,
    isHoverUpdate: true
  });

  d3.selectAll(".dots circle").classed("selected-hover", false);
  updateSelectedHoverClass();
}





function addActiveSelection(category, value) {
  const set = activeSelections[category];
  if (!set) return;

  if (set.has(value)) {
    set.delete(value); // remove if already present
  } else {
    set.add(value); // add if not present
  }
}

function getSymbolFromAttribute(attr) {
    if (attr.includes("eur")) return "€";
    if (attr.includes("usd")) return "$";
    return "";
}


let ignoreNextBrushEnd = false;
function getXMetricTooltipText() {
  if (xMetric === "release_date") {
    return "Cards are positioned along the X-axis by their first <b>release date</b>.";
  }
  if (lastPriceAttribute?.includes("eur")) return "Cards are positioned by <b>average price</b> (EUR, from Cardmarket).";
  if (lastPriceAttribute?.includes("usd")) return "Cards are positioned by <b>average price</b> (USD, from TCGplayer).";
  if (lastPriceAttribute?.includes("thx")) return "Cards are positioned by <b>average price</b> (from Scryfall).";
  return "Cards are positioned by <b>average price</b>.";
}

function getActiveXScale() {
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale } = svg.node().__scales__ || {};
  return xMetric === "avg_price" ? logXScale : timeXScale;
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
function getScaleType(scale) {
  if (typeof scale.base === "function") return "log";
  if (scale.ticks && scale.ticks(1)[0] instanceof Date) return "time";
  return "unknown";
}

const scatterTooltipText = `
<strong>Scatterplot Interactions:</strong><br>
• <strong>Hover on dots</strong>: view card details and highlight related data across views.<br>
• <strong>Click</strong> on a card: toggle persistent highlight of a card.<br>
• <strong>Brush</strong>: Toggle on/off persistent highlights of multiple cards.<br>
• <strong>Hover on labels</strong>: view tooltip explanation.<br>
• <strong>Scroll</strong>: Zoom in/out.<br>
• <strong>Moving mouse while holding right-click</strong>: Panning<br>
`;

onAlluvialClick(({ category, value }) => {
  const key = category.toLowerCase() === "originality" ? "originalities" : "rarities";
  addActiveSelection(key, value);
  applySelectionToScatter();
});

onYearClick(({ year }) => {
  addActiveSelection("years", year);
  applySelectionToScatter();
});

onTimelineSetClick(setInfo => {
  addActiveSelection("sets", setName);
  applySelectionToScatter();
});

onTimelineSetTypeClick(({ type }) => {
  addActiveSelection("setTypes", type.toLowerCase());
applySelectionToScatter();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  addActiveSelection("originalities", originality);
  addActiveSelection("rarities", rarity);
  applySelectionToScatter();
});

onIcicleClick(({ colorIdentity }) => {

  addActiveSelection("colorIdentities", colorIdentity);
applySelectionToScatter();
});

onIcicleNumClick(({ numColors }) => {
  addActiveSelection("numColors", numColors);
applySelectionToScatter();
});

onLineChartClick(({ year }) => {

  const targetYear = parseInt(year, 10); // Ensure it's a number
  addActiveSelection("years", targetYear)
applySelectionToScatter();
});

onLineChartBrush((entries) => {

  const brushedYears = new Set(entries.map(e => parseInt(e.year, 10))); // ⬅ convert years to numbers
  brushedYears.forEach(e => addActiveSelection("years", e));
applySelectionToScatter();
});

onTimelineBrush((entries) => {

  const brushedSetNames = new Set(entries.map(e => e.name)); // e.g., ["Innistrad", "Zendikar", ...]
 brushedSetNames.forEach(e => addActiveSelection("sets", e));
applySelectionToScatter();
});




onClearTimelineBrush(() => {
  // Get the current state
activeSelections.sets.clear();
applySelectionToScatter();
});

onClearLineChartBrush(() => {
 activeSelections.years.clear();
applySelectionToScatter();
});

onSetHover(setInfo => {

  highlightScatterDotsFromSet(setInfo.name);
})

onSetTypeHover(setTypeInfo => {
  highlightScatterDotsFromSetType(setTypeInfo.name);
});

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

onNumColorsHover(({ numColors }) => {
  highlightScatterDotsFromNumColors(numColors);
});

onClearNumColorsHover(() => {
  clearScatterHoverOnly();
});

onAlluvialHover(({ category, value }) => {
  highlightScatterDotsFromAlluvial(category, value);
});

onClearAlluvialHover(() => {
  clearScatterHoverOnly();
});

onAlluvialLinkHover(({ originality, rarity }) => {
  highlightScatterDotsFromAlluvialLink(originality, rarity);
});

onClearAlluvialLinkHover(() => {
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
    yScale,
    xAxisG,
    updateAxes,
    logXScale,
    timeXScale
  } = svg.node().__scales__;

    const data = actualFIlteredData;
    if (!meta || !data) return;

    const { chartWidth } = meta;
 data.forEach(d => delete d.isZoomKey);
if (xMetric === "avg_price") {
    const newMin = Math.max(0.001, d3.min(data, d => d.avg_price));
    const newMax = d3.max(data, d => d.avg_price);
    logXScale.domain([newMin, newMax]);
      tagZoomKeyPoints(data, logXScale, yScale);
 const activeX = xMetric === "avg_price" ? logXScale : timeXScale;
updateAxes(getSymbolFromAttribute(lastPriceAttribute), activeX);
  updatePointPositions(logXScale, yScale);
  } else {
    const validDates = data
      .map(d => new Date(d.release_date))
      .filter(d => d instanceof Date && !isNaN(d));
    const years = validDates.map(d => d.getFullYear());
const minYear = Math.min(...years);
const maxYear = Math.max(...years);
const minDate = new Date(minYear, 0, 1);     // Jan 1st
const maxDate = new Date(maxYear, 11, 31);   // Dec 31st
    timeXScale.domain([minDate, maxDate]);
      tagZoomKeyPoints(data, timeXScale, yScale);
   const activeX = xMetric === "avg_price" ? logXScale : timeXScale;
updateAxes(getSymbolFromAttribute(lastPriceAttribute), activeX);
  updatePointPositions(timeXScale, yScale);
  }

 
  

}



const ZOOM_THRESHOLD = 6;
let currentZoomLevel = 1;
let currentZoomTransform;
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


function getZoomedScales() {
  const svg = d3.select(".Scatterplot svg").node();
  const { logXScale, timeXScale, originalYScale } = svg.__scales__;
  const baseXScale = xMetric === "avg_price" ? logXScale : timeXScale;
  const xScale = currentZoomTransform ? currentZoomTransform.rescaleX(baseXScale) : baseXScale;
  const yScale = currentZoomTransform ? currentZoomTransform.rescaleY(originalYScale) : originalYScale;
  return { xScale, yScale };
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
  const formatDate = d3.timeFormat("%d %b %Y");
  const formattedDate = d.release_date ? formatDate(new Date(d.release_date)) : "Unknown";
  d3.select("#tooltip").style("display", "block")
    .style("background", getColorIdentityBackground(d.color_identity))
    .style("color", "black")
    .html(`
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <img src="${d.tooltip_image}" alt="${d.name}" width="200" style="border-radius: 4px; box-shadow: 0 0 4px rgba(0,0,0,0.5);" />
        <div>
          <strong>${d.name}</strong><br>
          Release Date: ${formattedDate}<br>
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
  d3.select(event.currentTarget).classed("hover-temp", true);
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
  d3.select(event.currentTarget).classed("hover-temp", false);
  clearHoverOnlyHighlight();
}


function clickFn(event, d) {
  if (activeSelections.cards.has(d.name)) {
    activeSelections.cards.delete(d.name);
  } else {
    activeSelections.cards.set(d.name, d);
  }

  applySelectionToScatter(); // use updated selections
  getAggregatedCardAttributesFromManualSelection();
}


onCardSearch(card => {
  console.log("Card search triggered:", card);
  if (activeSelections.cards.has(card.name)) {
    activeSelections.cards.delete(card.name);
  } else {
    activeSelections.cards.set(card.name, card);
  }

  applySelectionToScatter(); // use updated selections
  getAggregatedCardAttributesFromManualSelection();
});


function updatePointPositions(xScale, yScale) {
  if (!globalDots) return;

  const svg = d3.select(".Scatterplot svg");
  const meta = svg.node().__scatterMeta__;
  if (!meta) return;

  const { chartWidth, chartHeight } = meta;
  const hoveredSet = new Set((getState().hoveredCards || []).map(c => c.name));

  globalDots.each(function(d) {
    const cx = xScale(getXValue(d));
    const cy = yScale(d.complexity);
    const inBounds = cx >= 0 && cx <= chartWidth && cy >= 0 && cy <= chartHeight;
    const isHovered = this.classList.contains("hover-temp");
    const showDot = isHovered || currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey;

    // Only update if needed
    this.setAttribute("cx", cx);
    this.setAttribute("cy", cy);
    this.style.display = (inBounds && showDot) ? null : "none";
  });
}


function getAggregatedCardAttributesFromManualSelection() {
  const originalitySet = new Set();
  const raritySet = new Set();
  const colorIdentitySet = new Set();
  const yearSet = new Set();
  const setNameSet = new Set();

  for (const card of activeSelections.cards.values()) {
    // Originalities (array of strings)
    if (Array.isArray(card.all_originalities)) {
      for (const orig of card.all_originalities) {
        originalitySet.add(orig.toLowerCase());
      }
    }

    // Rarity (single string)
    if (card.rarity) {
      raritySet.add(card.rarity.toLowerCase());
    }

    // Color Identity (array of single letters like ['W', 'U'])
    if (Array.isArray(card.color_identity)) {
      const key = card.color_identity.join("");
      colorIdentitySet.add(key);
    }

    // Year (from release_date)
    if (card.release_date) {
      const year = new Date(card.release_date).getFullYear();
      if (!isNaN(year)) {
        yearSet.add(year);
      }
    }

    // All Set Names
    if (Array.isArray(card.all_sets)) {
      for (const s of card.all_sets) {
        if (s.name) setNameSet.add(s.name);
      }
    }
  }

  emitScatterplotCards({
    originalities: originalitySet,
    rarities: raritySet,
    colorIdentities: colorIdentitySet,
    years: yearSet,
    setNames: setNameSet
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
    if (!entry.all_set_types) {
  entry.all_set_types = new Set();
}
if (card.set_type) {
  entry.all_set_types.add(card.set_type.toLowerCase());
}
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
    card.all_set_types = Array.from(card.all_set_types || []);

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



  const iconX = width * 0.985;
  const iconY = height * 0.07;
  const iconRadius = width*0.93 * 0.015;
  const infoTextSize = Math.min(width * 0.0187, 15);




    const g = svg.append("g").attr("transform", `translate(${margin.left - 8.5}, ${margin.top-15})`);

const logXScale = d3.scaleLog()
  .domain([minPrice, maxPrice])
  .range([10, chartWidth]);

const validDates = filteredData
  .map(d => new Date(d.release_date))
  .filter(d => d instanceof Date && !isNaN(d));
const years = validDates.map(d => d.getFullYear());
const minYear = Math.min(...years);
const maxYear = Math.max(...years);
const minDate = new Date(minYear, 0, 1);     // Jan 1st
const maxDate = new Date(maxYear, 11, 31);   // Dec 31st

const timeXScale = d3.scaleTime()
  .domain([minDate, maxDate])
  .range([10, chartWidth]);


    

        const minComplexity = d3.min(filteredData, d => d.complexity);
        const maxComplexity = d3.max(filteredData, d => d.complexity);
        const yPadding = (maxComplexity - minComplexity) * 0.01; 
        
        const originalYScale = d3.scaleLinear()
            .domain([minComplexity - yPadding, maxComplexity + yPadding])
            .range([chartHeight, 5]);
        


    const yScale = originalYScale.copy();
    const xScale = xMetric === "avg_price" ? logXScale : timeXScale;
    tagZoomKeyPoints(filteredData, xScale, yScale);
    actualFIlteredData = filteredData; // Store the actual filtered data for updates
    const symbol = getSymbolFromAttribute(selectedPriceAttribute); 



    const xAxisG = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`);

    const yAxisG = g.append("g")
        .attr("class", "y-axis");

    const numTicks = 12;



function updateAxes(symbol, customX = null) {
  const xS = customX || xScale;

  if (xMetric === "avg_price") {
    const logMin = Math.log10(xS.domain()[0]);
    const logMax = Math.log10(xS.domain()[1]);
    const ticks = d3.range(numTicks).map(i =>
      Math.pow(10, logMin + i / (numTicks - 1) * (logMax - logMin))
    );
    if (ticks.length > 0 && ticks[0] < 0.001) ticks[0] = 0.001;

    xAxisG.call(
      d3.axisBottom(xS)
        .tickValues(ticks)
        .tickFormat(d => `${symbol}${d.toFixed(2)}`)
    );
  } else if (xMetric === "release_date") {
    xAxisG.call(
      d3.axisBottom(xS)
        .ticks(d3.timeYear.every(1))
        .tickFormat(d => {
          const year = d.getFullYear();
          return year % 2 === 1 ? year.toString() : "";
        })
    );
  }

  yAxisG.call(d3.axisLeft(yScale).ticks(numTicks));
}





    updateAxes(symbol);



        
        svg.append("foreignObject")
  .attr("x", chartWidth / 2 - 30) // Adjust as needed
  .attr("y", height - 30)
  .attr("width", 130)
  .attr("height", 30)
   .style("pointer-events", "none")
  .append("xhtml:div")
 .html(`
    <select id="xMetricDropdown" style="
    pointer-events: auto;
      font-size:14px;
      font-family: inherit;
      font-weight: bold;
      padding: 2px 6px;
      background-color: hsl(44, 65%, 97%);
      border: none;
      outline: none;
      cursor: pointer;
    ">
      <option value="avg_price">Average Price</option>
      <option value="release_date">Release Date</option>
    </select>
  `);

  const dropdown = document.getElementById("xMetricDropdown");
if (dropdown) {
  dropdown.value = xMetric; // Reflect current state
dropdown.addEventListener("change", function () {
  xMetric = this.value;
  updateXMetricScale();

});

dropdown.addEventListener("mouseover", (event) => {
  d3.select("#tooltip")
    .style("display", "block")
.html(getXMetricTooltipText);
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
    .attr("y", margin.top -15)
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
    .extent([[0, -10], [chartWidth + 10, chartHeight]])
    .on("start", () => svg.on(".zoom", null))
    .on("end", function(event) {
    const t0 = performance.now();
    svg.call(zoom); // Re-enable zoom
      if (ignoreNextBrushEnd) {
          ignoreNextBrushEnd = false;
      return;
    }

  if (!event.selection) {
    activeSelections.cards.clear();
    emitClearScatterplotBrush();
    applySelectionToScatter();
    return;
  }

    const [[x0, y0], [x1, y1]] = event.selection;

    const t1 = performance.now();
    const { xScale, yScale } = getZoomedScales();
    const brushedNames = new Set();
    for (const d of filteredData) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
        brushedNames.add(d.name);
      }
    }

      if (brushedNames.size === 0) {
      activeSelections.cards.clear();
      emitClearScatterplotBrush();
      applySelectionToScatter();
      ignoreNextBrushEnd = true;
      brushOverlay.call(brush.move, null);
      return;
    }
    const t2 = performance.now();

    const actualCardMap = new Map(actualFIlteredData.map(c => [c.name, c]));
    // Add brushed cards to manual selection map
    for (const name of brushedNames) {
      const match = actualCardMap.get(name);
      if (activeSelections.cards.has(name)) {
        activeSelections.cards.delete(name); // 💨 deselect
      } else {
        if (match) activeSelections.cards.set(name, match); // ✅ select
      }
    }

    const summary = getAggregatedCardAttributesFromManualSelection();
    const t3 = performance.now();

    // Now recompute hoveredCards based on current filters + manual cards
    //emitScatterplotBrush(brushedCards);
    applySelectionToScatter();

    const t4 = performance.now();

    ignoreNextBrushEnd = true;
    brushOverlay.call(brush.move, null); // Clear brush selection

    const t5 = performance.now();


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
  .text("?");
    



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

const visibleData = filteredData
const dots = gClip.selectAll("circle")
  .data(visibleData, d => d.name)
  .join("circle")
  .attr("cx", d => xScale(getXValue(d)))
  .attr("cy", d => yScale(d.complexity))
  .attr("class", d => {
  const numColors = d.color_identity?.length || 0;
  const identityKey = d.color_identity?.length
    ? d.color_identity.slice().join("")
    : "Colorless";
  return `dots ci-${identityKey} nc-${numColors}`;
})
  .attr("r", 2.5)
  .style("cursor", "pointer")
  .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
  .attr("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
  .attr("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2)
  .attr("opacity", 0.8)
  .style("display", d =>(currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey ) ? null : "none");

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

        
        
        
const baseLegendSize = chartHeight * 0.05; // similar to your alluvial `0.097`

const legendItemDimensions = Math.min(baseLegendSize, 20);
const legendX = margin.left+ 30;
const legendY = -10;
const legendFontSize = baseLegendSize > 18? 13: 10

const legend = svg.append("g")
  .attr("class", "edhrec-legend")
  
  .attr("transform", `translate(${legendX}, ${legendY})`);

legend.style("pointer-events", "none");
legend.append("text")
  .attr("x", 0)
  .attr("y", legendItemDimensions*7.75)
  .text("EDHREC Rank")
  .style("shape-rendering", "crispEdges")
  .attr("fill", "#000")
  .style("font-size", legendFontSize)
  .style("font-weight", "bold");

  

colorGroups.forEach((group, i) => {
  const entry = legend.append("g")
    .attr("transform", `translate(0, ${(i + 1) * (legendItemDimensions)})`);

  entry.append("rect")
    .attr("width", legendItemDimensions)
    .attr("height", legendItemDimensions)
    .style("shape-rendering", "crispEdges")
    .attr("fill", group.color)
    .attr("stroke", "#000");

  entry.append("text")
    .attr("x", 26)
    .attr("y", legendItemDimensions / 2)
    .attr("dy", "0.35em")
    .style("shape-rendering", "crispEdges")
    .text(`${group.range[0]}–${group.range[1]}`)
    .style("font-size", `${legendFontSize}px`)
    .attr("fill", "#000");
});

const noRankEntry = legend.append("g")
  .attr("transform", `translate(0, ${(colorGroups.length + 1) * (legendItemDimensions)})`);

noRankEntry.append("circle")
  .attr("r", 6)
  .attr("cx", legendItemDimensions/2)
  .attr("cy", legendItemDimensions / 2)
  .attr("fill", "transparent")
  .attr("stroke", "black")
  .attr("stroke-width", 1.2);

noRankEntry.append("text")
  .attr("x", 26)
  .attr("y", legendItemDimensions / 2)
  .attr("dy", "0.35em")
  .style("shape-rendering", "crispEdges")
  .text("No Rank")
  .style("font-size",`${legendFontSize}px`)
  .attr("fill", "#000");


        
        


    let zoomTimeout = null;
    const ZOOM_DELAY =0; 

  const buffer = 100;
  zoom = d3.zoom()
  .scaleExtent([1, 24])
  .translateExtent([[0, 0], [chartWidth + buffer, chartHeight + buffer]])
  .extent([[0, 0], [chartWidth, chartHeight]])
.filter(event => {
  // Allow wheel events
  if (event.type === "wheel") return true;

  // Allow right-click
  if (event.type === "mousedown" && event.button === 2) return true;

  // Allow if Ctrl key is pressed during any event
  if (event.ctrlKey) return true;

  // Otherwise, ignore the event
  return false;
})

  .on("zoom", event => {
    applyZoomTransform(event.transform);
  });




function applyZoomTransform(transform) {
  currentZoomTransform = transform; // 🌟 Save it
  currentZoomLevel = transform.k;

  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale, originalYScale, updateAxes } = svg.node().__scales__;

  const baseXScale = xMetric === "avg_price" ? logXScale : timeXScale;
  const newX = transform.rescaleX(baseXScale);
  const newY = transform.rescaleY(originalYScale);


  // ✨ DON'T mutate base scale
  yScale.domain(newY.domain());

  updateAxes(getSymbolFromAttribute(lastPriceAttribute), newX);


  const gClip = d3.select(".clip-group");

  gClip.selectAll("circle")
    .attr("cx", d => newX(getXValue(d)))
    .attr("cy", d => yScale(d.complexity))
    .style("display", d => (currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey) ? null : "none");

  globalDots = gClip.selectAll("circle");

}




        svg.call(zoom);

        if (savedTransform) {
            svg.call(zoom.transform, savedTransform);
        }
        
svg.on("dblclick", function (event) {
  const target = d3.select(event.target);
  const tag = event.target.tagName?.toLowerCase();

  const isDot = target.classed("dots")
  const isCircleDot = tag === "circle" && target.classed("ci-")

  const isAxis = target.classed("x-axis") || target.classed("y-axis");
  const isLegend = target.node().closest(".edhrec-legend");
  const isInfoIcon = target.node().closest(".info-icon");

  const isInteractiveScatterElement = isDot || isCircleDot || isAxis || isLegend || isInfoIcon;

  if (!isInteractiveScatterElement) {
    activeSelections.cards.clear();
    emitClearScatterplotBrush();
    applySelectionToScatter();
  }
});


        
    

    
svg.node().__scales__ = {
  yScale,
  xAxisG,
  yAxisG,
  updateAxes,
  originalYScale,
  logXScale,
  timeXScale
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

let interactionsOn = true;
export function updateScatterPlot(filteredData, selectedPriceAttribute = "price_eur") {
  interactionsOn = false;
  const t0 = performance.now();
  lastPriceAttribute = selectedPriceAttribute;
  const hoveredCards = getState().hoveredCards || [];
  const hoveredSet = new Set(hoveredCards.map(c => c.name));

  const svg = d3.select(".Scatterplot svg");
  if (svg.empty()) return;

  const {
    yScale,
    xAxisG,
    yAxisG,
    updateAxes,
    originalYScale,
    logXScale,
    timeXScale
  } = svg.node().__scales__ || {};
  if (!yScale || !updateAxes || !originalYScale) return;

  const gClip = svg.select(".dots .clip-group");

  const t1 = performance.now();

  // Update X scale domain
  if (xMetric === "avg_price") {
    const newMin = Math.max(0.001, d3.min(filteredData, d => d.avg_price));
    const newMax = d3.max(filteredData, d => d.avg_price);
    logXScale.domain([newMin, newMax]);
  } else {
    const validDates = filteredData.map(d => new Date(d.release_date)).filter(d => d instanceof Date && !isNaN(d));
    const years = validDates.map(d => d.getFullYear());
    const minDate = new Date(Math.min(...years), 0, 1);
    const maxDate = new Date(Math.max(...years), 11, 31);
    timeXScale.domain([minDate, maxDate]);
  }

  const t2 = performance.now();

  const baseXScale = xMetric === "avg_price" ? logXScale : timeXScale;
  const newX = currentZoomTransform ? currentZoomTransform.rescaleX(baseXScale) : baseXScale;
  const newY = currentZoomTransform ? currentZoomTransform.rescaleY(originalYScale) : yScale;

  const symbol = getSymbolFromAttribute(selectedPriceAttribute);
  updateAxes(symbol);

  const t3 = performance.now();

  // Recompute zoom keypoints
  filteredData.forEach(d => delete d.isZoomKey);
  tagZoomKeyPoints(filteredData, baseXScale, yScale);
  actualFIlteredData = filteredData;

  const t4 = performance.now();

  // JOIN and update circles
const dots = gClip.selectAll("circle")
  .data(filteredData, d => d.name)
  .join(
    enter => enter.append("circle")
      .attr("r", 2.5)
      .style("cursor", "pointer")
      .attr("opacity", 0.8)
      .on("mouseover", mouseoverFn)
      .on("mousemove", mousemoveFn)
      .on("mouseout", mouseoutFn)
      .on("click", clickFn)
      .attr("class", d => {
        const numColors = d.color_identity?.length || 0;
        const identityKey = d.color_identity?.slice().sort().join("") || "Colorless";
        return `dots ci-${identityKey} nc-${numColors}`;
      })
      .attr("fill", d => (+d.edhrec_rank > 0) ? getGroupColor(+d.edhrec_rank) : "transparent")
      
      .attr("stroke", d => (+d.edhrec_rank > 0) ? "none" : "black")
      .attr("stroke-width", d => (+d.edhrec_rank > 0) ? 0 : 1.2),
    update => update,
    exit => exit.remove()
  );

dots
  .attr("cx", d => newX(getXValue(d)))
  .style("display", d =>(currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey ) ? null : "none")
  .attr("cy", d => newY(d.complexity));


  const t5 = performance.now();

  globalDots = gClip.selectAll("circle");
  
  updatePointPositions(baseXScale, yScale);

  const t6 = performance.now();

  updateSelectedHoverClass();

  const t7 = performance.now();

  // console.log(`[Scatter Perf Breakdown]
  // • Setup / scales:       ${(t1 - t0).toFixed(2)} ms
  // • Update domains:       ${(t2 - t1).toFixed(2)} ms
  // • Axes update:          ${(t3 - t2).toFixed(2)} ms
  // • Tag zoom key points:  ${(t4 - t3).toFixed(2)} ms
  // • D3 .join() and attrs: ${(t5 - t4).toFixed(2)} ms
  // • Dot repositioning:    ${(t6 - t5).toFixed(2)} ms
  // • Hover sync:           ${(t7 - t6).toFixed(2)} ms
  // • TOTAL:                ${(t7 - t0).toFixed(2)} ms`);
  interactionsOn = true;
}

function shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight) {
  const zoomedOut = currentZoomLevel < ZOOM_THRESHOLD;
  const inBounds = cx >= 0 && cx <= chartWidth && cy >= 0 && cy <= chartHeight;
  return inBounds && (!zoomedOut || d.isZoomKey);
}



export function highlightScatterDotsFromSet(setName) {
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle")
    .each(function(d) {
      if (d.all_sets?.some(s => s.name === setName)) {
        const cx = xScale(getXValue(d));
        const cy = yScale(d.complexity);
        if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
          d3.select(this).classed("hover-temp", true);
        }
      }
    });
}


function highlightScatterDotsFromSetType(setType) {
  const lowerType = setType.toLowerCase();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle")
    .each(function(d) {
      if (d.all_set_types?.includes(lowerType)) {
        const cx = xScale(getXValue(d));
        const cy = yScale(d.complexity);
        if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
          d3.select(this).classed("hover-temp", true);
        }
      }
    });
}



function highlightScatterDotsFromIcicle(rectInfo) {
  if (!interactionsOn) return;

  const [targetIdentity] = [...rectInfo.colorIdentities];
   const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(`.dots.ci-${targetIdentity}`)
    .each(function(d) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
        d3.select(this).classed("hover-temp", true);
      }
    });
}


function highlightScatterDotsFromNumColors(numColors) {
  if (numColors === undefined || numColors === null) return;

  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(`.dots.nc-${numColors}`)
    .each(function(d) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
        d3.select(this).classed("hover-temp", true);
      }
    });
}




export function highlightScatterDotsFromYear(year) {
  const targetYear = year.getFullYear();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle")
    .each(function(d) {
      const cardYear = new Date(d.release_date).getFullYear();
      if (cardYear === targetYear) {
        const cx = xScale(getXValue(d));
        const cy = yScale(d.complexity);
        if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
          d3.select(this).classed("hover-temp", true);
        }
      }
    });
}



function highlightScatterDotsFromAlluvial(category, value) {
  const lowerVal = value.toLowerCase();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle")
    .each(function(d) {
      let match = false;
      if (category === "Originality" && d.all_originalities?.includes(lowerVal)) {
        match = true;
      } else if (category === "Rarity" && d.rarity?.toLowerCase() === lowerVal) {
        match = true;
      }

      if (match) {
        const cx = xScale(getXValue(d));
        const cy = yScale(d.complexity);
        if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
          d3.select(this).classed("hover-temp", true);
        }
      }
    });
}


function highlightScatterDotsFromAlluvialLink(originality, rarity) {
  const lowerOrig = originality.toLowerCase();
  const lowerRarity = rarity.toLowerCase();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle")
    .each(function(d) {
      const origMatch = d.all_originalities?.includes(lowerOrig);
      const rarityMatch = d.rarity?.toLowerCase() === lowerRarity;

      if (origMatch && rarityMatch) {
        const cx = xScale(getXValue(d));
        const cy = yScale(d.complexity);
        if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
          d3.select(this).classed("hover-temp", true);
        }
      }
    });
}


export function clearScatterHoverOnly(Updateflag = "false") {
  d3.selectAll(".dots circle").classed("hover-temp", false);

  // const svg = d3.select(".Scatterplot svg");
  // const { xScale, yScale } = svg.node().__scales__ || {};
  // if (xScale && yScale) {
  //   updatePointPositions(xScale, yScale);
  // }
}


