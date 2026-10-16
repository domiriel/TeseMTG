[← Back to main page](../)
## Scatterplot
- **Hover** a dot to see card details and highlight that card in every view.
- **Click** a dot to add or remove that card from the selection.
- **Brush** (drag on empty space) to toggle every card inside the box.
- **Mouse wheel** zooms; **right-drag** or **Ctrl + left-drag** pans.
- Use the **dropdown** under the X axis to switch between **Average Price** and **Release Date**.
- **Double-click** the background to clear all selections.

This module (`idioms/Scatterplot.js`) plots **one dot per card name** by **Average Price** (log scale) or **first Release Date** (X) against **Complexity** (Y). Dot color is the card's **EDHREC rank** bucket; unranked cards are hollow circles.

## Contents
- [API](#api)
- [Data](#data)
- [Rendering](#rendering)
- [Zoom and sampling](#zoom-and-sampling)
- [Interaction](#interaction)
- [Selection and hover](#selection-and-hover)
- [Module state](#module-state)
- [Testing hook](#testing-hook)

---

## API
```ts
createScatterPlot(
  data: ScatterCard[],              // from scatterPrep.prepare(...)
  containerId: string,
  isUpdate?: boolean,
  selectedPriceAttribute?: string,
  savedTransform?: d3.ZoomTransform | null
): void

updateScatterPlot(data: ScatterCard[], selectedPriceAttribute?: string): void
findScatterCard(name: string): ScatterCard | null   // used by the Filter Panel card search
getTooltipImageMetadata(card): { image, set_name, set_type } | null
```
- `createScatterPlot` runs once at start-up.
- `updateScatterPlot` runs on every filter change or resize. It updates in place and keeps the zoom.

---

## Data
`createScatterPrep(allCards).prepare(filteredCards, priceAttr)` (`core/scatter.js`) aggregates printings by card name. See [Application core](stateManager.md#8-per-view-data-preparation) for the fields it produces and the cards it skips.

`script.js` caches the result per filter result and price attribute. On top of that, the view adds `__year` (first release year), `__ci` (identity key) and screen positions to each entry.

---

## Rendering
Dots are drawn on **two `<canvas>` layers** instead of thousands of SVG circles:

| Layer | Contains | Redrawn when |
|---|---|---|
| **Base** | every drawn dot (one batched path per color) plus selection outlines (`#6a708a`) | data, zoom or selection change |
| **Overlay** | hover outlines (`#d89313`), plus hidden dots revealed by a hover | hover changes |

- All redraws are coalesced into one per animation frame.
- A full base redraw takes ~3–10 ms; a hover repaint ~1–2 ms.
- **Axes, legend, "?" icon, brush and zoom capture** stay in an SVG on top of the canvases.
- **Hover and click hit-testing** use a `d3.quadtree` over the drawn dots, rebuilt lazily after a redraw.

---

## Zoom and sampling
- Zooming rescales copies of the base scales (`getZoomedScales`). Dot radius grows with zoom (`dotSizeByZoom`).
- **Zoomed out** (scale < 6), only one "key" dot per 6 px grid cell is drawn (`tagZoomKeyPoints`) to reduce overdraw; zoomed in, every dot is drawn.
- Key dots are recomputed when the data or the X metric changes.

---

## Interaction
- **Hover:** shows a rich tooltip (card image, attributes, sets, number of prints) on a color-identity background, and publishes the hover.
- **Click:** a press-and-release on the same dot toggles that card. A press that starts on a dot never starts a brush.
- **Brush:** toggles each card inside the box individually; an empty brush clears the Scatterplot's own picks.
- **X metric dropdown:** switches between log price and time scales, then re-tags key dots and redraws.

---

## Selection and hover
The plot uses the shared [Linking](linking.md) model:
- **Click / brush:** the `scatter` source (`names`). These picks are **added on top** of selections from other views.
- **Hover a dot:** `setHover("scatter", { names: [name] })`.
- **Selected dots:** those whose name appears in the selection summary. `syncSelection` also publishes the matching entries as `hoveredCards`, which fills the Selected Cards drawer.
- **Hovered dots:**
  - Hovers from other views highlight matching dots **that are currently drawn**.
  - Hovers of a Timeline set or a single card also reveal that set's or card's hidden dots.

---

## Module state
| Name | Purpose |
|---|---|
| `plot` | Scales, sizes, canvases/contexts, axis updater, quadtree |
| `actualFIlteredData` | Entries currently plotted |
| `xMetric` | `"avg_price"` or `"release_date"` |
| `currentZoomTransform`, `currentZoomLevel` | Current zoom |
| `selectedNames`, `hoverNames`, `ownHoverName` | What the canvases highlight |

---

## Testing hook
The container element exposes `__scatter`:
- `count()`: number of plotted entries;
- `points()`: `{name, ci, x, y, shown, selected, hover}` per entry;
- `lastDrawMs()`: duration of the last base redraw.

The end-to-end tests use it, because canvas dots aren't DOM elements.
