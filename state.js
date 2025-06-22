const state = {
    selectedFilters: {
      "Keywords": new Set(),
      "Rarity": new Set(),
      "Supertypes": new Set(),
      "Types": new Set(["Artifact", "Battle", "Creature", "Dungeon","Enchantment", "Instant", "Kindred", "Land", "Plane", "Planeswalker",  "Sorcery"]),
      "Subtypes": new Set(),
      "Set Types": new Set(["archenemy", "arsenal", "box", "commander", "core", "draft_innovation", "duel_deck", "expansion", "from_the_vault", "masterpiece", "masters", "premium_deck", "spellbook", "starter"]),
      "Originality": new Set(),
      "IcicleColorGroups": new Set(),
      "IcicleColorIdentity": new Set(),
      "Set Names": new Set(),
      "Year": new Set(),
      "Foil Status": new Set(),
      "FreeTextSearch": new Set()
    },
    selectedPriceAttribute: "price_eur",
    hoveredCards: [],
    updateContext: null,
    originalData: null,
    groupedData: null,
    freeTextSearch: "",

    originalFilteredData: null,
    originalSelectedFilters: null,
    previousFilteredData: null,
    lastFilterInputs: null,
    lastFilteredData: null

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

    updateState({
      selectedFilters: newFilters,
      updateContext: "LoadedFilterSettings"
    });
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

export function resetState() {
  
  updateState({
    selectedFilters: getState().originalSelectedFilters , 
    selectedPriceAttribute: "price_eur",
    hoveredCards: [],
    updateContext: null,
    lastFilterInputs: null,
    lastFilteredData: null
  });
}
