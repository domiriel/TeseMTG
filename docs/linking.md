[← Back to main page](../)

# Linking: selections and hovers across views

Every view shares one model of "what is selected" and "what is hovered", implemented in `core/linking.js` (pure logic) and `idioms/Linking.js` (browser glue). Views never talk to each other directly: they **publish** what the user did and **paint** themselves from the result.

This page covers the **local selections** (clicks, brushes, hovers). **Global filters** (Filter Panel, right-click on chart elements) are described in [Application core](stateManager.md#4-filtering-corefilteringjs).

## Contents
- [Concepts](#concepts)
- [How the views use it](#how-the-views-use-it)
- [API (`idioms/Linking.js`)](#api-idiomslinkingjs)
- [Adding a new view](#adding-a-new-view)
- [Core functions (`core/linking.js`)](#core-functions-corelinkingjs)

---

## Concepts

**Predicate.** A description of cards by attribute values. A card matches if **any** listed value of **any** field matches.

| Field | Values | Card attribute |
|---|---|---|
| `identities` | `"WU"`, `"Colorless"`, … | color identity (WUBRG order) |
| `numColors` | `0`–`5` | number of colors |
| `originalities` | `"original"`, `"reprint"`, `"functional reprint"` | originality |
| `rarities` | `"common"`, `"rare"`, … | rarity |
| `pairs` | `"original\|rare"` | originality and rarity together |
| `sets` | set names | set |
| `setTypes` | lower-case set types | set type |
| `years` | numbers, e.g. `2019` | release year |
| `names` | card names | name |

**Selection.** A map from *source* to predicate, holding at most one predicate per source:

| Source | Set by | Fields |
|---|---|---|
| `alluvial` | Alluvial node and link clicks | `pairs` |
| `icicle` | Icicle clicks | `identities` |
| `timeline` | Timeline set clicks, set-type clicks, brush | `sets`, `setTypes` |
| `years` | Line chart clicks/brush and Timeline year ticks | `years` |
| `scatter` | Scatterplot clicks/brush and the Filter Panel card search | `names` |

**Combination rules:**
- **AND across sources**: a card must satisfy every source.
- **OR within a source**: it must match at least one of that source's values.
- The `scatter` source is the exception. Cards picked by hand are **added on top** of the rest.

**Evaluated on printings.** A selection is evaluated on the individual printings in the current filtered set.
- "Set *Dominaria* AND year *2019*" means printings that are in Dominaria **and** were released in 2019. It does not mean "views that contain some Dominaria card and some 2019 card".
- When global filters change, the same selection is re-evaluated on the new filtered set.

**Hover.** A single transient predicate, plus the source that produced it.

**Summary.** What views paint from: counts of the selected (or hovered) printings per attribute value.
- `summary.has("sets", "Dominaria")` says whether any selected printing is in Dominaria.
- `summary.get("years")` returns a `Map(year → count)`.
- `summary.active` is true when anything is selected; `summary.count` is the number of printings.

---

## How the views use it

| View | Publishes | Paints selected / hovered when… |
|---|---|---|
| **Icicle** | Click identity → toggle `icicle.identities` (a group click toggles all its identities). Hover → `{identities}` or `{numColors}`. | identity rect: summary has that identity; group rect: any of its identities |
| **Alluvial** | Node clicks: (selected originalities, or all) × (selected rarities, or all) → `alluvial.pairs`. Link clicks toggle single pairs on top. Hover → `{originalities}`, `{rarities}` or `{pairs}`. | node: summary has that originality/rarity; link: summary has that pair |
| **Timeline** | Set click toggles `timeline.sets`; a set-type click toggles the type and all its sets; a brush toggles each brushed set; a year tick toggles `years`. Hover → `{sets}`, `{setTypes}` or `{years}`. | set square: summary has that set; year ticks and type labels show what is selected in this view |
| **Line chart** | Point click / brush toggles `years`. Hover → `{years}`. | grey dashed line at each selected year; yellow line and highlighted points at hovered years |
| **Scatterplot** | Dot click / brush toggles `scatter.names`. Hover → `{names}`. | dot: summary has that card name |
| **Selected Cards drawer** | "Clear All" clears everything | lists the selected Scatterplot cards (`hoveredCards` in state) |
| **Filter Panel** | Card search toggles `scatter.names`; "Clear Selections" clears everything | — |

**Shared conventions:**
- Double-clicking empty space in any chart clears the whole selection.
- Hover colors take precedence over selection colors.
- When zoomed out, the Scatterplot only highlights the dots it is drawing (one per small grid cell). The exception is a hover on a Timeline set or a single card, which also reveals that set's or card's hidden dots.

---

## API (`idioms/Linking.js`)

```js
// Selection
toggleSelected(source, field, values)   // toggle values; several values: all removed if all present, else all added
setSelected(source, predicate | null)    // replace a source's predicate (null/empty removes it)
clearSelection(source?)                  // one source, or everything
getSourcePredicate(source)               // what a source currently contributes

// Hover
setHover(source, predicate)
clearHover()

// Painting
onSelectionChange((summary, selection) => …)
onHoverChange((summary, hover) => …)
getSelectionSummary(), getHoverSummary()

// Wiring (script.js)
initLinking(cards, filterEngine)
setFilteredMask(mask)                    // after every filter change
```

Every change calls the subscribed paint functions synchronously. In the page, `window.__linking` exposes the current selection for debugging.

---

## Adding a new view

1. Render your elements.
2. On click or brush, call `toggleSelected("myview", field, values)` or `setSelected(...)`.
3. On hover, call `setHover("myview", predicate)`; on mouse out, call `clearHover()`.
4. Write a `paint()` that reads `getSelectionSummary()` and `getHoverSummary()` and styles each element.
5. Register it with `onSelectionChange(paint)` and `onHoverChange(paint)`, and call it at the end of rendering.

Every other view will react to your selections, and yours to theirs. No other file needs to change.

If your elements need an attribute that isn't in the field table above, add it to `FIELDS` and `listsFor` in `core/linking.js`, along with a test in `tests/linking.test.mjs`.

---

## Core functions (`core/linking.js`)

`createLinker(cards, filterEngine)` returns:
- `predicateMask(predicate, filteredMask)`: printings matching a predicate, using the filter index (fast typed-array operations).
- `selectionMask(sources, filteredMask)`: the combined selection, or `null` when nothing is selected.
- `summarize(mask)`: a lazily computed summary (each field is counted the first time it is asked for).

`tests/linking.test.mjs` checks every predicate field, the AND/OR rules, the Scatterplot union and the summaries against a brute-force evaluation over all cards. `tests/e2e/linking.e2e.mjs` checks the same rules end to end in the browser.
