[← Back to main page](../)

# Application core: `script.js`, `state.js` and `core/`

This page explains how data flows through the app: from loading the dataset, through filtering, to rendering every view. Cross-view selections and hovers have their own page: [Linking](linking.md).

## Table of Contents
- [1. Module overview](#1-module-overview)
- [2. Loading and preparing the data](#2-loading-and-preparing-the-data)
- [3. Price attribute](#3-price-attribute)
- [4. Filtering (`core/filtering.js`)](#4-filtering-corefilteringjs)
- [5. Global state (`state.js`)](#5-global-state-statejs)
- [6. Rendering and updates (`script.js`)](#6-rendering-and-updates-scriptjs)
- [7. Unpriced cards](#7-unpriced-cards)
- [8. Per-view data preparation](#8-per-view-data-preparation)

---

## 1. Module overview

| Module | Role |
|---|---|
| `core/` | Pure data layer: no DOM, no d3, no global state. Runs in the browser and in Node tests. |
| `core/cards.js` | Derived per-card fields, computed once at load. |
| `core/filtering.js` | Filter index, memoized filtering and Filter Panel counts. |
| `core/scatter.js` | Per-card-name aggregation for the Scatterplot. |
| `core/aggregates.js` | Data steps of the Icicle, Alluvial, Timeline and Line charts. |
| `core/linking.js` | The shared selection model ([Linking](linking.md)). |
| `state.js` | Global state, subscriptions, filter save/load/share and small filter helpers. |
| `script.js` | Entry point: loads data, wires everything together, re-renders on change. |
| `idioms/Linking.js` | Browser glue for the selection model. |
| `idioms/ui.js` | Shared UI helpers: tooltip, info icon, palettes. |
| `idioms/*.js` | One module per view. |

`index.html` loads d3 and d3-sankey from a CDN and then only `script.js`, which imports everything else.

---

## 2. Loading and preparing the data

- `script.js` loads `data/dataset_card_details.json` once (102,309 printings; see [Data Processing](dataProcessing.md)).
- `prepareCards(cards)` (`core/cards.js`) attaches derived fields to every card, so views never recompute them:

  | Field | Meaning |
  |---|---|
  | `_ci` | Color identity key in WUBRG order (`"WU"`, `"WUBRG"`, `"Colorless"`) |
  | `_nc` | Number of colors in the identity (0–5) |
  | `_year` | Release year, read straight from the ISO date (timezone-independent) |
  | `_orig` | Lower-cased originality (`""` if missing) |
  | `_rar` | Lower-cased rarity (`""` if missing) |

  These fields are **non-enumerable**: they don't appear in JSON, in `{...card}` copies or in `Object.keys`. `prepareCards` also checks that `card.index` equals the card's position in the array, which the filter index relies on.
- Helpers: `identityKey(colors)` and `releaseYear(dateString)`.
  - Use `releaseYear` instead of `new Date(str).getFullYear()`. The latter gives the previous year for 1 January releases when the browser is west of UTC.

There is no browser-side cache. Building the filter index takes ~80 ms, which is less than reading a cache would. Older versions cached the index in the browser's OPFS storage; the app now deletes that stale file on start.

---

## 3. Price attribute

- `selectedPriceCurrency` ∈ {`eur`, `usd`, `tix`} and `selectedPriceSuffix` ∈ {`""`, `"_foil"`, `"_etched"`} define one active price field.
- **Always** use `getEffectivePriceAttribute(state)` (`state.js`), which returns e.g. `price_eur` or `price_usd_foil`. Never hard-code a price field.
- Charts only show cards with a **positive** price in the active attribute (prices are `0` when missing).

---

## 4. Filtering (`core/filtering.js`)

### The index
`createFilterEngine(cards)` builds `engine.index`: for each category, a map from value to a sorted `Int32Array` of card indices.

| Category | Values |
|---|---|
| `Originality` | `original`, `reprint`, `functional reprint` |
| `Keywords` | one entry per keyword |
| `Rarity` | `common`, `uncommon`, `rare`, … |
| `Supertypes`, `Types`, `Subtypes` | words of the type line, split on spaces and `/` |
| `Set Types`, `Set Names` | the card's set type and set name |
| `Year` | release year as a string |
| `Nº of Colors` | `colorless`, `1 color`, `2 colors`, … |
| `Color Identity` | lower-case identity key (`wu`, `colorless`) |

`engine.values(category)` and `engine.lookup(category, value)` read it.

### `engine.run(selectedFilters, priceAttr, mode)` → `{ cards, counts, mask }`
One call produces everything a filter change needs:
- `cards`: the filtered cards, in dataset order.
- `counts`: `Map(category → Map(value → count))`, the numbers shown in the Filter Panel.
- `mask`: a `Uint8Array` with 1 for each card in the filtered set (used by [Linking](linking.md)).

Semantics:
- **AND-OR** (default): AND across categories, OR within a category.
- **AND-AND**: AND across and within categories. Selected values that don't exist are ignored, unless none of them exist.
- `FreeTextSearch` terms match card names, case-insensitively; any one term is enough.
- Only cards with a positive price in `priceAttr` are kept.
- **Counts:**
  - In AND-OR mode, a category's counts ignore that category's own selection, so they show what you would get by adding or removing one of its values.
  - In AND-AND mode, all counts use the full filtered set.

How it works: each active category becomes one mask. A per-card counter of "how many active categories does this card pass" then yields both the filtered set and every count in a single pass, about 2–5 ms on the full dataset.

**Memoization:**
- `run()` remembers its last 16 results; identical inputs return the **same result object**.
- `script.js` relies on that identity to know when nothing relevant changed.
- `filterKey()` builds the stable key used for this.

`inferTypeCategory(engine, word)` decides whether a `t:word` search means a Supertype, Type or Subtype: it picks the category with the most cards containing that word.

---

## 5. Global state (`state.js`)

State keys:

| Key | Meaning |
|---|---|
| `selectedFilters` | `{ category: Set<string> }`, the **global filters** |
| `selectedPriceCurrency`, `selectedPriceSuffix` | Price settings (see §3) |
| `filterLogicMode` | `"AND-OR"` or `"AND-AND"` |
| `hoveredCards` | Contents of the Selected Cards drawer (set by the Scatterplot from the current selection) |
| `originalData`, `filterEngine`, `scatterPrep`, `groupedData` | Data handles; `groupedData` is the engine index |
| `selection` | Current [Linking](linking.md) selection (informational) |

API:
- `updateState(partial)`: applies the changes, calls `onChange(key, cb)` listeners for keys whose value changed, then every `subscribe(cb)` listener.
- `getState()`: a snapshot of the state, plus `onChange`.
- `emptyFilters()`, `cloneSelectedFilters()`: helpers for building a new `selectedFilters` value.
- `toggleGlobalFilter(category, value)`: adds or removes one global filter value. Used by right-click handlers in the charts.
- `saveFilterSettings()` / `loadFilterSettings(json)`, `generateFilterShareURL()` / `loadFiltersFromURL()`: filter presets and shareable links.

---

## 6. Rendering and updates (`script.js`)

### Start-up
1. Load the dataset, run `prepareCards`, and build the filter engine, the Scatterplot data prep and the linker (`initLinking`).
2. Apply filters from a shared URL (`?filters=…`), if present. They are stored in state, so they stay applied.
3. Run the engine once, then `setFilteredMask(result.mask)` so selections are evaluated on the filtered set.
4. Create the views:
   - `createIcicleChart`, `createFilterPanel` + `updateFilterPanel`, `createAlluvialChart`
   - `createIllegalDrawer`, `createHiddenDrawer`
   - `createTimelineView`, `createScatterPlot`, `createStackedLineChart`

### On every state change
A single `subscribe` callback runs the engine for the current state:
- **Same result object as before** (hover updates, drawer updates, …): nothing to do.
- **New result:**
  - `updateFilterPanel(result, selectedFilters)` patches counts and pills.
  - `setFilteredMask(result.mask)` re-evaluates the current selection and hover on the new filtered set.
  - The Icicle, Timeline, Line and Alluvial charts are re-rendered (`isUpdate = true`).
  - `updateScatterPlot` updates the Scatterplot in place.

Prepared Scatterplot data is cached per filter result and price attribute (last 8). Going back to an earlier filter state, such as clearing a filter, reuses it.

### Resize
Debounced (150 ms). After resizing stops, the charts are re-rendered once with the current result. The Filter Panel is not rebuilt.

---

## 7. Unpriced cards
`isCardPriceless(card)` in `script.js` selects cards with no positive price in **any** price field. They are shown only in the red **Unpriced Cards** drawer ([Drawers](hiddenDrawer.md)), prepared with the same per-name aggregation as the Scatterplot.

Cards that have a price in some field, but not in the currently selected one, are hidden from the charts and do **not** appear in that drawer.

---

## 8. Per-view data preparation

| Function | Used by | Output |
|---|---|---|
| `createScatterPrep(cards).prepare(cards, priceAttr)` | Scatterplot, drawers | One entry per card name: `avg_price`, earliest `release_date` (a `Date`), `all_sets`, `all_set_types`, `all_years`, `all_originalities`, `all_print_images`, `print_image_metadata`, `tooltip_image`. Skips digital cards, `memorabilia`/`alchemy`/`token` sets and set names containing Arena/Alchemy/Digital. |
| `icicleAggregate(cards)` | Icicle | Color groups → identities with counts and original/reprint split |
| `alluvialAggregate(cards, priceAttr)` | Alluvial | `{ nodes, links }` with counts and average prices |
| `timelineAggregate(cards)` | Timeline | One entry per set, sorted by release date |
| `lineAggregate(cards)` | Line chart | Per-year metrics (Gleemax excluded) |

**Units differ between views.** Icicle, Alluvial, Timeline, Line chart and Filter Panel counts are **printings**. The Scatterplot and drawers show **unique card names**.

All of these are covered by tests that compare them with the pre-refactor implementation ([Development](development.md)).
