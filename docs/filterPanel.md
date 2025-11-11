# Filter Panel Module

This module renders and manages the Filter Panel UI for the MTG collections dashboard. Unlike the chart modules, it focuses on **UI controls, state orchestration, and event wiring** rather than data shaping. It exposes two entry points:

- `createFilterPanel(data, filteredCards, containerId, selectedFiltersFromState, isUpdate = false)`
- `updateFilterPanel(originalData, filteredCards, selectedFilters, containerId = ".FilterPanel")`

---

## Purpose & Responsibilities

- Display **filter categories** and options with live counts.
- Provide **search** utilities:
  - Card picker (autocomplete / datalist) → highlights/locks cards across views.
  - Free-text / Scryfall-style queries (`t:`, `kw:`, `r:`, `s:`, `st:`).
  - “Search set name” → scroll to set in Timeline.
- Manage **price controls** (currency + suffix) and **filter logic** (`AND-OR` vs `AND-AND` within category).
- Offer **quality-of-life** actions: clear filters, clear selections, save/load/share filter presets.
- Reflect selection state via **pills**, option highlighting, and disabling of zero-count options.
- Coordinate with global state and other views via the shared event bus.

---

## Dependencies

```js
import {
  updateState, getState, saveFilterSettings, loadFilterSettings,
  generateFilterShareURL, resetState
} from "../state.js";

import {
  filterData, filterPriceOnly, getEffectivePriceAttribute, isFilterEmpty
} from "../script.js";

import { emitCardSearch, emitClearSelection } from "./Events.js";
import { showLoader, hideLoader } from "./LoadingAnimation.js";
```

- Reads **groupedData** and **selectedFilters** from the global state.
- Uses `filterData`/`filterPriceOnly` only for **re-counting** options and honoring the **Filter Logic Mode**.
- Emits lightweight coordination events (e.g., `emitCardSearch`) to other views.

---

## Visible Filter Categories & Ordering

`VISIBLE_FILTER_CATEGORIES`:

- `Keywords`, `Supertypes`, `Types`, `Subtypes`
- `Set Types` (excludes: `alchemy`, `minigame`)
- `Set Names`
- `Originality`, `Rarity`, `Year`
- `Nº of Colors`, `Color Identity`

**Custom ordering**:
- `Nº of Colors`: `["Colorless","1 Color","2 Colors","3 Colors","4 Colors","5 Colors"]`
- `Color Identity`: canonical WUBRG lexicographic (e.g., `wu`, `ub`, `wubrg`, etc.)

**Display label formatting**:
- Color Identity values are uppercased (`wub` → `WUB`, `colorless` → `Colorless`).
- Nº of Colors is title-cased (`"1 color"` → `"1 Color"`).

---

## UI Elements

### A. Price Controls
- **Currency**: `EUR`, `USD`, `TIX` → updates `selectedPriceCurrency`.
- **Suffix**: depends on currency
  - EUR → `["", "_foil"]`
  - USD → `["", "_foil", "_etched"]`
  - TIX → `[""]`
- Persisted in state: `selectedPriceCurrency`, `selectedPriceSuffix`.

### B. Filter Logic Mode
- Dropdown: `AND-OR` (AND across categories, OR within category) or `AND-AND` (AND both across and within).
- Stored as `filterLogicMode` in state.

### C. Search Boxes
1. **Card picker** (datalist, capped to 50 suggestions, lazy-populated on input):
   - Press **Enter** or pick an option → `emitCardSearch(card)` and toggle that card in coordinated views.
2. **Free-text / Scryfall-style**:
   - Examples: `t:Goblin`, `kw:Flying`, `r:Rare`, `s:"Dominaria"`, `st:Commander`.
   - `t:` is **inferred** to one of `Supertypes/Types/Subtypes` by scanning dataset occurrences.
   - Unrecognized tokens fall back into `FreeTextSearch` (kept as a Set in state).
3. **Search set name**:
   - On Enter, scrolls the Timeline to the matching set and flashes the square.

### D. Filter Sections
- Dropdown per category with a **search-in-category** input.
- Options list with `(label) (count)`; clicking toggles **global filter** for the value.
- Zero-count options are dimmed and non-interactive.

### E. Pills
- One **pill container** per category (including `FreeTextSearch`).
- Each pill shows the normalized label and an **×** to remove the value from that category’s Set.

### F. Utility Buttons
- **Clear Filters**: empties all Sets in `selectedFilters`.
- **Clear Selections**: emits `emitClearSelection()` to reset coordinated cross-view selections.
- **Save Filters**: downloads a JSON preset via `saveFilterSettings()`.
- **Load Filters**: opens file picker and loads JSON via `loadFilterSettings()`.
- **Share Filters**: copies a URL (from `generateFilterShareURL()`) to clipboard.

### G. Branding
- Displays an IST logo at the bottom of the panel.

---

## Public API

### `createFilterPanel(data, filteredCards, containerId, selectedFiltersFromState, isUpdate = false)`

Initializes (or re-initializes) the panel:

- **DOM**: Clears `containerId`, builds the wrapper, controls, accordions, and pill containers.
- **State**: Uses `groupedData` from `getState()` to populate categories and counts.
- **Events**:
  - Price Currency / Suffix → `updateState({...})`
  - Filter option click → toggles the value in `selectedFilters` (Set per category) via `updateState`.
  - Card picker → `emitCardSearch(card)`.
  - Text query → parses to category Sets or `FreeTextSearch` and updates state.
  - Buttons: clear filters, clear selections, save/load/share presets.
- **Performance**: does **not** pre-render thousands of `<option>` nodes for the datalist—suggestions are generated as the user types.

**Parameters**:
- `data`: full dataset (only used for inference and price field detection; the shaping happens elsewhere).
- `filteredCards`: current filtered subset, used to seed the card-name autocomplete.
- `containerId`: element selector (e.g. `.FilterPanel`).
- `selectedFiltersFromState`: the current `selectedFilters` object (category → Set).
- `isUpdate`: if true, removes stale wrappers before re-creating.

---

### `updateFilterPanel(originalData, filteredCards, selectedFilters, containerId = ".FilterPanel")`

Refreshes counts, pills, and interactivity based on the **current** dataset and filters.

- **Recounts** per-category option availability using `filterData` and `filterPriceOnly`, honoring the **Filter Logic Mode**:
  - `AND-OR`: exclude the category under inspection when computing its counts.
  - `AND-AND`: compute once for all categories (within-category AND), then reuse.
- **Patches** the existing DOM in place via `optionMap` and `pillMap`:
  - Updates label counts `(value) (count)` and disables/dims options at zero count (unless already selected).
  - Rebuilds pill lists and close buttons.
  - Clears category inline search inputs so the option list is fully visible after updates.
- **Autocomplete**: refreshes the in-memory list of `currentCardNames` from `filteredCards` (UI suggestions still lazy).
- **Timing logs** (console) for perf diagnostics.

**Parameters**:
- `originalData`: full dataset (not reshaped here; used for inference or future needs).
- `filteredCards`: current filtered subset (drives counts/availability and card-name suggestions).
- `selectedFilters`: current selection map (category → Set). If omitted, will read from state.
- `containerId`: defaults to `.FilterPanel`.

---

## State & Events

### Reads from State
- `groupedData` (category → Map<value → cards[]>)
- `selectedFilters` (category → Set)
- `selectedPriceCurrency`, `selectedPriceSuffix`
- `filterLogicMode`

### Writes to State via `updateState`
- `selectedFilters` when options/pills change
- Price configuration and logic mode changes
- `updateContext` flags (`"TextSearch"`, `"TimelineFilter"`, etc.)

### Emits
- `emitCardSearch(card)` when a card is selected via the card picker
- `emitClearSelection()` for global selection resets

---

## Normalization, Exclusions & Helpers

- **Excluded set types** in UI: `alchemy`, `minigame`.
- **Normalization** for keys:
  - `Color Identity` & `Nº of Colors` use lower-case keys for internal matching.
- **Ordering helpers** ensure deterministic presentation for color identity and color-count categories.
- **Scryfall-like shorthands** supported via `scryfallMap`:
  - `t:` → `Types` (or inferred among `Supertypes/Types/Subtypes`)
  - `kw:` → `Keywords`
  - `r:` → `Rarity`
  - `s:` → `Set Names`
  - `st:` → `Set Types`

---

## UX Notes & Edge Cases

- Datalist suggestions are capped to **50** and only populated on input to keep the DOM light.
- Zero-count options are **dimmed** and **non-interactive** unless already selected.
- Category search boxes are local to each accordion and filter only the visible list.
- Year parsing uses `release_date` → `YYYY` (string) in `updateFilterPanel` counts; ensure input data contains valid dates.
- Price fields (`price_*`) are discovered dynamically to future-proof against pricing schema changes.
- The Free-text parser keeps unrecognized tokens under `FreeTextSearch` (so they can be toggled/removed like pills).

---

## Gotchas

- When switching currency, make sure the **suffix** remains valid for that currency. The module auto-corrects invalid suffixes back to `""`.
- If **Filter Logic Mode** is `AND-AND`, counts rely on an all-categories filter pass—avoid recomputing per-category in tight loops.
- The Timeline scroll-to-set feature only works if the set’s square is **rendered** and **visible** (i.e., part of the currently displayed set types).

---

## Minimal Usage

```js
// First mount after app boot:
createFilterPanel(data, filteredCards, ".FilterPanel", getState().selectedFilters);

// Any time filteredCards or selectedFilters change:
updateFilterPanel(data, filteredCards, getState().selectedFilters);
```

---

