[← Back to main page](../)
## Line Chart
- **Hover** a year point to see that year's metrics and highlight its cards in every view.
- **Click** a year point to add or remove that year from the selection.
- **Right-click** a year point to toggle a **global Year filter**.
- **Brush** horizontally to toggle several years at once (an empty brush clears the year selection).
- **Mouse wheel** zooms; **right-drag** or **Ctrl + left-drag** pans.
- **Double-click** the background to clear all selections.

This module (`idioms/LineChart.js`) draws three stacked panels over years: **Functional Reprints**, **Avg. Complexity** and **Avg. Mana Value**. They share one X axis and one zoom.

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
createStackedLineChart(data: Card[], containerId: string, isUpdate: boolean = false): void
```
Builds (or rebuilds) the chart. On rebuilds (filter change, resize) the previous **zoom/pan is restored**.

---

## Data
`lineAggregate(cards)` (`core/aggregates.js`) returns one entry per release year, sorted:
- `year`: a `Date` on 1 January;
- `reprints`: number of functional reprints;
- `avgComplexity`, `avgCMC`;
- the sets of originalities, rarities, color identities and numbers of colors present that year.

The outlier card "Gleemax" is excluded.

---

## Rendering
- Each panel has a line, one point per year (`circle.data-point`, `data-year` attribute) and its own Y axis. Only the bottom panel shows year labels.
- A shared vertical guide line follows the pointer across all panels.
- `d3.zoom` rescales the X axis for every panel and re-places the selection and hover guide lines.

---

## Selection and hover
The chart uses the shared [Linking](linking.md) model. The **`years` source** is shared with the Timeline's year ticks.
- **Click** toggles one year; a **brush** toggles each year in its range (`toggleYears`). An empty brush calls `clearSelection("years")`.
- **Hover** a point: `setHover("line", { years: [year] })`.
- **Painting** (`paintLineChart`):
  - A **grey dashed line** at every year containing selected printings.
  - A **yellow dashed line** and highlighted points (`.hover-temp`) at every year containing hovered printings.

---

## Module state
| Name | Purpose |
|---|---|
| `lineChart.xScale` | Base X scale of the current chart |
| `lineChart.zoom` | Current zoom transform (restored after a rebuild) |
| `lineChart.marginLeft`, `lineChart.y1`, `lineChart.y2` | Geometry for the guide lines |
| `brushing`, `ignoreNextBrushEnd` | Brush bookkeeping |

---

## DOM assumptions
- The container exists and has a measurable size.
- A shared `#tooltip` element exists.
- CSS classes used: `.data-point`, `.hover-temp`, `.hover-line`, `.selected-hover-line`, `.highlight-hover-line`.
