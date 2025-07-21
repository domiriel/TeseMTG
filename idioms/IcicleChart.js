import { updateState, getState } from "../state.js";
// @ts-ignore
import { showLoader, hideLoader, showPopup } from "./LoadingAnimation.js";
import {
  emitIcicleRectHover,
  emitClearRectHover,
  emitIcicleClick,
  emitClearNumColorsHover,
  emitNumColorsHover,
  emitIcicleNumClick,
  onLineChartClick,
  onHoverCard,
  onScatterplotCards,
  onClearScatterplotBrush,
  onClearHover,
  onSetHover,
  onSetTypeHover,
  onClearSetHover,
  onClearLineYearHover,
  onAlluvialClick,
  onAlluvialLinkClick,
  onAlluvialLinkHover,
  onClearAlluvialLinkHover,
  onLineYearHover,
  onAlluvialHover,
  onClearAlluvialHover,
  onLineChartBrush,
  onTimelineSetClick,
  onTimelineBrush,
  onClearAlluvialSelections,
  onClearTimelineSelections,
  onClearTimelineBrush,
  onClearLineChartBrush,
  onTimelineSetTypeClick,
  emitClearIcicleSelections,
} from "./Events.js";
let globalRects = null;
let clickTimer = null;

onHoverCard((card) => {
  highlightIcicleRectHoverOnly(card);
});

onClearHover(() => {
  clearIcicleHoverOnly();
});

onSetHover((setInfo) => {
  highlightIcicleRectHoverOnlyFromSet(setInfo.colorIdentities);
});

onSetTypeHover((setInfo) => {
  highlightIcicleRectHoverOnlyFromSet(setInfo.colorIdentities);
});

onClearSetHover(() => {
  clearIcicleHoverOnly();
});

onLineYearHover((yearInfo) => {
  highlightIcicleRectHoverOnlyFromYear(yearInfo.colorIdentities);
});

onAlluvialLinkHover(({ originality, rarity }) => {
  highlightIcicleRectHoverOnlyFromAlluvialLink(originality, rarity);
  // your highlight logic here
});

onClearAlluvialLinkHover(() => {
  clearIcicleHoverOnly();
});

const activeSelections = {
  fromAlluvialOriginality: new Set(),
  fromAlluvialRarity: new Set(),
  fromAlluvialLinkPairs: new Set(),
  fromIcicleIdentity: new Set(),
  fromIcicleColors: new Set(),
  fromYears: new Set(),
  colorIdentitiesFromTimelineSets: new Map(),
  colorIdentitiesFromTimelineSetsTypes: new Map(),
  colorIdentitiesFromScatterplot: new Set(),
};
onClearAlluvialSelections(() => {
  activeSelections.fromAlluvialOriginality.clear();
  activeSelections.fromAlluvialRarity.clear();
  activeSelections.fromAlluvialLinkPairs.clear();
  updateIcicleSelections();
});


onClearTimelineSelections(() => {
  activeSelections.colorIdentitiesFromTimelineSetsTypes.clear();
  activeSelections.colorIdentitiesFromTimelineSets.clear();
  updateIcicleSelections();
});

onLineChartClick(({ year }) => {
  const set = activeSelections.fromYears;
  if (set.has(year)) {
    set.delete(year);
  } else {
    set.add(year);
  }

  updateIcicleSelections();
});

onLineChartBrush((entries) => {
  const set = activeSelections.fromYears;
  entries.forEach(({ year }) => {
    if (!year) return;

    if (set.has(year)) {
      set.delete(year);
    } else {
      set.add(year);
    }
  });

  updateIcicleSelections();
});

onTimelineBrush((entries) => {
  const store = activeSelections.colorIdentitiesFromTimelineSets;

  entries.forEach(({ name, colorIdentities }) => {
    if (!name || !colorIdentities) return;

    if (store.has(name)) {
      store.delete(name); // toggle off
    } else {
      store.set(name, new Set(colorIdentities)); // toggle on
    }
  });

  updateIcicleSelections();
});

onClearTimelineBrush(() => {
  activeSelections.colorIdentitiesFromTimelineSets.clear();
  updateIcicleSelections();
});

onClearScatterplotBrush(() => {
  activeSelections.colorIdentitiesFromScatterplot.clear();
  updateIcicleSelections();
});

onClearLineChartBrush(() => {
  activeSelections.fromYears.clear();
  updateIcicleSelections();
});
onTimelineSetClick((setInfo) => {
  const { name, colorIdentities } = setInfo;
  if (!name || !colorIdentities) return;

  if (activeSelections.colorIdentitiesFromTimelineSets.has(name)) {
    // Toggle OFF
    activeSelections.colorIdentitiesFromTimelineSets.delete(name);
  } else {
    // Toggle ON: store the identities
    activeSelections.colorIdentitiesFromTimelineSets.set(
      name,
      new Set(colorIdentities)
    );
  }

  updateIcicleSelections();
});

onTimelineSetTypeClick((setInfo) => {
  const { type, colorIdentities } = setInfo;
  if (!type || !colorIdentities) return;

  if (activeSelections.colorIdentitiesFromTimelineSetsTypes.has(type)) {
    // Toggle OFF
    activeSelections.colorIdentitiesFromTimelineSetsTypes.delete(type);
  } else {
    // Toggle ON: store the identities
    activeSelections.colorIdentitiesFromTimelineSetsTypes.set(
      type,
      new Set(colorIdentities)
    );
  }

  updateIcicleSelections();
});

onAlluvialClick(({ category, value }) => {
  if (!category || !value) return;

  const key = value.toLowerCase();
  let selections;

  if (category === "Originality") {
    selections = activeSelections.fromAlluvialOriginality;
  } else if (category === "Rarity") {
    selections = activeSelections.fromAlluvialRarity;
  } else {
    return; // unsupported category
  }

  if (selections.has(key)) {
    selections.delete(key);
  } else {
    selections.add(key);
  }

  updateIcicleSelections();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  const pairKey = `${originality}|${rarity}`;
  const set = activeSelections.fromAlluvialLinkPairs;

  if (set.has(pairKey)) {
    set.delete(pairKey);
  } else {
    set.add(pairKey);
  }

  updateIcicleSelections();
});

function hasActiveIcicleSelections() {
  return (
    activeSelections.fromAlluvialOriginality.size > 0 ||
    activeSelections.fromAlluvialRarity.size > 0 ||
    activeSelections.fromAlluvialLinkPairs.size > 0 ||
    activeSelections.fromIcicleIdentity.size > 0 ||
    activeSelections.fromIcicleColors.size > 0 ||
    activeSelections.fromYears.size > 0 ||
    activeSelections.colorIdentitiesFromTimelineSets.size > 0 ||
    activeSelections.colorIdentitiesFromTimelineSetsTypes.size > 0 ||
    activeSelections.colorIdentitiesFromScatterplot.size > 0
  );
}



onScatterplotCards(({ colorIdentities }) => {
  // Replace the set completely
  activeSelections.colorIdentitiesFromScatterplot = new Set(colorIdentities);

  updateIcicleSelections(); // Apply to rects
});

function updateIcicleSelections() {
  d3.selectAll("rect.icicle-rect").each(function (d) {
    const rect = d3.select(this);
    let shouldSelect = false;

    if (d.depth === 1) {
    if (activeSelections.fromIcicleColors.has(d.data.numColors)) {
      shouldSelect = true;
    }
  }
    if (d.depth === 2) {
    for (const val of activeSelections.fromAlluvialOriginality) {
      if (d.data.originalities?.includes(val)) {
        shouldSelect = true;
        break;
      }
    }

    if (!shouldSelect) {
      for (const val of activeSelections.fromAlluvialRarity) {
        if (d.data.rarities?.includes(val)) {
          shouldSelect = true;
          break;
        }
      }
    }

    for (const pair of activeSelections.fromAlluvialLinkPairs) {
      const [orig, rare] = pair.split("|");

      if (
        d.data.originalities?.includes(orig) &&
        d.data.rarities?.includes(rare)
      ) {
        shouldSelect = true;
        break;
      }
    }

    for (const val of activeSelections.fromIcicleIdentity) {
      if (val === d.data.name) {
        shouldSelect = true;
        break;
      }
    }

    for (const val of activeSelections.fromIcicleColors) {
      if (d.data.colorIdentity?.includes(val)) {
        shouldSelect = true;
        break;
      }
    }

    for (const val of activeSelections.fromYears) {
      if (d.data.years?.includes(val)) {
        shouldSelect = true;
        break;
      }
    }

    if (!shouldSelect) {
  const identity = d.data.name;
  for (const identitySet of activeSelections.colorIdentitiesFromTimelineSets.values()) {
    if (
      identitySet.has(identity) ||
      (identity === "Colorless" && identitySet.has(""))
    ) {
      shouldSelect = true;
      break;
    }
  }
}

if (!shouldSelect) {
  const identity = d.data.name;
  for (const identitySet of activeSelections.colorIdentitiesFromTimelineSetsTypes.values()) {
    if (
      identitySet.has(identity) ||
      (identity === "Colorless" && identitySet.has(""))
    ) {
      shouldSelect = true;
      break;
    }
  }
}


if (!shouldSelect) {
  const identity = d.data.name;

  if (activeSelections.colorIdentitiesFromScatterplot.has(identity)) {
    shouldSelect = true;
  }

  // ✅ Special case: empty string means "Colorless"
  if (!shouldSelect && identity === "Colorless" && activeSelections.colorIdentitiesFromScatterplot.has("")) {
    shouldSelect = true;
  }
}

    }
    rect
      .classed("selectedHovered", shouldSelect)
      .attr("fill", shouldSelect ? d.data.selectedColor : d.data.color);
  });


  const svg = d3.select(".IcicleChart").select("svg");
if (!svg.empty()) {
  const containerRect = svg.node().getBoundingClientRect();
  const chartWidth = containerRect.width * 0.85;
  const containerHeight = containerRect.height;
  const rectDimensions = Math.min(containerHeight * 0.097, 22);
  const legendFontSize = Math.min(containerRect.width * 0.0187, 13);
  const margin = {
    top: (containerHeight - containerHeight * 0.8) / 2 + 1,
    right: 26,
    bottom: 20,
    left: containerRect.width * 0.015,
  };
  renderLegend(svg, chartWidth, margin, containerHeight, rectDimensions, legendFontSize);
}

}

onClearLineYearHover(() => {
  clearIcicleHoverOnly();
});

onAlluvialHover(({ category, value }) => {
  highlightIcicleRectHoverOnlyFromAlluvial(category, value);
});

onClearAlluvialHover(() => {
  clearIcicleHoverOnly();
});

const infoTooltipText = `
<strong>Icicle Chart Interactions:</strong><br>
• <strong>Click</strong> on a rectangle:<br>&nbsp;&nbsp;&nbsp;• Color group: selects/diselects dots with matching Nº of colors.<br>&nbsp;&nbsp;&nbsp;• Color identity: selects/diselects dots with matching identity.<br>
• <strong>Double-click</strong>: zoom into or out of that section.<br>
• <strong>Right-click</strong> on a rectangle: toggles global filter for that color group or identity.<br>
• <strong>Hover</strong>: shows tooltip and highlights other visualizations (for identities and groups).<br>
`;
const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

const colorScale = [
  { range: [0, 20], color: "#ceb397" },
  { range: [21, 40], color: "#b8997a" },
  { range: [41, 60], color: "#998066" },
  { range: [61, 80], color: "#736659" },
  { range: [81, 100], color: "#594a3a" },
];
const darkTextColors = new Set(["#736659", "#594a3a"]);
const colorScaleHighlight = [
  { range: [0, 20], color: "#fbecd0" },
  { range: [21, 40], color: "#f8dfb0" },
  { range: [41, 60], color: "#f2c46e" },
  { range: [61, 80], color: "#d89313" },
  { range: [81, 100], color: "#9b690d" },
];

const colorScaleSelected = [
  { range: [0, 20], color: "#dcdfef" },
  { range: [21, 40], color: "#b9bfda" },
  { range: [41, 60], color: "#9aa0bc" },
  { range: [61, 80], color: "#6a708a" },
  { range: [81, 100], color: "#3a4059" },
];

function getColorFromPercentage(percentage, scale = colorScale) {
  for (let i = scale.length - 1; i >= 0; i--) {
    if (percentage >= scale[i].range[0]) {
      return scale[i].color;
    }
  }
  return scale[0].color;
}

function hexToRgb(hex) {
  let bigint = parseInt(hex.slice(1), 16);
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
    if (allowedSizes.has(numColors)) {
      return true;
    }
  }

  return false;
}

function renderLegend(svg, chartWidth, margin, containerHeight, rectDimensions, legendFontSize) {
  svg.select(".legend").remove(); // remove old legend

  const legendX = chartWidth + margin.right;
  const legendY = margin.top + 5;

  const legend = svg
    .append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

  const showPatterns = hasActiveIcicleSelections();
  const reversedColorScale = colorScale.slice().reverse();
  const reversedSelectedScale = colorScaleSelected.slice().reverse();

  const extraSpacing = 0;

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectDimensions * 6, 132))
    .text("Original")
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("shape-rendering", "crispEdges")
    .style("font-weight", "bold");

  legend
    .append("text")
    .attr("x", 0)
    .attr("y", Math.min(rectDimensions * 6.75, 149))
    .text("Cards (%)")
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("shape-rendering", "crispEdges")
    .style("font-weight", "bold");

  reversedColorScale.forEach((interval, i) => {
    const defs = svg.select("defs").empty()
      ? svg.append("defs")
      : svg.select("defs");

    const legendEntry = legend
      .append("g")
      .attr("transform", `translate(0, ${i * (rectDimensions + extraSpacing)})`);

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
        .attr("fill", `url(#${patternId})`)
        .style("stroke", "#000");
  

    legendEntry
      .append("text")
      .attr("x", chartWidth * 0.054)
      .attr("y", rectDimensions * 0.25 - 1)
      .text(`${interval.range[1]}%`)
      .attr("fill", "#000")
      .style("font-size", `${legendFontSize}px`)
      .style("shape-rendering", "crispEdges");
  });

  const zeroLabel = legend
    .append("g")
    .attr("transform", `translate(0, ${reversedColorScale.length * rectDimensions})`);

  zeroLabel
    .append("text")
    .attr("x", chartWidth * 0.054)
    .attr("y", rectDimensions * 0.25 - 1)
    .text(`0%`)
    .attr("fill", "#000")
    .style("font-size", `${legendFontSize}px`)
    .style("shape-rendering", "crispEdges");
}



export function createIcicleChart(data, containerId, isUpdate = false) {
  d3.select(containerId).selectAll("*").remove();

  let groupedData = [];
  const groupMap = new Map();

  data.forEach((card) => {
    const colors = Array.isArray(card.color_identity)
      ? card.color_identity
      : [];
    let numColors = colors.length;

    if (numColors > 5) numColors = 5;

    let colorKey =
      colors
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("") || "Colorless";

    let colorGroupName =
      numColors === 0
        ? "Colorless"
        : numColors === 1
        ? "1 Color"
        : `${numColors} Colors`;

    let targetGroup = groupMap.get(colorGroupName);
    if (!targetGroup) {
      targetGroup = {
        name: colorGroupName,
        numColors,
        originalCount: 0,
        reprintCount: 0,
        functionalReprintCount: 0,
        children: [],
        originalities: new Set(),
        rarities: new Set(),
        years: new Set(),
      };
      groupMap.set(colorGroupName, targetGroup);
      groupedData.push(targetGroup);
    }

    let colorEntry = targetGroup.children.find((c) => c.name === colorKey);

    if (colorEntry) {
      colorEntry.value += 1;
      if (card.originality === "original") colorEntry.originalCount += 1;
      if (card.originality === "reprint") colorEntry.reprintCount += 1;
      if (card.originality === "functional reprint")
        colorEntry.functionalReprintCount += 1;
    } else {
      colorEntry = {
        name: colorKey,
        value: 1,
        originalCount: card.originality === "original" ? 1 : 0,
        reprintCount: card.originality === "reprint" ? 1 : 0,
        functionalReprintCount:
          card.originality === "functional reprint" ? 1 : 0,
        originalities: new Set(),
        rarities: new Set(),
        years: new Set(),
      };
      targetGroup.children.push(colorEntry);
    }
    const cardOriginality = card.originality?.toLowerCase();
    const cardRarity = card.rarity?.toLowerCase();
    const cardYear = new Date(card.release_date).getFullYear().toString();

    if (cardOriginality) {
      colorEntry.originalities.add(cardOriginality);
      targetGroup.originalities.add(cardOriginality);
    }
    if (cardRarity) {
      colorEntry.rarities.add(cardRarity);
      targetGroup.rarities.add(cardRarity);
    }
    if (cardYear) {
      colorEntry.years.add(cardYear);
      targetGroup.years.add(cardYear);
    }
  });

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
      let originalPercentage = (c.originalCount / c.value) * 100 || 0;
      c.color = getColorFromPercentage(originalPercentage);
      c.highlightColor = getColorFromPercentage(
        originalPercentage,
        colorScaleHighlight
      );
      c.selectedColor = getColorFromPercentage(
        originalPercentage,
        colorScaleSelected
      );
    });

    if (group.children.length > 0) {
      let avgRGBBase = { r: 0, g: 0, b: 0 };
      let avgRGBHighlight = { r: 0, g: 0, b: 0 };
      let avgRGBSelected = { r: 0, g: 0, b: 0 };

      group.children.forEach((c) => {
        let base = hexToRgb(c.color);
        let highlight = hexToRgb(c.highlightColor);
        let selected = hexToRgb(c.selectedColor);
        avgRGBBase.r += base.r;
        avgRGBBase.g += base.g;
        avgRGBBase.b += base.b;
        avgRGBHighlight.r += highlight.r;
        avgRGBHighlight.g += highlight.g;
        avgRGBHighlight.b += highlight.b;
        avgRGBSelected.r += selected.r;
        avgRGBSelected.g += selected.g;
        avgRGBSelected.b += selected.b;
      });

      let n = group.children.length;
      group.color = rgbToHex(
        Math.round(avgRGBBase.r / n),
        Math.round(avgRGBBase.g / n),
        Math.round(avgRGBBase.b / n)
      );
      group.highlightColor = rgbToHex(
        Math.round(avgRGBHighlight.r / n),
        Math.round(avgRGBHighlight.g / n),
        Math.round(avgRGBHighlight.b / n)
      );
      group.selectedColor = rgbToHex(
        Math.round(avgRGBSelected.r / n),
        Math.round(avgRGBSelected.g / n),
        Math.round(avgRGBSelected.b / n)
      );
    } else {
      group.color = "#efefef";
      group.highlightColor = "#f0f0f0";
      group.selectedColor = "#d0d0d0";
    }
  });

  groupedData.sort((a, b) => a.numColors - b.numColors);

  groupedData.forEach((group) => {
    group.children.sort((a, b) => {
      const aColors = a.name.split("-");
      const bColors = b.name.split("-");

      for (let i = 0; i < Math.max(aColors.length, bColors.length); i++) {
        const aVal = mtgColorOrder[aColors[i]] ?? 99;
        const bVal = mtgColorOrder[bColors[i]] ?? 99;
        if (aVal !== bVal) return aVal - bVal;
      }

      return 0;
    });
  });

  groupedData.forEach((group) => {
    group.originalities = Array.from(group.originalities);
    group.rarities = Array.from(group.rarities);
    group.years = Array.from(group.years);

    group.children.forEach((c) => {
      c.originalities = Array.from(c.originalities);
      c.rarities = Array.from(c.rarities);
      c.years = Array.from(c.years);
    });
  });

  const hierarchy = { children: groupedData };

  const container = d3.select(containerId);

  const containerRect = container.node().getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;

  const chartWidth = containerWidth * 0.85;
  const chartHeight = containerHeight * 0.8;

  const xOffset = (containerWidth - chartWidth) / 2 - 40;
  const yOffset = -(containerHeight - chartHeight) / 2 + 5;

  const margin = {
    top: (containerHeight - chartHeight) / 2 + 1,
    right: 26,
    bottom: 20,
    left: containerWidth * 0.015,
  };

  if (isUpdate) {
    d3.select(containerId).select("svg").remove();
  }

  const legendWidth = 100;

  const svg = container
    .append("svg")
    .attr("width", chartWidth + legendWidth)
    .attr("height", containerHeight)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const iconX = containerWidth * 0.03;
  const iconY = containerHeight * 0.07;
  const iconRadius = containerWidth * 0.015;

  const infoTextSize = Math.min(containerWidth * 0.0187, 15);
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
      d3.select("#tooltip").style("display", "block").html(infoTooltipText);
    })
    .on("mousemove", function (event) {
      const tooltip = d3.select("#tooltip");
      const tooltipNode = tooltip.node();
      const tooltipWidth = tooltipNode.offsetWidth;
      const tooltipHeight = tooltipNode.offsetHeight;

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
      d3.select("#tooltip").style("display", "none");
    });
  const chartGroup = svg
    .append("g")
    .attr("class", "chart-group")
    .attr("transform", `translate(${margin.left}, ${yOffset})`);

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

  const rects = zoomGroup
    .selectAll("rect")
    .data(root.descendants().slice(1), (d) => d.data.name) // use name as key
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
            if (clickTimer) return;

            clickTimer = setTimeout(() => {
              if (d.depth === 1) {
  const set = activeSelections.fromIcicleColors;
  if (set.has(d.data.numColors)) {
    set.delete(d.data.numColors);
  } else {
    set.add(d.data.numColors);
  }

  updateIcicleSelections();

  emitIcicleNumClick({
    numColors: d.data.numColors,
    originalities: d.data.originalities,
    rarities: d.data.rarities,
  });
}
else if (d.depth === 2) {
                // Identity-level click (e.g., "W", "UB", "Colorless", etc.)

                const identity = d.data.name;
                if (activeSelections.fromIcicleIdentity.has(identity)) {
                  activeSelections.fromIcicleIdentity.delete(identity);
                } else {
                  activeSelections.fromIcicleIdentity.add(identity);
                }

                // Update visuals based on new selection state
                updateIcicleSelections();
                emitIcicleClick({
                  colorIdentity: d.data.name,
                  originalities: d.data.originalities, // should be a Set<string> or array
                  rarities: d.data.rarities, // should be a Set<string> or array
                });
              }

              clickTimer = null;
            }, 170); // match your existing debounce delay
          })

          .on("dblclick", function (event, d) {
            if (clickTimer) {
              clearTimeout(clickTimer);
              clickTimer = null;
            }
            clicked(event, d, false); // double-click logic
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            clickedFilter(event, d); // double-click
          })
          .on("mouseover", function (event, d) {
            const tooltip = d3.select("#tooltip");
            tooltip.style("display", "block").html(`
                        <strong>${d.data.name.replaceAll("-", "")}</strong><br>
                        Total: ${d.value} cards<br>
                        Original: ${
                          d.data.originalCount || 0
                        } (${((d.data.originalCount / d.value) * 100).toFixed(2)}%)<br>
                        Reprint: ${d.data.reprintCount || 0} cards<br>
                        Functional Reprint: ${
                          d.data.functionalReprintCount || 0
                        } cards
                    `);
            const rect = d3.select(this);
            rect.attr("fill", d.data.highlightColor);
            rect.classed("hover-temp", true);
            highlightAllViewsForRect(d.data.name);
          })
          .on("mousemove", function (event) {
            const tooltip = d3.select("#tooltip");
            const tooltipNode = tooltip.node();

            const tooltipWidth = tooltipNode.offsetWidth;
            const tooltipHeight = tooltipNode.offsetHeight;

            let x = event.pageX + 10;
            let y = event.pageY + 10;

            if (x + tooltipWidth > window.innerWidth) {
              x = window.innerWidth - tooltipWidth - 10;
            }
            if (y + tooltipHeight > window.innerHeight) {
              y = window.innerHeight - tooltipHeight - 10;
            }

            tooltip.style("left", `${x}px`).style("top", `${Math.max(y, 0)}px`);
          })
          .on("mouseout", function () {
            const rect = d3.select(this);
            rect.classed("hover-temp", false).attr("fill", (d) => {
              if (rect.classed("selectedHovered") || rect.classed("selected"))
                return d.data.selectedColor;
              return d.data.color;
            });

            d3.select("#tooltip").style("display", "none");
            clearAllViewsHoverOnly();
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

  let hoverTimeout;

  const labels = zoomGroup
    .selectAll("text")
    .data(root.descendants().slice(1), (d) => d.data.name)
    .join(
      (enter) =>
        enter
          .append("text")
          .attr("x", (d) => (xScale(d.x0) + xScale(d.x1)) / 2)
          .attr("y", (d) => yScale(d.depth))
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .attr("fill", (d) =>
            darkTextColors.has(d.data.color.toLowerCase()) ? "#fff" : "#000"
          )

          .attr("pointer-events", "none")
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
            const baseSize = 15;
            if (rectWidth < 40) return `${14}px`;
            return `${baseSize}px`;
          })
          .style("opacity", (d) => {
            const rectWidth = xScale(d.x1) - xScale(d.x0);
            const rectHeight = levelHeight - 2;
            const textLength = d.data.name.replaceAll("-", "").length * 6;
            if (d.depth === 2) {
              return rectHeight > textLength && rectWidth > 13 ? 1 : 0;
            } else {
              return rectWidth > textLength && rectHeight > 12 ? 1 : 0;
            }
          })
          .text((d) => d.data.name.replaceAll("-", "")),

      (update) =>
        update
          .attr("x", (d) => (xScale(d.x0) + xScale(d.x1)) / 2)
          .attr("y", (d) => yScale(d.depth))
          .text((d) => d.data.name.replaceAll("-", ""))
          .attr("fill", (d) =>
            darkTextColors.has(d.data.color.toLowerCase()) ? "#fff" : "#000"
          ),

      (exit) => exit.remove()
    );

  function clicked(event, p, doubleClickFlag = false) {
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
      .attr("x", (d) => {
        if (d.depth === 1 && focus.depth === 2 && focus.parent === d) {
          return (xScale(focus.x0) + xScale(focus.x1)) / 2;
        } else {
          return (xScale(d.x0) + xScale(d.x1)) / 2;
        }
      })
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

    const currentState = getState();
    const currentFilters = currentState.selectedFilters;

    // Clone filter sets deeply to avoid mutation
    const newFilters = {};
    for (const key in currentFilters) {
      newFilters[key] = new Set(currentFilters[key]);
    }

    const isGroup = d.depth === 1;
    const isIdentity = d.depth === 2;
    const val = d.data.name.toLowerCase();

    let targetCategory = null;

    if (isGroup) {
      targetCategory = "Nº of Colors";
    } else if (isIdentity) {
      targetCategory = "Color Identity";
    }

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

    updateState({ selectedFilters: newFilters, updateContext: "IcicleFilter" });
  }


  svg.on("dblclick", function (event) {
  const target = d3.select(event.target);

  const isRect = target.classed("icicle-rect");
  const isText = target.node().tagName === "text";
  const isInfoIcon = target.classed(".info-icon");

  if (!isRect && !isText && !isInfoIcon) {
    activeSelections.fromIcicleIdentity.clear();
    activeSelections.fromIcicleColors.clear();
    emitClearIcicleSelections();
    updateIcicleSelections();
  }
});

  const legendX = chartWidth + margin.right;
  const legendY = margin.top + 5;
  const rectDimensions = Math.min(chartHeight * 0.097, 22);
  const legendFontSize = Math.min(containerWidth * 0.0187, 13);

  renderLegend(svg, chartWidth, margin, containerHeight, rectDimensions, legendFontSize);

}
export function highlightIcicleRect(hoveredCards) {
  if (!globalRects) return;

  const identityMatches = new Set();

  (hoveredCards || []).forEach((card) => {
    let identity;
    if (!card.color_identity || card.color_identity.length === 0) {
      identity = "Colorless";
    } else {
      identity = card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("");
    }
    identityMatches.add(identity);
  });

  globalRects.each(function (d) {
    const rect = d3.select(this);

    if (d.depth === 2 && identityMatches.has(d.data.name)) {
      rect.classed("selectedHovered", true).attr("fill", d.data.selectedColor);
    } else {
      rect.classed("selectedHovered", false).attr("fill", d.data.color);
    }
  });
}

export function highlightIcicleRectHoverOnly(card) {
  if (!card || !card.color_identity) return;

  const identityKey = card.color_identity.length
    ? card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("")
    : "Colorless";

  d3.select(".IcicleChart")
    .selectAll("rect.icicle-rect")
    .filter((d) => d.data?.name === identityKey && d.depth === 2)
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}

function clearIcicleHoverOnly() {
  d3.select(".IcicleChart")
    .selectAll("rect.icicle-rect")
    .filter((d) => d.depth === 2)
    .classed("hover-temp", false)
    .attr("fill", function (d) {
      const rect = d3.select(this);
      if (rect.classed("selectedHovered")) return d.data.selectedColor;
      if (rect.classed("selected")) return d.data.selectedColor;
      return d.data.color;
    });
}

export function highlightIcicleRectHoverOnlyFromSet(colorIdentities) {
  d3.selectAll("rect.icicle-rect")
    .filter((d) => d.depth === 2 && colorIdentities.has(d.data.name))
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}
export function highlightIcicleRectHoverOnlyFromYear(colorIdentities) {
  d3.selectAll("rect.icicle-rect")
    .filter((d) => d.depth === 2 && colorIdentities.has(d.data.name))
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}

function highlightAllViewsForRect(rectName) {
  if (!globalRects) return;

  const rectDatum = globalRects.data().find((d) => d.data?.name === rectName);
  if (!rectDatum) return;

  if (rectDatum.depth === 2 || rectDatum.data.name === "Colorless") {
    // Identity-level
    emitIcicleRectHover({
      name: rectDatum.data.name,
      isGroup: false,
      colorIdentities: new Set([
        rectDatum.data.name === "Colorless" ? "Colorless" : rectDatum.data.name,
      ]),
      numColors: undefined,
      originalities: new Set(rectDatum.data.originalities || []),
      rarities: new Set(rectDatum.data.rarities || []),
      years: new Set(rectDatum.data.years || []),
    });
  } else if (rectDatum.depth === 1) {
    // Group-level
    emitNumColorsHover({
      numColors: rectDatum.data.numColors,
      originalities: new Set(rectDatum.data.originalities || []),
      rarities: new Set(rectDatum.data.rarities || []),
      years: new Set(rectDatum.data.years || []),
    });
  }
}

function highlightIcicleRectHoverOnlyFromAlluvial(category, value) {
  const lowerValue = value.toLowerCase();

  d3.selectAll("rect.icicle-rect")
    .filter((d) => {
      if (!d || d.depth !== 2) return false;
      if (category === "Originality") {
        return d.data.originalities?.includes(lowerValue);
      } else if (category === "Rarity") {
        return d.data.rarities?.includes(lowerValue);
      }
      return false;
    })
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}

function highlightIcicleRectHoverOnlyFromAlluvialLink(originality, rarity) {
  const lowerOrig = originality.toLowerCase();
  const lowerRarity = rarity.toLowerCase();

  d3.selectAll("rect.icicle-rect")
    .filter((d) => {
      return (
        d &&
        d.depth === 2 &&
        d.data.originalities?.includes(lowerOrig) &&
        d.data.rarities?.includes(lowerRarity)
      );
    })
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}

function clearAllViewsHoverOnly() {
  emitClearRectHover();
  emitClearNumColorsHover();
}
