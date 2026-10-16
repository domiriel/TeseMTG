// Scatterplot.js
//
//

//

import { updateState, getState, getEffectivePriceAttribute } from "../state.js";
import { identityKey } from "../core/index.js";
import {
  setSelected,
  toggleSelected,
  clearSelection,
  getSourcePredicate,
  setHover,
  clearHover,
  onSelectionChange,
  onHoverChange,
  getSelectionSummary,
} from "./Linking.js";
import { moveTooltip, addInfoIcon, colorIdentityBackground } from "./ui.js";

// Dot color groups by EDHREC rank buckets.
const colorGroups = [
  { range: [1, 5691], color: "#594A3A" },
  { range: [5692, 11382], color: "#806a4f" },
  { range: [11383, 17074], color: "#a98b66" },
  { range: [17075, 22765], color: "#d3ae7c" },
  { range: [22766, 28456], color: "#ffd394" },
];

const ZOOM_RESET_EPSILON = 0.001;



// Dot radius adapts to zoom level for readability.
const dotSizeByZoom = [
  { threshold: 1, radius: 3.0 },
  { threshold: 2, radius: 3.5 },
  { threshold: 4, radius: 4.5 },
  { threshold: 8, radius: 4.5 },
  { threshold: Infinity, radius: 4.5 },
];

function getDotRadiusForZoom(zoomLevel) {
  for (const { threshold, radius } of dotSizeByZoom) {
    if (zoomLevel <= threshold) return radius;
  }
  return 3;
}

function getSymbolFromAttribute(attr) {
  if (!attr) return "";
  if (attr.includes("eur")) return "€";
  if (attr.includes("usd")) return "$";
  return "";
}

function getXMetricTooltipText() {
  if (xMetric === "release_date") {
    return "Cards are positioned along the X-axis by their first <b>release date</b>.";
  }
  if (lastPriceAttribute?.includes("eur"))
    return "Cards are positioned by <b>average price</b> (EUR, from Cardmarket).";
  if (lastPriceAttribute?.includes("usd"))
    return "Cards are positioned by <b>average price</b> (USD, from TCGplayer).";
  if (lastPriceAttribute?.includes("tix"))
    return "Cards are positioned by <b>average price</b> (from Scryfall).";
  return "Cards are positioned by <b>average price</b>.";
}



// UI help: interaction cheat sheet for the info icon.
const scatterTooltipText = `
<strong>Scatterplot Interactions:</strong><br>
• <strong>Hover</strong> a dot: show card details & highlight related data across views.<br>
• <strong>Click</strong> a dot: toggle persistent highlight of that card (additive).<br>
• <strong>Brush</strong>: toggle persistent highlights of multiple cards (additive).<br>
• <strong>Scroll</strong>: zoom in/out.<br>
• <strong>Right-click drag</strong> or <strong>Ctrl + left-click drag</strong>: pan.<br>
• <strong>Double-click</strong> empty background: clear all selections.<br>
`;

// === Shared selection / hover (see Linking.js) ===========================
// Dots are selected when the selection contains printings with that name;
// the drawer ("hoveredCards") lists the selected Scatterplot entries.

function syncSelection() {
  const sel = getSelectionSummary();
  selectedNames = sel.active ? new Set(sel.get("names").keys()) : new Set();
  const hoveredCards = actualFIlteredData ? actualFIlteredData.filter((d) => selectedNames.has(d.name)) : [];
  updateState({ hoveredCards });
  requestDraw();
}

// Cross-view hovers highlight matching dots that are currently drawn; set
// hovers (and card hovers) also reveal dots hidden by zoomed-out sampling.
function syncHover(summary, hover) {
  hoverNames.clear();
  if (plot) plot.quadtree = null; // revealed dots become hoverable
  if (hover && hover.source !== "scatter" && summary.count > 0 && actualFIlteredData) {
    const names = summary.get("names");
    const reveal = !!(hover.predicate.sets?.size || hover.predicate.names?.size);
    for (const d of actualFIlteredData) {
      if (names.has(d.name) && (reveal || isVisibleNow(d))) hoverNames.add(d.name);
    }
  }
  requestDraw("overlay");
}

onSelectionChange(syncSelection);
onHoverChange(syncHover);

// === Tooltip / visuals helpers ===========================================


// Get x-value based on current metric.
function getXValue(d) {
  if (xMetric === "avg_price") return d.avg_price;
  return d.release_date instanceof Date ? d.release_date : new Date(d.release_date);
}

/**
 * Update scales + axes when switching between price vs release_date X metric.
 * Uses the current actualFilteredData and preserves zoom keypoints.
 */
function updateXMetricScale() {
  if (!plot || !actualFIlteredData) return;
  const data = actualFIlteredData;
  const { logXScale, timeXScale, originalYScale } = plot;

  if (xMetric === "avg_price") {
    const newMin = Math.max(0.001, d3.min(data, (d) => d.avg_price));
    const newMax = d3.max(data, (d) => d.avg_price);
    logXScale.domain([newMin, newMax]);
  } else {
    setTimeDomain(timeXScale, data);
  }
  tagZoomKeyPoints(data, baseXScale(), originalYScale);
  plot.updateAxes(getSymbolFromAttribute(lastPriceAttribute), getZoomedScales().xScale);
  requestDraw();
}

function setTimeDomain(timeXScale, data) {
  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const d of data) {
    const y = d.__year;
    if (y == null) continue;
    if (y < minYear) minYear = y;
    if (y > maxYear) maxYear = y;
  }
  timeXScale.domain([new Date(minYear, 0, 1), new Date(maxYear, 11, 31)]);
}

// === Zoom / state ========================================================

const ZOOM_THRESHOLD = 6;
let currentZoomLevel = 1;
let currentZoomTransform = null;
let actualFIlteredData = null; // canonical data backing current plot
let brushOverlay = null;
let zoom = null;
let brush = null;
let lastPriceAttribute = null;
let xMetric = "avg_price";

/**
 * Everything about the current plot: scales, sizes, canvas, axes.
 * Dots are drawn on a <canvas> (one element instead of ~32k SVG circles);
 * axes, legend, brush and zoom capture stay in the SVG on top of it.
 */
let plot = null;

// Highlight state (replaces the old .hover-temp / .selected-hover classes).
const hoverNames = new Set(); // transient cross-view hover highlights
let ownHoverName = null; // dot under the pointer in this view
let selectedNames = new Set(); // persistent selection (= global hoveredCards)

function baseXScale() {
  return xMetric === "avg_price" ? plot.logXScale : plot.timeXScale;
}

// Return current zoomed X/Y scales based on stored transform.
function getZoomedScales() {
  const bx = baseXScale();
  return {
    xScale: currentZoomTransform ? currentZoomTransform.rescaleX(bx) : bx,
    yScale: currentZoomTransform ? currentZoomTransform.rescaleY(plot.originalYScale) : plot.originalYScale,
  };
}

// Mark a minimal set of "key" dots visible when zoomed out (density reduction).
function tagZoomKeyPoints(data, xScale, yScale, cellSize = 6) {
  const grid = new Set();
  for (const d of data) {
    const cx = Math.floor(xScale(getXValue(d)) / cellSize);
    const cy = Math.floor(yScale(d.complexity) / cellSize);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) {
      grid.add(key);
      d.isZoomKey = true;
    } else {
      d.isZoomKey = false;
    }
  }
  return data;
}

// === Drawing =============================================================

// Two layers: the base canvas holds every dot plus selection outlines and is
// redrawn when data, zoom or selection change; the overlay canvas holds only
// hover highlights, so a hover repaints a handful of dots instead of all.
let baseQueued = false;
let overlayQueued = false;

/** Coalesce redraws into one per animation frame (zoom fires per wheel tick). */
function requestDraw(layer = "all") {
  if (layer === "all") baseQueued = true;
  overlayQueued = true;
  if (requestDraw.pending) return;
  requestDraw.pending = true;
  requestAnimationFrame(() => {
    requestDraw.pending = false;
    if (baseQueued) drawBase();
    if (overlayQueued) drawOverlay();
    baseQueued = overlayQueued = false;
  });
}

const draw = () => {
  drawBase();
  drawOverlay();
};

function tracePath(ctx, dots, r) {
  ctx.beginPath();
  for (const d of dots) {
    ctx.moveTo(d.__cx + r, d.__cy);
    ctx.arc(d.__cx, d.__cy, r, 0, 2 * Math.PI);
  }
}

/** Fill dots by EDHREC color (unranked ones get a black ring). */
function fillDots(ctx, dots, r) {
  const fills = new Map(); // color → dots
  const unranked = [];
  for (const d of dots) {
    const rank = +d.edhrec_rank;
    if (rank > 0) {
      const color = getGroupColor(rank);
      let bucket = fills.get(color);
      if (!bucket) fills.set(color, (bucket = []));
      bucket.push(d);
    } else {
      unranked.push(d);
    }
  }
  ctx.globalAlpha = 0.8;
  for (const [color, bucket] of fills) {
    ctx.fillStyle = color;
    tracePath(ctx, bucket, r);
    ctx.fill();
  }
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1.2;
  tracePath(ctx, unranked, r);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBase() {
  if (!plot || !actualFIlteredData) return;
  const t0 = performance.now();
  const { ctx, dpr, canvasWidth, canvasHeight } = plot;
  const { xScale, yScale } = getZoomedScales();
  const r = getDotRadiusForZoom(currentZoomLevel);
  const zoomedIn = currentZoomLevel >= ZOOM_THRESHOLD;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const shown = [];
  const selected = [];
  for (const d of actualFIlteredData) {
    d.__cx = xScale(getXValue(d));
    d.__cy = yScale(d.complexity);
    d.__shown = zoomedIn || d.isZoomKey;
    if (!d.__shown) continue;
    shown.push(d);
    if (selectedNames.has(d.name)) selected.push(d);
  }

  fillDots(ctx, shown, r);
  ctx.strokeStyle = "#6a708a";
  ctx.lineWidth = 2.5;
  tracePath(ctx, selected, r);
  ctx.stroke();

  plot.quadtree = null; // rebuilt lazily on the next pointer query
  plot.lastDrawMs = performance.now() - t0;
}

function drawOverlay() {
  if (!plot || !actualFIlteredData) return;
  const { overlayCtx: ctx, dpr, canvasWidth, canvasHeight } = plot;
  const r = getDotRadiusForZoom(currentZoomLevel);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const hovered = [];
  for (const d of actualFIlteredData) {
    if (d.name === ownHoverName || hoverNames.has(d.name)) hovered.push(d);
  }
  if (hovered.length === 0) return;
  // Hidden (sampled-out) dots that are highlighted get drawn here too.
  fillDots(ctx, hovered.filter((d) => !d.__shown), r);
  ctx.strokeStyle = "#d89313";
  ctx.lineWidth = 1.5;
  tracePath(ctx, hovered, r);
  ctx.stroke();
}

/** Dot under a pointer event (nearest shown dot within its radius), or null. */
function dotAt(event) {
  if (!plot || !actualFIlteredData) return null;
  if (!plot.quadtree) {
    plot.quadtree = d3
      .quadtree()
      .x((d) => d.__cx)
      .y((d) => d.__cy)
      .addAll(actualFIlteredData.filter((d) => d.__shown || hoverNames.has(d.name)));
  }
  const [mx, my] = d3.pointer(event, plot.g.node());
  if (mx < 0 || my < 0 || mx > plot.canvasWidth || my > plot.canvasHeight) return null;
  return plot.quadtree.find(mx, my, getDotRadiusForZoom(currentZoomLevel) + 2) || null;
}

// === Dot interaction handlers ===========================================

function mouseoverFn(event, d) {
  const symbol = getSymbolFromAttribute(getEffectivePriceAttribute(getState()));
  const formatDate = d3.timeFormat("%d %b %Y");
  const formattedDate = d.release_date
    ? formatDate(new Date(d.release_date))
    : "Unknown";

  d3
    .select("#tooltip")
    .style("display", "block")
    .style("background", colorIdentityBackground(d.color_identity))
    .style("color", "black").html(`
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <img src="${d.tooltip_image}" alt="${
    d.name
  }" width="200" style="border-radius: 4px; box-shadow: 0 0 4px rgba(0,0,0,0.5);" />
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
          All Sets: ${d.all_sets
            .map((set) => `${set.name} (${set.type})`)
            .join("<br>")}<br>
          Number of Prints: ${d.all_print_images.length}<br>
        </div>
      </div>
    `);

  ownHoverName = d.name;
  requestDraw("overlay");
  setHover("scatter", { names: new Set([d.name]) });
}

function mousemoveFn(event) {
  moveTooltip(event);
}

function mouseoutFn() {
  d3
    .select("#tooltip")
    .style("display", "none")
    .style("background", null)
    .style("color", null);

  ownHoverName = null;
  requestDraw("overlay");
  clearHover();
}

/** Dot click: toggle the card in the Scatterplot's hand-picked selection. */
function clickFn(event, d) {
  toggleSelected("scatter", "names", [d.name]);
}

/** Plotted card with this exact name (used by the Filter Panel card search). */
export function findScatterCard(name) {
  return actualFIlteredData?.find((d) => d.name === name) || null;
}

// Metadata lookup helper for tooltip image.
export function getTooltipImageMetadata(card) {
  if (!card.tooltip_image || !Array.isArray(card.print_image_metadata))
    return null;

  return (
    card.print_image_metadata.find(
      (print) => print.image === card.tooltip_image
    ) || null
  );
}

// Map EDHREC rank into color bucket.
function getGroupColor(rank) {
  if (rank === 0) return "#efefef";
  for (let group of colorGroups) {
    if (rank >= group.range[0] && rank <= group.range[1]) {
      return group.color;
    }
  }
  return colorGroups[colorGroups.length - 1].color;
}

/** Per-card values the view needs repeatedly (computed once per data update). */
function annotate(data) {
  for (const d of data) {
    d.__year = d.all_years.length ? Math.min(...d.all_years) : null;
    d.__ci = identityKey(d.color_identity);
  }
  return data;
}

/**
 * Initial creation of scatterplot.
 * - Builds scales, axes, zoom/brush, canvas, legend, info icon.
 */
export function createScatterPlot(
  data,
  containerId,
  isUpdate = false,
  selectedPriceAttribute = "price_usd",
  savedTransform = null
) {
  lastPriceAttribute = selectedPriceAttribute;
  selectedNames = new Set((getState().hoveredCards || []).map((c) => c.name));

  const containerSel = d3.select(containerId);
  containerSel.selectAll("*").remove();

  const filteredData = annotate(data);
  const minPrice = d3.min(filteredData, (d) => d.avg_price);
  const maxPrice = d3.max(filteredData, (d) => d.avg_price);

  const container = containerSel.node();
  const { width, height } = container.getBoundingClientRect();
  const margin = { top: 35, right: 14, bottom: 35, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Plot origin (same translate the SVG <g> uses).
  const originX = margin.left - 8.5;
  const originY = margin.top - 15;
  const canvasWidth = chartWidth + 20; // matches the old clip rect
  const canvasHeight = chartHeight;
  const dpr = window.devicePixelRatio || 1;

  // The container is a flex box; position the canvas absolutely under the SVG.
  const canvas = containerSel
    .append("canvas")
    .attr("class", "scatter-canvas")
    .attr("width", Math.round(canvasWidth * dpr))
    .attr("height", Math.round(canvasHeight * dpr))
    .style("position", "absolute")
    .style("left", `${originX}px`)
    .style("top", `${originY}px`)
    .style("width", `${canvasWidth}px`)
    .style("height", `${canvasHeight}px`)
    .style("pointer-events", "none");

  const overlay = containerSel
    .append("canvas")
    .attr("class", "scatter-canvas-overlay")
    .attr("width", Math.round(canvasWidth * dpr))
    .attr("height", Math.round(canvasHeight * dpr))
    .style("position", "absolute")
    .style("left", `${originX}px`)
    .style("top", `${originY}px`)
    .style("width", `${canvasWidth}px`)
    .style("height", `${canvasHeight}px`)
    .style("pointer-events", "none");

  const svg = containerSel
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("position", "relative");

  // Block native context menu (we use right-drag for pan).
  containerSel.on("contextmenu", (event) => event.preventDefault());

  const iconX = width * 0.985;
  const iconY = height * 0.07;
  const iconRadius = width * 0.93 * 0.015;
  const infoTextSize = Math.min(width * 0.0187, 15);

  const g = svg
    .append("g")
    .attr("transform", `translate(${originX}, ${originY})`);

  // X scales: log price + time.
  const logXScale = d3
    .scaleLog()
    .domain([minPrice, maxPrice])
    .range([10, chartWidth - 2]);

  const timeXScale = d3.scaleTime().range([10, chartWidth - 2]);
  setTimeDomain(timeXScale, filteredData);

  // Y scale: complexity.
  const minComplexity = d3.min(filteredData, (d) => d.complexity);
  const maxComplexity = d3.max(filteredData, (d) => d.complexity);
  const yPadding = (maxComplexity - minComplexity) * 0.01;

  const originalYScale = d3
    .scaleLinear()
    .domain([minComplexity - yPadding, maxComplexity + yPadding])
    .range([chartHeight, 5]);

  const xAxisG = g
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${chartHeight})`);

  const yAxisG = g.append("g").attr("class", "y-axis");

  const numTicks = 12;

  // Draw axes for the given (possibly zoomed) scales.
  function updateAxes(symbol, xS = getZoomedScales().xScale, yS = getZoomedScales().yScale) {
    if (xMetric === "avg_price") {
      const logMin = Math.log10(xS.domain()[0]);
      const logMax = Math.log10(xS.domain()[1]);
      const ticks = d3
        .range(numTicks)
        .map((i) =>
          Math.pow(10, logMin + (i / (numTicks - 1)) * (logMax - logMin))
        );
      if (ticks.length > 0 && ticks[0] < 0.001) ticks[0] = 0.001;

      xAxisG.call(
        d3
          .axisBottom(xS)
          .tickValues(ticks)
          .tickFormat((d) => `${symbol}${d.toFixed(2)}`)
      );
    } else if (xMetric === "release_date") {
      const tickDates = xS.ticks(d3.timeYear.every(1));
      const first = tickDates[0]?.getTime();
      const last = tickDates[tickDates.length - 1]?.getTime();

      xAxisG.call(
        d3
          .axisBottom(xS)
          .tickValues(tickDates)
          .tickFormat((d) => {
            const t = d.getTime();
            const y = d.getFullYear();
            if (tickDates.length <= 1) return String(y);
            return t === first || t === last ? String(y) : String(y).slice(-2);
          })
      );

      xAxisG
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-0.8em")
        .attr("dy", "0.15em")
        .attr("transform", "rotate(-45)");
    }

    yAxisG.call(d3.axisLeft(yS).ticks(numTicks));
  }

  plot = {
    svg,
    g,
    canvas: canvas.node(),
    ctx: canvas.node().getContext("2d"),
    overlayCtx: overlay.node().getContext("2d"),
    dpr,
    canvasWidth,
    canvasHeight,
    chartWidth,
    chartHeight,
    logXScale,
    timeXScale,
    originalYScale,
    updateAxes,
    quadtree: null,
  };

  // Test/debug hook: what is drawn, without reaching into module internals.
  container.__scatter = {
    count: () => actualFIlteredData?.length ?? 0,
    lastDrawMs: () => plot?.lastDrawMs,
    points: () =>
      (actualFIlteredData || []).map((d) => ({
        name: d.name,
        ci: d.__ci,
        x: d.__cx,
        y: d.__cy,
        shown: !!d.__shown || d.name === ownHoverName || hoverNames.has(d.name),
        selected: selectedNames.has(d.name),
        hover: d.name === ownHoverName || hoverNames.has(d.name),
      })),
  };

  currentZoomTransform = null;
  currentZoomLevel = 1;
  tagZoomKeyPoints(filteredData, baseXScale(), originalYScale);
  actualFIlteredData = filteredData;

  const symbol = getSymbolFromAttribute(selectedPriceAttribute);
  updateAxes(symbol);

  // X metric dropdown (Average Price vs Release Date).
  svg
    .append("foreignObject")
    .attr("x", chartWidth / 2 - 30)
    .attr("y", height - 30)
    .attr("width", 130)
    .attr("height", 30)
    .style("pointer-events", "none")
    .append("xhtml:div").html(`
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
    dropdown.value = xMetric;
    dropdown.addEventListener("change", function () {
      xMetric = this.value;
      updateXMetricScale();
    });

    dropdown.addEventListener("mouseover", () => {
      d3
        .select("#tooltip")
        .style("display", "block")
        .html(getXMetricTooltipText);
    });

    dropdown.addEventListener("mousemove", moveTooltip);

    dropdown.addEventListener("mouseout", () => {
      d3.select("#tooltip").style("display", "none");
    });
  }

  // Y axis label with tooltip explanation.
  svg
    .append("text")
    .attr("class", "y-axis-label")
    .attr("x", margin.left - 15)
    .attr("y", margin.top - 15)
    .attr("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("cursor", "help")
    .text("Complexity")
    .on("mouseover", () => {
      d3
        .select("#tooltip")
        .style("display", "block")
        .html(
          `An aggregated score representing the number <br> of non-flavor words a card has.`
        );
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => {
      d3.select("#tooltip").style("display", "none");
    });

  // ClipPath to constrain the brush.
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", "chart-clip")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", chartWidth + 20)
    .attr("height", chartHeight);

  brushOverlay = g
    .append("g")
    .attr("class", "brush-overlay")
    .attr("clip-path", "url(#chart-clip)");

  // Brush for additive manual card toggle. A press that starts on a dot is a
  // click on that dot, not a brush.
  let ignoreNextBrushEnd = false;
  brush = d3
    .brush()
    .extent([
      [0, -10],
      [chartWidth + 10, chartHeight],
    ])
    .filter((event) => !event.ctrlKey && !event.button && !dotAt(event))
    .on("start", () => svg.on(".zoom", null))
    .on("end", function (event) {
      svg.call(zoom); // re-enable zoom

      if (ignoreNextBrushEnd) {
        ignoreNextBrushEnd = false;
        return;
      }

      if (!event.selection) {
        // Empty brush → clear hand-picked cards only.
        clearSelection("scatter");
        return;
      }

      const [[x0, y0], [x1, y1]] = event.selection;
      const { xScale: zx, yScale: zy } = getZoomedScales();
      const brushedNames = [];
      for (const d of actualFIlteredData) {
        const cx = zx(getXValue(d));
        const cy = zy(d.complexity);
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) brushedNames.push(d.name);
      }

      if (brushedNames.length === 0) {
        clearSelection("scatter");
      } else {
        // Each brushed card toggles individually.
        const names = new Set(getSourcePredicate("scatter")?.names || []);
        brushedNames.forEach((n) => (names.has(n) ? names.delete(n) : names.add(n)));
        setSelected("scatter", { names });
      }

      ignoreNextBrushEnd = true;
      brushOverlay.call(brush.move, null);
    });

  brushOverlay.call(brush);

  // Dot hover / click via hit-testing (the dots are pixels, not elements).
  let pressedDot = null;
  svg
    .on("mousemove.dots", (event) => {
      const d = dotAt(event);
      if ((d?.name ?? null) !== ownHoverName) {
        if (ownHoverName !== null) mouseoutFn(event);
        if (d) mouseoverFn(event, d);
      }
      svg.style("cursor", d ? "pointer" : null);
      if (d) mousemoveFn(event);
    })
    .on("mouseleave.dots", (event) => {
      if (ownHoverName !== null) mouseoutFn(event);
    })
    .on("mousedown.dots", (event) => {
      pressedDot = dotAt(event);
    })
    .on("click.dots", (event) => {
      const d = dotAt(event);
      if (d && pressedDot && d.name === pressedDot.name) clickFn(event, d);
      pressedDot = null;
    });

  // Info icon with interaction help.
  addInfoIcon(svg, { x: iconX, y: iconY, radius: iconRadius, fontSize: infoTextSize, html: scatterTooltipText });

  // EDHREC legend.
  const baseLegendSize = chartHeight * 0.05;
  const legendItemDimensions = Math.min(baseLegendSize, 20);
  const legendX = margin.left + 30;
  const legendY = -10;
  const legendFontSize = baseLegendSize > 18 ? 13 : 10;

  const legend = svg
    .append("g")
    .attr("class", "edhrec-legend")
    .attr("transform", `translate(${legendX}, ${legendY})`)
    .style("pointer-events", "none");

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", legendItemDimensions * 7.75)
    .text("EDHREC Rank")
    .style("shape-rendering", "crispEdges")
    .attr("fill", "#000")
    .style("font-size", legendFontSize)
    .style("font-weight", "bold");

  colorGroups.forEach((group, i) => {
    const entry = legend
      .append("g")
      .attr("transform", `translate(0, ${(i + 1) * legendItemDimensions})`);

    entry
      .append("rect")
      .attr("width", legendItemDimensions)
      .attr("height", legendItemDimensions)
      .style("shape-rendering", "crispEdges")
      .attr("fill", group.color)
      .attr("stroke", "#000");

    entry
      .append("text")
      .attr("x", 26)
      .attr("y", legendItemDimensions / 2)
      .attr("dy", "0.35em")
      .style("shape-rendering", "crispEdges")
      .text(`${group.range[0]}–${group.range[1]}`)
      .style("font-size", `${legendFontSize}px`)
      .attr("fill", "#000");
  });

  const noRankEntry = legend
    .append("g")
    .attr(
      "transform",
      `translate(0, ${(colorGroups.length + 1) * legendItemDimensions})`
    );

  noRankEntry
    .append("circle")
    .attr("r", 6)
    .attr("cx", legendItemDimensions / 2)
    .attr("cy", legendItemDimensions / 2)
    .attr("fill", "transparent")
    .attr("stroke", "black")
    .attr("stroke-width", 1.2);

  noRankEntry
    .append("text")
    .attr("x", 26)
    .attr("y", legendItemDimensions / 2)
    .attr("dy", "0.35em")
    .style("shape-rendering", "crispEdges")
    .text("No Rank")
    .style("font-size", `${legendFontSize}px`)
    .attr("fill", "#000");

  // Zoom behavior: wheel / right-drag / Ctrl+drag.
  const buffer = 100;
  zoom = d3
    .zoom()
    .scaleExtent([1, 24])
    .translateExtent([
      [0, 0],
      [chartWidth + buffer, chartHeight + buffer],
    ])
    .extent([
      [0, 0],
      [chartWidth, chartHeight],
    ])
    .filter((event) => {
      if (event.type === "wheel") return true;
      if (event.type === "mousedown" && event.button === 2) return true;
      if (event.ctrlKey) return true;
      return false;
    })
    .on("zoom", (event) => {
      applyZoomTransform(event.transform);
    });

  function applyZoomTransform(transform) {
    // Snap very close to identity back to exactly identity.
    if (Math.abs(transform.k - 1) < ZOOM_RESET_EPSILON) {
      transform = d3.zoomIdentity;
    }

    currentZoomTransform = transform;
    currentZoomLevel = transform.k;

    plot.updateAxes(getSymbolFromAttribute(lastPriceAttribute));
    requestDraw();
  }

  svg.call(zoom);

  // Restore previous transform if provided.
  if (savedTransform) {
    svg.call(zoom.transform, savedTransform);
  }

  // Double-click blank background → clear all selections.
  svg.on("dblclick", function (event) {
    const target = d3.select(event.target);
    const isAxis =
      !!target.node().closest(".x-axis") || !!target.node().closest(".y-axis");
    const isLegend = target.node().closest(".edhrec-legend");
    const isInfoIcon = target.node().closest(".info-icon");

    if (!dotAt(event) && !isAxis && !isLegend && !isInfoIcon) clearSelection();
  });

  function resetZoom() {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
  }

  d3.select("#reset-button").on("click", resetZoom);

  draw();
}

/**
 * Update existing scatterplot in-place when data or price attribute changes.
 * Preserves zoom & selection model.
 */
export function updateScatterPlot(
  filteredData,
  selectedPriceAttribute = "price_eur"
) {
  if (!plot) return;
  lastPriceAttribute = selectedPriceAttribute;
  annotate(filteredData);

  // Update X-domain based on new data & current metric.
  if (xMetric === "avg_price") {
    const newMin = Math.max(0.001, d3.min(filteredData, (d) => d.avg_price));
    const newMax = d3.max(filteredData, (d) => d.avg_price);
    plot.logXScale.domain([newMin, newMax]);
  } else {
    setTimeDomain(plot.timeXScale, filteredData);
  }

  plot.updateAxes(getSymbolFromAttribute(selectedPriceAttribute));

  // Recompute zoom keypoints on updated data.
  tagZoomKeyPoints(filteredData, baseXScale(), plot.originalYScale);
  actualFIlteredData = filteredData;

  syncSelection();
}

function isVisibleNow(d) {
  return currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey;
}
