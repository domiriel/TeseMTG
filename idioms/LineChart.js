import { toggleGlobalFilter } from "../state.js";
import { lineAggregate } from "../core/index.js";
import {
  setSelected,
  clearSelection,
  getSourcePredicate,
  setHover,
  clearHover,
  onSelectionChange,
  onHoverChange,
  getSelectionSummary,
  getHoverSummary,
} from "./Linking.js";
import { moveTooltip, addInfoIcon } from "./ui.js";

/* =========================================================================
 *  CONSTANTS & CONFIG
 * ========================================================================= */

const lineChartTooltipText = `
<strong>Line Chart Interactions:</strong><br>
• <strong>Hover</strong> a circle: View metrics for that year and highlight related elements across views.<br>
• <strong>Click</strong> a circle: Selects/deselects a year, affecting the cards highlighted in other views.<br>
• <strong>Right-click</strong> a circle: Toggles a global Year filter for that year.<br>
• <strong>Brush</strong> the chart: Toggles multiple years at once.<br>
• <strong>Scroll</strong>: Zoom in/out on the Line Chart.<br>
• <strong>Right-click drag</strong> or <strong>Ctrl + left-click drag</strong>: Pan the Line Chart.<br>
• <strong>Double-click</strong> background: Clears all selections made.<br>
`;


/**
 * Metrics rendered as stacked small multiples.
 * (Color is uniform; emphasis is in structure, not hue.)
 */
const METRICS = [
  { key: "reprints", label: "Functional Reprints", color: "#998066" },
  { key: "avgComplexity", label: "Avg. Complexity", color: "#998066" },
  { key: "avgCMC", label: "Avg. Mana Value", color: "#998066" },
];

/* =========================================================================
 *  SHARED STATE
 * ========================================================================= */

let brushing = false;
let ignoreNextBrushEnd = false;

/**
 * Geometry of the current chart, needed to place year guide lines outside
 * createStackedLineChart's closure (replaces the old window._lineChartXScale).
 */
const lineChart = {
  xScale: null, // base d3 scaleTime
  zoom: d3.zoomIdentity, // current zoom transform
  marginLeft: 0,
  y1: 0,
  y2: 0,
};

/* =========================================================================
 *  UTILITY HELPERS
 * ========================================================================= */


/** Draw dashed vertical guide lines at the given years (within the visible range). */
function drawYearLines(className, years, color) {
  const svg = d3.select(".LineChart svg");
  if (svg.empty() || !lineChart.xScale) return;
  svg.selectAll(`.${className}`).remove();

  const x = lineChart.zoom.rescaleX(lineChart.xScale);
  const [minX, maxX] = lineChart.xScale.range();
  for (const year of years) {
    const px = x(new Date(year, 0, 1));
    if (px < minX || px > maxX) continue;
    svg
      .append("line")
      .attr("class", className)
      .attr("data-year", year)
      .attr("x1", px + lineChart.marginLeft)
      .attr("x2", px + lineChart.marginLeft)
      .attr("y1", lineChart.y1)
      .attr("y2", lineChart.y2)
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 2")
      .attr("pointer-events", "none")
      .lower();
  }
}

/* =========================================================================
 *  SELECTION & HOVER PAINTING (shared model, see Linking.js)
 * ========================================================================= */

/**
 * Selected years (any selected printing released that year) get a grey guide
 * line; hovered years get a yellow guide line and highlighted points.
 */
function paintLineChart() {
  const sel = getSelectionSummary();
  const hov = getHoverSummary();
  drawYearLines("selected-hover-line", sel.active ? [...sel.get("years").keys()] : [], "#9AA0BC");
  drawYearLines("highlight-hover-line", hov.count > 0 ? [...hov.get("years").keys()] : [], "#f2c46e");
  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", (d) => hov.count > 0 && hov.has("years", d.year.getFullYear()));
}

onSelectionChange(paintLineChart);
onHoverChange(paintLineChart);

/** Toggle each year individually in the shared "years" selection. */
function toggleYears(years) {
  const set = new Set(getSourcePredicate("years")?.years || []);
  years.forEach((y) => (set.has(y) ? set.delete(y) : set.add(y)));
  setSelected("years", { years: set });
}

/* =========================================================================
 *  MAIN: CREATE STACKED LINE CHART
 * ========================================================================= */

export function createStackedLineChart(data, containerId, isUpdate = false) {
  // Reset container
  d3.select(containerId).selectAll("*").remove();
  d3.select(containerId).on("contextmenu", (event) => event.preventDefault());

  /* ---- 1. Aggregate into yearly metrics ---- */
  // (core/aggregates.js — tested against the previous inline version;
  // Gleemax is excluded there.)
  const groupedData = lineAggregate(data);

  if (groupedData.length === 0) return;

  /* ---- 2. Layout & scales ---- */

  const container = d3.select(containerId);
  const { width: containerWidth, height: containerHeight } =
    container.node().getBoundingClientRect();

  const margin = { top: 20, right: 21, bottom: 30, left: 50 };
  const width = containerWidth - margin.left - margin.right;
  const chartHeight = (containerHeight * 0.9) / METRICS.length / 1; // same total, just split
  const chartSpacing = 15;
  const height =
    (chartHeight + chartSpacing) * METRICS.length - chartSpacing;

  if (isUpdate) {
    container.select(".stacked-line-wrapper").remove();
  }

  const tooltip = d3.select("#tooltip");

  const wrapper = container
    .append("div")
    .attr("class", "stacked-line-wrapper")
    .style("position", "relative")
    .style("width", `${containerWidth}px`);

  // Compute x-domain with a bit of padding
  const xExtent = d3.extent(groupedData, (d) => d.year);
  const firstYear = xExtent[0].getFullYear();
  const lastYear = xExtent[1].getFullYear();
  const yearSpan = lastYear - firstYear;

  let domainStart, domainEnd;
  if (yearSpan === 0) {
    domainStart = new Date(firstYear - 1, 0, 1);
    domainEnd = new Date(firstYear + 1, 0, 1);
  } else {
    domainStart = new Date(firstYear, 0, 1);
    domainEnd = new Date(lastYear, 11, 31);
  }

  const xScale = d3
    .scaleTime()
    .domain([domainStart, domainEnd])
    .range([10, width - 2]);

  lineChart.xScale = xScale;
  const previousZoom = isUpdate ? lineChart.zoom : d3.zoomIdentity;
  lineChart.zoom = d3.zoomIdentity; // the new SVG starts unzoomed
  lineChart.marginLeft = margin.left;

  const allYears = groupedData.map((d) => d.year);

  const baseXAxis = d3
    .axisBottom(xScale)
    .tickValues(allYears)
    .tickFormat(d3.timeFormat("%Y"));

  /* ---- 3. SVG + zoom/tooltip icon ---- */

  const zoom = d3
    .zoom()
    .filter((event) => {
      if (event.type === "wheel") return true;
      if (event.type === "mousedown" && event.button === 2) return true;
      if (event.ctrlKey) return true;
      return false;
    })
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

  // Info icon
  const iconX = containerWidth * 0.985;
  const iconY = containerHeight * 0.04;
  const iconRadius = containerWidth * 0.93 * 0.014;
  const infoTextSize = Math.min(containerWidth * 0.0187, 14);

  addInfoIcon(svg, { x: iconX, y: iconY, radius: iconRadius, fontSize: infoTextSize, html: lineChartTooltipText });

  const chartGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Clip to prevent drawing over axes/margins
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", "clip-left-margin")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width + 5)
    .attr("height", containerHeight);

  // Shared vertical hover guide line
  const sharedHoverLine = svg
    .append("line")
    .attr("class", "hover-line")
    .attr("y1", margin.top)
    .attr("y2", margin.top + height)
    .attr("stroke", "#000")
    .attr("stroke-width", 1)
    .attr("pointer-events", "none")
    .style("display", "none");

  const yScales = [];
  const linePaths = [];
  const circleGroups = [];
  const xAxisGroups = [];

  /* ---- 4. Draw each metric panel (line + points + axes + brush) ---- */

  METRICS.forEach((metric, i) => {
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
      .attr(
        "transform",
        `translate(0, ${i * (chartHeight + chartSpacing)})`
      );

    const clipped = g
      .append("g")
      .attr("clip-path", "url(#clip-left-margin)");

    const linePath = clipped
      .append("path")
      .datum(groupedData)
      .attr("fill", "none")
      .attr("stroke", metric.color)
      .attr("stroke-width", 2)
      .attr("d", line);

    linePaths.push({ line, path: linePath });

    // Data points
    clipped
      .selectAll("circle")
      .data(groupedData)
      .enter()
      .append("circle")
      .attr("class", "data-point")
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => y(d[metric.key]))
      .attr("r", 4)
      .attr("fill", metric.color)
      .attr("data-year", (d) => d.year.getFullYear())
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => {
        const year = d.year.getFullYear();
        const allMetrics = METRICS.map((m) => {
          const val = d[m.key];
          const formatted =
            m.key === "reprints"
              ? Math.round(val)
              : val?.toFixed(2) ?? "N/A";
          return `<strong>${m.label}:</strong> ${formatted}`;
        }).join("<br/>");

        tooltip
          .style("display", "block")
          .style("font-size", "16px")
          .html(
            `<strong>Year:</strong> ${year}<br/>${allMetrics}`
          );

        d3.selectAll(`.LineChart circle.data-point[data-year='${year}']`)
          .attr("stroke", "#000")
          .attr("stroke-width", 1.5);

        setHover("line", { years: new Set([year]) });
      })
      .on("mousemove", moveTooltip)
      .on("mouseout", () => {
        tooltip.style("display", "none").style("font-size", "12px");
        d3.selectAll(".LineChart circle.data-point")
          .attr("r", 4)
          .attr("stroke", "none");
        clearHover();
      })
      .on("click", (event, d) => toggleYears([d.year.getFullYear()]))
      .on("contextmenu", (event, d) => {
        event.preventDefault();
        toggleGlobalFilter("Year", d.year.getFullYear().toString());
      });

    // Per-metric Y axis
    g.append("g").call(d3.axisLeft(y).ticks(4));

    // Metric label
    g.append("text")
      .attr("x", 5)
      .attr("y", 8)
      .attr("text-anchor", "left")
      .text(metric.label)
      .attr("fill", "#000")
      .attr("font-size", "11px")
      .style("font-weight", "bold");

    // Shared X axis (only bottom panel shows text)
    const xAxisG = clipped
      .append("g")
      .attr("transform", `translate(0, ${chartHeight})`)
      .call(baseXAxis);

    xAxisG
      .selectAll("text")
      .text(d3.timeFormat("%Y"))
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end")
      .attr("font-size", "10px");

    if (i !== METRICS.length - 1) {
      xAxisG.selectAll("text").remove();
      xAxisG.selectAll("line").attr("stroke-opacity", 0.3);
    }

    xAxisGroups.push({ g: xAxisG, isBottom: i === METRICS.length - 1 });

    // Brush for multi-year selection (one brush overlay across panels)
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [width, height],
      ])
      .on("start", () => {
        brushing = true;
        brushGroup
          .select(".overlay")
          .style("pointer-events", "all");
      })
      .on("end", (event) => {
        brushing = false;
        brushed(event);
      });

    const brushGroup = svg
      .append("g")
      .attr("class", "brush")
      .attr(
        "transform",
        `translate(${margin.left}, ${margin.top})`
      )
      .call(brush)
      .lower();

    // Mousemove over chart → shared hover line
    svg
      .on("mousemove", (event) => {
        if (brushing) return;

        const [mouseX, mouseY] = d3.pointer(event, svg.node());
        const left = margin.left;
        const right = margin.left + width;
        const top = margin.top;
        const bottom = margin.top + height;

        const outside =
          mouseX < left ||
          mouseX > right ||
          mouseY < top ||
          mouseY > bottom;

        if (outside) {
          sharedHoverLine.style("display", "none");
          return;
        }

        sharedHoverLine
          .attr("x1", mouseX)
          .attr("x2", mouseX)
          .style("display", "block");
      })
      .on("mouseout", () => {
        sharedHoverLine.style("display", "none");
      });

    function brushed(event) {
      if (ignoreNextBrushEnd) {
        ignoreNextBrushEnd = false;
        return;
      }

      const resetBrush = () => {
        ignoreNextBrushEnd = true;
        brushGroup.call(brush.move, null);
        brushGroup.selectAll("*").remove();
        brushGroup.call(brush);
      };

      if (!event.selection) {
        clearSelection("years");
        resetBrush();
        return;
      }

      const [x0, x1] = event.selection;
      const zoomedX = lineChart.zoom.rescaleX(xScale);
      const startDate = zoomedX.invert(x0);
      const endDate = zoomedX.invert(x1);

      const brushedYears = groupedData
        .filter((d) => d.year >= startDate && d.year <= endDate)
        .map((d) => d.year.getFullYear());

      if (brushedYears.length === 0) clearSelection("years");
      else toggleYears(brushedYears);
      resetBrush();
    }

    circleGroups.push({ group: g, yScale: y, metric });
  });

  /* ---- 5. Zoom/pan behavior ---- */

  function zoomed(event) {
    const transform = event.transform;
    lineChart.zoom = transform;

    const newX = transform.rescaleX(xScale);

    // Update lines
    linePaths.forEach(({ line, path }) => {
      path.attr(
        "d",
        line.x((d) => newX(d.year))
      );
    });

    // Update circles
    circleGroups.forEach(({ group, yScale, metric }) => {
      group
        .selectAll("circle.data-point")
        .attr("cx", (d) => newX(d.year))
        .attr("cy", (d) => yScale(d[metric.key]));
    });

    // Re-place the selection / hover guide lines.
    paintLineChart();

    // Update axes
    xAxisGroups.forEach(({ g, isBottom }) => {
      g.call(
        d3
          .axisBottom(newX)
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

  /* ---- 6. Background double-click → clear all selections ---- */

  svg.on("dblclick", (event) => {
    const target = d3.select(event.target);
    const isCircle = target.classed("data-point");
    const isText = target.node().tagName === "text";
    const isInfo =
      target.classed("info-icon") ||
      target.node().closest(".info-icon");

    if (!isCircle && !isText && !isInfo) clearSelection();
  });

  // Keep the user's zoom/pan across re-renders (filter changes, resize).
  if (previousZoom.k !== 1 || previousZoom.x !== 0) svg.call(zoom.transform, previousZoom);

  /* ---- 7. Initial selection sync ---- */

  lineChart.y1 = +sharedHoverLine.attr("y1");
  lineChart.y2 = +sharedHoverLine.attr("y2");
  paintLineChart();
}
