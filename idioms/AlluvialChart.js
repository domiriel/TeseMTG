import { updateState, getState } from "../state.js";
import {
  // Emitted events
  emitAlluvialHover,
  emitClearAlluvialHover,
  emitAlluvialLinkHover,
  emitAlluvialLink,
  emitClearSelection,

  // Incoming events (other views → Alluvial)
  onHoverCard,
  onClearHover,
  onSetHover,
  onClearSetHover,
  onSetTypeHover,
  onRectHover,
  onClearRectHover,
  onNumColorsHover,
  onClearNumColorsHover,
  onLineYearHover,
  onClearLineYearHover,
  onLineChartClick,
  onLineChartBrush,
  onTimelineBrush,
  onTimelineSetClick,
  onTimelineSetTypeClick,
  onClearTimelineBrush,
  onScatterplotCards,
  onClearScatterplotBrush,
  onClearLineChartBrush,
  onIcicleClick,
  onIcicleNumClick,
  onClearIcicleSelections,
  onClearTimelineSelections,
  onClearSelection,
} from "./Events.js";

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

// Alluvial-local and cross-view selection state
const selectedOriginalities = new Set();       // node selections (left)
const selectedRarities = new Set();            // node selections (right)
const activeAlluvialLinks = new Set();         // links derived from node selections
const manuallySelectedLinks = new Set();       // links toggled directly
const activeAlluvialSelections = new Map();    // constraints from other views

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

function getDiscreteColor(percentage) {
  if (percentage < 20) return "#ffd394";
  if (percentage < 40) return "#d3ae7c";
  if (percentage < 60) return "#a98b66";
  if (percentage < 80) return "#806a4f";
  return "#594a3a";
}

function getHighlightedColor(percentage) {
  if (percentage < 20) return "#ffca00";
  if (percentage < 40) return "#e7b006";
  if (percentage < 60) return "#ce970b";
  if (percentage < 80) return "#b5800d";
  return "#9b690d";
}

function getSelectedColor(percentage) {
  if (percentage < 20) return "#c7daff";
  if (percentage < 40) return "#a2b1d3";
  if (percentage < 60) return "#7d89a8";
  if (percentage < 80) return "#5b6380";
  return "#3a4059";
}

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

// Build "orig|rar" keys from two sets.
function buildLinkKeySet(originalities = new Set(), rarities = new Set()) {
  const keys = new Set();
  for (const o of originalities) {
    for (const r of rarities) {
      keys.add(`${o}|${r}`);
    }
  }
  return keys;
}

// Apply color scale to a selection of nodes.
function applyColorScale(selection, attrName, priceRange) {
  selection.attr(attrName, (d) =>
    getNodeColor(d.avgPrice, priceRange.min, priceRange.max)
  );
}

/* =========================================================================
 *  SELECTION LOGIC (Alluvial & cross-view)
 * ========================================================================= */

/**
 * Recompute activeAlluvialLinks from node selections.
 *
 * Logic:
 * - Within Alluvial: multiple selected originalities/rarities/link-pairs use OR logic.
 * - Across charts: Alluvial constraints are AND-ed with other active charts (Icicle, Timeline, Line).
 * - Scatterplot: its selections are handled separately as an additive union and are never reduced by this step.
 *
 * A link is active if it matches the OR rules inside Alluvial
 * and remains compatible with the global cross-chart constraints.
 */


function updateActiveAlluvialLinks() {
  activeAlluvialLinks.clear();

  const oSize = selectedOriginalities.size;
  const rSize = selectedRarities.size;

  if (oSize === 0 && rSize === 0) return;

  d3.selectAll("path.link").each(function (d) {
    const o = d.source.name.toLowerCase();
    const r = d.target.name.toLowerCase();

    const oMatch = oSize === 0 || selectedOriginalities.has(o);
    const rMatch = rSize === 0 || selectedRarities.has(r);

    if (oMatch && rMatch) {
      activeAlluvialLinks.add(`${o}|${r}`);
    }
  });
}

/**
 * Toggle selection for a node (Originality or Rarity) and sync with link state.
 */
function handleNodeClick(name, isOriginality) {
  const selectedSet = isOriginality ? selectedOriginalities : selectedRarities;

  const getLinksForNode = (node) => {
    const links = [];
    d3.selectAll("path.link").each(function (d) {
      const o = d.source.name.toLowerCase();
      const r = d.target.name.toLowerCase();
      const key = `${o}|${r}`;
      if ((isOriginality && o === node) || (!isOriginality && r === node)) {
        links.push(key);
      }
    });
    return links;
  };

  const linksForNode = getLinksForNode(name);
  const manuallySelected = linksForNode.filter((l) =>
    manuallySelectedLinks.has(l)
  );

  if (selectedSet.has(name)) {
    // Node selected → unselect node and all its links.
    selectedSet.delete(name);
    linksForNode.forEach((l) => {
      manuallySelectedLinks.delete(l);
      activeAlluvialLinks.delete(l);
    });
  } else if (manuallySelected.length === linksForNode.length) {
    // All links manually selected → clear them, keep node unselected.
    linksForNode.forEach((l) => manuallySelectedLinks.delete(l));
  } else {
    // Promote to node selection; clear manual link overrides for this node.
    selectedSet.add(name);
    manuallySelected.forEach((l) => manuallySelectedLinks.delete(l));
  }

  updateActiveAlluvialLinks();
  emitAlluvialLink([...activeAlluvialLinks, ...manuallySelectedLinks]);
  updateAlluvialFromSelections();
}

/**
 * Combine:
 *  - Alluvial-local selections (nodes/links)
 *  - External selections (icicle, timeline, line chart, scatterplot)
 * into a final set of active links and style the chart accordingly.
 *
 * AND logic between sources; scatterplot constraints are unioned on top.
 */
function updateAlluvialFromSelections() {
  const fullAlluvialLinkSet = new Set(activeAlluvialLinks);
  manuallySelectedLinks.forEach((l) => fullAlluvialLinkSet.add(l));

  // Group constraints by source.
  const groupedBySource = new Map();
  for (const [_, { source, originalities, rarities }] of activeAlluvialSelections) {
    if (!groupedBySource.has(source)) {
      groupedBySource.set(source, {
        originalities: new Set(),
        rarities: new Set(),
      });
    }
    const group = groupedBySource.get(source);
    originalities?.forEach((o) => group.originalities.add(o));
    rarities?.forEach((r) => group.rarities.add(r));
  }

  const scatterGroup = groupedBySource.get("scatterplot");
  groupedBySource.delete("scatterplot");

  // If no selections at all → reset to base state.
  if (activeAlluvialSelections.size === 0 && fullAlluvialLinkSet.size === 0) {
    d3.selectAll("g.node rect").each(function (d) {
      d3.select(this)
        .classed("selectedHovered", false)
        .attr("fill", d.baseColor);
    });

    d3.selectAll("path.link").each(function (d) {
      d3.select(this)
        .classed("selectedHovered", false)
        .attr("stroke", d.baseColor);
    });

    return;
  }

  let finalLinks = null;

  // Intersect constraints from non-scatterplot sources.
  for (const { originalities, rarities } of groupedBySource.values()) {
    const linkSet = buildLinkKeySet(originalities, rarities);
    if (finalLinks === null) {
      finalLinks = linkSet;
    } else {
      finalLinks = new Set([...finalLinks].filter((l) => linkSet.has(l)));
    }
  }

  // Only scatterplot active.
  if (finalLinks === null && scatterGroup) {
    finalLinks = buildLinkKeySet(
      scatterGroup.originalities,
      scatterGroup.rarities
    );
  }

  // Union scatterplot constraints on top.
  if (scatterGroup && finalLinks !== null) {
    const scatterLinks = buildLinkKeySet(
      scatterGroup.originalities,
      scatterGroup.rarities
    );
    scatterLinks.forEach((l) => finalLinks.add(l));
  }

  // If only Alluvial-local selections → use them.
  if (finalLinks === null && fullAlluvialLinkSet.size > 0) {
    finalLinks = new Set(fullAlluvialLinkSet);
  }

  // If both exist → intersect with Alluvial-local.
  if (finalLinks && fullAlluvialLinkSet.size > 0) {
    finalLinks = new Set(
      [...finalLinks].filter((l) => fullAlluvialLinkSet.has(l))
    );
  }

  // Collect nodes involved in final links.
  const finalOriginalities = new Set();
  const finalRarities = new Set();
  for (const linkKey of finalLinks) {
    const [o, r] = linkKey.split("|");
    finalOriginalities.add(o);
    finalRarities.add(r);
  }

  // Style nodes.
  d3.selectAll("g.node rect").each(function (d) {
    const isOriginality = d.x0 === 0;
    const match = isOriginality
      ? finalOriginalities.has(d.name.toLowerCase())
      : finalRarities.has(d.name.toLowerCase());

    d3.select(this)
      .classed("selectedHovered", match)
      .attr("fill", match ? d.selectedColor : d.baseColor);
  });

  // Style links.
  d3.selectAll("path.link").each(function (d) {
    const key = `${d.source.name.toLowerCase()}|${d.target.name.toLowerCase()}`;
    const match = finalLinks.has(key);

    d3.select(this)
      .classed("selectedHovered", match)
      .attr("stroke", match ? d.selectedColor : d.baseColor);
  });
}

/* =========================================================================
 *  HIGHLIGHT & HOVER LOGIC
 * ========================================================================= */


/**
 * Hover-only: single card → highlight corresponding originality/rarity.
 */
function highlightAlluvialElementsHoverOnly(card) {
  if (!card) return;

  const hoveredRarities = new Set();
  const hoveredOriginalities = new Set();

  if (card.rarity) hoveredRarities.add(card.rarity.toLowerCase());
  if (Array.isArray(card.all_originalities)) {
    card.all_originalities.forEach((o) =>
      hoveredOriginalities.add(o.toLowerCase())
    );
  }

  d3.selectAll("g.node rect")
    .filter(
      (d) =>
        (d.x0 === 0 && hoveredOriginalities.has(d.name)) ||
        (d.x0 !== 0 && hoveredRarities.has(d.name))
    )
    .each(function (d) {
      d3.select(this)
        .attr("fill", d.highlightColor)
        .classed("hover-temp", true);
    });

  highlightMatchingLinks(hoveredOriginalities, hoveredRarities);
}

/**
 * Hover from Icicle rect.
 */
function highlightAlluvialElementsFromIcicle({ originalities, rarities }) {
  if (!originalities && !rarities) return;

  d3.selectAll("g.node rect")
    .filter(
      (d) =>
        (d.x0 === 0 && originalities?.has(d.name)) ||
        (d.x0 !== 0 && rarities?.has(d.name))
    )
    .each(function (d) {
      d3.select(this)
        .attr("fill", d.highlightColor)
        .classed("hover-temp", true);
    });

  highlightMatchingLinks(originalities, rarities);
}

/**
 * Hover from numColors group.
 */
function highlightAlluvialElementsFromNumColors(originalities, rarities) {
  if (!originalities && !rarities) return;

  d3.selectAll("g.node rect")
    .filter(
      (d) =>
        (d.x0 === 0 && originalities?.has(d.name)) ||
        (d.x0 !== 0 && rarities?.has(d.name))
    )
    .each(function (d) {
      d3.select(this)
        .attr("fill", d.highlightColor)
        .classed("hover-temp", true);
    });

  highlightMatchingLinks(originalities, rarities);
}

/**
 * Hover from year/set mappings.
 */
function highlightAlluvialElementsHoverOnlyFromSet(originalities, rarities) {
  d3.selectAll("g.node rect")
    .filter(
      (d) =>
        (d.x0 === 0 && originalities.has(d.name)) ||
        (d.x0 !== 0 && rarities.has(d.name))
    )
    .each(function (d) {
      d3.select(this)
        .attr("fill", d.highlightColor)
        .classed("hover-temp", true);
    });

  highlightMatchingLinks(originalities, rarities);
}

function highlightAlluvialElementsHoverOnlyFromYear(originalities, rarities) {
  d3.selectAll("g.node rect")
    .filter(
      (d) =>
        (d.x0 === 0 && originalities.has(d.name)) ||
        (d.x0 !== 0 && rarities.has(d.name))
    )
    .each(function (d) {
      d3.select(this)
        .attr("fill", d.highlightColor)
        .classed("hover-temp", true);
    });

  highlightMatchingLinks(originalities, rarities);
}

/**
 * Core: highlight links matching provided originality/rarity sets.
 */
function highlightMatchingLinks(originalities, rarities) {
  d3.selectAll("path.link")
    .filter((d) => {
      const oMatch =
        originalities?.size > 0
          ? originalities.has(d.source.name.toLowerCase())
          : true;
      const rMatch =
        rarities?.size > 0
          ? rarities.has(d.target.name.toLowerCase())
          : true;
      return oMatch && rMatch;
    })
    .each(function (d) {
      d3.select(this)
        .attr("stroke", d.highlightColor)
        .classed("hover-temp", true);
    });
}

/**
 * Clear hover-only effects, keep selection styling intact.
 */
function clearAlluvialHoverOnly() {
  d3.selectAll("g.node rect").each(function (d) {
    const rect = d3.select(this);
    rect.classed("hover-temp", false);
    const selected = rect.classed("selectedHovered");
    rect.attr("fill", selected ? d.selectedColor : d.baseColor);
  });

  d3.selectAll("path.link").each(function (d) {
    const link = d3.select(this);
    link.classed("hover-temp", false);
    const selected = link.classed("selectedHovered");
    link.attr("stroke", selected ? d.selectedColor : d.baseColor);
  });
}

/**
 * Notify other views about Alluvial node hover.
 */
function highlightAllViewsForAlluvial(d) {
  if (!d || !d.name) return;
  const isOriginality = d.x0 === 0;
  const category = isOriginality ? "Originality" : "Rarity";
  emitAlluvialHover(category, d.name);
}

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
 *  CROSS-VIEW EVENT WIRING
 * ========================================================================= */

// Cards table → hover
onHoverCard((card) => {
  highlightAlluvialElementsHoverOnly(card);
});
onClearHover(clearAlluvialHoverOnly);

// Set / SetType hovers → hover mapping
onSetHover(({ originalities, rarities }) =>
  highlightAlluvialElementsHoverOnlyFromSet(originalities, rarities)
);
onSetTypeHover(({ originalities, rarities }) =>
  highlightAlluvialElementsHoverOnlyFromSet(originalities, rarities)
);
onClearSetHover(clearAlluvialHoverOnly);

// Icicle hovers
onRectHover((rectInfo) => highlightAlluvialElementsFromIcicle(rectInfo));
onClearRectHover(clearAlluvialHoverOnly);

// Num colors hovers
onNumColorsHover(({ originalities, rarities }) =>
  highlightAlluvialElementsFromNumColors(originalities, rarities)
);
onClearNumColorsHover(clearAlluvialHoverOnly);

// Line chart hovers
onLineYearHover(({ originalities, rarities }) =>
  highlightAlluvialElementsHoverOnlyFromYear(originalities, rarities)
);
onClearLineYearHover(clearAlluvialHoverOnly);

// ICICLE selections
onIcicleClick(({ colorIdentity, originalities, rarities, numColors }) => {
  if (!colorIdentity) return;
  const key = colorIdentity;
  if (activeAlluvialSelections.has(key)) {
    activeAlluvialSelections.delete(key);
  } else {
    activeAlluvialSelections.set(key, {
      source: "icicle",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
      numColors,
    });
  }
  updateAlluvialFromSelections();
});

onIcicleNumClick(({ numColors, children }) => {
  if (!numColors || !children || children.length === 0) return;

  const isGroupSelected = children.some((c) =>
    activeAlluvialSelections.has(c.name)
  );

  if (isGroupSelected) {
    children.forEach((c) => activeAlluvialSelections.delete(c.name));
  } else {
    children.forEach((c) => {
      activeAlluvialSelections.set(c.name, {
        source: "icicle",
        originalities: new Set(c.originalities || []),
        rarities: new Set(c.rarities || []),
        numColors,
      });
    });
  }
  updateAlluvialFromSelections();
});

// Timeline single clicks
onTimelineSetClick(({ name, originalities, rarities }) => {
  if (!name || !originalities || !rarities) return;
  if (activeAlluvialSelections.has(name)) {
    activeAlluvialSelections.delete(name);
  } else {
    activeAlluvialSelections.set(name, {
      source: "timeline",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
    });
  }
  updateAlluvialFromSelections();
});

onTimelineSetTypeClick(({ type, originalities, rarities }) => {
  if (!type || !originalities || !rarities) return;
  if (activeAlluvialSelections.has(type)) {
    activeAlluvialSelections.delete(type);
  } else {
    activeAlluvialSelections.set(type, {
      source: "timeline",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
    });
  }
  updateAlluvialFromSelections();
});

// Timeline brush
onTimelineBrush((entries) => {
  entries.forEach(({ name, originalities, rarities }) => {
    if (!name) return;
    if (activeAlluvialSelections.has(name)) {
      activeAlluvialSelections.delete(name);
    } else {
      activeAlluvialSelections.set(name, {
        source: "timeline",
        originalities: new Set(originalities),
        rarities: new Set(rarities),
      });
    }
  });
  updateAlluvialFromSelections();
});
onClearTimelineBrush(() => {
  for (const [key, value] of activeAlluvialSelections.entries()) {
    if (value.source === "timeline") activeAlluvialSelections.delete(key);
  }
  updateAlluvialFromSelections();
});

// Line chart selections
onLineChartClick(({ year, originalities, rarities }) => {
  if (!year) return;
  if (activeAlluvialSelections.has(year)) {
    activeAlluvialSelections.delete(year);
  } else {
    activeAlluvialSelections.set(year, {
      source: "lineChart",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
    });
  }
  updateAlluvialFromSelections();
});

onLineChartBrush((entries) => {
  entries.forEach(({ year, originalities, rarities }) => {
    if (!year) return;
    if (activeAlluvialSelections.has(year)) {
      activeAlluvialSelections.delete(year);
    } else {
      activeAlluvialSelections.set(year, {
        source: "lineChart",
        originalities: new Set(originalities),
        rarities: new Set(rarities),
      });
    }
  });
  updateAlluvialFromSelections();
});
onClearLineChartBrush(() => {
  for (const [key, value] of activeAlluvialSelections.entries()) {
    if (value.source === "lineChart") activeAlluvialSelections.delete(key);
  }
  updateAlluvialFromSelections();
});

// Scatterplot selections
onScatterplotCards(({ originalities, rarities }) => {
  const key = "cards";
  if (!activeAlluvialSelections.has(key)) {
    activeAlluvialSelections.set(key, {
      source: "scatterplot",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
    });
  } else {
    const entry = activeAlluvialSelections.get(key);
    entry.originalities = new Set(originalities);
    entry.rarities = new Set(rarities);
  }
  updateAlluvialFromSelections();
});
onClearScatterplotBrush(() => {
  activeAlluvialSelections.delete("cards");
  updateAlluvialFromSelections();
});

// Clear selections from other views
onClearIcicleSelections(() => {
  for (const [key, value] of activeAlluvialSelections.entries()) {
    if (value.source === "icicle") activeAlluvialSelections.delete(key);
  }
  updateAlluvialFromSelections();
});
onClearTimelineSelections(() => {
  for (const [key, value] of activeAlluvialSelections.entries()) {
    if (
      value.source === "timeline" ||
      value.source === "timelineSetsType"
    ) {
      activeAlluvialSelections.delete(key);
    }
  }
  updateAlluvialFromSelections();
});

// Global clear
onClearSelection(() => {
  selectedOriginalities.clear();
  selectedRarities.clear();
  manuallySelectedLinks.clear();
  activeAlluvialLinks.clear();
  activeAlluvialSelections.clear();
  updateAlluvialFromSelections();
});

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

  const originalitySet = new Set();
  const raritySet = new Set();

  data.forEach((card) => {
    if (card.originality)
      originalitySet.add(card.originality.toLowerCase());
    if (card.rarity) raritySet.add(card.rarity.toLowerCase());
  });

  const originalityCategories = Array.from(originalitySet).sort();
  const rarityCategories = Array.from(raritySet).sort();

  const priceAttr = selectedPriceAttribute;

  const origPriceSums = {};
  const origPriceCounts = {};
  const rarityPriceSums = {};
  const rarityPriceCounts = {};
  const linkCounts = {};
  const linkPriceSums = {};
  const linkPriceCounts = {};

  originalityCategories.forEach(
    (o) => (origPriceSums[o] = origPriceCounts[o] = 0)
  );
  rarityCategories.forEach(
    (r) => (rarityPriceSums[r] = rarityPriceCounts[r] = 0)
  );

  data.forEach((card) => {
    const orig = card.originality?.toLowerCase() || "";
    const rarity = card.rarity?.toLowerCase() || "";
    if (!originalitySet.has(orig) || !raritySet.has(rarity)) return;

    const key = `${orig}|${rarity}`;
    linkCounts[key] = (linkCounts[key] || 0) + 1;

    const price = parseFloat(card[priceAttr]);
    if (!isNaN(price)) {
      linkPriceSums[key] = (linkPriceSums[key] || 0) + price;
      linkPriceCounts[key] = (linkPriceCounts[key] || 0) + 1;
      origPriceSums[orig] += price;
      origPriceCounts[orig] += 1;
      rarityPriceSums[rarity] += price;
      rarityPriceCounts[rarity] += 1;
    }
  });

  // Ensure all pairs exist.
  originalityCategories.forEach((orig) => {
    rarityCategories.forEach((rarity) => {
      const key = `${orig}|${rarity}`;
      if (!(key in linkCounts)) {
        linkCounts[key] = 0;
        linkPriceSums[key] = 0;
        linkPriceCounts[key] = 0;
      }
    });
  });

  const nodes = [
    ...originalityCategories.map((o) => ({
      name: o,
      avgPrice: origPriceCounts[o]
        ? origPriceSums[o] / origPriceCounts[o]
        : 0,
    })),
    ...rarityCategories.map((r) => ({
      name: r,
      avgPrice: rarityPriceCounts[r]
        ? rarityPriceSums[r] / rarityPriceCounts[r]
        : 0,
    })),
  ].sort((a, b) => customOrder.indexOf(a.name) - customOrder.indexOf(b.name));

  const nodeIndexMap = Object.fromEntries(nodes.map((n, i) => [n.name, i]));

  const links = originalityCategories.flatMap((orig) =>
    rarityCategories.map((rarity) => {
      const key = `${orig}|${rarity}`;
      return {
        source: nodeIndexMap[orig],
        target: nodeIndexMap[rarity],
        value: linkCounts[key] || 0,
        avgPrice: linkPriceCounts[key]
          ? linkPriceSums[key] / linkPriceCounts[key]
          : 0,
      };
    })
  );

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
    .on("mouseover", () => {
      tooltip.style("display", "block").html(infoTooltipText);
    })
    .on("mousemove", (event) => {
      const w = tooltip.node().offsetWidth;
      const h = tooltip.node().offsetHeight;
      let x = event.pageX + 10;
      let y = event.pageY + 10;
      if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
      if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
      tooltip.style("left", `${x}px`).style("top", `${y}px`);
    })
    .on("mouseout", () => {
      tooltip.style("display", "none");
    });

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

            d3.selectAll("g.node rect")
              .filter(
                (node) =>
                  node.name === d.source.name || node.name === d.target.name
              )
              .each(function (node) {
                d3.select(this)
                  .attr("fill", node.highlightColor)
                  .classed("hover-temp", true);
              });

            d3.select(this)
              .attr("stroke", d.highlightColor)
              .classed("hover-temp", true);

            emitAlluvialLinkHover({
              originality: d.source.name.toLowerCase(),
              rarity: d.target.name.toLowerCase(),
            });
          })
          .on("mousemove", (event) => {
            const w = tooltip.node().offsetWidth;
            const h = tooltip.node().offsetHeight;
            let x = event.pageX + 10;
            let y = event.pageY + 10;
            if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
            if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
            tooltip.style("left", `${x}px`).style("top", `${y}px`);
          })
          .on("mouseout", () => {
            clearAlluvialHoverOnly();
            tooltip.style("display", "none");
            emitClearAlluvialHover();
          })
          .on("click", function (event, d) {
            const o = d.source.name.toLowerCase();
            const r = d.target.name.toLowerCase();
            const linkKey = `${o}|${r}`;

            const isSelected =
              activeAlluvialLinks.has(linkKey) ||
              manuallySelectedLinks.has(linkKey);

            if (isSelected) {
              manuallySelectedLinks.delete(linkKey);
              activeAlluvialLinks.delete(linkKey);

              // Drop node selections if no remaining links use them.
              let oStill = false;
              let rStill = false;
              const remaining = new Set([
                ...activeAlluvialLinks,
                ...manuallySelectedLinks,
              ]);

              for (const key of remaining) {
                const [orig, rare] = key.split("|");
                if (orig === o) oStill = true;
                if (rare === r) rStill = true;
                if (oStill && rStill) break;
              }

              if (!oStill) selectedOriginalities.delete(o);
              if (!rStill) selectedRarities.delete(r);
            } else {
              manuallySelectedLinks.add(linkKey);
            }

            emitAlluvialLink([
              ...activeAlluvialLinks,
              ...manuallySelectedLinks,
            ]);
            updateAlluvialFromSelections();
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            const currentState = getState();
            const updatedFilters = {};

            for (const key in currentState.selectedFilters) {
              updatedFilters[key] = new Set(currentState.selectedFilters[key]);
            }

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
            const rect = d3.select(this);
            rect.attr("fill", d.highlightColor).classed("hover-temp", true);

            tooltip
              .style("display", "block")
              .html(
                `Category: ${d.name}<br>Total cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(
                  2
                )}`
              );

            const isOriginality = d.x0 === 0;
            const originalities = isOriginality
              ? new Set([d.name.toLowerCase()])
              : new Set();
            const rarities = !isOriginality
              ? new Set([d.name.toLowerCase()])
              : new Set();

            highlightMatchingLinks(originalities, rarities);
            highlightAllViewsForAlluvial(d);
          })
          .on("mousemove", (event) => {
            const w = tooltip.node().offsetWidth;
            const h = tooltip.node().offsetHeight;
            let x = event.pageX + 10;
            let y = event.pageY + 10;
            if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
            if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
            tooltip.style("left", `${x}px`).style("top", `${y}px`);
          })
          .on("mouseout", () => {
            clearAlluvialHoverOnly();
            tooltip.style("display", "none");
            emitClearAlluvialHover();
          })
          .on("click", function (event, d) {
            const name = d.name.toLowerCase();
            const isOriginality = d.x0 === 0;
            handleNodeClick(name, isOriginality);
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            const category = d.x0 === 0 ? "Originality" : "Rarity";
            const currentState = getState();
            const updatedFilters = {};

            for (const key in currentState.selectedFilters) {
              updatedFilters[key] = new Set(currentState.selectedFilters[key]);
            }

            updatedFilters[category].has(d.name)
              ? updatedFilters[category].delete(d.name)
              : updatedFilters[category].add(d.name);

            updateState({ selectedFilters: updatedFilters });
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
          .on("mousemove", (event) => {
            const w = tooltip.node().offsetWidth;
            const h = tooltip.node().offsetHeight;
            let x = event.pageX + 10;
            let y = event.pageY + 10;
            if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
            if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
            tooltip.style("left", `${x}px`).style("top", `${y}px`);
          })
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
      emitClearSelection();
      updateAlluvialFromSelections();
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
  updateAlluvialFromSelections();
}
