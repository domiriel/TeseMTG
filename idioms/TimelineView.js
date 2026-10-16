import { toggleGlobalFilter } from "../state.js";
import { timelineAggregate } from "../core/index.js";
import {
  toggleSelected,
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
import { moveTooltip, getDiscreteColor, getHighlightedColor, getSelectedColor } from "./ui.js";

/* =========================================================================
 *  CONSTANTS & CONFIG
 * ========================================================================= */


/** Tooltip copy kept close to interactions. */
const timelineTooltipText = `
<strong>Timeline Interactions:</strong><br>
• <strong>Click</strong> a year, set, or set type: Toggle selection; this affects highlights in other views.<br>
• <strong>Hover</strong> a year, set, or set type: Show details and highlight linked elements across views.<br>
• <strong>Right-click</strong> a year, set square, or set type: Apply or remove a global filter for that category.<br>
• <strong>Brush</strong>: Toggle multiple sets at once.<br>
• <strong>Scroll</strong>: Zoom in/out on the Timeline.<br>
• <strong>Right-click drag</strong> or <strong>Ctrl + left-click drag</strong>: Pan the Timeline.<br>
• <strong>Double-click</strong> background: Clear all selections made.<br>
`;

/* =========================================================================
 *  COLOR HELPERS (quintile-based)
 * ========================================================================= */




/* =========================================================================
 *  SHARED STATE
 * ========================================================================= */

/**
 * uniqueSets:
 *   Flattened array of set objects used to draw the timeline.
 *   Each set: { name, releaseDate, setType, cardCount, originalities, rarities, colorIdentities, numColorsPresent, baseColor, highlightColor, selectedColor }
 */
let uniqueSets = null;

let ignoreNextBrushEnd = false;

// Zoom and vertical scroll survive re-renders (filter changes, resize).
let savedZoom = null;
let savedScrollTop = 0;

/* =========================================================================
 *  GENERIC HELPERS
 * ========================================================================= */


/* =========================================================================
 *  SELECTION & HOVER PAINTING (shared model, see Linking.js)
 * ========================================================================= */

/**
 * A set square is selected / hovered if any selected / hovered printing is in
 * that set. Year ticks and set-type labels show what is selected *here*
 * (the "years" and "timeline" sources). Hover wins over selection.
 */
function paintTimeline() {
  const sel = getSelectionSummary();
  const hov = getHoverSummary();

  d3.selectAll(".TimelineView .set-rect").each(function (d) {
    const isSel = sel.active && sel.has("sets", d.name);
    const isHov = hov.count > 0 && hov.has("sets", d.name);
    if (this.__sel === isSel && this.__hov === isHov) return;
    this.__sel = isSel;
    this.__hov = isHov;
    d3.select(this)
      .classed("selectedHovered", isSel)
      .classed("hover-temp", isHov)
      .attr("fill", isHov ? d.highlightColor : isSel ? d.selectedColor : d.baseColor);
  });

  const years = getSourcePredicate("years")?.years || new Set();
  const types = getSourcePredicate("timeline")?.setTypes || new Set();
  d3.selectAll(".TimelineView .year-tick-timeline").classed("selected", (d) => years.has(d.getFullYear()));
  d3.selectAll(".TimelineView .set-type-label").classed("selected", (d) => types.has(d.toLowerCase()));
}

onSelectionChange(paintTimeline);
onHoverChange(paintTimeline);

/** Toggle a set type together with all of its sets (as before). */
function toggleSetType(type) {
  const pred = getSourcePredicate("timeline") || {};
  const types = new Set(pred.setTypes || []);
  const sets = new Set(pred.sets || []);
  const lower = type.toLowerCase();
  const members = uniqueSets.filter((s) => s.setType === type).map((s) => s.name);
  if (types.has(lower)) {
    types.delete(lower);
    members.forEach((n) => sets.delete(n));
  } else {
    types.add(lower);
    members.forEach((n) => sets.add(n));
  }
  setSelected("timeline", { sets, setTypes: types });
}

/* =========================================================================
 *  MAIN: CREATE TIMELINE VIEW
 * ========================================================================= */

export function createTimelineView(data, containerId, isUpdate = false) {
  const tooltip = d3.select("#tooltip");
  const container = d3.select(containerId);

  container.selectAll("*").remove();
  container.on("contextmenu", (event) => event.preventDefault());

  // Aggregate per set (core/aggregates.js — tested against the previous
  // inline version), sorted by release date.
  uniqueSets = timelineAggregate(data);

  if (uniqueSets.length === 0) return;

  // Quintile-based color mapping by cardCount
  const allCounts = uniqueSets.map((s) => s.cardCount);
  const sorted = allCounts.slice().sort(d3.ascending);

  const thresholds = [
    d3.quantileSorted(sorted, 0.2),
    d3.quantileSorted(sorted, 0.4),
    d3.quantileSorted(sorted, 0.6),
    d3.quantileSorted(sorted, 0.8),
    d3.max(sorted),
  ];
  const bounds = [0, ...thresholds];

  const dynamicLegendData = bounds
    .slice(0, -1)
    .map((min, i) => {
      const max = bounds[i + 1];
      const q = i * 20;
      return {
        min,
        max,
        color: getDiscreteColor(q),
        colorSelected: getSelectedColor(q),
        label: `${Math.round(min)}–${Math.round(max)}`,
      };
    })
    .reverse();

  // Year & type aggregations
  const yearTypeCounts = new Map();
  const typeCounts = new Map();

  uniqueSets.forEach((set) => {
    // Assign base/highlight/selected colors by quintile
    let qi = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (set.cardCount <= thresholds[i]) {
        qi = i;
        break;
      }
    }
    const qp = qi * 20;
    set.baseColor = getDiscreteColor(qp);
    set.highlightColor = getHighlightedColor(qp);
    set.selectedColor = getSelectedColor(qp);

    const year = set.releaseDate.getFullYear().toString();
    const type = set.setType;

    // Per-year type counts
    if (!yearTypeCounts.has(year)) yearTypeCounts.set(year, new Map());
    if (!yearTypeCounts.get(year).has(type))
      yearTypeCounts.get(year).set(type, 0);
    yearTypeCounts
      .get(year)
      .set(type, yearTypeCounts.get(year).get(type) + 1);

    // Type totals
    if (!typeCounts.has(type)) typeCounts.set(type, 0);
    typeCounts.set(type, typeCounts.get(type) + 1);
  });

  // Limit visible set types if needed
  const allSetTypes = Array.from(
    new Set(uniqueSets.map((s) => s.setType))
  ).sort();
  const selectedSetTypes = allSetTypes.slice(0, 50);
  uniqueSets = uniqueSets.filter((s) =>
    selectedSetTypes.includes(s.setType)
  );

  const containerBounds = container.node().getBoundingClientRect();
  const containerWidth = containerBounds.width * 0.98;
  const containerHeight = containerBounds.height;
  const chartWidth = containerWidth * 0.873;

  const margin = {
    top: 50,
    right: 50,
    bottom: 10,
    left: containerWidth * 0.11,
  };

  if (isUpdate) {
    container.select(".chart-wrapper").remove();
  }

  /* ---- Info icon ---- */

  const iconRadius = containerBounds.width * 0.485 * 0.015;
  const iconSize = iconRadius * 2;
  const infoTextSize = Math.min(
    containerBounds.width * 0.485 * 0.0187,
    15
  );

  container
    .append("div")
    .attr("class", "timeline-info-icon")
    .style("position", "absolute")
    .style("top", "5px")
    .style("left", "5px")
    .style("width", `${iconSize}px`)
    .style("height", `${iconSize}px`)
    .style("background", "#8A9CE4")
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
    .on("mouseover", () => {
      tooltip
        .style("display", "block")
        .html(timelineTooltipText);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => {
      tooltip.style("display", "none");
    });

  /* ---- Wrapper & fixed X axis ---- */

  const wrapper = container
    .append("div")
    .attr("class", "chart-wrapper")
    .style("position", "relative")
    .style("width", `${containerWidth}px`);

  const fixedXAxis = wrapper
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", margin.top - 10)
    .style("position", "sticky")
    .style("top", "0px")
    .style("background", "hsl(44, 65%, 97%)")
    .style("z-index", "10");

  // X scale snapped to full years
  const minDateRaw = d3.min(uniqueSets, (d) => d.releaseDate);
  const maxDateRaw = d3.max(uniqueSets, (d) => d.releaseDate);
  const startYear = minDateRaw.getFullYear();
  const endYear = maxDateRaw.getFullYear();

  const minDate = new Date(startYear, 0, 1);
  const maxDate = new Date(endYear, 11, 31, 23, 59, 59);

  const xScale = d3
    .scaleTime()
    .domain([minDate, maxDate])
    .range([0, chartWidth - 2]);

  const xAxis = d3
    .axisTop(xScale)
    .ticks(d3.timeYear.every(1))
    .tickFormat(d3.timeFormat("%Y"));

  const xAxisGroup = fixedXAxis
    .append("g")
    .attr("class", "x-axis")
    .attr(
      "transform",
      `translate(${margin.left}, ${margin.top - 20})`
    )
    .call(xAxis);

  xAxisGroup
    .selectAll(".tick text")
    .classed("year-tick-timeline", true)
    .style("text-anchor", "middle")
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      toggleSelected("years", "years", [d.getFullYear()]);
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      toggleGlobalFilter("Year", d.getFullYear().toString());
    })
    .on("mouseover", (event, d) => {
      const yearStr = d.getFullYear().toString();
      const types = yearTypeCounts.get(yearStr);
      let totalSets = 0;
      if (types) {
        totalSets = Array.from(types.values()).reduce(
          (sum, c) => sum + c,
          0
        );
      }

      setHover("timeline", { years: new Set([d.getFullYear()]) });

      const tooltipHtml = types
        ? `<strong>${yearStr}</strong><br><strong>Total Sets: ${totalSets}</strong><br>${Array.from(
            types.entries()
          )
            .map(([t, c]) => `${t}: ${c}`)
            .join("<br>")}`
        : `<strong>${yearStr}</strong><br>No sets`;

      tooltip.style("display", "block").html(tooltipHtml);

      moveTooltip(event);
    })
    .on("mouseout", () => {
      tooltip.style("display", "none");
      clearHover();
    });

  /* ---- Scroll container + SVG ---- */

  const scrollContainer = wrapper
    .append("div")
    .attr("class", "chart-container")
    .style("width", `${containerWidth}px`)
    .style("height", `${containerHeight * 0.75}px`)
    .style("overflow-y", "scroll")
    .style("overflow-x", "hidden")
    .style("position", "relative")
    .style("border", "none");

  scrollContainer.node().addEventListener(
    "wheel",
    (e) => e.preventDefault(),
    { passive: false }
  );

  const lineSpacingFactor = 0.5;
  const adjustedChartHeight =
    selectedSetTypes.length * lineSpacingFactor * 30;

  const svg = scrollContainer
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", adjustedChartHeight + 20)
    .style("overflow", "visible");

  // Zoom/pan on timeline via scroll/right-drag/Ctrl+drag
  const zoom = d3
    .zoom()
    .filter((event) => {
      if (event.type === "wheel") return true;
      if (event.type === "mousedown" && event.button === 2) return true;
      if (event.ctrlKey) return true;
      return false;
    })
    .scaleExtent([1, 10])
    .translateExtent([
      [0, 0],
      [chartWidth, adjustedChartHeight],
    ])
    .on("zoom", zoomed);

  svg.call(zoom);
  scrollContainer.on("scroll", function () {
    savedScrollTop = this.scrollTop;
  });

  const chartGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, 10)`);

  const yScale = d3
    .scalePoint()
    .domain(selectedSetTypes)
    .range([0, selectedSetTypes.length * lineSpacingFactor * 30]);

  /* ---- Legend ---- */

  const legendFontSize = Math.min(0.1 * containerHeight, 12);
  const rectDim = Math.min(containerHeight * 0.15, 15);

  const legendContainer = wrapper
    .append("div")
    .attr("class", "timeline-color-legend")
    .style("position", "absolute")
    .style("top", "15px")
    .style("left", "-10px")
    .style("padding", "6px 10px")
    .style("border-radius", "6px")
    .style("font-size", `${legendFontSize}px`)
    .style("line-height", "1.2")
    .style("z-index", "9999")
    .style("color", "#000")
    .style("pointer-events", "auto");

  dynamicLegendData.forEach((interval, i) => {
    const row = legendContainer
      .append("div")
      .style("display", "flex")
      .style("alignItems", "flex-start")
      .style("margin", "0");

    row
      .append("div")
      .style("width", `${rectDim}px`)
      .style("height", `${rectDim}px`)
      .style(
        "background",
        `linear-gradient(135deg, ${interval.colorSelected} 50%, ${interval.color} 50%)`
      )
      .style("border", "1px solid #000");

    if (i === dynamicLegendData.length - 1) {
      const labels = row
        .append("div")
        .style("display", "flex")
        .style("flexDirection", "column")
        .style("justifyContent", "space-between")
        .style("marginLeft", "6px")
        .style("height", `${rectDim}px`);

      labels
        .append("div")
        .style("fontSize", `${legendFontSize}px`)
        .style("marginTop", `-${rectDim * 0.25 + 1}px`)
        .text(`${Math.round(interval.max)}`);

      labels
        .append("div")
        .style("fontSize", `${legendFontSize}px`)
        .text("1");
    } else {
      row
        .append("div")
        .style("marginLeft", "6px")
        .style("marginTop", `-${rectDim * 0.25 + 1}px`)
        .text(`${Math.round(interval.max)}`);
    }
  });

  legendContainer
    .append("div")
    .style("fontWeight", "bold")
    .style("marginTop", "5px")
    .text("Card Count");

  /* ---- Background lines for set types ---- */

  selectedSetTypes.forEach((setType) => {
    chartGroup
      .append("line")
      .attr("x1", 0)
      .attr("y1", yScale(setType))
      .attr("x2", chartWidth)
      .attr("y2", yScale(setType))
      .attr("stroke", "black")
      .attr("stroke-width", 2);
  });

  /* ---- Brush for multi-set toggling ---- */

  const brush = d3
    .brush()
    .extent([
      [0, -20],
      [chartWidth, adjustedChartHeight + 20],
    ])
    .on("end", brushed);

  chartGroup.append("g").attr("class", "brush").call(brush);

  /* ---- Set squares ---- */

  const squares = chartGroup
    .selectAll(".set-square")
    .data(uniqueSets, (d) => d.name)
    .join(
      (enter) =>
        enter
          .append("rect")
          .attr("class", "set-square set-rect")
          .attr("width", 9)
          .attr("height", 9)
          .attr("stroke", "black")
          .attr("fill", (d) => d.baseColor)
          .on("mouseover", function (event, d) {
            tooltip
              .style("display", "block")
              .html(`
                <strong>${d.name}</strong><br>
                ${d.releaseDate.toDateString()}<br>
                Type: ${d.setType}<br>
                Cards in Set: ${d.cardCount}
              `);

            moveTooltip(event);

            setHover("timeline", { sets: new Set([d.name]) });
          })
          .on("mouseout", function () {
            tooltip.style("display", "none");
            clearHover();
          })
          .on("click", function (event, d) {
            toggleSelected("timeline", "sets", [d.name]);
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            toggleGlobalFilter("Set Names", d.name);
          }),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr("x", (d) => xScale(d.releaseDate) - 2.5)
    .attr("y", (d) => yScale(d.setType) - 5);

  /* ---- Set type labels ---- */

  chartGroup
    .selectAll(".set-type-label")
    .data(selectedSetTypes, (d) => d)
    .join(
      (enter) =>
        enter
          .append("text")
          .attr("class", "set-type-label")
          .attr("x", -10)
          .attr("text-anchor", "end")
          .attr("font-size", "12px")
          .attr("fill", "black")
          .text((d) => d)
          .on("click", (event, type) => toggleSetType(type))
          .on("contextmenu", (event, type) => {
            event.preventDefault();
            toggleGlobalFilter("Set Types", type);
          })
          .on("mouseover", (event, type) => {
            const count = typeCounts.get(type) || 0;
            setHover("timeline", { setTypes: new Set([type.toLowerCase()]) });

            tooltip
              .style("display", "block")
              .html(`<strong>${type}</strong><br>${count} sets`);

            moveTooltip(event);
          })
          .on("mouseout", () => {
            tooltip.style("display", "none");
            clearHover();
          }),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr("y", (d) => yScale(d) + 5);

  /* ---- Zoom handler ---- */

  function zoomed(event) {
    const transform = event.transform;
    savedZoom = transform;

    let newX;
    if (transform.k === 1) {
      newX = xScale;
    } else {
      const rescaled = transform.rescaleX(xScale);
      const [origStart, origEnd] = xScale.domain();
      const [start, end] = rescaled.domain();

      const clampedStart = d3.max([start, origStart]);
      const clampedEnd = d3.min([end, origEnd]);
      if (clampedEnd < clampedStart) return;

      newX = d3
        .scaleTime()
        .domain([clampedStart, clampedEnd])
        .range(xScale.range());
    }

    fixedXAxis
      .select(".x-axis")
      .call(xAxis.scale(newX));

    squares
      .attr("x", (d) => newX(d.releaseDate) - 2.5)
      .style("opacity", (d) => {
        const [start, end] = newX.domain();
        return d.releaseDate >= start && d.releaseDate <= end
          ? 1
          : 0;
      });
  }

  /* ---- Brush handler ---- */

  function brushed(event) {
    if (ignoreNextBrushEnd) {
      ignoreNextBrushEnd = false;
      return;
    }

    if (!event.selection) {
      clearSelection("timeline");
      return;
    }

    const [[x0, y0], [x1, y1]] = event.selection;
    const brushed = [];

    squares.each(function (d) {
      const x = +this.getAttribute("x");
      const y = +this.getAttribute("y");
      const w = +this.getAttribute("width");
      const h = +this.getAttribute("height");
      if (x + w >= x0 && x <= x1 && y + h >= y0 && y <= y1) brushed.push(d.name);
    });

    if (brushed.length === 0) {
      clearSelection("timeline");
    } else {
      // Each brushed set toggles individually.
      const pred = getSourcePredicate("timeline") || {};
      const sets = new Set(pred.sets || []);
      brushed.forEach((n) => (sets.has(n) ? sets.delete(n) : sets.add(n)));
      setSelected("timeline", { ...pred, sets });
    }

    ignoreNextBrushEnd = true;
    chartGroup.select(".brush").call(brush.move, null);
  }

  /* ---- Double-click background → clear all selections ---- */

  wrapper.on("dblclick", (event) => {
    const target = d3.select(event.target);

    const isSetRect = target.classed("set-rect");
    const isYearTick = target.classed("year-tick-timeline");
    const isTypeLabel = target.classed("set-type-label");
    const isInfo =
      target.classed("timeline-info-icon") ||
      target.node().closest?.(".timeline-info-icon");

    if (!isSetRect && !isYearTick && !isTypeLabel && !isInfo) clearSelection();
  });

  /* ---- Restore zoom/scroll, then the selection ---- */

  if (isUpdate && savedZoom && savedZoom.k !== 1) svg.call(zoom.transform, savedZoom);
  if (isUpdate) scrollContainer.node().scrollTop = savedScrollTop;


  paintTimeline();
}
