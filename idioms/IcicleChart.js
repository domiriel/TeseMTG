import { updateState, cloneSelectedFilters } from "../state.js";
import { icicleAggregate } from "../core/index.js";
import { showPopup } from "./LoadingAnimation.js";
import {
  toggleSelected,
  clearSelection,
  setHover,
  clearHover,
  onSelectionChange,
  onHoverChange,
  getSelectionSummary,
  getHoverSummary,
} from "./Linking.js";
import { moveTooltip, addInfoIcon } from "./ui.js";

/* =========================================================================
 *  CONSTANTS
 * ========================================================================= */

// WUBRG order, used to sort identities within a color group.
const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

const COLOR_NAMES = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const COLOR_NICKNAMES = {
  // 2-color
  BR: "Rakdos",
  WU: "Azorius",
  WG: "Selesnya",
  RG: "Gruul",
  UB: "Dimir",
  BG: "Golgari",
  UR: "Izzet",
  WR: "Boros",
  UG: "Simic",
  WB: "Orzhov",

  // 3-color
  WRG: "Naya",
  BRG: "Jund",
  WUB: "Esper",
  WUG: "Bant",
  UBR: "Grixis",
  URG: "Temur",
  WUR: "Jeskai",
  UBG: "Sultai",
  WBR: "Mardu",
  WBG: "Abzan",

  // 4-color
  WUBR: "Yore-Tiller",
  UBRG: "Glint-Eye",
  WBRG: "Dune-Brood",
  WUBG: "Witch-Maw",
  WURG: "Ink-Treader",

  // 5-color
  WUBRG: "Rainbow",
};

const colorScale = [
  { range: [0, 20], color: "#ffd394" },
  { range: [21, 40], color: "#d3ae7c" },
  { range: [41, 60], color: "#a98b66" },
  { range: [61, 80], color: "#806a4f" },
  { range: [81, 100], color: "#594a3a" },
];

const colorScaleHighlight = [
  { range: [0, 20], color: "#ffca00" },
  { range: [21, 40], color: "#e7b006" },
  { range: [41, 60], color: "#ce970b" },
  { range: [61, 80], color: "#b5800d" },
  { range: [81, 100], color: "#9b690d" },
];

const colorScaleSelected = [
  { range: [0, 20], color: "#c7daff" },
  { range: [21, 40], color: "#a2b1d3" },
  { range: [41, 60], color: "#7d89a8" },
  { range: [61, 80], color: "#5b6380" },
  { range: [81, 100], color: "#3a4059" },
];

const darkTextColors = new Set(["#736659", "#594a3a"]);

const infoTooltipText = `
<strong>Icicle Chart Interactions:</strong><br>
• <strong>Click</strong> on a rectangle:<br>
&nbsp;&nbsp;&nbsp;• Color Group: selects or deselects cards by number of colors.<br>
&nbsp;&nbsp;&nbsp;• Color Identity: selects or deselects cards by specific identity.<br>
• <strong>Right-click</strong>: toggles global filter for that color group or identity.<br>
• <strong>Double-click</strong>: zoom into or out of a group.<br>
• <strong>Hover</strong>: shows tooltip and highlights other visualizations.<br>
• <strong>Scroll</strong>: zoom in/out.<br>
• <strong>Ctrl + drag (left)</strong>: pan horizontally.<br>
• <strong>Double-click</strong> background: clears all selections.<br>
`;

/* =========================================================================
 *  SHARED STATE
 * ========================================================================= */

/**
 * globalRects:
 *   Stores a D3 selection of icicle rects so other helpers can inspect data.
 *
 * clickTimer:
 *   Used to distinguish single vs double click on rectangles.
 *
 * Panning state:
 *   Used to suppress click behavior when user was actually panning.
 */
let globalRects = null;
let clickTimer = null;

let isPanning = false;
let panStartX = null;
let panStartDomain = null;
let wasPanning = false;

/* =========================================================================
 *  UTILITY FUNCTIONS
 * ========================================================================= */

/**
 * Map percentage to a color from a given discrete scale.
 */
function getColorFromPercentage(percentage, scale = colorScale) {
  for (let i = scale.length - 1; i >= 0; i--) {
    if (percentage >= scale[i].range[0]) {
      return scale[i].color;
    }
  }
  return scale[0].color;
}

function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex(r, g, b) {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
}

/**
 * Pretty label for a color identity, including guild/shard nicknames when known.
 */
function formatColorIdentityDisplay(name) {
  if (!name) return "";
  const key = name.replaceAll("-", "");
  if (key.toLowerCase() === "colorless") return "Colorless";

  const pretty = key
    .split("")
    .map((ch) => COLOR_NAMES[ch] || ch)
    .join(" + ");
  const nickname = COLOR_NICKNAMES[key];
  return nickname ? `${pretty} (${nickname})` : pretty;
}

/**
 * Validate consistency between "Nº of Colors" and "Color Identity" filters.
 * Prevents logically impossible combinations.
 */
function validateFilterCombination(filters) {
  const groups = filters["Nº of Colors"] || new Set();
  const identities = filters["Color Identity"] || new Set();

  if (groups.size === 0 || identities.size === 0) return true;

  const groupToSizes = {
    colorless: [0],
    "1 color": [1],
    "2 colors": [2],
    "3 colors": [3],
    "4 colors": [4],
    "5 colors": [5],
  };

  const allowedSizes = new Set();
  for (const group of groups) {
    const sizes = groupToSizes[group];
    if (sizes) sizes.forEach((s) => allowedSizes.add(s));
  }

  for (const identity of identities) {
    const normIdentity = identity.toUpperCase();
    const numColors = normIdentity === "COLORLESS" ? 0 : normIdentity.length;
    if (allowedSizes.has(numColors)) return true;
  }

  return false;
}

/* =========================================================================
 *  SELECTION & HOVER PAINTING (shared model, see Linking.js)
 * ========================================================================= */

/**
 * Paint every rect from the shared selection/hover summaries:
 *   identity rect (depth 2): its identity has selected / hovered printings
 *   group rect (depth 1):    any of its identities does
 * Hover wins over selection.
 */
function paintIcicle() {
  if (!globalRects) return;
  const sel = getSelectionSummary();
  const hov = getHoverSummary();
  const hit = (summary, d) =>
    d.depth === 2
      ? summary.has("identities", d.data.name)
      : (d.children || []).some((c) => summary.has("identities", c.data.name));

  globalRects.each(function (d) {
    const isSelected = sel.active && hit(sel, d);
    const isHover = hov.count > 0 && hit(hov, d);
    const node = this;
    if (node.__sel === isSelected && node.__hov === isHover) return;
    node.__sel = isSelected;
    node.__hov = isHover;
    d3.select(node)
      .classed("selectedHovered", isSelected)
      .classed("hover-temp", isHover)
      .attr("fill", isHover ? d.data.highlightColor : isSelected ? d.data.selectedColor : d.data.color);
  });
}

onSelectionChange(paintIcicle);
onHoverChange(paintIcicle);

/* =========================================================================
 *  LEGEND RENDERING
 * ========================================================================= */

/**
 * Legend encodes original-card percentage with base + selected pattern.
 */
function renderLegend(
  svg,
  chartWidth,
  margin,
  containerHeight,
  rectDimensions,
  legendFontSize
) {
  svg.select(".legend").remove();

  const legendX = chartWidth + margin.right;
  const legendY = margin.top + 5;

  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  const showPatterns = getSelectionSummary().active;
  const reversedColorScale = colorScale.slice().reverse();
  const reversedSelectedScale = colorScaleSelected.slice().reverse();

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectDimensions * 6, 132))
    .text("Original")
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("font-weight", "bold");

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectDimensions * 6.75, 149))
    .text("Cards (%)")
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("font-weight", "bold");

  reversedColorScale.forEach((interval, i) => {
    const defs = svg.select("defs").empty()
      ? svg.append("defs")
      : svg.select("defs");

    const legendEntry = legend
      .append("g")
      .attr("transform", `translate(0, ${i * rectDimensions})`);

    const baseColor = interval.color;
    const selectedColor = reversedSelectedScale[i].color;

    const patternId = `icicle-legend-pattern-${i}`;
    const pattern = defs
      .append("pattern")
      .attr("id", patternId)
      .attr("width", 1)
      .attr("height", 1)
      .attr("patternUnits", "objectBoundingBox")
      .attr("patternContentUnits", "objectBoundingBox");

    pattern
      .append("path")
      .attr("d", "M0,0 L1,0 L0,1 Z")
      .attr("fill", selectedColor);

    pattern
      .append("path")
      .attr("d", "M1,0 L1,1 L0,1 Z")
      .attr("fill", baseColor);

    legendEntry
      .append("rect")
      .attr("width", rectDimensions)
      .attr("height", rectDimensions)
      .style("shape-rendering", "crispEdges")
      .attr("fill", showPatterns ? `url(#${patternId})` : baseColor)
      .style("stroke", "#000");

    legendEntry
      .append("text")
      .attr("x", chartWidth * 0.054)
      .attr("y", rectDimensions * 0.25 - 1)
      .text(`${interval.range[1]}%`)
      .attr("fill", "#000")
      .style("font-size", `${legendFontSize}px`);
  });

  const zeroLabel = legend
    .append("g")
    .attr(
      "transform",
      `translate(0, ${reversedColorScale.length * rectDimensions})`
    );

  zeroLabel
    .append("text")
    .attr("x", chartWidth * 0.054)
    .attr("y", rectDimensions * 0.25 - 1)
    .text(`0%`)
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`);
}

/* =========================================================================
 *  ICICLE CHART CREATION
 * ========================================================================= */

export function createIcicleChart(data, containerId, isUpdate = false) {
  d3.select(containerId).selectAll("*").remove();

  /* ---- 1. Aggregate data into color groups & identities ---- */
  // (core/aggregates.js — tested against the previous inline version)
  const groupedData = icicleAggregate(data);

  // Compute colors and propagate identity sets up to groups.
  groupedData.forEach((group) => {
    group.originalCount = group.children.reduce(
      (sum, c) => sum + (c.originalCount || 0),
      0
    );
    group.reprintCount = group.children.reduce(
      (sum, c) => sum + (c.reprintCount || 0),
      0
    );
    group.functionalReprintCount = group.children.reduce(
      (sum, c) => sum + (c.functionalReprintCount || 0),
      0
    );

    group.children.forEach((c) => {
      const originalPct = (c.originalCount / c.value) * 100 || 0;
      c.color = getColorFromPercentage(originalPct, colorScale);
      c.highlightColor = getColorFromPercentage(
        originalPct,
        colorScaleHighlight
      );
      c.selectedColor = getColorFromPercentage(originalPct, colorScaleSelected);
    });

    if (group.children.length > 0) {
      let base = { r: 0, g: 0, b: 0 };
      let hi = { r: 0, g: 0, b: 0 };
      let sel = { r: 0, g: 0, b: 0 };

      group.children.forEach((c) => {
        const bc = hexToRgb(c.color);
        const hc = hexToRgb(c.highlightColor);
        const sc = hexToRgb(c.selectedColor);

        base.r += bc.r;
        base.g += bc.g;
        base.b += bc.b;

        hi.r += hc.r;
        hi.g += hc.g;
        hi.b += hc.b;

        sel.r += sc.r;
        sel.g += sc.g;
        sel.b += sc.b;
      });

      const n = group.children.length;
      group.color = rgbToHex(
        Math.round(base.r / n),
        Math.round(base.g / n),
        Math.round(base.b / n)
      );
      group.highlightColor = rgbToHex(
        Math.round(hi.r / n),
        Math.round(hi.g / n),
        Math.round(hi.b / n)
      );
      group.selectedColor = rgbToHex(
        Math.round(sel.r / n),
        Math.round(sel.g / n),
        Math.round(sel.b / n)
      );
    } else {
      group.color = "#efefef";
      group.highlightColor = "#f0f0f0";
      group.selectedColor = "#d0d0d0";
    }

    // Finalize sets as arrays for serialization
    group.originalities = Array.from(group.originalities);
    group.rarities = Array.from(group.rarities);
    group.years = Array.from(group.years);

    group.colorIdentities = new Set();
    group.children.forEach((c) => {
      c.originalities = Array.from(c.originalities);
      c.rarities = Array.from(c.rarities);
      c.years = Array.from(c.years);
      group.colorIdentities.add(c.name);
    });
    group.colorIdentities = Array.from(group.colorIdentities);
  });

  groupedData.sort((a, b) => a.numColors - b.numColors);
  groupedData.forEach((group) => {
    group.children.sort((a, b) => {
      const aColors = a.name.split("-");
      const bColors = b.name.split("-");
      for (let i = 0; i < Math.max(aColors.length, bColors.length); i++) {
        const av = mtgColorOrder[aColors[i]] ?? 99;
        const bv = mtgColorOrder[bColors[i]] ?? 99;
        if (av !== bv) return av - bv;
      }
      return 0;
    });
  });

  const hierarchy = { children: groupedData };

  /* ---- 2. Layout & SVG scaffolding ---- */

  const container = d3.select(containerId);
  const { width: containerWidth, height: containerHeight } = container
    .node()
    .getBoundingClientRect();

  const chartWidth = containerWidth * 0.85;
  const chartHeight = containerHeight * 0.8;
  const legendWidth = 100;

  const margin = {
    top: (containerHeight - chartHeight) / 2 + 1,
    right: 26,
    bottom: 20,
    left: containerWidth * 0.015,
  };

  if (isUpdate) {
    d3.select(containerId).select("svg").remove();
  }

  const svg = container
    .append("svg")
    .attr("width", chartWidth + legendWidth)
    .attr("height", containerHeight)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // Info icon
  const iconX = containerWidth * 0.03;
  const iconY = containerHeight * 0.07;
  const iconRadius = containerWidth * 0.015;
  const infoTextSize = Math.min(containerWidth * 0.0187, 15);
  addInfoIcon(svg, { x: iconX, y: iconY, radius: iconRadius, fontSize: infoTextSize, html: infoTooltipText });

  const chartGroup = svg
    .append("g")
    .attr("class", "chart-group")
    .attr(
      "transform",
      `translate(${margin.left}, ${-(containerHeight - chartHeight) / 2 + 5})`
    );

  chartGroup
    .append("clipPath")
    .attr("id", "chartClip")
    .append("rect")
    .attr("width", chartWidth)
    .attr("height", chartHeight + 300);

  const zoomGroup = chartGroup.append("g").attr("clip-path", "url(#chartClip)");

  const root = d3
    .hierarchy(hierarchy)
    .sum((d) => d.value)
    .sort((a, b) => a.data.numColors - b.data.numColors);

  const depth = Math.max(...root.descendants().map((d) => d.depth));
  const partition = d3.partition().size([chartWidth, chartHeight]);
  partition(root);

  const levelHeight = chartHeight / depth;

  let xScale = d3.scaleLinear().domain([0, chartWidth]).range([0, chartWidth]);
  let yScale = d3.scaleLinear().domain([0, depth]).range([0, chartHeight]);
  let focus = root;

  /* ---- 3. Draw rectangles ---- */

  const rects = zoomGroup
    .selectAll("rect.icicle-rect")
    .data(root.descendants().slice(1), (d) => d.data.name)
    .join(
      (enter) =>
        enter
          .append("rect")
          .attr("class", "icicle-rect")
          .attr("x", (d) => xScale(d.x0))
          .attr("y", (d) => yScale(d.depth) - levelHeight / 2)
          .attr("width", (d) => xScale(d.x1) - xScale(d.x0))
          .attr("height", levelHeight - 2)
          .attr("fill", (d) => d.data.color)
          .style("cursor", "pointer")
          .on("click", function (event, d) {
            // Suppress click if this was actually a pan.
            if (wasPanning) {
              wasPanning = false;
              return;
            }
            if (clickTimer) return;

            // Delay so a double-click (zoom) doesn't also toggle a selection.
            clickTimer = setTimeout(() => {
              clickTimer = null;
              // Identity rect → that identity; group rect → all its identities.
              const identities =
                d.depth === 2
                  ? [d.data.name]
                  : (d.children || []).map((c) => c.data.name);
              toggleSelected("icicle", "identities", identities);
            }, 170);
          })
          .on("dblclick", function (event, d) {
            if (clickTimer) {
              clearTimeout(clickTimer);
              clickTimer = null;
            }
            clickedZoom(event, d);
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            clickedFilter(event, d);
          })
          .on("mouseover", function (event, d) {
            const tooltip = d3.select("#tooltip");
            const titleText =
              d.depth === 2
                ? formatColorIdentityDisplay(d.data.name)
                : d.data.name.replaceAll("-", "");

            tooltip.style(
              "display",
              "block"
            ).html(`<strong>${titleText}</strong><br>
                    Total: ${d.value} cards<br>
                    Original: ${
                      d.data.originalCount || 0
                    } (${((d.data.originalCount / d.value) * 100).toFixed(2)}%)<br>
              Reprint: ${d.data.reprintCount || 0} cards<br>
              Functional Reprint: ${d.data.functionalReprintCount || 0} cards
`);

            setHover(
              "icicle",
              d.depth === 2
                ? { identities: new Set([d.data.name]) }
                : { numColors: new Set([d.data.numColors]) }
            );
          })
          .on("mousemove", moveTooltip)
          .on("mouseout", function () {
            d3.select("#tooltip").style("display", "none");
            clearHover();
          }),
      (update) =>
        update
          .attr("x", (d) => xScale(d.x0))
          .attr("y", (d) => yScale(d.depth) - levelHeight / 2)
          .attr("width", (d) => xScale(d.x1) - xScale(d.x0))
          .attr("height", levelHeight - 2)
          .attr("fill", (d) => d.data.color),
      (exit) => exit.remove()
    );

  globalRects = rects;

  /* ---- 4. Labels ---- */

  const labels = zoomGroup
    .selectAll("text.icicle-label")
    .data(root.descendants().slice(1), (d) => d.data.name)
    .join(
      (enter) =>
        enter
          .append("text")
          .attr("class", "icicle-label")
          .attr("x", (d) => (xScale(d.x0) + xScale(d.x1)) / 2)
          .attr("y", (d) => yScale(d.depth))
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .attr("pointer-events", "none")
          .attr("fill", (d) =>
            darkTextColors.has(d.data.color.toLowerCase()) ? "#fff" : "#000"
          )
          .attr("transform", (d) => {
            if (d.depth === 2) {
              const x = (xScale(d.x0) + xScale(d.x1)) / 2;
              const y = yScale(d.depth);
              return `rotate(-90, ${x}, ${y})`;
            }
            return null;
          })
          .style("font-size", (d) => {
            const rectWidth = xScale(d.x1) - xScale(d.x0);
            if (rectWidth < 40) return "14px";
            return "15px";
          })
          .style("opacity", (d) => {
            const rectWidth = xScale(d.x1) - xScale(d.x0);
            const rectHeight = levelHeight - 2;
            const textLength = d.data.name.replaceAll("-", "").length * 6;
            if (d.depth === 2) {
              return rectHeight > textLength && rectWidth > 13 ? 1 : 0;
            }
            return rectWidth > textLength && rectHeight > 12 ? 1 : 0;
          })
          .text((d) => d.data.name.replaceAll("-", "")),
      (update) =>
        update
          .attr("x", (d) => (xScale(d.x0) + xScale(d.x1)) / 2)
          .attr("y", (d) => yScale(d.depth))
          .attr("fill", (d) =>
            darkTextColors.has(d.data.color.toLowerCase()) ? "#fff" : "#000"
          )
          .text((d) => d.data.name.replaceAll("-", "")),
      (exit) => exit.remove()
    );

  /* ---- 5. Zoom, pan & interactions on background ---- */

  function clickedZoom(event, p) {
    const wasFocused = focus === p;
    focus = wasFocused ? root : p;

    xScale.domain([focus.x0, focus.x1]);
    yScale.domain([0, depth]);

    const t = zoomGroup.transition().duration(750);

    rects
      .transition(t)
      .attr("x", (d) => xScale(d.x0))
      .attr("y", (d) => yScale(d.depth) - levelHeight / 2)
      .attr("width", (d) => xScale(d.x1) - xScale(d.x0))
      .attr("height", levelHeight - 2);

    labels
      .transition(t)
      .attr("x", (d) => (xScale(d.x0) + xScale(d.x1)) / 2)
      .attr("y", (d) => yScale(d.depth))
      .attr("transform", (d) => {
        const x = (xScale(d.x0) + xScale(d.x1)) / 2;
        const y = yScale(d.depth);
        return d.depth === 2 ? `rotate(-90, ${x}, ${y})` : null;
      })
      .style("opacity", (d) => {
        const rectWidth = xScale(d.x1) - xScale(d.x0);
        const rectHeight = levelHeight - 2;
        const textLength = d.data.name.length * 7;
        return rectWidth > textLength && rectHeight > 12 ? 1 : 0;
      });
  }

  function clickedFilter(event, d) {
    event.preventDefault();

    const newFilters = cloneSelectedFilters();

    const isGroup = d.depth === 1;
    const isIdentity = d.depth === 2;
    const val = d.data.name.toLowerCase();

    let targetCategory = null;
    if (isGroup) targetCategory = "Nº of Colors";
    if (isIdentity) targetCategory = "Color Identity";
    if (!targetCategory) return;

    if (!newFilters[targetCategory]) {
      newFilters[targetCategory] = new Set();
    }

    const wasSelected = newFilters[targetCategory].has(val);
    if (wasSelected) {
      newFilters[targetCategory].delete(val);
    } else {
      newFilters[targetCategory].add(val);
    }

    if (!validateFilterCombination(newFilters)) {
      showPopup(
        "Invalid filter: selected color identity/identities do not match the selected color group(s)."
      );
      return;
    }

    updateState({
      selectedFilters: newFilters,
    });
  }

  // Background double-click: clear all selections.
  svg.on("dblclick", (event) => {
    const target = d3.select(event.target);
    const isRect = target.classed("icicle-rect");
    const isText = target.node().tagName === "text";
    const isInfoIcon = target.classed("info-icon");
    if (!isRect && !isText && !isInfoIcon) clearSelection();
  });

  // Wheel zoom (horizontal zoom around mouse)
  svg.on("wheel", (event) => {
    focus = root;
    event.preventDefault();

    const delta = event.deltaY;
    const zoomFactor = 1.15;
    const mouseX = d3.pointer(event, zoomGroup.node())[0];
    const mouseRatio = mouseX / chartWidth;

    const [d0, d1] = xScale.domain();
    const domainWidth = d1 - d0;

    let newWidth =
      delta > 0 ? domainWidth * zoomFactor : domainWidth / zoomFactor;
    newWidth = Math.max(newWidth, 10); // avoid degenerate

    const minX = d0 + (domainWidth - newWidth) * mouseRatio;
    const maxX = minX + newWidth;

    xScale.domain([Math.max(0, minX), Math.min(chartWidth, maxX)]);

    rects
      .attr("x", (d) => xScale(d.x0))
      .attr("width", (d) => xScale(d.x1) - xScale(d.x0));

    labels
      .attr("x", (d) => (xScale(d.x0) + xScale(d.x1)) / 2)
      .style("opacity", (d) => {
        const rectWidth = xScale(d.x1) - xScale(d.x0);
        const textLength = d.data.name.replaceAll("-", "").length * 6;
        return rectWidth > textLength ? 1 : 0;
      })
      .attr("transform", (d) => {
        const x = (xScale(d.x0) + xScale(d.x1)) / 2;
        const y = yScale(d.depth);
        return d.depth === 2 ? `rotate(-90, ${x}, ${y})` : null;
      });
  });

  // Ctrl + left-drag horizontal panning
  svg
    .on("mousedown", (event) => {
      if (event.button !== 0 || !event.ctrlKey) return;
      focus = root;
      isPanning = true;
      wasPanning = false;
      panStartX = event.clientX;
      panStartDomain = xScale.domain();
    })
    .on("mousemove", (event) => {
      if (!isPanning) return;

      const dx = event.clientX - panStartX;
      if (Math.abs(dx) > 3) wasPanning = true;

      const [start, end] = panStartDomain;
      const domainWidth = end - start;
      const scaleWidth = xScale.range()[1] - xScale.range()[0];
      const pxPerUnit = scaleWidth / domainWidth;
      const offset = dx / pxPerUnit;

      let newStart = start - offset;
      let newEnd = end - offset;

      const dataStart = root.x0;
      const dataEnd = root.x1;

      if (newStart < dataStart) {
        newStart = dataStart;
        newEnd = dataStart + domainWidth;
      } else if (newEnd > dataEnd) {
        newEnd = dataEnd;
        newStart = dataEnd - domainWidth;
      }

      xScale.domain([newStart, newEnd]);

      rects
        .attr("x", (d) => xScale(d.x0))
        .attr("width", (d) => xScale(d.x1) - xScale(d.x0));

      labels
        .attr("x", (d) => (xScale(d.x0) + xScale(d.x1)) / 2)
        .style("opacity", (d) => {
          const rectWidth = xScale(d.x1) - xScale(d.x0);
          const textLength = d.data.name.replaceAll("-", "").length * 6;
          return rectWidth > textLength ? 1 : 0;
        })
        .attr("transform", (d) => {
          const x = (xScale(d.x0) + xScale(d.x1)) / 2;
          const y = yScale(d.depth);
          return d.depth === 2 ? `rotate(-90, ${x}, ${y})` : null;
        });
    })
    .on("mouseup", () => {
      isPanning = false;
    })
    .on("mouseleave", () => {
      isPanning = false;
    });

  /* ---- 6. Legend & initial sync ---- */

  const rectDimensions = Math.min(chartHeight * 0.097, 22);
  const legendFontSize = Math.min(containerWidth * 0.0187, 13);

  renderLegend(
    svg,
    chartWidth,
    margin,
    containerHeight,
    rectDimensions,
    legendFontSize
  );

  paintIcicle();
}
