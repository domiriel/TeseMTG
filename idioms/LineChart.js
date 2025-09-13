import { updateState, getState } from "../state.js";
import {
  emitLineYearHover,
  emitClearLineYearHover,
  emitLineChartClick,
  onNumColorsHover,
  onClearNumColorsHover,
  emitLineChartBrush,
  onLineChartClick,
  onHoverCard,
  onClearLineYearHover,
  onClearHover,
  onSetHover,
  onClearSelection,
  onClearAlluvialSelections,
  onClearIcicleSelections,
  onClearTimelineSelections,
  onSetTypeHover,
  onClearSetHover,
  onRectHover,
  onClearRectHover,
  onAlluvialHover,
  onAlluvialClick,
  onAlluvialLinkClick,
  onAlluvialLink,
  emitClearLineChartBrush,
  onIcicleClick,
  onIcicleNumClick,
  onClearAlluvialHover,
  onAlluvialLinkHover,
  onClearAlluvialLinkHover,
  onTimelineSetClick,
  onLineYearHover,
  onTimelineBrush,
  onScatterplotCards,
  onClearScatterplotBrush,
  onClearTimelineBrush,
  onTimelineSetTypeClick,
  emitClearSelection,
} from "./Events.js";
const lineChartTooltipText = `
<strong>Line Chart Interactions:</strong><br>
• <strong>Hover</strong> a circle: View metrics for that year and highlight related elements across views.<br>
• <strong>Click</strong> a circle: Selects/deselects a year, affecting the cards highlighted in other views.<br>
• <strong>Right-click</strong> a circle: Toggles a global Year filter for that year.<br>
• <strong>Brush</strong> the timeline: Selects/Diselects multiple years .<br>
• <strong>Scroll</strong>: Zoom in/out on the Line chart.<br>
• <strong>Right-click drag</strong> or <strong>Ctrl + left-click drag</strong>: Pan the Line chart<br>
• <strong>Double-Click</strong> background: Clears selections made within the Line chart.<br>
`;

const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };
let localSelectedYears = new Set();
let ignoreNextBrushEnd = false;
let currentZoomTransform = d3.zoomIdentity;
onHoverCard((card) => {
  highlightLineChartHoverOnly(card);
});

onClearHover(() => {
  clearLineChartHoverOnly();
});

onSetHover((setInfo) => {
  highlightLineChartHoverOnlyFromSet(setInfo.releaseDate);
});

onSetTypeHover((setInfo) => {
  highlightLineChartHoverOnlyFromSetType(setInfo.releaseDates);
});

onClearSetHover(() => {
  clearLineChartHoverOnly();
});

onRectHover((rectInfo) => {
  highlightLineChartFromIcicle(rectInfo);
});

onLineYearHover((payload) => {
  if (payload.source === "line-chart") return; // ignore self-emitted
  highlightLineChartHoverOnlyFromExternal(payload);
});

onClearLineYearHover(() => {
  clearLineChartHoverOnly();
});

onClearRectHover(() => {
  clearLineChartHoverOnly();
});

onNumColorsHover(({ numColors, originalities, rarities }) => {
  highlightLineChartFromNumColors(numColors);
});

onClearNumColorsHover(() => {
  clearLineChartHoverOnly();
});

onAlluvialHover(({ category, value }) => {
  highlightLineChartFromAlluvialCategory(category, value);
});

onClearAlluvialHover(() => {
  clearLineChartHoverOnly();
});

onAlluvialLinkHover(({ originality, rarity }) => {
  highlightLineChartFromAlluvialLink(originality, rarity);
});

onClearAlluvialLinkHover(() => {
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
  d3.select(containerId).on("contextmenu", (event) => event.preventDefault());
  data = data.filter((card) => card.name !== "Gleemax");

  const groupedData = d3
    .rollups(
      data,
      (cards) => {
        const reprints = cards.filter(
          (c) => c.originality === "functional reprint"
        ).length;
        const avgComplexity = d3.mean(cards, (c) => +c.complexity || 0);
        const avgCMC = d3.mean(cards, (c) => +c.cmc || 0);

        const originalities = new Set();
        const rarities = new Set();
        const colorIdentities = new Set();
        const numColorsPresent = new Set();

        cards.forEach((card) => {
          if (card.originality)
            originalities.add(card.originality.toLowerCase());
          if (card.rarity) rarities.add(card.rarity.toLowerCase());

          let identity;
          let numColors;
          if (!card.color_identity || card.color_identity.length === 0) {
            identity = "Colorless";
            numColors = 0;
          } else {
            identity = card.color_identity
              .slice()
              .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
              .join("");
            numColors = identity.length;
          }
          colorIdentities.add(identity);
          numColorsPresent.add(numColors);
        });
        if (
          cards[0] &&
          new Date(cards[0].release_date).getFullYear() === 2004
        ) {
          cards.forEach((c) => {
            const raw = c.cmc;
            const numeric = +raw;
            if (isNaN(numeric) || numeric > 100) {
              console.warn("Suspicious CMC in 2004:", {
                name: c.name,
                cmc: c.cmc,
                set: c.set_name,
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
          numColorsPresent,
        };
      },
      (d) => new Date(d.release_date).getFullYear()
    )
    .map(([year, values]) => {
      return {
        year: new Date(year, 0, 1),
        ...values,
      };
    })
    .sort((a, b) => a.year - b.year);

  const metrics = [
    { key: "reprints", label: "Functional Reprints", color: "#998066" },
    { key: "avgComplexity", label: "Avg. Complexity", color: "#998066" },
    { key: "avgCMC", label: "Avg. Mana Value", color: "#998066" },
  ];

  const container = d3.select(containerId);

  const containerBounds = container.node().getBoundingClientRect();
  const containerWidth = containerBounds.width;
  const containerHeight = containerBounds.height;

  const margin = { top: 20, right: 21, bottom: 30, left: 50 };
  const width = containerWidth - margin.left - margin.right;
  const chartHeight = (containerHeight * 0.9) / 4;
  const chartSpacing = 15;
  const height = (chartHeight + chartSpacing) * metrics.length - chartSpacing;

  if (isUpdate) {
    container.select(".stacked-line-wrapper").remove();
  }
  const tooltip = d3.select("#tooltip");

  const wrapper = container
    .append("div")
    .attr("class", "stacked-line-wrapper")
    .style("position", "relative")
    .style("width", `${containerWidth}px`);

  const zoom = d3
    .zoom()
    .filter((event) => {
      // Allow wheel events
      if (event.type === "wheel") return true;

      // Allow right-click
      if (event.type === "mousedown" && event.button === 2) return true;

      // Allow if Ctrl key is pressed during any event
      if (event.ctrlKey) return true;

      // Otherwise, ignore the event
      return false;
    }) // 👈 allow zooming ONLY via scroll
    .scaleExtent([1, 20])
    .translateExtent([
      [0, 0],
      [containerWidth, containerHeight],
    ])
    .extent([
      [0, 0],
      [containerWidth, containerHeight],
    ])
    .on("zoom", zoomed);
  const svg = wrapper
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", containerHeight)
    .call(zoom);

  const iconX = containerWidth * 0.985;
  const iconY = containerHeight * 0.04;
  const iconRadius = containerWidth * 0.93 * 0.014;
  const infoTextSize = Math.min(containerWidth * 0.0187, 14);
  const infoGroup = svg
    .append("g")
    .attr("class", "info-icon")
    .attr("transform", `translate(${iconX}, ${iconY})`);

  infoGroup
    .append("circle")
    .attr("r", iconRadius)
    .attr("fill", "#8A9CE4")
    .attr("stroke", "#fff");

  infoGroup
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", `${infoTextSize}px`)
    .attr("font-weight", "bold")
    .attr("fill", "#fff")
    .text("?")
    .attr("pointer-events", "none");

  infoGroup
    .on("mouseover", function (event) {
      d3.select("#tooltip")
        .style("display", "block")
        .html(lineChartTooltipText);
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

      tooltip.style("left", `${x}px`).style("top", `${y}px`);
    })
    .on("mouseout", function () {
      d3.select("#tooltip").style("display", "none");
    });
  const chartGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  const xExtent = d3.extent(groupedData, (d) => d.year);

  const xPadding = (xExtent[1] - xExtent[0]) / 50;

  const firstYear = xExtent[0].getFullYear();
  const lastYear = xExtent[1].getFullYear();
  const yearSpan = lastYear - firstYear;

  let domainStart, domainEnd;
  if (yearSpan === 0) {
    // Add padding: one year before and after
    domainStart = new Date(firstYear - 1, 0, 1);
    domainEnd = new Date(firstYear + 1, 0, 1);
  } else {
    domainStart = new Date(firstYear, 0, 1);
    domainEnd = new Date(lastYear, 11, 31);
  }

  const xScale = d3
    .scaleTime()
    .domain([domainStart, domainEnd])
    .range([10, width-2]);

  window._lineChartXScale = xScale;

  const allYears = groupedData.map((d) => d.year);
  const xAxis = d3
    .axisBottom(xScale)
    .tickValues(allYears)
    .tickFormat(d3.timeFormat("%Y"));

  const yScales = [];
  const linePaths = [];
  const circleGroups = [];
  const xAxisGroups = [];

  svg
    .append("defs")
    .append("clipPath")
    .attr("id", "clip-left-margin")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width + 5)
    .attr("height", containerHeight);

  const sharedHoverLine = svg
    .append("line")
    .attr("class", "hover-line")
    .attr("y1", margin.top)
    .attr("y2", margin.top + height)
    .attr("stroke", "#000")
    .attr("stroke-width", 1)
    .attr("pointer-events", "none")
    .style("display", "none");
  metrics.forEach((metric, i) => {
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(groupedData, (d) => d[metric.key])])
      .nice()
      .range([chartHeight, 4]);

    yScales.push(y);

    const line = d3
      .line()
      .x((d) => xScale(d.year))
      .y((d) => y(d[metric.key]));

    const g = chartGroup
      .append("g")
      .attr("transform", `translate(0, ${i * (chartHeight + chartSpacing)})`);

    const clippedGroup = g
      .append("g")
      .attr("clip-path", "url(#clip-left-margin)");

    const linePath = clippedGroup
      .append("path")

      .datum(groupedData)
      .attr("fill", "none")
      .attr("stroke", metric.color)
      .attr("stroke-width", 2)
      .attr("d", line);

    linePaths.push({ line, path: linePath });

    clippedGroup
      .selectAll("circle")
      .data(groupedData)
      .enter()
      .append("circle")
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => y(d[metric.key]))
      .attr("r", 4)
      .attr("fill", metric.color)
      .attr("data-year", (d) => d.year.getFullYear())
      .style("cursor", "pointer")
      .attr("class", "data-point")
      .on("mouseover", (event, d) => {
        const year = d.year.getFullYear();
        const allMetrics = metrics
          .map((m) => {
            const value = d[m.key];
            const formatted =
              m.key === "reprints"
                ? Math.round(value)
                : value?.toFixed(2) ?? "N/A";
            return `<strong>${m.label}:</strong> ${formatted}`;
          })
          .join("<br/>");

        tooltip.style("display", "block").style("font-size", "16px").html(`
                        <strong>Year:</strong> ${year}<br/>
                        ${allMetrics}
                    `);

        d3.selectAll(`circle.data-point[data-year='${d.year.getFullYear()}']`)
          .classed("hover-temp", true)
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

        tooltip.style("left", left + "px").style("top", mouseY - 20 + "px");
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
        tooltip.style("font-size", "12px");

        d3.selectAll("circle.data-point")
          .classed("hover-temp", false)
          .attr("r", 4)
          .attr("stroke", "none");
        emitClearLineYearHover();
      })
      .on("click", function (event, d) {
        const selectedYear = d.year.getFullYear().toString();

        if (activeLineSelections.fromYears.has(selectedYear)) {
          activeLineSelections.fromYears.delete(selectedYear);
        } else {
          activeLineSelections.fromYears.add(selectedYear);
        }

        updateLineChartSelections(); // 👈 highlight matching years

        emitLineChartClick({
          year: selectedYear,
          originalities: d.originalities,
          rarities: d.rarities,
          source: "line-chart",
        });
      })
      .on("contextmenu", function (event, d) {
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
          updateContext: "TimelineFilter",
        });
      });

    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("start", () => {
        brushing = true;
        brushGroup.select(".overlay").style("pointer-events", "all");
      })
      .on("end", (event) => {
        brushing = false;
        brushed(event);
      });

    const brushGroup = svg
      .append("g")
      .attr("class", "brush")
      .attr("transform", `translate(${margin.left}, ${margin.top})`)
      .call(brush)
      .lower();

    svg
      .append("rect")
      .attr("class", "hover-overlay")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", width)
      .attr("height", height)
      .style("fill", "none")
      .style("pointer-events", "none");

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
      // 🛑 Prevent duplicate triggers
      if (ignoreNextBrushEnd) {
        ignoreNextBrushEnd = false;
        return;
      }

      if (!event.selection) {
        activeLineSelections.fromYears.clear();
        emitClearLineChartBrush();
        updateLineChartSelections();
        ignoreNextBrushEnd = true;
        brushGroup.call(brush.move, null);
        brushGroup.selectAll("*").remove();
        brushGroup.call(brush);
        return;
      }

      const [x0, x1] = event.selection;
      const zoomedX = currentZoomTransform.rescaleX(xScale);

      const startDate = zoomedX.invert(x0);
      const endDate = zoomedX.invert(x1);

      const brushedEntries = groupedData
        .filter((d) => d.year >= startDate && d.year <= endDate)
        .map((d) => {
          const yearStr = d.year.getFullYear().toString();
          return {
            year: yearStr,
            originalities: new Set(d.originalities),
            rarities: new Set(d.rarities),
            colorIdentities: new Set(d.colorIdentities),
          };
        });

      if (brushedEntries.length === 0) {
        activeLineSelections.fromYears.clear();
        emitClearLineChartBrush();
        updateLineChartSelections();
        ignoreNextBrushEnd = true;
        brushGroup.call(brush.move, null);
        brushGroup.selectAll("*").remove();
        brushGroup.call(brush);
        return;
      }

      brushedEntries.forEach((entry) => {
        if (activeLineSelections.fromYears.has(entry.year)) {
          activeLineSelections.fromYears.delete(entry.year);
        } else {
          activeLineSelections.fromYears.add(entry.year);
        }
      });

      updateLineChartSelections();
      emitLineChartBrush(brushedEntries);

      ignoreNextBrushEnd = true;
      brushGroup.call(brush.move, null);
      brushGroup.selectAll("*").remove();
      brushGroup.call(brush);
    }

    circleGroups.push({ group: g, yScale: y, metric });

    g.append("g").call(d3.axisLeft(y).ticks(4));

    g.append("text")
      .attr("x", 5)
      .attr("y", 8)
      .attr("text-anchor", "left")
      .text(metric.label)
      .attr("fill", "#000")
      .attr("font-size", "11px")
      .style("font-weight", "bold");

    const xAxisG = clippedGroup
      .append("g")
      .attr("transform", `translate(0, ${chartHeight})`)
      .call(xAxis);

    xAxisGroups.push({ g: xAxisG, isBottom: i === metrics.length - 1 });

    xAxisG
      .selectAll("text")
      .text(d3.timeFormat("%Y"))
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
    currentZoomTransform = event.transform;
    const newXScale = transform.rescaleX(xScale);

    linePaths.forEach(({ line, path }) => {
      path.attr(
        "d",
        line.x((d) => newXScale(d.year))
      );
    });

    circleGroups.forEach(({ group, yScale, metric }) => {
      group
        .selectAll("circle")
        .attr("cx", (d) => newXScale(d.year))
        .attr("cy", (d) => yScale(d[metric.key]));
    });

    // ✅ Update selection lines to move with zoom
    svg.selectAll(".selected-hover-line").each(function () {
      const line = d3.select(this);
      const time = +line.attr("data-timestamp"); // stored below
      const x = transform.applyX(xScale(new Date(time))) + margin.left;

      line.attr("x1", x).attr("x2", x);
    });

    xAxisGroups.forEach(({ g, isBottom }) => {
      g.call(
        d3
          .axisBottom(newXScale)
          .tickValues(allYears)
          .tickFormat(d3.timeFormat("%Y"))
      );

      g.selectAll("text")
        .text(d3.timeFormat("%Y"))
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end")
        .attr("font-size", "10px");

      if (!isBottom) {
        g.selectAll("text").remove();
      }
    });
  }
  svg.on("dblclick", function (event) {
    const target = d3.select(event.target);

    const isCircle = target.classed("data-point");
    const isText = target.node().tagName === "text";
    const isInfoIcon =
      target.classed("info-icon") || target.node().closest(".info-icon");

    if (!isCircle && !isText && !isInfoIcon) {
      // Clear all timeline-related selections
      emitClearSelection()
      updateLineChartSelections(); // re-render
    }
  });
}

export function highlightLineChart(hoveredCards) {
  const svg = d3.select(".LineChart svg");
  if (svg.empty()) return;

  const years = new Set(
    hoveredCards.map((card) => {
      const date = new Date(card.release_date);
      return new Date(date.getFullYear(), 0, 1).getTime();
    })
  );

  svg.selectAll(".highlight-hover-line").remove();

  years.forEach((time) => {
    svg
      .append("line")
      .attr("class", "highlight-hover-line")
      .attr("x1", (d) => {
        const x = getXCoordFromYear(new Date(time), svg);
        return x;
      })
      .attr("x2", (d) => {
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

function drawVerticalLinesForYears(years) {
  const svg = d3.select(".LineChart svg");
  if (svg.empty()) return;

  svg.selectAll(".highlight-hover-line").remove(); // clear existing lines

  const y1 = +svg.select(".hover-line").attr("y1");
  const y2 = +svg.select(".hover-line").attr("y2");
  const marginLeft =
    +svg
      .select(".stacked-line-wrapper svg g")
      .attr("transform")
      ?.match(/translate\(([\d.]+)/)?.[1] || 0;

  const xScaleZoomed = currentZoomTransform.rescaleX(window._lineChartXScale);
  const visibleXMin = marginLeft;
  const visibleXMax = marginLeft + window._lineChartXScale.range()[1];

  years.forEach((time) => {
    const date = new Date(+time);
    const x = xScaleZoomed(date) + marginLeft;

    // ❌ Skip if not in visible X range
    if (x < visibleXMin || x > visibleXMax) return;

    svg
      .append("line")
      .attr("class", "highlight-hover-line")
      .attr("data-timestamp", time)
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", y1)
      .attr("y2", y2)
      .attr("stroke", "#f2c46e")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 2");
  });
}


function getXCoordFromYear(date, svg) {
  if (!window._lineChartXScale) return 0;
  const marginLeft =
    +svg
      .select(".stacked-line-wrapper svg g")
      .attr("transform")
      ?.match(/translate\(([\d.]+)/)?.[1] || 0;
  return window._lineChartXScale(date) + marginLeft;
}
export function highlightLineChartHoverOnly(card) {
  if (!card?.release_date) return;

  const year = new Date(card.release_date).getFullYear().toString();

  d3.select(".LineChart")
    .selectAll(`circle.data-point[data-year='${year}']`)
    .classed("hover-temp", true);

  const timestamp = new Date(+year, 0, 1).getTime();
  drawVerticalLinesForYears([timestamp]);
}

function highlightLineChartFromIcicle(rectInfo) {
  const { years } = rectInfo;
  if (!years || years.size === 0) return;

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const year = this.getAttribute("data-year");
      return years.has(year);
    });

  const timestamps = Array.from(years).map((y) => new Date(+y, 0, 1).getTime());
  drawVerticalLinesForYears([...new Set(timestamps)]);
}
export function clearLineChartHoverOnly() {
  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", false);
  d3.select(".LineChart svg").selectAll(".highlight-hover-line").remove();
}

export function highlightLineChartHoverOnlyFromSet(setReleaseDate) {
  if (!setReleaseDate) return;

  const year = setReleaseDate.getFullYear().toString();

  d3.select(".LineChart")
    .selectAll(`circle.data-point[data-year='${year}']`)
    .classed("hover-temp", true);

  const timestamp = new Date(+year, 0, 1).getTime();
  drawVerticalLinesForYears([timestamp]);
}
export function highlightLineChartHoverOnlyFromSetType(setTypeReleaseDates) {
  if (!setTypeReleaseDates) return;

  const years = Array.from(setTypeReleaseDates).map((date) =>
    date.getFullYear().toString()
  );

  const circles = d3.select(".LineChart").selectAll("circle.data-point");

  circles.each(function () {
    const circle = d3.select(this);
    const year = circle.attr("data-year");
    if (years.includes(year)) {
      circle.classed("hover-temp", true);
    }
  });

  const yearTimestamps = years.map((y) => new Date(+y, 0, 1).getTime());
  drawVerticalLinesForYears([...new Set(yearTimestamps)]);
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
    numColorsPresent: new Set(entry.numColorsPresent),
    source: "line-chart",
  });
}

function clearAllViewsHoverOnly() {
  emitClearLineYearHover();
}

const activeLineSelections = {
  fromAlluvialOriginality: new Set(),
  fromAlluvialRarity: new Set(),
  fromAlluvialLinkPairs: new Set(),
  fromIcicleIdentity: new Set(),
  fromIcicleColors: new Set(),
  fromYears: new Set(),
  yearsFromTimelineSets: new Map(),
  yearsFromSetTypes: new Map(),
  yearsFromScatterplotCards: new Set(),
};

onClearSelection(() => {
  activeLineSelections.fromAlluvialOriginality.clear();
  activeLineSelections.fromAlluvialRarity.clear();
  activeLineSelections.fromAlluvialLinkPairs.clear();
  activeLineSelections.fromIcicleIdentity.clear();
  activeLineSelections.fromIcicleColors.clear();
  activeLineSelections.fromYears.clear();
  activeLineSelections.yearsFromTimelineSets.clear();
  activeLineSelections.yearsFromSetTypes.clear();
  activeLineSelections.yearsFromScatterplotCards.clear();
  updateLineChartSelections();
});

onClearAlluvialSelections(() => {
  activeLineSelections.fromAlluvialOriginality.clear();
  activeLineSelections.fromAlluvialRarity.clear();
  activeLineSelections.fromAlluvialLinkPairs.clear();
  updateLineChartSelections();
});

onClearIcicleSelections(() => {
  activeLineSelections.fromIcicleColors.clear();
  activeLineSelections.fromIcicleIdentity.clear();
  updateLineChartSelections();
});

onClearTimelineSelections(() => {
  activeLineSelections.yearsFromTimelineSets.clear();
  activeLineSelections.yearsFromSetTypes.clear();
  updateLineChartSelections();
});

onAlluvialClick(({ category, value }) => {
  if (!category || !value) return;

  const key = value.toLowerCase();
  let selections;

  if (category === "Originality") {
    selections = activeLineSelections.fromAlluvialOriginality;
  } else if (category === "Rarity") {
    selections = activeLineSelections.fromAlluvialRarity;
  } else {
    return; // unsupported category
  }

  if (selections.has(key)) {
    selections.delete(key);
  } else {
    selections.add(key);
  }

  updateLineChartSelections();
});
onScatterplotCards(({ years }) => {
  const stringYears = new Set([...years].map((y) => y.toString()));
  activeLineSelections.yearsFromScatterplotCards = stringYears;
  updateLineChartSelections();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  const pairKey = `${originality}|${rarity}`;
  const set = activeLineSelections.fromAlluvialLinkPairs;

  if (set.has(pairKey)) {
    set.delete(pairKey);
  } else {
    set.add(pairKey);
  }

  updateLineChartSelections();
});

onAlluvialLink((pairSets) => {
  activeLineSelections.fromAlluvialLinkPairs = new Set(pairSets)
  updateLineChartSelections();
});

onTimelineBrush((entries) => {
  const store = activeLineSelections.yearsFromTimelineSets;

  entries.forEach(({ name, releaseDate }) => {
    if (!name || !releaseDate) return;

    const yearStr = releaseDate.getFullYear().toString();

    if (store.has(name)) {
      store.delete(name); // toggle off
    } else {
      store.set(name, yearStr); // toggle on
    }
  });

  updateLineChartSelections();
});

onClearScatterplotBrush(() => {
  activeLineSelections.yearsFromScatterplotCards.clear();
  updateLineChartSelections();
});

onClearTimelineBrush(() => {
  activeLineSelections.yearsFromTimelineSets.clear();
  activeLineSelections.yearsFromSetTypes.clear();
  updateLineChartSelections();
});

onTimelineSetClick((setInfo) => {
  const { name, releaseDate } = setInfo;
  if (!name || !releaseDate) return;

  const yearStr = releaseDate.getFullYear().toString();

  if (activeLineSelections.yearsFromTimelineSets.has(name)) {
    activeLineSelections.yearsFromTimelineSets.delete(name);
  } else {
    activeLineSelections.yearsFromTimelineSets.set(name, yearStr);
  }

  updateLineChartSelections();
});

onTimelineSetTypeClick((setInfo) => {
  const { type, releaseDates } = setInfo;
  if (!type || !releaseDates) return;

  const yearStrings = Array.from(releaseDates).map((d) =>
    d.getFullYear().toString()
  );
  const targetSet = activeLineSelections.yearsFromSetTypes;

  const isAlreadySelected = targetSet.has(type);

  if (isAlreadySelected) {
    targetSet.delete(type); // ❌ Remove the type's years
  } else {
    targetSet.set(type, new Set(yearStrings)); // ✅ Add the type's years
  }

  updateLineChartSelections();
});

onIcicleClick(({ colorIdentity, numColors }) => {
  if (!colorIdentity) return;

  const selections = activeLineSelections.fromIcicleIdentity;
  const numSelections = activeLineSelections.fromIcicleColors
  if (selections.has(colorIdentity)) {
    selections.delete(colorIdentity);
    if(selections.size === 0){
        numSelections.clear()
      }
  } else {
    selections.add(colorIdentity);
    numSelections.add(numColors)
  }

  updateLineChartSelections();
});

onLineChartClick(({ year, source }) => {
  if (source === "line-chart") return;
  const set = activeLineSelections.fromYears;
  if (set.has(year)) {
    set.delete(year);
  } else {
    set.add(year);
  }

  updateLineChartSelections();
});

onIcicleNumClick(({ numColors, colorIdentities }) => {
  if (!numColors || !colorIdentities) return;

  const groupSet = activeLineSelections.fromIcicleColors;
  const identitySet = activeLineSelections.fromIcicleIdentity;

  const isGroupSelected = groupSet.has(numColors);

  if (isGroupSelected) {
    groupSet.delete(numColors);
    colorIdentities.forEach((id) => identitySet.delete(id));
  } else {
    groupSet.add(numColors);
    colorIdentities.forEach((id) => identitySet.add(id));
  }

  updateLineChartSelections();
});


function updateLineChartSelections() {
  console.log(activeLineSelections)
  const svg = d3.select(".LineChart svg");
  if (svg.empty()) return;

  svg.selectAll(".selected-hover-line").remove();

  const noSelections =
    activeLineSelections.fromAlluvialOriginality.size === 0 &&
    activeLineSelections.fromAlluvialRarity.size === 0 &&
    activeLineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeLineSelections.fromIcicleIdentity.size === 0 &&
    activeLineSelections.yearsFromTimelineSets.size === 0 &&
    activeLineSelections.yearsFromSetTypes.size === 0 &&
    activeLineSelections.fromYears.size === 0 &&
    activeLineSelections.yearsFromScatterplotCards.size === 0;
  if (noSelections) {
    return;
  }

  const matchingYears = new Set();

  const onlyScatterplotActive =
    activeLineSelections.fromAlluvialOriginality.size === 0 &&
    activeLineSelections.fromAlluvialRarity.size === 0 &&
    activeLineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeLineSelections.fromIcicleIdentity.size === 0 &&
    activeLineSelections.yearsFromTimelineSets.size === 0 &&
    activeLineSelections.yearsFromSetTypes.size === 0 &&
    activeLineSelections.fromYears.size === 0 &&
    activeLineSelections.yearsFromScatterplotCards.size > 0;

  svg.selectAll("circle.data-point").each(function () {
    const d = d3.select(this).datum();
    if (!d) return;

    const yearStr = d.year.getFullYear().toString();
    const yearTime = d.year.getTime();

    if (onlyScatterplotActive) {
      if (activeLineSelections.yearsFromScatterplotCards.has(yearStr)) {
        matchingYears.add(yearTime);
      }
      return;
    }

    // --- Group 1: Alluvial ---
    let alluvialMatch = true;
    const origMatch = [...activeLineSelections.fromAlluvialOriginality].some(
      (val) => d.originalities?.has(val)
    );
    const rarityMatch = [...activeLineSelections.fromAlluvialRarity].some(
      (val) => d.rarities?.has(val)
    );
    const linkPairMatch = [...activeLineSelections.fromAlluvialLinkPairs].some(
      (pair) => {
        const [orig, rare] = pair.split("|");
        return d.originalities?.has(orig) && d.rarities?.has(rare);
      }
    );

    if (
      activeLineSelections.fromAlluvialOriginality.size > 0 ||
      activeLineSelections.fromAlluvialRarity.size > 0 ||
      activeLineSelections.fromAlluvialLinkPairs.size > 0
    ) {
      alluvialMatch = origMatch || rarityMatch || linkPairMatch;
    }

    // --- Group 2: Icicle ---
    let icicleMatch = true;
    const identityMatch = [...activeLineSelections.fromIcicleIdentity].some(
      (val) => d.colorIdentities?.has(val)
    );

    if (
      activeLineSelections.fromIcicleIdentity.size > 0 
    ) {
      icicleMatch = identityMatch 
    }

    // --- Group 3: Timeline ---
    let timelineMatch = true;
    const matchFromSets = [
      ...activeLineSelections.yearsFromTimelineSets.values(),
    ].includes(yearStr);
    const matchFromSetTypes = [
      ...activeLineSelections.yearsFromSetTypes.values(),
    ].some((set) => set.has(yearStr));

    if (
      activeLineSelections.yearsFromTimelineSets.size > 0 ||
      activeLineSelections.yearsFromSetTypes.size > 0
    ) {
      timelineMatch = matchFromSets || matchFromSetTypes;
    }

    // --- Group 4: Explicit Year Selection ---
    let yearGroupMatch = true;
    if (activeLineSelections.fromYears.size > 0) {
      yearGroupMatch = activeLineSelections.fromYears.has(yearStr);
    }

    const isIntersected =
      alluvialMatch && icicleMatch && timelineMatch && yearGroupMatch;

    const isScatterMatch =
      activeLineSelections.yearsFromScatterplotCards.has(yearStr);

    if (isIntersected || isScatterMatch) {
      matchingYears.add(yearTime);
    }
  });

  // --- Draw matching year lines ---
  const y1 = +svg.select(".hover-line").attr("y1");
  const y2 = +svg.select(".hover-line").attr("y2");
  const marginLeft =
    +svg
      .select(".stacked-line-wrapper svg g")
      .attr("transform")
      ?.match(/translate\(([\d.]+)/)?.[1] || 0;

  matchingYears.forEach((t) => {
    const date = new Date(+t);
    const x =
      currentZoomTransform.applyX(window._lineChartXScale(date)) + marginLeft;

    svg
      .append("line")
      .attr("class", "selected-hover-line")
      .attr("data-timestamp", t)
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", y1)
      .attr("y2", y2)
      .attr("stroke", "#9AA0BC")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 2")
      .lower();
  });
}

function highlightLineChartFromAlluvialCategory(category, value) {
  if (!category || !value) return;

  const lowerValue = value.toLowerCase();
  const matchedYears = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const d = d3.select(this).datum();
      let match = false;

      if (category === "Originality") {
        match = d?.originalities?.has(lowerValue);
      } else if (category === "Rarity") {
        match = d?.rarities?.has(lowerValue);
      }

      if (match) {
        matchedYears.push(d.year.getTime());
      }
      return match;
    });

  drawVerticalLinesForYears([...new Set(matchedYears)]);
}

function highlightLineChartFromAlluvialLink(originality, rarity) {
  if (!originality || !rarity) return;

  const lowerOrig = originality.toLowerCase();
  const lowerRarity = rarity.toLowerCase();

  const matchedYears = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const d = d3.select(this).datum();
      const match =
        d?.originalities?.has(lowerOrig) && d?.rarities?.has(lowerRarity);
      if (match) {
        matchedYears.push(d.year.getTime());
      }
      return match;
    });

  drawVerticalLinesForYears([...new Set(matchedYears)]);
}

function highlightLineChartFromNumColors(numColors) {
  if (numColors === undefined || numColors === null) return;

  const matchedYears = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const d = d3.select(this).datum();
      const match = d?.numColorsPresent?.has(numColors);
      if (match) {
        matchedYears.push(d.year.getTime());
      }
      return match;
    });

  drawVerticalLinesForYears([...new Set(matchedYears)]);
}

function highlightLineChartHoverOnlyFromExternal(payload) {
  const year = new Date(payload.year).getFullYear().toString();
  d3.select(".LineChart")
    .selectAll(`circle.data-point[data-year='${year}']`)
    .classed("hover-temp", true);

  const timestamp = new Date(+year, 0, 1).getTime();
  drawVerticalLinesForYears([timestamp]);
}
