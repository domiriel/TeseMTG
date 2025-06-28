
import { updateState, getState } from "../state.js";
import { onHoverCard, onClearHover, onSetHover, onClearSetHover, onRectHover, onClearRectHover, emitLineYearHover, emitClearLineYearHover,onAlluvialHover, onClearAlluvialHover   } from "./Events.js";
const lineChartTooltipText = `
<strong>Timeline Interactions:</strong><br>
• <strong>Hover</strong> a circle: view year and metrics.<br>
• <strong>Click</strong> a circle: toggle year filter.<br>
• <strong>Brush</strong> across timeline: multi-select years.<br>
• <strong>Hover</strong> a line: inspect metric value at that year.<br>
• <strong>Zoom</strong>: scroll to focus a time range.<br>
`;

const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };
let localSelectedYears = new Set();
onHoverCard(card => {
  highlightLineChartHoverOnly(card);
});

onClearHover(() => {
  clearLineChartHoverOnly();
});

onSetHover(setInfo => {

 highlightLineChartHoverOnlyFromSet(setInfo.releaseDate);
})

onClearSetHover(() => {
  clearLineChartHoverOnly();
})

onRectHover(rectInfo => {
highlightLineChartFromIcicle(rectInfo)
})

onClearRectHover(() => {
  clearLineChartHoverOnly()
})

onAlluvialHover(({ category, value }) => {
  highlightLineChartFromAlluvialCategory(category, value);
});

onClearAlluvialHover(() => {
  clearLineChartHoverOnly();
});


let brushing = false;

function getClonedFilters() {
    const currentState = getState();
    const cloned = {};
    for (const key in currentState.selectedFilters) {
        cloned[key] = new Set(currentState.selectedFilters[key]);
    }
    return cloned;
}
export function createStackedLineChart(data, containerId, isUpdate = false) {
    d3.select(containerId).selectAll("*").remove();

    
    data = data.filter(card => card.name !== "Gleemax");

    const groupedData = d3.rollups(
        data,
        cards => {
            const reprints = cards.filter(c => c.originality === 'functional reprint').length;
            const avgComplexity = d3.mean(cards, c => +c.complexity || 0);
            const avgCMC = d3.mean(cards, c => +c.cmc || 0);
            
            const originalities = new Set();
            const rarities = new Set();
            const colorIdentities = new Set();

            cards.forEach(card => {
      if (card.originality) originalities.add(card.originality.toLowerCase());
      if (card.rarity) rarities.add(card.rarity.toLowerCase());

      let identity;
      if (!card.color_identity || card.color_identity.length === 0) {
        identity = "Colorless";
      } else {
        identity = card.color_identity.slice().sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b]).join("");
      }
      colorIdentities.add(identity);
    });
            if (cards[0] && new Date(cards[0].release_date).getFullYear() === 2004) {
                cards.forEach(c => {
                    const raw = c.cmc;
                    const numeric = +raw;
                    if (isNaN(numeric) || numeric > 100) {
                        console.warn("Suspicious CMC in 2004:", {
                            name: c.name,
                            cmc: c.cmc,
                            set: c.set_name
                        });
                    }
                });
            }
            return {
                
                reprints,
                avgComplexity,
                avgCMC,
                originalities,
                rarities,
                colorIdentities,
            };
        },
        d => new Date(d.release_date).getFullYear()
    )
    .map(([year, values]) => {

        return {
            year: new Date(year, 0, 1),
            ...values
        };
    })
    .sort((a, b) => a.year - b.year);

    const metrics = [
        { key: "reprints", label: "Func. Reprints", color: "#998066" },
        { key: "avgComplexity", label: "Avg. Complexity", color: "#998066" },
        { key: "avgCMC", label: "Avg. MV", color: "#998066" }
    ];
    
    const container = d3.select(containerId);

    const containerBounds = container.node().getBoundingClientRect();
    const containerWidth = containerBounds.width;
    const containerHeight = containerBounds.height;

    const margin = { top: 20, right: 21, bottom: 30, left: 60 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = containerHeight*0.9 / 4; 
    const chartSpacing = 15;
    const height = (chartHeight + chartSpacing) * metrics.length - chartSpacing; 


    if (isUpdate) {
        container.select(".stacked-line-wrapper").remove();
    }
    const tooltip = d3.select("#tooltip");

    const wrapper = container.append("div")
        .attr("class", "stacked-line-wrapper")
        .style("position", "relative")
        .style("width", `${containerWidth}px`);


    const zoom = d3.zoom()
    .filter(event => event.type === "wheel") // 👈 allow zooming ONLY via scroll
    .scaleExtent([1, 20])
    .translateExtent([[0, 0], [containerWidth, containerHeight]])
    .extent([[0, 0], [containerWidth, containerHeight]])
    .on("zoom", zoomed);
    const svg = wrapper.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight)
        .call(zoom);


 const iconX = containerWidth * 0.03;
const iconY = containerHeight * 0.07;
const iconRadius = containerWidth*0.93 * 0.015;
const infoTextSize = Math.min(containerWidth * 0.0187, 15);
const infoGroup = svg.append("g")
  .attr("class", "info-icon")
  .attr("transform", `translate(${iconX}, ${iconY})`);

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
  .text("ℹ")
  .attr("pointer-events", "none");


  infoGroup
  .on("mouseover", function(event) {
    d3.select("#tooltip")
      .style("display", "block")
      .html(lineChartTooltipText);
  })
  .on("mousemove", function(event) {
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
  .on("mouseout", function() {
    d3.select("#tooltip").style("display", "none");
  });
    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const xExtent = d3.extent(groupedData, d => d.year);

    
    const xPadding = (xExtent[1] - xExtent[0]) / 50;
    
    const xScale = d3.scaleTime()
        .domain([new Date(xExtent[0].getTime()), new Date(xExtent[1].getTime())])
        .range([10, width]);
    
    window._lineChartXScale = xScale;



    const allYears = groupedData.map(d => d.year);

    const xAxis = d3.axisBottom(xScale)
            .tickValues(allYears)
            .tickFormat(d3.timeFormat("%Y"));
        

    

    const yScales = [];
    const linePaths = [];
    const circleGroups = [];
    const xAxisGroups = [];


    svg.append("defs").append("clipPath")
        .attr("id", "clip-left-margin")
        .append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", width+ 11)  
        .attr("height", containerHeight);  



    const sharedHoverLine = svg.append("line")
        .attr("class", "hover-line")
        .attr("y1", margin.top)
        .attr("y2", margin.top + height)  
        .attr("stroke", "#000")
        .attr("stroke-width", 1)
        .attr("pointer-events", "none")
        .style("display", "none");
    metrics.forEach((metric, i) => {
        const y = d3.scaleLinear()
        .domain([
            0,
            d3.max(groupedData, d => d[metric.key])
        ])
        .nice()
        .range([chartHeight, 4]);

        yScales.push(y);

        const line = d3.line()
            .x(d => xScale(d.year))
            .y(d => y(d[metric.key]));

        const g = chartGroup.append("g")
            .attr("transform", `translate(0, ${i * (chartHeight + chartSpacing)})`);

        const clippedGroup = g.append("g")
        .attr("clip-path", "url(#clip-left-margin)");


        const linePath = clippedGroup.append("path")

        .datum(groupedData)
        .attr("fill", "none")
        .attr("stroke", metric.color)
        .attr("stroke-width", 2)
        .attr("d", line);

        linePaths.push({ line, path: linePath });


        clippedGroup.selectAll("circle")
            .data(groupedData)
            .enter()
            .append("circle")
            .attr("cx", d => xScale(d.year))
            .attr("cy", d => y(d[metric.key]))
            .attr("r", 4)
            .attr("fill", metric.color)
            .attr("data-year", d => d.year.getFullYear()) 
            .style("cursor", "pointer")
            .attr("class", "data-point") 
            .on("mouseover", (event, d) => {
                const year = d.year.getFullYear();

                const allMetrics = metrics.map(m => {
                    const value = d[m.key];
                    const formatted = m.key === "reprints"
                        ? Math.round(value)             
                        : (value?.toFixed(2) ?? "N/A");
                    return `<strong>${m.label}:</strong> ${formatted}`;
                }).join("<br/>");
            

                tooltip
                    .style("display", "block")
                    .style("font-size", "16px")
                    .html(`
                        <strong>Year:</strong> ${year}<br/>
                        ${allMetrics}
                    `);

            
                d3.selectAll(`circle.data-point[data-year='${d.year.getFullYear()}']`)
                    
                    .attr("stroke", "#000")
                    .attr("stroke-width", 1.5);
                highlightAllViewsForYear(d);

            })
            .on("mousemove", (event) => {
                const [mouseX, mouseY] = d3.pointer(event, document.body); // relative to page

                const tooltipNode = tooltip.node();
                const tooltipWidth = tooltipNode.offsetWidth;
                const tooltipHeight = tooltipNode.offsetHeight;
                const padding = 10;

            
                let left = mouseX + padding;
            
                if (left + tooltipWidth > window.innerWidth) {
                    left = mouseX - tooltipWidth - padding;
                }
            
                tooltip
                    .style("left", left + "px")
                    .style("top", (mouseY - 20) + "px");
            }) 
            .on("mouseout", () => {
                tooltip.style("display", "none");
                tooltip.style("font-size", "12px");

            
                d3.selectAll("circle.data-point")
                    .attr("r", 4)
                    .attr("stroke", "none");
                emitClearLineYearHover();
            })
            .on("click", function(event, d) {
                const selectedYear = d.year.getFullYear().toString();


                if (localSelectedYears.has(selectedYear)) {
                    localSelectedYears.delete(selectedYear);
                } else {
                    localSelectedYears.add(selectedYear);
                }


                d3.selectAll("circle.data-point")
                    .attr("opacity", function() {
                        const year = this.getAttribute("data-year");
                        return localSelectedYears.size === 0 || localSelectedYears.has(year) ? 1 : 0.5;
                    });

            })
            .on("contextmenu", function(event,d){
                event.preventDefault();
                const selectedYear = d.year.getFullYear().toString();
                const updatedFilters = getClonedFilters();

                if (updatedFilters["Year"].has(selectedYear)) {
                    updatedFilters["Year"].delete(selectedYear);
                } else {
                    updatedFilters["Year"].add(selectedYear);
                }

                
                updateState({
                    selectedFilters: updatedFilters,
                    updateContext: "TimelineFilter"
                });

            });

        const brush = d3.brushX()
            .extent([[0, 0], [width, height]])
 .on("start", () => {
    brushing = true;
    brushGroup.select(".overlay").style("pointer-events", "all");
  })
            .on("end", (event) => {
        brushing = false;
        brushed(event);
    });

        const brushGroup = svg.append("g")
    .attr("class", "brush")
    .attr("transform", `translate(${margin.left}, ${margin.top})`)
    .call(brush)
    .lower();
        

         svg.append("rect")
        .attr("class", "hover-overlay")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "none")
        


   svg
  .on("mousemove", (event) => {
    if (brushing) return;

    const [mouseX, mouseY] = d3.pointer(event, svg.node());

    const chartLeft = margin.left;
    const chartRight = margin.left + width;
    const chartTop = margin.top;
    const chartBottom = margin.top + height;

    const isOutside =
      mouseX < chartLeft ||
      mouseX > chartRight ||
      mouseY < chartTop ||
      mouseY > chartBottom;

    if (isOutside) {
      sharedHoverLine.style("display", "none");
      return;
    }

    const date = xScale.invert(mouseX - margin.left);

    sharedHoverLine
      .attr("x1", mouseX)
      .attr("x2", mouseX)
      .style("display", "block");
  })
  .on("mouseout", () => {
    sharedHoverLine.style("display", "none");
  });


    function brushed(event) {
        if (!event.selection) return;

        const [x0, x1] = event.selection;
        const startDate = xScale.invert(x0);
        const endDate = xScale.invert(x1);

        const selectedYears = new Set(
            groupedData
                .filter(d => d.year >= startDate && d.year <= endDate)
                .map(d => d.year.getFullYear().toString())
        );


        const updatedFilters = getClonedFilters();

        selectedYears.forEach(year => {
            if (updatedFilters["Year"].has(year)) {
                updatedFilters["Year"].delete(year);
            } else {
                updatedFilters["Year"].add(year);
            }
        });

        d3.selectAll("circle.data-point")
            .attr("opacity", function() {
                const year = this.getAttribute("data-year");
                return updatedFilters["Year"].size === 0 || updatedFilters["Year"].has(year) ? 1 : 0.5;
            });

        updateState({
            selectedFilters: updatedFilters,
            updateContext: "TimelineFilter"
        });
        brushGroup.call(brush.move, null);
        // Fully remove the brush group
        brushGroup.selectAll("*").remove();

        // Re-append the brush from scratch
        brushGroup.call(brush);


        
        


        }
        circleGroups.push({ group: g, yScale: y, metric });  




        
        g.append("g").call(d3.axisLeft(y).ticks(4));

       
        g.append("text")
            .attr("x", 5)
            .attr("y",8)
            .attr("text-anchor", "left")
            .text(metric.label)
            .attr("fill", "#000")
            .attr("font-size", "11px")
            .style("font-weight", "bold");

       
        
    
        const xAxisG = clippedGroup.append("g")
            .attr("transform", `translate(0, ${chartHeight})`)
            .call(xAxis);

        xAxisGroups.push({ g: xAxisG, isBottom: i === metrics.length - 1 });


        xAxisG.selectAll("text")
        .text(function(d) {
            return d.getFullYear() % 2 === 1 ? d3.timeFormat("%Y")(d) : "";  
        })
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end")
            .attr("font-size", "10px");


        if (i !== metrics.length - 1) {
            xAxisG.selectAll("text").remove();
            xAxisG.selectAll("line").attr("stroke-opacity", 0.3); 
        }

        
    });




   
        






    function zoomed(event) {
        const transform = event.transform;
        const newXScale = transform.rescaleX(xScale);


        linePaths.forEach(({ line, path }) => {
            path.attr("d", line.x(d => newXScale(d.year)));
        });


        circleGroups.forEach(({ group, yScale, metric }) => {
            group.selectAll("circle")
                .attr("cx", d => newXScale(d.year))
                .attr("cy", d => yScale(d[metric.key]));
        });


        xAxisGroups.forEach(({ g, isBottom }) => {
            g.call(d3.axisBottom(newXScale)
                .tickValues(allYears)
                .tickFormat(d3.timeFormat("%Y"))
            );

            g.selectAll("text")
                .text(function(d) {
                    return isBottom && d.getFullYear() % 2 === 1 ? d3.timeFormat("%Y")(d) : "";
                })
                .attr("transform", "rotate(-45)")
                .style("text-anchor", "end")
                .attr("font-size", "10px");

            if (!isBottom) {
                g.selectAll("text").remove();
            }
        });
    }


}

export function highlightLineChart(hoveredCards) {
    const svg = d3.select(".LineChart svg");
    if (svg.empty()) return;

    const years = new Set(
        hoveredCards.map(card => {
            const date = new Date(card.release_date);
            return new Date(date.getFullYear(), 0, 1).getTime(); 
        })
    );

    svg.selectAll(".highlight-hover-line").remove();


    years.forEach(time => {
        svg.append("line")
            .attr("class", "highlight-hover-line")
            .attr("x1", d => {
                const x = getXCoordFromYear(new Date(time), svg);
                return x;
            })
            .attr("x2", d => {
                const x = getXCoordFromYear(new Date(time), svg);
                return x;
            })
            .attr("y1", +svg.select(".hover-line").attr("y1"))
            .attr("y2", +svg.select(".hover-line").attr("y2"))
            .attr("stroke", "#9AA0BC")
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4 2")
            .lower();
    });
}

function getXCoordFromYear(date, svg) {
    if (!window._lineChartXScale) return 0;
    const marginLeft = +svg.select(".stacked-line-wrapper svg g").attr("transform")?.match(/translate\(([\d.]+)/)?.[1] || 0;
    return window._lineChartXScale(date) + marginLeft;
}
export function highlightLineChartHoverOnly(card) {
    if (!card?.release_date) return;

    const year = new Date(card.release_date).getFullYear().toString();

    d3.select(".LineChart").selectAll(`circle.data-point[data-year='${year}']`)
      .classed("hover-temp", true);
}

function highlightLineChartFromIcicle(rectInfo) {
  const { years } = rectInfo;
  if (!years || years.size === 0) return;

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function() {
      const year = this.getAttribute("data-year");
      return years.has(year);
    });
}
export function clearLineChartHoverOnly() {
    d3.select(".LineChart").selectAll("circle.data-point")
      .classed("hover-temp", false);
}


export function highlightLineChartHoverOnlyFromSet(setReleaseDate) {

  if (!setReleaseDate) return;

  const year = setReleaseDate.getFullYear().toString();

  d3.select(".LineChart")
    .selectAll(`circle.data-point[data-year='${year}']`)
    .classed("hover-temp", true);
}

export function highlightAllViewsForYear(entry) {

  if (!entry) return;

  emitLineYearHover({
    year: entry.year,
    reprints: entry.reprints,
    avgComplexity: entry.avgComplexity,
    avgCMC: entry.avgCMC,
    originalities: new Set(entry.originalities),
    rarities: new Set(entry.rarities),
    colorIdentities: new Set(entry.colorIdentities),
  });
}

function clearAllViewsHoverOnly() {
  emitClearLineYearHover();

}

function highlightLineChartFromAlluvialCategory(category, value) {
  if (!category || !value) return;

  const lowerValue = value.toLowerCase();

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function() {
      const d = d3.select(this).datum();
      if (!d) return false;

      if (category === "Originality") {
        return d.originalities?.has(lowerValue);
      } else if (category === "Rarity") {
        return d.rarities?.has(lowerValue);
      }
      return false;
    });
}
