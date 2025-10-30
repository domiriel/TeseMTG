import { updateState, getState } from "../state.js";
import {
  emitAlluvialHover,
  emitClearAlluvialHover,
  emitAlluvialLinkHover,
  emitAlluvialLink,
  onNumColorsHover,
  onClearNumColorsHover,
  onHoverCard,
  onClearHover,
  onSetHover,
  onClearSetHover,
  onRectHover,
  onClearRectHover,
  onLineYearHover,
  onLineChartClick,
  onLineChartBrush,
  onTimelineBrush,
  onTimelineSetClick,
  onClearTimelineBrush,
  onClearLineChartBrush,
  onClearSelection,
  onClearScatterplotBrush,
  onClearIcicleSelections,
  onClearTimelineSelections,
  onScatterplotCards,
  onSetTypeHover,
  onTimelineSetTypeClick,
  onClearLineYearHover,
  onIcicleClick,
  onIcicleNumClick,
  emitClearSelection,
} from "./Events.js";

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

const selectedOriginalities = new Set();     // from clicked originality nodes
const selectedRarities = new Set();          // from clicked rarity nodes
const activeAlluvialLinks = new Set(); 
const manuallySelectedLinks = new Set();

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

onHoverCard((card) => {
  highlightAlluvialElementsHoverOnly(card);
});

onClearHover(() => {
  clearAlluvialHoverOnly();
});

onSetHover((setInfo) => {
  highlightAlluvialElementsHoverOnlyFromSet(
    setInfo.originalities,
    setInfo.rarities
  );
});

onSetTypeHover((setInfo) => {
  highlightAlluvialElementsHoverOnlyFromSet(
    setInfo.originalities,
    setInfo.rarities
  );
});
function updateActiveAlluvialLinks() {

  activeAlluvialLinks.clear();

  const oSize = selectedOriginalities.size;
  const rSize = selectedRarities.size;
  console.log("Updating active alluvial links with", oSize, rSize);
  // 🛑 If nothing is selected, don't activate any links
  if (oSize === 0 && rSize === 0) {
    return;
  }

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


function buildLinkKeySet(originalities = new Set(), rarities = new Set()) {
  const keys = new Set();
  for (const o of originalities) {
    for (const r of rarities) {
      keys.add(`${o}|${r}`);
    }
  }
  return keys;
}

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
  const rectDimensions = Math.min(chartHeight * 0.097, 22);
  const legendFontSize = Math.min(svgWidth * 0.0187, 13);

  svg.select(".legend").remove(); // Clear old

  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectDimensions * 6, 132))
    .text("Avg Price")
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("shape-rendering", "crispEdges")
    .style("font-weight", "bold");

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectDimensions * 6.75, 149))
    .text("(" + formatPriceLabel(priceAttr) + ")")
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("shape-rendering", "crispEdges")
    .style("font-weight", "bold");

  dynamicLegendData.forEach((interval, i) => {
    const legendEntry = legend
      .append("g")
      .attr("transform", `translate(0, ${i * rectDimensions})`);

    const baseColor = interval.color;
    const reversedIndex = numBins - 1 - i;
    const selectedColor = getSelectedColor(reversedIndex * (100 / numBins));
    const patternId = `legend-pattern-${i}`;

    const defs = svg.select("defs").empty()
      ? svg.append("defs")
      : svg.select("defs");

    if (showPatterns) {
      const p = 0.5;
const a = Math.sqrt(2 * p); // ~= 0.774596

const pattern = defs.append("pattern")
  .attr("id", patternId)
  .attr("width", 1)
  .attr("height", 1)
  .attr("patternUnits", "objectBoundingBox")
  .attr("patternContentUnits", "objectBoundingBox");

// background = 70%
pattern.append("rect")
  .attr("width", 1)
  .attr("height", 1)
  .attr("fill", baseColor);

// top-left triangle = 30%
pattern.append("path")
  .attr("d", `M0,0 L${a},0 L0,${a} Z`)
  .attr("fill", selectedColor);
    }

    legendEntry
      .append("rect")
      .attr("width", rectDimensions)
      .attr("height", rectDimensions)
      .style("shape-rendering", "crispEdges")
      .attr("fill", showPatterns ? `url(#${patternId})` : baseColor)
      .attr("stroke", "#000");

    legendEntry
      .append("text")
      .attr("x", chartWidth * 0.054)
      .attr("y", rectDimensions * 0.25 - 1)
      .text(interval.label)
      .attr("fill", "#000")
      .style("font-size", `${legendFontSize}px`)
      .style("shape-rendering", "crispEdges");
  });

  const zeroEntry = legend
    .append("g")
    .attr("transform", `translate(0, ${numBins * rectDimensions})`);

  zeroEntry
    .append("text")
    .attr("x", chartWidth * 0.054)
    .attr("y", rectDimensions * 0.25 - 1)
    .text(`${symbol} 0.00`)
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("shape-rendering", "crispEdges");
}

const activeAlluvialSelections = new Map();

onClearIcicleSelections(() => {
  for (const [key, value] of activeAlluvialSelections.entries()) {
    if (value.source === "icicle") {
      activeAlluvialSelections.delete(key);
    }
  }
  updateAlluvialFromSelections(); // to re-render Alluvial visuals
});

onClearTimelineSelections(() => {
  for (const [key, value] of activeAlluvialSelections.entries()) {
    if (value.source === "timeline" || value.source === "timelineSetsType") {
      activeAlluvialSelections.delete(key);
    }
  }
  updateAlluvialFromSelections(); // to re-render Alluvial visuals
});

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
  const manuallySelected = linksForNode.filter(l => manuallySelectedLinks.has(l));

  if (selectedSet.has(name)) {
    selectedSet.delete(name);
    linksForNode.forEach(l => {
      manuallySelectedLinks.delete(l);
      activeAlluvialLinks.delete(l);
    });
  } else if (manuallySelected.length === linksForNode.length) {
    // All links are manually selected → just unselect links, don't add node
    linksForNode.forEach(l => manuallySelectedLinks.delete(l));
  } else {
    // Some links manually selected → add node, remove manual links
    selectedSet.add(name);
    manuallySelected.forEach(l => manuallySelectedLinks.delete(l));
  }

  updateActiveAlluvialLinks();
  emitAlluvialLink([...activeAlluvialLinks, ...manuallySelectedLinks]);
  updateAlluvialFromSelections();
}



onClearSelection(() => {
  selectedOriginalities.clear()
  selectedRarities.clear()
  manuallySelectedLinks.clear()
  activeAlluvialLinks.clear()
  activeAlluvialSelections.clear()
  updateAlluvialFromSelections(); // to re-render Alluvial visuals
});

onIcicleClick(({ colorIdentity, originalities, rarities, numColors }) => {
  if (!colorIdentity) return;

  const key = colorIdentity; // could also be numColors or other ids in other handlers

  if (activeAlluvialSelections.has(key)) {
    activeAlluvialSelections.delete(key);
  } else {
    activeAlluvialSelections.set(key, {
      source: "icicle",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
      numColors: numColors
    });
  }
  updateAlluvialFromSelections();
});

onIcicleNumClick(({ numColors, children }) => {
  if (!numColors || !children || children.length === 0) return;
  const isGroupSelected = children.some((child) =>
    activeAlluvialSelections.has(child.name)
  );

  if (isGroupSelected) {
    // Remove all children from the selection map
    children.forEach((child) => activeAlluvialSelections.delete(child.name));
  } else {
    // Add all children with their metadata
    children.forEach((child) => {
      activeAlluvialSelections.set(child.name, {
        source: "icicle",
        originalities: new Set(child.originalities || []),
        rarities: new Set(child.rarities || []),
        numColors: numColors,
      });
    });
  }

  updateAlluvialFromSelections();
});


onTimelineSetClick((setInfo) => {
  const { name, originalities, rarities } = setInfo;
  if (!name || !originalities || !rarities) return;

  if (activeAlluvialSelections.has(name)) {
    // Toggle OFF
    activeAlluvialSelections.delete(name);
  } else {
    // Toggle ON: store the identities
    activeAlluvialSelections.set(name, {
      source: "timeline",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
    });
  }

  updateAlluvialFromSelections();
});

onTimelineSetTypeClick((setInfo) => {
  const { type, originalities, rarities } = setInfo;
  if (!type || !originalities || !rarities) return;

  if (activeAlluvialSelections.has(type)) {
    // Toggle OFF
    activeAlluvialSelections.delete(type);
  } else {
    // Toggle ON: store the identities
    activeAlluvialSelections.set(type, {
      source: "timeline",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
    });
  }

  updateAlluvialFromSelections();
});
onLineChartClick(({ year, originalities, rarities }) => {
  if (!year) return;

  const key = year; // could also be numColors or other ids in other handlers

  if (activeAlluvialSelections.has(key)) {
    activeAlluvialSelections.delete(key);
  } else {
    activeAlluvialSelections.set(key, {
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

    const key = year;

    if (activeAlluvialSelections.has(key)) {
      activeAlluvialSelections.delete(key);
    } else {
      activeAlluvialSelections.set(key, {
        source: "lineChart",
        originalities: new Set(originalities),
        rarities: new Set(rarities),
      });
    }
  });

  updateAlluvialFromSelections();
});

onScatterplotCards(({ originalities, rarities }) => {
  if (!activeAlluvialSelections.has("cards")) {
    activeAlluvialSelections.set("cards", {
      source: "scatterplot",
      originalities: new Set(originalities),
      rarities: new Set(rarities),
    });
  } else {
    const entry = activeAlluvialSelections.get("cards");
    entry.originalities = new Set(originalities);
    entry.rarities = new Set(rarities);
  }

  updateAlluvialFromSelections();
});

onTimelineBrush((entries) => {
  entries.forEach(({ name, originalities, rarities }) => {
    if (!name) return;

    const key = name;

    if (activeAlluvialSelections.has(key)) {
      activeAlluvialSelections.delete(key);
    } else {
      activeAlluvialSelections.set(key, {
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
    if (value.source === "timeline") {
      activeAlluvialSelections.delete(key);
    }
  }

  updateAlluvialFromSelections(); // to re-render Alluvial visuals
});

onClearScatterplotBrush(() => {
  activeAlluvialSelections.delete("cards");
  updateAlluvialFromSelections();
});

onClearLineChartBrush(() => {
  for (const [key, value] of activeAlluvialSelections.entries()) {
    if (value.source === "lineChart") {
      activeAlluvialSelections.delete(key);
    }
  }

  updateAlluvialFromSelections(); // to re-render Alluvial visuals
});

function updateAlluvialFromSelections() {
  const fullAlluvialLinkSet = new Set(activeAlluvialLinks);
  manuallySelectedLinks.forEach((l) => fullAlluvialLinkSet.add(l));
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



  if (
  activeAlluvialSelections.size === 0 &&
  fullAlluvialLinkSet.size === 0
) {
  // Reset nodes
  d3.selectAll("g.node rect").each(function (d) {
    d3.select(this)
      .classed("selectedHovered", false)
      .attr("fill", d.baseColor);
  });

  // Reset links
  d3.selectAll("path.link").each(function (d) {
    d3.select(this)
      .classed("selectedHovered", false)
      .attr("stroke", d.baseColor);
  });

  return; // ⬅️ Stop the function early
}

  let finalLinks = null;

  // Intersect all link sets
  for (const { originalities, rarities } of groupedBySource.values()) {
    const linkSet = buildLinkKeySet(originalities, rarities);
    if (finalLinks === null) {
      finalLinks = linkSet;
    } else {
      finalLinks = new Set([...finalLinks].filter((l) => linkSet.has(l)));
    }
  }

  // If only scatterplot is active
  if (finalLinks === null && scatterGroup) {
    finalLinks = buildLinkKeySet(scatterGroup.originalities, scatterGroup.rarities);
  }

  // Union scatterplot if present
  if (scatterGroup && finalLinks !== null) {
    const scatterLinks = buildLinkKeySet(scatterGroup.originalities, scatterGroup.rarities);
    scatterLinks.forEach((l) => finalLinks.add(l));
  }

  // Fallback to alluvial-only selection
  if (finalLinks === null && fullAlluvialLinkSet.size > 0) {
    finalLinks = new Set(fullAlluvialLinkSet);
  }

  // Intersect with activeAlluvialLinks if they exist
  if (finalLinks && fullAlluvialLinkSet.size > 0) {
    finalLinks = new Set([...finalLinks].filter((l) => fullAlluvialLinkSet.has(l)));

  }

  // Now extract final originality/rarity nodes involved in final links
  const finalOriginalities = new Set();
  const finalRarities = new Set();
  for (const linkKey of finalLinks) {
    const [o, r] = linkKey.split("|");
    finalOriginalities.add(o);
    finalRarities.add(r);
  }

  // Update node visuals
  d3.selectAll("g.node rect").each(function (d) {
    const isOriginality = d.x0 === 0;
    const match = isOriginality
      ? finalOriginalities.has(d.name.toLowerCase())
      : finalRarities.has(d.name.toLowerCase());

    d3.select(this)
      .classed("selectedHovered", match)
      .attr("fill", match ? d.selectedColor : d.baseColor);
  });

  // Update link visuals
  d3.selectAll("path.link").each(function (d) {
    const key = `${d.source.name.toLowerCase()}|${d.target.name.toLowerCase()}`;
    const match = finalLinks.has(key);

    d3.select(this)
      .classed("selectedHovered", match)
      .attr("stroke", match ? d.selectedColor : d.baseColor);
  });
}


onClearSetHover(() => {
  clearAlluvialHoverOnly();
});

onLineYearHover((yearInfo) => {
  highlightAlluvialElementsHoverOnlyFromYear(
    yearInfo.originalities,
    yearInfo.rarities
  );
});

onClearLineYearHover(() => {
  clearAlluvialHoverOnly();
});

onNumColorsHover(({ numColors, originalities, rarities }) => {
  highlightAlluvialElementsFromNumColors(originalities, rarities);
});

onClearNumColorsHover(() => {
  clearAlluvialHoverOnly();
});

onRectHover((rectInfo) => {
  highlightAlluvialElementsFromIcicle(rectInfo);
});

onClearRectHover(() => {
  clearAlluvialHoverOnly();
});



function applyColorScale(selection, attrName, priceRange) {
  selection.attr(attrName, (d) =>
    getNodeColor(d.avgPrice, priceRange.min, priceRange.max)
  );
}

function formatPriceLabel(priceAttr) {
  return priceAttr.replace("price_", "").replace(/_/g, " ").toUpperCase();
}

function formatPriceSymbol(attr) {
  if (attr.toLowerCase().includes("usd")) return "$";
  if (attr.toLowerCase().includes("eur")) return "€";
  return "";
}

const infoTooltipText = `
<strong>Alluvial Chart Interactions:</strong><br>
• <strong>Click</strong> a node or link: Selects or deselects a category, affecting the cards highlighted in other views.<br>
• <strong>Right-Click</strong> a node or link: Applies or removes a global filter in the filter panel for that category.<br>
• <strong>Hover</strong> on nodes or links: Shows tooltip details and highlights corresponding categories across views.<br>
• <strong>Double-Click</strong> background: Clears selections made within the Alluvial chart.<br>
`;



function getNodeColor(price, minPrice, maxPrice) {
  let percentage = ((price - minPrice) / (maxPrice - minPrice)) * 100;
  return getDiscreteColor(percentage);
}

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

  const originalitySet = new Set();
  const raritySet = new Set();
  data.forEach((card) => {
    if (card.originality) originalitySet.add(card.originality.toLowerCase());
    if (card.rarity) raritySet.add(card.rarity.toLowerCase());
  });

  const originalityCategories = Array.from(originalitySet).sort();
  const rarityCategories = Array.from(raritySet).sort();

  const priceAttr = selectedPriceAttribute;
  const origPriceSums = {},
    origPriceCounts = {},
    rarityPriceSums = {},
    rarityPriceCounts = {},
    linkCounts = {},
    linkPriceSums = {},
    linkPriceCounts = {};

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

  originalityCategories.forEach((orig) => {
    rarityCategories.forEach((rarity) => {
      const key = `${orig}|${rarity}`;
      if (!linkCounts.hasOwnProperty(key)) {
        linkCounts[key] = 0;
        linkPriceSums[key] = 0;
        linkPriceCounts[key] = 0;
      }
    });
  });

  const nodes = [
    ...originalityCategories.map((o) => ({
      name: o,
      avgPrice: origPriceCounts[o] ? origPriceSums[o] / origPriceCounts[o] : 0,
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

  //20 and 30, r=10
  const iconX = svgWidth * 0.03;
  const iconY = svgHeight * 0.1;
  const iconRadius = svgWidth * 0.015;
  const infoTextSize = Math.min(svgWidth * 0.0187, 15);
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
      tooltip.style("display", "block").html(infoTooltipText);
    })
    .on("mousemove", function (event) {
      const tooltipWidth = tooltip.node().offsetWidth;
      const tooltipHeight = tooltip.node().offsetHeight;

      let x = event.pageX + 10;
      let y = event.pageY + 10;

      if (x + tooltipWidth > window.innerWidth) {
        x = window.innerWidth - tooltipWidth - 10;
      }
      if (y + tooltipHeight > window.innerHeight) {
        y = window.innerHeight - tooltipHeight - 10;
      }

      tooltip.style("left", `${x}px`).style("top", `${y}px`);
    })
    .on("mouseout", function () {
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
  const priceRange = { min: d3.min(allPrices), max: d3.max(allPrices) };

  const tooltip = d3.select("#tooltip");

  sankeyGroup
    .selectAll(".link")
    .data(sankeyData.links, (d) => `${d.source.name}|${d.target.name}`)
    .data(sankeyData.links.sort((a, b) => b.width - a.width))
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "link")
          .attr("d", d3.sankeyLinkHorizontal())
          .attr("fill", "none")
          .attr("stroke-opacity", 0.5)
          .attr("stroke-width", (d) => Math.max(1, d.width))
          .call((sel) => {
  sel.each(function (d) {
    const percentage = ((d.avgPrice - priceRange.min) / (priceRange.max - priceRange.min)) * 100;
    d.baseColor = getDiscreteColor(percentage);
    d.highlightColor = getHighlightedColor(percentage);
    d.selectedColor = getSelectedColor(percentage);
    d3.select(this).attr("stroke", d.baseColor);
  });
})
          .on("mouseover", function (event, d) {
  tooltip
    .style("display", "block")
    .html(
      `From: ${d.source.name}<br>To: ${d.target.name}<br>Cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(2)}`
    );

  // Highlight the connected nodes
  d3.selectAll("g.node rect")
    .filter((node) => 
      node.name === d.source.name || node.name === d.target.name
    )
    .each(function (node) {
      d3.select(this)
        .attr("fill", node.highlightColor)
        .classed("hover-temp", true);
    });

  // Highlight this link
  d3.select(this)
    .attr("stroke", d.highlightColor)
    .classed("hover-temp", true);

  // Emit to other views
  emitAlluvialLinkHover({
    originality: d.source.name.toLowerCase(),
    rarity: d.target.name.toLowerCase(),
  });
})

          .on("mousemove", function (event) {
            const tooltipWidth = tooltip.node().offsetWidth;
            const tooltipHeight = tooltip.node().offsetHeight;

            let x = event.pageX + 10;
            let y = event.pageY + 10;

            if (x + tooltipWidth > window.innerWidth) {
              x = window.innerWidth - tooltipWidth - 10;
            }
            if (y + tooltipHeight > window.innerHeight) {
              y = window.innerHeight - tooltipHeight - 10;
            }

            tooltip.style("left", `${x}px`).style("top", `${y}px`);
          })
          .on("mouseout", function () {
  clearAlluvialHoverOnly();
  tooltip.style("display", "none");
  emitClearAlluvialHover();
})

.on("click", function (event, d) {
  const o = d.source.name.toLowerCase();
  const r = d.target.name.toLowerCase();
  const linkKey = `${o}|${r}`;

  const isSelected =
    activeAlluvialLinks.has(linkKey) || manuallySelectedLinks.has(linkKey);

  if (isSelected) {
    manuallySelectedLinks.delete(linkKey);
    activeAlluvialLinks.delete(linkKey);

    // ✨ Check if 'o' still appears in any remaining links
    let oStillUsed = false;
    let rStillUsed = false;

    const allRemainingLinks = new Set([
      ...activeAlluvialLinks,
      ...manuallySelectedLinks,
    ]);

    for (const key of allRemainingLinks) {
      const [orig, rare] = key.split("|");
      if (orig === o) oStillUsed = true;
      if (rare === r) rStillUsed = true;
      if (oStillUsed && rStillUsed) break; // early exit
    }

    if (!oStillUsed) selectedOriginalities.delete(o);
    if (!rStillUsed) selectedRarities.delete(r);

  } else {
    manuallySelectedLinks.add(linkKey);
  }
  emitAlluvialLink([...activeAlluvialLinks, ...manuallySelectedLinks]); 
  updateAlluvialFromSelections();
})


          .on("contextmenu", function (event, d) {
            event.preventDefault(); // prevent the browser menu
            const currentState = getState();
            const updatedFilters = {};

            for (const key in currentState.selectedFilters) {
              updatedFilters[key] = new Set(currentState.selectedFilters[key]);
            }

            const orig = d.source.name;
            const rarity = d.target.name;

            if (updatedFilters["Originality"].has(orig)) {
              updatedFilters["Originality"].delete(orig);
            } else {
              updatedFilters["Originality"].add(orig);
            }

            if (updatedFilters["Rarity"].has(rarity)) {
              updatedFilters["Rarity"].delete(rarity);
            } else {
              updatedFilters["Rarity"].add(rarity);
            }

            updateState({ selectedFilters: updatedFilters });
          }),
      (update) =>
        update
          .attr("d", d3.sankeyLinkHorizontal())
          .attr("stroke-width", (d) => Math.max(1, d.width))
          .call((sel) => {
  sel.each(function (d) {
    const percentage = ((d.avgPrice - priceRange.min) / (priceRange.max - priceRange.min)) * 100;
    d.baseColor = getDiscreteColor(percentage);
    d.highlightColor = getHighlightedColor(percentage);
    d.selectedColor = getSelectedColor(percentage);
    d3.select(this).attr("stroke", d.baseColor);
  });
}),
      (exit) => exit.remove()
    );



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
          .call((sel) => {
            sel.each(function (d) {
              const color = getNodeColor(
                d.avgPrice,
                priceRange.min,
                priceRange.max
              );
              d.baseColor = color;
              d.highlightColor = getHighlightedColor(
                ((d.avgPrice - priceRange.min) /
                  (priceRange.max - priceRange.min)) *
                  100
              );
              d.selectedColor = getSelectedColor(
                ((d.avgPrice - priceRange.min) /
                  (priceRange.max - priceRange.min)) *
                  100
              );
              d3.select(this).attr("fill", color);
            });
          })
          .on("mouseover", function (event, d) {
  const rect = d3.select(this);
  rect.attr("fill", d.highlightColor).classed("hover-temp", true);

  tooltip
    .style("display", "block")
    .html(
      `Category: ${d.name}<br>Total cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(2)}`
    );

  const isOriginality = d.x0 === 0;
  const originalities = isOriginality ? new Set([d.name.toLowerCase()]) : new Set();
  const rarities = !isOriginality ? new Set([d.name.toLowerCase()]) : new Set();

  // Highlight links connected to this node
  highlightMatchingLinks(originalities, rarities);

  // Highlight other views
  highlightAllViewsForAlluvial(d);
})

          .on("mousemove", function (event) {
            const tooltipWidth = tooltip.node().offsetWidth;
            const tooltipHeight = tooltip.node().offsetHeight;

            let x = event.pageX + 10;
            let y = event.pageY + 10;

            if (x + tooltipWidth > window.innerWidth) {
              x = window.innerWidth - tooltipWidth - 10;
            }
            if (y + tooltipHeight > window.innerHeight) {
              y = window.innerHeight - tooltipHeight - 10;
            }

            tooltip.style("left", `${x}px`).style("top", `${y}px`);
          })
          .on("mouseout", function (event, d) {
            clearAlluvialHoverOnly();
            tooltip.style("display", "none");
            emitClearAlluvialHover();
          })
.on("click", function (event, d) {
  const name = d.name.toLowerCase();
  const isOriginality = d.x0 === 0; // or however you determine column
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

            if (updatedFilters[category].has(d.name)) {
              updatedFilters[category].delete(d.name);
            } else {
              updatedFilters[category].add(d.name);
            }

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
          .style("shape-rendering", "crispEdges")
          .attr("fill", "#000")
          .style("pointer-events", "auto")
          .on("mouseover", function (event, d) {
            const explanations = {
              original: `<strong>Original Card</strong><br>This is the first-ever printing of a card, typically from its debut set.`,
              reprint: `<strong>Reprint</strong><br>A card that has been printed again in a later set without functional changes.`,
              "functional reprint": `<strong>Functional Reprint</strong><br>A different card with identical rules text and function, but a different name or flavor.`,
            };

            const key = d.name.toLowerCase();
            if (explanations[key]) {
              tooltip.style("display", "block").html(explanations[key]);
            }
          })
          .on("mousemove", function (event) {
            const tooltipWidth = tooltip.node().offsetWidth;
            const tooltipHeight = tooltip.node().offsetHeight;

            let x = event.pageX + 10;
            let y = event.pageY + 10;

            if (x + tooltipWidth > window.innerWidth) {
              x = window.innerWidth - tooltipWidth - 10;
            }
            if (y + tooltipHeight > window.innerHeight) {
              y = window.innerHeight - tooltipHeight - 10;
            }

            tooltip.style("left", `${x}px`).style("top", `${y}px`);
          })
          .on("mouseout", function () {
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


  svg.on("dblclick", function (event) {
    // Check if the double-click target is NOT a node or a link
    const target = d3.select(event.target);
    const isNode = target.classed("node");
    const isLink = target.classed("link");
    if (!isNode && !isLink) {
      emitClearSelection()
    }
    updateAlluvialFromSelections(); // re-render Alluvial visuals
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
  updateAlluvialFromSelections();
}

export function highlightAlluvialElements(hoveredCards) {
  const rects = d3.selectAll("g.node rect");

  if (!hoveredCards || hoveredCards.length === 0) {
    rects.classed("selectedHovered", false).attr("fill", (d) => d.baseColor);
    return;
  }

  const hoveredRarities = new Set();
  const hoveredOriginalities = new Set();

  hoveredCards.forEach((card) => {
    if (card.rarity) hoveredRarities.add(card.rarity.toLowerCase());
    if (Array.isArray(card.all_originalities)) {
      card.all_originalities.forEach((o) =>
        hoveredOriginalities.add(o.toLowerCase())
      );
    }
  });

  rects.each(function (d) {
    const isRarity = d.x0 !== 0;
    const isOriginality = d.x0 === 0;
    const match =
      (isRarity && hoveredRarities.has(d.name)) ||
      (isOriginality && hoveredOriginalities.has(d.name));

    d3.select(this)
      .classed("selectedHovered", match)
      .attr("fill", match ? d.selectedColor : d.baseColor);
  });
}

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

  // Highlight nodes
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

  // Highlight links
  highlightMatchingLinks(hoveredOriginalities, hoveredRarities);
}

function highlightAlluvialElementsFromIcicle(rectInfo) {
  const { originalities, rarities } = rectInfo;
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

function clearAlluvialHoverOnly() {
  // Reset nodes
  d3.selectAll("g.node rect").each(function (d) {
    const rect = d3.select(this);
    rect.classed("hover-temp", false);
    const isSelectedHovered = rect.classed("selectedHovered");
    rect.attr("fill", isSelectedHovered ? d.selectedColor : d.baseColor);
  });

  // Reset links
  d3.selectAll("path.link").each(function (d) {
    const link = d3.select(this);
    link.classed("hover-temp", false);
    const isSelectedHovered = link.classed("selectedHovered");
    link.attr("stroke", isSelectedHovered ? d.selectedColor : d.baseColor);
  });
}

function highlightMatchingLinks(originalities, rarities) {
  d3.selectAll("path.link")
    .filter((d) => {
      const oMatch = originalities?.size > 0 
        ? originalities.has(d.source.name.toLowerCase()) 
        : true;
      const rMatch = rarities?.size > 0 
        ? rarities.has(d.target.name.toLowerCase()) 
        : true;

      // Require BOTH if both sets exist, otherwise allow whichever is present
      return oMatch && rMatch;
    })
    .each(function (d) {
      d3.select(this)
        .attr("stroke", d.highlightColor)
        .classed("hover-temp", true);
    });
}


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

function highlightAllViewsForAlluvial(d) {
  if (!d || !d.name) return;

  const isOriginality = d.x0 === 0;
  const category = isOriginality ? "Originality" : "Rarity";

  emitAlluvialHover(category, d.name);
}
