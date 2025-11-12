import { updateState, getState } from "../state.js";
// @ts-ignore
import { showLoader, hideLoader, showPopup } from "./LoadingAnimation.js";
import {
  // Emits
  emitIcicleRectHover,
  emitClearRectHover,
  emitIcicleClick,
  emitClearNumColorsHover,
  emitNumColorsHover,
  emitIcicleNumClick,
  emitClearIcicleSelections,
  emitClearSelection,

  // Incoming (other views → Icicle)
  onLineChartClick,
  onLineChartBrush,
  onHoverCard,
  onScatterplotCards,
  onClearScatterplotBrush,
  onClearHover,
  onClearSelection,
  onSetHover,
  onSetTypeHover,
  onClearSetHover,
  onClearLineYearHover,
  onAlluvialClick,
  onAlluvialLinkClick,
  onAlluvialLink,
  onAlluvialLinkHover,
  onClearAlluvialLinkHover,
  onLineYearHover,
  onAlluvialHover,
  onClearAlluvialHover,
  onTimelineSetClick,
  onTimelineBrush,
  onClearAlluvialSelections,
  onClearTimelineSelections,
  onClearTimelineBrush,
  onClearLineChartBrush,
  onTimelineSetTypeClick,
} from "./Events.js";

/* =========================================================================
 *  CONSTANTS
 * ========================================================================= */

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

/**
 * Centralized selection sources that influence Icicle highlighting.
 * Each key tracks constraints coming from a specific view or interaction.
 */
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

/**
 * Return true if there is any active non-empty selection affecting Icicle.
 */
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

/* =========================================================================
 *  SELECTION LOGIC
 * ========================================================================= */

/**
 * Clear all Icicle-related selections.
 */
function clearAllIcicleSelectionsState() {
  activeSelections.fromAlluvialOriginality.clear();
  activeSelections.fromAlluvialRarity.clear();
  activeSelections.fromAlluvialLinkPairs.clear();
  activeSelections.fromIcicleIdentity.clear();
  activeSelections.fromIcicleColors.clear();
  activeSelections.fromYears.clear();
  activeSelections.colorIdentitiesFromTimelineSets.clear();
  activeSelections.colorIdentitiesFromTimelineSetsTypes.clear();
  activeSelections.colorIdentitiesFromScatterplot.clear();
}

/**
 * Core: recompute which Icicle rects are selected based on activeSelections.
 *
 * Logic:
 * - OR within Icicle:
 *   • Multiple identities / numColors are inclusive.
 * - AND across charts:
 *   • Icicle matches are intersected with active Alluvial, Timeline, and Line constraints.
 * - Scatterplot:
 *   • Contributes as an additive union: rects hit by Scatterplot criteria stay selected
 *     even if they fail other chart constraints.
 */

function updateIcicleSelections() {
  const allRects = d3.selectAll("rect.icicle-rect").nodes();
  const depth2Rects = allRects.filter((r) => d3.select(r).datum().depth === 2);
  const depth1Rects = allRects.filter((r) => d3.select(r).datum().depth === 1);

  const onlyScatterplotActive =
    activeSelections.fromAlluvialOriginality.size === 0 &&
    activeSelections.fromAlluvialRarity.size === 0 &&
    activeSelections.fromAlluvialLinkPairs.size === 0 &&
    activeSelections.fromIcicleIdentity.size === 0 &&
    activeSelections.fromIcicleColors.size === 0 &&
    activeSelections.colorIdentitiesFromTimelineSets.size === 0 &&
    activeSelections.colorIdentitiesFromTimelineSetsTypes.size === 0 &&
    activeSelections.fromYears.size === 0 &&
    activeSelections.colorIdentitiesFromScatterplot.size > 0;

  // No selections at all → reset to base colors.
  if (!hasActiveIcicleSelections()) {
    d3.selectAll("rect.icicle-rect")
      .classed("selectedHovered", false)
      .attr("fill", (d) => d.data.color);
    return;
  }

  // Scatterplot-only: highlight matching identities, derive group highlighting.
  if (onlyScatterplotActive) {
    for (const rect of depth2Rects) {
      const d = d3.select(rect).datum();
      const identity = d.data.name;
      const isColorless = identity === "Colorless";
      const isSelected =
        activeSelections.colorIdentitiesFromScatterplot.has(identity) ||
        (isColorless &&
          activeSelections.colorIdentitiesFromScatterplot.has(""));

      d3.select(rect)
        .classed("selectedHovered", isSelected)
        .attr("fill", isSelected ? d.data.selectedColor : d.data.color);
    }

    for (const rect of depth1Rects) {
      const d = d3.select(rect).datum();
      const anyChildSelected = d.children?.some((child) => {
        return depth2Rects.some((r) => {
          const rd = d3.select(r).datum();
          return (
            rd.data.name === child.data.name &&
            d3.select(r).classed("selectedHovered")
          );
        });
      });

      d3.select(rect)
        .classed("selectedHovered", anyChildSelected)
        .attr("fill", anyChildSelected ? d.data.selectedColor : d.data.color);
    }

    return;
  }

  // General case: compute selected depth-2 rects based on all constraints.
  const selectedDepth2Rects = new Set();

  for (const rect of depth2Rects) {
    const d = d3.select(rect).datum();
    const identity = d.data.name;
    const numColors = d.data.numColors;
    const isColorless = identity === "Colorless";

    let match = true;

    // Alluvial-origin constraints
    const hasOrig = [...activeSelections.fromAlluvialOriginality].some((o) =>
      d.data.originalities?.includes(o)
    );
    const hasRarity = [...activeSelections.fromAlluvialRarity].some((r) =>
      d.data.rarities?.includes(r)
    );
    const hasLink = [...activeSelections.fromAlluvialLinkPairs].some((pair) => {
      const [orig, rare] = pair.split("|");
      return (
        d.data.originalities?.includes(orig) && d.data.rarities?.includes(rare)
      );
    });

    const alluvialEmpty =
      activeSelections.fromAlluvialOriginality.size === 0 &&
      activeSelections.fromAlluvialRarity.size === 0 &&
      activeSelections.fromAlluvialLinkPairs.size === 0;

    const matchAlluvial = alluvialEmpty || hasOrig || hasRarity || hasLink;

    // Icicle-origin (direct identity)
    const matchIdentity =
      activeSelections.fromIcicleIdentity.size === 0 ||
      activeSelections.fromIcicleIdentity.has(identity);

    // Timeline (sets & set types → color identities)
    let matchTimeline = true;
    if (
      activeSelections.colorIdentitiesFromTimelineSets.size > 0 ||
      activeSelections.colorIdentitiesFromTimelineSetsTypes.size > 0
    ) {
      const matchesSets = [
        ...activeSelections.colorIdentitiesFromTimelineSets.values(),
      ].some((set) => set.has(identity) || (isColorless && set.has("")));
      const matchesTypes = [
        ...activeSelections.colorIdentitiesFromTimelineSetsTypes.values(),
      ].some((set) => set.has(identity) || (isColorless && set.has("")));
      matchTimeline = matchesSets || matchesTypes;
    }

    // Year constraints (line chart)
    let matchYear = true;
    if (activeSelections.fromYears.size > 0) {
      matchYear = [...activeSelections.fromYears].some((y) =>
        d.data.years?.includes(y)
      );
    }

    // Scatterplot constraints (union overlay)
    const matchScatter =
      activeSelections.colorIdentitiesFromScatterplot.has(identity) ||
      (isColorless && activeSelections.colorIdentitiesFromScatterplot.has(""));

    if (matchAlluvial && matchIdentity && matchTimeline && matchYear) {
      selectedDepth2Rects.add(rect);
    }
    if (matchScatter) {
      selectedDepth2Rects.add(rect);
    }
  }

  // Apply to depth-2 rects
  for (const rect of depth2Rects) {
    const isSelected = selectedDepth2Rects.has(rect);
    const d = d3.select(rect).datum();
    d3.select(rect)
      .classed("selectedHovered", isSelected)
      .attr("fill", isSelected ? d.data.selectedColor : d.data.color);
  }

  // Propagate to depth-1 rects if any child is selected
  for (const rect of depth1Rects) {
    const d = d3.select(rect).datum();
    const anyChildSelected = d.children?.some((child) => {
      return selectedDepth2Rects.has(
        depth2Rects.find(
          (r) => d3.select(r).datum().data.name === child.data.name
        )
      );
    });

    d3.select(rect)
      .classed("selectedHovered", anyChildSelected)
      .attr("fill", anyChildSelected ? d.data.selectedColor : d.data.color);
  }
}

/* =========================================================================
 *  HIGHLIGHT & HOVER HELPERS
 * ========================================================================= */

/**
 * Hover from cards table → highlight matching color identity rect.
 */
function highlightIcicleRectHoverOnly(card) {
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

/**
 * Clear hover-only paints, preserve selection styles.
 */
function clearIcicleHoverOnly() {
  d3.select(".IcicleChart")
    .selectAll("rect.icicle-rect")
    .classed("hover-temp", false)
    .attr("fill", function (d) {
      const rect = d3.select(this);
      if (rect.classed("selectedHovered") || rect.classed("selected"))
        return d.data.selectedColor;
      return d.data.color;
    });
}

/**
 * Hover from Set/SetType → highlight corresponding groups & identities.
 */
function highlightIcicleRectHoverOnlyFromSet(colorIdentities, numColors) {
  d3.selectAll("rect.icicle-rect")
    .filter(
      (d) =>
        (d.depth === 2 && colorIdentities.has(d.data.name)) ||
        (d.depth === 1 && numColors.has(d.data.numColors))
    )
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}

/**
 * Hover from year (line chart) → same logic as Set/SetType hover.
 */
export function highlightIcicleRectHoverOnlyFromYear(
  colorIdentities,
  numColors
) {
  d3.selectAll("rect.icicle-rect")
    .filter(
      (d) =>
        (d.depth === 2 && colorIdentities.has(d.data.name)) ||
        (d.depth === 1 && numColors.has(d.data.numColors))
    )
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}

/**
 * When hovering an Icicle rect, propagate hover info to other views.
 */
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
    // Group-level (N colors)
    emitNumColorsHover({
      numColors: rectDatum.data.numColors,
      originalities: new Set(rectDatum.data.originalities || []),
      rarities: new Set(rectDatum.data.rarities || []),
      years: new Set(rectDatum.data.years || []),
    });
  }
}

/**
 * Hover from Alluvial node.
 */
function highlightIcicleRectHoverOnlyFromAlluvial(category, value) {
  const lowerValue = value.toLowerCase();

  d3.selectAll("rect.icicle-rect")
    .filter((d) => {
      if (!d) return false;
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

/**
 * Hover from Alluvial link pair.
 */
function highlightIcicleRectHoverOnlyFromAlluvialLink(originality, rarity) {
  const lowerOrig = originality.toLowerCase();
  const lowerRarity = rarity.toLowerCase();

  d3.selectAll("rect.icicle-rect")
    .filter(
      (d) =>
        d &&
        d.data.originalities?.includes(lowerOrig) &&
        d.data.rarities?.includes(lowerRarity)
    )
    .each(function (d) {
      const rect = d3.select(this);
      rect.attr("fill", d.data.highlightColor);
      rect.classed("hover-temp", true);
    });
}

/**
 * Clear hover-only in other views based on Icicle hover.
 */
function clearAllViewsHoverOnly() {
  emitClearRectHover();
  emitClearNumColorsHover();
}

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

  const showPatterns = hasActiveIcicleSelections();
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
 *  CROSS-VIEW EVENT WIRING
 * ========================================================================= */

// Card table hovers
onHoverCard((card) => {
  highlightIcicleRectHoverOnly(card);
});
onClearHover(clearIcicleHoverOnly);

// Set / SetType hovers
onSetHover((setInfo) => {
  highlightIcicleRectHoverOnlyFromSet(
    setInfo.colorIdentities,
    setInfo.numColorsPresent
  );
});
onSetTypeHover((setInfo) => {
  highlightIcicleRectHoverOnlyFromSet(
    setInfo.colorIdentities,
    setInfo.numColorsPresent
  );
});
onClearSetHover(clearIcicleHoverOnly);

// Year hovers
onLineYearHover((yearInfo) => {
  highlightIcicleRectHoverOnlyFromYear(
    yearInfo.colorIdentities,
    yearInfo.numColorsPresent
  );
});
onClearLineYearHover(clearIcicleHoverOnly);

// Alluvial hovers
onAlluvialHover(({ category, value }) => {
  highlightIcicleRectHoverOnlyFromAlluvial(category, value);
});
onClearAlluvialHover(clearIcicleHoverOnly);

onAlluvialLinkHover(({ originality, rarity }) => {
  highlightIcicleRectHoverOnlyFromAlluvialLink(originality, rarity);
});
onClearAlluvialLinkHover(clearIcicleHoverOnly);

// Global clear from other views
onClearSelection(() => {
  clearAllIcicleSelectionsState();
  updateIcicleSelections();
});
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

// Line chart selections
onLineChartClick(({ year }) => {
  const set = activeSelections.fromYears;
  if (!year) return;
  set.has(year) ? set.delete(year) : set.add(year);
  updateIcicleSelections();
});

onLineChartBrush((entries) => {
  const set = activeSelections.fromYears;
  entries.forEach(({ year }) => {
    if (!year) return;
    set.has(year) ? set.delete(year) : set.add(year);
  });
  updateIcicleSelections();
});

onClearLineChartBrush(() => {
  activeSelections.fromYears.clear();
  updateIcicleSelections();
});

// Timeline selections (sets / set types / brush)
onTimelineSetClick(({ name, colorIdentities }) => {
  if (!name || !colorIdentities) return;
  const store = activeSelections.colorIdentitiesFromTimelineSets;
  store.has(name)
    ? store.delete(name)
    : store.set(name, new Set(colorIdentities));
  updateIcicleSelections();
});

onTimelineSetTypeClick(({ type, colorIdentities }) => {
  if (!type || !colorIdentities) return;
  const store = activeSelections.colorIdentitiesFromTimelineSetsTypes;
  store.has(type)
    ? store.delete(type)
    : store.set(type, new Set(colorIdentities));
  updateIcicleSelections();
});

onTimelineBrush((entries) => {
  const store = activeSelections.colorIdentitiesFromTimelineSets;
  entries.forEach(({ name, colorIdentities }) => {
    if (!name || !colorIdentities) return;
    store.has(name)
      ? store.delete(name)
      : store.set(name, new Set(colorIdentities));
  });
  updateIcicleSelections();
});

onClearTimelineBrush(() => {
  activeSelections.colorIdentitiesFromTimelineSets.clear();
  activeSelections.colorIdentitiesFromTimelineSetsTypes.clear();
  updateIcicleSelections();
});

// Scatterplot selections
onScatterplotCards(({ colorIdentities }) => {
  activeSelections.colorIdentitiesFromScatterplot = new Set(colorIdentities);
  updateIcicleSelections();
});

onClearScatterplotBrush(() => {
  activeSelections.colorIdentitiesFromScatterplot.clear();
  updateIcicleSelections();
});

// Alluvial selections (nodes / links)
onAlluvialClick(({ category, value }) => {
  if (!category || !value) return;
  const key = value.toLowerCase();
  if (category === "Originality") {
    const set = activeSelections.fromAlluvialOriginality;
    set.has(key) ? set.delete(key) : set.add(key);
  } else if (category === "Rarity") {
    const set = activeSelections.fromAlluvialRarity;
    set.has(key) ? set.delete(key) : set.add(key);
  }
  updateIcicleSelections();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  const pairKey = `${originality}|${rarity}`;
  const set = activeSelections.fromAlluvialLinkPairs;
  set.has(pairKey) ? set.delete(pairKey) : set.add(pairKey);
  updateIcicleSelections();
});

onAlluvialLink((pairSets) => {
  activeSelections.fromAlluvialLinkPairs = new Set(pairSets);
  updateIcicleSelections();
});

/* =========================================================================
 *  ICICLE CHART CREATION
 * ========================================================================= */

export function createIcicleChart(data, containerId, isUpdate = false) {
  d3.select(containerId).selectAll("*").remove();

  /* ---- 1. Aggregate data into color groups & identities ---- */

  const groupedData = [];
  const groupMap = new Map();

  data.forEach((card) => {
    const colors = Array.isArray(card.color_identity)
      ? card.color_identity
      : [];
    let numColors = colors.length;
    if (numColors > 5) numColors = 5;

    const colorKey =
      colors
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("") || "Colorless";

    const colorGroupName =
      numColors === 0
        ? "Colorless"
        : numColors === 1
        ? "1 Color"
        : `${numColors} Colors`;

    let group = groupMap.get(colorGroupName);
    if (!group) {
      group = {
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
      groupMap.set(colorGroupName, group);
      groupedData.push(group);
    }

    let identityEntry = group.children.find((c) => c.name === colorKey);
    if (!identityEntry) {
      identityEntry = {
        name: colorKey,
        value: 0,
        numColors,
        originalCount: 0,
        reprintCount: 0,
        functionalReprintCount: 0,
        originalities: new Set(),
        rarities: new Set(),
        years: new Set(),
      };
      group.children.push(identityEntry);
    }

    // Update counts
    identityEntry.value += 1;
    if (card.originality === "original") identityEntry.originalCount += 1;
    if (card.originality === "reprint") identityEntry.reprintCount += 1;
    if (card.originality === "functional reprint")
      identityEntry.functionalReprintCount += 1;

    // Metadata for coordination
    const cardOriginality = card.originality?.toLowerCase();
    const cardRarity = card.rarity?.toLowerCase();
    const cardYear = new Date(card.release_date).getFullYear().toString();

    if (cardOriginality) {
      identityEntry.originalities.add(cardOriginality);
      group.originalities.add(cardOriginality);
    }
    if (cardRarity) {
      identityEntry.rarities.add(cardRarity);
      group.rarities.add(cardRarity);
    }
    if (cardYear) {
      identityEntry.years.add(cardYear);
      group.years.add(cardYear);
    }
  });

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
      d3.select("#tooltip").style("display", "block").html(infoTooltipText);
    })
    .on("mousemove", (event) => {
      const tooltip = d3.select("#tooltip");
      const node = tooltip.node();
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      let x = event.pageX + 10;
      let y = event.pageY + 10;
      if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
      if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
      tooltip.style("left", `${x}px`).style("top", `${y}px`);
    })
    .on("mouseout", () => {
      d3.select("#tooltip").style("display", "none");
    });

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

            clickTimer = setTimeout(() => {
              // Depth 1: color group
              if (d.depth === 1) {
                const identitySet = activeSelections.fromIcicleIdentity;
                const groupSet = activeSelections.fromIcicleColors;
                const children = d.children || [];
                const isColorless = d.data.name === "Colorless";
                const isFiveColors = d.data.numColors === 5;

                // Special case: Colorless/5-color group with single child → toggle that identity directly
                if ((isColorless || isFiveColors) && children.length === 1) {
                  const identity = children[0].data.name;
                  identitySet.has(identity)
                    ? identitySet.delete(identity)
                    : identitySet.add(identity);

                  updateIcicleSelections();

                  emitIcicleClick({
                    colorIdentity: identity,
                    originalities: children[0].data.originalities,
                    rarities: children[0].data.rarities,
                    numColors: children[0].data.numColors,
                  });
                } else {
                  // Normal group toggle
                  const num = d.data.numColors;
                  const already = groupSet.has(num);

                  if (already) {
                    groupSet.delete(num);
                    children.forEach((c) => identitySet.delete(c.data.name));
                  } else {
                    groupSet.add(num);
                    children.forEach((c) => identitySet.add(c.data.name));
                  }

                  updateIcicleSelections();

                  emitIcicleNumClick({
                    numColors: d.data.numColors,
                    originalities: d.data.originalities,
                    rarities: d.data.rarities,
                    colorIdentities: d.data.colorIdentities,
                    children: children.map((c) => ({
                      name: c.data.name,
                      originalities: c.data.originalities,
                      rarities: c.data.rarities,
                      years: c.data.years,
                    })),
                  });
                }
              }

              // Depth 2: specific color identity
              else if (d.depth === 2) {
                const identity = d.data.name;
                const numColors = d.data.numColors;
                const isColorlessOrFive = numColors === 0 || numColors === 5;

                if (activeSelections.fromIcicleIdentity.has(identity)) {
                  activeSelections.fromIcicleIdentity.delete(identity);
                  if (activeSelections.fromIcicleIdentity.size === 0) {
                    activeSelections.fromIcicleColors.clear();
                  }
                } else {
                  activeSelections.fromIcicleIdentity.add(identity);
                  if (!isColorlessOrFive) {
                    activeSelections.fromIcicleColors.add(numColors);
                  }
                }

                updateIcicleSelections();

                emitIcicleClick({
                  colorIdentity: identity,
                  originalities: d.data.originalities,
                  rarities: d.data.rarities,
                  numColors,
                });
              }

              clickTimer = null;
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

            const rect = d3.select(this);
            rect.attr("fill", d.data.highlightColor);
            rect.classed("hover-temp", true);

            highlightAllViewsForRect(d.data.name);
          })
          .on("mousemove", function (event) {
            const tooltip = d3.select("#tooltip");
            const node = tooltip.node();
            const w = node.offsetWidth;
            const h = node.offsetHeight;
            let x = event.pageX + 10;
            let y = event.pageY + 10;
            if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
            if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
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

    const currentState = getState();
    const currentFilters = currentState.selectedFilters;

    const newFilters = {};
    for (const key in currentFilters) {
      newFilters[key] = new Set(currentFilters[key]);
    }

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
      updateContext: "IcicleFilter",
    });
  }

  // Background double-click: clear all selections.
  svg.on("dblclick", (event) => {
    const target = d3.select(event.target);
    const isRect = target.classed("icicle-rect");
    const isText = target.node().tagName === "text";
    const isInfoIcon = target.classed("info-icon");
    if (!isRect && !isText && !isInfoIcon) {
      emitClearSelection();
      updateIcicleSelections();
    }
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

  updateIcicleSelections();
}
