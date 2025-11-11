[← Back to main page](../)
## Line Chart
- **Hover** a year dot to see yearly metrics and highlight related elements across views.
- **Click** a year dot to toggle the year selection and broadcast it to other charts.
- **Right‑click** a year dot to toggle a **global Year filter**.
- **Brush** horizontally to toggle multiple years at once.
- **Mouse wheel** to zoom; **right‑drag** or **Ctrl + left‑drag** to pan.
- **Double‑click background** to clear selections **made within the Line Chart**.

This module renders a **stacked multi‑metric line chart** over years, with three synchronized panels:
**Functional Reprints**, **Avg. Complexity**, and **Avg. Mana Value**. It integrates with coordinated views through `Events.js` and the global app state.

## Contents
- [Imports](#imports)
- [Module State](#module-state)
- [Functions](#functions)
  - [createStackedLineChart](#createstackedlinechart)
  - [updateLineChartSelections](#updatelinechartselections)
  - [highlightAllViewsForYear](#highlightallviewsforyear)
  - [Hover/Highlight helpers](#hoverhighlight-helpers)
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
```

---

## Module State

| Name | Type | Purpose |
|---|---|---|
| `lineChartTooltipText` | `string` | Help tooltip copy for the “?” icon. |
| `mtgColorOrder` | record | Sort order for color identities (W,U,B,R,G). |
| `localSelectedYears` | `Set<string>` | Local set of toggled years (click/brush). |
| `ignoreNextBrushEnd` | `boolean` | Debounce to avoid duplicate brush end handling. |
| `currentZoomTransform` | `d3.ZoomTransform` | Current zoom/pan transform (shared across panels). |
| `activeLineSelections` | object | Cross‑view + local selection state tracked by source (below). |
| ↳ `fromAlluvialOriginality` | `Set<string>` | Originality values from Alluvial node clicks. |
| ↳ `fromAlluvialRarity` | `Set<string>` | Rarity values from Alluvial node clicks. |
| ↳ `fromAlluvialLinkPairs` | `Set<string>` | `"orig\|rar"` link keys from Alluvial link selections. |
| ↳ `fromIcicleIdentity` | `Set<string>` | Color identities from Icicle. |
| ↳ `fromIcicleColors` | `Set<number>` | Nº of colors buckets from Icicle. |
| ↳ `fromYears` | `Set<string>` | Explicit year selections (Line chart or other views). |
| ↳ `yearsFromTimelineSets` | `Map<string,string>` | Map of set name → year from Timeline set clicks/brush. |
| ↳ `yearsFromSetTypes` | `Map<string, Set<string>>` | Set type → years selected. |
| ↳ `yearsFromScatterplotCards` | `Set<string>` | Year set derived from manual Scatterplot card selections. |
| `brushing` | `boolean` | Whether a brush is active. |

**Info tooltip copy** is defined inline (`lineChartTooltipText`) and displayed by the “?” icon.

---

## Functions

### `createStackedLineChart`
```ts
createStackedLineChart(
  data: Array<Card>,
  containerId: string,
  isUpdate: boolean = false
): void
```
**Purpose**  
Build a **three‑row stacked line chart** with synchronized X (years), per‑row Y scales, year dots, an info tooltip, **zoom/pan**, and a **brush** to toggle year ranges.

**Data shaping**
- Filters out known outliers (e.g., `"Gleemax"`).
- `d3.rollups` → **per‑year aggregates**:
  - `reprints`: count of cards with `originality === "functional reprint"`.
  - `avgComplexity`: mean of `complexity` for the year.
  - `avgCMC`: mean of `cmc` for the year.
  - Sets per year: `originalities`, `rarities`, `colorIdentities`, `numColorsPresent`.
- Converts each year to `Date` (`Jan 1`) and sorts ascending.

**Layout & Scales**
- Measures container → `containerWidth × containerHeight`.
- X: `scaleTime` over `[domainStart, domainEnd]` adjusted to the min/max visible years.
- Y (per row): `scaleLinear().nice()` from `0` to row‑specific max.
- Stores shared handles on `svg.node()`:
  - `window._lineChartXScale` (base X scale)
  - internal `__scales__/__meta__` equivalents via closures.

**Panels (metrics)**
- `reprints` (Functional Reprints)
- `avgComplexity` (Avg. Complexity)
- `avgCMC` (Avg. Mana Value)
- Each panel renders: a path, per‑year circles (`.data-point`), left Y axis, and a rotated X axis (bottom panel has labels; upper panels hide tick labels to reduce clutter).

**Interactions**
- **Hover** a dot → tooltip with the year + all metric values; highlights same‑year dots across panels and draws a shared vertical hover line.
- **Mousemove** over plot area → moves the shared hover line to the pointer’s year.
- **Mouseout** → hides hover line and tooltip; clears hover class.
- **Click** a dot → toggles the year in `activeLineSelections.fromYears`, calls `updateLineChartSelections()`, and emits `emitLineChartClick` with context.
- **Right‑click** a dot → toggles the global **Year** filter in app state.
- **Brush** (horizontal) → toggles all years inside the brush; clears when empty; emits `emitLineChartBrush` with entries.
- **Double‑click background** → clears selections local to Line Chart and broadcasts `emitClearSelection`.

**Zoom/Pan**
- Wheel zoom and right‑drag/Ctrl+drag pan via `d3.zoom`.
- Recomputes X positions for paths and dots; keeps vertical selection lines aligned via stored timestamps (`data-timestamp`).
- Axis ticks update to match the zoomed X scale.

**Side Effects**
- Appends a wrapper `<div>`, `<svg>`, clipPath, three metric groups, left axes, bottom axis, info icon, hover overlay, brush group, and a **shared vertical hover line** spanning all rows.

---

### `updateLineChartSelections`
```ts
updateLineChartSelections(): void
```
**Purpose**  
Recompute and draw **selected year markers** (vertical dashed lines) based on local + cross‑view selections.

**Logic**
- If **no selection sources** are active → remove selection lines and return.
- Compute **matching years** by evaluating each year dot against four groups:
  1) **Alluvial** (Originality, Rarity, or `orig|rar` link) — **OR within group**.  
  2) **Icicle** (Color identities or Nº of colors) — **OR within group**.  
  3) **Timeline** (sets and set types) — **OR within group**.  
  4) **Explicit year** selections — requires membership if present.
- Intersection across groups; then **union** with `yearsFromScatterplotCards` (Scatterplot exception).
- Draw dashed lines (`.selected-hover-line`) for matching years; keep aligned during zoom using stored timestamps and `currentZoomTransform`.

**Side Effects**
- Clears previous selection lines, appends new ones, and positions them relative to the current zoom.

---

### `highlightAllViewsForYear`
```ts
highlightAllViewsForYear(entry: {
  year: Date,
  reprints: number,
  avgComplexity: number,
  avgCMC: number,
  originalities: Set<string>,
  rarities: Set<string>,
  colorIdentities: Set<string>,
  numColorsPresent: Set<number>
}): void
```
**Purpose**  
Broadcast a **hover event** for a given year to all views (`emitLineYearHover`), carrying all relevant sets for cross‑view highlighting.

---

### Highlight functions
```ts
clearLineChartHoverOnly(): void
highlightLineChartHoverOnly(card: Card): void
highlightLineChartHoverOnlyFromSet(setReleaseDate: Date): void
highlightLineChartHoverOnlyFromSetType(releaseDates: Set<Date>): void
highlightLineChartFromAlluvialCategory(category: "Originality"|"Rarity", value: string): void
highlightLineChartFromAlluvialLink(originality: string, rarity: string): void
highlightLineChartFromNumColors(numColors: number): void
highlightLineChartHoverOnlyFromExternal(payload: { year: Date, ... }): void
```
**Purpose**  
Enable **hover‑only** highlights from other coordinated views and local hover. These functions toggle `.hover-temp` on matching year dots and draw temporary vertical hover lines (`.highlight-hover-line`).

---

### Internal utilities
```ts
getClonedFilters(): Record<string, Set<string>>
drawVerticalLinesForYears(timestamps: number[]): void
getXCoordFromYear(date: Date, svg: d3.Selection): number
```
**Notes**
- **Cloned filters**: `getClonedFilters()` duplicates `selectedFilters` from app state when doing context‑menu Year filter toggles.
- **Vertical lines**: `drawVerticalLinesForYears` draws hover lines that respect current zoom; duplicates are de‑duplicated via a `Set`.
- **Coordinate helpers** keep X positioning consistent when zooming/panning.

---

## Selection Logic
The Line Chart composes selections from multiple sources:

- **Alluvial**: match if a year’s aggregates contain any selected originality, rarity, or an `orig|rar` pair.
- **Icicle**: match if a year contains any of the selected color identities or Nº of colors.
- **Timeline**: match if the year equals any selected year derived from sets or set types.
- **Explicit years**: match if the year itself is selected (clicked/brush).

**Intersection across groups**; then **union** with `yearsFromScatterplotCards` so Scatterplot manual selections always show up.

When **no sources are active**, no vertical selection lines are drawn (chart remains in base state).

---

## Interactions
- **Hover** a data point → show tooltip + hover lines across rows; emits `emitLineYearHover`.
- **Mousemove** in plot area (no brush) → moves a shared hover line to the pointer’s year.
- **Mouseout** → hides shared hover line and clears hover classes (`emitClearLineYearHover`).
- **Click** a dot → toggles the year selection and emits `emitLineChartClick` with context sets.
- **Brush** → toggles all years inside the brush; emits `emitLineChartBrush` with `{year, originalities, rarities, colorIdentities}`.
- **Right‑click** a dot → toggles the global **Year** filter via `updateState({ selectedFilters })`.
- **Double‑click background** → clears Line‑Chart‑local selections and emits `emitClearSelection`.
- **Zoom/Pan** → wheel zoom and right/Ctrl‑drag pan; updates axes and keeps selection/hover lines aligned.

---

## Events

**Emitted**
- `emitLineYearHover({...})`, `emitClearLineYearHover()` — hover bridge.
- `emitLineChartClick({ year, ... })` — year click with context sets.
- `emitLineChartBrush(brushedEntries)` / `emitClearLineChartBrush()` — brush lifecycle.
- `emitClearSelection()` — dbl‑click background.

**Consumed**
- From **Scatterplot**: `onScatterplotCards`, `onClearScatterplotBrush`.
- From **Alluvial**: `onAlluvialHover`, `onAlluvialClick`, `onAlluvialLink`, `onAlluvialLinkClick`, `onClearAlluvialHover`, `onAlluvialLinkHover`, `onClearAlluvialLinkHover`, `onClearAlluvialSelections`.
- From **Icicle**: `onRectHover`, `onIcicleClick`, `onIcicleNumClick`, `onClearRectHover`, `onClearIcicleSelections`, `onNumColorsHover`, `onClearNumColorsHover`.
- From **Timeline**: `onTimelineSetClick`, `onTimelineSetTypeClick`, `onTimelineBrush`, `onClearTimelineBrush`, `onClearTimelineSelections`, `onSetHover`, `onSetTypeHover`, `onClearSetHover`.
- From **Line** (self/others): `onLineChartClick`, `onLineYearHover`, `onClearLineYearHover`, `onClearLineChartBrush`.
- Global: `onClearSelection`.

Each handler updates `activeLineSelections` and calls `updateLineChartSelections()`.

---

## Data & DOM Assumptions
- A container for `.LineChart` exists and has measurable size; `containerId` refers to a valid element.
- A `#tooltip` element is present for hover content.
- D3 is globally available with `zoom`, `brush`, `scales`, and `axes`.
- CSS classes: `.data-point`, `.hover-temp`, `.hover-line`, `.selected-hover-line`, `.highlight-hover-line`.

---

## Example
```js
import { createStackedLineChart } from "./LineChart.js";

createStackedLineChart(cards, "#linechart-container", false);
```
