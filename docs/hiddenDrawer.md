[← Back to main page](../)
# Hidden Drawer Module

This module implements the two side drawers that sit outside the main visualization grid:

- **Selected Cards Drawer** (`#hiddenDrawer`): shows cards that match / are driven by current selections.
- **Unpriced Cards Drawer** (`#illegalDrawer`): shows cards excluded from the visualizations because they lack price data.

Both drawers are controlled via small edge buttons that expand/collapse the corresponding panel and display contextual counts.

---

## Responsibilities

### 1. Selected Cards Drawer

**DOM & Structure**

- Creates a right-side drawer container:
  - `#hiddenDrawer.drawer`
    - `.drawer-header`
      - `#hiddenDrawerTitle.drawer-title`
    - `#pagination-nav` (injected above cards)
    - `#cardImages` (scrollable list of card entries)
- Creates the toggle button:
  - `#toggleDrawerButton` – small edge button with arrow and optional count.

**Contents per card**

Each card displayed in the drawers use the same data structure and attributes as the cards rendered in the [Scatterplot](docs/scatterplot.md) view (e.g., name, color identity, all the card prints, etc). 
Each visible card is rendered as:

- `.card-wrapper`
  - `<img>` – current print image for the card.
  - `.set-info-box` – shows the selected print's set name and set type.
  - `.nav-wrapper`
    - `◀` / `▶` buttons to cycle through `card.all_print_images`.

**Public API**

### `createHiddenDrawer(containerSelector = "body")`

Initializes the Selected Cards drawer:

- Appends the drawer markup and the toggle button to `containerSelector`.
- Wires up:
  - Title tooltip: explains this drawer shows cards matching current selections.
  - Toggle button:
    - Hover: shows same tooltip when closed.
    - Click: toggles `.visible` on `#hiddenDrawer` and updates the label.
  - `Clear All` button inside the drawer:
    - Calls `clearSelection()` ([Linking](linking.md)), which clears every cross-view selection and, with it, the drawer.

Call once on startup after the main layout exists.

### `updateDrawer(cards = [])`

Renders/updates the Selected Cards drawer content.

Inputs:

- `cards`: array of Scatterplot entries, normally `state.hoveredCards`: the cards in the current selection, published by the Scatterplot.

Behavior:

1. Stores the list in `cardsInDrawer` and updates the toggle button label.
2. Applies **pagination**:
   - Page size: `pageSize = 25`.
   - A **new** list starts on the first page. Re-rendering the same list (Prev/Next) keeps the page, clamped to the available pages.
3. For each visible card:
   - Ensures `card.selectedPrintIndex` is defined.
   - Uses `card.all_print_images` and `card.print_image_metadata` to:
     - Set `card.tooltip_image` / `card.image_normal`.
     - Render `.set-info-box` with `<set name> (<set type>)` or `Unknown Set`.
   - Hooks `◀` / `▶` buttons to:
     - Cycle `selectedPrintIndex` modulo available images.
     - Update the image and metadata box.
   - Hooks the image to:
     - `showCompactTooltip(card, event)` on hover.
     - `moveTooltip` (`idioms/ui.js`) on move.
4. Adds **“Filter by Set Appearance”** button:
   - Collects all `card.all_sets[].name` values.
   - Clones the global filters with `cloneSelectedFilters()` (`state.js`).
   - Adds those set names to the `"Set Names"` filter.
   - Calls `updateState({ selectedFilters })`, which re-filters every view.
5. Injects `#pagination-nav` above `#cardImages` with Prev/Next handlers that
   recursively call `updateDrawer(cardsInDrawer)`.

**Key interactions with global state & events**

- `cloneSelectedFilters()` / `updateState(...)` for filter changes.
- `clearSelection()` ([Linking](linking.md)) to clear cross-view selections.
- Tooltip uses the shared `#tooltip` element.

**Label logic**

Handled by `updateDrawerButtonLabel()`:

- When drawer is **visible**:
  - Button shows `→ (count)`.
- When drawer is **hidden**:
  - Button shows:
    - `← (count)` while hovered, or
    - `←` when not hovered.
- This keeps the control compact but informative.

---

### 2. Unpriced Cards Drawer (“Illegal” Drawer)

Displays cards not present in the main views because they do not have prices
for the selected currencies (EUR, USD, TIX).

**DOM & Structure**

- `#illegalDrawer.drawer`
  - `.illegal-header`
    - `.drawer-title` – labeled “Unpriced Cards” with explanatory tooltip.
    - `#illegalSearchInput` – search input with `list="illegalCardNamesList"`.
  - `#pagination-nav` (injected above cards)
  - `#illegalCardImages`
- `#illegalCardNamesList` – `<datalist>` of illegal card names.
- `#toggleIllegalDrawerButton` – edge button to show/hide the drawer.

**Public API**

### `createIllegalDrawer(cards, containerSelector = "body")`

Initializes the Unpriced Cards drawer and populates it.

Behavior:

- Builds the drawer structure and search input.
- Tooltip on the title and toggle button:
  - Explains that these cards are excluded for missing EUR/USD/TIX prices.
- Search input behavior:
  - On Enter:
    - Looks for the first card name containing the query.
    - Sets `illegalCurrentPage` to the matching page.
    - Calls `updateIllegalDrawer(...)`.
    - Scrolls to the matching card inside the drawer once rendered
      (waits for image load if needed).
    - If not found, briefly highlights the input border in red.
- Toggle button:
  - Hover: shows explanatory tooltip when closed.
  - Click: toggles `.visible` on `#illegalDrawer` and updates the label using
    `updateIllegalButtonLabel()`.
- Seeds the `#illegalCardNamesList` datalist from `cards`.
- Calls `updateIllegalDrawer(cards)` to render initial content.

### `updateIllegalDrawer(cards = [])`

Renders/updates pages of unpriced cards. 

Behavior:

1. Stores `cards` in `illegalCardsInDrawer`.
2. Computes `totalPages` based on `pageSize` and `illegalCurrentPage`.
3. Data join on `.card-wrapper` under `#illegalCardImages`:
   - Shows card image via `card.all_print_images[card.selectedPrintIndex]`.
   - Builds `.set-info-box` with `set_name` / `set_type` for the current print.
   - Adds `◀` / `▶` navigation to cycle prints and update both image & label.
   - Hooks image hover to `showCompactTooltip(card, event)`.
4. Injects a local `#pagination-nav` with Prev/Next controls
   (similar to the main drawer), updating `illegalCurrentPage` and recalling
   `updateIllegalDrawer(...)`.

**Label logic**

`updateIllegalButtonLabel()` mirrors the behavior of the main drawer button:

- Uses `.visible` state and `illegalBtnHover` to decide whether to show
  just the arrow or `arrow (count)`.

---

## Shared Helpers

### `showCompactTooltip(card, event?)`

- Renders a compact card summary inside the shared `#tooltip` element:
  - name, release date, complexity, EDH rank, supertype/type/subtype,
  - color identity, list of sets, and number of prints.
- The background comes from `colorIdentityBackground` (`idioms/ui.js`): a solid tint for one color, a gradient for several, grey for none.
- Positioned with `moveTooltip` (`idioms/ui.js`), which flips the tooltip to the other side of the cursor near window edges.

---

## Integration Notes

- This module assumes:
  - A global `#tooltip` element exists for shared tooltip rendering.
  - Styles for `.drawer`, `.visible`, and positioning of the toggle buttons
    are defined in CSS.
  - `card` objects include:
    - `name`
    - `color_identity`
    - `release_date`
    - `complexity`
    - `edhrec_rank` (optional)
    - `supertype`, `type`, `subtype`
    - `all_sets` (with `name` and `type`)
    - `all_print_images`
    - `print_image_metadata` (with `image`, `set_name`, `set_type`)
- Cross-view behavior is coordinated via:
  - `updateState(...)` / `cloneSelectedFilters()` (from `state.js`)
  - `clearSelection()` (from `Linking.js`)
- Both drawers are purely **view helpers**:
  - They do not compute which cards are selected or illegal.
  - They render whatever arrays are passed into `updateDrawer(...)` and
    `updateIllegalDrawer(...)` using the shared styling and tooltip rules.
