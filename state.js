const state = {
    selectedFilters: {
      "Keywords": new Set(),
      "Rarity": new Set(),
      "Supertypes": new Set(),
      "Types": new Set(),
      "Subtypes": new Set(),
      "Set Types": new Set(),
      "Originality": new Set(),
      "Nº of Colors": new Set(),
      "Color Identity": new Set(),
      "Set Names": new Set(),
      "Year": new Set(),
      "FreeTextSearch": new Set()
    },
    selectedPriceCurrency: "eur",            // One of "eur", "usd", or "tix"
    selectedPriceSuffix: "",                 // "", "_foil", or "_etched"
    hoveredCards: [],
    originalData: null,
    filterEngine: null,   // core/filtering.js engine (index + memoized run())
    scatterPrep: null,    // core/scatter.js per-name aggregation
    groupedData: null,    // filterEngine.index: { category: Map<value, Int32Array> }
    filterLogicMode: "AND-OR",
  };
  
  const globalListeners = new Set();      // .subscribe()
  const keyListeners = new Map();         // .onChange()
  
  export function subscribe(callback) {
    globalListeners.add(callback);
  }
  
  export function updateState(newPartialState) {
    let changedKeys = Object.keys(newPartialState);
  
    for (const key of changedKeys) {
      const oldVal = state[key];
      const newVal = newPartialState[key];
  
      const changed = oldVal !== newVal;
      if (changed) {
        state[key] = newVal;
  
        if (keyListeners.has(key)) {
          keyListeners.get(key).forEach(cb => cb(newVal));
        }
      }
    }
  
    globalListeners.forEach(cb => cb(state));
  }
  
  export function getState() {
    return {
      ...state,
      onChange(key, callback) {
        if (!keyListeners.has(key)) {
          keyListeners.set(key, new Set());
        }
        keyListeners.get(key).add(callback);
      }
    };
  }
  export function saveFilterSettings() {
  const filters = getState().selectedFilters;
  const serialized = {};

  for (const key in filters) {
    serialized[key] = Array.from(filters[key]);
  }

  return JSON.stringify(serialized); // You can store this string anywhere
}
export function loadFilterSettings(serializedString) {
  try {
    const parsed = JSON.parse(serializedString);
    const newFilters = {};

    for (const key in parsed) {
      newFilters[key] = new Set(parsed[key]);
    }

    updateState({ selectedFilters: { ...emptyFilters(), ...newFilters } });
  } catch (e) {
    console.error("Failed to load filters:", e);
  }
}
export function generateFilterShareURL(baseURL = window.location.origin + window.location.pathname) {
  const filters = getState().selectedFilters;
  const params = new URLSearchParams();

  for (const key in filters) {
    if (filters[key].size > 0) {
      params.set(key, Array.from(filters[key]).join(","));
    }
  }

  return `${baseURL}?filters=${encodeURIComponent(params.toString())}`;
}

export function loadFiltersFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const encodedFilters = urlParams.get("filters");

  if (!encodedFilters) return null;

  try {
    const decoded = decodeURIComponent(encodedFilters);
    const parsedParams = new URLSearchParams(decoded);
    const newFilters = {};

    for (const [key, value] of parsedParams.entries()) {
      if (value) {
        newFilters[key] = new Set(value.split(","));
      }
    }

    return newFilters;
  } catch (e) {
    console.error("Failed to parse filters from URL:", e);
    return null;
  }
}

/** A selectedFilters object with every category present and empty. */
export function emptyFilters() {
  const out = {};
  for (const key in state.selectedFilters) out[key] = new Set();
  return out;
}

/**
 * Resolve the effective price attribute from state.
 * - tix → price_tix
 * - eur/usd (+ optional suffix) → price_{currency}{suffix}
 */
export function getEffectivePriceAttribute(s) {
  const { selectedPriceCurrency, selectedPriceSuffix } = s;
  return selectedPriceCurrency === "tix"
    ? "price_tix"
    : `price_${selectedPriceCurrency}${selectedPriceSuffix}`;
}

/** Copy of the current selectedFilters (fresh Sets, safe to modify). */
export function cloneSelectedFilters() {
  const out = {};
  for (const key in state.selectedFilters) out[key] = new Set(state.selectedFilters[key]);
  return out;
}

/** Add or remove one value of a global filter (right-click on chart elements). */
export function toggleGlobalFilter(category, value) {
  const next = cloneSelectedFilters();
  const set = next[category] || (next[category] = new Set());
  set.has(value) ? set.delete(value) : set.add(value);
  updateState({ selectedFilters: next });
}
