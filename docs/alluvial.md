[← Back to main page](../)
## Alluvial Chart
  - Can click on a node to only focus in the links that contain the node  
  - Can click on a link to only focus in that link and the nodes that are part of it  
  - Can double click on a node to activate the corresponding filter (e.g., Rarity)  
  - Can double click on a link to activate the corresponding set of filters (e.g., Original Rare cards)

This module renders and coordinates an **Alluvial (Sankey) chart** linking **Originality** ↔ **Rarity** categories for MTG cards. It integrates with other coordinated views via a shared `Events.js` bus and the global app state.
  
## Contents
- [Imports](#imports)
- [Module State](#module-state)
- [Functions](#functions)
  - [createAlluvialChart](#createalluvialchart)
  - [updateAlluvialFromSelections](#updatealluvialfromselections)
  - [handleNodeClick](#handlenodeclick)
  - [renderAlluvialLegend](#renderalluviallegend)
  - [Color helpers](#color-helpers)
  - [Highlight APIs (exported)](#highlight-apis-exported)
  - [Internal utilities](#internal-utilities)
- [Selection Logic](#selection-logic)
- [Events](#events)
- [Data & DOM Assumptions](#data--dom-assumptions)
- [Example](#example)
  
---

## Imports
```
updateState, getState from ../state.js
Event bus functions from ./Events.js
```

---

## Module State

| Name | Type | Purpose |
|---|---|---|
| `customOrder` | `string[]` | Fixed order for sorting node labels. |
| `selectedOriginalities` | `Set<string>` | Node selections (left/originality). |
| `selectedRarities` | `Set<string>` | Node selections (right/rarity). |
| `activeAlluvialLinks` | `Set<string>` | Active links due to node selections (`"orig|rar"`). |
| `manuallySelectedLinks` | `Set<string>` | Links toggled by clicking the link paths. |
| `activeAlluvialSelections` | `Map<string, {source: string, originalities?: Set<string>, rarities?: Set<string>, numColors?: number}>` | Cross-view selections from icicle/timeline/line/scatterplot. |
| `infoTooltipText` | `string` | Help tooltip text displayed on the “?” icon. |

---

## Functions

### `createAlluvialChart`
```ts
createAlluvialChart(
  data: Array<Card>,
  containerId: string,
  isUpdate: boolean = false,
  selectedPriceAttribute: string = "price_eur"
): void
```

**Purpose**  
Build/refresh the Alluvial (Sankey) chart, compute category aggregates, wire up interactions, and render a price legend.

---

#### Data shaping
- Builds **left nodes** from **Originality** categories and **right nodes** from **Rarity** categories.  
- Computes **link weights** by counting cards per (`originality`, `rarity`) pair.  
- Aggregates per-node metrics: `count`, `avgPrice` (from `selectedPriceAttribute`), and sets for `years`, `colorIdentities`, and `numColors`.  
- Applies `customOrder` to keep label ordering consistent across renders.

#### Color encoding
- Normalizes `avgPrice` into 5 bins over `[minPrice, maxPrice]`.  
- Assigns **base**, **highlight**, and **selected** colors per bin.  


#### Layout
- Uses **d3-sankey** with container-based sizing (`width × height`).  
- Left column → Originality, right column → Rarity.  
- Links are cubic Bézier paths sorted by z-index (hovered > selected > base).  
- Labels stay outside their node columns and truncate for narrow layouts.  

#### Interactions
- **Click node**: toggles that node and recomputes `activeAlluvialLinks`.  
- **Click link**: toggles the link independently (stored in `manuallySelectedLinks`).  
- **Double-click node**: toggles the corresponding **global filter** (`Originality` or `Rarity`).  
- **Double-click link**: activates both related filters at once (e.g., “Original Rare”).  
- **Hover**: highlights node/link and emits `emitAlluvialHover` or `emitAlluvialLinkHover`.  
- **Background double-click**: clears all selections (`emitClearSelection`).  

#### Side Effects
- Creates `<svg>` containing nodes, links, labels, legend, and info tooltip.  
- Adds `<defs><pattern>` entries for legend stripes if `showPatterns = true`.  
- Registers event listeners in `Events.js` and broadcasts selection/hover events.

---

### `updateAlluvialFromSelections`
```ts
updateAlluvialFromSelections(): void
```

**Purpose**  
Combine Alluvial-local state (`activeAlluvialLinks`, `manuallySelectedLinks`) with cross-view selections (`activeAlluvialSelections` grouped by `source`) to compute the final highlighted links/nodes.  
Uses **intersection across sources**, with **scatterplot union**, and optional **intersection with Alluvial-local links** when present.

**Returns**  
`void`

**Side Effects**  
Updates DOM styles for nodes (`fill`) and links (`stroke`) to reflect selected/base states; resets to base when nothing is active.

---

### `handleNodeClick`
```ts
handleNodeClick(name: string, isOriginality: boolean): void
```

**Purpose**  
Toggle a node selection, reconcile manual link toggles, and keep node state consistent with remaining selected links.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `name` | `string` | Lower-cased node label. |
| `isOriginality` | `boolean` | `true` for left column, else right. |

**Side Effects**  
Updates `selectedOriginalities`/`selectedRarities`, `manuallySelectedLinks`, `activeAlluvialLinks`; calls `updateActiveAlluvialLinks()`, emits `emitAlluvialLink([...])`, and invokes `updateAlluvialFromSelections()`.

---

### `renderAlluvialLegend`
```ts
renderAlluvialLegend(
  svg: d3.Selection,
  chartWidth: number,
  margin: {top:number; right:number; bottom:number; left:number},
  chartHeight: number,
  svgWidth: number,
  priceRange: {min:number; max:number},
  priceAttr: string,
  showPatterns: boolean = true
): void
```

**Purpose**  
Draw a dynamic price legend with 5 bins. When `showPatterns` is `true`, each swatch shows a diagonal split between base and selected colors (conveying hover/selection encodings).

**Side Effects**  
Appends `g.legend` and `<defs><pattern>` entries to the `svg`.

---

### Color helpers
```ts
getDiscreteColor(percentage: number): string
getHighlightedColor(percentage: number): string
getSelectedColor(percentage: number): string
getNodeColor(price: number, minPrice: number, maxPrice: number): string
```

**Purpose**  
Map normalized values (0–100) to base/hover/selected colors. `getNodeColor` normalizes by `[minPrice,maxPrice]` then uses `getDiscreteColor`.

---

### Highlight functions 
```ts
highlightAlluvialElementsHoverOnly(card: Card): void
highlightAlluvialElementsFromIcicle(rectInfo: {originalities?: Set<string>, rarities?: Set<string>}): void
highlightAlluvialElementsFromNumColors(originalities?: Set<string>, rarities?: Set<string>): void
highlightAlluvialElementsHoverOnlyFromSet(originalities: Set<string>, rarities: Set<string>): void
highlightAlluvialElementsHoverOnlyFromYear(originalities: Set<string>, rarities: Set<string>): void
clearAlluvialHoverOnly(): void
```

**Purpose**  
Provide **hover-only** highlights initiated by other coordinated views.  
`clearAlluvialHoverOnly` removes only hover styles, preserving selected state.

**Side Effects**  
Temporarily toggles node `fill` and link `stroke` to `highlightColor` using `.hover-temp` class.

---

### Internal utilities
```ts
updateActiveAlluvialLinks(): void
buildLinkKeySet(originalities?: Set<string>, rarities?: Set<string>): Set<string>
hasActiveAlluvialSelections(): boolean
applyColorScale(selection: d3.Selection, attrName: string, priceRange: {min:number,max:number}): void
formatPriceLabel(priceAttr: string): string
formatPriceSymbol(attr: string): string
getMarginLeftOffset(screenWidth: number): number
highlightMatchingLinks(originalities?: Set<string>, rarities?: Set<string>): void
```

**Notes**
- `updateActiveAlluvialLinks` inspects `.link` paths and repopulates `activeAlluvialLinks` based on node selections.  
- `buildLinkKeySet` returns a Cartesian set of `"orig|rar"` keys.  
- `applyColorScale` assigns a normalized color to an SVG attribute.  
- `formatPriceLabel` and `formatPriceSymbol` prettify field names and symbols.  
- `highlightMatchingLinks` applies hover color to matching links.

---

## Selection Logic
Alluvial highlights result from **combining multiple selection sources**:

- **Local Alluvial** — Node selections expand to their incident links. Manual link toggles (`manuallySelectedLinks`) are respected even if their nodes are not selected.  
- **Cross-view selections** (`activeAlluvialSelections` grouped by `source`: icicle, timeline, line, scatterplot):  
  - **Intersection across sources**: a link is active only if it matches *every* non-empty source.  
  - **Scatterplot exception (union)**: scatterplot contributions are always **added**.  
- **Local gating**: when there are local selections (nodes or manual links), the final set is intersected with those; otherwise, cross-view results pass through unfiltered.

Nodes are styled as **selected** when they have at least one active link; otherwise revert to **base**. Links follow the same base/hover/selected palette used in the legend.

---

## Events

**Emitted**
- `emitAlluvialHover(category: "Originality"|"Rarity", name: string)` — Node hover bridge.  
- `emitAlluvialLinkHover({ originality: string, rarity: string })` — Link hover bridge.  
- `emitClearAlluvialHover()` — Clear hover bridge.  
- `emitAlluvialLink(linkKeys: string[])` — Broadcast current Alluvial link selection.  
- `emitClearSelection()` — Global clear (double-click background).  

**Consumed (listeners registered in this module)**
- Hover sources: `onHoverCard`, `onSetHover`, `onSetTypeHover`, `onLineYearHover`, `onNumColorsHover`, `onRectHover` (+ their `onClear*` counterparts).  
- Timeline: `onTimelineBrush`, `onTimelineSetClick`, `onTimelineSetTypeClick`, `onClearTimelineBrush`, `onClearTimelineSelections`.  
- Line chart: `onLineChartClick`, `onLineChartBrush`, `onClearLineChartBrush`.  
- Scatterplot: `onScatterplotCards`, `onClearScatterplotBrush`.  
- Icicle: `onIcicleClick`, `onIcicleNumClick`, `onClearIcicleSelections`.  
- Global clear: `onClearSelection`.  

Payloads typically carry `originalities: Set<string>` and `rarities: Set<string>`, or domain-specific keys like `year`, `name`, or `numColors`.

---

## Data & DOM Assumptions
- The container identified by `containerId` exists and has measurable size.  
- A `#tooltip` element is present for hover content.  
- D3 with `d3-sankey` is available.  
- CSS classes: `.selectedHovered`, `.hover-temp`, `.alluvial-hidden`, `.alluvial-visible` exist for styles.  

---

## Example
```js
import { createAlluvialChart } from "./AlluvialChart.js";

createAlluvialChart(cards, "#alluvial-container", false, "price_eur");
```
