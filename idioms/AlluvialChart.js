import { updateState, cloneSelectedFilters, toggleGlobalFilter } from "../state.js";
import { alluvialAggregate } from "../core/index.js";
import {
  setSelected,
  clearSelection,
  setHover,
  clearHover,
  onSelectionChange,
  onHoverChange,
  getSelectionSummary,
  getHoverSummary,
} from "./Linking.js";
import { moveTooltip, addInfoIcon, getDiscreteColor, getHighlightedColor, getSelectedColor } from "./ui.js";

/* =========================================================================
 *  CONSTANTS & SHARED STATE
 * ========================================================================= */

const customOrder = [
  "original",
  "reprint",
  "functional reprint",
  "common",
  "uncommon",
  "rare",
  "mythic",
  "special",
  "bonus",
];

// Alluvial-local selection UI state. It is turned into "originality|rarity"
// pairs for the shared selection model (source "alluvial"):
//   nodes:  (selected originalities or all) × (selected rarities or all)
//   links:  toggled individually, added on top
const selectedOriginalities = new Set(); // node selections (left)
const selectedRarities = new Set(); // node selections (right)
const manuallySelectedLinks = new Set(); // "o|r" links toggled directly
let knownOriginalities = []; // node names currently drawn
let knownRarities = [];

const infoTooltipText = `
<strong>Alluvial Chart Interactions:</strong><br>
• <strong>Click</strong> a node or link: Selects or deselects a category; updates highlights across views.<br>
• <strong>Right-Click</strong> a node or link: Toggles a global filter in the filter panel.<br>
• <strong>Hover</strong>: Shows details and highlights corresponding categories.<br>
• <strong>Double-Click</strong> background: Clears all selections.<br>
`;

/* =========================================================================
 *  UTILITY FUNCTIONS
 * ========================================================================= */

// ---- Color helpers (price → discrete palette) ----




function getNodeColor(price, minPrice, maxPrice) {
  const denom = maxPrice - minPrice || 1;
  const percentage = ((price - minPrice) / denom) * 100;
  return getDiscreteColor(percentage);
}

// ---- Label/legend helpers ----

function formatPriceLabel(priceAttr) {
  return priceAttr.replace("price_", "").replace(/_/g, " ").toUpperCase();
}

function formatPriceSymbol(attr) {
  const lower = attr.toLowerCase();
  if (lower.includes("usd")) return "$";
  if (lower.includes("eur")) return "€";
  return "";
}

// ---- Generic helpers ----

// Apply color scale to a selection of nodes.
function applyColorScale(selection, attrName, priceRange) {
  selection.attr(attrName, (d) =>
    getNodeColor(d.avgPrice, priceRange.min, priceRange.max)
  );
}

/* =========================================================================
 *  SELECTION (local UI state → shared model) & PAINTING
 * ========================================================================= */

/** Pairs selected through node clicks (empty side = every value). */
function nodePairs() {
  const pairs = new Set();
  if (selectedOriginalities.size === 0 && selectedRarities.size === 0) return pairs;
  const os = selectedOriginalities.size ? [...selectedOriginalities] : knownOriginalities;
  const rs = selectedRarities.size ? [...selectedRarities] : knownRarities;
  for (const o of os) for (const r of rs) pairs.add(`${o}|${r}`);
  return pairs;
}

function publishSelection() {
  setSelected("alluvial", { pairs: new Set([...nodePairs(), ...manuallySelectedLinks]) });
}

/** Toggle a node (Originality or Rarity) selection. */
function handleNodeClick(name, isOriginality) {
  const set = isOriginality ? selectedOriginalities : selectedRarities;
  if (set.has(name)) {
    set.delete(name);
    // Links picked by hand through this node go with it.
    for (const key of [...manuallySelectedLinks]) {
      const [o, r] = key.split("|");
      if ((isOriginality && o === name) || (!isOriginality && r === name)) manuallySelectedLinks.delete(key);
    }
  } else {
    set.add(name);
  }
  publishSelection();
}

/** Toggle a single link. Deselecting a link implied by node selections turns
 *  those nodes into explicit links, minus this one. */
function handleLinkClick(key) {
  const fromNodes = nodePairs();
  if (manuallySelectedLinks.has(key)) {
    manuallySelectedLinks.delete(key);
  } else if (fromNodes.has(key)) {
    fromNodes.forEach((k) => manuallySelectedLinks.add(k));
    manuallySelectedLinks.delete(key);
    selectedOriginalities.clear();
    selectedRarities.clear();
  } else {
    manuallySelectedLinks.add(key);
  }
  publishSelection();
}

/**
 * Paint nodes and links from the shared summaries: an element is selected /
 * hovered if any selected / hovered printing has that originality, rarity or
 * originality|rarity pair. Hover wins over selection.
 */
function paintAlluvial() {
  const sel = getSelectionSummary();
  const hov = getHoverSummary();
  const nodeHit = (summary, d) =>
    summary.has(d.x0 === 0 ? "originalities" : "rarities", d.name.toLowerCase());
  const linkHit = (summary, d) =>
    summary.has("pairs", `${d.source.name.toLowerCase()}|${d.target.name.toLowerCase()}`);

  d3.selectAll(".AlluvialChart g.node rect").each(function (d) {
    const isSel = sel.active && nodeHit(sel, d);
    const isHov = hov.count > 0 && nodeHit(hov, d);
    d3.select(this)
      .classed("selectedHovered", isSel)
      .classed("hover-temp", isHov)
      .attr("fill", isHov ? d.highlightColor : isSel ? d.selectedColor : d.baseColor);
  });

  d3.selectAll(".AlluvialChart path.link").each(function (d) {
    const isSel = sel.active && linkHit(sel, d);
    const isHov = hov.count > 0 && linkHit(hov, d);
    d3.select(this)
      .classed("selectedHovered", isSel)
      .classed("hover-temp", isHov)
      .attr("stroke", isHov ? d.highlightColor : isSel ? d.selectedColor : d.baseColor);
  });
}

onSelectionChange((summary, selection) => {
  // Another view cleared everything (e.g. double-click) → reset local UI state.
  if (!selection.has("alluvial")) {
    selectedOriginalities.clear();
    selectedRarities.clear();
    manuallySelectedLinks.clear();
  }
  paintAlluvial();
});
onHoverChange(paintAlluvial);

/* =========================================================================
 *  LEGEND RENDERING
 * ========================================================================= */

function renderAlluvialLegend(
  svg,
  chartWidth,
  margin,
  chartHeight,
  svgWidth,
  priceRange,
  priceAttr,
  showPatterns = true
) {
  const numBins = 5;
  const priceStep = (priceRange.max - priceRange.min) / numBins;
  const symbol = formatPriceSymbol(priceAttr);

  const dynamicLegendData = Array.from({ length: numBins }, (_, i) => ({
    label: `${symbol ? symbol + " " : ""}${(
      priceRange.min +
      (i + 1) * priceStep
    ).toFixed(2)}`,
    color: getDiscreteColor(i * (100 / numBins)),
  })).reverse();

  const legendX = chartWidth + margin.right;
  const legendY = margin.top;
  const rectSize = Math.min(chartHeight * 0.097, 22);
  const fontSize = Math.min(svgWidth * 0.0187, 13);

  svg.select(".legend").remove();

  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectSize * 6, 132))
    .text("Avg Price")
    .attr("fill", "#000")
    .style("font-size", `${fontSize}px`)
    .style("font-weight", "bold");

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectSize * 6.75, 149))
    .text("(" + formatPriceLabel(priceAttr) + ")")
    .attr("fill", "#000")
    .style("font-size", `${fontSize}px`)
    .style("font-weight", "bold");

  dynamicLegendData.forEach((interval, i) => {
    const entry = legend
      .append("g")
      .attr("transform", `translate(0, ${i * rectSize})`);

    const baseColor = interval.color;
    const reversedIndex = numBins - 1 - i;
    const selectedColor = getSelectedColor(reversedIndex * (100 / numBins));
    const patternId = `legend-pattern-${i}`;

    const defs = svg.select("defs").empty()
      ? svg.append("defs")
      : svg.select("defs");

    if (showPatterns) {
      const p = 0.5;
      const a = Math.sqrt(2 * p);

      const pattern = defs
        .append("pattern")
        .attr("id", patternId)
        .attr("width", 1)
        .attr("height", 1)
        .attr("patternUnits", "objectBoundingBox")
        .attr("patternContentUnits", "objectBoundingBox");

      pattern
        .append("rect")
        .attr("width", 1)
        .attr("height", 1)
        .attr("fill", baseColor);

      pattern
        .append("path")
        .attr("d", `M0,0 L${a},0 L0,${a} Z`)
        .attr("fill", selectedColor);
    }

    entry
      .append("rect")
      .attr("width", rectSize)
      .attr("height", rectSize)
      .style("shape-rendering", "crispEdges")
      .attr("fill", showPatterns ? `url(#${patternId})` : baseColor)
      .attr("stroke", "#000");

    entry
      .append("text")
      .attr("x", chartWidth * 0.054)
      .attr("y", rectSize * 0.25 - 1)
      .text(interval.label)
      .attr("fill", "#000")
      .style("font-size", `${fontSize}px`);
  });

  const zeroEntry = legend
    .append("g")
    .attr("transform", `translate(0, ${numBins * rectSize})`);

  zeroEntry
    .append("text")
    .attr("x", chartWidth * 0.054)
    .attr("y", rectSize * 0.25 - 1)
    .text(`${symbol} 0.00`)
    .attr("fill", "#000")
    .style("font-size", `${fontSize}px`);
}

/* =========================================================================
 *  CHART CREATION
 * ========================================================================= */

export function createAlluvialChart(
  data,
  containerId,
  isUpdate = false,
  selectedPriceAttribute = "price_eur"
) {
  const container = d3.select(containerId);
  const { width, height } = container.node().getBoundingClientRect();
  const svgWidth = width;
  const svgHeight = height;

  const chartWidth = svgWidth * 0.85;
  const chartHeight = svgHeight * 0.75;

  const margin = {
    top: height * 0.17,
    right: 26,
    bottom: 40,
    left: width * 0.015,
  };

  // --- Compute categories & aggregates ---
  // (core/aggregates.js — tested against the previous inline version)
  const agg = alluvialAggregate(data, selectedPriceAttribute);
  const origSet = new Set(agg.links.map((l) => l.source));
  const nodes = agg.nodes
    .slice()
    .sort((a, b) => customOrder.indexOf(a.name) - customOrder.indexOf(b.name));
  const nodeIndexMap = Object.fromEntries(nodes.map((n, i) => [n.name, i]));
  const links = agg.links.map((l) => ({
    ...l,
    source: nodeIndexMap[l.source],
    target: nodeIndexMap[l.target],
  }));

  // --- SVG & Sankey setup ---

  let svg = container.select("svg");
  if (svg.empty()) {
    svg = container
      .append("svg")
      .attr("width", svgWidth)
      .attr("height", svgHeight);
  }

  svg.selectAll("g").remove();

  const sankeyGroup = svg
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Info icon + tooltip
  const iconX = svgWidth * 0.03;
  const iconY = svgHeight * 0.1;
  const iconRadius = svgWidth * 0.015;
  const infoTextSize = Math.min(svgWidth * 0.0187, 15);
  const tooltip = d3.select("#tooltip");

  addInfoIcon(svg, { x: iconX, y: iconY, radius: iconRadius, fontSize: infoTextSize, html: infoTooltipText });

  const sankey = d3
    .sankey()
    .nodeWidth(Math.min(chartHeight * 0.097, 20))
    .nodePadding(Math.min(chartHeight * 0.097, 20))
    .extent([
      [0, 0],
      [chartWidth, chartHeight],
    ]);

  const sankeyData = sankey({
    nodes: nodes.map((d) => ({ ...d })),
    links: links.map((d) => ({ ...d })),
  });

  // Vertically center left column.
  const leftNodes = sankeyData.nodes.filter(
    (n) => n.x0 === d3.min(sankeyData.nodes, (d) => d.x0)
  );
  const totalLeftHeight =
    d3.max(leftNodes, (d) => d.y1) - d3.min(leftNodes, (d) => d.y0);
  const offset = (chartHeight - totalLeftHeight) / 2;
  leftNodes.forEach((node) => {
    node.y0 += offset;
    node.y1 += offset;
  });
  sankey.update(sankeyData);

  const allPrices = [
    ...sankeyData.nodes.map((d) => d.avgPrice),
    ...sankeyData.links.map((d) => d.avgPrice),
  ];
  const priceRange = {
    min: d3.min(allPrices),
    max: d3.max(allPrices),
  };

  // --- Render links ---

  sankeyGroup
    .selectAll(".link")
    .data(
      sankeyData.links.sort((a, b) => b.width - a.width),
      (d) => `${d.source.name}|${d.target.name}`
    )
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "link")
          .attr("d", d3.sankeyLinkHorizontal())
          .attr("fill", "none")
          .attr("stroke-opacity", 0.5)
          .attr("stroke-width", (d) => Math.max(1, d.width))
          .each(function (d) {
            const denom = priceRange.max - priceRange.min || 1;
            const pct = ((d.avgPrice - priceRange.min) / denom) * 100;
            d.baseColor = getDiscreteColor(pct);
            d.highlightColor = getHighlightedColor(pct);
            d.selectedColor = getSelectedColor(pct);
            d3.select(this).attr("stroke", d.baseColor);
          })
          .on("mouseover", function (event, d) {
            tooltip
              .style("display", "block")
              .html(
                `From: ${d.source.name}<br>To: ${d.target.name}<br>Cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(
                  2
                )}`
              );

            setHover("alluvial", {
              pairs: new Set([`${d.source.name.toLowerCase()}|${d.target.name.toLowerCase()}`]),
            });
          })
          .on("mousemove", moveTooltip)
          .on("mouseout", () => {
            tooltip.style("display", "none");
            clearHover();
          })
          .on("click", function (event, d) {
            const o = d.source.name.toLowerCase();
            const r = d.target.name.toLowerCase();
            handleLinkClick(`${o}|${r}`);
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            const updatedFilters = cloneSelectedFilters();

            const orig = d.source.name;
            const rarity = d.target.name;

            updatedFilters["Originality"].has(orig)
              ? updatedFilters["Originality"].delete(orig)
              : updatedFilters["Originality"].add(orig);

            updatedFilters["Rarity"].has(rarity)
              ? updatedFilters["Rarity"].delete(rarity)
              : updatedFilters["Rarity"].add(rarity);

            updateState({ selectedFilters: updatedFilters });
          }),
      (update) =>
        update
          .attr("d", d3.sankeyLinkHorizontal())
          .attr("stroke-width", (d) => Math.max(1, d.width))
          .each(function (d) {
            const denom = priceRange.max - priceRange.min || 1;
            const pct = ((d.avgPrice - priceRange.min) / denom) * 100;
            d.baseColor = getDiscreteColor(pct);
            d.highlightColor = getHighlightedColor(pct);
            d.selectedColor = getSelectedColor(pct);
            d3.select(this).attr("stroke", d.baseColor);
          }),
      (exit) => exit.remove()
    );

  // --- Render nodes ---

  const nodeGroups = sankeyGroup
    .selectAll(".node")
    .data(sankeyData.nodes, (d) => d.name)
    .join(
      (enter) => {
        const g = enter.append("g").attr("class", "node");

        g.append("rect")
          .attr("x", (d) => Math.round(d.x0))
          .attr("y", (d) => Math.round(d.y0))
          .attr("width", (d) => d.x1 - d.x0)
          .attr("height", (d) => d.y1 - d.y0)
          .style("shape-rendering", "crispEdges")
          .attr("stroke", "#000")
          .each(function (d) {
            const color = getNodeColor(
              d.avgPrice,
              priceRange.min,
              priceRange.max
            );
            d.baseColor = color;

            const denom = priceRange.max - priceRange.min || 1;
            const pct = ((d.avgPrice - priceRange.min) / denom) * 100;

            d.highlightColor = getHighlightedColor(pct);
            d.selectedColor = getSelectedColor(pct);

            d3.select(this).attr("fill", color);
          })
          .on("mouseover", function (event, d) {
            tooltip
              .style("display", "block")
              .html(
                `Category: ${d.name}<br>Total cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(
                  2
                )}`
              );

            const field = d.x0 === 0 ? "originalities" : "rarities";
            setHover("alluvial", { [field]: new Set([d.name.toLowerCase()]) });
          })
          .on("mousemove", moveTooltip)
          .on("mouseout", () => {
            tooltip.style("display", "none");
            clearHover();
          })
          .on("click", function (event, d) {
            const name = d.name.toLowerCase();
            const isOriginality = d.x0 === 0;
            handleNodeClick(name, isOriginality);
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            toggleGlobalFilter(d.x0 === 0 ? "Originality" : "Rarity", d.name);
          });

        const nodeTextSize = Math.min(svgWidth * 0.0187, 13);
        g.append("text")
          .attr("x", (d) => {
            const centerX = (d.x0 + d.x1) / 2;
            const isLeftSide = centerX < width / 2;
            return isLeftSide ? d.x0 : d.x1;
          })
          .attr("y", (d) => d.y0 - 5)
          .attr("text-anchor", (d) => {
            const centerX = (d.x0 + d.x1) / 2;
            const isLeftSide = centerX < width / 2;
            return isLeftSide ? "start" : "end";
          })
          .text((d) => d.name)
          .attr("font-size", `${nodeTextSize}px`)
          .attr("fill", "#000")
          .style("pointer-events", "auto")
          .on("mouseover", function (event, d) {
            const explanations = {
              original:
                "<strong>Original Card</strong><br>First-ever printing of a card.",
              reprint:
                "<strong>Reprint</strong><br>Later printing with same function.",
              "functional reprint":
                "<strong>Functional Reprint</strong><br>Different name, same rules.",
            };
            const key = d.name.toLowerCase();
            if (explanations[key]) {
              tooltip.style("display", "block").html(explanations[key]);
            }
          })
          .on("mousemove", moveTooltip)
          .on("mouseout", () => {
            tooltip.style("display", "none");
          });

        return g;
      },
      (update) =>
        update
          .select("rect")
          .attr("x", (d) => d.x0)
          .attr("y", (d) => d.y0)
          .attr("width", (d) => d.x1 - d.x0)
          .attr("height", (d) => d.y1 - d.y0)
          .call((sel) => applyColorScale(sel, "fill", priceRange)),
      (exit) => exit.remove()
    );

  // Background double-click → clear via shared event.
  svg.on("dblclick", (event) => {
    const target = d3.select(event.target);
    const isNode = target.classed("node");
    const isLink = target.classed("link");
    if (!isNode && !isLink) {
      clearSelection();
    }
  });

  renderAlluvialLegend(
    svg,
    chartWidth,
    margin,
    chartHeight,
    svgWidth,
    priceRange,
    selectedPriceAttribute,
    true
  );

  // Align visuals with existing state on (re)render.
  knownOriginalities = agg.nodes.filter((n) => origSet.has(n.name)).map((n) => n.name);
  knownRarities = agg.nodes.filter((n) => !origSet.has(n.name)).map((n) => n.name);
  paintAlluvial();
}
