
[← Back to main page](../)
## Alluvial Chart
  - Can click on a node to only focus in the links that contain the node
  - Can click on a link to only focus in that link and the nodes that are part of it
  - Can double click on a node to activate the corresponding filter(e.g. Rarity)
  - Can double click on a link to activate the correspondig set of filters (e.g. Original Rare cards)

  This module renders and coordinates an **Alluvial (Sankey) chart** linking **Originality** ↔ **Rarity** categories for MTG cards. It integrates with other coordinated views via a shared `Events.js` bus and a global app state.
  
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
  | `activeAlluvialLinks` | `Set<string>` | Active links due to node selections (`"orig\|rar"`). |
  | `manuallySelectedLinks` | `Set<string>` | Links toggled by clicking the link paths. |
  | `activeAlluvialSelections` | `Map<string, {source: string, originalities?: Set<string>, rarities?: Set<string>, numColors?: number}>` | Cross-view selections from icicle/timeline/line/scatterplot. |
  | `infoTooltipText` | `string` | Help tooltip for interactions. |
  
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
  Build/refresh the Alluvial (Sankey) chart, wire up interactions, and render a price legend.
  
  **Parameters**
  
  | Name | Type | Description |
  |---|---|---|
  | `data` | `Array<Card>` | Cards used to compute nodes/links and average prices. |
  | `containerId` | `string` | CSS selector for the chart container. |
  | `isUpdate` | `boolean` | Currently triggers a full redraw regardless. |
  | `selectedPriceAttribute` | `string` | Price field for color encoding (e.g., `price_eur`, `price_usd`). |
  

  
  **Returns**  
  `void`
  
  **Side Effects**  
  - Measures the container and creates/updates an `<svg>` with nodes, links, labels, legend and info tooltip.  
  - Computes category aggregates and avg prices; assigns `baseColor`, `highlightColor`, `selectedColor`.  
  - Wires hover/click/right-click/double-click interactions.  
  - Emits and consumes events via `Events.js`.  
  - On right-click: toggles global filters via `updateState({ selectedFilters })`.
  
  **Emits**  
  `emitAlluvialHover`, `emitAlluvialLinkHover`, `emitClearAlluvialHover`, `emitAlluvialLink`, `emitClearSelection`
  
  **Consumes**  
  `onHoverCard`, `onSetHover`, `onSetTypeHover`, `onLineYearHover`, `onNumColorsHover`, `onRectHover`, `onTimelineBrush`, `onTimelineSetClick`, `onTimelineSetTypeClick`, `onClearTimelineBrush`, `onLineChartClick`, `onLineChartBrush`, `onClearLineChartBrush`, `onScatterplotCards`, `onClearScatterplotBrush`, `onIcicleClick`, `onIcicleNumClick`, `onClearIcicleSelections`, `onClearTimelineSelections`, `onClearSetHover`, `onClearHover`, `onClearSelection`
  
  ---
  
  ### `updateAlluvialFromSelections`
  ```ts
  updateAlluvialFromSelections(): void
  ```
  **Purpose**  
  Combine Alluvial-local state (`activeAlluvialLinks`, `manuallySelectedLinks`) with cross-view selections (`activeAlluvialSelections` grouped by `source`) to compute the final highlighted set of links/nodes. Uses **intersection across sources**, with **scatterplot union**, and optional **intersection with Alluvial-local links** when present.
  
  **Parameters**  
  _None_
  
  **Returns**  
  `void`
  
  **Side Effects**  
  Updates DOM styles for nodes (`fill`) and links (`stroke`) to selected/base colors; resets to base when nothing is active.
  
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
  
  **Returns**  
  `void`
  
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
  Draw a dynamic price legend with 5 bins. When `showPatterns` is `true`, each swatch shows a 70/30 split between base and selected colors (conveying hover/selection encodings).
  
  **Returns**  
  `void`
  
  **Side Effects**  
  Mutates `svg`: appends `g.legend`, and `<defs><pattern>` entries when `showPatterns` is enabled.
  
  ---
  
  ### Color helpers
  ```ts
  getDiscreteColor(percentage: number): string
  getHighlightedColor(percentage: number): string
  getSelectedColor(percentage: number): string
  getNodeColor(price: number, minPrice: number, maxPrice: number): string
  ```
  **Purpose**  
  Map normalized values (0–100) to base/hover/selected colors. `getNodeColor` normalizes by `[minPrice,maxPrice]` then defers to `getDiscreteColor`.
  
  **Returns**  
  Hex color strings.
  
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
  Provide **hover-only** highlights initiated by other coordinated views. `clearAlluvialHoverOnly` removes only hover styles, preserving selected state.
  
  **Returns**  
  `void`
  
  **Side Effects**  
  Temporarily toggles node `fill` and link `stroke` to `highlightColor` with `.hover-temp` class.
  
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
  - `updateActiveAlluvialLinks` inspects DOM `.link` paths and repopulates `activeAlluvialLinks` based on node selections.  
  - `buildLinkKeySet` returns a Cartesian set of `"orig|rar"` keys.  
  - `applyColorScale` assigns an attribute (`fill`/`stroke`) using normalized colors.  
  - `formatPriceLabel`/`formatPriceSymbol` prettify price field names and currency symbols.  
  - `highlightMatchingLinks` is a hover-helper to set `stroke` → `highlightColor` for matching links.
  
  ---
  
  ## Events
  
  **Emitted**
  - `emitAlluvialHover(category: "Originality"|"Rarity", name: string)` — Node hover bridge.
  - `emitAlluvialLinkHover({ originality: string, rarity: string })` — Link hover bridge.
  - `emitClearAlluvialHover()` — Clear hover bridge.
  - `emitAlluvialLink(linkKeys: string[])` — Broadcast current Alluvial link selection.
  - `emitClearSelection()` — Global clear (dbl-click background).
  
  **Consumed (listeners registered in this module)**
  - Hover sources: `onHoverCard`, `onSetHover`, `onSetTypeHover`, `onLineYearHover`, `onNumColorsHover`, `onRectHover` (+ their `onClear*` counterparts).
  - Timeline: `onTimelineBrush`, `onTimelineSetClick`, `onTimelineSetTypeClick`, `onClearTimelineBrush`, `onClearTimelineSelections`.
  - Line chart: `onLineChartClick`, `onLineChartBrush`, `onClearLineChartBrush`.
  - Scatterplot: `onScatterplotCards`, `onClearScatterplotBrush`.
  - Icicle: `onIcicleClick`, `onIcicleNumClick`, `onClearIcicleSelections`.
  - Global clear: `onClearSelection`.
  
  Payloads typically carry `originalities: Set<string>` and `rarities: Set<string>`, or domain-specific keys like `year`, `name`, or `numColors` alongside those sets.
  
  ---
  
  ## Data & DOM Assumptions
  - Container identified by `containerId` exists and has measurable size.
  - A `#tooltip` element is present for hover content.
  - D3 with `d3-sankey` is available.
  - CSS classes: `.selectedHovered`, `.hover-temp`, `.alluvial-hidden`, `.alluvial-visible` exist to control styles.
  
  ---
  
  ## Example
  ```js
  import { createAlluvialChart } from "./AlluvialChart.js";
  
  createAlluvialChart(cards, "#alluvial-container", false, "price_eur");
  ```