
import { updateState, getState } from "../state.js";
import { updateFilterPanel } from "./FilterPanel.js";
import { emitSetHover, emitClearHover, onNumColorsHover, onClearNumColorsHover, onAlluvialClick, onAlluvialLinkClick, emitSetTypeHover, emitClearSetTypeHover, onClearAlluvialSelections, onClearSelection,
        onHoverCard, onClearHover, emitClearSetHover,emitTimelineSetClick, onAlluvialLinkHover, onClearAlluvialLinkHover,onScatterplotCards,onClearScatterplotBrush, emitClearTimelineSelections,
        emitYearClick,emitClearLineYearHover, onRectHover, onClearRectHover, onClearLineYearHover, onLineChartClick, onLineChartBrush, emitLineChartClick, emitTimelineSetTypeClick, onClearIcicleSelections,
        onLineYearHover, onAlluvialHover, onClearAlluvialHover, onIcicleClick, onIcicleNumClick, emitTimelineBrush, emitClearTimelineBrush, onClearLineChartBrush,
        emitLineYearHover} from "./Events.js";

let localSelectedYears = new Set();
let localSelectedSetNames = new Set();
let ignoreNextBrushEnd = false;
const yearStats = new Map();     // key: "2020", value: { totalCardCount, rarities, originalities, colorIdentities, setNames }
const setTypeStats = new Map();

function getDiscreteColor(percentage) {
  if (percentage < 20) return "#ceb397";
  if (percentage < 40) return "#b8997a";
  if (percentage < 60) return "#998066";
  if (percentage < 80) return "#736659";
  return "#594a3a"; 
}

function getHighlightedColor(percentage){
if (percentage < 20) return "#fbecd0";
  if (percentage < 40) return "#f8dfb0";
  if (percentage < 60) return "#f2c46e";
  if (percentage < 80) return "#d89313";
  return "#9b690d"; 
}

function getSelectedColor(percentage){
if (percentage < 20) return "#dcdfef";
  if (percentage < 40) return "#b9bfda";
  if (percentage < 60) return "#9AA0BC";
  if (percentage < 80) return "#6a708a";
  return "#3a4059"; 
}

function getColorByCardCount(count, min, max, func) {
  const percent = ((count - min) / (max - min)) * 100;
  return func(percent);
}

onHoverCard(card => {
  highlightTimelineSetsHoverOnly(card);
});

onClearHover(() => {
  clearTimelineHoverOnly();
});

onRectHover(rectInfo => {

  highlightTimelineSetsFromIcicle(rectInfo)
})

onClearRectHover(() => {
  clearTimelineHoverOnly();
})

onNumColorsHover(({ numColors, originalities, rarities }) => {
 highlightTimelineSetsFromNumColors(numColors);

});

onClearNumColorsHover(() => {
  clearTimelineHoverOnly();
})


onLineYearHover(yearInfo => {
  highlightTimelineSetsFromYearInfo(yearInfo)
})

onClearLineYearHover(() => {
  clearTimelineHoverOnly();
})

onAlluvialHover(({ category, value }) => {
  highlightTimelineSetsFromAlluvialCategory(category, value);
});

onAlluvialLinkHover(({ originality, rarity }) => {
  highlightTimelineSetsFromAlluvialLink(originality, rarity)
});

onClearAlluvialLinkHover(() => {
  clearTimelineHoverOnly();
});
onClearAlluvialHover(() => {
  clearTimelineHoverOnly();
});

let uniqueSets = null;
const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };
let dynamicLegendHTML = null




function updateYearTickStyles() {
    const yearFilter = localSelectedYears;

    d3.selectAll(".x-axis .tick text")
        .style("fill", function(d) {
            const year = (d instanceof Date) ? d.getFullYear().toString() : d.toString();
            return yearFilter.has(year) ? "#007bff" : "black";
        })
        .style("font-weight", function(d) {
            const year = (d instanceof Date) ? d.getFullYear().toString() : d.toString();
            return yearFilter.has(year) ? "bold" : "normal";
        });
}



function updateSetRectOpacity() {
    const yearFilter = localSelectedYears;
    const setRects = d3.selectAll(".set-rect");

    setRects
        .interrupt()  // Stop any current transition to prevent stacking
        .transition()
        .duration(150)
        .style("opacity", d => {
            const year = d.releaseDate.getFullYear().toString();
            return yearFilter.size === 0 || yearFilter.has(year) ? 1 : 0.2;
        });
}


function getClonedFilters() {
    const currentState = getState();
    const cloned = {};
    for (const key in currentState.selectedFilters) {
        cloned[key] = new Set(currentState.selectedFilters[key]);
    }
    return cloned;
}

        
export function createTimelineView(data, containerId, isUpdate = false) {
    const tooltip = d3.select("#tooltip");
    d3.select(containerId).selectAll("*").remove();

    data.forEach(card => {
    if (!card._parsedDate) {
        card._parsedDate = new Date(card.release_date);
    }
});
    let setMap = new Map();
 yearStats.clear();      // reuse the existing map
    setTypeStats.clear();   // reuse instead of redefining
    data.forEach(card => {
        let setName = card.set_name;
        if (!setMap.has(setName)) {
            setMap.set(setName, {
                name: setName,
                releaseDate: card._parsedDate,
                setType: card.set_type,
                cardCount: 0 ,
                originalities: new Set(),
                rarities: new Set(),
                colorIdentities: new Set(),
                numColorsPresent: new Set()
            });
        }
        setMap.get(setName).cardCount += 1;
        const setEntry = setMap.get(setName);
        if (card.originality) {
            setEntry.originalities.add(card.originality.toLowerCase());
        }
        // Add rarity
        if (card.rarity) {
        setEntry.rarities.add(card.rarity.toLowerCase());
        }

        // Add color identity
        let identity;
        if (!card.color_identity || card.color_identity.length === 0) {
        identity = "Colorless";
        setEntry.numColorsPresent.add(0);
        } else {
        identity = card.color_identity.slice().sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b]).join("");
        setEntry.numColorsPresent.add(identity.length);
        }
        setEntry.colorIdentities.add(identity);
    });

 
    uniqueSets = Array.from(setMap.values()).sort((a, b) => a.releaseDate - b.releaseDate);

const allCardCounts = uniqueSets.map(set => set.cardCount);
const sortedCounts = allCardCounts.slice().sort(d3.ascending);

// Compute quintile thresholds
const thresholds = [
  d3.quantileSorted(sortedCounts, 0.2),
  d3.quantileSorted(sortedCounts, 0.4),
  d3.quantileSorted(sortedCounts, 0.6),
  d3.quantileSorted(sortedCounts, 0.8),
  d3.max(sortedCounts)
];

// Add 0 as the first lower bound
const bounds = [0, ...thresholds];

// Build legend data based on quintile ranges
const dynamicLegendData = bounds.slice(0, -1).map((min, i) => {
  const max = bounds[i + 1];
  const quintilePercent = i * 20;
  return {
    min,
    max,
    color: getDiscreteColor(quintilePercent),
    colorSelected: getSelectedColor(quintilePercent),
    label: `${Math.round(min)}–${Math.round(max)}`
  };
}).reverse();




const timelineTooltipText = `
<strong>Timeline Interactions:</strong><br>
• <strong>Click</strong> a year, a set or set type: Selects/Diselects the corresponding element, affecting the cards highlighted in other views.<br>
• <strong>Hover</strong> a year, a set or a set type: Shows tooltip details and highlights corresponding element across views.<br>
• <strong>Right-Click</strong> a year, set square, or set type: Applies or removes a global filter for that category.<br>
• <strong>Brush</strong>: Selects/Diselects multiple sets.<br>
• <strong>Scroll</strong>: Zoom in/out on the Timeline.<br>
• <strong>Right-click drag</strong> or <strong>Ctrl + left-click drag</strong>: Pan the Timeline<br>
• <strong>Double-Click</strong> background: Clears selections made within the Timeline(Years Excluded).<br>
`;

    const yearTypeCounts = new Map();
    const typeCounts = new Map();


d3.select(containerId)
  .on("contextmenu", event => event.preventDefault());
uniqueSets.forEach(set => {
  let quintileIndex = 0;
for (let i = 0; i < thresholds.length; i++) {
  if (set.cardCount <= thresholds[i]) {
    quintileIndex = i;
    break;
  }
}
const quintilePercent = quintileIndex * 20; // 0, 20, 40, 60, 80

set.baseColor = getDiscreteColor(quintilePercent);
set.highlightColor = getHighlightedColor(quintilePercent);
set.selectedColor = getSelectedColor(quintilePercent);

  const year = set.releaseDate.getFullYear().toString();
  const type = set.setType;

  // ✅ Count sets by type per year
  if (!yearTypeCounts.has(year)) yearTypeCounts.set(year, new Map());
  if (!yearTypeCounts.get(year).has(type)) yearTypeCounts.get(year).set(type, 0);
  yearTypeCounts.get(year).set(type, yearTypeCounts.get(year).get(type) + 1);

  // ✅ Count total sets per type
  if (!typeCounts.has(type)) typeCounts.set(type, 0);
  typeCounts.set(type, typeCounts.get(type) + 1);

  // ✅ Full aggregation per year
  if (!yearStats.has(year)) {
    yearStats.set(year, {
      totalCardCount: 0,
      rarities: new Set(),
      originalities: new Set(),
      colorIdentities: new Set(),
      numColorsPresent: new Set(),
      setNames: new Set()
    });
  }
  const y = yearStats.get(year);
  y.totalCardCount += set.cardCount;
  set.rarities.forEach(r => y.rarities.add(r));
  set.originalities.forEach(o => y.originalities.add(o));
  set.colorIdentities.forEach(c => y.colorIdentities.add(c));
  set.numColorsPresent.forEach(n => y.numColorsPresent.add(n));
  y.setNames.add(set.name);

  // ✅ Full aggregation per set type
  if (!setTypeStats.has(type)) {
    setTypeStats.set(type, {
      totalCardCount: 0,
      rarities: new Set(),
      originalities: new Set(),
      colorIdentities: new Set(),
      numColorsPresent: new Set(),
      setNames: new Set(),
      releaseDates: new Set(),
    });
  }
  const t = setTypeStats.get(type);
  t.totalCardCount += set.cardCount;
  set.rarities.forEach(r => t.rarities.add(r));
  set.originalities.forEach(o => t.originalities.add(o));
  set.colorIdentities.forEach(c => t.colorIdentities.add(c));
  set.numColorsPresent.forEach(n => t.numColorsPresent.add(n));
  
  t.setNames.add(set.name);
  t.releaseDates.add(set.releaseDate);
});


  
    let allSetTypes = Array.from(new Set(uniqueSets.map(set => set.setType))).sort();
    let selectedSetTypes = allSetTypes.slice(0, 50); 


    uniqueSets = uniqueSets.filter(set => selectedSetTypes.includes(set.setType));

    
    const container = d3.select(containerId);
    const containerBounds = container.node().getBoundingClientRect();

    const containerWidth = containerBounds.width * 0.98;
   
    const searchContainerwidth = containerBounds.width * 0.07;
    const containerHeight = containerBounds.height;
    const chartWidth = containerWidth * 0.873;
    const chartHeight = containerHeight;

    const margin = { 
        top: 50, 
        right: 50, 
        bottom: 10, 
        left: containerWidth * 0.11
    };


    if (isUpdate) {
        d3.select(containerId).select(".chart-wrapper").remove();
    }







const iconRadius = containerBounds.width*0.485 * 0.015;

const iconSize = iconRadius * 2;
const infoTextSize = Math.min(containerBounds.width * 0.485 * 0.0187, 15);


//
const infoGroup = container.append("div")
  .attr("class", "timeline-info-icon")
  .style("position", "absolute")
  .style("top", "5px")
  .style("left", "5px")
  .style("width", `${iconSize}px`)
  .style("height", `${iconSize}px`)
  .style("background", "#8A9CE4")
  .style("stroke", "#fff")
  .style("border", "1px solid #fff")
  .style("border-radius", "50%")
  .style("text-align", "center")
  .style("font-size", `${infoTextSize}px`)
    .style("font-weight", "bold")   
  .style("line-height", `${iconSize}px`)
  .style("cursor", "help")
  .style("z-index", "10000")
  .style("color", "#fff")
  .text("?")
  .on("mouseover", function (event) {
    d3.select("#tooltip")
      .style("display", "block")
      .html(timelineTooltipText);
  })
  .on("mousemove", function (event) {
    const tooltip = d3.select("#tooltip");
    const tooltipWidth = tooltip.node().offsetWidth;
    const tooltipHeight = tooltip.node().offsetHeight;
    const padding = 10;

    let x = event.pageX + padding;
    let y = event.pageY + padding;

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
  .on("mouseout", function () {
    d3.select("#tooltip").style("display", "none");
  });






    const wrapper = container.append("div")
        .attr("class", "chart-wrapper")
        .style("position", "relative")
        .style("width", `${containerWidth}px`);

    
    const fixedXAxis = wrapper.append("svg")
        .attr("width", containerWidth)
        .attr("height", margin.top - 10)
        .style("position", "sticky")
        .style("top", "0px")
        .style("background", "hsl(44, 65%, 97%)")
        .style("z-index", "10");
const minDateRaw = d3.min(uniqueSets, d => d.releaseDate);
const maxDateRaw = d3.max(uniqueSets, d => d.releaseDate);

// Snap to full year bounds:
const startYear = minDateRaw.getFullYear();
const endYear = maxDateRaw.getFullYear();

const minDate = new Date(startYear, 0, 1);      // January 1st
const maxDate = new Date(endYear, 11, 31, 23, 59, 59); // December 31st, end of day

const xScale = d3.scaleTime()
  .domain([minDate, maxDate])
  .range([0, chartWidth]);

    const xAxis = d3.axisTop(xScale)
        .ticks(d3.timeYear.every(1))
        .tickFormat(d3.timeFormat("%Y"));

        

        const xAxisGroup = fixedXAxis.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(${margin.left}, ${margin.top - 20})`)
            .call(xAxis);
        


            xAxisGroup.selectAll(".tick")
            .select("text")
            .classed("year-tick-timeline", true)
            .style("text-anchor", "middle")
            .style("cursor", "pointer")
.on("click", function (event, d) {
    const year = d.getFullYear().toString();
    const yearInfo = yearStats.get(year);

    const isSelected = activeTimelineSelections.fromYears.has(year); // ✅ both are strings



    emitLineChartClick({
        year: year,
        originalities: yearInfo.originalities,
        rarities: yearInfo.rarities,
        source: "timeline"
    });
})

            .on("contextmenu", function (event, d) {
    event.preventDefault();
    const year = d.getFullYear().toString();

    const updatedFilters = getClonedFilters();
    if (!updatedFilters["Year"]) {
        updatedFilters["Year"] = new Set();
    }

    const isSelected = updatedFilters["Year"].has(year);
    if (isSelected) {
        updatedFilters["Year"].delete(year);
        localSelectedYears.delete(year);
    } else {
        updatedFilters["Year"].add(year);
        localSelectedYears.add(year);
    }

    updateState({
        selectedFilters: updatedFilters,
        updateContext: "TimelineFilter"
    });
    })
            .on("mouseover", function (event, d) {
              d3.select(this).classed("hovered", true);
    const year = d.getFullYear().toString();
    const yearInfo = yearStats.get(year);
    highlightAllViewsForYear(year);
    const types = yearTypeCounts.get(year);
    let totalSets = 0;
    if (types) {
        totalSets = Array.from(types.values()).reduce((sum, count) => sum + count, 0);
    }
    const tooltipHtml = types
        ? `<strong>${year}</strong><br> <strong> Total Sets: ${totalSets} </strong><br>${Array.from(types.entries()).map(([t, count]) => `${t}: ${count}`).join("<br>")}`
        : `<strong>${year}</strong><br>No sets`;

    tooltip.style("display", "block").html(tooltipHtml);

const { width: tooltipWidth, height: tooltipHeight } = tooltip.node().getBoundingClientRect();
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;
const padding = 10;

let left = event.pageX + padding;
if (left + tooltipWidth > viewportWidth) {
    left = event.pageX - tooltipWidth - padding;
}
if (left < 0) left = padding;

let top = event.pageY + padding;
if (top + tooltipHeight > viewportHeight) {
    top = event.pageY - tooltipHeight - padding;
}
if (top < 0) top = padding;

tooltip.style("left", `${left}px`)
       .style("top", `${top}px`);

})
.on("mouseout", function () {
  d3.select(this).classed("hovered", false);
  d3.select("#tooltip").style("display", "none");
  emitClearLineYearHover();
});







    const scrollContainer = wrapper.append("div")
        .attr("class", "chart-container")
        .style("width", `${containerWidth}px`)
        .style("height", `${containerHeight*0.75}px`) 
        .style("overflow-y", "scroll") 
        .style("overflow-x", "hidden") 
         .style("position", "relative")
        .style("border", "none");

    const lineSpacingFactor = 0.5;  

    const adjustedChartHeight = selectedSetTypes.length * lineSpacingFactor * 30;

    const svg = scrollContainer.append("svg")
        .attr("width", containerWidth)
         .style("overflow", "visible")
        .attr("height", adjustedChartHeight + 20);
    

    const zoom = d3.zoom()
        .filter(event => {
  // Allow wheel events
  if (event.type === "wheel") return true;

  // Allow right-click
  if (event.type === "mousedown" && event.button === 2) return true;

  // Allow if Ctrl key is pressed during any event
  if (event.ctrlKey) return true;

  // Otherwise, ignore the event
  return false;
}) // 👈 allow zooming ONLY via scroll
        .scaleExtent([1, 10]) 
        .translateExtent([[0, 0], [chartWidth, adjustedChartHeight]])
        .on("zoom", zoomed);
    
    svg.call(zoom);
    
    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, 10)`);

       

        let yScale = d3.scalePoint()
            .domain(selectedSetTypes)
            .range([0, selectedSetTypes.length * lineSpacingFactor * 30]); 
        
const legendX = 3;  // Adjust spacing from chart
const legendY = 6;
const rectDimensions = Math.min(chartHeight*0.15, 15);
const extraSpacing = 0;
const svgWidth = containerWidth;  // you already use this for sizing
const legendFontSize = Math.min(0.1*chartHeight, 12);

const legendContainer =wrapper.append("div")
  .attr("class", "timeline-color-legend")
  .style("position", "absolute")
  .style("top", "15px") // Adjust as needed
  .style("left", "-10px") // Adjust as needed
  .style("padding", "6px 10px")
  .style("overflow", "hidden")
  .style("box-sizing", "border-box")
  .style("border-radius", "6px")
  .style("font-size", `${legendFontSize}px`)
  .style("line-height", "1.2")
  .style("z-index", "9999")
  .style("color", "#000")
  .style("pointer-events", "auto");



dynamicLegendData.forEach((interval, i) => {


  const row = legendContainer.append("div")
    .style("display", "flex")
    .style("align-items", "flex-start")
    .style("margin", "0");

  row.append("div")
    .style("width", `${rectDimensions}px`)
    .style("height", `${rectDimensions}px`)
    .style("background", `linear-gradient(135deg, ${interval.colorSelected} 50%, ${interval.color} 50%)`)

    .style("border", "1px solid #000")

if (i === dynamicLegendData.length - 1) {
    const labelContainer = row.append("div")
      .style("display", "flex")
      .style("flex-direction", "column")
      .style("justify-content", "space-between")
      .style("margin-left", "6px")
      .style("height", `${rectDimensions}px`);

    labelContainer.append("div")
      .style("font-size", `${legendFontSize}px`)
      .style("margin-top", `-${rectDimensions * 0.25 + 1}px`)
      .text(`${Math.round(interval.max)}`);

    labelContainer.append("div")
      .style("font-size", `${legendFontSize}px`)
      .text("1");
  } else {
    // Just the max label
    row.append("div")
      .style("margin-left", "6px")
      .style("margin-top", `-${rectDimensions * 0.25 + 1}px`)
      .text(`${Math.round(interval.max)}`);
  }
});
legendContainer.append("div")
  .style("font-weight", "bold")
  .style("margin-top", "5px") // ← push it down from the content above
  .text("Card Count");
// Add "1" at the end (min value)
    selectedSetTypes.forEach(setType => {
        chartGroup.append("line")
            .attr("x1", 0)
            .attr("y1", yScale(setType))
            .attr("x2", chartWidth)
            .attr("y2", yScale(setType))
            .attr("stroke", "black")
            .attr("stroke-width", 2);
    });


    const extraBrushPadding = 20;
const brush = d3.brush()
    .extent([[0, -extraBrushPadding], [chartWidth, adjustedChartHeight + extraBrushPadding]])
    .on("end", brushed);

chartGroup.append("g")
    .attr("class", "brush")
    .call(brush);


    const squares = chartGroup.selectAll(".set-square")
    .data(uniqueSets, d => d.name)  // key function improves performance
    .join(
        enter => enter.append("rect")
            .attr("class", "set-square set-rect")
            .attr("width", 8)
            .attr("height", 8)
            .attr("stroke", "black")
            .attr("fill", d => d.baseColor)
            .on("mouseover", function (event, d) {
                const rect = d3.select(this);

                rect
                    .attr("fill", d.highlightColor)
                    .classed("hover-temp", true);
                // Set content first so dimensions are accurate
                tooltip
                    .style("display", "block")
                    .html(`
                        <strong>${d.name}</strong><br>
                        ${d.releaseDate.toDateString()}<br>
                        Type: ${d.setType}<br>
                        Cards in Set: ${d.cardCount}
                    `);

                const { width: tooltipWidth, height: tooltipHeight } = tooltip.node().getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                const horizontalPadding = 10;
                const verticalPadding = 10;

                let left = event.pageX + horizontalPadding;
                if (left + tooltipWidth > viewportWidth) {
                    // Flip to left side
                    left = event.pageX - tooltipWidth - horizontalPadding;
                }
                if (left < 0) left = horizontalPadding;

                let top = event.pageY + verticalPadding;
                if (top + tooltipHeight > viewportHeight) {
                    // Flip above
                    top = event.pageY - tooltipHeight - verticalPadding;
                }
                if (top < 0) top = verticalPadding;

                tooltip
                    .style("left", `${left}px`)
                    .style("top", `${top}px`);
                
                highlightAllViewsForSet(d.name); // Highlight all views for this set
            })
                .on("mouseout", function (event, d) {
                const rect = d3.select(this);
                rect.classed("hover-temp", false);

                const isSelectedHovered = rect.classed("selectedHovered");
                rect.attr("fill", isSelectedHovered ? d.selectedColor : d.baseColor);
                d3.select("#tooltip").style("display", "none");
                clearAllViewsHoverOnly(); // Clear highlights in all views
            })
             .on("click", function (event, d) {
                const isSelected = activeTimelineSelections.sets.has(d.name);
            
                if (isSelected) {
                    activeTimelineSelections.sets.delete(d.name);
                } else {
                    activeTimelineSelections.sets.add(d.name);
                }
                updateTimelineSelections();
                emitTimelineSetClick({
            name: d.name,
            releaseDate: d.releaseDate,
            setType: d.setType,
            cardCount: d.cardCount,
            originalities: new Set(d.originalities),
            rarities: new Set(d.rarities),
            colorIdentities: new Set(d.colorIdentities)
        });

            })

.on("contextmenu", function (event, d) {
    event.preventDefault();

    const updatedFilters = getClonedFilters();
    if (!updatedFilters["Set Names"]) {
        updatedFilters["Set Names"] = new Set();
    }

    const isSelected = updatedFilters["Set Names"].has(d.name);
    if (isSelected) {
        updatedFilters["Set Names"].delete(d.name);

    } else {
        updatedFilters["Set Names"].add(d.name);

    }

    updateState({
        selectedFilters: updatedFilters,
        updateContext: "TimelineFilter"
    });


}),
        update => update, // leave unchanged
        exit => exit.remove()
    )
    .attr("x", d => xScale(d.releaseDate) - 2.5)
    .attr("y", d => yScale(d.setType) - 5);

                
        
        const selectedSetNames = localSelectedSetNames;

        squares.attr("fill", d =>
            selectedSetNames.has(d.name) ? d.selectedColor : d.baseColor
        );
        
    
 
    chartGroup.selectAll(".set-type-label")
    .data(selectedSetTypes, d => d)  // key by type string
    .join(
        enter => enter.append("text")
            .attr("class", "set-type-label")
            .attr("x", -10)
            .attr("text-anchor", "end")
            .attr("font-size", "12px")
            .attr("fill", "black")
            .text(d => d)
.on("click", function (event, type) {
    const isAlreadySelected = [...activeTimelineSelections.sets]
        .every(name => {
            const set = uniqueSets.find(s => s.name === name);
            return set?.setType !== type;
        });

    if (isAlreadySelected) {
        activeTimelineSelections.setTypes.add(type);
        uniqueSets.forEach(set => {
            if (set.setType === type) {
                activeTimelineSelections.sets.add(set.name);
            }
        });
    } else {
        // ❌ Remove all sets of this type
        activeTimelineSelections.setTypes.delete(type);
        uniqueSets.forEach(set => {
            if (set.setType === type) {
                activeTimelineSelections.sets.delete(set.name);
            }
        });
    }

    emitTimelineSetTypeClick({
        type,
        releaseDates: setTypeStats.get(type)?.releaseDates || new Set(),
        originalities: setTypeStats.get(type)?.originalities || new Set(),
        rarities: setTypeStats.get(type)?.rarities || new Set(),
        colorIdentities: setTypeStats.get(type)?.colorIdentities || new Set()
    });

    updateTimelineSelections();
})

            .on("contextmenu", function (event, type) {
              event.preventDefault();

              const updatedFilters = getClonedFilters();


                if (!updatedFilters["Set Types"]) {
                    updatedFilters["Set Types"] = new Set();
                }

                if (updatedFilters["Set Types"].has(type)) {
                    updatedFilters["Set Types"].delete(type);
                } else {
                    updatedFilters["Set Types"].add(type);
                }

                updateState({
                    selectedFilters: updatedFilters,
                    updateContext: "TimelineFilter"
                });

})
            .on("mouseover", function (event, type) {
                d3.select(this).classed("hovered", true);
                const setInfo = setTypeStats.get(type);
                const count = typeCounts.get(type) || 0;
                highlightAllViewsForSetType(type);
                tooltip
                .style("display", "block")
                .html(`<strong>${type}</strong><br>${count} sets`);

                const { width: tooltipWidth, height: tooltipHeight } = tooltip.node().getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const padding = 10;

                let left = event.pageX + padding;
                if (left + tooltipWidth > viewportWidth) {
                    left = event.pageX - tooltipWidth - padding;
                }
                if (left < 0) left = padding;

                let top = event.pageY + padding;
                if (top + tooltipHeight > viewportHeight) {
                    top = event.pageY - tooltipHeight - padding;
                }
                if (top < 0) top = padding;

                tooltip.style("left", `${left}px`)
                    .style("top", `${top}px`);
                

            })
            .on("mouseout", function () {
              d3.select(this).classed("hovered", false);
              clearAllViewsHoverOnly(); // Clear highlights in all views
              
              
              d3.select("#tooltip").style("display", "none"); }),
        update => update,
        exit => exit.remove()
    )
    .attr("y", d => yScale(d) + 5);




    
    
    


function zoomed(event) {
    const transform = event.transform;

    let newXScale;
    if (transform.k === 1) {
        // Fully zoomed out — restore original domain
        newXScale = d3.scaleTime()
            .domain(xScale.domain())  // original domain
            .range(xScale.range());
    } else {
        // Apply zoom transform and clamp domain
        const rescaled = transform.rescaleX(xScale);
        const [minDate, maxDate] = xScale.domain();
        const [newStart, newEnd] = rescaled.domain();

        const clampedStart = d3.max([newStart, minDate]);
        const clampedEnd = d3.min([newEnd, maxDate]);

        if (clampedEnd < clampedStart) return;

        newXScale = d3.scaleTime()
            .domain([clampedStart, clampedEnd])
            .range(xScale.range());
    }

    fixedXAxis.select(".x-axis")
        .transition().duration(100)
        .call(xAxis.scale(newXScale));

    squares.transition().duration(100)
        .attr("x", d => newXScale(d.releaseDate) - 2.5)
        .style("opacity", d => {
            const date = d.releaseDate;
            const [start, end] = newXScale.domain();
            return (date >= start && date <= end) ? 1 : 0;
        });
}



function brushed(event) {
  // 🔒 Skip re-triggered brush ends caused by programmatic .call(brush.move, null)
  if (ignoreNextBrushEnd) {
    ignoreNextBrushEnd = false;
    return;
  }

  if (!event.selection) {
    activeTimelineSelections.sets.clear();
    activeTimelineSelections.setTypes.clear();
    emitClearTimelineBrush();
    updateTimelineSelections();
    return;
  }

  const [[x0, y0], [x1, y1]] = event.selection;
  const brushedSets = [];

  d3.selectAll(".set-rect").each(function (d) {
    const rect = d3.select(this);
    const x = +rect.attr("x");
    const y = +rect.attr("y");
    const width = +rect.attr("width");
    const height = +rect.attr("height");

    if (
      x + width >= x0 &&
      x <= x1 &&
      y + height >= y0 &&
      y <= y1
    ) {
      brushedSets.push({
        name: d.name,
        originalities: new Set(d.originalities),
        rarities: new Set(d.rarities),
        colorIdentities: new Set(d.colorIdentities),
        releaseDate: d.releaseDate,
      });
    }
  });

  if (brushedSets.length === 0) {
    activeTimelineSelections.sets.clear();
    activeTimelineSelections.setTypes.clear();
    emitClearTimelineBrush();
    updateTimelineSelections();
    ignoreNextBrushEnd = true;
    chartGroup.select(".brush").call(brush.move, null); // Clear UI
    return;
  }

  brushedSets.forEach((set) => {
    if (activeTimelineSelections.sets.has(set.name)) {
      activeTimelineSelections.sets.delete(set.name);
    } else {
      activeTimelineSelections.sets.add(set.name);
    }
  });

  updateTimelineSelections();
  emitTimelineBrush(brushedSets);

  ignoreNextBrushEnd = true;
  chartGroup.select(".brush").call(brush.move, null); // Reset UI
}


// Double-click anywhere outside meaningful elements to clear Timeline selections
wrapper.on("dblclick", function(event) {
  const target = d3.select(event.target);

  const isSetRect = target.classed("set-rect");
  const isYearLabel = target.classed("year-tick-timeline");
  const isTypeLabel = target.classed("set-type-label");
  const isInfoIcon = target.classed("timeline-info-icon");

  // Only clear if clicked outside interactive elements
  if (!isSetRect && !isYearLabel && !isTypeLabel && !isInfoIcon) {
    activeTimelineSelections.fromYears.clear();
    activeTimelineSelections.sets.clear();
    activeTimelineSelections.setTypes.clear();
    emitClearTimelineSelections();
    updateTimelineSelections();
  }
});



}

export function highlightTimelineSets(hoveredCards) {
  const rects = d3.selectAll(".set-rect");

  if (!hoveredCards || hoveredCards.length === 0) {
    rects
      .classed("selectedHovered", false)
      .attr("fill", d => d.baseColor);
    return;
  }

  const hoveredSetNames = new Set();
  hoveredCards.forEach(card => {
    (card.all_sets || []).forEach(set => {
      hoveredSetNames.add(set.name.toLowerCase());
    });
  });

  rects.each(function(d) {
    const rect = d3.select(this);
    const isHovered = hoveredSetNames.has(d.name.toLowerCase());

    rect
      .classed("selectedHovered", isHovered)
      .attr("fill", isHovered ? d.selectedColor : d.baseColor);
  });
}


export function highlightTimelineSetsHoverOnly(card) {
    if (!card?.all_sets) return;

    const hoveredSetNames = new Set(
        card.all_sets.map(set => set.name.toLowerCase())
    );

    d3.selectAll(".set-rect")
      .filter(d => hoveredSetNames.has(d.name.toLowerCase()))
      .attr("fill",d => d.highlightColor)
      .classed("hover-temp", true);
}

export function clearTimelineHoverOnly() {
  d3.selectAll(".set-rect").each(function(d) {
    const rect = d3.select(this);
    rect.classed("hover-temp", false);

    const isSelectedHovered = rect.classed("selectedHovered");
    rect.attr("fill", isSelectedHovered ? d.selectedColor : d.baseColor);
  });
}


function highlightTimelineSetsFromIcicle(rectInfo) {
  const [targetIdentity] = [...rectInfo.colorIdentities];
  if (targetIdentity === undefined) return;

  const actualIdentity = targetIdentity === "" ? "Colorless" : targetIdentity;

  d3.selectAll(".set-rect")
    .filter(d => {
      const ids = d.colorIdentities || new Set();
      return ids.has(actualIdentity);
    })
    .classed("hover-temp", true)
    .attr("fill",d => d.highlightColor);
}


function highlightTimelineSetsFromNumColors(numColors) {
  if (numColors === undefined) return;

  d3.selectAll(".set-rect")
    .filter(d => d.numColorsPresent?.has(numColors))
    .classed("hover-temp", true)
    .attr("fill", d => d.highlightColor);

}


function highlightAllViewsForSet(setName) {
  const setEntry = uniqueSets.find(d => d.name === setName);
  if (!setEntry) return;

  emitSetHover({
    name: setEntry.name,
    releaseDate: setEntry.releaseDate,
    setType: setEntry.setType,
    cardCount: setEntry.cardCount,
    originalities: new Set(setEntry.originalities),
    rarities: new Set(setEntry.rarities),
    colorIdentities: new Set(setEntry.colorIdentities),
    numColorsPresent: new Set(setEntry.numColorsPresent)
});
}

function highlightAllViewsForSetType(setType) {
  const setInfo = setTypeStats.get(setType);
  if (!setInfo) return;

  emitSetTypeHover({
    name: setType,
    releaseDates: setInfo.releaseDates,
    originalities: new Set(setInfo.originalities),
    rarities: new Set(setInfo.rarities),
    colorIdentities: new Set(setInfo.colorIdentities),
    numColorsPresent: new Set(setInfo.numColorsPresent),
});
}

function highlightAllViewsForYear(year) {
  const dateObj = new Date(+year, 0, 1); // 👈 Convert numeric year to Date
  

  const yearInfo = yearStats.get(year);
  if (!yearInfo) return;

  emitLineYearHover({
    year: dateObj, // 👈 Send the full Date object
    originalities: yearInfo.originalities,
    rarities: yearInfo.rarities,
    colorIdentities: yearInfo.colorIdentities,
    numColorsPresent: yearInfo.numColorsPresent,
    source: "timeline"
  });
}



function clearAllViewsHoverOnly() {
  emitClearSetHover();

}

export function highlightTimelineSetsFromYearInfo(yearInfo) {
  if (!yearInfo || !yearInfo.year) return;

  const targetYear = yearInfo.year.getFullYear();

  d3.selectAll(".set-rect")
    .filter(d => d.releaseDate.getFullYear() === targetYear)
    .classed("hover-temp", true)
    .attr("fill",d => d.highlightColor);
}

const activeTimelineSelections = {
  fromAlluvialOriginality: new Set(),
  fromAlluvialRarity: new Set(),
  fromAlluvialLinkPairs: new Set(),
  fromIcicleIdentity: new Set(),
  fromIcicleColors: new Set(),
  fromYears: new Set(),
  sets: new Set(),
  setTypes: new Set(),
  setsFromScatterplot: new Set(),
};


onClearSelection(() => {
  activeTimelineSelections.fromAlluvialOriginality.clear();
  activeTimelineSelections.fromAlluvialRarity.clear();
  activeTimelineSelections.fromAlluvialLinkPairs.clear();
  activeTimelineSelections.fromIcicleIdentity.clear();
  activeTimelineSelections.fromIcicleColors.clear();
  activeTimelineSelections.fromYears.clear();
  activeTimelineSelections.sets.clear();
  activeTimelineSelections.setTypes.clear();
  activeTimelineSelections.setsFromScatterplot.clear();
  updateTimelineSelections();
});

onClearAlluvialSelections(() => {
  activeTimelineSelections.fromAlluvialOriginality.clear();
  activeTimelineSelections.fromAlluvialRarity.clear();
  activeTimelineSelections.fromAlluvialLinkPairs.clear();
  updateTimelineSelections();
});

onClearIcicleSelections(() => {
  activeTimelineSelections.fromIcicleIdentity.clear();
  activeTimelineSelections.fromIcicleColors.clear();
  updateTimelineSelections();
});

onScatterplotCards(({ setNames }) => {

  activeTimelineSelections.setsFromScatterplot = new Set(setNames);
  updateTimelineSelections();
});


onAlluvialClick(({ category, value }) => {
  if (!category || !value) return;

  const key = value.toLowerCase();
  let selections;

  if (category === "Originality") {
    selections = activeTimelineSelections.fromAlluvialOriginality;
  } else if (category === "Rarity") {
    selections = activeTimelineSelections.fromAlluvialRarity;
  } else {
    return; // unsupported category
  }

  if (selections.has(key)) {
    selections.delete(key);
  } else {
    selections.add(key);
  }

  updateTimelineSelections();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  const pairKey = `${originality}|${rarity}`;
  const set = activeTimelineSelections.fromAlluvialLinkPairs;

  if (set.has(pairKey)) {
    set.delete(pairKey);
  } else {
    set.add(pairKey);
  }

  updateTimelineSelections();
});

onLineChartClick(({ year }) => {
  if (!year) return;

  const yearStr = year.toString(); // 🔒 ensure it's a string
  const selections = activeTimelineSelections.fromYears;

  if (selections.has(yearStr)) {
    selections.delete(yearStr);
  } else {
    selections.add(yearStr);
  }
  updateTimelineSelections();
});


onLineChartBrush((entries) => {
  const set = activeTimelineSelections.fromYears;
  entries.forEach(({ year}) => {
    if (!year) return;


  if (set.has(year)) {
    set.delete(year);
  } else {
    set.add(year);
  }
  });

 updateTimelineSelections();
});


onClearLineChartBrush(() => {
  activeTimelineSelections.fromYears.clear();

 updateTimelineSelections();
});

onClearScatterplotBrush(() => {
  activeTimelineSelections.setsFromScatterplot.clear();
  updateTimelineSelections();
});

onIcicleClick(({ colorIdentity }) => {
  if (!colorIdentity) return;

  const selections = activeTimelineSelections.fromIcicleIdentity;

  if (selections.has(colorIdentity)) {
    selections.delete(colorIdentity);
  } else {
    selections.add(colorIdentity);
  }

  updateTimelineSelections();
});

onIcicleNumClick(({ numColors }) => {
  if (!numColors) return;

  const selections = activeTimelineSelections.fromIcicleColors;

  if (selections.has(numColors)) {
    selections.delete(numColors);
  } else {
    selections.add(numColors);
  }

  updateTimelineSelections();
});


function updateTimelineSelections() {
  const allRects = d3.selectAll(".set-rect").nodes();

  const onlyScatterplotActive =
    activeTimelineSelections.fromAlluvialOriginality.size === 0 &&
    activeTimelineSelections.fromAlluvialRarity.size === 0 &&
    activeTimelineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeTimelineSelections.fromIcicleIdentity.size === 0 &&
    activeTimelineSelections.fromIcicleColors.size === 0 &&
    activeTimelineSelections.fromYears.size === 0 &&
    activeTimelineSelections.sets.size === 0 &&
    activeTimelineSelections.setTypes.size === 0 &&
    activeTimelineSelections.setsFromScatterplot.size > 0;

  // === NO filters active: reset all
  if (
    activeTimelineSelections.fromAlluvialOriginality.size === 0 &&
    activeTimelineSelections.fromAlluvialRarity.size === 0 &&
    activeTimelineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeTimelineSelections.fromIcicleIdentity.size === 0 &&
    activeTimelineSelections.fromIcicleColors.size === 0 &&
    activeTimelineSelections.fromYears.size === 0 &&
    activeTimelineSelections.sets.size === 0 &&
    activeTimelineSelections.setTypes.size === 0 &&
    activeTimelineSelections.setsFromScatterplot.size === 0
  ) {
    d3.selectAll(".set-rect")
      .classed("selectedHovered", false)
      .attr("fill", d => d.baseColor);
    d3.selectAll(".year-tick-timeline")
      .classed("selected", false);
    d3.selectAll(".set-type-label")
      .classed("selected", false);
    return;
  }

  // === SPECIAL CASE: only scatterplot active
  if (onlyScatterplotActive) {
    for (const rect of allRects) {
      const d = d3.select(rect).datum();
      const isSelected = activeTimelineSelections.setsFromScatterplot.has(d.name);
      d3.select(rect)
        .classed("selectedHovered", isSelected)
        .attr("fill", isSelected ? d.selectedColor : d.baseColor);
    }
    return;
  }

  const alluvialMatches = new Set();
  const icicleMatches = new Set();
  const yearMatches = new Set();
  const timelineMatches = new Set();
  const scatterMatches = new Set();

  for (const rect of allRects) {
    const d = d3.select(rect).datum();

    // === ALLUVIAL GROUP ===
    const hasOrig = [...activeTimelineSelections.fromAlluvialOriginality].some(o =>
      [...(d.originalities || [])].includes(o)
    );
    const hasRare = [...activeTimelineSelections.fromAlluvialRarity].some(r =>
      [...(d.rarities || [])].includes(r)
    );
    const hasLink = [...activeTimelineSelections.fromAlluvialLinkPairs].some(pair => {
      const [o, r] = pair.split("|");
      return [...(d.originalities || [])].includes(o) && [...(d.rarities || [])].includes(r);
    });

    const alluvialMatch = hasOrig || hasRare || hasLink ||
      (
        activeTimelineSelections.fromAlluvialOriginality.size === 0 &&
        activeTimelineSelections.fromAlluvialRarity.size === 0 &&
        activeTimelineSelections.fromAlluvialLinkPairs.size === 0
      );
    if (alluvialMatch) alluvialMatches.add(rect);

    // === ICICLE GROUP ===
    const identityMatch = [...activeTimelineSelections.fromIcicleIdentity].some(id =>
      d.colorIdentities?.has(id)
    ) || activeTimelineSelections.fromIcicleIdentity.size === 0;

    const numColorMatch = [...activeTimelineSelections.fromIcicleColors].some(n =>
      d.numColorsPresent?.has(+n)
    ) || activeTimelineSelections.fromIcicleColors.size === 0;

    if (identityMatch && numColorMatch) icicleMatches.add(rect);

    // === YEAR GROUP ===
    const year = d.releaseDate.getFullYear();
    if (
      activeTimelineSelections.fromYears.size === 0 ||
      activeTimelineSelections.fromYears.has(year.toString())
    ) {
      yearMatches.add(rect);
    }

    // === TIMELINE (Sets OR Set Types) ===
    const hasTimelineMatch =
      activeTimelineSelections.sets.size === 0 &&
      activeTimelineSelections.setTypes.size === 0
        || activeTimelineSelections.sets.has(d.name)
        || activeTimelineSelections.setTypes.has(d.setType);

    if (hasTimelineMatch) timelineMatches.add(rect);

    // === SCATTERPLOT GROUP ===
    if (activeTimelineSelections.setsFromScatterplot.has(d.name)) {
      scatterMatches.add(rect);
    }
  }

  // === INTERSECT logical groups
  const intersected = new Set(
    [...allRects].filter(rect =>
      alluvialMatches.has(rect) &&
      icicleMatches.has(rect) &&
      yearMatches.has(rect) &&
      timelineMatches.has(rect)
    )
  );

  // === UNION with scatterplot
  const finalSelected = new Set([...intersected, ...scatterMatches]);

  for (const rect of allRects) {
    const d = d3.select(rect).datum();
    const isSelected = finalSelected.has(rect);
    d3.select(rect)
      .classed("selectedHovered", isSelected)
      .attr("fill", isSelected ? d.selectedColor : d.baseColor);
  }

  d3.selectAll(".year-tick-timeline")
    .classed("selected", d =>
      activeTimelineSelections.fromYears.has(d.getFullYear().toString())
    );

  d3.selectAll(".set-type-label")
    .classed("selected", d =>
      activeTimelineSelections.setTypes.has(d)
    );
}








function highlightTimelineSetsFromAlluvialCategory(category, value) {
  if (!category || !value) return;

  const lowerValue = value.toLowerCase();

  d3.selectAll(".set-rect")
    .filter(d => {
      if (category === "Originality") {
        return [...(d.originalities || [])].some(o => o === lowerValue);
      } else if (category === "Rarity") {
        return [...(d.rarities || [])].some(r => r === lowerValue);
      }
      return false;
    })
    .classed("hover-temp", true)
    .attr("fill",d => d.highlightColor);
}

function highlightTimelineSetsFromAlluvialLink(originality, rarity) {
  if (!originality || !rarity) return;

  const lowerOrig = originality.toLowerCase();
  const lowerRarity = rarity.toLowerCase();

  d3.selectAll(".set-rect")
    .filter(d => {
      const origMatch = [...(d.originalities || [])].includes(lowerOrig);
      const rarityMatch = [...(d.rarities || [])].includes(lowerRarity);
      return origMatch && rarityMatch;
    })
    .classed("hover-temp", true)
    .attr("fill", d => d.highlightColor);
}