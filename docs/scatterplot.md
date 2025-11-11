[← Back to main page](../)
## Scatterplot
- Hover **dots** to see card details and highlight the same cards across views.
- **Click** a dot to toggle a persistent highlight for that card.
- **Brush** (drag to select): toggles persistent highlights of all cards in the box.
- **Mouse wheel** to zoom; **right‑click drag** or **Ctrl + left‑drag** to pan.
- Use the **dropdown** to switch X‑axis between **Average Price** and **Release Date**.
- **Double‑click background** to clear selections **made within the Scatterplot**.

This module renders a **Scatterplot** that places cards by **Average Price** or **Release Date** (X) and **Complexity** (Y). It integrates with other coordinated views through the shared `Events.js` bus and the global app state.

## Contents
- [Imports](#imports)
- [Module State](#module-state)
- [Functions](#functions)
  - [prepareScatterData](#preparescatterdata)
  - [createScatterPlot](#createscatterplot)
  - [updateScatterPlot](#updatescatterplot)
  - [Hover/selection helpers](#hoverselection-helpers)
  - [Highlight APIs (exported)](#highlight-apis-exported)
  - [Internal utilities](#internal-utilities)
- [Selection Logic](#selection-logic)
- [Interactions](#interactions)
- [Events](#events)
- [Data & DOM Assumptions](#data--dom-assumptions)
- [Example](#example)

---

## Imports
```
updateState, getState from ../state.js
All event emitters/listeners from ./Events.js
getEffectivePriceAttribute from ../script.js
```

---

## Module State

| Name | Type | Purpose |
|---|---|---|
| `colorGroups` | `{range:[min,max], color}[]` | 5 bins used to color dots by **EDHREC rank** ranges. |
| `activeSelections` | object | Local + cross‑view selections (sets below). |
| ↳ `originalities` | `Set<string>` | Selected Originality values. |
| ↳ `rarities` | `Set<string>` | Selected Rarity values. |
| ↳ `originalityRarityPairs` | `Set<string>` | Selected `"orig\|rar"` link keys. |
| ↳ `colorIdentities` | `Set<string>` | Selected color identity keys (`"WU"`, `"Colorless"`, …). |
| ↳ `numColors` | `Set<number>` | Selected **Nº of Colors** buckets. |
| ↳ `years` | `Set<number>` | Selected release years. |
| ↳ `sets` | `Set<string>` | Selected set names. |
| ↳ `setTypes` | `Set<string>` | Selected set types (lowercased). |
| ↳ `cards` | `Map<string, Card>` | Manually toggled cards (click/brush/search). |
| `filterGroups` | record | Groups used to combine filters (**OR** within, **AND** across). |
| `ZOOM_THRESHOLD` | `number` | Minimum zoom to show all dots; below it, show only **zoom‑key** dots. |
| `ZOOM_RESET_EPSILON` | `number` | Snap transform back to identity when near k=1. |
| `dotSizeByZoom` | array | Lookup of dot radius by zoom level. |
| `currentZoomLevel`/`currentZoomTransform` | numbers/transform | Current zoom state. |
| `lastPriceAttribute` | `string` | Last price attribute used for axis label symbol. |
| `xMetric` | `"avg_price" \| "release_date"` | Which X metric is active. |
| `actualFIlteredData` | `Card[]` | Current data in view (used by selection application). |
| `globalDots` | `d3.Selection` | Cached circles selection for fast updates. |
| `scatterTooltipText` | `string` | Info tooltip ("?") explaining interactions. |

**Info tooltip copy** is defined inline (`scatterTooltipText`) and displayed by the “?” icon.

---

## Functions

### `prepareScatterData`
```ts
prepareScatterData(data: Array<Card>, selectedPriceAttribute: string): Array<Card>
```
**Purpose**  
Normalize and aggregate raw card rows to **one row per card name**, computing `avg_price`, earliest `release_date`, multi‑print metadata, and **all\_sets / all\_set\_types / all\_years / all\_originalities**.

**Data shaping**
- Excludes **digital** and some set types (`memorabilia`, `alchemy`, `token`) and set names containing `Arena`, `Alchemy`, `Digital`.
- Aggregates across prints: collects prices → `avg_price`, earliest release date, print images + metadata, and set/type/year/originality sets.
- Produces stable arrays: `all_sets: {name, type}[]`, `all_set_types: string[]`, `all_years: number[]`, `all_originalities: string[]`, `all_print_images: string[]`, `print_image_metadata`.
- Chooses `tooltip_image` from the **original** print when available; falls back to `image_normal`.

**Returns**  
Array of aggregated `Card` objects ready for plotting.

---

### `createScatterPlot`
```ts
createScatterPlot(
  data: Array<Card>,
  containerId: string,
  isUpdate: boolean = false,
  selectedPriceAttribute: string = "price_usd",
  savedTransform: d3.ZoomTransform | null = null
): void
```
**Purpose**  
Render the scatterplot, axes, EDHREC legend, info tooltip, **X‑axis metric switcher**, zoom/pan/brush, and bind interactions.

**Layout & Scales**
- Measures container → `width × height`; margins `{ top:35, right:14, bottom:35, left:60 }`.
- X: **log scale** for `avg_price` (`logXScale`) or **time scale** for `release_date` (`timeXScale`).
- Y: **linear** `complexity` with light padding; stores `originalYScale` for rescaling with zoom.
- Stores scales and metadata on `svg.node().__scales__` and `__scatterMeta__`.

**Color encoding (dots)**
- If `edhrec_rank > 0` → fill by **colorGroups**; otherwise **transparent fill + black stroke** ("No Rank").
- Opacity `0.8`. Initial radius via `getDotRadiusForZoom(currentZoomLevel)`.

**Rendering policy at low zoom**
- Below `ZOOM_THRESHOLD`, show only **zoom key points** (`d.isZoomKey`) computed by `tagZoomKeyPoints` on a small grid to reduce clutter; show all dots when zoomed in.

**Axes & Labels**
- `updateAxes(symbol, activeXScale)` renders price ticks for log scale and year ticks for time scale (2‑digit years except ends).
- Adds Y‑axis label **“Complexity”** with tooltip explaining the metric.

**Legend**
- EDHREC rank legend with 5 colored swatches + a “No Rank” entry (empty circle).

**Controls**
- Dropdown to switch `xMetric` between **Average Price** and **Release Date** with tooltip (`getXMetricTooltipText`); triggers `updateXMetricScale()`.

**Interactions**
- **Hover**: rich tooltip (card image + attributes); adds `.hover-temp` and emits `emitHoverCard` via `hoverOnlyHighlightCard()`.
- **Mousemove**: repositions tooltip within viewport.
- **Mouseout**: hides tooltip and clears hover highlight.
- **Click**: toggles manual selection of that card in `activeSelections.cards` and updates highlights (also emits summary via `emitScatterplotCards`).  
- **Brush**: toggles manual selections for all dots within the brushed box; clears brush on completion.
- **Zoom/Pan**: wheel zoom; right‑mouse or `Ctrl+drag` pan; updates dot radius/positions and X axis, rescaling without mutating base scales.
- **Double‑click background**: emits `emitClearSelection()` and clears local selections.

**Side Effects**
- Appends `<svg>`, groups for dots, clipPath, axes, legend, info icon, dropdown control.
- Registers event listeners and exposes scale/metadata handles for later updates.

---

### `updateScatterPlot`
```ts
updateScatterPlot(filteredData: Array<Card>, selectedPriceAttribute: string = "price_eur"): void
```
**Purpose**  
Incrementally update scales, axes, zoom‑key tagging, and the dot join when filters or data change. Keeps the current zoom transform and re‑computes which dots are visible.

**Side Effects**
- Updates X scale domain based on `xMetric` (log vs. time), re‑calls `updateAxes`, re‑tags `isZoomKey`, re‑binds the circles via `.join()`, repositions dots, re‑applies hover class to keep cross‑view highlights in sync.

---

### Hover/selection helpers
```ts
hoverOnlyHighlightCard(card: Card): void
clearHoverOnlyHighlight(): void
getTooltipImageMetadata(card: Card): { image, set_name, set_type } | null
```
**Purpose**  
Emit cross‑view hover events for a single card and access the hovered print’s metadata for the tooltip. `clearHoverOnlyHighlight` resets hover state.

---

### Highlight functions 
```ts
highlightScatterDotsFromSet(setName: string): void
highlightScatterDotsFromSetType(setType: string): void
highlightScatterDotsFromYear(year: Date): void
highlightScatterDotsFromIcicle(rectInfo: { colorIdentities: Set<string> }): void
highlightScatterDotsFromNumColors(numColors: number): void
clearScatterHoverOnly(): void
```
**Purpose**  
Allow other views (Timeline / Icicle / Line / Alluvial) to trigger **hover‑only** highlights in the scatterplot. Hover styling uses `.hover-temp`; visibility honors zoom policy (in‑bounds & key‑dot rules).

---

### Internal utilities
```ts
getDotRadiusForZoom(zoomLevel: number): number
getXValue(d: Card): number | Date
updateXMetricScale(): void
getActiveXScale(): d3.ScaleLogarithmic | d3.ScaleTime
updatePointPositions(xScale, yScale): void
applyZoomTransform(transform: d3.ZoomTransform): void
tagZoomKeyPoints(data: Card[], xScale, yScale, cellSize=6): Card[]
getColorIdentityBackground(ci: string[]): string | CSSGradient
addActiveSelection(category: keyof activeSelections, value: any): void
addPairSelection(category: "originalityRarityPairs", originality: string, rarity: string): void
getAggregatedCardAttributesFromManualSelection(): void
applySelectedHoverClass(map: Map<string,Card>, names: Set<string>): void
```
**Notes**
- **Zoom keys**: `tagZoomKeyPoints` marks one representative point per small grid cell (`6px`) to avoid overdraw when zoomed out.
- **Axis symbol** uses `getSymbolFromAttribute(lastPriceAttribute)` so EUR/ USD symbols match the current price attribute.
- **Perf**: most updates use cached selections (`globalDots`) and avoid reflows.

---

## Selection Logic
Scatterplot highlights are derived from **local selections** and **cross‑view filters**:

- **Groups**: `filterGroups = { alluvial:["originalityRarityPairs"], icicle:["colorIdentities","numColors"], timeline:["sets","setTypes"], lineChart:["years"] }`  
- **OR within each group**; **AND across groups**.  
- If **no cross‑view filters** are active, the highlight set is **only** the manually selected cards (`activeSelections.cards`).  
- If filters **are** active: take all matching cards and **union** them with the manually selected cards.
- Clearing events (`onClearSelection`, `onClearAlluvialSelections`, `onClearIcicleSelections`, `onClearTimelineBrush`, `onClearLineChartBrush`) wipe their respective sets and recompute highlights.

Depth/UI details:
- `.selected-hover` class is applied to dots whose names are in the **current hoveredCards** (from `updateState({... isHoverUpdate:true})`).

---

## Interactions
- **Hover** a dot → rich tooltip + hover highlights; propagated by `emitHoverCard`.
- **Click** a dot → toggles persistent selection in `activeSelections.cards` and recomputes highlights (also emits a summary to other views).
- **Brush** → toggles all dots inside the brush selection (add/remove behavior). Brush clears on end; emits `emitClearScatterplotBrush` when empty.
- **Zoom / Pan** → wheel zoom, right‑drag or `Ctrl + left‑drag` pan; dot radius adapts by `dotSizeByZoom`; axes update without mutating base scales.
- **Axis dropdown** → switches between price vs. date; re‑tags zoom keys and updates axes + positions.
- **Double‑click background** → clears Scatterplot selections; emits `emitClearSelection`.

---

## Events

**Emitted**
- `emitHoverCard(card)` — when hovering a dot.
- `emitScatterplotCards({ originalities, rarities, colorIdentities, years, setNames })` — summary of manual card selection.
- `emitScatterplotBrush(...)` / `emitClearScatterplotBrush()` — brush lifecycle.
- `emitClearSelection()` — double‑click background.

**Consumed**
- From **Alluvial**: `onAlluvialClick`, `onAlluvialLink`, `onAlluvialLinkClick`, `onAlluvialHover`, `onAlluvialLinkHover`, `onClearAlluvialHover`, `onClearAlluvialLinkHover`, `onClearAlluvialSelections`.
- From **Icicle**: `onIcicleClick`, `onIcicleNumClick`, `onRectHover`, `onNumColorsHover`, `onClearRectHover`, `onClearNumColorsHover`, `onClearIcicleSelections`.
- From **Line chart**: `onLineChartClick`, `onLineChartBrush`, `onLineYearHover`, `onClearLineYearHover`, `onClearLineChartBrush`.
- From **Timeline**: `onTimelineSetClick`, `onTimelineSetTypeClick`, `onTimelineBrush`, `onClearTimelineBrush`, `onSetHover`, `onSetTypeHover`, `onClearSetHover`.
- Global clears: `onClearSelection`, `emitClearSelection`.

Each handler toggles the relevant set(s) in `activeSelections` and calls `applySelectionToScatter()`.

---

## Data & DOM Assumptions
- `containerId` exists and has measurable size.
- A `#tooltip` element is present (positioned absolutely for hover content).
- D3 is globally available with `d3.zoom`, `d3.brush`, log/time/linear scales, axes, and `d3.timeFormat`.
- CSS classes: `.dots`, `.hover-temp`, `.selected-hover`, `.edhrec-legend`; plus per‑identity/bucket classes `ci-<ID>` and `nc-<N>`.
- The container’s parent allows pointer events for pan/zoom/brush.

---

## Example
```js
import { prepareScatterData, createScatterPlot, updateScatterPlot } from "./Scatterplot.js";

// 1) Prepare data once (on load or when price attribute changes)
const prepared = prepareScatterData(rawCards, "price_eur");

// 2) Create the chart
createScatterPlot(prepared, "#scatter-container", false, "price_eur");

// 3) Later, on filters or data changes
updateScatterPlot(prepared, "price_eur");
```
