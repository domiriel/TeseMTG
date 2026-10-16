// FilterPanel.js
//
// Purpose
// -------
// Renders the left-side Filter Panel UI and keeps it in sync with global app state.
// It supports:
// • Quick card search (autocomplete) that selects a specific card in the scatterplot
// • Scryfall-like free-text search (t:, kw:, r:, s:, st:), including inference for `t:`
// • Collapsible filter sections with dynamic option counts
// • AND-OR / AND-AND logic modes (across/within categories)
// • Currency + price suffix selection (Regular/Foil/Etched depending on currency)
// • Save / Load / Share filter presets
// • Clear Filters (filter state only) and Clear Selections (cross-view persistent selections)
// • Small helper search for Timeline sets (scrolls to a set rect)
//
// Selection semantics (recap):
// - Within a category, multiple selected values are OR-ed (unless global mode is AND-AND).
// - Across categories, groups are AND-ed.
// - Dynamic counts recompute from currently active filter context, excluding the category itself
//   when in AND-OR mode, or using the fully filtered set when in AND-AND mode.
//

// -----------------------------------------------------------------------------------------

import {
  updateState,
  getState,
  cloneSelectedFilters,
  saveFilterSettings,
  loadFilterSettings,
  generateFilterShareURL,
  emptyFilters,
} from "../state.js";
import { inferTypeCategory, VISIBLE_FILTER_CATEGORIES } from "../core/index.js";

import { toggleSelected, clearSelection } from "./Linking.js";
import { findScatterCard } from "./Scatterplot.js";

// --- Constants & module-local registries ---------------------------------

// Order of the category sections in the panel.
const PANEL_SECTION_ORDER = [
  "Originality",
  "Keywords",
  "Rarity",
  "Supertypes",
  "Types",
  "Subtypes",
  "Set Types",
  "Set Names",
  "Year",
  "Nº of Colors",
  "Color Identity",
];

// We exclude certain set types from *display* (still present in data).
const EXCLUDED_SET_TYPES = new Set(["alchemy", "minigame"]);

// Track rendered option <div> nodes to quickly patch labels/counts without reflowing sections.
const optionMap = new Map();

// Track "pill" containers per category for rendering/removing active filter chips.
const pillMap = new Map();

// Normalize keys used in optionMap so we don’t double-store "Colorless"/"colorless".
function getNormalizedKey(category, value) {
  return category === "Color Identity" || category === "Nº of Colors"
    ? value.toLowerCase()
    : value;
}

// Used by the card-name datalist (lazy-filled during typing).
let currentCardNames = [];

// Fixed orders color-based categories.
const numColorsOrder = [
  "colorless",
  "1 color",
  "2 colors",
  "3 colors",
  "4 colors",
  "5 colors",
];

const colorIdentityOrder = [
  "colorless",
  "w",
  "u",
  "b",
  "r",
  "g",
  "wu",
  "wb",
  "wr",
  "wg",
  "ub",
  "ur",
  "ug",
  "br",
  "bg",
  "rg",
  "wub",
  "wur",
  "wug",
  "wbr",
  "wbg",
  "wrg",
  "ubr",
  "ubg",
  "urg",
  "brg",
  "wubr",
  "wubg",
  "wurg",
  "wbrg",
  "ubrg",
  "wubrg",
];

// --- Price suffix logic ---------------------------------------------------
// EUR:     regular / foil
// USD:     regular / foil / etched
// TIX:     regular only
function getSuffixOptionsForCurrency(currency) {
  if (currency === "eur") return ["", "_foil"];
  if (currency === "usd") return ["", "_foil", "_etched"];
  return [""]; // tix
}

// Display-friendly labels for a few categories.
function formatDisplayLabel(category, value) {
  if (category === "Color Identity") {
    if (value.toLowerCase() === "colorless") return "Colorless";
    return value.toUpperCase();
  }
  if (category === "Nº of Colors") {
    return value
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return value;
}

// Simple helpers
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Scryfall-like search aids -------------------------------------------
// Mapping: shorthand → candidate categories
//  - t:, type:     → Types (and Supertypes/Subtypes for `t:` with inference)
//  - kw:, keyword: → Keywords
//  - r:            → Rarity
//  - s:            → Set Names
//  - st:           → Set Types
const scryfallMap = {
  t: ["Types", "Supertypes", "Subtypes"],
  type: ["Types"],
  kw: ["Keywords"],
  keyword: ["Keywords"],
  r: ["Rarity"],
  s: ["Set Names"],
  st: ["Set Types"],
};

// --- Main: createFilterPanel ---------------------------------------------
// Builds the entire panel DOM once. Later changes go through updateFilterPanel,
// which patches counts/pills in place.
//   result: filterEngine.run(...) output ({ cards, counts })
export function createFilterPanel(
  result,
  containerId,
  selectedFiltersFromState,
  isUpdate = false
) {
  d3.select(containerId).selectAll("*").remove();

  const container = d3
    .select(containerId)
    .style("position", "relative")
    .style("width", "100%")
    .style("height", "100%");

  if (isUpdate) {
    container.select(".filter-panel-wrapper").remove();
  }

  // Wrapper (scrollable).
  const wrapper = container
    .append("div")
    .attr("class", "filter-panel-wrapper")
    .style("width", "100%")
    .style("max-height", "100%")
    .style("overflow-y", "auto")
    .style("padding", "10px")
    .style("box-sizing", "border-box");

  const selectedFilters = selectedFiltersFromState;

  // --- PRICE SUFFIX SELECTOR --------------------------------------------
  const suffixWrapper = wrapper.append("div").style("margin-bottom", "12px");

  suffixWrapper
    .append("label")
    .text("Select Price Suffix:")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("display", "block")
    .style("margin-bottom", "4px");

  const suffixSelect = suffixWrapper
    .append("select")
    .style("padding", "6px")
    .style("width", "70%")
    .style("font-size", "14px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px");

  // Populate suffix options for current currency; rerender when currency changes.
  function renderSuffixOptions(currency) {
    const suffixOptions = getSuffixOptionsForCurrency(currency);
    suffixSelect.selectAll("option").remove();

    suffixSelect
      .selectAll("option")
      .data(suffixOptions)
      .enter()
      .append("option")
      .attr("value", (d) => d)
      .text((d) => (d === "" ? "Regular" : d.replace("_", "").toUpperCase()));

    suffixSelect.property("value", getState().selectedPriceSuffix);
  }

  renderSuffixOptions(getState().selectedPriceCurrency);

  suffixSelect.on("change", function () {
    updateState({ selectedPriceSuffix: this.value });
  });

  // --- FILTER OPTIONS ------------------------------------------------------
  // Values come from the filter engine's index, counts from `result.counts`.
  // We only render categories listed in VISIBLE_FILTER_CATEGORIES.
  const engine = getState().filterEngine;

  // Prepare [category → [ [value, count], ... ]] to render option lists.
  const allFilters = Object.fromEntries(
    PANEL_SECTION_ORDER.filter((category) => engine.index[category])
      .map((category) => {
        const counts = result.counts.get(category);
        let entries = engine.values(category).map((value) => [value, counts?.get(value) ?? 0]);

        // Exclude specific Set Types from the UI (visual affordance).
        if (category === "Set Types") {
          entries = entries.filter(
            ([value]) => !EXCLUDED_SET_TYPES.has(value.toLowerCase())
          );
        }

        // Stable sort per category.
        entries = entries.sort((a, b) => {
          if (category === "Nº of Colors") {
            const aIdx = numColorsOrder.indexOf(a[0]);
            const bIdx = numColorsOrder.indexOf(b[0]);
            return aIdx - bIdx;
          }
          if (category === "Color Identity") {
            return (
              colorIdentityOrder.indexOf(a[0]) -
              colorIdentityOrder.indexOf(b[0])
            );
          }
          return a[0].localeCompare(b[0]);
        });

        return [category, entries];
      })
  );

  const filters = Object.fromEntries(
    Object.entries(allFilters).filter(([category]) =>
      VISIBLE_FILTER_CATEGORIES.includes(category)
    )
  );

  // --- CARD NAME AUTOCOMPLETE (LAZY) ------------------------------------
  // We do not hydrate the datalist with thousands of options at once.
  // Instead, we track currentCardNames and only render top 50 matches on input.
  const inputId = "searchInput_" + Math.random().toString(36).substring(2);

  const searchInput = wrapper
    .append("input")
    .attr("type", "text")
    .attr("list", inputId)
    .attr("placeholder", "Select a card...")
    .attr("title", "Type to select a card from the dataset")
    .style("width", "85%")
    .style("margin-bottom", "12px")
    .style("padding", "6px")
    .style("font-size", "16px");

  const dataList = wrapper.append("datalist").attr("id", inputId);

  // On type, rebuild at most 50 <option>s that match the substring.
  searchInput.on("input", function () {
    const query = this.value.toLowerCase();
    dataList.selectAll("option").remove();
    const matches = currentCardNames
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 50);

    dataList
      .selectAll("option")
      .data(matches, (d) => d)
      .join("option")
      .attr("value", (d) => d);
  });

  // --- Scryfall-like Free Text Search -----------------------------------
  wrapper
    .append("input")
    .attr("type", "text")
    .attr("placeholder", "Filter by card name or Scryfall Filters...")
    .attr(
      "title",
      "Filter by card name, or using Scryfall Filters (use e.g., t:Goblin or kw:Flying)"
    )
    .style("width", "85%")
    .style("margin-bottom", "12px")
    .style("padding", "6px")
    .style("font-size", "16px")
    .on("keydown", function (event) {
      if (event.key !== "Enter") return;

      const searchText = this.value.trim().toLowerCase();
      if (!searchText) return;

      // Split into tokens, preserving key:value chunks.
      const terms = searchText.match(/(?:\w+\s*:\s*[^ ]+)|(?:[^\s]+)/g) || [];

      const currentFilters = cloneSelectedFilters();
      if (!currentFilters["FreeTextSearch"])
        currentFilters["FreeTextSearch"] = new Set();

      terms.forEach((rawTerm) => {
        const term = rawTerm.replace(/\s+/g, ""); // normalize spaces: 't: goblin' → 't:goblin'
        const match = term.match(/^(\w+):(.+)$/);

        if (match) {
          const key = match[1].toLowerCase();
          const value = match[2].trim();
          const categories = scryfallMap[key];

          if (categories) {
            let matched = false;

            // t:VALUE → infer which of Supertypes/Types/Subtypes the value belongs to most.
            if (key === "t") {
              const inferredCat = inferTypeCategory(engine, value);
              if (VISIBLE_FILTER_CATEGORIES.includes(inferredCat)) {
                if (!currentFilters[inferredCat])
                  currentFilters[inferredCat] = new Set();
                currentFilters[inferredCat].add(capitalizeFirst(value));
                matched = true;
              }
            } else {
              // Direct mapping for kw/r/s/st/type
              categories.forEach((cat) => {
                if (VISIBLE_FILTER_CATEGORIES.includes(cat)) {
                  if (!currentFilters[cat]) currentFilters[cat] = new Set();
                  currentFilters[cat].add(capitalizeFirst(value));
                  matched = true;
                }
              });
            }

            // If we couldn't map it to a visible category, keep it as a raw token.
            if (!matched) {
              currentFilters["FreeTextSearch"].add(term);
            }
          } else {
            // Unknown "key:" → keep token verbatim.
            currentFilters["FreeTextSearch"].add(term);
          }
        } else {
          // Bare token → keep as FreeTextSearch.
          currentFilters["FreeTextSearch"].add(term);
        }
      });

      updateState({
        selectedFilters: currentFilters,
      });

      this.value = ""; // Clear the input for next query.
    });

  // --- Timeline Set Search (scrolls to match) ----------------------------
  wrapper
    .append("input")
    .attr("type", "text")
    .attr("placeholder", "Search set name...")
    .attr("title", "Type the name of a set to scroll to it in the Timeline")
    .style("width", "85%")
    .style("margin-bottom", "12px")
    .style("padding", "6px")
    .style("font-size", "16px")
    .on("keydown", function (event) {
      if (event.key !== "Enter") return;

      const query = this.value.trim().toLowerCase();
      if (!query) return;

      // Exact match first (simple heuristic).
      const matched = engine.values("Set Names").find(
        (name) => name.toLowerCase() === query
      );
      if (!matched) return;

      // Find corresponding rect in the Timeline and scroll it into view.
      const setRects = d3.selectAll(".set-rect");
      const target = setRects
        .filter((d) => d.name.toLowerCase() === matched.toLowerCase())
        .node();

      if (target) {
        const container = d3.select(".chart-container"); // must match your scroll container
        const bbox = target.getBoundingClientRect();
        const containerBox = container.node().getBoundingClientRect();

        const offsetTop =
          bbox.top - containerBox.top + container.node().scrollTop;
        container.node().scrollTo({
          top: offsetTop - 40,
          behavior: "smooth",
        });

        // Optional flash to indicate result.
        d3.select(target).classed("search-match", true);
        setTimeout(() => d3.select(target).classed("search-match", false), 1000);
      }

      this.value = "";
    });

  // Free-text pills container (chips representing parsed tokens).
  const freeTextPillContainer = wrapper
    .append("div")
    .attr("class", "pill-container free-text-pills")
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("gap", "4px")
    .style("margin-bottom", "12px");

  pillMap.set("FreeTextSearch", freeTextPillContainer);

  // --- Card name search behavior (select card in scatterplot) ------------
  function searchByName(inputEl) {
    const cardName = inputEl.value.trim();
    if (!cardName) return;

    const card = findScatterCard(cardName);
    if (!card) return;
    toggleSelected("scatter", "names", [card.name]);
    // NOTE: we keep the text; browser shows chosen option.
  }

  searchInput
    .on("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        searchByName(this);
      }
    })
    .on("change", function () {
      // Also fires when selecting from datalist with the mouse.
      searchByName(this);
    });

  // --- Global action buttons ---------------------------------------------
  const resetWrapper = wrapper
    .append("div")
    .style("margin-bottom", "12px")
    .style("text-align", "left");

  // Clear Filters → wipes only selectedFilters in state (keeps cross-view selections).
  resetWrapper
    .append("button")
    .text("Clear Filters")
    .style("padding", "6px 9px")
    .style("font-size", "14px")
    .style("background-color", "#6c757d")
    .style("text-align", "left")
    .style("color", "#fff")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("margin-top", "6px")
    .style("width", "95%")
    .style("cursor", "pointer")
    .on("click", () => {
      updateState({ selectedFilters: emptyFilters() });
    });

  // Clear Selections → emits global event to clear cross-view persistent selections.
  resetWrapper
    .append("button")
    .text("Clear Selections")
    .style("padding", "6px 9px")
    .style("font-size", "14px")
    .style("background-color", "#6c757d")
    .style("text-align", "left")
    .style("color", "#fff")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("margin-top", "6px")
    .style("width", "95%")
    .style("cursor", "pointer")
    .style("text-align", "left")
    .on("click", () => {
      clearSelection();
    });

  // --- Category sections --------------------------------------------------
  Object.entries(filters).forEach(([category, values]) => {
    const section = wrapper
      .append("div")
      .attr("class", "filter-section")
      .style("margin-top", "12px")
      .style("width", "95%");

    // Header (toggleable).
    const header = section
      .append("div")
      .attr("class", "dropdown-header")
      .style("background", "#B69677")
      .style("padding", "6px 9px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "6px")
      .style("cursor", "pointer")
      .style("font-weight", "bold")
      .style("width", "100%")
      .style("box-sizing", "border-box")
      .style("display", "flex")
      .style("align-items", "center")
      .style("justify-content", "space-between");

    header.append("span").text(category);

    // Static caret at the right.
    header
      .append("span")
      .attr("class", "dropdown-caret")
      .style("font-size", "20px")
      .style("margin-left", "auto")
      .text("▾");

    // Content list: hidden by default. We patch counts inside it in updateFilterPanel.
    const content = section
      .append("div")
      .attr("class", "dropdown-content")
      .style("display", "none")
      .style("max-height", "160px")
      .style("overflow-y", "auto")
      .style("margin-top", "4px")
      .style("border", "1px solid #ccc")
      .style("border-radius", "6px")
      .style("padding", "6px")
      .style("width", "100%")
      .style("max-width", "100%")
      .style("overflow-x", "hidden")
      .style("box-sizing", "border-box")
      .style("background", "#fff");

    // Per-section search box (filters visible options client-side).
    const searchBox = section
      .insert("input", function () {
        return content.node();
      })
      .attr("type", "text")
      .attr("placeholder", `Search ${category}...`)
      .classed("filter-search-input", true)
      .style("display", "none")
      .style("width", "100%")
      .style("padding", "4px")
      .style("margin-top", "4px")
      .style("font-size", "14px")
      .style("box-sizing", "border-box")
      .on("input", function () {
        const query = this.value.toLowerCase();
        content
          .selectAll(".filter-option")
          .style("display", (d) =>
            d.value.toLowerCase().includes(query) ? "flex" : "none"
          );
      });

    // Toggle open/closed.
    section.select(".dropdown-header").on("click", function () {
      const isVisible = content.style("display") === "block";
      content.style("display", isVisible ? "none" : "block");
      searchBox.style("display", isVisible ? "none" : "block");
    });

    // Pills area (active chips for this category).
    const pillContainer = section
      .append("div")
      .attr("class", "pill-container")
      .style("margin-top", "6px")
      .style("display", "flex")
      .style("flex-wrap", "wrap")
      .style("gap", "4px");
    pillMap.set(category, pillContainer);

    // Render initial list of options (counts will be patched live in updateFilterPanel).
    content
      .selectAll("div")
      .data(values.map(([value, count]) => ({ category, value, count })))
      .enter()
      .append("div")
      .attr("class", "filter-option")
      .style("display", "flex")
      .style("justify-content", "space-between")
      .style("align-items", "center")
      .style("padding", "4px 2px")
      .style("font-size", "12.5px")
      .style("width", "100%")
      .style("min-width", "0")
      .style("cursor", "pointer")
      .style("box-sizing", "border-box")
      .attr("data-category", category)
      .attr("data-value", (d) => d.value)
      .on("click", function (event, d) {
        // Toggle value in selectedFilters[category].
        const updated = cloneSelectedFilters();
        const set = updated[category] || new Set();
        if (set.has(d.value)) set.delete(d.value);
        else set.add(d.value);
        updated[category] = set;

        updateState({ selectedFilters: updated });
      })
      .each(function (d) {
        // Register node for quick count/label updates later.
        const key = `${category}|${getNormalizedKey(category, d.value)}`;
        optionMap.set(key, d3.select(this));
      })
      .append("span")
      .text((d) => `${formatDisplayLabel(d.category, d.value)} (${d.count})`)
      .attr("data-count", (d) => d.count)
      .style("margin-right", "10px");
  });

  // --- Settings (currency, logic mode, save/load/share) ------------------
  const settingsSection = wrapper
    .append("div")
    .attr("class", "filter-section")
    .style("margin-top", "20px")
    .style("width", "95%");

  const settingsHeader = settingsSection
    .append("div")
    .attr("class", "dropdown-header")
    .html('Settings <span style="margin-right:10px;">&#9881;</span>')
    .style("background", "#4681f4")
    .style("color", "#fff")
    .style("padding", "6px 9px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px")
    .style("cursor", "pointer")
    .style("font-weight", "bold")
    .style("width", "100%")
    .style("box-sizing", "border-box");

  const settingsContent = settingsSection
    .append("div")
    .attr("class", "dropdown-content")
    .style("display", "none")
    .style("margin-top", "4px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px")
    .style("padding", "6px")
    .style("background", "#fff");

  settingsHeader.on("click", function () {
    const isVisible = settingsContent.style("display") === "block";
    settingsContent.style("display", isVisible ? "none" : "block");
  });

  // Currency selector (updates suffix list & triggers price recalculation).
  const currencyWrapper = settingsContent
    .append("div")
    .style("margin-bottom", "12px");

  currencyWrapper
    .append("label")
    .text("Select Currency:")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("display", "block")
    .style("margin-bottom", "4px");

  const currencySelect = currencyWrapper
    .append("select")
    .style("padding", "6px")
    .style("width", "100%")
    .style("font-size", "14px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px");

  const currencyOptions = ["eur", "usd", "tix"];
  currencySelect
    .selectAll("option")
    .data(currencyOptions)
    .enter()
    .append("option")
    .attr("value", (d) => d)
    .text((d) => d.toUpperCase());

  currencySelect.property("value", getState().selectedPriceCurrency);

  currencySelect.on("change", function () {
    const selectedCurrency = this.value;
    const suffixOptions = getSuffixOptionsForCurrency(selectedCurrency);
    const currentSuffix = getState().selectedPriceSuffix;

    updateState({
      selectedPriceCurrency: selectedCurrency,
      selectedPriceSuffix: suffixOptions.includes(currentSuffix)
        ? currentSuffix
        : "",
    });

    renderSuffixOptions(selectedCurrency);
  });

  // Logic mode switch: AND-OR (default) vs AND-AND.
  settingsContent
    .append("label")
    .text("Filter Logic Mode:")
    .style("display", "block")
    .style("margin", "8px 0 4px 0")
    .style("font-weight", "bold");

  const logicModes = ["AND-OR", "AND-AND"];

  const logicSelect = settingsContent
    .append("select")
    .style("padding", "6px")
    .style("font-size", "14px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "6px")
    .style("width", "100%");

  logicSelect
    .selectAll("option")
    .data(logicModes)
    .enter()
    .append("option")
    .attr("value", (d) => d)
    .text((d) => d.replace("-", " across / ") + " within");

  logicSelect.property("value", getState().filterLogicMode || "AND-OR");
  logicSelect.on("change", function () {
    updateState({ filterLogicMode: this.value });
  });

  // Preset buttons (save/load/share)
  settingsContent
    .append("button")
    .text("Save Filters")
    .style("padding", "6px 9px")
    .style("font-size", "14px")
    .style("background-color", "#f0f0f0")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .style("margin-right", "8px")
    .on("click", () => {
      const json = saveFilterSettings();
      const blob = new Blob([json], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "filters.json";
      link.click();
    });

  settingsContent
    .append("button")
    .text("Load Filters")
    .style("padding", "6px 9px")
    .style("font-size", "14px")
    .style("background-color", "#f0f0f0")
    .style("color", "#000")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .style("margin-top", "8px")
    .on("click", () => document.getElementById("loadFilterInput").click());

  // Hidden file input for "Load Filters".
  wrapper
    .append("input")
    .attr("type", "file")
    .attr("id", "loadFilterInput")
    .style("display", "none")
    .on("change", function () {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          loadFilterSettings(e.target.result);
        } catch (err) {
          alert("Failed to load filters.");
        }
      };
      reader.readAsText(file);
    });

  settingsContent
    .append("button")
    .text("Share Filters")
    .style("padding", "6px 9px")
    .style("font-size", "14px")
    .style("background-color", "#f0f0f0")
    .style("color", "#000")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .style("margin-top", "8px")
    .on("click", () => {
      const shareURL = generateFilterShareURL();
      navigator.clipboard
        .writeText(shareURL)
        .then(() => {
          alert("Shareable URL copied to clipboard!");
        })
        .catch(() => {
          alert("Failed to copy URL. Here it is:\n" + shareURL);
        });
    });

  // Branding / logo.
  wrapper
    .append("div")
    .attr("class", "ist-logo-wrapper")
    .style("margin-top", "20px")
    .style("display", "flex")
    .style("justify-content", "center")
    .append("img")
    .attr("src", "images/IST logo.jpg")
    .style("max-width", "90%")
    .style("height", "auto");
}

// --- Live patching: updateFilterPanel ------------------------------------
// Called whenever the filtered result changes. It:
// • Patches option labels/opacity from `result.counts` (computed by the filter
//   engine in the same pass as the filtering) — only nodes whose count or
//   selection changed are touched
// • Rebuilds active pills per category
// • Refreshes the card-name datalist backing array (not DOM!)
// • Clears per-section search boxes (so users see all options again)
export function updateFilterPanel(result, selectedFilters, containerId = ".FilterPanel") {
  const t0 = performance.now();

  // Reset per-section search inputs that hold a query, so all options show again.
  d3.select(containerId)
    .selectAll(".filter-search-input")
    .filter(function () {
      return this.value !== "";
    })
    .property("value", "")
    .each(function () {
      this.dispatchEvent(new Event("input", { bubbles: true }));
    });

  selectedFilters = selectedFilters || {};

  // --- Patch option DOM (labels, opacity, interactivity) -----------------
  optionMap.forEach((el, key) => {
    const [category, value] = key.split("|");
    const categoryCounts = result.counts.get(category);
    if (!categoryCounts) return;

    const normValue = getNormalizedKey(category, value);
    const count = categoryCounts.get(normValue) || 0;
    const isSelected = (selectedFilters[category] || new Set()).has(value);

    const node = el.node();
    if (node.__count === count && node.__selected === isSelected) return;
    node.__count = count;
    node.__selected = isSelected;

    el.select("span")
      .text(`${formatDisplayLabel(category, normValue)} (${count})`)
      .attr("data-count", count);

    // Disable options that have zero results (unless already selected).
    el.style("opacity", count === 0 && !isSelected ? 0.4 : 1);
    el.style("pointer-events", count === 0 && !isSelected ? "none" : "auto");
    el.style("background-color", isSelected ? "#cce5ff" : "#fff");
  });

  // --- Pills (active chips) ----------------------------------------------
  Object.entries(selectedFilters).forEach(([category, selectedSet]) => {
    if (
      !VISIBLE_FILTER_CATEGORIES.includes(category) &&
      category !== "FreeTextSearch"
    )
      return;

    const pillContainer = pillMap.get(category);
    if (!pillContainer) return;

    const values = Array.from(selectedSet || new Set());
    const pills = pillContainer.selectAll(".pill").data(values, (d) => d);

    // Enter
    const pillsEnter = pills
      .enter()
      .append("div")
      .attr("class", "pill")
      .style("background", "#8A9CE4")
      .style("color", "white")
      .style("padding", "2px 8px")
      .style("border-radius", "12px")
      .style("font-size", "12px");

    pillsEnter
      .append("span")
      .attr("class", "pill-label")
      .text((d) => formatDisplayLabel(category, d));

    pillsEnter
      .append("span")
      .attr("class", "pill-close")
      .style("margin-left", "6px")
      .style("cursor", "pointer")
      .text("\u2715")
      .on("click", function (event, value) {
        // Remove this value from the category set.
        const updated = cloneSelectedFilters();
        if (!updated[category]) updated[category] = new Set();
        updated[category].delete(value);
        updateState({ selectedFilters: updated });
      });

    // Exit
    pills.exit().remove();
  });

  // --- Card-name autocomplete source update (no DOM flood) ----------------
  currentCardNames = Array.from(new Set(result.cards.map((c) => c.name))).sort();

  // Clear and keep the datalist empty here; we fill it on-demand in createFilterPanel.on("input")
  const inputId = d3.select(containerId).select("input[list]").attr("list");
  if (inputId) {
    const dataList = d3.select(`#${inputId}`);
    dataList.selectAll("option").remove();
  }

  // Perf logs (optional)
  const tEnd = performance.now();
  console.log(`[updateFilterPanel] TOTAL time ${(tEnd - t0).toFixed(2)} ms`);
}
