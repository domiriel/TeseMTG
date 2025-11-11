[← Back to main page](../)

# Main Application Orchestration (`script.js`)

## Table of Contents
- [1. Load normalized data](#1-load-normalized-data)
- [2. Build and cache grouped indices](#2-build-and-cache-grouped-indices)
- [3. Global price attribute selection](#3-global-price-attribute-selection)
- [4. Centralized filtering pipeline](#4-centralized-filtering-pipeline)
- [5. Illegal / unpriced cards](#5-illegal--unpriced-cards)
- [6. State management & subscriptions](#6-state-management--subscriptions)
- [7. View initialization](#7-view-initialization)
- [8. Reactive cross-view updates](#8-reactive-cross-view-updates)
- [9. Responsive layout](#9-responsive-layout)

---

## 1. Load normalized data
- Reads `dataset_card_details.json`, which contains the preprocessed card schema described in the Data Processing section.  
- Clones this into `originalData` to preserve an immutable reference for all subsequent filtering operations.

---

## 2. Build and cache grouped indices
- Constructs `groupedData`: a set of lookup maps from attribute → cards for:
  - `Originality`, `Keywords`, `Rarity`
  - `Supertypes`, `Types`, `Subtypes`
  - `Set Types`, `Set Names`
  - `Year`, `Nº of Colors`, `Color Identity`
- Persists this structure in the browser’s **Origin Private File System (OPFS)** with a version tag.
- On load, attempts to restore from OPFS; if the version mismatches, rebuilds and overwrites the cache.
- These indices power fast filtering, the Filter Panel counts, and all cross-view selections.

---

## 3. Global price attribute selection
- Derives a single active price field via:
  - `selectedPriceCurrency` ∈ {`eur`, `usd`, `tix`}
  - `selectedPriceSuffix` ∈ {`""`, `"_foil"`, `"_etched"`}
- Exposes `getEffectivePriceAttribute(state)` so all visualizations and filters use the same price dimension.
- Applies `filterPriceOnly` to ensure plotted/linked cards have a valid, positive price in that active attribute.

---

## 4. Centralized filtering pipeline
- `selectedFilters` is the single source of truth for categorical filters used across the app.
- `filterData(...)`:
  - Applies filters in a consistent `filterApplicationOrder` (e.g. `FreeTextSearch`, `Set Names`, `Set Types`, `Keywords`, `Year`, etc.).
  - Supports two logic modes:
    - **AND-OR**: AND across categories, OR within each category.
    - **AND-AND**: AND across categories and AND within each category.
- `getFilteredData(...)`:
  - Wraps `filterData` + price filtering.
  - Short-circuits using cached results (`originalFilteredData`, `lastFilteredData`, `lastFilterInputs`) to avoid unnecessary recomputation.
  - Returns the canonical filtered dataset used by **all** views:
    - Scatterplot  
    - Timeline  
    - Line Chart  
    - Alluvial  
    - Icicle  
    - Filter Panel counts  
    - Hidden Drawer (Selected Cards)
- An internal `isFilterEmpty(...)` helper is used to detect “no filters” and fall back to the full priced dataset.

---

## 5. Illegal / unpriced cards
- `isCardPriceless(card)` checks if a card has no positive price in any tracked price field.
- `computeIllegalCards(data)` collects such cards.
- These are rendered separately in the **Unpriced Cards** drawer via `createIllegalDrawer` and are excluded from the main visual encodings, while preserving the same card schema.

---

## 6. State management & subscriptions
- `state.js` defines a shared state object, including:
  - `selectedFilters`, price settings, hover state (`hoveredCards`), `groupedData`, `filterLogicMode`, cached filtered snapshots, and `updateContext`.
- `updateState(partial)`:
  - Applies changes, notifies `onChange` listeners for specific keys, and triggers global subscribers unless `suppressGlobalNotify` is set.
- `getState()`:
  - Returns a snapshot plus an `onChange(key, cb)` helper for fine-grained subscriptions.
- `subscribe(cb)`:
  - Global subscription used by `init()` to react to any relevant state changes and re-render views.

---

## 7. View initialization
- After loading data and building/restoring `groupedData`, `init()`:
  - Reads any shared filters from the URL (`loadFiltersFromURL`).
  - Computes the initial `filtered` dataset via `getFilteredData(...)`.
  - Creates all coordinated views using that same dataset + schema:
    - `createFilterPanel(...)`
    - `createIcicleChart(...)`
    - `createAlluvialChart(...)`
    - `createTimelineView(...)`
    - `createStackedLineChart(...)`
    - `createScatterPlot(...)` (with `prepareScatterData(...)`)
    - `createHiddenDrawer(...)` (Selected Cards)
    - `createIllegalDrawer(...)` (Unpriced Cards)
  - Stores baseline snapshots (`originalFilteredData`, `originalSelectedFilters`, etc.) for smart caching and reset behavior.

---

## 8. Reactive cross-view updates
- A single `subscribe((state) => { ... })` block:
  - Listens for changes to filters, price settings, or logic mode.
  - Recomputes `filteredData` via `getFilteredData(...)`.
  - Updates:
    - Filter Panel (options + pills)
    - Icicle, Timeline, Line Chart, Alluvial (full re-render with `isUpdate=true`)
    - Scatterplot (`updateScatterPlot(...)` with new prepared data)
    - Hidden Drawer contents for the current `hoveredCards`
  - Skips heavy work on pure hover updates or when inputs haven’t materially changed.
- A dedicated `hoveredCards` listener:
  - Updates the Selected Cards drawer via `updateDrawer(...)` while using `isHoverUpdate` + `suppressGlobalNotify` to avoid triggering a full filter cycle.

---

## 9. Responsive layout
- On `window.resize`, recomputes the filtered dataset and re-renders all major views to fit the new dimensions, keeping visual encodings consistent with the current filters and price attribute.

---

