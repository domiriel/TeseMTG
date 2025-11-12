import { updateState, getState } from "../state.js";
import {
  // Emits
  emitLineYearHover,
  emitClearLineYearHover,
  emitLineChartClick,
  emitLineChartBrush,
  emitClearLineChartBrush,
  emitClearSelection,

  // Incoming (other views → Line Chart)
  onHoverCard,
  onClearHover,
  onSetHover,
  onSetTypeHover,
  onClearSetHover,
  onRectHover,
  onClearRectHover,
  onNumColorsHover,
  onClearNumColorsHover,
  onAlluvialHover,
  onAlluvialClick,
  onAlluvialLinkClick,
  onAlluvialLink,
  onAlluvialLinkHover,
  onClearAlluvialHover,
  onClearAlluvialLinkHover,
  onIcicleClick,
  onIcicleNumClick,
  onTimelineSetClick,
  onTimelineSetTypeClick,
  onTimelineBrush,
  onClearTimelineBrush,
  onScatterplotCards,
  onClearScatterplotBrush,
  onLineYearHover,
  onClearLineYearHover,
  onLineChartClick,
  onClearSelection,
  onClearAlluvialSelections,
  onClearIcicleSelections,
  onClearTimelineSelections,
} from "./Events.js";

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

const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

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

/**
 * activeLineSelections:
 *   Unified selection model for the Line Chart, capturing constraints coming
 *   from:
 *   - Alluvial
 *   - Icicle
 *   - Timeline (sets / types / brush)
 *   - Direct line interactions
 *   - Scatterplot
 */
const activeLineSelections = {
  fromAlluvialOriginality: new Set(),
  fromAlluvialRarity: new Set(),
  fromAlluvialLinkPairs: new Set(),
  fromIcicleIdentity: new Set(),
  fromIcicleColors: new Set(),
  fromYears: new Set(),
  yearsFromTimelineSets: new Map(),       // setName -> yearStr
  yearsFromSetTypes: new Map(),           // typeName -> Set(yearStr)
  yearsFromScatterplotCards: new Set(),   // yearStr
};

let brushing = false;
let ignoreNextBrushEnd = false;

/**
 * currentZoomTransform:
 *   Tracks the d3.zoom transform so selection highlight lines stay aligned
 *   with the zoom/pan state.
 */
let currentZoomTransform = d3.zoomIdentity;

/**
 * We expose the base x-scale on window so hover/selection helpers can
 * compute positions even outside createStackedLineChart's closure.
 * (Kept from your original design.)
 *
 * window._lineChartXScale: d3 scaleTime for the base domain.
 */

/* =========================================================================
 *  UTILITY HELPERS
 * ========================================================================= */

/**
 * Deep clone of selectedFilters (Set-based).
 */
function getClonedFilters() {
  const currentState = getState();
  const cloned = {};
  for (const key in currentState.selectedFilters) {
    cloned[key] = new Set(currentState.selectedFilters[key]);
  }
  return cloned;
}

/**
 * Draw vertical highlight lines for given timestamps (ms since epoch).
 * Respects current zoom and only draws within visible range.
 */
function drawVerticalLinesForYears(years) {
  const svg = d3.select(".LineChart svg");
  if (svg.empty()) return;

  svg.selectAll(".highlight-hover-line").remove(); // clear existing lines

  const y1 = +svg.select(".hover-line").attr("y1");
  const y2 = +svg.select(".hover-line").attr("y2");
  const marginLeft =
    +svg
      .select(".stacked-line-wrapper svg g")
      .attr("transform")
      ?.match(/translate\(([\d.]+)/)?.[1] || 0;

  const xScaleZoomed = currentZoomTransform.rescaleX(window._lineChartXScale);
  const visibleXMin = marginLeft;
  const visibleXMax = marginLeft + window._lineChartXScale.range()[1];

  years.forEach((time) => {
    const date = new Date(+time);
    const x = xScaleZoomed(date) + marginLeft;

    // ❌ Skip if not in visible X range
    if (x < visibleXMin || x > visibleXMax) return;

    svg
      .append("line")
      .attr("class", "highlight-hover-line")
      .attr("data-timestamp", time)
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", y1)
      .attr("y2", y2)
      .attr("stroke", "#f2c46e")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 2");
  });
}

/**
 * Clear hover-only visuals (circles + temporary lines).
 */
export function clearLineChartHoverOnly() {
  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", false);

  d3.select(".LineChart svg")
    .selectAll(".highlight-hover-line")
    .remove();
}

/**
 * Emit hover payload to other views for a given year entry.
 */
export function highlightAllViewsForYear(entry) {
  if (!entry) return;

  emitLineYearHover({
    year: entry.year,
    reprints: entry.reprints,
    avgComplexity: entry.avgComplexity,
    avgCMC: entry.avgCMC,
    originalities: new Set(entry.originalities),
    rarities: new Set(entry.rarities),
    colorIdentities: new Set(entry.colorIdentities),
    numColorsPresent: new Set(entry.numColorsPresent),
    source: "line-chart",
  });
}

/**
 * Clear cross-view hover (used on mouseout).
*/
function clearAllViewsHoverOnly() {
  emitClearLineYearHover();
}

/* =========================================================================
 *  SELECTION UPDATE LOGIC
 * ========================================================================= */
/**
/**
 * Core: recompute which years are selected based on activeLineSelections.
 *
 * Logic:
 * - OR within each chart:
 *   • Multiple years, originalities, rarities, identities, etc. are inclusive per chart.
 * - AND across charts:
 *   • A year is part of the main selection only if it satisfies all active non-empty charts.
 * - Scatterplot:
 *   • Always additive: years coming from Scatterplot are unioned on top of the cross-chart intersection
 *     and are never removed by other filters.
 *
 * Result is visualized as vertical dashed lines across all metric panels.
 */

function updateLineChartSelections() {
  console.log(activeLineSelections)
  const svg = d3.select(".LineChart svg");
  if (svg.empty()) return;

  svg.selectAll(".selected-hover-line").remove();

  const noSelections =
    activeLineSelections.fromAlluvialOriginality.size === 0 &&
    activeLineSelections.fromAlluvialRarity.size === 0 &&
    activeLineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeLineSelections.fromIcicleIdentity.size === 0 &&
    activeLineSelections.yearsFromTimelineSets.size === 0 &&
    activeLineSelections.yearsFromSetTypes.size === 0 &&
    activeLineSelections.fromYears.size === 0 &&
    activeLineSelections.yearsFromScatterplotCards.size === 0;
  if (noSelections) {
    return;
  }

  const matchingYears = new Set();

  const onlyScatterplotActive =
    activeLineSelections.fromAlluvialOriginality.size === 0 &&
    activeLineSelections.fromAlluvialRarity.size === 0 &&
    activeLineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeLineSelections.fromIcicleIdentity.size === 0 &&
    activeLineSelections.yearsFromTimelineSets.size === 0 &&
    activeLineSelections.yearsFromSetTypes.size === 0 &&
    activeLineSelections.fromYears.size === 0 &&
    activeLineSelections.yearsFromScatterplotCards.size > 0;

  svg.selectAll("circle.data-point").each(function () {
    const d = d3.select(this).datum();
    if (!d) return;

    const yearStr = d.year.getFullYear().toString();
    const yearTime = d.year.getTime();

    if (onlyScatterplotActive) {
      if (activeLineSelections.yearsFromScatterplotCards.has(yearStr)) {
        matchingYears.add(yearTime);
      }
      return;
    }

    // --- Group 1: Alluvial ---
    let alluvialMatch = true;
    const origMatch = [...activeLineSelections.fromAlluvialOriginality].some(
      (val) => d.originalities?.has(val)
    );
    const rarityMatch = [...activeLineSelections.fromAlluvialRarity].some(
      (val) => d.rarities?.has(val)
    );
    const linkPairMatch = [...activeLineSelections.fromAlluvialLinkPairs].some(
      (pair) => {
        const [orig, rare] = pair.split("|");
        return d.originalities?.has(orig) && d.rarities?.has(rare);
      }
    );

    if (
      activeLineSelections.fromAlluvialOriginality.size > 0 ||
      activeLineSelections.fromAlluvialRarity.size > 0 ||
      activeLineSelections.fromAlluvialLinkPairs.size > 0
    ) {
      alluvialMatch = origMatch || rarityMatch || linkPairMatch;
    }

    // --- Group 2: Icicle ---
    let icicleMatch = true;
    const identityMatch = [...activeLineSelections.fromIcicleIdentity].some(
      (val) => d.colorIdentities?.has(val)
    );

    if (
      activeLineSelections.fromIcicleIdentity.size > 0 
    ) {
      icicleMatch = identityMatch 
    }

    // --- Group 3: Timeline ---
    let timelineMatch = true;
    const matchFromSets = [
      ...activeLineSelections.yearsFromTimelineSets.values(),
    ].includes(yearStr);
    const matchFromSetTypes = [
      ...activeLineSelections.yearsFromSetTypes.values(),
    ].some((set) => set.has(yearStr));

    if (
      activeLineSelections.yearsFromTimelineSets.size > 0 ||
      activeLineSelections.yearsFromSetTypes.size > 0
    ) {
      timelineMatch = matchFromSets || matchFromSetTypes;
    }

    // --- Group 4: Explicit Year Selection ---
    let yearGroupMatch = true;
    if (activeLineSelections.fromYears.size > 0) {
      yearGroupMatch = activeLineSelections.fromYears.has(yearStr);
    }

    const isIntersected =
      alluvialMatch && icicleMatch && timelineMatch && yearGroupMatch;

    const isScatterMatch =
      activeLineSelections.yearsFromScatterplotCards.has(yearStr);

    if (isIntersected || isScatterMatch) {
      matchingYears.add(yearTime);
    }
  });

  // --- Draw matching year lines ---
  const y1 = +svg.select(".hover-line").attr("y1");
  const y2 = +svg.select(".hover-line").attr("y2");
  const marginLeft =
    +svg
      .select(".stacked-line-wrapper svg g")
      .attr("transform")
      ?.match(/translate\(([\d.]+)/)?.[1] || 0;

  matchingYears.forEach((t) => {
    const date = new Date(+t);
    const x =
      currentZoomTransform.applyX(window._lineChartXScale(date)) + marginLeft;

    svg
      .append("line")
      .attr("class", "selected-hover-line")
      .attr("data-timestamp", t)
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", y1)
      .attr("y2", y2)
      .attr("stroke", "#9AA0BC")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 2")
      .lower();
  });
}

/* =========================================================================
 *  HOVER / HIGHLIGHT HELPERS
 * ========================================================================= */

/**
 * Hover from card table → highlight its release year.
 */
function highlightLineChartHoverOnly(card) {
  if (!card?.release_date) return;

  const year = new Date(card.release_date).getFullYear().toString();

  d3.select(".LineChart")
    .selectAll(`circle.data-point[data-year='${year}']`)
    .classed("hover-temp", true);

  drawVerticalLinesForYears([new Date(+year, 0, 1).getTime()]);
}

/**
 * Hover from Icicle → highlight years contained in rectInfo.years.
 */
function highlightLineChartFromIcicle(rectInfo) {
  const { years } = rectInfo;
  if (!years || years.size === 0) return;

  const timestamps = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const d = d3.select(this).datum();
      const yearStr = d.year.getFullYear().toString();
      const match = years.has(yearStr);
      if (match) timestamps.push(d.year.getTime());
      return match;
    });

  drawVerticalLinesForYears([...new Set(timestamps)]);
}

/**
 * Hover from a single set (timeline) → its release year.
 */
function highlightLineChartHoverOnlyFromSet(setReleaseDate) {
  if (!setReleaseDate) return;

  const year = setReleaseDate.getFullYear().toString();

  d3.select(".LineChart")
    .selectAll(`circle.data-point[data-year='${year}']`)
    .classed("hover-temp", true);

  drawVerticalLinesForYears([new Date(+year, 0, 1).getTime()]);
}

/**
 * Hover from set type (multiple dates) → all corresponding years.
 */
function highlightLineChartHoverOnlyFromSetType(setTypeReleaseDates) {
  if (!setTypeReleaseDates) return;

  const years = Array.from(setTypeReleaseDates).map((d) =>
    d.getFullYear().toString()
  );

  const timestamps = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .each(function () {
      const circle = d3.select(this);
      const year = circle.attr("data-year");
      if (years.includes(year)) {
        circle.classed("hover-temp", true);
        timestamps.push(new Date(+year, 0, 1).getTime());
      }
    });

  drawVerticalLinesForYears([...new Set(timestamps)]);
}

/**
 * Hover from Alluvial node (Originality/Rarity).
 */
function highlightLineChartFromAlluvialCategory(category, value) {
  if (!category || !value) return;

  const lower = value.toLowerCase();
  const matched = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const d = d3.select(this).datum();
      let ok = false;
      if (category === "Originality") {
        ok = d?.originalities?.has(lower);
      } else if (category === "Rarity") {
        ok = d?.rarities?.has(lower);
      }
      if (ok) matched.push(d.year.getTime());
      return ok;
    });

  drawVerticalLinesForYears([...new Set(matched)]);
}

/**
 * Hover from Alluvial link pair (originality+rarity).
 */
function highlightLineChartFromAlluvialLink(originality, rarity) {
  if (!originality || !rarity) return;

  const o = originality.toLowerCase();
  const r = rarity.toLowerCase();
  const matched = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const d = d3.select(this).datum();
      const ok =
        d?.originalities?.has(o) && d?.rarities?.has(r);
      if (ok) matched.push(d.year.getTime());
      return ok;
    });

  drawVerticalLinesForYears([...new Set(matched)]);
}

/**
 * Hover from Icicle NumColors.
 */
function highlightLineChartFromNumColors(numColors) {
  if (numColors === undefined || numColors === null) return;

  const matched = [];

  d3.select(".LineChart")
    .selectAll("circle.data-point")
    .classed("hover-temp", function () {
      const d = d3.select(this).datum();
      const ok = d?.numColorsPresent?.has(numColors);
      if (ok) matched.push(d.year.getTime());
      return ok;
    });

  drawVerticalLinesForYears([...new Set(matched)]);
}

/**
 * Hover from external LineYear hover (e.g. being highlighted by other views).
 */
function highlightLineChartHoverOnlyFromExternal(payload) {
  const year = new Date(payload.year).getFullYear().toString();

  d3.select(".LineChart")
    .selectAll(`circle.data-point[data-year='${year}']`)
    .classed("hover-temp", true);

  drawVerticalLinesForYears([new Date(+year, 0, 1).getTime()]);
}

/* =========================================================================
 *  CROSS-VIEW EVENT WIRING
 * ========================================================================= */

/** Card table hover */
onHoverCard((card) => {
  highlightLineChartHoverOnly(card);
});
onClearHover(clearLineChartHoverOnly);

/** Set & SetType hovers */
onSetHover((setInfo) => {
  highlightLineChartHoverOnlyFromSet(setInfo.releaseDate);
});
onSetTypeHover((setInfo) => {
  highlightLineChartHoverOnlyFromSetType(setInfo.releaseDates);
});
onClearSetHover(clearLineChartHoverOnly);

/** Icicle hover */
onRectHover((rectInfo) => {
  highlightLineChartFromIcicle(rectInfo);
});
onClearRectHover(clearLineChartHoverOnly);

/** NumColors hover */
onNumColorsHover(({ numColors }) => {
  highlightLineChartFromNumColors(numColors);
});
onClearNumColorsHover(clearLineChartHoverOnly);

/** Alluvial hovers */
onAlluvialHover(({ category, value }) => {
  highlightLineChartFromAlluvialCategory(category, value);
});
onClearAlluvialHover(clearLineChartHoverOnly);

onAlluvialLinkHover(({ originality, rarity }) => {
  highlightLineChartFromAlluvialLink(originality, rarity);
});
onClearAlluvialLinkHover(clearLineChartHoverOnly);

/** Line-year hovers from other views */
onLineYearHover((payload) => {
  if (payload.source === "line-chart") return;
  highlightLineChartHoverOnlyFromExternal(payload);
});
onClearLineYearHover(clearLineChartHoverOnly);

/** Global selection clears */
onClearSelection(() => {
  activeLineSelections.fromAlluvialOriginality.clear();
  activeLineSelections.fromAlluvialRarity.clear();
  activeLineSelections.fromAlluvialLinkPairs.clear();
  activeLineSelections.fromIcicleIdentity.clear();
  activeLineSelections.fromIcicleColors.clear();
  activeLineSelections.fromYears.clear();
  activeLineSelections.yearsFromTimelineSets.clear();
  activeLineSelections.yearsFromSetTypes.clear();
  activeLineSelections.yearsFromScatterplotCards.clear();
  updateLineChartSelections();
});

onClearAlluvialSelections(() => {
  activeLineSelections.fromAlluvialOriginality.clear();
  activeLineSelections.fromAlluvialRarity.clear();
  activeLineSelections.fromAlluvialLinkPairs.clear();
  updateLineChartSelections();
});

onClearIcicleSelections(() => {
  activeLineSelections.fromIcicleColors.clear();
  activeLineSelections.fromIcicleIdentity.clear();
  updateLineChartSelections();
});

onClearTimelineSelections(() => {
  activeLineSelections.yearsFromTimelineSets.clear();
  activeLineSelections.yearsFromSetTypes.clear();
  updateLineChartSelections();
});

onClearScatterplotBrush(() => {
  activeLineSelections.yearsFromScatterplotCards.clear();
  updateLineChartSelections();
});

onClearTimelineBrush(() => {
  activeLineSelections.yearsFromTimelineSets.clear();
  activeLineSelections.yearsFromSetTypes.clear();
  updateLineChartSelections();
});

/** Alluvial → Line selections */
onAlluvialClick(({ category, value }) => {
  if (!category || !value) return;

  const key = value.toLowerCase();
  let set = null;

  if (category === "Originality") {
    set = activeLineSelections.fromAlluvialOriginality;
  } else if (category === "Rarity") {
    set = activeLineSelections.fromAlluvialRarity;
  }

  if (!set) return;

  set.has(key) ? set.delete(key) : set.add(key);
  updateLineChartSelections();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  const key = `${originality}|${rarity}`;
  const set = activeLineSelections.fromAlluvialLinkPairs;
  set.has(key) ? set.delete(key) : set.add(key);
  updateLineChartSelections();
});

onAlluvialLink((pairSets) => {
  activeLineSelections.fromAlluvialLinkPairs = new Set(pairSets);
  updateLineChartSelections();
});

/** Scatterplot → Line selections */
onScatterplotCards(({ years }) => {
  const yearStrings = new Set([...years].map((y) => y.toString()));
  activeLineSelections.yearsFromScatterplotCards = yearStrings;
  updateLineChartSelections();
});

/** Timeline → Line selections */
onTimelineBrush((entries) => {
  const store = activeLineSelections.yearsFromTimelineSets;

  entries.forEach(({ name, releaseDate }) => {
    if (!name || !releaseDate) return;
    const yearStr = releaseDate.getFullYear().toString();
    store.has(name) ? store.delete(name) : store.set(name, yearStr);
  });

  updateLineChartSelections();
});

onTimelineSetClick(({ name, releaseDate }) => {
  if (!name || !releaseDate) return;
  const store = activeLineSelections.yearsFromTimelineSets;
  const yearStr = releaseDate.getFullYear().toString();
  store.has(name) ? store.delete(name) : store.set(name, yearStr);
  updateLineChartSelections();
});

onTimelineSetTypeClick(({ type, releaseDates }) => {
  if (!type || !releaseDates) return;

  const yearStrings = Array.from(releaseDates).map((d) =>
    d.getFullYear().toString()
  );
  const store = activeLineSelections.yearsFromSetTypes;
  const already = store.has(type);

  if (already) {
    store.delete(type);
  } else {
    store.set(type, new Set(yearStrings));
  }

  updateLineChartSelections();
});

/** Icicle → Line selections */
onIcicleClick(({ colorIdentity, numColors }) => {
  if (!colorIdentity) return;

  const idSet = activeLineSelections.fromIcicleIdentity;
  const numSet = activeLineSelections.fromIcicleColors;

  if (idSet.has(colorIdentity)) {
    idSet.delete(colorIdentity);
    if (idSet.size === 0) numSet.clear();
  } else {
    idSet.add(colorIdentity);
    numSet.add(numColors);
  }

  updateLineChartSelections();
});

onIcicleNumClick(({ numColors, colorIdentities }) => {
  if (!numColors || !colorIdentities) return;

  const groupSet = activeLineSelections.fromIcicleColors;
  const idSet = activeLineSelections.fromIcicleIdentity;
  const isSelected = groupSet.has(numColors);

  if (isSelected) {
    groupSet.delete(numColors);
    colorIdentities.forEach((id) => idSet.delete(id));
  } else {
    groupSet.add(numColors);
    colorIdentities.forEach((id) => idSet.add(id));
  }

  updateLineChartSelections();
});

/** Line → Line (sync from external clicks) */
onLineChartClick(({ year, source }) => {
  if (source === "line-chart") return;
  const set = activeLineSelections.fromYears;
  set.has(year) ? set.delete(year) : set.add(year);
  updateLineChartSelections();
});

/* =========================================================================
 *  MAIN: CREATE STACKED LINE CHART
 * ========================================================================= */

export function createStackedLineChart(data, containerId, isUpdate = false) {
  // Reset container
  d3.select(containerId).selectAll("*").remove();
  d3.select(containerId).on("contextmenu", (event) => event.preventDefault());

  // Small data cleanup
  data = data.filter((card) => card.name !== "Gleemax");

  /* ---- 1. Aggregate into yearly metrics ---- */

  const groupedData = d3
    .rollups(
      data,
      (cards) => {
        const reprints = cards.filter(
          (c) => c.originality === "functional reprint"
        ).length;

        const avgComplexity = d3.mean(cards, (c) => +c.complexity || 0);
        const avgCMC = d3.mean(cards, (c) => +c.cmc || 0);

        const originalities = new Set();
        const rarities = new Set();
        const colorIdentities = new Set();
        const numColorsPresent = new Set();

        cards.forEach((card) => {
          if (card.originality)
            originalities.add(card.originality.toLowerCase());
          if (card.rarity) rarities.add(card.rarity.toLowerCase());

          let identity;
          let numColors;
          if (!card.color_identity || card.color_identity.length === 0) {
            identity = "Colorless";
            numColors = 0;
          } else {
            identity = card.color_identity
              .slice()
              .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
              .join("");
            numColors = identity.length;
          }
          colorIdentities.add(identity);
          numColorsPresent.add(numColors);
        });

        return {
          reprints,
          avgComplexity,
          avgCMC,
          originalities,
          rarities,
          colorIdentities,
          numColorsPresent,
        };
      },
      (d) => new Date(d.release_date).getFullYear()
    )
    .map(([year, values]) => ({
      year: new Date(year, 0, 1),
      ...values,
    }))
    .sort((a, b) => a.year - b.year);

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

  window._lineChartXScale = xScale;

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
    .on("mouseover", (event) => {
      tooltip
        .style("display", "block")
        .html(lineChartTooltipText);
    })
    .on("mousemove", (event) => {
      const node = tooltip.node();
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const pad = 10;
      let x = event.pageX + pad;
      let y = event.pageY + pad;
      if (x + w > window.innerWidth) x = window.innerWidth - w - 10;
      if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
      tooltip.style("left", `${x}px`).style("top", `${y}px`);
    })
    .on("mouseout", () => {
      tooltip.style("display", "none");
    });

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

        d3.selectAll(
          `circle.data-point[data-year='${year}']`
        )
          .classed("hover-temp", true)
          .attr("stroke", "#000")
          .attr("stroke-width", 1.5);

        highlightAllViewsForYear(d);
      })
      .on("mousemove", (event) => {
        const [mouseX, mouseY] = d3.pointer(event, document.body);
        const node = tooltip.node();
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        const pad = 10;
        let left = mouseX + pad;
        if (left + w > window.innerWidth) {
          left = mouseX - w - pad;
        }
        tooltip
          .style("left", `${left}px`)
          .style("top", `${mouseY - 20}px`);
      })
      .on("mouseout", () => {
        tooltip.style("display", "none").style("font-size", "12px");
        d3.selectAll("circle.data-point")
          .classed("hover-temp", false)
          .attr("r", 4)
          .attr("stroke", "none");
        clearAllViewsHoverOnly();
      })
      .on("click", (event, d) => {
        const yearStr = d.year.getFullYear().toString();
        const set = activeLineSelections.fromYears;

        set.has(yearStr)
          ? set.delete(yearStr)
          : set.add(yearStr);

        updateLineChartSelections();

        emitLineChartClick({
          year: yearStr,
          originalities: d.originalities,
          rarities: d.rarities,
          source: "line-chart",
        });
      })
      .on("contextmenu", (event, d) => {
        event.preventDefault();
        const yearStr = d.year.getFullYear().toString();
        const updated = getClonedFilters();

        if (!updated["Year"]) {
          updated["Year"] = new Set();
        }

        if (updated["Year"].has(yearStr)) {
          updated["Year"].delete(yearStr);
        } else {
          updated["Year"].add(yearStr);
        }

        updateState({
          selectedFilters: updated,
          updateContext: "TimelineFilter",
        });
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

      if (!event.selection) {
        activeLineSelections.fromYears.clear();
        emitClearLineChartBrush();
        updateLineChartSelections();

        ignoreNextBrushEnd = true;
        brushGroup.call(brush.move, null);
        brushGroup.selectAll("*").remove();
        brushGroup.call(brush);
        return;
      }

      const [x0, x1] = event.selection;
      const zoomedX = currentZoomTransform.rescaleX(xScale);

      const startDate = zoomedX.invert(x0);
      const endDate = zoomedX.invert(x1);

      const brushedEntries = groupedData
        .filter(
          (d) => d.year >= startDate && d.year <= endDate
        )
        .map((d) => ({
          year: d.year.getFullYear().toString(),
          originalities: new Set(d.originalities),
          rarities: new Set(d.rarities),
          colorIdentities: new Set(d.colorIdentities),
        }));

      if (brushedEntries.length === 0) {
        activeLineSelections.fromYears.clear();
        emitClearLineChartBrush();
        updateLineChartSelections();

        ignoreNextBrushEnd = true;
        brushGroup.call(brush.move, null);
        brushGroup.selectAll("*").remove();
        brushGroup.call(brush);
        return;
      }

      brushedEntries.forEach(({ year }) => {
        const set = activeLineSelections.fromYears;
        set.has(year) ? set.delete(year) : set.add(year);
      });

      updateLineChartSelections();
      emitLineChartBrush(brushedEntries);

      ignoreNextBrushEnd = true;
      brushGroup.call(brush.move, null);
      brushGroup.selectAll("*").remove();
      brushGroup.call(brush);
    }

    circleGroups.push({ group: g, yScale: y, metric });
  });

  /* ---- 5. Zoom/pan behavior ---- */

  function zoomed(event) {
    const transform = event.transform;
    currentZoomTransform = transform;

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

    // Update selection lines (if any)
    svg.selectAll(".selected-hover-line").each(function () {
      const line = d3.select(this);
      const time = +line.attr("data-timestamp");
      const x =
        transform.applyX(xScale(new Date(time))) + margin.left;
      line.attr("x1", x).attr("x2", x);
    });

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

    if (!isCircle && !isText && !isInfo) {
      emitClearSelection();
      updateLineChartSelections();
    }
  });

  /* ---- 7. Initial selection sync ---- */

  updateLineChartSelections();
}
