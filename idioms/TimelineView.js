import { updateState, getState } from "../state.js";
import {
  // Hover emits
  emitSetHover,
  emitSetTypeHover,
  emitClearSetHover,
  emitLineYearHover,

  // Selection emits
  emitTimelineSetClick,
  emitTimelineSetTypeClick,
  emitTimelineBrush,
  emitClearTimelineBrush,
  emitClearTimelineSelections,
  emitYearClick, // (if used elsewhere)
  emitClearSelection,

  // Line chart sync
  emitLineChartClick,
  emitClearLineYearHover,

  // Incoming events (other views → Timeline)
  onHoverCard,
  onClearHover,
  onRectHover,
  onClearRectHover,
  onNumColorsHover,
  onClearNumColorsHover,
  onLineYearHover,
  onClearLineYearHover,
  onAlluvialHover,
  onClearAlluvialHover,
  onAlluvialClick,
  onAlluvialLinkClick,
  onAlluvialLink,
  onAlluvialLinkHover,
  onClearAlluvialLinkHover,
  onScatterplotCards,
  onClearScatterplotBrush,
  onLineChartClick,
  onLineChartBrush,
  onClearLineChartBrush,
  onIcicleClick,
  onIcicleNumClick,
  onClearAlluvialSelections,
  onClearIcicleSelections,
  onClearTimelineSelections,
  onClearSelection,
} from "./Events.js";

/* =========================================================================
 *  CONSTANTS & CONFIG
 * ========================================================================= */

const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

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

/* =========================================================================
 *  SHARED STATE
 * ========================================================================= */

/**
 * yearStats:
 *   Aggregated data per year for hover/selection and cross-view sync.
 *   key: "2020"
 *   val: { totalCardCount, rarities, originalities, colorIdentities, numColorsPresent, setNames }
 */
const yearStats = new Map();

/**
 * setTypeStats:
 *   Aggregated data per set type.
 *   key: setType string
 *   val: { totalCardCount, rarities, originalities, colorIdentities, numColorsPresent, setNames, releaseDates }
 */
const setTypeStats = new Map();

/**
 * uniqueSets:
 *   Flattened array of set objects used to draw the timeline.
 *   Each set: { name, releaseDate, setType, cardCount, originalities, rarities, colorIdentities, numColorsPresent, baseColor, highlightColor, selectedColor }
 */
let uniqueSets = null;

/**
 * activeTimelineSelections:
 *   Unified selection model for timeline view.
 *   - fromAlluvial*: filters coming from alluvial nodes/links
 *   - fromIcicle*: filters from icicle identity/group
 *   - fromYears: year selections (from Line or Timeline)
 *   - sets, setTypes: explicit selections on the timeline
 *   - setsFromScatterplot: from Scatterplot -> Timeline mapping
 */
const activeTimelineSelections = {
  fromAlluvialOriginality: new Set(),
  fromAlluvialRarity: new Set(),
  fromAlluvialLinkPairs: new Set(),
  fromIcicleIdentity: new Set(),
  fromIcicleColors: new Set(),
  fromYears: new Set(),
  sets: new Set(),
  setTypes: new Set(),
  setsFromScatterplot: new Set(),
};

let ignoreNextBrushEnd = false;

/* =========================================================================
 *  GENERIC HELPERS
 * ========================================================================= */

function getClonedFilters() {
  const currentState = getState();
  const cloned = {};
  for (const key in currentState.selectedFilters) {
    cloned[key] = new Set(currentState.selectedFilters[key]);
  }
  return cloned;
}

/* =========================================================================
 *  HOVER HELPERS (Timeline rects + cross-view)
 * ========================================================================= */

function highlightTimelineSetsHoverOnly(card) {
  if (!card?.all_sets) return;

  const hoveredSetNames = new Set(
    card.all_sets.map((set) => set.name.toLowerCase())
  );

  d3.selectAll(".set-rect")
    .filter((d) => hoveredSetNames.has(d.name.toLowerCase()))
    .attr("fill", (d) => d.highlightColor)
    .classed("hover-temp", true);
}

export function clearTimelineHoverOnly() {
  d3.selectAll(".set-rect").each(function (d) {
    const rect = d3.select(this);
    rect.classed("hover-temp", false);

    const isSelected = rect.classed("selectedHovered");
    rect.attr("fill", isSelected ? d.selectedColor : d.baseColor);
  });
}

function highlightTimelineSetsFromIcicle(rectInfo) {
  const [targetIdentity] = [...(rectInfo.colorIdentities || [])];
  if (targetIdentity === undefined) return;

  const actualIdentity = targetIdentity === "" ? "Colorless" : targetIdentity;

  d3.selectAll(".set-rect")
    .filter((d) => {
      const ids = d.colorIdentities || new Set();
      return ids.has(actualIdentity);
    })
    .classed("hover-temp", true)
    .attr("fill", (d) => d.highlightColor);
}

function highlightTimelineSetsFromNumColors(numColors) {
  if (numColors === undefined) return;

  d3.selectAll(".set-rect")
    .filter((d) => d.numColorsPresent?.has(numColors))
    .classed("hover-temp", true)
    .attr("fill", (d) => d.highlightColor);
}

function highlightTimelineSetsFromAlluvialCategory(category, value) {
  if (!category || !value) return;

  const lower = value.toLowerCase();

  d3.selectAll(".set-rect")
    .filter((d) => {
      if (category === "Originality") {
        return [...(d.originalities || [])].includes(lower);
      }
      if (category === "Rarity") {
        return [...(d.rarities || [])].includes(lower);
      }
      return false;
    })
    .classed("hover-temp", true)
    .attr("fill", (d) => d.highlightColor);
}

function highlightTimelineSetsFromAlluvialLink(originality, rarity) {
  if (!originality || !rarity) return;

  const o = originality.toLowerCase();
  const r = rarity.toLowerCase();

  d3.selectAll(".set-rect")
    .filter((d) => {
      const origMatch = [...(d.originalities || [])].includes(o);
      const rarityMatch = [...(d.rarities || [])].includes(r);
      return origMatch && rarityMatch;
    })
    .classed("hover-temp", true)
    .attr("fill", (d) => d.highlightColor);
}

function highlightTimelineSetsFromYearInfo(yearInfo) {
  if (!yearInfo || !yearInfo.year) return;
  const targetYear = yearInfo.year.getFullYear();

  d3.selectAll(".set-rect")
    .filter((d) => d.releaseDate.getFullYear() === targetYear)
    .classed("hover-temp", true)
    .attr("fill", (d) => d.highlightColor);
}

/* =========================================================================
 *  CROSS-VIEW HIGHLIGHT EMITS
 * ========================================================================= */

function highlightAllViewsForSet(setName) {
  const entry = uniqueSets?.find((d) => d.name === setName);
  if (!entry) return;

  emitSetHover({
    name: entry.name,
    releaseDate: entry.releaseDate,
    setType: entry.setType,
    cardCount: entry.cardCount,
    originalities: new Set(entry.originalities),
    rarities: new Set(entry.rarities),
    colorIdentities: new Set(entry.colorIdentities),
    numColorsPresent: new Set(entry.numColorsPresent),
  });
}

function highlightAllViewsForSetType(setType) {
  const info = setTypeStats.get(setType);
  if (!info) return;

  emitSetTypeHover({
    name: setType,
    releaseDates: info.releaseDates,
    originalities: new Set(info.originalities),
    rarities: new Set(info.rarities),
    colorIdentities: new Set(info.colorIdentities),
    numColorsPresent: new Set(info.numColorsPresent),
  });
}

function highlightAllViewsForYear(yearStr) {
  const yearInfo = yearStats.get(yearStr);
  if (!yearInfo) return;

  const dateObj = new Date(+yearStr, 0, 1);

  emitLineYearHover({
    year: dateObj,
    originalities: yearInfo.originalities,
    rarities: yearInfo.rarities,
    colorIdentities: yearInfo.colorIdentities,
    numColorsPresent: yearInfo.numColorsPresent,
    source: "timeline",
  });
}

function clearAllViewsHoverOnly() {
  emitClearSetHover();
}

/* =========================================================================
 *  SELECTION LOGIC
 * ========================================================================= */

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
 * - Scatterplot:
 *   • Always applied as an additive union on top of the intersection
 *     (anything selected via Scatterplot stays highlighted even if other filters wouldn't include it).
 */

function updateTimelineSelections() {
  const allRects = d3.selectAll(".set-rect").nodes();

  const noSelections =
    activeTimelineSelections.fromAlluvialOriginality.size === 0 &&
    activeTimelineSelections.fromAlluvialRarity.size === 0 &&
    activeTimelineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeTimelineSelections.fromIcicleIdentity.size === 0 &&
    activeTimelineSelections.fromYears.size === 0 &&
    activeTimelineSelections.sets.size === 0 &&
    activeTimelineSelections.setTypes.size === 0 &&
    activeTimelineSelections.setsFromScatterplot.size === 0;

  if (noSelections) {
    d3.selectAll(".set-rect")
      .classed("selectedHovered", false)
      .attr("fill", (d) => d.baseColor);
    d3.selectAll(".year-tick-timeline").classed("selected", false);
    d3.selectAll(".set-type-label").classed("selected", false);
    return;
  }

  const onlyScatterplotActive =
    activeTimelineSelections.fromAlluvialOriginality.size === 0 &&
    activeTimelineSelections.fromAlluvialRarity.size === 0 &&
    activeTimelineSelections.fromAlluvialLinkPairs.size === 0 &&
    activeTimelineSelections.fromIcicleIdentity.size === 0 &&
    activeTimelineSelections.fromYears.size === 0 &&
    activeTimelineSelections.sets.size === 0 &&
    activeTimelineSelections.setTypes.size === 0 &&
    activeTimelineSelections.setsFromScatterplot.size > 0;

  // Only scatterplot-driven sets: just color those
  if (onlyScatterplotActive) {
    for (const rect of allRects) {
      const d = d3.select(rect).datum();
      const isSel = activeTimelineSelections.setsFromScatterplot.has(d.name);
      d3.select(rect)
        .classed("selectedHovered", isSel)
        .attr("fill", isSel ? d.selectedColor : d.baseColor);
    }
    return;
  }

  const alluvialMatches = new Set();
  const icicleMatches = new Set();
  const yearMatches = new Set();
  const timelineMatches = new Set();
  const scatterMatches = new Set();

  for (const rect of allRects) {
    const d = d3.select(rect).datum();

    // --- ALLUVIAL GROUP ---
    const hasOrig = [...activeTimelineSelections.fromAlluvialOriginality].some(
      (o) => [...(d.originalities || [])].includes(o)
    );
    const hasRare = [...activeTimelineSelections.fromAlluvialRarity].some(
      (r) => [...(d.rarities || [])].includes(r)
    );
    const hasLink = [...activeTimelineSelections.fromAlluvialLinkPairs].some(
      (pair) => {
        const [o, r] = pair.split("|");
        return (
          [...(d.originalities || [])].includes(o) &&
          [...(d.rarities || [])].includes(r)
        );
      }
    );

    const alluvialMatch =
      hasOrig ||
      hasRare ||
      hasLink ||
      (activeTimelineSelections.fromAlluvialOriginality.size === 0 &&
        activeTimelineSelections.fromAlluvialRarity.size === 0 &&
        activeTimelineSelections.fromAlluvialLinkPairs.size === 0);

    if (alluvialMatch) alluvialMatches.add(rect);

    // --- ICICLE GROUP ---
    const identityMatch =
      activeTimelineSelections.fromIcicleIdentity.size === 0 ||
      [...activeTimelineSelections.fromIcicleIdentity].some((id) =>
        d.colorIdentities?.has(id)
      );
    if (identityMatch) icicleMatches.add(rect);

    // --- YEAR GROUP ---
    const yearStr = d.releaseDate.getFullYear().toString();
    const inYears =
      activeTimelineSelections.fromYears.size === 0 ||
      activeTimelineSelections.fromYears.has(yearStr);
    if (inYears) yearMatches.add(rect);

    // --- TIMELINE GROUP (sets / setTypes) ---
    const timelineMatch =
      (activeTimelineSelections.sets.size === 0 &&
        activeTimelineSelections.setTypes.size === 0) ||
      activeTimelineSelections.sets.has(d.name) ||
      activeTimelineSelections.setTypes.has(d.setType);
    if (timelineMatch) timelineMatches.add(rect);

    // --- SCATTERPLOT GROUP ---
    if (activeTimelineSelections.setsFromScatterplot.has(d.name)) {
      scatterMatches.add(rect);
    }
  }

  // Intersection of logical groups:
  const intersected = new Set(
    [...allRects].filter(
      (rect) =>
        alluvialMatches.has(rect) &&
        icicleMatches.has(rect) &&
        yearMatches.has(rect) &&
        timelineMatches.has(rect)
    )
  );

  // Union with scatterplot:
  const finalSelected = new Set([...intersected, ...scatterMatches]);

  // Apply fills
  for (const rect of allRects) {
    const d = d3.select(rect).datum();
    const isSel = finalSelected.has(rect);
    d3.select(rect)
      .classed("selectedHovered", isSel)
      .attr("fill", isSel ? d.selectedColor : d.baseColor);
  }

  // Year tick styling
  d3.selectAll(".year-tick-timeline").classed("selected", (d) =>
    activeTimelineSelections.fromYears.has(d.getFullYear().toString())
  );

  // Set type label styling
  d3.selectAll(".set-type-label").classed("selected", (d) =>
    activeTimelineSelections.setTypes.has(d)
  );
}

/* =========================================================================
 *  CROSS-VIEW EVENT WIRING
 * ========================================================================= */

/** Card hover → Timeline */
onHoverCard((card) => {
  highlightTimelineSetsHoverOnly(card);
});
onClearHover(clearTimelineHoverOnly);

/** Icicle hover */
onRectHover((rectInfo) => {
  highlightTimelineSetsFromIcicle(rectInfo);
});
onClearRectHover(clearTimelineHoverOnly);

/** NumColors hover */
onNumColorsHover(({ numColors }) => {
  highlightTimelineSetsFromNumColors(numColors);
});
onClearNumColorsHover(clearTimelineHoverOnly);

/** Line year hover */
onLineYearHover((yearInfo) => {
  highlightTimelineSetsFromYearInfo(yearInfo);
});
onClearLineYearHover(clearTimelineHoverOnly);

/** Alluvial hovers */
onAlluvialHover(({ category, value }) => {
  highlightTimelineSetsFromAlluvialCategory(category, value);
});
onAlluvialLinkHover(({ originality, rarity }) => {
  highlightTimelineSetsFromAlluvialLink(originality, rarity);
});
onClearAlluvialHover(clearTimelineHoverOnly);
onClearAlluvialLinkHover(clearTimelineHoverOnly);

/** Global hover clear */
function globalHoverClear() {
  clearTimelineHoverOnly();
}

/** Scatterplot → Timeline hover already covered via onScatterplotCards for selects */

/* --- Selection resets --- */

onClearSelection(() => {
  activeTimelineSelections.fromAlluvialOriginality.clear();
  activeTimelineSelections.fromAlluvialRarity.clear();
  activeTimelineSelections.fromAlluvialLinkPairs.clear();
  activeTimelineSelections.fromIcicleIdentity.clear();
  activeTimelineSelections.fromIcicleColors.clear();
  activeTimelineSelections.fromYears.clear();
  activeTimelineSelections.sets.clear();
  activeTimelineSelections.setTypes.clear();
  activeTimelineSelections.setsFromScatterplot.clear();
  updateTimelineSelections();
});

onClearAlluvialSelections(() => {
  activeTimelineSelections.fromAlluvialOriginality.clear();
  activeTimelineSelections.fromAlluvialRarity.clear();
  activeTimelineSelections.fromAlluvialLinkPairs.clear();
  updateTimelineSelections();
});

onClearIcicleSelections(() => {
  activeTimelineSelections.fromIcicleIdentity.clear();
  activeTimelineSelections.fromIcicleColors.clear();
  updateTimelineSelections();
});

onClearTimelineSelections(() => {
  activeTimelineSelections.sets.clear();
  activeTimelineSelections.setTypes.clear();
  updateTimelineSelections();
});

/** Scatterplot → Timeline selections */
onScatterplotCards(({ setNames }) => {
  activeTimelineSelections.setsFromScatterplot = new Set(setNames);
  updateTimelineSelections();
});
onClearScatterplotBrush(() => {
  activeTimelineSelections.setsFromScatterplot.clear();
  updateTimelineSelections();
});

/** Alluvial → Timeline selections */
onAlluvialClick(({ category, value }) => {
  if (!category || !value) return;

  const key = value.toLowerCase();
  let target = null;

  if (category === "Originality") {
    target = activeTimelineSelections.fromAlluvialOriginality;
  } else if (category === "Rarity") {
    target = activeTimelineSelections.fromAlluvialRarity;
  }

  if (!target) return;

  target.has(key) ? target.delete(key) : target.add(key);
  updateTimelineSelections();
});

onAlluvialLinkClick(({ originality, rarity }) => {
  const key = `${originality}|${rarity}`;
  const set = activeTimelineSelections.fromAlluvialLinkPairs;
  set.has(key) ? set.delete(key) : set.add(key);
  updateTimelineSelections();
});

onAlluvialLink((pairSets) => {
  activeTimelineSelections.fromAlluvialLinkPairs = new Set(pairSets);
  updateTimelineSelections();
});

/** Line Chart → Timeline selections */
onLineChartClick(({ year }) => {
  if (!year) return;
  const yearStr = year.toString();
  const set = activeTimelineSelections.fromYears;
  set.has(yearStr) ? set.delete(yearStr) : set.add(yearStr);
  updateTimelineSelections();
});

onLineChartBrush((entries) => {
  const set = activeTimelineSelections.fromYears;
  entries.forEach(({ year }) => {
    if (!year) return;
    set.has(year) ? set.delete(year) : set.add(year);
  });
  updateTimelineSelections();
});

onClearLineChartBrush(() => {
  activeTimelineSelections.fromYears.clear();
  updateTimelineSelections();
});

/** Icicle → Timeline selections */
onIcicleClick(({ colorIdentity, numColors }) => {
  if (!colorIdentity) return;

  const idSet = activeTimelineSelections.fromIcicleIdentity;
  const numSet = activeTimelineSelections.fromIcicleColors;

  if (idSet.has(colorIdentity)) {
    idSet.delete(colorIdentity);
    if (idSet.size === 0) numSet.clear();
  } else {
    idSet.add(colorIdentity);
    numSet.add(numColors);
  }

  updateTimelineSelections();
});

onIcicleNumClick(({ numColors, colorIdentities }) => {
  if (!numColors || !colorIdentities) return;

  const groupSet = activeTimelineSelections.fromIcicleColors;
  const idSet = activeTimelineSelections.fromIcicleIdentity;
  const isSelected = groupSet.has(numColors);

  if (isSelected) {
    groupSet.delete(numColors);
    colorIdentities.forEach((id) => idSet.delete(id));
  } else {
    groupSet.add(numColors);
    colorIdentities.forEach((id) => idSet.add(id));
  }

  updateTimelineSelections();
});

/* =========================================================================
 *  MAIN: CREATE TIMELINE VIEW
 * ========================================================================= */

export function createTimelineView(data, containerId, isUpdate = false) {
  const tooltip = d3.select("#tooltip");
  const container = d3.select(containerId);

  container.selectAll("*").remove();
  container.on("contextmenu", (event) => event.preventDefault());

  // Pre-parse dates
  data.forEach((card) => {
    if (!card._parsedDate) card._parsedDate = new Date(card.release_date);
  });

  // Aggregate per set
  const setMap = new Map();
  yearStats.clear();
  setTypeStats.clear();

  data.forEach((card) => {
    const setName = card.set_name;
    if (!setMap.has(setName)) {
      setMap.set(setName, {
        name: setName,
        releaseDate: card._parsedDate,
        setType: card.set_type,
        cardCount: 0,
        originalities: new Set(),
        rarities: new Set(),
        colorIdentities: new Set(),
        numColorsPresent: new Set(),
      });
    }

    const setEntry = setMap.get(setName);
    setEntry.cardCount += 1;

    if (card.originality)
      setEntry.originalities.add(card.originality.toLowerCase());
    if (card.rarity)
      setEntry.rarities.add(card.rarity.toLowerCase());

    let identity;
    if (!card.color_identity || card.color_identity.length === 0) {
      identity = "Colorless";
      setEntry.numColorsPresent.add(0);
    } else {
      identity = card.color_identity
        .slice()
        .sort((a, b) => mtgColorOrder[a] - mtgColorOrder[b])
        .join("");
      setEntry.numColorsPresent.add(identity.length);
    }
    setEntry.colorIdentities.add(identity);
  });

  uniqueSets = Array.from(setMap.values()).sort(
    (a, b) => a.releaseDate - b.releaseDate
  );

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

    // Year-level stats
    if (!yearStats.has(year)) {
      yearStats.set(year, {
        totalCardCount: 0,
        rarities: new Set(),
        originalities: new Set(),
        colorIdentities: new Set(),
        numColorsPresent: new Set(),
        setNames: new Set(),
      });
    }
    const ys = yearStats.get(year);
    ys.totalCardCount += set.cardCount;
    set.rarities.forEach((r) => ys.rarities.add(r));
    set.originalities.forEach((o) => ys.originalities.add(o));
    set.colorIdentities.forEach((c) => ys.colorIdentities.add(c));
    set.numColorsPresent.forEach((n) => ys.numColorsPresent.add(n));
    ys.setNames.add(set.name);

    // Set-type-level stats
    if (!setTypeStats.has(type)) {
      setTypeStats.set(type, {
        totalCardCount: 0,
        rarities: new Set(),
        originalities: new Set(),
        colorIdentities: new Set(),
        numColorsPresent: new Set(),
        setNames: new Set(),
        releaseDates: new Set(),
      });
    }

    const st = setTypeStats.get(type);
    st.totalCardCount += set.cardCount;
    set.rarities.forEach((r) => st.rarities.add(r));
    set.originalities.forEach((o) => st.originalities.add(o));
    set.colorIdentities.forEach((c) => st.colorIdentities.add(c));
    set.numColorsPresent.forEach((n) => st.numColorsPresent.add(n));
    st.setNames.add(set.name);
    st.releaseDates.add(set.releaseDate);
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
      const yearStr = d.getFullYear().toString();
      const info = yearStats.get(yearStr);
      if (!info) return;

      emitLineChartClick({
        year: yearStr,
        originalities: info.originalities,
        rarities: info.rarities,
        source: "timeline",
      });
    })
    .on("contextmenu", (event, d) => {
      event.preventDefault();
      const yearStr = d.getFullYear().toString();
      const updated = getClonedFilters();
      if (!updated["Year"]) updated["Year"] = new Set();

      updated["Year"].has(yearStr)
        ? updated["Year"].delete(yearStr)
        : updated["Year"].add(yearStr);

      updateState({
        selectedFilters: updated,
        updateContext: "TimelineFilter",
      });
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

      highlightAllViewsForYear(yearStr);

      const tooltipHtml = types
        ? `<strong>${yearStr}</strong><br><strong>Total Sets: ${totalSets}</strong><br>${Array.from(
            types.entries()
          )
            .map(([t, c]) => `${t}: ${c}`)
            .join("<br>")}`
        : `<strong>${yearStr}</strong><br>No sets`;

      tooltip.style("display", "block").html(tooltipHtml);

      const node = tooltip.node();
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const pad = 10;

      let left = event.pageX + pad;
      if (left + w > window.innerWidth) {
        left = event.pageX - w - pad;
      }
      if (left < 0) left = pad;

      let top = event.pageY + pad;
      if (top + h > window.innerHeight) {
        top = event.pageY - h - pad;
      }
      if (top < 0) top = pad;

      tooltip.style("left", `${left}px`).style("top", `${top}px`);
    })
    .on("mouseout", () => {
      tooltip.style("display", "none");
      emitClearLineYearHover();
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
            const rect = d3.select(this);
            rect
              .attr("fill", d.highlightColor)
              .classed("hover-temp", true);

            tooltip
              .style("display", "block")
              .html(`
                <strong>${d.name}</strong><br>
                ${d.releaseDate.toDateString()}<br>
                Type: ${d.setType}<br>
                Cards in Set: ${d.cardCount}
              `);

            const node = tooltip.node();
            const w = node.offsetWidth;
            const h = node.offsetHeight;
            const pad = 10;

            let left = event.pageX + pad;
            if (left + w > window.innerWidth) {
              left = event.pageX - w - pad;
            }
            if (left < 0) left = pad;

            let top = event.pageY + pad;
            if (top + h > window.innerHeight) {
              top = event.pageY - h - pad;
            }
            if (top < 0) top = pad;

            tooltip.style("left", `${left}px`).style("top", `${top}px`);

            highlightAllViewsForSet(d.name);
          })
          .on("mouseout", function (event, d) {
            const rect = d3.select(this);
            rect.classed("hover-temp", false);

            const isSel = rect.classed("selectedHovered");
            rect.attr("fill", isSel ? d.selectedColor : d.baseColor);

            tooltip.style("display", "none");
            clearAllViewsHoverOnly();
          })
          .on("click", function (event, d) {
            const sel = activeTimelineSelections.sets;
            sel.has(d.name)
              ? sel.delete(d.name)
              : sel.add(d.name);

            updateTimelineSelections();

            emitTimelineSetClick({
              name: d.name,
              releaseDate: d.releaseDate,
              setType: d.setType,
              cardCount: d.cardCount,
              originalities: new Set(d.originalities),
              rarities: new Set(d.rarities),
              colorIdentities: new Set(d.colorIdentities),
            });
          })
          .on("contextmenu", function (event, d) {
            event.preventDefault();
            const updated = getClonedFilters();
            if (!updated["Set Names"]) {
              updated["Set Names"] = new Set();
            }

            updated["Set Names"].has(d.name)
              ? updated["Set Names"].delete(d.name)
              : updated["Set Names"].add(d.name);

            updateState({
              selectedFilters: updated,
              updateContext: "TimelineFilter",
            });
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
          .on("click", (event, type) => {
            const typeSet = activeTimelineSelections.setTypes;
            const setSet = activeTimelineSelections.sets;

            if (typeSet.has(type)) {
              typeSet.delete(type);
              uniqueSets.forEach((s) => {
                if (s.setType === type) setSet.delete(s.name);
              });
            } else {
              typeSet.add(type);
              uniqueSets.forEach((s) => {
                if (s.setType === type) setSet.add(s.name);
              });
            }

            const info = setTypeStats.get(type);

            emitTimelineSetTypeClick({
              type,
              releaseDates: info?.releaseDates || new Set(),
              originalities: info?.originalities || new Set(),
              rarities: info?.rarities || new Set(),
              colorIdentities: info?.colorIdentities || new Set(),
            });

            updateTimelineSelections();
          })
          .on("contextmenu", (event, type) => {
            event.preventDefault();
            const updated = getClonedFilters();
            if (!updated["Set Types"]) {
              updated["Set Types"] = new Set();
            }

            updated["Set Types"].has(type)
              ? updated["Set Types"].delete(type)
              : updated["Set Types"].add(type);

            updateState({
              selectedFilters: updated,
              updateContext: "TimelineFilter",
            });
          })
          .on("mouseover", (event, type) => {
            const count = typeCounts.get(type) || 0;
            highlightAllViewsForSetType(type);

            tooltip
              .style("display", "block")
              .html(`<strong>${type}</strong><br>${count} sets`);

            const node = tooltip.node();
            const w = node.offsetWidth;
            const h = node.offsetHeight;
            const pad = 10;

            let left = event.pageX + pad;
            if (left + w > window.innerWidth) {
              left = event.pageX - w - pad;
            }
            if (left < 0) left = pad;

            let top = event.pageY + pad;
            if (top + h > window.innerHeight) {
              top = event.pageY - h - pad;
            }
            if (top < 0) top = pad;

            tooltip.style("left", `${left}px`).style("top", `${top}px`);
          })
          .on("mouseout", () => {
            tooltip.style("display", "none");
            clearAllViewsHoverOnly();
          }),
      (update) => update,
      (exit) => exit.remove()
    )
    .attr("y", (d) => yScale(d) + 5);

  /* ---- Zoom handler ---- */

  function zoomed(event) {
    const transform = event.transform;

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
      activeTimelineSelections.sets.clear();
      activeTimelineSelections.setTypes.clear();
      emitClearTimelineBrush();
      updateTimelineSelections();
      return;
    }

    const [[x0, y0], [x1, y1]] = event.selection;
    const brushedSets = [];

    d3.selectAll(".set-rect").each(function (d) {
      const rect = d3.select(this);
      const x = +rect.attr("x");
      const y = +rect.attr("y");
      const w = +rect.attr("width");
      const h = +rect.attr("height");

      const intersects =
        x + w >= x0 &&
        x <= x1 &&
        y + h >= y0 &&
        y <= y1;

      if (intersects) {
        brushedSets.push({
          name: d.name,
          originalities: new Set(d.originalities),
          rarities: new Set(d.rarities),
          colorIdentities: new Set(d.colorIdentities),
          releaseDate: d.releaseDate,
        });
      }
    });

    if (brushedSets.length === 0) {
      activeTimelineSelections.sets.clear();
      activeTimelineSelections.setTypes.clear();
      emitClearTimelineBrush();
      updateTimelineSelections();
      ignoreNextBrushEnd = true;
      chartGroup.select(".brush").call(brush.move, null);
      return;
    }

    brushedSets.forEach((s) => {
      const set = activeTimelineSelections.sets;
      set.has(s.name) ? set.delete(s.name) : set.add(s.name);
    });

    updateTimelineSelections();
    emitTimelineBrush(brushedSets);

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

    if (!isSetRect && !isYearTick && !isTypeLabel && !isInfo) {
      emitClearSelection();
      updateTimelineSelections();
    }
  });

  /* ---- Initial selection render ---- */

  updateTimelineSelections();
}
