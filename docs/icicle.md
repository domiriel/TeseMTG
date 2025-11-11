[← Back to main page](../)
## Icicle Chart
- Click a **group** (e.g., “2 Colors”) to toggle select/deselect all identities in that group.
- Click a **color identity** (e.g., “UR”) to toggle only that identity.
- Right-click a **group** or **identity** to toggle the corresponding **global filter**.
- Double-click a rect to **zoom in/out** within the icicle (focus).
- Hover shows a tooltip and sends **hover highlights** to other charts.
- Mouse wheel to **zoom horizontally** around the cursor.
- **Ctrl + left-drag** to **pan** horizontally.
- Double-click background to **clear Icicle selections**.

This module renders and coordinates an **Icicle chart** that groups MTG cards by **Nº of Colors** (depth 1) and **Color Identity** (depth 2). It integrates with other coordinated views via a shared `Events.js` bus and the global app state.

## Contents
- [Imports](#imports)  
- [Module State](#module-state)  
- [Functions](#functions)  
  - [createIcicleChart](#createiciclechart)  
  - [updateIcicleSelections](#updateicicleselections)  
  - [renderLegend](#renderlegend)  
  - [clicked (zoom/focus)](#clicked-zoomfocus)  
  - [clickedFilter (right-click → global filters)](#clickedfilter-rightclick--global-filters)  
  - [Color helpers](#color-helpers)  
  - [Hover/Highlight APIs (exported)](#hoverhighlight-apis-exported)  
  - [Internal utilities](#internal-utilities)  
- [Selection Logic](#selection-logic)  
- [Events](#events)  
- [Data & DOM Assumptions](#data--dom-assumptions)  
- [Example](#example)

---

## Imports
```
updateState, getState from ../state.js
Events bus (emit*/on*) from ./Events.js
```

---

## Module State

| Name | Type | Purpose |
|---|---|---|
| `globalRects` | `d3.Selection \| null` | Cached selection of rects for quick highlight updates. |
| `clickTimer` | `number \| null` | Debounce single vs. double click. |
| `activeSelections` | object of Sets/Maps | Aggregates selections from all views (see below). |
| `activeSelections.fromAlluvialOriginality` | `Set<string>` | Selected originalities coming from Alluvial node clicks. |
| `activeSelections.fromAlluvialRarity` | `Set<string>` | Selected rarities from Alluvial. |
| `activeSelections.fromAlluvialLinkPairs` | `Set<string>` | Selected Alluvial link pairs `"orig|rar"`. |
| `activeSelections.fromIcicleIdentity` | `Set<string>` | Selected identities from Icicle clicks. |
| `activeSelections.fromIcicleColors` | `Set<number>` | Selected groups by number of colors (0–5). |
| `activeSelections.fromYears` | `Set<string>` | Years from Line chart click/brush. |
| `activeSelections.colorIdentitiesFromTimelineSets` | `Map<string, Set<string>>` | Timeline set→identities toggles. |
| `activeSelections.colorIdentitiesFromTimelineSetsTypes` | `Map<string, Set<string>>` | Timeline set-type→identities toggles. |
| `activeSelections.colorIdentitiesFromScatterplot` | `Set<string>` | Identities brushed/hovered from Scatterplot. |

**Info tooltip copy** is defined inline (`infoTooltipText`) and displayed on the “?” icon.

---

## Functions

### `createIcicleChart`
```ts
createIcicleChart(
  data: Array<Card>,
  containerId: string,
  isUpdate: boolean = false
): void
```

**Purpose**  
Build/refresh the Icicle chart, compute hierarchy by **Nº of Colors → Color Identity**, wire interactions, and render a diagonal-split legend (base/selected color).

**Data shaping**
- Groups cards into: `Colorless`, `1 Color`, `2 Colors`, `3 Colors`, `4 Colors`, `5 Colors`.
- Within each group, identities are canonicalized to **W,U,B,R,G** sort (e.g., “UR”, “WUB”); `Colorless` is a single identity.
- Accumulates per-node: `value`, `originalCount`, `reprintCount`, `functionalReprintCount`, plus sets for `originalities`, `rarities`, and `years`.

**Color encoding**
- Depth-2 identities receive a **base**, **hover**, and **selected** color based on the percentage of original cards in the total amount for each group.
- Depth-1 groups average their children’s RGB to derive base/hover/selected fills.

**Layout**
- Builds a d3 partition on `[chartWidth, chartHeight]`.
- Uses **depth bands** (levelHeight) and horizontal spans per node (`x0–x1`).
- Labels rotate `-90°` for depth-2 identities when visible.

**Interactions**
- **Click**:
  - Depth 1 (group): toggles the group in `fromIcicleColors` and all its identities in `fromIcicleIdentity`. Special case: groups with a single identity (`Colorless` and `5 Colors`) toggle the identity directly.
  - Depth 2 (identity): toggles only that identity; also toggles its `numColors` group except for colorless/5-color edge cases.
  - Emits `emitIcicleNumClick` (group) or `emitIcicleClick` (identity) with payloads for cross-view highlighting.
- **Right-click**: toggles **global filters** in app state (`"Nº of Colors"` or `"Color Identity"`) with validity check (`validateFilterCombination`). On invalid combos, shows `showPopup(...)`.
- **Double-click**: zoom/focus into a node (or reset if already focused).
- **Hover**: shows tooltip (counts + %Original), sets `.hover-temp` color, and calls `highlightAllViewsForRect(...)` → emits hover events.
- **Wheel**: horizontal zoom around cursor.
- **Ctrl + left-drag**: horizontal panning (suppresses the following click).
- **Double-click background**: clears Icicle selections (`emitClearSelection` + `updateIcicleSelections`).

**Side Effects**
- Appends `<svg>` with groups, clipPath, legend, and an info icon.
- Mutates rect fills (`fill`) and classes (`.selectedHovered`, `.hover-temp`).
- Registers all event listeners with `Events.js`.

---

### `updateIcicleSelections`
```ts
updateIcicleSelections(): void
```

**Purpose**  
Compute which rects are selected/hovered based on **activeSelections** (from Alluvial, Icicle, Timeline, Line, Scatterplot). Applies styles to depth-2 identities and promotes selection to depth-1 groups if any child is selected.

**Returns**  
`void`

**Side Effects**
- Iterates `.icicle-rect` nodes, distinguishes depth-1 vs depth-2.
- Applies `selectedColor` to selected rects; base `color` otherwise.
- Special path when **only Scatterplot is active** (treats it as a standalone highlight).

---

### `renderLegend`
```ts
renderLegend(
  svg: d3.Selection,
  chartWidth: number,
  margin: { top:number; right:number; bottom:number; left:number },
  containerHeight: number,
  rectDimensions: number,
  legendFontSize: number
): void
```

**Purpose**  
Draw a vertical legend showing %Original bins (100 → 0). Each swatch uses a **diagonal split** pattern (selected/base) to reflect the two encodings used in the chart.

**Side Effects**  
Appends `g.legend` and a set of `<pattern>` definitions used as fills.

---

### `clicked` (zoom/focus)
```ts
clicked(event: PointerEvent, p: d3.HierarchyRectangularNode, doubleClickFlag = false): void
```

**Purpose**  
Focus/defocus the partition around a node (or reset to root). Updates `xScale` domain and recomputes rect and label positions/opacities with transitions.

---

### `clickedFilter` (right-click → global filters)
```ts
clickedFilter(event: PointerEvent, d: d3.HierarchyRectangularNode): void
```

**Purpose**  
Right-click to toggle the corresponding **global filter** in `selectedFilters`:
- Depth 1 → `"Nº of Colors"`
- Depth 2 → `"Color Identity"`

Validates combinations with `validateFilterCombination` so identities align with chosen groups.

---

### Color helpers
```ts
getColorFromPercentage(percentage: number, scale = colorScale): string
hexToRgb(hex: string): { r:number; g:number; b:number }
rgbToHex(r:number, g:number, b:number): string
```

**Purpose**  
Discrete binning (five bins) of %Original to hex fills, plus conversions and RGB averaging for group colors.

---

### Highlight functions 
```ts
function highlightIcicleRect(hoveredCards: Card[]): void
function highlightIcicleRectHoverOnly(card: Card): void
function highlightIcicleRectHoverOnlyFromSet(colorIdentities: Set<string>, numColors: Set<number>): void
function highlightIcicleRectHoverOnlyFromYear(colorIdentities: Set<string>, numColors: Set<number>): void
function highlightIcicleRectHoverOnlyFromAlluvial(category:string, value: string): void
function hhighlightIcicleRectHoverOnlyFromAlluvialLink(originality:string, rarity: string): void
function clearAllViewsHoverOnly(): void
```

**Purpose**  
Allow other views (cards, sets, year brushes) to trigger **hover-only** highlights in the Icicle:
- `highlightIcicleRect` maps a list of cards → identity keys, toggling depth-2 rects.
- The `HoverOnly*` variants set `.hover-temp` and `highlightColor` without altering selection state.
- `clearIcicleHoverOnly()` removes hover-only styling while preserving selected state.

---

### Internal utilities
```ts
function hasActiveIcicleSelections(): boolean
function highlightAllViewsForRect(rectName: string): void
function validateFilterCombination(filters: Record<string, Set<string>>): boolean
function formatColorIdentityDisplay(name: string): string
```

**Notes**
- **Cross-view hover bridges**: `highlightAllViewsForRect` emits either `emitIcicleRectHover` (depth-2) or `emitNumColorsHover` (depth-1).
- **Filter validation** ensures `"Color Identity"` entries are compatible with the selected `"Nº of Colors"` buckets.

---

## Selection Logic
The Icicle applies a **composed selection** over multiple sources:

- **Alluvial**: a rect matches if it has *any* of the selected originalities, rarities, or link pairs. If Alluvial selections are empty, this term passes.
- **Icicle (local)**: rect identity must be included if any local identity selections exist; otherwise this term passes.
- **Timeline (sets & set types)**: if any are toggled, identity must be in at least one of their identity sets (handles `""` for Colorless).
- **Years (Line chart)**: if any years are selected, rect must contain at least one of them.
- **Scatterplot**: acts as an **additive union**—matching identities are selected regardless of other terms. There’s also a special **only-scatterplot-active** mode that highlights by the scatterplot set alone.

Depth-1 groups adopt **selected** styling if **any child** identity is selected.

---

## Events

**Emitted**
- `emitIcicleClick({ colorIdentity, originalities, rarities, numColors })` — identity-level click.
- `emitIcicleNumClick({ numColors, originalities, rarities, colorIdentities, children })` — group-level click.
- `emitIcicleRectHover({ name, isGroup, colorIdentities, numColors, originalities, rarities, years })` — identity hover bridge.
- `emitNumColorsHover({ numColors, originalities, rarities, years })` — group hover bridge.
- `emitClearRectHover()`, `emitClearNumColorsHover()` — clear hover bridges.
- `emitClearSelection()` — double-click background.

**Consumed (listeners registered in this module)**
- **Cards/Set/Year hovers**: `onHoverCard`, `onSetHover`, `onSetTypeHover`, `onLineYearHover`, and their `onClear*` counterparts.
- **Alluvial**: `onAlluvialHover`, `onAlluvialClick`, `onAlluvialLinkClick`, `onAlluvialLink`, `onAlluvialLinkHover`, `onClearAlluvialHover`, `onClearAlluvialLinkHover`, `onClearAlluvialSelections`.
- **Line chart**: `onLineChartClick`, `onLineChartBrush`, `onClearLineChartBrush`, `onClearLineYearHover`.
- **Timeline**: `onTimelineBrush`, `onTimelineSetClick`, `onTimelineSetTypeClick`, `onClearTimelineBrush`, `onClearTimelineSelections`.
- **Scatterplot**: `onScatterplotCards`, `onClearScatterplotBrush`.
- **Global**: `onClearSelection`.

---

## Data & DOM Assumptions
- `containerId` exists and has measurable size.
- A `#tooltip` element is present for hover content.
- D3 (with `d3.partition`) is available.
- CSS classes used: `.icicle-rect`, `.selectedHovered`, `.hover-temp`.
- The root container allows mouse events for wheel/pan/drag.

---

## Example
```js
import { createIcicleChart } from "./IcicleChart.js";

createIcicleChart(cards, "#icicle-container", false);
```