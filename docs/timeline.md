[← Back to main page](../)
## Timeline
- **Click** a **set square** to add or remove that set from the selection.
- **Click** a **set type** label to toggle that type together with all its sets.
- **Click** a **year** label to add or remove that year (shared with the Line chart).
- **Right-click** a year, set or set type to toggle the matching **global filter**.
- **Brush** across the grid to toggle several sets at once (an empty brush clears the Timeline's set selection).
- **Mouse wheel** zooms the time axis; **right-drag** or **Ctrl + left-drag** pans.
- **Hover** any element to see a tooltip and highlight the matching cards in every view.
- **Double-click** the background to clear all selections.

This module (`idioms/TimelineView.js`) draws a scrollable grid of MTG **sets**, positioned by **release date** (X) and **set type** (Y). Each set is a small square colored by its **number of printings** (quintiles).

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
createTimelineView(data: Card[], containerId: string, isUpdate: boolean = false): void
```
Builds (or rebuilds) the view. On rebuilds (filter change, resize) the previous **zoom and vertical scroll position are restored**.

---

## Data
`timelineAggregate(cards)` (`core/aggregates.js`) returns one entry per set, sorted by the release date of its first printing:
- `name`, `releaseDate`, `setType`;
- `cardCount`: number of printings;
- the sets of originalities, rarities, identities and numbers of colors.

The view then:
- assigns base, hover and selected colors by quintile of `cardCount`;
- builds `yearTypeCounts` and `typeCounts` for the year and set-type tooltips.

---

## Rendering
- A sticky top X axis whose year labels are clickable (`.year-tick-timeline`).
- A scroll container holding the grid: one row per set type (`.set-type-label`), one 9×9 square per set (`.set-rect`).
- Zoom rescales the time axis and fades squares outside the visible range.
- **Legend:** card-count quintiles shown as diagonal split swatches (base / selected).
- A "?" help icon.

---

## Selection and hover
The view uses the shared [Linking](linking.md) model:
- **Set click:** toggles the set in `timeline.sets`.
- **Set-type click:** toggles the type in `timeline.setTypes`, plus all its sets (`toggleSetType`).
- **Brush:** toggles each brushed set individually.
- **Year tick click:** toggles the year in the shared `years` source.
- **Hover:** `{sets: [name]}`, `{setTypes: [type]}` or `{years: [year]}`.
- **Painting** (`paintTimeline`):
  - A square is selected or hovered if any selected or hovered printing is in that set; hover takes precedence.
  - Year ticks and set-type labels get the `.selected` class when they are selected in this view.

---

## Module state
| Name | Purpose |
|---|---|
| `uniqueSets` | Set entries currently drawn |
| `savedZoom`, `savedScrollTop` | Restored after a rebuild |
| `ignoreNextBrushEnd` | Brush bookkeeping |

---

## DOM assumptions
- The container exists and has a measurable size.
- A shared `#tooltip` element exists.
- CSS classes used: `.set-rect`, `.hover-temp`, `.selectedHovered`, `.year-tick-timeline`, `.set-type-label`, `.chart-container`.
