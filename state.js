const state = {
    selectedFilters: {
      "Keywords": new Set(),
      "Rarity": new Set(),
      "Supertypes": new Set(),
      "Types": new Set(["Artifact", "Battle", "Creature", "Conspiracy", "Dungeon","Enchantment", "Hero", "Instant", "Kindred", "Land", "Phenomenon", "Plane", "Planeswalker", "Scheme", "Sorcery", "Vanguard"]),
      "Subtypes": new Set(),
      "Set Types": new Set(["archenemy", "arsenal", "box", "commander", "core", "draft_innovation", "duel_deck", "expansion", "from_the_vault", "masterpiece", "masters", "planechase", "premium_deck", "spellbook", "starter", "treasure_chest", "vanguard"]),
      "Originality": new Set(),
      "IcicleColorGroups": new Set(),
      "IcicleColorIdentity": new Set(),
      "Set Names": new Set(),
      "Year": new Set(),
    },
    selectedPriceAttribute: "price_usd",
    hoveredCard: null,
    updateContext: null,
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
  