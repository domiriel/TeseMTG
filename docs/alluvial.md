[← Back to main page](../)
## Alluvial Chart
- **Click** a node to select that originality or rarity; clicking several nodes on the same side combines them with OR.
- **Click** a link to select just that originality–rarity pair.
- **Right-click** a node to toggle the matching **global filter** (Originality or Rarity); right-click a link to toggle both.
- **Hover** a node or link to see its details and highlight the matching cards in every view.
- **Double-click** the background to clear all selections.

This module (`idioms/AlluvialChart.js`) draws an **Alluvial (Sankey) chart** linking **Originality** (left) to **Rarity** (right). Flows are sized by number of printings and colored by average price.

## Contents
- [API](#api)
- [Data](#data)
- [Rendering](#rendering)
- [Selection and hover](#selection-and-hover)
- [Module state](#module-state)
- [DOM assumptions](#dom-assumptions)

---

## API
```ts
createAlluvialChart(
  data: Card[],                       // filtered printings
  containerId: string,
  isUpdate: boolean = false,
  selectedPriceAttribute: string = "price_eur"
): void
```
Builds (or rebuilds) the chart into the container. `script.js` calls it on start-up, on every filter change and after resizing.

---

## Data
`alluvialAggregate(cards, priceAttr)` (`core/aggregates.js`) returns:
- `nodes`: one per originality and per rarity, with `avgPrice` in the selected price attribute.
- `links`: one per originality × rarity pair (including empty ones), with `value` (number of printings) and `avgPrice`.

Nodes are ordered by a fixed `customOrder` (original, reprint, functional reprint, common … bonus).

---

## Rendering
- `d3-sankey` layout; the left column is vertically centered.
- **Color:** average price is normalized over the visible range into five bins. Each node and link gets a **base**, **hover** and **selected** color (`getDiscreteColor`, `getHighlightedColor` and `getSelectedColor` from `idioms/ui.js`).
- **Legend** (`renderAlluvialLegend`): five price bins, each drawn as a diagonal split swatch of the base and selected colors.
- **"?" icon** (`addInfoIcon`): a short interaction guide.

---

## Selection and hover
The chart uses the shared [Linking](linking.md) model:

- **Clicks publish `alluvial.pairs`:**
  - Selected nodes expand to pairs: (selected originalities, or all if none) × (selected rarities, or all if none).
  - Links clicked individually are added on top.
  - Clicking a link that is selected only through its nodes turns those nodes into explicit links, minus the clicked one.
- **Hover** publishes `{originalities}` or `{rarities}` for nodes, and `{pairs}` for links.
- **Painting** (`paintAlluvial`):
  - A node is selected or hovered if any selected or hovered printing has that originality or rarity.
  - A link is selected or hovered if any such printing has that pair.
  - Hover takes precedence. The classes `.selectedHovered` and `.hover-temp` mirror the state.
- If another view clears the selection, the chart's local node and link choices are reset too.

---

## Module state
| Name | Purpose |
|---|---|
| `selectedOriginalities`, `selectedRarities` | Node selections (lower-case names) |
| `manuallySelectedLinks` | Links toggled individually (`"orig\|rar"`) |
| `knownOriginalities`, `knownRarities` | Node names in the current data (the "all" used when one side is empty) |

---

## DOM assumptions
- The container exists and has a measurable size.
- A shared `#tooltip` element exists (created by `script.js` if missing).
- `d3` and `d3-sankey` are loaded globally.
