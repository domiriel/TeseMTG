[← Back to main page](../)

# Filter Panel Module

This module (`idioms/FilterPanel.js`) renders and manages the Filter Panel UI. Unlike the chart modules, it is about **UI controls and global filter state**, not data shaping: all counting happens in the filter engine ([Application core](stateManager.md#4-filtering-corefilteringjs)). It exposes two entry points:

- `createFilterPanel(result, containerId, selectedFiltersFromState, isUpdate = false)`
- `updateFilterPanel(result, selectedFilters, containerId = ".FilterPanel")`

where `result` is the output of `filterEngine.run(...)`: `{ cards, counts, mask }`.

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
- Coordinate with global state, and with the other views through [Linking](linking.md) (card search, clear selections).

---

## Dependencies

```js
import { updateState, getState, cloneSelectedFilters, saveFilterSettings,
         loadFilterSettings, generateFilterShareURL, emptyFilters } from "../state.js";
import { inferTypeCategory, VISIBLE_FILTER_CATEGORIES } from "../core/index.js";
import { toggleSelected, clearSelection } from "./Linking.js";
import { findScatterCard } from "./Scatterplot.js";
```

- Option values come from the filter engine's index (`getState().filterEngine`); counts come from `result.counts`.
- The panel never filters anything itself.

---

## Visible Filter Categories & Ordering

`VISIBLE_FILTER_CATEGORIES`:

- `Keywords`, `Supertypes`, `Types`, `Subtypes`
- `Set Types` (excludes: `alchemy`, `minigame`)
- `Set Names`
- `Originality`, `Rarity`, `Year`
- `Nº of Colors`, `Color Identity`

**Section order** in the panel: Originality, Keywords, Rarity, Supertypes, Types, Subtypes, Set Types, Set Names, Year, Nº of Colors, Color Identity.

**Custom value ordering**:
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
   - Press **Enter** or pick an option → toggles that card in the Scatterplot selection (`toggleSelected("scatter", "names", [name])`), so it is highlighted in every view.
2. **Free-text / Scryfall-style**:
   - Examples: `t:Goblin`, `kw:Flying`, `r:Rare`, `s:"Dominaria"`, `st:Commander`.
   - `t:` is **inferred** as `Supertypes`, `Types` or `Subtypes`, whichever has the most cards with that word (`inferTypeCategory`, an index lookup).
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
- **Clear Selections**: `clearSelection()`, which resets all cross-view selections ([Linking](linking.md)).
- **Save Filters**: downloads a JSON preset via `saveFilterSettings()`.
- **Load Filters**: opens file picker and loads JSON via `loadFilterSettings()`.
- **Share Filters**: copies a URL (from `generateFilterShareURL()`) to clipboard.

### G. Branding
- Displays an IST logo at the bottom of the panel.

---

## Public API

### `createFilterPanel(result, containerId, selectedFiltersFromState, isUpdate = false)`

Builds the panel once at start-up:

- **DOM**: clears `containerId`, then builds the controls, one collapsible section per category and the pill containers. Each option node is registered in `optionMap` and each pill container in `pillMap`.
- **Option values and initial counts** come from the filter engine (`engine.values(category)`) and from `result.counts`.
- **Events**:
  - Currency / suffix / logic mode → `updateState({...})`.
  - Option click or pill × → a new `selectedFilters` (via `cloneSelectedFilters()`) → `updateState`.
  - Card picker → `toggleSelected("scatter", "names", [name])`.
  - Text query → parsed into category values or `FreeTextSearch` terms → `updateState`.
  - Buttons: clear filters (`emptyFilters()`), clear selections (`clearSelection()`), save/load/share presets.
- **Performance**: the card-name datalist is filled lazily, at most 50 suggestions, as the user types.

The panel is **not** rebuilt on resize; its layout is purely CSS.

---

### `updateFilterPanel(result, selectedFilters, containerId = ".FilterPanel")`

Called after every filter change. It:

- **Patches option labels** from `result.counts`, touching only nodes whose count or selected state changed. Options with zero results are dimmed and disabled unless selected.
- **Rebuilds the pills** for each category.
- Clears any per-category search box that holds a query, so all options show again.
- Refreshes the in-memory list of card names for the autocomplete from `result.cards`.

Counting rules (AND-OR excludes the counted category; AND-AND uses the full filtered set) are implemented and tested in `core/filtering.js`.

---

## State & Linking

### Reads from state
- `filterEngine` (values of each category)
- `selectedFilters` (category → Set)
- `selectedPriceCurrency`, `selectedPriceSuffix`
- `filterLogicMode`

### Writes to state via `updateState`
- `selectedFilters` when options, pills, the text search, presets or "Clear Filters" change it
- Price configuration and logic mode

### Linking
- Card picker → `toggleSelected("scatter", "names", [name])`
- "Clear Selections" → `clearSelection()`

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
- Year values are `YYYY` strings taken directly from `release_date` (timezone-independent).
- The Free-text parser keeps unrecognized tokens under `FreeTextSearch` (so they can be toggled/removed like pills).

---

## Gotchas

- When switching currency, make sure the **suffix** remains valid for that currency. The module auto-corrects invalid suffixes back to `""`.
- The Timeline scroll-to-set feature only works if the set’s square is **rendered** and **visible** (i.e., part of the currently displayed set types).

---

## Minimal Usage

```js
const result = getState().filterEngine.run(selectedFilters, priceAttr, mode);

// First mount after app boot:
createFilterPanel(result, ".FilterPanel", selectedFilters);

// Every time the filter result changes:
updateFilterPanel(result, selectedFilters);
```
