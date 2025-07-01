
import { updateState, getState } from "../state.js";
import { updateFilterPanel } from "./FilterPanel.js";
import { emitSetHover, emitClearHover, onNumColorsHover, onClearNumColorsHover,
        onHoverCard, onClearHover, emitClearSetHover,emitTimelineSetClick, 
        emitYearClick, onRectHover, onClearRectHover, onClearLineYearHover, 
        onLineYearHover, onAlluvialHover, onClearAlluvialHover } from "./Events.js";

let localSelectedYears = new Set();
let localSelectedSetNames = new Set();


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
const countRange = {
  min: d3.min(allCardCounts),
  max: d3.max(allCardCounts)
};

    const numBins = 5;
const countStep = (countRange.max - countRange.min) / numBins;
const dynamicLegendData = Array.from({ length: numBins }, (_, i) => {
  const min = countRange.min + i * countStep;
  const max = countRange.min + (i + 1) * countStep;
  return {
    min,
    max,
    color: getDiscreteColor(i * (100 / numBins)),
    label: `${Math.round(min)}–${Math.round(max-1)}`
  };
}).reverse();

dynamicLegendHTML = dynamicLegendData.map(entry => `
  <div style="display: flex; align-items: center">
    <div style="
      width: 14px;
      height: 14px;
      background-color: ${entry.color};
      border: 1px solid #000;
      margin-right: 6px;
      flex-shrink: 0;
    "></div>
    <span style="font-size: 12px;">${entry.label}</span>
  </div>
`).join("");

    const timelineTooltipText = `
<strong>Timeline Interactions:</strong><br>
• <strong>Click</strong> a year: Selects the dots in the scatterplot that have a print released in that year.<br>
• <strong>Hover</strong> a year: see number of sets and types.<br>
• <strong>Click</strong> a set square: Selects the dots in the scatterplot that have a print released in that set.<br>
• <strong>Right-Click</strong> an element: Filter by the selected element.<br>
• <strong>Search</strong> for a set name using the bar above.<br>
• <strong>Brush</strong>: Filters by the selected sets.<br>
• <strong>Scroll</strong>: Focus on a time range.<br><br>
<strong>Color Legend (Card Count):</strong><br>
${dynamicLegendHTML}
`;
    const yearTypeCounts = new Map();
    const typeCounts = new Map();



    uniqueSets.forEach(set => {
        const percent = ((set.cardCount - countRange.min) / (countRange.max - countRange.min)) * 100;
        set.baseColor = getDiscreteColor(percent)
        set.highlightColor = getHighlightedColor(percent);
  set.selectedColor = getSelectedColor(percent);

        const year = set.releaseDate.getFullYear().toString();
        const type = set.setType;

        if (!yearTypeCounts.has(year)) yearTypeCounts.set(year, new Map());
        if (!yearTypeCounts.get(year).has(type)) yearTypeCounts.get(year).set(type, 0);
        yearTypeCounts.get(year).set(type, yearTypeCounts.get(year).get(type) + 1);

        if (!typeCounts.has(type)) typeCounts.set(type, 0);
        typeCounts.set(type, typeCounts.get(type) + 1);
    });


  
    let allSetTypes = Array.from(new Set(uniqueSets.map(set => set.setType))).sort();
    let selectedSetTypes = allSetTypes.slice(0, 50); 


    uniqueSets = uniqueSets.filter(set => selectedSetTypes.includes(set.setType));

    
    const container = d3.select(containerId);
    const containerBounds = container.node().getBoundingClientRect();

    const containerWidth = containerBounds.width * 0.98;
   
    const searchContainerwidth = containerBounds.width * 0.07;
    const containerHeight = containerBounds.height;
    const chartWidth = containerWidth * 0.927;
    const chartHeight = containerHeight;

    const margin = { 
        top: 50, 
        right: 50, 
        bottom: 10, 
        left: containerWidth * 0.06 
    };


    if (isUpdate) {
        d3.select(containerId).select(".chart-wrapper").remove();
    }


console.log(containerBounds.width)




const iconRadius = containerBounds.width*0.485 * 0.015;
console.log("Icon Radius", iconRadius)
const iconSize = iconRadius * 2;
const infoTextSize = Math.min(containerBounds.width * 0.485 * 0.0187, 15);


//
const infoGroup = container.append("div")
  .attr("class", "timeline-info-icon")
  .style("position", "absolute")
  .style("top", "12px")
  .style("left", "12px")
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

    const xScale = d3.scaleTime()
        .domain([d3.min(uniqueSets, d => d.releaseDate), d3.max(uniqueSets, d => d.releaseDate)])
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


                const isSelected = localSelectedYears.has(year);

                if (isSelected) {
                    localSelectedYears.delete(year);
                } else {
                    localSelectedYears.add(year);
                }

                updateYearTickStyles();
                updateSetRectOpacity();  
                emitYearClick({year});
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

    const year = d.getFullYear().toString();
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
.on("mouseout", () => {
    d3.select("#tooltip").style("display", "none");
});



        



    const scrollContainer = wrapper.append("div")
        .attr("class", "chart-container")
        .style("width", `${containerWidth}px`)
        .style("height", `${containerHeight*0.75}px`) 
        .style("overflow-y", "scroll") 
        .style("overflow-x", "hidden") 
        .style("border", "none");

    const lineSpacingFactor = 0.5;  

    const adjustedChartHeight = selectedSetTypes.length * lineSpacingFactor * 30;

    const svg = scrollContainer.append("svg")
        .attr("width", containerWidth)
        .attr("height", adjustedChartHeight + 20);
    

    const zoom = d3.zoom()
        .filter(event => event.type === "wheel") // 👈 allow zooming ONLY via scroll
        .scaleExtent([1, 10]) 
        .translateExtent([[0, 0], [chartWidth, adjustedChartHeight]])
        .on("zoom", zoomed);
    
    svg.call(zoom);
    
    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, 10)`);

       

        let yScale = d3.scalePoint()
            .domain(selectedSetTypes)
            .range([0, selectedSetTypes.length * lineSpacingFactor * 30]); 
        

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

                const isSelected = localSelectedSetNames.has(d.name);
            
                if (isSelected) {
                    localSelectedSetNames.delete(d.name);
                    d3.select(this).attr("fill", d.baseColor);
                } else {
                    localSelectedSetNames.add(d.name);
                    d3.select(this).attr("fill", d.selectedColor);
                }
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
                const count = typeCounts.get(type) || 0;
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
            .on("mouseout", () => { d3.select("#tooltip").style("display", "none"); }),
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
    if (!event.selection) return;

    const [[x0, y0], [x1, y1]] = event.selection;

    const selected = [];
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
            selected.push(d.name);
        }
    });


    const updatedFilters = getClonedFilters();


    if (!updatedFilters["Set Names"]) {
        updatedFilters["Set Names"] = new Set();
    }

    let changed = false;

    selected.forEach(name => {
        if (!updatedFilters["Set Names"].has(name)) {
            updatedFilters["Set Names"].add(name);
            changed = true;
        }
    });

    if (changed) {
        updateState({
            selectedFilters: updatedFilters,
            updateContext: "TimelineFilter"
        });

        
    }

    d3.select(chartGroup.select(".brush").node()).call(brush.move, null); // Clear brush
    chartGroup.select(".brush").remove();

    // Re-append the brush from scratch
    chartGroup.call(brush);
}

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
      .attr("fill",d => d.highlightColor);
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
    .attr("fill",d => d.highlightColor);
}


function highlightTimelineSetsFromNumColors(numColors) {
  if (numColors === undefined) return;

  d3.selectAll(".set-rect")
    .filter(d => d.numColorsPresent?.has(numColors))
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
    colorIdentities: new Set(setEntry.colorIdentities)
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
    .attr("fill",d => d.highlightColor);
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
    .attr("fill",d => d.highlightColor);
}