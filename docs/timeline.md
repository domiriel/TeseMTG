[← Back to main page](../)
## Timeline
- **Click** a **year label**, **set square**, or **set type** label to toggle selection.
- **Right‑click** a **year**, **set**, or **set type** to toggle the corresponding **global filter**.
- **Brush** across the grid to toggle multiple sets at once.
- **Mouse wheel** to zoom (time axis); **right‑drag** or **Ctrl + left‑drag** to pan.
- **Hover** any element to see a tooltip and send **hover highlights** to other charts.
- **Double‑click background** to clear **Timeline‑local selections** (Years excluded).

This module renders a **scrollable timeline grid** of MTG **Sets** laid out by **Release Date** (X) and **Set Type** (Y). Each set is a small square whose color encodes **card count (quintiles)** with split swatches for **base/selected** colors. The view integrates with other coordinated charts through `Events.js` and the global state.

## Contents
- [Imports](#imports)
- [Module State](#module-state)
- [Functions](#functions)
  - [createTimelineView](#createtimelineview)
  - [updateTimelineSelections](#updatetimelineselections)
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
updateFilterPanel from ./FilterPanel.js
Event emitters/listeners from ./Events.js
```
Used events include (non‑exhaustive): `emitSetHover`, `emitSetTypeHover`, `emitTimelineSetClick`, `emitTimelineSetTypeClick`, `emitTimelineBrush`, `emitClearTimelineBrush`, `emitLineYearHover`, `emitLineChartClick`, `emitClearSelection`, and their `on*` counterparts.

---

## Module State

| Name | Type | Purpose |
|---|---|---|
| `localSelectedYears` | `Set<string>` | Local year filter toggled via year tick context‑menu. |
| `localSelectedSetNames` | `Set<string>` | Local set name selections (not used across views). |
| `ignoreNextBrushEnd` | `boolean` | Debounce to avoid duplicate brush end handling after programmatic clears. |
| `yearStats` | `Map<string, {…}>` | Per‑year aggregates: `totalCardCount`, `rarities`, `originalities`, `colorIdentities`, `numColorsPresent`, `setNames`. |
| `setTypeStats` | `Map<string, {…}>` | Per‑set‑type aggregates: `totalCardCount`, sets of `rarities`, `originalities`, `colorIdentities`, `numColorsPresent`, `setNames`, `releaseDates`. |
| `uniqueSets` | `Array<SetEntry>` | The de‑duplicated, sorted list of sets (by `releaseDate`). |
| `mtgColorOrder` | record | Sort order for color identities (W,U,B,R,G). |
| `dynamicLegendHTML` | `string \| null` | (Optional) HTML for dynamic legend rendering. |

**Color helpers** map a percentage (0–100) to hex colors for: base (`getDiscreteColor`), hover (`getHighlightedColor`), and selected (`getSelectedColor`).

---

## Functions

### `createTimelineView`
```ts
createTimelineView(
  data: Array<Card>,
  containerId: string,
  isUpdate: boolean = false
): void
```
**Purpose**  
Build a **timeline grid** with a **sticky year axis**, **zoomable** time scale, **scrollable** list of set types (Y), interactive set squares, dynamic color legend, and a rectangular **brush** to toggle many sets.

**Data shaping**
- Parse `release_date` into `_parsedDate` and **group by `set_name`** → one entry per set with:
  - `name`, `releaseDate`, `setType`, `cardCount`.
  - Sets of `originalities`, `rarities`, `colorIdentities`, `numColorsPresent` (identity length incl. `0` for Colorless).
- Sort `uniqueSets` by `releaseDate` ascending.
- Compute **quintile thresholds** from `cardCount` and derive per‑set colors:
  - `baseColor`, `highlightColor`, `selectedColor` from `get*Color` helpers.
- Build **yearStats** and **setTypeStats** maps for cross‑view payloads and tooltips.
- Optionally filter to a subset of set types (`selectedSetTypes`), update Y domain accordingly.

**Layout & Scales**
- Sticky **top X‑axis** (`axisTop`) across full width.
- Plot area within a scroll container; SVG height adapts to number of set types.
- X: `scaleTime([minYear‑01‑01, maxYear‑12‑31])` → `[0, chartWidth]`.
- Y: `scalePoint(setTypes)` for horizontal grid rows.
- Each **set → 9×9** square at `(xScale(releaseDate)−2.5, yScale(setType)−5)`.

**Legend**
- DOM‑based legend showing quintile **max labels** and a **diagonal split** swatch indicating base/selected encodings, plus a **“Card Count”** caption.

**Interactions**
- **Hover** set square → tooltip with name, date, type, card count; temporarily fill with `highlightColor`; `emitSetHover(...)` with full sets for cross‑view.
- **Hover** set type label → tooltip with set count; `emitSetTypeHover({...})`.
- **Hover** year tick → tooltip with counts by set type; `emitLineYearHover({...})` via `highlightAllViewsForYear(year)`.
- **Click** set square → toggle selection in `activeTimelineSelections.sets`; `emitTimelineSetClick({...})`.
- **Click** set type label → toggles all sets of that type and emits `emitTimelineSetTypeClick({...})` with its aggregates.
- **Click** year tick → emits `emitLineChartClick({...})` for that year (selection displayed in the Line Chart).
- **Right‑click** year tick / set square / set type label → toggle **global filters** in `selectedFilters` via `updateState`.
- **Brush** over the grid → toggles all sets within the brush rectangle; emits `emitTimelineBrush` (empty clears via `emitClearTimelineBrush`).
- **Double‑click background** → `emitClearSelection()` and re‑render.
- **Zoom/Pan** (wheel/right‑drag/Ctrl‑drag) on the time axis → rescale X and reposition squares; sticky year ticks update accordingly; off‑screen squares are faded out.

**Side Effects**
- Appends wrapper elements (`div.chart-wrapper`, sticky X‑axis `svg`, scroll container, main `svg`), dynamic legend container, brush group, set squares, set type labels, grid lines, and an **“?”** info icon (div) with inline tooltip text.

---

### `updateTimelineSelections`
```ts
updateTimelineSelections(): void
```
**Purpose**  
Compute which **sets** are selected/hovered based on **activeTimelineSelections** and update square fills, year tick classes, and set type label classes.

**Logic**
- If **no sources** active → reset all squares to `baseColor`; clear `selected` classes.
- **Special case**: when only **Scatterplot** contributed (`setsFromScatterplot`), show **union** of those sets.
- Otherwise, evaluate four logical groups with **OR within each group** and **AND across groups**:
  1) **Alluvial**: any selected originality / rarity / `orig|rar` pair.  
  2) **Icicle**: any selected color identity (Nº of colors handled via identities).  
  3) **Year**: either none selected or set’s year ∈ selected years.  
  4) **Timeline (local)**: set name ∈ selected sets **or** its set type ∈ selected types.  
- **Union** the result with **Scatterplot** picks (`setsFromScatterplot`).

**Side Effects**
- Applies `.selectedHovered` class and `selectedColor` fill to matching squares; otherwise `baseColor`.
- Adds `.selected` class to year tick labels and set type labels when selected.

---

### Highlight functions
```ts
highlightTimelineSets(hoveredCards: Card[]): void
highlightTimelineSetsHoverOnly(card: Card): void
highlightTimelineSetsFromIcicle(rectInfo: { colorIdentities: Set<string> }): void
highlightTimelineSetsFromNumColors(numColors: number): void
highlightTimelineSetsFromYearInfo(payload: { year: Date }): void
highlightTimelineSetsFromAlluvialCategory(category: "Originality"|"Rarity", value: string): void
highlightTimelineSetsFromAlluvialLink(originality: string, rarity: string): void
clearTimelineHoverOnly(): void
```
**Purpose**  
Enable **hover‑only** highlights driven by other views (Icicle, Alluvial, Line, Scatterplot) or local hover. These toggle `.hover-temp` and use `highlightColor` without altering persistent selection state.

---

### Internal utilities
```ts
getClonedFilters(): Record<string, Set<string>>
updateYearTickStyles(): void
updateSetRectOpacity(): void
highlightAllViewsForSet(setName: string): void
highlightAllViewsForSetType(setType: string): void
highlightAllViewsForYear(year: string): void
clearAllViewsHoverOnly(): void
```
**Notes**
- `getClonedFilters()` duplicates `selectedFilters` for safe context‑menu edits.
- `highlightAllViewsFor*` functions emit the corresponding **hover** events with rich payloads (sets of originalities, rarities, identities, etc.).
- `updateYearTickStyles` / `updateSetRectOpacity` are local visual helpers for filters.

---

## Selection Logic
The Timeline composes **intersection** across logical groups (Alluvial, Icicle, Year, Timeline), with a final **union** of sets provided by the Scatterplot (`setsFromScatterplot`). When **no selections** exist, the grid returns to its **base** visual state. A **Scatterplot‑only** case is also supported and renders just those sets.

---

## Interactions
- **Hover**: on set, set type, or year tick → shows tooltip and emits cross‑view hover events.
- **Click**: on set → toggles that set; on set type → toggles all sets of that type; on year tick → signals a year click to the Line Chart.
- **Brush**: rectangular brush over the grid toggles set membership and emits a `TimelineBrush` payload.
- **Right‑click**: toggles corresponding global filters (Year / Set Names / Set Types).
- **Zoom/Pan**: wheel/right‑drag/Ctrl‑drag on the time axis; squares re‑position and fade when out of range.
- **Double‑click background**: clears Timeline‑local selections and broadcasts `emitClearSelection`.

---

## Events

**Emitted**
- `emitSetHover({...})`, `emitClearSetHover()` — hover bridge (set).
- `emitSetTypeHover({...})`, `emitClearSetTypeHover()` — hover bridge (set type).
- `emitTimelineSetClick({...})`, `emitTimelineSetTypeClick({...})` — selection bridges.
- `emitTimelineBrush(brushedSets)` / `emitClearTimelineBrush()` — brush lifecycle.
- `emitLineYearHover({...})` — year hover bridge.
- `emitLineChartClick({ year, ... })` — year click proxy to Line Chart.
- `emitClearSelection()` — dbl‑click background.

**Consumed (registered handlers)**  
- From **Alluvial**: `onAlluvialHover`, `onAlluvialClick`, `onAlluvialLink`, `onAlluvialLinkClick`, `onAlluvialLinkHover`, `onClearAlluvialHover`, `onClearAlluvialLinkHover`, `onClearAlluvialSelections`.
- From **Icicle**: `onRectHover`, `onIcicleClick`, `onIcicleNumClick`, `onClearRectHover`, `onClearIcicleSelections`, `onNumColorsHover`, `onClearNumColorsHover`.
- From **Line**: `onLineYearHover`, `onClearLineYearHover`, `onLineChartClick`, `onLineChartBrush`, `onClearLineChartBrush`.
- From **Scatterplot**: `onScatterplotCards`, `onClearScatterplotBrush`.
- Global: `onClearSelection`.

Each listener updates `activeTimelineSelections` and calls `updateTimelineSelections()`.

---

## Data & DOM Assumptions
- A container for `.Timeline` exists; `containerId` refers to a valid element.
- A global `#tooltip` element is present.
- D3 is globally available with `zoom`, `brush`, `scales`, and `axes`.
- CSS classes used: `.set-rect`, `.hover-temp`, `.selectedHovered`, `.year-tick-timeline`, `.set-type-label`.
- The container allows absolute positioning for the sticky axis and legend.

---

## Example
```js
import { createTimelineView } from "./Timeline.js";

createTimelineView(cards, "#timeline-container", false);
```
