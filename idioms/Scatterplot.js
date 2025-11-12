// Scatterplot.js
//
//

//

import { updateState, getState } from "../state.js";
import {
  emitHoverCard,
  emitClearHover,
  onSetHover,
  onClearSetHover,
  onAlluvialLink,
  onRectHover,
  onClearRectHover,
  onClearLineYearHover,
  onLineYearHover,
  onNumColorsHover,
  onClearNumColorsHover,
  emitScatterplotCards,
  emitScatterplotBrush,
  emitClearScatterplotBrush,
  onAlluvialHover,
  onClearAlluvialHover,
  onAlluvialClick,
  onAlluvialLinkClick,
  onIcicleClick,
  onLineChartClick,
  onIcicleNumClick,
  onCardSearch,
  onClearAlluvialSelections,
  onClearIcicleSelections,
  onClearSelection,
  onTimelineSetClick,
  onYearClick,
  onAlluvialLinkHover,
  onClearAlluvialLinkHover,
  onLineChartBrush,
  onClearLineChartBrush,
  onSetTypeHover,
  onTimelineSetTypeClick,
  onTimelineBrush,
  onClearTimelineBrush,
  emitClearSelection,
} from "./Events.js";
import { getEffectivePriceAttribute } from "../script.js";

// Dot color groups by EDHREC rank buckets.
const colorGroups = [
  { range: [1, 5691], color: "#594A3A" },
  { range: [5692, 11382], color: "#806a4f" },
  { range: [11383, 17074], color: "#a98b66" },
  { range: [17075, 22765], color: "#d3ae7c" },
  { range: [22766, 28456], color: "#ffd394" },
];

const ZOOM_RESET_EPSILON = 0.001;



/**
 * Combine all activeTimelineSelections into final set highlights.
 *
 * Logic:
 * - OR within each chart:
 *   • Alluvial: originality ∨ rarity ∨ link pair
 *   • Icicle: color identities / color groups
 *   • Timeline: sets ∨ set types
 *   • Line: years
 * - AND across charts:
 *   • A set must satisfy all active non-empty charts simultaneously.
 * - Scatterplot manual selections (click/brush/card search):
 *   • Always applied as an additive union on top of the intersection
 *     (anything selected via Scatterplot stays highlighted even if other filters wouldn't include it).
 */

const activeSelections = {
  originalities: new Set(),          // from Alluvial node clicks
  rarities: new Set(),               // from Alluvial node clicks
  originalityRarityPairs: new Set(), // from Alluvial link clicks / derived combos
  colorIdentities: new Set(),        // from Icicle
  numColors: new Set(),              // from Icicle counts
  years: new Set(),                  // from Line Chart / Timeline Year
  sets: new Set(),                   // from Timeline Set
  setTypes: new Set(),               // from Timeline Set Type
  cards: new Map(),                  // from Scatterplot (additive union)
};

// Global clear from outside: wipe all sources and reapply.
onClearSelection(() => {
  activeSelections.originalities.clear();
  activeSelections.rarities.clear();
  activeSelections.originalityRarityPairs.clear();
  activeSelections.colorIdentities.clear();
  activeSelections.numColors.clear();
  activeSelections.years.clear();
  activeSelections.sets.clear();
  activeSelections.setTypes.clear();
  activeSelections.cards.clear();
  applySelectionToScatter();
});

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

// Alluvial "clear" only wipes its own fields.
onClearAlluvialSelections(() => {
  activeSelections.originalities.clear();
  activeSelections.rarities.clear();
  activeSelections.originalityRarityPairs.clear();
  applySelectionToScatter();
});

// Icicle "clear" only wipes its own fields.
onClearIcicleSelections(() => {
  activeSelections.colorIdentities.clear();
  activeSelections.numColors.clear();
  applySelectionToScatter();
});

// Grouping of selection keys by source chart.
//
// For each group:
// - If ALL of its keys are empty → group is ignored.
// - If ANY key has values → card must satisfy OR over that group's keys.
// Then all active groups are AND-ed together in getCardsMatchingActiveSelections.
//
const filterGroups = {
  alluvial: ["originalityRarityPairs"],
  icicle: ["colorIdentities", "numColors"],
  timeline: ["sets", "setTypes"],
  lineChart: ["years"],
};

/**
 * Compute cards matching the cross-view filters (excluding manual cards).
 *
 * Semantics:
 * - OR within a group (e.g. multiple set types, or multiple color identities).
 * - AND across groups (Alluvial ∧ Icicle ∧ Timeline ∧ LineChart).
 * - Groups with no active values are skipped.
 * - Scatterplot manual selections (activeSelections.cards) are merged later.
 */
function getCardsMatchingActiveSelections(data) {
  const groupKeys = Object.keys(filterGroups);

  return data.filter((card) => {
    return groupKeys.every((groupName) => {
      const filters = filterGroups[groupName];

      // Check if this group is active at all.
      const hasAnyActive = filters.some(
        (key) => activeSelections[key]?.size > 0
      );
      if (!hasAnyActive) return true; // no constraint from this group

      // Apply OR within the group: card must match at least one active sub-filter.
      return filters.some((key) => {
        const set = activeSelections[key];
        if (!set || set.size === 0) return false;

        switch (key) {
          // Alluvial: we use encoded originality|rarity pairs as the actual filter.
          case "originalityRarityPairs":
            return Array.from(set).some((pair) => {
              const [o, r] = pair.split("|");
              return (
                card.all_originalities?.includes(o) &&
                card.rarity?.toLowerCase() === r
              );
            });

          // Icicle: explicit color identity string.
          case "colorIdentities": {
            const idKey = card.color_identity?.join("") || "Colorless";
            return set.has(idKey);
          }

          // Icicle: number-of-colors buckets.
          case "numColors": {
            const n = card.color_identity?.length || 0;
            return set.has(n);
          }

          // Timeline: specific sets.
          case "sets":
            return card.all_sets?.some((s) => set.has(s.name));

          // Timeline: set types.
          case "setTypes":
            return card.all_set_types?.some((t) => set.has(t.toLowerCase()));

          // Line Chart / Year-based: matches any selected year.
          case "years": {
            const year = new Date(card.release_date).getFullYear();
            return set.has(year);
          }

          // We no longer use raw "originalities"/"rarities" here directly;
          // they are folded into originalityRarityPairs.
          default:
            return false;
        }
      });
    });
  });
}

/**
 * Apply current selection state to the scatterplot + shared hoveredCards.
 *
 * Rules:
 * - If NO cross-view filters are active:
 *     → show only manual scatterplot selections (cards map).
 *
 * - If ANY cross-view filters are active:
 *     → take intersection result from getCardsMatchingActiveSelections(...)
 *     → ADD (union) all manually selected cards on top.
 *
 * - Result is written into hoveredCards in global state, and
 *   .selected-hover class is updated for the dots.
 */
function applySelectionToScatter() {
  const hasAnySelection = Object.entries(activeSelections)
    .filter(([key]) => key !== "cards") // ignore manual selections here
    .some(([, set]) => set.size > 0);

  let hoveredCards;

  if (!hasAnySelection) {
    // No cross-view filters: only manual scatterplot picks remain.
    hoveredCards = Array.from(activeSelections.cards.values());
  } else {
    // Cross-view filters active:
    // 1) Compute intersection across groups.
    const matching = getCardsMatchingActiveSelections(actualFIlteredData);
    const cardMap = new Map(matching.map((c) => [c.name, c]));

    // 2) Union manual selections on top (additive).
    for (const [name, card] of activeSelections.cards) {
      cardMap.set(name, card);
    }

    hoveredCards = Array.from(cardMap.values());
  }

  updateState({
    hoveredCards,
    isHoverUpdate: true,
  });

  d3.selectAll(".dots circle").classed("selected-hover", false);
  updateSelectedHoverClass();
}

/**
 * Toggle helper for group sets.
 * - Called from cross-view event handlers.
 * - Within a single category, multiple values act as OR.
 */
function addActiveSelection(category, value) {
  const set = activeSelections[category];
  if (!set) return;

  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
}

function getSymbolFromAttribute(attr) {
  if (!attr) return "";
  if (attr.includes("eur")) return "€";
  if (attr.includes("usd")) return "$";
  return "";
}

let ignoreNextBrushEnd = false;

function getXMetricTooltipText() {
  if (xMetric === "release_date") {
    return "Cards are positioned along the X-axis by their first <b>release date</b>.";
  }
  if (lastPriceAttribute?.includes("eur"))
    return "Cards are positioned by <b>average price</b> (EUR, from Cardmarket).";
  if (lastPriceAttribute?.includes("usd"))
    return "Cards are positioned by <b>average price</b> (USD, from TCGplayer).";
  if (lastPriceAttribute?.includes("thx"))
    return "Cards are positioned by <b>average price</b> (from Scryfall).";
  return "Cards are positioned by <b>average price</b>.";
}



// Sync .selected-hover class with global hoveredCards from state.
function updateSelectedHoverClass() {
  const hoveredCards = getState().hoveredCards || [];
  const hoveredMap = new Map(hoveredCards.map((c) => [c.name, c]));
  const updatedNames = new Set(hoveredCards.map((c) => c.name));
  applySelectedHoverClass(hoveredMap, updatedNames);
}

function applySelectedHoverClass(hoveredMap, updatedNames) {
  const t0 = performance.now();
  const dots = d3
    .selectAll(".dots circle")
    .filter((d) => updatedNames.has(d.name));
  const t1 = performance.now();

  dots.classed("selected-hover", (d) => hoveredMap.has(d.name));
  const t2 = performance.now();

  // Perf logging left commented for debugging:
  // console.log(`[Perf] applySelectedHoverClass:
  //   • Select & filter dots: ${(t1 - t0).toFixed(2)} ms
  //   • Apply class toggle:   ${(t2 - t1).toFixed(2)} ms
  //   • TOTAL:                ${(t2 - t0).toFixed(2)} ms`);
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

// === Cross-view selection wiring ========================================

// Alluvial node click → toggle originalities/rarities, recompute pair space.
onAlluvialClick(({ category, value }) => {
  const key =
    category.toLowerCase() === "originality" ? "originalities" : "rarities";
  addActiveSelection(key, value);
  updateOriginalityRarityPairsFromSelections();
});

// Year click from dedicated Year component.
onYearClick(({ year }) => {
  addActiveSelection("years", year);
  applySelectionToScatter();
});

// Timeline set click.
onTimelineSetClick((setInfo) => {
  addActiveSelection("sets", setInfo.name);
  applySelectionToScatter();
});

// Timeline set-type click.
onTimelineSetTypeClick(({ type }) => {
  addActiveSelection("setTypes", type.toLowerCase());
  applySelectionToScatter();
});

// Canonical universes for Alluvial pair combinations.
const ALL_ORIGINALITIES = new Set([
  "original",
  "reprint",
  "functional reprint",
]);
const ALL_RARITIES = new Set([
  "common",
  "uncommon",
  "rare",
  "mythic",
  "special",
  "bonus",
]);

// Alluvial link click → toggle specific originality|rarity pair.
onAlluvialLinkClick(({ originality, rarity }) => {
  addPairSelection("originalityRarityPairs", originality, rarity);
  applySelectionToScatter();
});

/**
 * Rebuild originalityRarityPairs from current originality/rarity selections.
 *
 * Behaves as:
 * - OR within Alluvial (multiple pairs allowed).
 * - If only one side is set, other side expands to full universe.
 */
function updateOriginalityRarityPairsFromSelections() {
  const originalitySet = activeSelections.originalities;
  const raritySet = activeSelections.rarities;

  const pairs = new Set();

  const originalities =
    originalitySet.size > 0
      ? Array.from(originalitySet)
      : Array.from(ALL_ORIGINALITIES);
  const rarities =
    raritySet.size > 0 ? Array.from(raritySet) : Array.from(ALL_RARITIES);

  for (const o of originalities) {
    for (const r of rarities) {
      pairs.add(`${o}|${r}`);
    }
  }

  activeSelections.originalityRarityPairs = pairs;
  applySelectionToScatter();
}

// External: directly set Alluvial pairs (e.g. hover or sync).
onAlluvialLink((pairSets) => {
  activeSelections.originalityRarityPairs = new Set(pairSets);
  applySelectionToScatter();
});

// Toggle a single originality|rarity pair in a given category set.
function addPairSelection(category, originality, rarity) {
  const set = activeSelections[category];
  if (!set) return;

  const key = `${originality}|${rarity}`;
  if (set.has(key)) {
    set.delete(key);
  } else {
    set.add(key);
  }
}

// Icicle node click → toggle identity & track its numColors group.
onIcicleClick(({ colorIdentity, numColors }) => {
  addActiveSelection("colorIdentities", colorIdentity);
  activeSelections.numColors.add(numColors);
  applySelectionToScatter();
});

// Icicle num-colors group click → toggle group & all child identities.
onIcicleNumClick(({ numColors, colorIdentities }) => {
  const groupSet = activeSelections.numColors;
  const identitySet = activeSelections.colorIdentities;

  const isSelected = groupSet.has(numColors);
  if (isSelected) {
    // Remove group and its identities.
    groupSet.delete(numColors);
    colorIdentities.forEach((id) => identitySet.delete(id));
  } else {
    // Add group and all children.
    groupSet.add(numColors);
    colorIdentities.forEach((id) => identitySet.add(id));
  }

  applySelectionToScatter();
});

// Line chart click → toggle year.
onLineChartClick(({ year }) => {
  const targetYear = parseInt(year, 10);
  addActiveSelection("years", targetYear);
  applySelectionToScatter();
});

// Line chart brush → toggle multiple years.
onLineChartBrush((entries) => {
  const brushedYears = new Set(entries.map((e) => parseInt(e.year, 10)));
  brushedYears.forEach((y) => addActiveSelection("years", y));
  applySelectionToScatter();
});

// Timeline brush → toggle multiple sets.
onTimelineBrush((entries) => {
  const brushedSetNames = new Set(entries.map((e) => e.name));
  brushedSetNames.forEach((name) => addActiveSelection("sets", name));
  applySelectionToScatter();
});

// Clear only timeline-derived set/setType filters (brush clear).
onClearTimelineBrush(() => {
  activeSelections.sets.clear();
  activeSelections.setTypes.clear();
  applySelectionToScatter();
});

// Clear only year filters (line brush clear).
onClearLineChartBrush(() => {
  activeSelections.years.clear();
  applySelectionToScatter();
});

// === Cross-view hover wiring (purely visual, no persistent state) ========

onSetHover((setInfo) => {
  highlightScatterDotsFromSet(setInfo.name);
});

onSetTypeHover((setTypeInfo) => {
  highlightScatterDotsFromSetType(setTypeInfo.name);
});

onClearSetHover(() => {
  clearScatterHoverOnly();
});

onLineYearHover((yearInfo) => {
  highlightScatterDotsFromYear(yearInfo.year);
});

onClearLineYearHover(() => {
  clearScatterHoverOnly();
});

onRectHover((rectInfo) => {
  highlightScatterDotsFromIcicle(rectInfo);
});

onClearRectHover(() => {
  clearScatterHoverOnly();
});

onNumColorsHover(({ numColors }) => {
  highlightScatterDotsFromNumColors(numColors);
});

onClearNumColorsHover(() => {
  clearScatterHoverOnly();
});

onAlluvialHover(({ category, value }) => {
  highlightScatterDotsFromAlluvial(category, value);
});

onClearAlluvialHover(() => {
  clearScatterHoverOnly();
});

onAlluvialLinkHover(({ originality, rarity }) => {
  highlightScatterDotsFromAlluvialLink(originality, rarity);
});

onClearAlluvialLinkHover(() => {
  clearScatterHoverOnly();
});

// === Scatterplot-local hover helpers =====================================

export function hoverOnlyHighlightCard(card) {
  // Broadcast that a card is hovered here so other views can react.
  emitHoverCard(card);
}

export function clearHoverOnlyHighlight() {
  emitClearHover();
}

// === Tooltip / visuals helpers ===========================================

function getColorIdentityBackground(colorIdentity) {
  if (!Array.isArray(colorIdentity) || colorIdentity.length === 0)
    return "#888";

  const colorMap = {
    W: "#f6f1d5",
    U: "#b3d9ff",
    R: "#f8b3a0",
    B: "#c8b4c0",
    G: "#b6d7b3",
  };

  const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

  const sorted = [...colorIdentity].sort(
    (a, b) => mtgColorOrder[a] - mtgColorOrder[b]
  );
  const colors = sorted.map((c) => colorMap[c]).filter(Boolean);

  if (colors.length === 1) {
    return colors[0];
  } else {
    const step = 100 / (colors.length - 1);
    const stops = colors.map((color, i) => `${color} ${i * step}%`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }
}

// Get x-value based on current metric.
function getXValue(d) {
  return xMetric === "avg_price" ? d.avg_price : new Date(d.release_date);
}

/**
 * Update scales + axes when switching between price vs release_date X metric.
 * Uses the current actualFilteredData and preserves zoom keypoints.
 */
function updateXMetricScale() {
  const svg = d3.select(".Scatterplot svg");
  const meta = svg.node().__scatterMeta__;
  const { yScale, xAxisG, updateAxes, logXScale, timeXScale } =
    svg.node().__scales__ || {};

  const data = actualFIlteredData;
  if (!meta || !data || !yScale || !updateAxes) return;

  data.forEach((d) => delete d.isZoomKey);

  if (xMetric === "avg_price") {
    const newMin = Math.max(0.001, d3.min(data, (d) => d.avg_price));
    const newMax = d3.max(data, (d) => d.avg_price);
    logXScale.domain([newMin, newMax]);
    tagZoomKeyPoints(data, logXScale, yScale);
    updateAxes(getSymbolFromAttribute(lastPriceAttribute), logXScale);
    updatePointPositions(logXScale, yScale);
  } else {
    const validDates = data
      .map((d) => new Date(d.release_date))
      .filter((d) => d instanceof Date && !isNaN(d));
    const years = validDates.map((d) => d.getFullYear());
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const minDate = new Date(minYear, 0, 1);
    const maxDate = new Date(maxYear, 11, 31);
    timeXScale.domain([minDate, maxDate]);
    tagZoomKeyPoints(data, timeXScale, yScale);
    updateAxes(getSymbolFromAttribute(lastPriceAttribute), timeXScale);
    updatePointPositions(timeXScale, yScale);
  }
}

// === Zoom / state ========================================================

const ZOOM_THRESHOLD = 6;
let currentZoomLevel = 1;
let currentZoomTransform;
let wasZoomedOut = true;
let isShowingFullData = false;
let initialDownsampledData = null;
let lastZoomedOut = currentZoomLevel < ZOOM_THRESHOLD;
let actualFIlteredData = null; // canonical data backing current plot
let isBrushing = false;
let brushOverlay = null;
let zoom = null;
let brush = null;
let shiftPressed = false;
let lastPriceAttribute = null;
let xMetric = "avg_price";

// Return current zoomed X/Y scales based on stored transform.
function getZoomedScales() {
  const svg = d3.select(".Scatterplot svg").node();
  const { logXScale, timeXScale, originalYScale } = svg.__scales__;
  const baseXScale = xMetric === "avg_price" ? logXScale : timeXScale;
  const xScale = currentZoomTransform
    ? currentZoomTransform.rescaleX(baseXScale)
    : baseXScale;
  const yScale = currentZoomTransform
    ? currentZoomTransform.rescaleY(originalYScale)
    : originalYScale;
  return { xScale, yScale };
}

// Mark a minimal set of "key" dots visible when zoomed out (density reduction).
function tagZoomKeyPoints(data, xScale, yScale, cellSize = 6) {
  const grid = new Map();

  for (const d of data) {
    const cx = Math.floor(xScale(getXValue(d)) / cellSize);
    const cy = Math.floor(yScale(d.complexity) / cellSize);
    const key = `${cx},${cy}`;

    d.__x = cx * cellSize;
    d.__y = cy * cellSize;

    if (!grid.has(key)) {
      grid.set(key, true);
      d.isZoomKey = true;
    } else {
      d.isZoomKey = false;
    }
  }

  return data;
}

let globalDots = null;

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
    .style("background", getColorIdentityBackground(d.color_identity))
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

  d3.select(event.currentTarget).classed("hover-temp", true);
  hoverOnlyHighlightCard(d);
}

function mousemoveFn(event) {
  const tooltipNode = d3.select("#tooltip").node();
  const tooltipWidth = tooltipNode.offsetWidth;
  const padding = 10;

  let left = event.pageX + padding;
  if (left + tooltipWidth > window.innerWidth) {
    left = event.pageX - tooltipWidth - padding;
  }

  d3.select("#tooltip")
    .style("left", `${left}px`)
    .style("top", `${event.pageY + padding}px`);
}

function mouseoutFn(event) {
  d3
    .select("#tooltip")
    .style("display", "none")
    .style("background", null)
    .style("color", null);

  d3.select(event.currentTarget).classed("hover-temp", false);
  clearHoverOnlyHighlight();
}

/**
 * Dot click:
 * - Toggle card in activeSelections.cards.
 * - Recompute combined selection (intersection + additive manual picks).
 * - Broadcast aggregated attributes to other views.
 */
function clickFn(event, d) {
  if (activeSelections.cards.has(d.name)) {
    activeSelections.cards.delete(d.name);
  } else {
    activeSelections.cards.set(d.name, d);
  }

  applySelectionToScatter();
  getAggregatedCardAttributesFromManualSelection();
}

// Card search behaves like manual selection toggle.
onCardSearch((card) => {
  if (activeSelections.cards.has(card.name)) {
    activeSelections.cards.delete(card.name);
  } else {
    activeSelections.cards.set(card.name, card);
  }

  applySelectionToScatter();
  getAggregatedCardAttributesFromManualSelection();
});

/**
 * Update dot positions + visibility after zoom/scale changes.
 * Honors zoom threshold and "key dot" downsampling.
 */
function updatePointPositions(xScale, yScale) {
  if (!globalDots) return;

  const svg = d3.select(".Scatterplot svg");
  const meta = svg.node().__scatterMeta__;
  if (!meta) return;

  const { chartWidth, chartHeight } = meta;

  globalDots.each(function (d) {
    const cx = xScale(getXValue(d));
    const cy = yScale(d.complexity);
    const inBounds =
      cx >= 0 && cx <= chartWidth && cy >= 0 && cy <= chartHeight;
    const isHovered = this.classList.contains("hover-temp");
    const showDot =
      isHovered || currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey;

    this.setAttribute("cx", cx);
    this.setAttribute("cy", cy);
    this.style.display = inBounds && showDot ? null : "none";
  });
}

/**
 * Aggregate attributes of manually selected cards (scatter-only)
 * and emit them for other coordinated views.
 */
function getAggregatedCardAttributesFromManualSelection() {
  const originalitySet = new Set();
  const raritySet = new Set();
  const colorIdentitySet = new Set();
  const yearSet = new Set();
  const setNameSet = new Set();

  for (const card of activeSelections.cards.values()) {
    if (Array.isArray(card.all_originalities)) {
      for (const orig of card.all_originalities) {
        originalitySet.add(orig.toLowerCase());
      }
    }

    if (card.rarity) {
      raritySet.add(card.rarity.toLowerCase());
    }

    if (Array.isArray(card.color_identity)) {
      const key = card.color_identity.join("");
      colorIdentitySet.add(key);
    }

    if (card.release_date) {
      const year = new Date(card.release_date).getFullYear();
      if (!isNaN(year)) yearSet.add(year);
    }

    if (Array.isArray(card.all_sets)) {
      for (const s of card.all_sets) {
        if (s.name) setNameSet.add(s.name);
      }
    }
  }

  emitScatterplotCards({
    originalities: originalitySet,
    rarities: raritySet,
    colorIdentities: colorIdentitySet,
    years: yearSet,
    setNames: setNameSet,
  });
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

/**
 * Prepares aggregated scatter data:
 * - Groups prints per card.
 * - Computes avg_price per card.
 * - Tracks all sets, types, years, originalities and print images.
 */
export function prepareScatterData(data, selectedPriceAttribute) {
  const excludedSetTypes = new Set(["memorabilia", "alchemy", "token"]);
  const excludedSetNames = ["Arena", "Alchemy", "Digital"];
  const excludedTypes = [];

  const cardMap = new Map();

  for (const card of data) {
    // Filter out undesired/digital entries.
    if (
      card.digital ||
      excludedSetTypes.has(card.set_type) ||
      excludedSetNames.some((keyword) => card.set_name?.includes(keyword)) ||
      excludedTypes.includes(card.type)
    )
      continue;

    if (!cardMap.has(card.name)) {
      cardMap.set(card.name, {
        ...card,
        prices: [],
        setTypes: new Map(),
        printImages: [],
        printMetadata: [],
        tooltip_image: null,
        foundOriginal: false,
        all_years: new Set(),
        all_originalities: new Set(),
      });
    }

    const entry = cardMap.get(card.name);

    // Track all set types.
    entry.setTypes.set(card.set_name, card.set_type);
    if (!entry.all_set_types) entry.all_set_types = new Set();
    if (card.set_type) entry.all_set_types.add(card.set_type.toLowerCase());

    // Track price for avg computation (only if complexity is numeric).
    const price =
      isNaN(card[selectedPriceAttribute]) ||
      card[selectedPriceAttribute] == null
        ? 0
        : card[selectedPriceAttribute];
    if (!isNaN(card.complexity)) {
      entry.prices.push(price);
    }

    // Track earliest release year/date.
    if (card.release_date) {
      const releaseDate = new Date(card.release_date);
      const year = releaseDate.getFullYear();
      if (!isNaN(year)) {
        entry.all_years.add(year);

        if (
          !entry.earliest_release_date ||
          releaseDate < new Date(entry.earliest_release_date)
        ) {
          entry.earliest_release_date = releaseDate;
        }
      }
    }

    // Track originalities.
    if (card.originality) {
      entry.all_originalities.add(card.originality.toLowerCase());
    }

    // Track print images + metadata; prefer original for tooltip.
    if (card.image_normal) {
      entry.printImages.push(card.image_normal);
      entry.printMetadata.push({
        image: card.image_normal,
        set_name: card.set_name,
        set_type: card.set_type,
      });

      if (!entry.foundOriginal && card.originality === "original") {
        entry.tooltip_image = card.image_normal;
        entry.foundOriginal = true;
      }
    } else if (Array.isArray(card.faces)) {
      for (const face of card.faces) {
        if (face.image_normal) {
          entry.printImages.push(face.image_normal);
          entry.printMetadata.push({
            image: face.image_normal,
            set_name: card.set_name,
            set_type: card.set_type,
          });

          if (!entry.foundOriginal && card.originality === "original") {
            entry.tooltip_image = face.image_normal;
            entry.foundOriginal = true;
          }
        }
      }
    }
  }

  // Finalize aggregated structure.
  const result = [];
  for (const card of cardMap.values()) {
    card.all_sets = Array.from(card.setTypes.entries()).map(([name, type]) => ({
      name,
      type,
    }));
    card.all_set_types = Array.from(card.all_set_types || []);
    card.all_years = Array.from(card.all_years);
    card.all_originalities = Array.from(card.all_originalities);
    card.all_print_images = card.printImages;
    card.print_image_metadata = card.printMetadata;
    card.tooltip_image = card.tooltip_image || card.image_normal;

    const sum = card.prices.reduce((a, b) => a + b, 0);
    card.avg_price = card.prices.length > 0 ? sum / card.prices.length : 0;
    card.release_date = card.earliest_release_date || card.release_date;

    result.push(card);
  }

  return result;
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

/**
 * Initial creation of scatterplot.
 * - Builds scales, axes, zoom/brush, dots, legend, info icon.
 * - Stores scales in svg.node().__scales__ for reuse.
 */
export function createScatterPlot(
  data,
  containerId,
  isUpdate = false,
  selectedPriceAttribute = "price_usd",
  savedTransform = null
) {
  const hoveredCards = getState().hoveredCards || [];
  const hoveredSet = new Set(hoveredCards.map((c) => c.name));

  lastPriceAttribute = selectedPriceAttribute;

  d3.select(containerId).selectAll("*").remove();

  const filteredData = data;
  const minPrice = d3.min(filteredData, (d) => d.avg_price);
  const maxPrice = d3.max(filteredData, (d) => d.avg_price);

  const container = d3.select(containerId).node();
  const { width, height } = container.getBoundingClientRect();
  const margin = { top: 35, right: 14, bottom: 35, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const svg = d3
    .select(containerId)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Block native context menu (we use right-drag for pan).
  d3.select(containerId).on("contextmenu", (event) => event.preventDefault());

  const iconX = width * 0.985;
  const iconY = height * 0.07;
  const iconRadius = width * 0.93 * 0.015;
  const infoTextSize = Math.min(width * 0.0187, 15);

  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left - 8.5}, ${margin.top - 15})`);

  // X scales: log price + time.
  const logXScale = d3
    .scaleLog()
    .domain([minPrice, maxPrice])
    .range([10, chartWidth - 2]);

  const validDates = filteredData
    .map((d) => new Date(d.release_date))
    .filter((d) => d instanceof Date && !isNaN(d));
  const years = validDates.map((d) => d.getFullYear());
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const minDate = new Date(minYear, 0, 1);
  const maxDate = new Date(maxYear, 11, 31);

  const timeXScale = d3
    .scaleTime()
    .domain([minDate, maxDate])
    .range([10, chartWidth - 2]);

  // Y scale: complexity.
  const minComplexity = d3.min(filteredData, (d) => d.complexity);
  const maxComplexity = d3.max(filteredData, (d) => d.complexity);
  const yPadding = (maxComplexity - minComplexity) * 0.01;

  const originalYScale = d3
    .scaleLinear()
    .domain([minComplexity - yPadding, maxComplexity + yPadding])
    .range([chartHeight, 5]);

  const yScale = originalYScale.copy();
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  tagZoomKeyPoints(filteredData, xScale, yScale);
  actualFIlteredData = filteredData;

  const symbol = getSymbolFromAttribute(selectedPriceAttribute);

  const xAxisG = g
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${chartHeight})`);

  const yAxisG = g.append("g").attr("class", "y-axis");

  const numTicks = 12;

  // Draw axes for current metric.
  function updateAxes(symbol, customX = null) {
    const xS = customX || xScale;

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
      const xScaleToUse = customX || xScale;

      const tickDates = xScaleToUse.ticks(d3.timeYear.every(1));
      const first = tickDates[0]?.getTime();
      const last = tickDates[tickDates.length - 1]?.getTime();

      xAxisG.call(
        d3
          .axisBottom(xScaleToUse)
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

    yAxisG.call(d3.axisLeft(yScale).ticks(numTicks));
  }

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

    dropdown.addEventListener("mousemove", (event) => {
      const tooltip = d3.select("#tooltip");
      const tooltipWidth = tooltip.node().offsetWidth;
      const tooltipHeight = tooltip.node().offsetHeight;
      const padding = 10;

      let x = event.pageX + padding;
      let y = event.pageY + padding;

      if (x + tooltipWidth > window.innerWidth) {
        x = event.pageX - tooltipWidth - padding;
      }
      if (y + tooltipHeight > window.innerHeight) {
        y = event.pageY - tooltipHeight - padding;
      }

      tooltip.style("left", `${x}px`).style("top", `${y}px`);
    });

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
    .on("mousemove", (event) => {
      const tooltip = d3.select("#tooltip");
      const tooltipWidth = tooltip.node().offsetWidth;
      const padding = 10;

      let left = event.pageX + padding;
      if (left + tooltipWidth > window.innerWidth) {
        left = event.pageX - tooltipWidth - padding;
      }

      tooltip
        .style("left", `${left}px`)
        .style("top", `${event.pageY + padding}px`);
    })
    .on("mouseout", () => {
      d3.select("#tooltip").style("display", "none");
    });

  // ClipPath to constrain dots & brush.
  svg
    .append("defs")
    .append("clipPath")
    .attr("id", "chart-clip")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", chartWidth + 20)
    .attr("height", chartHeight);

  const gDot = g
    .append("g")
    .attr("class", "dots")
    .attr("clip-path", "url(#chart-clip)");

  const gClip = gDot.append("g").attr("class", "clip-group");

  brushOverlay = g
    .append("g")
    .attr("class", "brush-overlay")
    .attr("clip-path", "url(#chart-clip)");

  // Brush for additive manual card toggle.
  brush = d3
    .brush()
    .extent([
      [0, -10],
      [chartWidth + 10, chartHeight],
    ])
    .on("start", () => svg.on(".zoom", null))
    .on("end", function (event) {
      const t0 = performance.now();
      svg.call(zoom); // re-enable zoom

      if (ignoreNextBrushEnd) {
        ignoreNextBrushEnd = false;
        return;
      }

      if (!event.selection) {
        // Empty brush → clear manual picks only.
        activeSelections.cards.clear();
        emitClearScatterplotBrush();
        applySelectionToScatter();
        return;
      }

      const [[x0, y0], [x1, y1]] = event.selection;
      const { xScale: zx, yScale: zy } = getZoomedScales();
      const brushedNames = new Set();

      for (const d of filteredData) {
        const cx = zx(getXValue(d));
        const cy = zy(d.complexity);
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) {
          brushedNames.add(d.name);
        }
      }

      if (brushedNames.size === 0) {
        activeSelections.cards.clear();
        emitClearScatterplotBrush();
        applySelectionToScatter();
        ignoreNextBrushEnd = true;
        brushOverlay.call(brush.move, null);
        return;
      }

      const actualCardMap = new Map(
        actualFIlteredData.map((c) => [c.name, c])
      );

      // Toggle brushed names in manual selection map.
      for (const name of brushedNames) {
        const match = actualCardMap.get(name);
        if (activeSelections.cards.has(name)) {
          activeSelections.cards.delete(name);
        } else if (match) {
          activeSelections.cards.set(name, match);
        }
      }

      getAggregatedCardAttributesFromManualSelection();
      applySelectionToScatter();

      ignoreNextBrushEnd = true;
      brushOverlay.call(brush.move, null);

      const t5 = performance.now();
      // Perf logs omitted.
    });

  brushOverlay.call(brush).lower();

  // Info icon with interaction help.
  const infoGroup = svg
    .append("g")
    .attr("class", "info-icon")
    .attr("transform", `translate(${iconX},${iconY})`);

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
    .text("?");

  infoGroup
    .on("mouseover", () => {
      d3.select("#tooltip").style("display", "block").html(scatterTooltipText);
    })
    .on("mousemove", (event) => {
      const tooltip = d3.select("#tooltip");
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
    .on("mouseout", () => {
      d3.select("#tooltip").style("display", "none");
    });

  // Initial dots.
  const visibleData = filteredData;
  const initialRadius = getDotRadiusForZoom(currentZoomLevel);

  const dots = gClip
    .selectAll("circle")
    .data(visibleData, (d) => d.name)
    .join("circle")
    .attr("cx", (d) => xScale(getXValue(d)))
    .attr("cy", (d) => yScale(d.complexity))
    .attr("class", (d) => {
      const numColors = d.color_identity?.length || 0;
      const identityKey = d.color_identity?.length
        ? d.color_identity.slice().join("")
        : "Colorless";
      return `dots ci-${identityKey} nc-${numColors}`;
    })
    .attr("r", initialRadius)
    .style("cursor", "pointer")
    .attr("fill", (d) =>
      +d.edhrec_rank > 0 ? getGroupColor(+d.edhrec_rank) : "transparent"
    )
    .attr("stroke", (d) => (+d.edhrec_rank > 0 ? "none" : "black"))
    .attr("stroke-width", (d) => (+d.edhrec_rank > 0 ? 0 : 1.2))
    .attr("opacity", 0.8)
    .style("display", (d) =>
      currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey ? null : "none"
    );

  globalDots = dots;

  updatePointPositions(xScale, yScale);

  dots
    .on("mouseover", mouseoverFn)
    .on("mousemove", mousemoveFn)
    .on("mouseout", mouseoutFn)
    .on("click", clickFn);

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

    const svgNode = d3.select(".Scatterplot svg").node();
    const { logXScale, timeXScale, yScale, originalYScale, updateAxes } =
      svgNode.__scales__;

    const baseXScaleLocal =
      xMetric === "avg_price" ? logXScale : timeXScale;
    const newX = transform.rescaleX(baseXScaleLocal);
    const newY = transform.rescaleY(originalYScale);

    // Mutate only the working yScale, not originalYScale.
    yScale.domain(newY.domain());

    updateAxes(getSymbolFromAttribute(lastPriceAttribute), newX);

    const newRadius = getDotRadiusForZoom(currentZoomLevel);
    const gClipLocal = d3.select(".clip-group");

    gClipLocal
      .selectAll("circle")
      .attr("r", newRadius)
      .attr("cx", (d) => newX(getXValue(d)))
      .attr("cy", (d) => yScale(d.complexity))
      .style("display", (d) =>
        currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey ? null : "none"
      );

    globalDots = gClipLocal.selectAll("circle");
  }

  svg.call(zoom);

  // Restore previous transform if provided.
  if (savedTransform) {
    svg.call(zoom.transform, savedTransform);
  }

  // Double-click blank background → clear all selections.
  svg.on("dblclick", function (event) {
    const target = d3.select(event.target);
    const tag = event.target.tagName?.toLowerCase();

    const isDotGroup = target.classed("dots");
    const isCircleDot = tag === "circle" && target.classed("ci-");
    const isAxis = target.classed("x-axis") || target.classed("y-axis");
    const isLegend = target.node().closest(".edhrec-legend");
    const isInfoIcon = target.node().closest(".info-icon");

    const isInteractiveScatterElement =
      isDotGroup || isCircleDot || isAxis || isLegend || isInfoIcon;

    if (!isInteractiveScatterElement) {
      emitClearSelection();
      applySelectionToScatter();
    }
  });

  // Persist scales in DOM for other helpers.
  svg.node().__scales__ = {
    yScale,
    xAxisG,
    yAxisG,
    updateAxes,
    originalYScale,
    logXScale,
    timeXScale,
  };

  svg.node().__scatterMeta__ = {
    chartWidth,
    chartHeight,
  };

  function resetZoom() {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
  }

  d3.select("#reset-button").on("click", resetZoom);
}

let interactionsOn = true;

/**
 * Update existing scatterplot in-place when data or price attribute changes.
 * Preserves zoom & selection model.
 */
export function updateScatterPlot(
  filteredData,
  selectedPriceAttribute = "price_eur"
) {
  interactionsOn = false;

  const t0 = performance.now();
  lastPriceAttribute = selectedPriceAttribute;

  const svg = d3.select(".Scatterplot svg");
  if (svg.empty()) return;

  const {
    yScale,
    xAxisG,
    yAxisG,
    updateAxes,
    originalYScale,
    logXScale,
    timeXScale,
  } = svg.node().__scales__ || {};
  if (!yScale || !updateAxes || !originalYScale) return;

  const gClip = svg.select(".dots .clip-group");

  // Update X-domain based on new data & current metric.
  if (xMetric === "avg_price") {
    const newMin = Math.max(0.001, d3.min(filteredData, (d) => d.avg_price));
    const newMax = d3.max(filteredData, (d) => d.avg_price);
    logXScale.domain([newMin, newMax]);
  } else {
    const validDates = filteredData
      .map((d) => new Date(d.release_date))
      .filter((d) => d instanceof Date && !isNaN(d));
    const years = validDates.map((d) => d.getFullYear());
    const minDate = new Date(Math.min(...years), 0, 1);
    const maxDate = new Date(Math.max(...years), 11, 31);
    timeXScale.domain([minDate, maxDate]);
  }

  const baseXScale = xMetric === "avg_price" ? logXScale : timeXScale;
  const newX = currentZoomTransform
    ? currentZoomTransform.rescaleX(baseXScale)
    : baseXScale;
  const newY = currentZoomTransform
    ? currentZoomTransform.rescaleY(originalYScale)
    : yScale;

  const symbol = getSymbolFromAttribute(selectedPriceAttribute);
  updateAxes(symbol, newX);

  // Recompute zoom keypoints on updated data.
  filteredData.forEach((d) => delete d.isZoomKey);
  tagZoomKeyPoints(filteredData, baseXScale, yScale);
  actualFIlteredData = filteredData;

  const initialRadius = getDotRadiusForZoom(currentZoomLevel);

  // Data join for circles.
  const dots = gClip
    .selectAll("circle")
    .data(filteredData, (d) => d.name)
    .join(
      (enter) =>
        enter
          .append("circle")
          .attr("r", initialRadius)
          .style("cursor", "pointer")
          .attr("opacity", 0.8)
          .on("mouseover", mouseoverFn)
          .on("mousemove", mousemoveFn)
          .on("mouseout", mouseoutFn)
          .on("click", clickFn)
          .attr("class", (d) => {
            const numColors = d.color_identity?.length || 0;
            const identityKey =
              d.color_identity?.slice().sort().join("") || "Colorless";
            return `dots ci-${identityKey} nc-${numColors}`;
          })
          .attr("fill", (d) =>
            +d.edhrec_rank > 0 ? getGroupColor(+d.edhrec_rank) : "transparent"
          )
          .attr("stroke", (d) => (+d.edhrec_rank > 0 ? "none" : "black"))
          .attr("stroke-width", (d) => (+d.edhrec_rank > 0 ? 0 : 1.2)),
      (update) => update,
      (exit) => exit.remove()
    );

  dots
    .attr("cx", (d) => newX(getXValue(d)))
    .attr("cy", (d) => newY(d.complexity))
    .style("display", (d) =>
      currentZoomLevel >= ZOOM_THRESHOLD || d.isZoomKey ? null : "none"
    );

  globalDots = gClip.selectAll("circle");

  updatePointPositions(baseXScale, yScale);
  updateSelectedHoverClass();

  interactionsOn = true;
}

// === Hover highlighting helpers used from other views ====================

function shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight) {
  const zoomedOut = currentZoomLevel < ZOOM_THRESHOLD;
  const inBounds =
    cx >= 0 && cx <= chartWidth && cy >= 0 && cy <= chartHeight;
  return inBounds && (!zoomedOut || d.isZoomKey);
}

function isInBounds(cx, cy, chartWidth, chartHeight) {
  return cx >= 0 && cx <= chartWidth && cy >= 0 && cy <= chartHeight;
}

export function highlightScatterDotsFromSet(setName) {
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3
    .selectAll(".dots circle")
    .filter((d) => d.all_sets?.some((s) => s.name === setName))
    .classed("hover-temp", function (d) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      const shouldShow = isInBounds(cx, cy, chartWidth, chartHeight);
      if (shouldShow) this.style.display = null;
      return shouldShow;
    });
}

function highlightScatterDotsFromSetType(setType) {
  const lowerType = setType.toLowerCase();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle").each(function (d) {
    if (d.all_set_types?.includes(lowerType)) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
        d3.select(this).classed("hover-temp", true);
      }
    }
  });
}

function highlightScatterDotsFromIcicle(rectInfo) {
  if (!interactionsOn) return;

  const [targetIdentity] = [...rectInfo.colorIdentities];
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(`.dots.ci-${targetIdentity}`).each(function (d) {
    const cx = xScale(getXValue(d));
    const cy = yScale(d.complexity);
    if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
      d3.select(this).classed("hover-temp", true);
    }
  });
}

function highlightScatterDotsFromNumColors(numColors) {
  if (numColors === undefined || numColors === null) return;

  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(`.dots.nc-${numColors}`).each(function (d) {
    const cx = xScale(getXValue(d));
    const cy = yScale(d.complexity);
    if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
      d3.select(this).classed("hover-temp", true);
    }
  });
}

export function highlightScatterDotsFromYear(year) {
  const targetYear = year.getFullYear();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle").each(function (d) {
    const cardYear = new Date(d.release_date).getFullYear();
    if (cardYear === targetYear) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
        d3.select(this).classed("hover-temp", true);
      }
    }
  });
}

function highlightScatterDotsFromAlluvial(category, value) {
  const lowerVal = value.toLowerCase();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle").each(function (d) {
    let match = false;
    if (category === "Originality" && d.all_originalities?.includes(lowerVal)) {
      match = true;
    } else if (category === "Rarity" && d.rarity?.toLowerCase() === lowerVal) {
      match = true;
    }

    if (match) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
        d3.select(this).classed("hover-temp", true);
      }
    }
  });
}

function highlightScatterDotsFromAlluvialLink(originality, rarity) {
  const lowerOrig = originality.toLowerCase();
  const lowerRarity = rarity.toLowerCase();
  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const { chartWidth, chartHeight } = svg.node().__scatterMeta__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  d3.selectAll(".dots circle").each(function (d) {
    const origMatch = d.all_originalities?.includes(lowerOrig);
    const rarityMatch = d.rarity?.toLowerCase() === lowerRarity;

    if (origMatch && rarityMatch) {
      const cx = xScale(getXValue(d));
      const cy = yScale(d.complexity);
      if (shouldShowHoverTemp(d, cx, cy, chartWidth, chartHeight)) {
        d3.select(this).classed("hover-temp", true);
      }
    }
  });
}

/**
 * Clear transient hover highlights and restore visibility consistent with
 * zoom/keypoint logic.
 */
export function clearScatterHoverOnly() {
  d3.selectAll(".dots circle").classed("hover-temp", false);

  const svg = d3.select(".Scatterplot svg");
  const { logXScale, timeXScale, yScale } = svg.node().__scales__;
  const xScale = xMetric === "avg_price" ? logXScale : timeXScale;

  updatePointPositions(xScale, yScale);
}
