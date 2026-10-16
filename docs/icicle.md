[← Back to main page](../)
## Icicle Chart
- **Click** a **group** (e.g., "2 Colors") to select or deselect all identities in that group.
- **Click** a **color identity** (e.g., "UR") to select or deselect only that identity.
- **Right-click** a group or identity to toggle the matching **global filter** (`Nº of Colors` or `Color Identity`).
- **Double-click** a rect to **zoom** into it, or back out.
- **Hover** to see a tooltip and highlight the matching cards in every view.
- **Mouse wheel** zooms horizontally around the cursor; **Ctrl + left-drag** pans.
- **Double-click** the background to clear all selections.

This module (`idioms/IcicleChart.js`) draws an **Icicle chart** grouping printings by **Nº of Colors** (depth 1) and **Color Identity** (depth 2). Rect width is the number of printings; color is the share of *original* printings.

## Contents
- [API](#api)
- [Data](#data)
- [Rendering](#rendering)
- [Selection and hover](#selection-and-hover)
- [Global filters](#global-filters)
- [Module state](#module-state)
- [DOM assumptions](#dom-assumptions)

---

## API
```ts
createIcicleChart(data: Card[], containerId: string, isUpdate: boolean = false): void
```
Builds (or rebuilds) the chart. The chart's zoom resets on every rebuild, because the layout depends on the data.

---

## Data
`icicleAggregate(cards)` (`core/aggregates.js`) groups printings into `Colorless`, `1 Color` … `5 Colors`, then by identity in WUBRG order (`"WU"`, `"WUBRG"`, `"Colorless"`). Each identity has:
- `value`: number of printings;
- `originalCount`, `reprintCount`, `functionalReprintCount`.

The chart then adds colors:
- Each identity gets a base, hover and selected color from its percentage of original printings, in five bins.
- Each group's colors are the average of its identities' colors.

---

## Rendering
- `d3.partition` laid out as horizontal bands, with identity labels rotated and hidden when they don't fit.
- **Tooltips** show the identity name with its guild/shard nickname (e.g., "White + Blue (Azorius)"), the total, and the original/reprint split.
- **Legend**: % original cards in five bins, each drawn as a diagonal split swatch (base / selected). The split appears only while something is selected.
- **Zoom:**
  - Double-click focuses on a node, and double-clicking it again resets.
  - The wheel zooms horizontally around the cursor, and Ctrl+drag pans.
  - A short click delay tells single clicks apart from double-clicks.

---

## Selection and hover
The chart uses the shared [Linking](linking.md) model:
- **Click** an identity rect: `toggleSelected("icicle", "identities", [name])`.
- **Click** a group rect: toggles all identities of that group together.
- **Hover:** `{identities: [name]}` for identity rects, `{numColors: [n]}` for group rects.
- **Painting** (`paintIcicle`):
  - An identity rect is selected or hovered if any selected or hovered printing has that identity.
  - A group rect is selected or hovered if any of its identities is.
  - Hover takes precedence (`.hover-temp`, `.selectedHovered`).

---

## Global filters
**Right-click** toggles `Nº of Colors` (group) or `Color Identity` (identity) in `selectedFilters`. Before applying, `validateFilterCombination` checks that the selected identities are compatible with the selected numbers of colors. If they aren't, it shows a popup and changes nothing.

---

## Module state
| Name | Purpose |
|---|---|
| `globalRects` | Current rect selection, used by `paintIcicle` |
| `clickTimer` | Separates single clicks from double-clicks |
| `isPanning`, `panStartX`, `panStartDomain`, `wasPanning` | Ctrl+drag panning (a pan suppresses the following click) |

---

## DOM assumptions
- The container exists and has a measurable size.
- A shared `#tooltip` element exists.
- CSS classes used: `.icicle-rect`, `.selectedHovered`, `.hover-temp`.
